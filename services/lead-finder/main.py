"""
Marketing Lead Finder Service
Searches for event organizer contacts using SearXNG + AI verification
Runs as Docker container, communicates with Cloudflare Worker for Telegram notifications
"""

import asyncio
import json
import logging
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx

# Configuration (from docker/.env or internal Docker defaults)
SEARXNG_URL = os.getenv("SEARXNG_URL", "http://searxng:8080")
AI_ENDPOINT = os.getenv("AI_ENDPOINT", os.getenv("OLLAMA_URL", "http://ollama:11434"))
AI_MODEL = os.getenv("AI_MODEL", "qwen2.5:3b-instruct-q4_K_M")
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://kong:8000")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SERVICE_ROLE_KEY", ""))
WORKER_TELEGRAM_ENDPOINT = os.getenv("WORKER_TELEGRAM_ENDPOINT", "https://settings.familiada.online/_admin_api/config/telegram/notify-service")
SERVICE_TOKEN = os.getenv("LEAD_FINDER_SERVICE_KEY", "")

# Headers for internal services (usually no auth needed inside Docker)
SEARXNG_HEADERS = {}
AI_HEADERS = {"Content-Type": "application/json"}

BLOCKED_DOMAINS = {
    'olx.pl', 'oferteo.pl', 'fixly.pl', 'useme.pl', 'pracuj.pl', 'jooble.pl',
    'infopraca.pl', 'praca.pl', 'linkedin.com', 'facebook.com', 'instagram.com',
    'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'wa.link', 't.me',
    'fb.me', 'm.me', 'discord.gg', 'reddit.com', 'pinterest.com', 'medium.com',
    'substack.com', 'wordpress.com', 'wix.com', 'squarespace.com', 'shopify.com',
    'etsy.com', 'ebay.com', 'amazon.com', 'allegro.pl', 'empik.com', 'ceneo.pl',
    'skapiec.pl', 'nexo.pl', 'mediaexpert.pl', 'x-kom.pl', 'morele.net',
    'komputronik.pl', 'proline.pl', 'agd.pl', 'euro.com.pl', 'rtv-euroagd.pl',
    'media-markt.pl', 'saturn.pl', 'expert.pl', 'neonet.pl', 'avs.pl',
    'tele-poli.pl', 'gsm-online.pl', 'komorkomania.pl', 'benchmark.pl',
    'pcformat.pl', 'cdaction.pl', 'gry-online.pl', 'gamepressure.com',
    'igromania.pl', 'gry.pl', 'gram.pl', 'swiatgier.pl', 'stopklatka.pl',
    'filmweb.pl', 'imdb.com', 'rottentomatoes.com', 'metacritic.com',
    'letterboxd.com', 'trakt.tv', 'simkl.com', 'justwatch.com',
    'kino-polska.pl', 'filmoteka.pl', 'ninateka.pl', 'culture.pl',
    'instytutksiazki.pl', 'biblioteka.pl', 'bookcrossing.com', 'goodreads.com',
    'lubimyczytac.pl', 'granice.pl', 'swiatczytnika.pl', 'ebooki.pl',
    'legimi.com', 'virtualo.pl', 'publio.pl', 'wolnelektury.pl', 'polona.pl',
}

SEARCH_QUERIES = [
    '"DJ" "wesele" {city} kontakt',
    '"Wodzirej" {city} kontakt',
    '"Konferansjer" {city} kontakt',
    '"Prezenter eventowy" {city} kontakt',
    '"Animator dzieci" {city} kontakt',
    '"Agencja eventowa" {city} kontakt',
    '"Organizacja imprez" {city} kontakt',
    '"Team building" {city} kontakt',
    '"Gry integracyjne" {city} kontakt'
]

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("lead-finder")

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Marketing Lead Finder")

# CORS - allow settings and main site
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://settings.familiada.online", "https://familiada.online", "https://www.familiada.online"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
active_task = None
task_stop_event = asyncio.Event()
task_pause_event = asyncio.Event()
task_status = "idle" # idle, running, paused
task_run_id = None

# Persistence in memory (as requested in Prompt.txt / migration 125)
session_used_queries = set()
session_existing_emails = set()
session_processed_urls = set()

class SupabaseClient:
    """Simple Supabase client using HTTP API"""
    
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip('/')
        self.service_key = service_key
        self.headers = {
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    
    async def insert(self, table: str, data: dict) -> Optional[dict]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                json=data
            )
            if response.status_code in (200, 201):
                result = response.json()
                return result[0] if result else data
            return None

    async def select(self, table: str, columns: str = '*', filters: dict = None, limit: int = None, order: str = None) -> Optional[list]:
        async with httpx.AsyncClient() as client:
            params = {'select': columns}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            if limit: params['limit'] = limit
            if order: params['order'] = order
            
            response = await client.get(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                params=params
            )
            if response.status_code == 200:
                return response.json()
            return None

    async def update(self, table: str, data: dict, filters: dict) -> bool:
        async with httpx.AsyncClient() as client:
            filter_params = {}
            for key, value in filters.items():
                filter_params[key] = f'eq.{value}'
            
            response = await client.patch(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                json=data,
                params=filter_params
            )
            return response.status_code == 200

    async def delete(self, table: str, filters: dict = None) -> bool:
        async with httpx.AsyncClient() as client:
            filter_params = {}
            if filters:
                for key, value in filters.items():
                    filter_params[key] = f'eq.{value}'
            response = await client.delete(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                params=filter_params
            )
            return response.status_code in [200, 204]

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def log_to_db(run_id: str, level: str, message: str):
    """Log a message to the database"""
    await supabase.insert('marketing_search_logs', {
        'run_id': run_id,
        'level': level,
        'message': message,
        'details': {}
    })
    logger.info(f"[{run_id[:8] if run_id else '---'}] {level}: {message}")

async def send_telegram_notification(message: str):
    """Send notification to Telegram via Cloudflare Worker"""
    if not SERVICE_TOKEN: return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(WORKER_TELEGRAM_ENDPOINT, headers={'Authorization': f'Bearer {SERVICE_TOKEN}'}, json={'text': message})
    except Exception as e:
        logger.error(f"Telegram error: {e}")

async def search_searxng(query: str) -> list:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f'{SEARXNG_URL}/search', 
                params={'q': query, 'format': 'json'},
                headers=SEARXNG_HEADERS
            )
            return response.json().get('results', []) if response.status_code == 200 else []
    except Exception as e:
        logger.error(f"SearXNG error: {e}")
        return []

async def extract_emails_from_url(url: str, run_id: str) -> list:
    """Extract emails from URL and common subpages (/kontakt, /contact)"""
    emails = set()
    urls_to_check = [url]
    
    # Add subpages to check
    try:
        parsed = urlparse(url)
        for path in ['/kontakt', '/contact', '/kontakt.html', '/contact.html']:
            subpage_url = f"{parsed.scheme}://{parsed.netloc}{path}"
            if subpage_url not in urls_to_check:
                urls_to_check.append(subpage_url)
    except: pass

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        for target_url in urls_to_check:
            try:
                await log_to_db(run_id, "info", f"Pobieram: {target_url}")
                r = await client.get(target_url)
                if r.status_code == 200:
                    found = EMAIL_REGEX.findall(r.text)
                    if found:
                        await log_to_db(run_id, "info", f"Znaleziono {len(found)} maili na {target_url}")
                    emails.update(found)
            except:
                continue
    return list(emails)

async def verify_with_ai(title: str, url: str, emails: list, run_id: str) -> dict:
    prompt = f"""Czy to rzeczywisty organizator eventów (freelancer lub firma)? 
Przykłady: DJ, Wodzirej, Konferansjer, Animator, Agencja eventowa.
To NIE może być tylko restauracja (miejsce) ani wypożyczalnia sprzętu. Muszą sami organizować wydarzenia.

Dane:
Tytuł: {title}
URL: {url}
Maile znalezione na stronie: {', '.join(emails)}

Odpowiedz WYŁĄCZNIE w formacie JSON:
{{
  "is_event_organizer": bool, 
  "contact_type": "string (np. DJ, Agencja, itp.)", 
  "best_email": "string (najbardziej pasujący mail)", 
  "title": "string (oficjalna nazwa)",
  "short_description": "string (krótki opis działalności)",
  "reasoning": "string (dlaczego tak/nie)"
}}"""
    
    await log_to_db(run_id, "info", f"Weryfikacja AI dla: {title}")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f'{AI_ENDPOINT}/api/chat', 
                headers=AI_HEADERS,
                json={
                    'model': AI_MODEL,
                    'messages': [{'role': 'system', 'content': 'Odpowiadaj TYLKO czystym JSON.'}, {'role': 'user', 'content': prompt}],
                    'stream': False
                }
            )
            if r.status_code == 200:
                content = r.json().get('message', {}).get('content', '')
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if match: return json.loads(match.group())
        return {'is_event_organizer': False}
    except Exception as e:
        logger.error(f"AI error: {e}")
        return {'is_event_organizer': False}

async def process_search_run(run_id: str, target_count: int):
    global task_status, session_used_queries, session_existing_emails, session_processed_urls
    try:
        await log_to_db(run_id, "info", f"Rozpoczynam zlecenie na {target_count} kontaktów")
        
        # Initial sync of existing emails from DB if session is empty
        if not session_existing_emails:
            vc = await supabase.select('marketing_verified_contacts', columns='email') or []
            session_existing_emails = set(v['email'].lower() for v in vc if v.get('email'))

        # Clear old logs for this run
        await supabase.delete('marketing_search_logs')

        cities = await supabase.select('marketing_cities', columns='name', filters={'is_active': True}) or []
        city_names = [c['name'] for c in cities]
        
        if not city_names:
            await log_to_db(run_id, "error", "Brak aktywnych miast w bazie danych!")
            return

        verified_count = 0
        
        while verified_count < target_count:
            # Check stop
            if task_stop_event.is_set():
                task_status = "cancelled"
                await log_to_db(run_id, "warning", "Anulowano przez użytkownika")
                return

            # Check pause
            if task_pause_event.is_set():
                task_status = "paused"
                await log_to_db(run_id, "info", "Pauza - czekam na wznowienie")
                while task_pause_event.is_set() and not task_stop_event.is_set():
                    await asyncio.sleep(1)
                if task_stop_event.is_set(): return
                task_status = "running"
                await log_to_db(run_id, "info", "Wznowiono pracę")

            query_made = False
            for qt in SEARCH_QUERIES:
                for city in city_names:
                    full_q = qt.format(city=city)
                    
                    # Skip if already searched in this container session
                    if full_q in session_used_queries: continue
                    
                    query_made = True
                    session_used_queries.add(full_q)

                    await log_to_db(run_id, "info", f"Wyszukiwanie SearXNG: {full_q}")
                    results = await search_searxng(full_q)
                    
                    if not results:
                        await log_to_db(run_id, "warning", f"Brak wyników dla: {full_q}")
                        continue

                    await log_to_db(run_id, "success", f"Znaleziono {len(results)} potencjalnych stron")
                    
                    for res in results:
                        if task_stop_event.is_set(): return
                        
                        u = res.get('url', '')
                        if not u or u in session_processed_urls: continue
                        
                        session_processed_urls.add(u)
                        domain = urlparse(u).netloc.lower()
                        if domain in BLOCKED_DOMAINS:
                            continue

                        # Extract emails from main page + subpages
                        emails = await extract_emails_from_url(u, run_id)
                        
                        if emails:
                            # Filter out existing emails
                            new_emails = [e for e in emails if e.lower() not in session_existing_emails]
                            if new_emails:
                                await log_to_db(run_id, "info", f"Nowe maile ({len(new_emails)}): {', '.join(new_emails[:2])}")
                                
                                ai_res = await verify_with_ai(res.get('title', 'Brak tytułu'), u, new_emails, run_id)
                                
                                if ai_res.get('is_event_organizer') and ai_res.get('best_email'):
                                    session_existing_emails.add(ai_res['best_email'].lower())
                                    
                                    await supabase.insert('marketing_verified_contacts', {
                                        'run_id': run_id,
                                        'title': ai_res.get('title') or res.get('title', 'Brak tytułu'),
                                        'short_description': (ai_res.get('short_description') or ai_res.get('reasoning', ''))[:200],
                                        'email': ai_res['best_email'],
                                        'url': u,
                                        'is_event_organizer': True,
                                        'ai_confidence': 'high',
                                        'contact_type': ai_res.get('contact_type', 'Inne')
                                    })
                                    verified_count += 1
                                    await log_to_db(run_id, "success", f"✅ Zweryfikowano ({verified_count}/{target_count}): {ai_res['best_email']}")
                                    
                                    if verified_count >= target_count: break
                                else:
                                    reason = ai_res.get('reasoning', 'Nie spełnia kryteriów')
                                    await log_to_db(run_id, "info", f"Odrzucono przez AI: {domain} ({reason[:50]}...)")
                            else:
                                await log_to_db(run_id, "info", f"Pominięto - adresy już są w bazie: {domain}")
                    
                    if verified_count >= target_count: break
                if verified_count >= target_count or query_made: break
            
            if not query_made:
                await log_to_db(run_id, "warning", "Wyczerpano pulę zapytań dla tej sesji. Zresetuj kontener aby szukać od nowa.")
                break
            
            await asyncio.sleep(1)

        task_status = "completed"
        await log_to_db(run_id, "success", f"Zakończono sukcesem! Znaleziono {verified_count} kontaktów")
        await send_telegram_notification(f"✅ Lead Finder zakończony!\nZlecenie: {run_id[:8]}\nZnaleziono: {verified_count} kontaktów")
    except Exception as e:
        task_status = "error"
        logger.exception("Błąd krytyczny process_search_run")
        await log_to_db(run_id, "error", f"Błąd krytyczny: {str(e)}")

@app.post("/api/search-runs")
async def create_run(target_count: int = 50):
    global active_task, task_stop_event, task_pause_event, task_status, task_run_id
    
    if task_status in ["running", "paused"]:
        raise HTTPException(400, "Zlecenie już działa")
        
    task_run_id = f"run-{int(time.time())}"
    task_stop_event.clear()
    task_pause_event.clear()
    task_status = "running"
    active_task = asyncio.create_task(process_search_run(task_run_id, target_count))
    return JSONResponse({'ok': True, 'run_id': task_run_id})

@app.get("/api/search-runs")
async def list_runs(limit: int = 10):
    """Returns the current or last run as a list to satisfy frontend expectations"""
    if task_run_id:
        return JSONResponse([{'id': task_run_id, 'status': task_status}])
    return JSONResponse([])

@app.post("/api/search-runs/{run_id}/pause")
async def pause_run(run_id: str):
    global task_status
    if task_status == "running" and task_run_id == run_id:
        task_pause_event.set()
        task_status = "paused"
        return JSONResponse({'ok': True})
    return JSONResponse({'ok': False, 'error': 'not_running_or_id_mismatch'})

@app.post("/api/search-runs/{run_id}/resume")
async def resume_run(run_id: str):
    global task_status
    if task_status == "paused" and task_run_id == run_id:
        task_pause_event.clear()
        task_status = "running"
        return JSONResponse({'ok': True})
    return JSONResponse({'ok': False, 'error': 'not_paused_or_id_mismatch'})

@app.post("/api/search-runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    global task_status, active_task
    if task_run_id != run_id:
        return JSONResponse({'ok': False, 'error': 'id_mismatch'})
    task_stop_event.set()
    task_pause_event.clear()
    if active_task and not active_task.done():
        active_task.cancel()
    task_status = "idle"
    return JSONResponse({'ok': True})

@app.get("/api/search-runs/status")
async def get_status():
    return JSONResponse({'status': task_status, 'run_id': task_run_id})

@app.get("/api/search-runs/{run_id}/logs")
async def get_logs(run_id: str, limit: int = 100):
    # Filter by run_id if provided
    filters = {'run_id': run_id}
    q = supabase.select('marketing_search_logs', filters=filters, order='created_at.desc', limit=limit)
    logs = await q
    return JSONResponse(logs or [])

@app.post("/api/contacts/{contact_id}/mark-used")
async def mark_used(contact_id: str, used: bool = True):
    """Mark a contact as used or unused in the database"""
    ok = await supabase.update('marketing_verified_contacts', {'is_used': used}, {'id': contact_id})
    return JSONResponse({'ok': ok})

@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    """Delete a contact from the database"""
    ok = await supabase.delete('marketing_verified_contacts', {'id': contact_id})
    return JSONResponse({'ok': ok})

@app.get("/health")
async def health(): return JSONResponse({'status': 'ok'})

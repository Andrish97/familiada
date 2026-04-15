"""
Marketing Lead Finder Service - Multi-layer Buffered Version
Architecture: Query Pool -> Raw Buffer -> AI Verification
"""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Optional, List, Set
from urllib.parse import urlparse

import httpx

# --- Configuration (Internal Docker) ---
SEARXNG_URL = "http://searxng:8080"
AI_ENDPOINT = "http://ollama:11434"
AI_MODEL = "qwen2.5:3b-instruct-q4_K_M"
SUPABASE_URL = "http://kong:8000"
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SERVICE_ROLE_KEY", ""))
WORKER_TELEGRAM_ENDPOINT = "https://settings.familiada.online/_admin_api/config/telegram/notify-service"
SERVICE_TOKEN = os.getenv("LEAD_FINDER_SERVICE_KEY", "")

# --- Constants ---
SEARCH_TEMPLATES = [
    'DJ wesele {city} kontakt',
    'Wodzirej {city} kontakt',
    'Konferansjer {city} kontakt',
    'Agencja eventowa {city} kontakt',
    'Organizacja imprez {city} kontakt',
    'Animator dla dzieci {city} kontakt',
    'Zespół muzyczny wesele {city} kontakt',
    'Fotograf ślubny {city} kontakt'
]

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
    'weselezklasa.pl', 'gumtree.pl', 'sprzedajemy.pl'
}

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
RAW_BUFFER_THRESHOLD = 20  # Refill raw contacts if below this

# --- Global State ---
active_task = None
task_stop_event = asyncio.Event()
task_pause_event = asyncio.Event()
task_status = "idle" # idle, running, paused, cancelled, completed
task_run_id = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("lead-finder")

# --- Clients ---
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    
    async def insert(self, table, data):
        async with httpx.AsyncClient() as client:
            r = await client.post(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data)
            return r.status_code in (200, 201)

    async def select(self, table, columns='*', filters=None, order=None, limit=None):
        async with httpx.AsyncClient() as client:
            params = {'select': columns}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            if order: params['order'] = order
            if limit: params['limit'] = limit
            try:
                r = await client.get(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params, timeout=10)
                return r.json() if r.status_code == 200 else None
            except Exception as e:
                logger.error(f"Supabase select error: {e}")
                return None

    async def update(self, table, data, filters):
        async with httpx.AsyncClient() as client:
            params = {}
            for k, v in filters.items(): params[k] = f'eq.{v}'
            r = await client.patch(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data, params=params)
            return r.status_code in (200, 204)

    async def delete(self, table, filters=None):
        async with httpx.AsyncClient() as client:
            params = {}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            r = await client.delete(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params)
            return r.status_code in (200, 204, 404)

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helpers ---
async def log_to_db(run_id, level, message):
    await supabase.insert('marketing_search_logs', {'run_id': run_id, 'level': level, 'message': message})
    logger.info(f"[{level.upper()}] {message}")

async def send_telegram(message: str):
    if not SERVICE_TOKEN:
        logger.warning("Telegram: SERVICE_TOKEN not set")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(WORKER_TELEGRAM_ENDPOINT, headers={'Authorization': f'Bearer {SERVICE_TOKEN}'}, json={'text': message})
            if r.status_code != 200:
                logger.error(f"Telegram error: {r.status_code} {r.text}")
            else:
                logger.info("Telegram notification sent")
    except Exception as e:
        logger.error(f"Telegram exception: {e}")

# --- Core Logic: Search Layer (Producer) ---
async def fetch_next_query(run_id: str) -> Optional[str]:
    """Finds next available query template + city combo not in history"""
    cities_data = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
    if not cities_data: return None
    
    cities = [c['name'] for c in cities_data]
    history_data = await supabase.select('marketing_search_queries_log', 'query_text')
    history = {h['query_text'] for h in history_data} if history_data else set()

    # Generate all possible queries
    pool = []
    for city in cities:
        for template in SEARCH_TEMPLATES:
            pool.append(template.format(city=city))

    # Check if pool is exhausted
    available = [q for q in pool if q not in history]
    
    if not available:
        await log_to_db(run_id, "warning", "Pula zapytań wyczerpana. Resetuję historię...")
        await supabase.delete('marketing_search_queries_log') # Clear history
        return pool[0] # Start from first
    
    return available[0]

async def refill_raw_buffer(run_id: str):
    """Producer: Searches SearXNG and fills marketing_raw_contacts"""
    current_raw = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'})
    count = len(current_raw) if current_raw else 0
    
    if count >= RAW_BUFFER_THRESHOLD:
        return # Buffer still full enough

    await log_to_db(run_id, "info", f"Bufor surowych kontaktów niski ({count}). Uruchamiam nowe wyszukiwanie...")
    
    query = await fetch_next_query(run_id)
    if not query: return

    await log_to_db(run_id, "info", f"Wyszukiwanie: {query}")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json'})
            if r.status_code != 200:
                await log_to_db(run_id, "error", f"SearXNG Error {r.status_code}")
                return
            results = r.json().get('results', [])
    except Exception as e:
        await log_to_db(run_id, "error", f"SearXNG Connection Fail: {e}")
        return

    # Add query to history
    await supabase.insert('marketing_search_queries_log', {'query_text': query})

    if not results:
        await log_to_db(run_id, "warning", f"Brak wyników dla: {query}")
        return

    # Process results into buffer
    new_raw_count = 0
    for res in results:
        url = res.get('url', '').lower()
        if not url or any(d in url for d in BLOCKED_DOMAINS): continue
        
        # Deduplicate vs Verified and Raw
        exists_v = await supabase.select('marketing_verified_contacts', 'id', {'url': url})
        exists_r = await supabase.select('marketing_raw_contacts', 'id', {'url': url})
        if exists_v or exists_r: continue

        # Crawl for emails
        emails = set()
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                for path in [url, url.rstrip('/') + '/kontakt', url.rstrip('/') + '/contact']:
                    try:
                        r_crawl = await client.get(path)
                        if r_crawl.status_code == 200:
                            emails.update(EMAIL_REGEX.findall(r_crawl.text))
                    except: continue
        except: pass

        if emails:
            # Final deduplication by emails
            email_list = list(emails)
            
            ok = await supabase.insert('marketing_raw_contacts', {
                'url': url,
                'title': res.get('title'),
                'emails_found': email_list,
                'status': 'pending'
            })
            if ok: new_raw_count += 1

    await log_to_db(run_id, "success", f"Dodano {new_raw_count} surowych kontaktów do bufora.")

# --- Core Logic: AI Layer (Consumer) ---
async def verify_raw_lead(run_id: str, lead: dict) -> bool:
    """Consumer: Takes one raw lead and asks AI to verify"""
    emails = lead.get('emails_found', [])
    prompt = f"""Czy to organizator eventów (DJ, Agencja, Wodzirej, Animator)?
Tytuł: {lead.get('title')}
URL: {lead.get('url')}
Maile: {', '.join(emails)}

Odpowiedz WYŁĄCZNIE JSONem:
{{
  "is_event_organizer": bool,
  "best_email": "string",
  "reasoning": "krótkie uzasadnienie"
}}"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f'{AI_ENDPOINT}/api/chat', json={
                'model': AI_MODEL,
                'messages': [{'role': 'system', 'content': 'Jesteś asystentem marketingu. Odpowiadaj TYLKO JSONEM.'}, 
                             {'role': 'user', 'content': prompt}],
                'stream': False
            })
            if r.status_code == 200:
                content = r.json().get('message', {}).get('content', '')
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if match:
                    res = json.loads(match.group().replace("'", '"'))
                    if res.get('is_event_organizer') and res.get('best_email'):
                        await supabase.insert('marketing_verified_contacts', {
                            'title': lead.get('title'),
                            'email': res['best_email'],
                            'url': lead.get('url'),
                            'short_description': res.get('reasoning', '')[:200]
                        })
                        return True
        return False
    except Exception as e:
        logger.error(f"AI verify error: {e}")
        return False

# --- Main Task Loop ---
NUM_CONSUMERS = 3

async def producer_task(run_id: str):
    """Producer: Continuously searches for new raw contacts (always completes, ignores pause)"""
    while task_status == "running":
        try:
            await refill_raw_buffer(run_id)
        except Exception as e:
            logger.error(f"Producer error: {e}")
        await asyncio.sleep(5)

async def consumer_task(run_id: str, consumer_id: int):
    """Consumer: Continuously verifies raw contacts"""
    while task_status == "running":
        if task_pause_event.is_set():
            await asyncio.sleep(1)
            continue
        
        try:
            raw_leads = await supabase.select('marketing_raw_contacts', '*', {'status': 'pending'}, limit=1)
            if not raw_leads:
                await asyncio.sleep(2)
                continue
            
            lead = raw_leads[0]
            await supabase.update('marketing_raw_contacts', {'status': 'processing'}, {'id': lead['id']})
            
            await log_to_db(run_id, "info", f"[C{consumer_id}] Weryfikacja AI: {lead.get('url')}")
            success = await verify_raw_lead(run_id, lead)
            
            if success:
                await log_to_db(run_id, "success", f"[C{consumer_id}] Zweryfikowano: {lead.get('url')}")
                await supabase.delete('marketing_raw_contacts', {'id': lead['id']})
            else:
                await supabase.update('marketing_raw_contacts', {'status': 'rejected'}, {'id': lead['id']})
        except Exception as e:
            logger.error(f"Consumer {consumer_id} error: {e}")
            await asyncio.sleep(1)

async def run_worker(run_id: str, target_count: int):
    global task_status
    task_status = "running"
    
    await supabase.delete('marketing_search_logs')
    await log_to_db(run_id, "info", f"Rozpoczynam zlecenie na {target_count} leadów.")

    producer = asyncio.create_task(producer_task(run_id))
    consumers = [asyncio.create_task(consumer_task(run_id, i)) for i in range(NUM_CONSUMERS)]
    
    try:
        while True:
            if task_stop_event.is_set():
                task_status = "cancelled"
                await log_to_db(run_id, "warning", "Zlecenie anulowane.")
                break

            while task_pause_event.is_set():
                await asyncio.sleep(1)
                if task_stop_event.is_set():
                    task_status = "cancelled"
                    break
            
            task_status = "running"
            
            verified = await supabase.select('marketing_verified_contacts', 'id', {})
            verified_count = len(verified) if verified else 0
            
            if verified_count >= target_count:
                task_status = "completed"
                await log_to_db(run_id, "success", f"Zlecenie zakończone! Pozyskano {verified_count} leadów.")
                await send_telegram(f"✅ Lead Finder zakończył pracę!\nZlecenie: {run_id[:8]}\nZnaleziono: {verified_count} kontaktów.")
                break
            
            await asyncio.sleep(2)
    finally:
        producer.cancel()
        for c in consumers:
            c.cancel()
        await asyncio.gather(producer, *consumers, return_exceptions=True)

# --- API Endpoints ---
@app.post("/api/search-runs")
async def start_run(target_count: int = 50):
    global active_task, task_run_id, task_stop_event, task_pause_event
    if task_status == "running": raise HTTPException(400, "Zlecenie już działa")
    
    task_run_id = str(uuid.uuid4())
    task_stop_event.clear()
    task_pause_event.clear()
    active_task = asyncio.create_task(run_worker(task_run_id, target_count))
    return {"ok": True, "run_id": task_run_id}

@app.post("/api/search-runs/{run_id}/pause")
async def pause_run(run_id: str):
    global task_status
    if task_run_id == run_id:
        task_pause_event.set()
        task_status = "paused"
    return {"ok": True}

@app.post("/api/search-runs/{run_id}/resume")
async def resume_run(run_id: str):
    global task_status
    if task_run_id == run_id:
        task_pause_event.clear()
        task_status = "running"
    return {"ok": True}

@app.post("/api/search-runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    global task_status
    if task_run_id == run_id:
        task_stop_event.set()
        task_pause_event.clear()
        task_status = "cancelled"
    return {"ok": True}

@app.get("/api/search-runs/status")
async def get_status():
    return {"status": task_status, "run_id": task_run_id}

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

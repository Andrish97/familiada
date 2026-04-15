"""
Marketing Lead Finder Service - Multi-layer Buffered Version
Architecture: Query Pool -> Raw Buffer -> AI Verification
"""

import asyncio
import json
import logging
import os
import random
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
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

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
verified_in_run = 0

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
    
    async def call_rpc(self, function_name, params=None):
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f'{self.url}/rest/v1/rpc/{function_name}',
                headers=self.headers,
                json=params or {}
            )
            return r.status_code in (200, 201)
    
    async def truncate(self, table):
        if table == 'marketing_search_logs':
            return await self.call_rpc('clear_marketing_logs')
        async with httpx.AsyncClient() as client:
            r = await client.delete(f'{self.url}/rest/v1/{table}?id=eq.00000000-0000-0000-0000-000000000000', headers=self.headers)
            return r.status_code in (200, 204)

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helpers ---
async def log_to_db(level, message):
    await supabase.insert('marketing_search_logs', {'level': level, 'message': message})
    logger.info(f"[{level.upper()}] {message}")

async def send_telegram(message: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram: BOT_TOKEN or CHAT_ID not configured")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={'chat_id': TELEGRAM_CHAT_ID, 'text': message, 'parse_mode': 'HTML'}
            )
            if r.status_code == 200:
                logger.info("Telegram: notification sent")
            else:
                logger.error(f"Telegram error: {r.status_code} {r.text[:100]}")
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
        await log_to_db("warning", "Pula zapytań wyczerpana. Resetuję historię...")
        await supabase.delete('marketing_search_queries_log') # Clear history
        return random.choice(pool) # Start from random
    
    return random.choice(available)

async def refill_raw_buffer(run_id: str):
    """Producer: Searches SearXNG and fills marketing_raw_contacts"""
    current_raw = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'})
    count = len(current_raw) if current_raw else 0
    
    if count >= RAW_BUFFER_THRESHOLD:
        return # Buffer still full enough

    await log_to_db("info", f"Bufor surowych kontaktów niski ({count}). Uruchamiam nowe wyszukiwanie...")
    
    query = await fetch_next_query(run_id)
    if not query: return

    await log_to_db("info", f"Wyszukiwanie: {query}")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json'})
            if r.status_code != 200:
                await log_to_db("error", f"SearXNG Error {r.status_code}")
                return
            results = r.json().get('results', [])
    except Exception as e:
        await log_to_db("error", f"SearXNG Connection Fail: {e}")
        return

    # Add query to history
    await supabase.insert('marketing_search_queries_log', {'query_text': query})

    if not results:
        await log_to_db("warning", f"Brak wyników dla: {query}")
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

    await log_to_db("success", f"Dodano {new_raw_count} surowych kontaktów do bufora.")

# --- Core Logic: AI Layer (Consumer) ---
async def fetch_page_content(url: str) -> dict:
    """Fetch page content for AI verification"""
    content = {'title': '', 'description': '', 'text': ''}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code == 200:
                text = r.text[:50000]
                title_match = re.search(r'<title[^>]*>([^<]+)</title>', text, re.I)
                desc_match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', text, re.I)
                content['title'] = title_match.group(1).strip() if title_match else ''
                content['description'] = desc_match.group(1).strip() if desc_match else ''
                text_no_html = re.sub(r'<[^>]+>', ' ', text)
                text_no_html = re.sub(r'\s+', ' ', text_no_html).strip()
                content['text'] = text_no_html[:2000]
    except Exception as e:
        logger.info(f"Failed to fetch content from {url}: {e}")
    return content

async def verify_raw_lead(run_id: str, lead: dict, consumer_id: int = 0) -> Optional[dict]:
    """Consumer: Takes one raw lead and asks AI to verify. Returns result dict or None on error."""
    url = lead.get('url')
    emails = lead.get('emails_found', [])
    
    logger.info(f"[C{consumer_id}] Scrapuję stronę: {url}")
    page_content = await fetch_page_content(url)
    
    prompt = f"""Przeanalizuj poniższą stronę i zdecyduj czy to organizator eventów (DJ, Wodzirej, Konferansjer, Animator, Agencja eventowa).

URL: {url}
Tytuł strony: {page_content.get('title', '')}
Opis: {page_content.get('description', '')}
Treść strony: {page_content.get('text', '')[:1000]}
Maile kontaktowe: {', '.join(emails) if emails else 'brak'}

Odpowiedz WYŁĄCZNIE JSONem:
{{
  "is_event_organizer": bool,
  "best_email": "string (najlepszy email do kontaktu lub pusty string)",
  "reasoning": "krótkie uzasadnienie dlaczego to lub nie jest organizatorem"
}}"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f'{AI_ENDPOINT}/api/chat', json={
                'model': AI_MODEL,
                'messages': [{'role': 'system', 'content': 'Jesteś asystentem marketingu. Odpowiadaj TYLKO JSONEM.'}, 
                             {'role': 'user', 'content': prompt}],
                'stream': False
            })
            logger.info(f"[C{consumer_id}] AI response status: {r.status_code}")
            logger.info(f"[C{consumer_id}] AI response body: {r.text[:500]}")
            if r.status_code == 200:
                content = r.json().get('message', {}).get('content', '')
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if match:
                    res = json.loads(match.group().replace("'", '"'))
                    return {
                        'is_event_organizer': res.get('is_event_organizer', False),
                        'best_email': res.get('best_email', ''),
                        'reasoning': res.get('reasoning', '')[:200]
                    }
        return None
    except Exception as e:
        logger.error(f"AI verify error: {e}")
        return None

# --- Main Task Loop ---
NUM_CONSUMERS = 1

async def producer_task(run_id: str):
    """Producer: Continuously searches for new raw contacts (always completes, ignores pause)"""
    while task_status == "running":
        try:
            await refill_raw_buffer(run_id)
        except Exception as e:
            logger.error(f"Producer error: {e}")
        await asyncio.sleep(5)

async def consumer_task(run_id: str, consumer_id: int, target: int):
    """Consumer: Continuously verifies raw contacts"""
    while task_status == "running":
        if task_pause_event.is_set():
            await asyncio.sleep(1)
            continue
        
        try:
            raw_leads = await supabase.select('marketing_raw_contacts', '*', {'status': 'pending'}, limit=1)
            if not raw_leads or len(raw_leads) == 0:
                await log_to_db("info", f"[C{consumer_id}] Brak pending kontaktów")
                await asyncio.sleep(2)
                continue
            
            lead = raw_leads[0]
            lead_id = lead['id']
            lead_url = lead.get('url')
            logger.info(f"[C{consumer_id}] Pobrano lead: {lead_id} - {lead_url}")
            
            update_ok = await supabase.update('marketing_raw_contacts', {'status': 'processing'}, {'id': lead_id})
            logger.info(f"[C{consumer_id}] Update processing: {update_ok}")
            
            await log_to_db("info", f"[C{consumer_id}] Weryfikacja AI: {lead_url}")
            result = await verify_raw_lead(run_id, lead, consumer_id)
            
            if task_status not in ("running", "paused"):
                break
            
            if result and result.get('is_event_organizer') and result.get('best_email'):
                # Sukces - wstawiamy do verified, usuwamy z raw
                await supabase.insert('marketing_verified_contacts', {
                    'title': lead.get('title'),
                    'email': result['best_email'],
                    'url': lead_url,
                    'short_description': result.get('reasoning', '')[:200]
                })
                global verified_in_run
                verified_in_run += 1
                await log_to_db("success", f"[C{consumer_id}] Zweryfikowano ({verified_in_run}/{target}): {lead_url}")
                await supabase.delete('marketing_raw_contacts', {'id': lead_id})
            else:
                # Porażka - oznaczamy jako rejected w raw
                await supabase.update('marketing_raw_contacts', {'status': 'rejected'}, {'id': lead_id})
                logger.info(f"[C{consumer_id}] Odrzucono: {lead_url}")
        except Exception as e:
            logger.error(f"Consumer {consumer_id} error: {e}")
            await asyncio.sleep(1)

async def cleanup_on_cancel():
    """Revert all processing contacts back to pending when cancelled"""
    try:
        processing = await supabase.select('marketing_raw_contacts', 'id', {'status': 'processing'})
        if processing:
            for lead in processing:
                await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead['id']})
            logger.info(f"Reverted {len(processing)} processing contacts to pending")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")

async def run_worker(run_id: str, target_count: int):
    global task_status, verified_in_run
    task_status = "running"
    verified_in_run = 0
    
    await supabase.truncate('marketing_search_logs')
    await log_to_db("info", f"Rozpoczynam zlecenie na {target_count} leadów.")

    producer = asyncio.create_task(producer_task(run_id))
    consumers = [asyncio.create_task(consumer_task(run_id, i, target_count)) for i in range(NUM_CONSUMERS)]
    
    try:
        while True:
            if task_stop_event.is_set():
                task_status = "cancelled"
                await log_to_db("warning", "Zlecenie anulowane.")
                break

            while task_pause_event.is_set():
                await asyncio.sleep(1)
                if task_stop_event.is_set():
                    task_status = "cancelled"
                    await log_to_db("warning", "Zlecenie anulowane.")
                    break
            
            task_status = "running"
            
            if verified_in_run >= target_count:
                await asyncio.sleep(2)
                if verified_in_run >= target_count:
                    task_status = "completed"
                    await log_to_db("success", f"Zlecenie zakończone! Pozyskano {verified_in_run} leadów.")
                    await send_telegram(f"✅ Lead Finder zakończył pracę!\nZlecenie: {run_id[:8]}\nZnaleziono: {verified_in_run} kontaktów.")
                    break
            
            await asyncio.sleep(1)
    finally:
        producer.cancel()
        for c in consumers:
            c.cancel()
        await asyncio.gather(producer, *consumers, return_exceptions=True)
        await cleanup_on_cancel()

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

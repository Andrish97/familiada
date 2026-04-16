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
USE_GROQ = bool(os.getenv("GROQ_API_KEY", ""))
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.1-8b-instant"
OLLAMA_URL = "http://ollama:11434"
OLLAMA_MODEL = "llama3.2:3b"
SUPABASE_URL = "http://kong:8000"
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SERVICE_ROLE_KEY", ""))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# --- Constants ---
SEARCH_TEMPLATES = [
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

BLOCKED_DOMAINS = {
    # Ogłoszenia / marketplace
    'olx.pl', 'allegro.pl', 'gumtree.pl', 'sprzedajemy.pl',
    'oferteo.pl', 'fixly.pl', 'weselezklasa.pl',
    
    # Platformy freelance / praca
    'useme.pl', 'pracuj.pl', 'jooble.pl', 'infopraca.pl', 'praca.pl',
    
    # Sklepy / RTV AGD
    'amazon.com', 'ebay.com', 'etsy.com', 'empik.com', 'ceneo.pl', 'skapiec.pl',
    'mediaexpert.pl', 'x-kom.pl', 'morele.net', 'komputronik.pl', 'neonet.pl',
    'media-markt.pl', 'saturn.pl', 'expert.pl', 'avs.pl',
    
    # Gry / rozrywka
    'gry-online.pl', 'gamepressure.com', 'igromania.pl', 'gry.pl', 'gram.pl',
    'swiatgier.pl', 'stopklatka.pl', 'filmweb.pl', 'imdb.com',
    'rottentomatoes.com', 'metacritic.com', 'letterboxd.com',
    'trakt.tv', 'simkl.com', 'justwatch.com',
    
    # Książki / kultura
    'instytutksiazki.pl', 'biblioteka.pl', 'bookcrossing.com', 'goodreads.com',
    'lubimyczytac.pl', 'granice.pl', 'swiatczytnika.pl',
    'legimi.com', 'virtualo.pl', 'publio.pl', 'wolnelektury.pl', 'polona.pl',
    
    # Specyficzne polskie katalogi weselne (duplikaty/zduplikowane)
    'janachowska.pl'
}

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
RAW_BUFFER_THRESHOLD = 20
MAX_RESULTS_PER_SEARCH = 50

GARBAGE_EMAIL_DOMAINS = {'sentry.io', 'sentry.wixpress.com', 'sentry-next.wixpress.com', 'mailgun.org', 'mandrillapp.com', 'sendgrid.net', 'mailservers.dev'}

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
            if r.status_code not in (200, 201):
                logger.error(f"Supabase insert error ({table}): {r.status_code} {r.text[:200]}")
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
        async with httpx.AsyncClient(timeout=30) as client:
            headers = {**self.headers, 'Prefer': 'return=minimal'}
            r = await client.post(
                f'{self.url}/rest/v1/rpc/{function_name}',
                headers=headers,
                json=params or {}
            )
            if r.status_code not in (200, 201, 204):
                logger.error(f"RPC {function_name} error: {r.status_code} {r.text[:200] if r.text else 'empty'}")
                return False
            return True
    
    async def clear_table(self, table):
        """Clear all rows from a table"""
        async with httpx.AsyncClient(timeout=30) as client:
            logger.info(f"[CLEAR] Deleting all from {table}...")
            r = await client.delete(f'{self.url}/rest/v1/{table}', headers=self.headers)
            logger.info(f"[CLEAR] {table}: status={r.status_code}, response={r.text[:200] if r.text else 'empty'}")
            if r.status_code not in (200, 204):
                logger.error(f"Clear {table} error: {r.status_code} {r.text[:200]}")
                return False
            return True

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
async def fetch_next_query(run_id: str) -> Optional[tuple]:
    """Finds next available query template + city combo not in history."""
    cities_data = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
    if not cities_data:
        logger.warning("Brak miast w tabeli marketing_cities!")
        return None
    
    cities = [c['name'] for c in cities_data]
    history_data = await supabase.select('marketing_search_queries_log', 'query_text')
    history = {h['query_text'] for h in history_data} if history_data else set()
    
    logger.info(f"Miast: {len(cities)}, Wykonanych query: {len(history)}")

    # Generate all possible queries
    pool = []
    for city in cities:
        for template in SEARCH_TEMPLATES:
            pool.append((template.format(city=city), city))

    # Check if pool is exhausted
    available = [q for q in pool if q[0] not in history]
    
    if not available:
        await log_to_db("warning", "Pula zapytań wyczerpana. Resetuję historię...")
        await supabase.call_rpc('truncate_marketing_queries_log')
        chosen = random.choice(pool)
        return chosen
    
    return random.choice(available)

async def scrape_and_save_lead(res: dict, query: str, existing_emails: Set[str]):
    """Scrapes a single search result and saves to raw_contacts if valid."""
    url = res.get('url', '').lower()
    if not url or any(d in url for d in BLOCKED_DOMAINS): return 0
    
    # Deduplicate vs Verified and Raw
    exists_v = await supabase.select('marketing_verified_contacts', 'id', {'url': url})
    exists_r = await supabase.select('marketing_raw_contacts', 'id', {'url': url})
    if exists_v or exists_r: return 0

    page_title = res.get('title', '')
    page_text = ''
    emails = set()
    
    def extract_content(text: str, title: str) -> tuple[str, str]:
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', text, re.I)
        if title_match and not title:
            title = title_match.group(1).strip()
        text_no_html = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.DOTALL | re.I)
        text_no_html = re.sub(r'<style[^>]*>.*?</style>', ' ', text_no_html, flags=re.DOTALL | re.I)
        text_no_html = re.sub(r'<noscript[^>]*>.*?</noscript>', ' ', text_no_html, flags=re.DOTALL | re.I)
        text_no_html = re.sub(r'data:[^;]+;base64,[A-Za-z0-9+/=]+', ' ', text_no_html)
        text_no_html = re.sub(r'<[^>]+>', ' ', text_no_html)
        text_no_html = re.sub(r'\{[^}]*\}', ' ', text_no_html)
        text_no_html = re.sub(r'\[[^\]]*\]', ' ', text_no_html)
        text_no_html = re.sub(r'\s+', ' ', text_no_html).strip()
        words = text_no_html.split()
        words = [w for w in words if len(w) > 2 and not w.startswith('http')]
        return title, ' '.join(words)[:1500]
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=headers) as client:
            # 1. Main page
            r_crawl = await client.get(url)
            if r_crawl.status_code == 200:
                text = r_crawl.text[:50000]
                page_title, page_text = extract_content(text, page_title)
                found_emails = EMAIL_REGEX.findall(text)
                for e in found_emails:
                    if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                        emails.add(e)
            
            # 2. Contact page sub-crawl
            parsed = urlparse(url)
            base = f"{parsed.scheme}://{parsed.netloc}"
            for path in ['/kontakt', '/contact', '/o-nas']:
                try:
                    r_contact = await client.get(base + path)
                    if r_contact.status_code == 200:
                        found = EMAIL_REGEX.findall(r_contact.text[:30000])
                        for e in found:
                            if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                                emails.add(e)
                except: pass
    except: pass

    if not emails or not page_text: return 0
    
    email_list = [e.lower() for e in emails]
    if any(e in existing_emails for e in email_list): return 0
            
    ok = await supabase.insert('marketing_raw_contacts', {
        'url': url,
        'title': page_title,
        'page_text': page_text,
        'emails_found': email_list,
        'status': 'pending'
    })
    if ok:
        logger.info(f"[PRODUCER] Added: {url} ({len(email_list)} emails)")
        return 1
    return 0

async def refill_raw_buffer(run_id: str):
    """Producer: Searches SearXNG and fills buffer in parallel."""
    pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'})
    processing = await supabase.select('marketing_raw_contacts', 'id', {'status': 'processing'})
    count = (len(pending) if pending else 0) + (len(processing) if processing else 0)
    
    if count >= RAW_BUFFER_THRESHOLD: return

    query_data = await fetch_next_query(run_id)
    if not query_data: return
    query, city_name = query_data[0], query_data[1]
    
    await log_to_db("info", f"Wyszukiwanie ({city_name}): {query}")
    
    results = []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json'})
            if r.status_code == 200:
                results = r.json().get('results', [])[:MAX_RESULTS_PER_SEARCH]
    except Exception as e:
        logger.error(f"Search error: {e}")
    
    await supabase.insert('marketing_search_queries_log', {
        'query_text': query,
        'urls_found': len(results),
        'status': 'completed' if results else 'failed'
    })
    
    if not results: return

    # Build set of all existing emails for deduplication
    verified_contacts = await supabase.select('marketing_verified_contacts', 'email')
    raw_contacts = await supabase.select('marketing_raw_contacts', 'emails_found')
    existing_emails = {v['email'].lower() for v in (verified_contacts or []) if v.get('email')}
    for r in (raw_contacts or []):
        raw_list = r.get('emails_found', [])
        if isinstance(raw_list, str):
            try: raw_list = json.loads(raw_list)
            except: raw_list = []
        for e in raw_list: existing_emails.add(e.lower())

    # Scrape ALL results in parallel
    tasks = [scrape_and_save_lead(res, query, existing_emails) for res in results]
    new_counts = await asyncio.gather(*tasks)
    total_new = sum(new_counts)

    if total_new > 0:
        await log_to_db("success", f"Dodano {total_new} surowych kontaktów do bufora.")

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
    """Consumer: Asks AI to verify if the contact is an event organizer."""
    url = lead.get('url')
    title = lead.get('title', '')
    page_text = lead.get('page_text', '')
    emails = lead.get('emails_found', [])
    if isinstance(emails, str):
        try: emails = json.loads(emails)
        except: emails = []
    
    logger.info(f"[C{consumer_id}] Weryfikuję: {url}")
    
    prompt = f"""ZADANIE:
Określ, czy strona reprezentuje realnego dostawcę usług eventowych.

----------------------------------------
DANE WEJŚCIOWE:
----------------------------------------
URL: {url}
TYTUŁ: {title}
MAILE: {', '.join(emails) if emails else 'brak'}
TEXT: {page_text[:2000] if page_text else 'brak'}

----------------------------------------
LOGIKA WERYFIKACJI (KROK PO KROKU):
----------------------------------------
1. TYPOLOGIA:
   - DIRECT PROVIDER (DJ, animator, agencja) -> AKCEPTUJ
   - VENUE (hotel, sala) z ofertą eventową -> AKCEPTUJ
   - DIRECTORY/CATALOG (katalog firm, portal ogłoszeniowy) -> ODRZUĆ

2. ELEMENTY EVENTOWE:
   - Szukaj: wesela, integracje, konferencje, DJ, wodzirej, nagłośnienie, animator.

3. SEO SPAM & CATALOG DETECTION:
   - RED FLAGS: wiele miast w tytule, brak nazwy marki, URL /katalog/, /firmy/, /szukaj/.
   - GREEN FLAGS: konkretna osoba/brand, portfolio zdjęć, bezpośredni kontakt.

4. EMAIL:
   - Musi być poprawny i nie-systemowy. Brak maila = ODRZUĆ.

----------------------------------------
WARUNKI AKCEPTACJI:
----------------------------------------
- Musi to być bezpośredni usługodawca lub obiekt z własną ofertą eventową.
- Nie może to być katalog firm ani portal listingowy.
- Musi posiadać poprawny adres email.

OUTPUT (JSON):
{{
  "ok": 1 lub 0,
  "type": "provider | venue | directory",
  "email": "...",
  "title": "nazwa firmy (max 50 znaków)",
  "short_description": "100-200 znaków",
  "score_event": 1-10,
  "seo_spam_score": (-5 do 5),
  "reason": "dlaczego tak/nie (konkretny dowód)"
}}
ODPOWIEDZ TYLKO CZYSTYM JSONEM."""

    try:
        if USE_GROQ:
            # Groq API (OpenAI-compatible)
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        'Authorization': f'Bearer {GROQ_API_KEY}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'model': GROQ_MODEL,
                        'messages': [
                            {'role': 'system', 'content': 'Odpowiadaj tylko JSON bez markdown.'},
                            {'role': 'user', 'content': prompt}
                        ],
                        'temperature': 0.1
                    }
                )
                logger.info(f"[C{consumer_id}] Groq response status: {r.status_code}")
                logger.info(f"[C{consumer_id}] Groq response: {r.text[:1000]}")
                
                if r.status_code != 200:
                    logger.error(f"[C{consumer_id}] Groq ERROR: {r.text[:500]}")
                    return None
                    
                content = r.json()['choices'][0]['message']['content']
        else:
            # Ollama fallback
            async with httpx.AsyncClient(timeout=90) as client:
                r = await client.post(f'{OLLAMA_URL}/api/chat', json={
                    'model': OLLAMA_MODEL,
                    'messages': [
                        {'role': 'system', 'content': 'Jestes asystentem marketingu. Odpowiadaj TYLKO JSONEM.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'stream': False
                })
                logger.info(f"[C{consumer_id}] Ollama response status: {r.status_code}")
                logger.info(f"[C{consumer_id}] Ollama response: {r.text[:1000]}")
                
                if r.status_code != 200:
                    logger.error(f"[C{consumer_id}] Ollama ERROR: {r.text[:500]}")
                    return None
                    
                content = r.json().get('message', {}).get('content', '')
        
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if not match:
            logger.warning(f"[C{consumer_id}] AI: Brak JSON. Content: {content[:500]}")
            return None
            
        res = json.loads(match.group().replace("'", '"'))
        ok_val = res.get('ok', 0)
        is_organizer = ok_val in [1, True, '1', 'true', 'True']
        
        # Validate email - must contain @ and look like real email
        raw_email = res.get('email', '') or ''
        email_match = re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', raw_email.lower())
        best_email = raw_email if email_match else ''
        
        return {
            'is_event_organizer': is_organizer,
            'title': (res.get('title') or '')[:50],
            'best_email': best_email,
            'short_description': res.get('short_description', '')[:200],
            'reason': res.get('reason', '')[:200],
            'score_event': res.get('score_event', 0),
            'seo_spam_score': res.get('seo_spam_score', 0),
            'lead_type': res.get('type', ''),
            'url': url
        }
    except Exception as e:
        logger.error(f"[C{consumer_id}] AI verify error: {e}")
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
    global verified_in_run
    while task_status == "running":
        if task_pause_event.is_set():
            await asyncio.sleep(1)
            continue
        
        try:
            if verified_in_run >= target:
                logger.info(f"[C{consumer_id}] Cel osiągnięty ({verified_in_run}/{target}), czekam na zakończenie...")
                await asyncio.sleep(3)
                continue
            
            raw_leads = await supabase.select('marketing_raw_contacts', '*', {'status': 'pending'}, limit=1)
            if not raw_leads or len(raw_leads) == 0:
                if verified_in_run >= target:
                    continue
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
            
            if result is None:
                await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead_id})
                logger.warning(f"[C{consumer_id}] AI timeout - odłożone do ponownej próby: {lead_url}")
                await asyncio.sleep(5)
            elif result.get('is_event_organizer') and result.get('best_email'):
                await supabase.insert('marketing_verified_contacts', {
                    'title': result.get('title') or lead.get('title'),
                    'email': result['best_email'],
                    'url': result.get('url') or lead_url,
                    'short_description': result.get('short_description', '')[:200],
                    'verify_reason': result.get('reason', '')[:500]
                })
                verified_in_run += 1
                reason = result.get('reason', '')
                lead_type = result.get('lead_type', '')
                await log_to_db("success", f"[C{consumer_id}] Zweryfikowano ({verified_in_run}/{target}): {result.get('url', lead_url)} | type:{lead_type} | ai:{result.get('score_event', '?')} | spam:{result.get('seo_spam_score', '?')} | powod: {reason}")
                await supabase.delete('marketing_raw_contacts', {'id': lead_id})
            elif result.get('is_event_organizer') and not result.get('best_email'):
                reject_reason = 'Brak prawidlowego emaila kontaktowego'
                await supabase.update('marketing_raw_contacts', {
                    'status': 'rejected',
                    'reject_reason': reject_reason
                }, {'id': lead_id})
                await log_to_db("warning", f"[C{consumer_id}] Odrzucono (brak maila): {lead_url} | powod: {reject_reason}")
            else:
                reject_reason = result.get('reason') or 'Nie jest organizatorem eventow'
                await supabase.update('marketing_raw_contacts', {
                    'status': 'rejected',
                    'reject_reason': reject_reason[:500]
                }, {'id': lead_id})
                await log_to_db("warning", f"[C{consumer_id}] Odrzucono: {lead_url} | type:{result.get('lead_type', '?')} | ai:{result.get('score_event', '?')} | spam:{result.get('seo_spam_score', '?')} | powod: {reject_reason}")
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
    
    logger.info("[CLEAR] Czyszczę logi przed nowym zleceniem...")
    clear_ok = await supabase.call_rpc('clear_marketing_search_logs')
    logger.info(f"[CLEAR] clear_marketing_search_logs: {clear_ok}")
    logger.info(f"Rozpoczynam zlecenie na {target_count} leadów.")
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
    global active_task, task_run_id, task_stop_event, task_pause_event, task_status
    if task_status == "running": raise HTTPException(400, "Zlecenie już działa")
    
    task_status = "running"
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

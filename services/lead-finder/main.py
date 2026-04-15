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
OLLAMA_MODEL = "phi:latest"
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
MAX_RESULTS_PER_SEARCH = 10

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
        async with httpx.AsyncClient() as client:
            logger.info(f"[RPC] Calling {function_name}...")
            r = await client.post(
                f'{self.url}/rest/v1/rpc/{function_name}',
                headers=self.headers,
                json=params or {}
            )
            logger.info(f"[RPC] {function_name}: status={r.status_code}, body={r.text[:200]}")
            if r.status_code not in (200, 201):
                logger.error(f"RPC {function_name} error: {r.status_code} {r.text[:200]}")
            return r.status_code in (200, 201)
    
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
        await supabase.call_rpc('clear_marketing_queries_log')
        chosen = random.choice(pool)
        return chosen
    
    return random.choice(available)

async def refill_raw_buffer(run_id: str):
    """Producer: Searches SearXNG and fills marketing_raw_contacts (only pending/processing, not rejected)"""
    logger.info("[PRODUCER] Sprawdzam bufor...")
    
    pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'})
    processing = await supabase.select('marketing_raw_contacts', 'id', {'status': 'processing'})
    count = (len(pending) if pending else 0) + (len(processing) if processing else 0)
    
    logger.info(f"[PRODUCER] Bufor: pending={len(pending) if pending else 0}, processing={len(processing) if processing else 0}, razem={count}")
    
    if count >= RAW_BUFFER_THRESHOLD:
        logger.info(f"[PRODUCER] Bufor pelny ({count} >= {RAW_BUFFER_THRESHOLD}), czekam...")
        return

    await log_to_db("info", f"Bufor surowych kontaktów niski ({count}). Uruchamiam nowe wyszukiwanie...")
    
    query_data = await fetch_next_query(run_id)
    if not query_data: 
        await log_to_db("error", "Brak dostępnych zapytań!")
        return
    else:
        logger.info(f"[PRODUCER] Wybrano query: {query_data[0]}")

    query, city_name = query_data[0], query_data[1]
    
    await log_to_db("info", f"Wyszukiwanie ({city_name}): {query}")
    
    search_error = None
    results = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json'})
            if r.status_code != 200:
                search_error = f"SearXNG Error {r.status_code}"
            else:
                results = r.json().get('results', [])
    except Exception as e:
        search_error = f"Connection Fail: {e}"
    
    logger.info(f"[PRODUCER] Zapisuję query do logu: {query}")
    log_insert = await supabase.insert('marketing_search_queries_log', {
        'query_text': query,
        'urls_found': len(results),
        'status': 'failed' if search_error else 'completed'
    })
    logger.info(f"[PRODUCER] Query log insert result: {log_insert}")
    
    if search_error:
        await log_to_db("error", search_error)
        return

    if not results:
        await log_to_db("warning", f"Brak wyników dla: {query}")
        return

    # Process results into buffer
    new_raw_count = 0
    GARBAGE_EMAIL_DOMAINS = {'sentry.io', 'sentry.wixpress.com', 'sentry-next.wixpress.com', 'mailgun.org', 'mandrillapp.com', 'sendgrid.net', 'mailservers.dev'}
    
    logger.info(f"[PRODUCER] [{query}] Processing {len(results)} search results")
    
    for i, res in enumerate(results):
        url = res.get('url', '').lower()
        logger.debug(f"[PRODUCER] [{query}] [{i+1}/{len(results)}] Checking: {url}")
        if not url or any(d in url for d in BLOCKED_DOMAINS): continue
        
        # Deduplicate vs Verified and Raw
        exists_v = await supabase.select('marketing_verified_contacts', 'id', {'url': url})
        exists_r = await supabase.select('marketing_raw_contacts', 'id', {'url': url})
        if exists_v or exists_r: continue

        # Fetch main page content (from search result)
        page_title = res.get('title', '')
        page_text = ''
        emails = set()
        
        def extract_content(text: str, title: str) -> tuple[str, str]:
            """Extract title and clean text from HTML"""
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
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                r_crawl = await client.get(url)
                if r_crawl.status_code != 200:
                    logger.warning(f"[SCRAPE] HTTP {r_crawl.status_code} for {url}")
                else:
                    text = r_crawl.text[:50000]
                    page_title, page_text = extract_content(text, page_title)
                    found_emails = EMAIL_REGEX.findall(text)
                    logger.debug(f"[SCRAPE] {url}: found {len(found_emails)} emails")
                    for e in found_emails:
                        if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                            emails.add(e)
                # Try /kontakt, /contact, /contact-us pages
                parsed = urlparse(url)
                base = f"{parsed.scheme}://{parsed.netloc}"
                contact_paths = ['/kontakt', '/contact', '/contact-us', '/o-nas']
                
                for path in contact_paths:
                    contact_url = base + path
                    logger.debug(f"[SCRAPE] [{url}] Trying: {contact_url}")
                    try:
                        r_contact = await client.get(contact_url)
                        if r_contact.status_code == 200:
                            contact_text = r_contact.text[:30000]
                            found = EMAIL_REGEX.findall(contact_text)
                            logger.debug(f"[SCRAPE] [{url}] {path}: found {len(found)} emails")
                            for e in found:
                                if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                                    emails.add(e)
                    except Exception as ex:
                        logger.debug(f"[SCRAPE] [{url}] {path} failed: {ex}")
        except: pass

        if not emails:
            logger.debug(f"[SCRAPE] No emails found for {url}")
            continue
        
        if not page_text:
            logger.debug(f"[SCRAPE] No page text for {url}, skipping")
            continue
            
        email_list = list(emails)
        logger.info(f"[SCRAPE] [{url}] Found emails: {email_list}")
        
        # Get all emails from verified and raw
        verified_contacts = await supabase.select('marketing_verified_contacts', 'email')
        raw_contacts = await supabase.select('marketing_raw_contacts', 'emails_found')
        
        # Build set of all existing emails
        existing_emails = set()
        for v in (verified_contacts or []):
            if v.get('email'):
                existing_emails.add(v['email'].lower())
        for r in (raw_contacts or []):
            raw_emails = r.get('emails_found', [])
            if isinstance(raw_emails, str):
                try: raw_emails = json.loads(raw_emails)
                except: raw_emails = []
            for e in raw_emails:
                existing_emails.add(e.lower())
        
        # Check if any new email already exists
        duplicate = any(e.lower() in existing_emails for e in email_list)
        
        if duplicate:
            logger.debug(f"[SCRAPE] Duplicate email for {url}")
            continue
            
        ok = await supabase.insert('marketing_raw_contacts', {
            'url': url,
            'title': page_title,
            'page_text': page_text,
            'emails_found': email_list,
            'status': 'pending'
        })
        if ok: 
            new_raw_count += 1
            logger.info(f"[PRODUCER] Added to buffer: {url} -> {email_list}")

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
    """Consumer: Asks AI to verify if the contact is an event organizer."""
    url = lead.get('url')
    title = lead.get('title', '')
    page_text = lead.get('page_text', '')
    emails = lead.get('emails_found', [])
    if isinstance(emails, str):
        try: emails = json.loads(emails)
        except: emails = []
    
    logger.info(f"[C{consumer_id}] Weryfikuję: {url}")
    
    prompt = f"""Zweryfikuj, czy firma jest organizatorem eventów w Polsce na podstawie danych wejściowych.

----------------------------------------
DANE WEJŚCIOWE:
----------------------------------------
URL: {url}
TYTUŁ: {title}
MAILE: {', '.join(emails) if emails else 'brak'}
TEXT: {page_text if page_text else 'brak'}

----------------------------------------
KONTEKST (INTENT ZAPYTANIA):
----------------------------------------
Zakładamy, że wynik pochodzi z wyszukiwań typu:
- DJ, wodzirej, konferansjer, prezenter eventowy
- animator dzieci
- agencja eventowa, organizacja imprez
- team building, gry integracyjne

ZASADA:
- dopasowanie do powyższych fraz zwiększa wiarygodność
- brak dopasowania → sygnał negatywny
- sprzeczność (np. sklep, portal) → odrzuć niezależnie od innych sygnałów

----------------------------------------
KROK 1 — ANALIZA EVENTOWA (SCORING)
----------------------------------------

PRZYZNAJ PUNKTY:

+3 (mocny sygnał):
- DJ, wodzirej, konferansjer, prezenter eventowy
- animator (także dla dzieci)
- organizacja imprez, agencja eventowa
- konkretne usługi: wesela / urodziny / eventy firmowe / animacje

+2 (średni sygnał):
- obsługa wydarzeń, eventy, imprezy
- prowadzenie imprez, oprawa muzyczna
- team building, gry integracyjne

+2 (intent match):
- dopasowanie do fraz z kontekstu zapytania

+3 (lokal + usługi):
- hotel/restauracja + WYRAŹNE usługi organizacji (DJ, prowadzenie, animacje)

+1 (słaby sygnał):
- ogólne marketingowe opisy eventów bez konkretów

-2 (brak intentu):
- brak dopasowania do fraz eventowych

-2 (lokal bez usług):
- hotel/restauracja/sala oferująca tylko miejsce

-3 (negatywne):
- portal / marketplace / katalog
- sklep
- wypożyczalnia sprzętu bez obsługi
- branża niezwiązana z eventami

AKCEPTOWANE:
- profile na Facebooku, Instagramie, LinkedIn (jeśli to organizator eventów)
- strony na Google Maps / wizytówki
- profile na platformach społecznościowych z emailem kontaktowym

----------------------------------------
WYMÓG MINIMALNY (HARD RULE):
----------------------------------------
Musi wystąpić przynajmniej jedna konkretna usługa:
DJ / animator / konferansjer / organizacja imprez

Jeśli NIE → automatyczne odrzucenie

----------------------------------------
KROK 2 — WALIDACJA EMAIL
----------------------------------------

DOBRY EMAIL (+1):
- domenowy (np. kontakt@firma.pl, biuro@, imie@firma.pl, dj@...)

ZŁY EMAIL (-2):
- test@, example@, przyklad@
- olx@, allegro@
- noreply@, sentry@

BRAK EMAIL → automatyczne odrzucenie

WYNIK_EMAIL:
- jeśli ≥1 dobry email → PASS
- inaczej → FAIL

----------------------------------------
KROK 3 — DECYZJA KOŃCOWA:
----------------------------------------

WARUNKI OK:
- WYNIK_EVENT ≥ 3
- ORAZ WYNIK_EMAIL = PASS
- ORAZ spełniony WYMÓG MINIMALNY

INACZEJ → ODRZUCENIE

----------------------------------------
ZASADY OGÓLNE:
----------------------------------------
- opieraj się wyłącznie na URL, TYTUŁ, TEXT, MAILE
- nie zgaduj i nie dopowiadaj
- jeśli niepewne → odrzuć
- preferuj precision > recall
- wybierz jeden najlepszy email

----------------------------------------
OUTPUT (JSON):
----------------------------------------

Jeśli OK:
{{
  "ok": 1,
  "email": "...",
  "title": "max 50 znaków",
  "short_description": "100-200 znaków",
  "score_event": liczba,
  "reason": "konkretne dowody (np. DJ + wesela + animacje)"
}}

Jeśli NIE:
{{
  "ok": 0,
  "score_event": liczba,
  "reason": "konkretny powód odrzucenia"
}}"""""

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
                global verified_in_run
                verified_in_run += 1
                reason = result.get('reason', '')
                await log_to_db("success", f"[C{consumer_id}] Zweryfikowano ({verified_in_run}/{target}): {result.get('url', lead_url)} | ai:{result.get('score_event', '?')} | powod: {reason}")
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
                await log_to_db("warning", f"[C{consumer_id}] Odrzucono: {lead_url} | ai:{result.get('score_event', '?')} | powod: {reject_reason}")
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
    
    logger.info("Czyszczę logi przez RPC...")
    clear_ok = await supabase.call_rpc('clear_marketing_search_logs')
    clear_q_ok = await supabase.call_rpc('clear_marketing_queries_log')
    logger.info(f"Logi wyczyszczone: logs={clear_ok}, queries={clear_q_ok}")
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

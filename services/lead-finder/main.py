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
import time
from datetime import datetime
from typing import Optional, List, Set
from urllib.parse import urlparse
from contextlib import asynccontextmanager

import httpx

# --- Logger ---
logger = logging.getLogger("lead_finder")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(_handler)

# --- Configuration (Internal Docker) ---
SEARXNG_URL = "http://searxng:8080"
# --- AI Providers Configuration ---
AI_PROVIDERS = {
    'openrouter': {
        'key': os.getenv("OPENROUTER_API_KEY", ""),
        'model': os.getenv("OPENROUTER_MODEL", "anthropic/claude-3-haiku"),
        'endpoint': "https://openrouter.ai/api/v1/chat/completions",
        'headers': {'Content-Type': 'application/json'},
        'timeout': 60,
    },
    'groq': {
        'key': os.getenv("GROQ_API_KEY", ""),
        'model': os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        'endpoint': "https://api.groq.com/openai/v1/chat/completions",
        'headers': {'Content-Type': 'application/json'},
        'timeout': 30,
    },
    'gemini': {
        'key': os.getenv("GEMINI_API_KEY", ""),
        'model': os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite"),
        'endpoint': "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        'headers': {'Content-Type': 'application/json'},
        'timeout': 30,
    },
}

SUPABASE_URL = "http://kong:8000"
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SERVICE_ROLE_KEY", ""))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# --- Constants ---
def load_txt_lines(filename):
    path = os.path.join(os.path.dirname(__file__), filename)
    if not os.path.exists(path): return []
    with open(path, 'r', encoding='utf-8') as f:
        return [l.strip() for l in f if l.strip() and not l.startswith('#')]

def load_config():
    path = os.path.join(os.path.dirname(__file__), 'config.txt')
    config = {}
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and '=' in line and not line.startswith('#'):
                    key, val = line.split('=', 1)
                    try:
                        config[key.strip()] = int(val.strip())
                    except:
                        config[key.strip()] = val.strip()
    return config

CONFIG = load_config()

def get_cfg(key, default):
    val = CONFIG.get(key, default)
    if isinstance(default, int):
        try: return int(val)
        except: return default
    return val

ROLES = load_txt_lines('roles.txt')
SEARCH_TEMPLATES = load_txt_lines('templates.txt')
NEGATIVE_KEYWORDS = set(load_txt_lines('negative_keywords.txt'))

BLOCKED_DOMAINS = set(load_txt_lines('blocked_domains.txt'))

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
RAW_BUFFER_THRESHOLD = get_cfg('RAW_BUFFER_THRESHOLD', 20)

AI_DELAY = get_cfg('AI_DELAY', 10)  # Zwiększona zwłoka dla wszystkich
PROVIDER_COOLDOWN_SECONDS = get_cfg('PROVIDER_COOLDOWN_SECONDS', 60)

TIMEOUT_GET_PROVIDER = get_cfg('TIMEOUT_GET_PROVIDER', 5)
TIMEOUT_IS_PAGE_FRESH = get_cfg('TIMEOUT_IS_PAGE_FRESH', 10)
TIMEOUT_SCRAPE = get_cfg('TIMEOUT_SCRAPE', 12)
TIMEOUT_SCRAPE_JS = get_cfg('TIMEOUT_SCRAPE_JS', 15)
TIMEOUT_SUPABASE_RPC = get_cfg('TIMEOUT_SUPABASE_RPC', 30)
TIMEOUT_SEARCH = get_cfg('TIMEOUT_SEARCH', 25)

MAX_CONCURRENT_SCRAPES = get_cfg('MAX_CONCURRENT_SCRAPES', 10)
MAX_CONCURRENT_PLAYWRIGHT = get_cfg('MAX_CONCURRENT_PLAYWRIGHT', 3)
SEARCH_RESULTS_LIMIT = get_cfg('SEARCH_RESULTS_LIMIT', 50)
SEARCH_MIN_RESULTS = get_cfg('SEARCH_MIN_RESULTS', 5)

logger.info(f"[CONFIG] AI: DELAY={AI_DELAY}s COOLDOWN={PROVIDER_COOLDOWN_SECONDS}s")
logger.info(f"[CONFIG] Search: RESULTS_LIMIT={SEARCH_RESULTS_LIMIT} MIN_RESULTS={SEARCH_MIN_RESULTS}")
logger.info(f"[CONFIG] Scraping: CONCURRENT={MAX_CONCURRENT_SCRAPES} PLAYWRIGHT={MAX_CONCURRENT_PLAYWRIGHT}")
logger.info(f"[CONFIG] Buffer: RAW_BUFFER={RAW_BUFFER_THRESHOLD}")

GARBAGE_EMAIL_DOMAINS = set(load_txt_lines('garbage_email_domains.txt'))
SOCIAL_PLATFORMS = tuple(load_txt_lines('social_platforms.txt'))
SUBPAGE_PATHS = ['/' + p for p in load_txt_lines('subpage_paths.txt')]

# --- Global State ---
active_task = None
task_stop_event = asyncio.Event()
task_pause_event = asyncio.Event()
task_status = "idle" # idle, running, paused, cancelled, completed
task_run_id = None
verified_in_run = 0
provider_order = ['openrouter', 'groq', 'gemini']  # Default, overwritten at run
scrape_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)
playwright_semaphore = asyncio.Semaphore(MAX_CONCURRENT_PLAYWRIGHT)

# --- AI Provider Rate Limit Tracking ---
provider_cooldowns = {}  # {provider: timestamp_kiedy_dostepny}

async def get_provider_order_async():
    """Get provider order from ai_settings table (async version)"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/ai_settings?select=provider_order,updated_at&limit=1"
        async with httpx.AsyncClient(timeout=TIMEOUT_GET_PROVIDER) as client:
            r = await client.get(url, headers={'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'})
            if r.status_code == 200:
                data = r.json()
                if data:
                    order = data[0].get('provider_order', 'openrouter,groq,gemini')
                    return [p.strip().lower() for p in order.split(',') if p.strip()]
    except Exception as e:
        logger.error(f"Failed to load provider order: {e}")
    return ['openrouter', 'groq', 'gemini']

def is_provider_on_cooldown(provider: str) -> bool:
    """Check if provider is on cooldown"""
    if provider not in provider_cooldowns:
        return False
    if time.time() >= provider_cooldowns[provider]:
        del provider_cooldowns[provider]
        return False
    return True

def get_cooldown_remaining(provider: str) -> float:
    """Return seconds remaining until cooldown expires"""
    if provider not in provider_cooldowns:
        return 0
    remaining = provider_cooldowns[provider] - time.time()
    return max(0, remaining)

def set_provider_cooldown(provider: str):
    """Set provider on cooldown after 429"""
    provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_SECONDS
    logger.warning(f"[COOLDOWN] {provider} na {PROVIDER_COOLDOWN_SECONDS}s")

async def call_ai_provider(provider_name, prompt):
    """Wrapper for calling AI providers"""
    if provider_name not in AI_PROVIDERS:
        return 500, None, f"Unknown provider: {provider_name}"
    
    config = AI_PROVIDERS[provider_name]
    if not config['key']:
        return 500, None, f"Missing API key for {provider_name}"
    
    try:
        async with httpx.AsyncClient(timeout=config['timeout']) as client:
            if provider_name == 'gemini':
                url = config['endpoint'].format(model=config['model']) + f"?key={config['key']}"
                r = await client.post(url, json={
                    'contents': [{'parts': [{'text': prompt}]}],
                    'generationConfig': {'temperature': 0.1}
                })
                if r.status_code == 200:
                    data = r.json()
                    content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    return 200, content, None
                return r.status_code, None, r.text[:200]
            else:
                # OpenAI-style (OpenRouter, Groq)
                r = await client.post(
                    config['endpoint'],
                    headers={'Authorization': f'Bearer {config["key"]}', **config['headers']},
                    json={
                        'model': config['model'],
                        'messages': [
                            {'role': 'system', 'content': 'Odpowiadaj tylko JSON bez markdown.'},
                            {'role': 'user', 'content': prompt}
                        ],
                        'temperature': 0.1
                    }
                )
                if r.status_code == 200:
                    content = r.json()['choices'][0]['message']['content']
                    return 200, content, None
                return r.status_code, None, r.text[:200]
    except Exception as e:
        return 500, None, str(e)


# --- Clients ---
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

async def warmup_ai_providers():
    """Initial check at start of each Run (Zlecenie)"""
    logger.info("[WARMUP] Rozgrzewanie AI providerów (Hey)...")
    providers = await get_provider_order_async()
    
    for provider_name in providers:
        if provider_name not in AI_PROVIDERS:
            logger.warning(f"[WARMUP] ✗ {provider_name} - nieznany provider")
            continue
            
        status_code, content, error = await call_ai_provider(provider_name, "Hey, say only 'OK'")
        
        if status_code == 200:
            logger.info(f"[WARMUP] ✓ {provider_name} - OK")
        elif status_code == 429:
            set_provider_cooldown(provider_name)
            logger.warning(f"[WARMUP] ✗ {provider_name} - rate limited, cooldown {PROVIDER_COOLDOWN_SECONDS}s")
        else:
            logger.warning(f"[WARMUP] ✗ {provider_name} - error {status_code} {error}")
    
    logger.info("[WARMUP] Rozgrzewanie zakończone")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initial load at server start
    global provider_order
    provider_order = await get_provider_order_async()
    logger.info(f"[STARTUP] Provider order loaded: {provider_order}")
    yield

app.router.lifespan_context = lifespan

class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    
    async def insert(self, table, data):
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                r = await client.post(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data)
                return r.status_code in (200, 201)
            except: return False

    async def select(self, table, columns='*', filters=None, order=None, limit=None):
        async with httpx.AsyncClient(timeout=TIMEOUT_SUPABASE_RPC) as client:
            params = {'select': columns}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            if order: params['order'] = order
            if limit: params['limit'] = limit
            try:
                r = await client.get(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params)
                return r.json() if r.status_code == 200 else None
            except: return None

    async def update(self, table, data, filters):
        async with httpx.AsyncClient(timeout=30) as client:
            params = {}
            for k, v in filters.items(): params[k] = f'eq.{v}'
            try:
                r = await client.patch(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data, params=params)
                return r.status_code in (200, 204)
            except: return False

    async def delete(self, table, filters=None):
        async with httpx.AsyncClient(timeout=30) as client:
            params = {}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            try:
                r = await client.delete(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params)
                return r.status_code in (200, 204, 404)
            except: return False
    
    async def call_rpc(self, function_name, params=None):
        async with httpx.AsyncClient(timeout=TIMEOUT_SUPABASE_RPC) as client:
            headers = {**self.headers, 'Prefer': 'return=minimal'}
            try:
                r = await client.post(f'{self.url}/rest/v1/rpc/{function_name}', headers=headers, json=params or {})
                return r.status_code in (200, 201, 204)
            except: return False

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helpers ---
async def log_to_db(level, message):
    await supabase.insert('marketing_search_logs', {'level': level, 'message': message})
    logger.info(f"[{level.upper()}] {message}")

async def send_telegram(message: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID: return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage", json={'chat_id': TELEGRAM_CHAT_ID, 'text': message, 'parse_mode': 'HTML'})
    except: pass

# --- Core Logic: Search Layer (Producer) ---
async def fetch_next_target(run_id: str) -> Optional[tuple]:
    cities_data = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
    if not cities_data: return None
    cities = [c['name'] for c in cities_data]
    history_data = await supabase.select('marketing_search_queries_log', 'query_text')
    history = {h['query_text'] for h in history_data} if history_data else set()
    pool = []
    for city in cities:
        for role in ROLES:
            target_key = f"{role} | {city}"
            if target_key not in history: pool.append((city, role, target_key))
    if not pool:
        await log_to_db("warning", "Resetuję historię miast...")
        await supabase.call_rpc('truncate_marketing_queries_log')
        return await fetch_next_target(run_id)
    return random.choice(pool)

async def is_page_fresh(url: str, max_age_days: int = 730) -> bool:
    try:
        import email.utils
        async with httpx.AsyncClient(timeout=TIMEOUT_IS_PAGE_FRESH, follow_redirects=True) as client:
            r = await client.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            if r.status_code != 200: return True
            last_modified = r.headers.get('last-modified')
            if last_modified:
                date_tuple = email.utils.parsedate_tz(last_modified)
                if date_tuple:
                    last_ts = email.utils.mktime_tz(date_tuple)
                    if (time.time() - last_ts) / 86400 > max_age_days: return False
    except: pass
    return True

async def scrape_with_playwright(url: str, timeout: int = 15) -> tuple[str, str, str]:
    async with playwright_semaphore:
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(user_agent='Mozilla/5.0')
                try:
                    response = await page.goto(url, wait_until='networkidle', timeout=timeout * 1000)
                    if not response or response.status >= 400:
                        await browser.close()
                        return '', '', ''
                    await page.wait_for_timeout(2000)
                    res = (await page.title(), await page.inner_text('body'), await page.content())
                    await browser.close()
                    return res[0], res[1][:50000], res[2][:100000]
                except:
                    await browser.close()
                    return '', '', ''
        except: return '', '', ''

async def scrape_and_save_lead(res: dict, query: str, existing_emails: Set[str]):
    url = res.get('url', '').lower()
    if not url or not await is_page_fresh(url): return 0
    if any(d in url for d in BLOCKED_DOMAINS): return 0
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace('www.', '')
        if await supabase.select('marketing_verified_contacts', 'id', {'url': url}) or \
           await supabase.select('marketing_raw_contacts', 'id', {'url': url}): return 0
        if domain not in SOCIAL_PLATFORMS:
            if await supabase.select('marketing_verified_contacts', 'id', {'url': f'ilike.%{domain}%'}): return 0
        tld = domain.split('.')[-1]
        if len(tld) == 2 and tld not in ('pl', 'eu', 'io', 'me', 'co', 'tv'): return 0
    except: pass
    
    page_title = res.get('title', '')
    if any(k in page_title.lower() for k in NEGATIVE_KEYWORDS): return 0

    page_text, emails = '', set()
    
    def extract_content(text: str, title: str) -> tuple[str, str]:
        text = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.DOTALL|re.I)
        text = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.DOTALL|re.I)
        text = re.sub(r'<[^>]+>', ' ', text)
        clean = re.sub(r'\s+', ' ', text).strip()
        return title, clean[:2000]
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SCRAPE, follow_redirects=True, headers={'User-Agent': 'Mozilla/5.0'}) as client:
            r = await client.get(url)
            if r.status_code == 200:
                page_title, page_text = extract_content(r.text, page_title)
                for e in EMAIL_REGEX.findall(r.text):
                    if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS): emails.add(e)
            
            base = f"{parsed.scheme}://{parsed.netloc}"
            if domain not in SOCIAL_PLATFORMS:
                for path in SUBPAGE_PATHS:
                    try:
                        rc = await client.get(base + path)
                        if rc.status_code == 200:
                            for e in EMAIL_REGEX.findall(rc.text):
                                if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS): emails.add(e)
                    except: pass
        
        if (len(page_text) < 500 or not emails):
            pw_title, pw_text, pw_html = await scrape_with_playwright(url)
            if pw_text: page_text, page_title = pw_text[:2000], pw_title
            if pw_html:
                for e in EMAIL_REGEX.findall(pw_html):
                    if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS): emails.add(e)
    except: pass

    if not emails or not page_text: return 0
    email_list = [e.lower() for e in emails]
    ok = await supabase.insert('marketing_raw_contacts', {'url': url, 'title': page_title, 'page_text': page_text, 'emails_found': email_list, 'status': 'pending'})
    if ok: logger.info(f"[PRODUCER] Added: {url}"); return 1
    return 0

async def refill_raw_buffer(run_id: str):
    pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'}, limit=RAW_BUFFER_THRESHOLD)
    if pending and len(pending) >= RAW_BUFFER_THRESHOLD: return
    
    target = await fetch_next_target(run_id)
    if not target: return
    city, role, key = target
    logger.info(f"[PRODUCER] Target: {key}")
    
    all_results = []
    async with httpx.AsyncClient(timeout=TIMEOUT_SEARCH) as client:
        for template in SEARCH_TEMPLATES:
            try:
                r = await client.get(f'{SEARXNG_URL}/search', params={'q': template.format(city=city, role=role), 'format': 'json', 'language': 'pl-PL', 'limit': SEARCH_RESULTS_LIMIT})
                if r.status_code == 200: all_results.extend(r.json().get('results', []))
                await asyncio.sleep(1)
            except: pass

    if all_results:
        seen = set()
        unique = [r for r in all_results if r.get('url') and not (r.get('url').lower() in seen or seen.add(r.get('url').lower()))]
        tasks = [asyncio.create_task(scrape_and_save_lead(res, "batch", set())) for res in unique]
        await asyncio.gather(*tasks)

    await supabase.insert('marketing_search_queries_log', {'query_text': key, 'urls_found': len(all_results), 'status': 'completed'})

# --- Core Logic: AI Layer (Consumer) ---

async def verify_raw_lead(run_id: str, lead: dict, consumer_id: int = 0) -> Optional[dict]:
    """Tries available AI providers in order, handles errors and rate limits."""
    url, page_text = lead.get('url'), lead.get('page_text', '')
    emails = lead.get('emails_found', [])
    if isinstance(emails, str): emails = json.loads(emails)
    
    current_order = await get_provider_order_async()
    
    prompt_path = os.path.join(os.path.dirname(__file__), 'ai_prompt.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        prompt_template = ''.join([l for l in f.readlines() if not l.startswith('#')])
    
    prompt = prompt_template.format(url=url, title=lead.get('title',''), emails=', '.join(emails), text=page_text[:2000])

    for provider_name in current_order:
        if is_provider_on_cooldown(provider_name):
            logger.info(f"[C{consumer_id}] AI: {provider_name} na cooldown ({get_cooldown_remaining(provider_name):.0f}s)")
            continue
        
        logger.info(f"[C{consumer_id}] AI: {provider_name} → próba dla {url}")
        status_code, content, error = await call_ai_provider(provider_name, prompt)
        
        # Globalna zwłoka po KAŻDYM zapytaniu (niezależnie od wyniku)
        await asyncio.sleep(AI_DELAY)

        if status_code == 200:
            try:
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if not match: continue
                res = json.loads(match.group().replace("'", '"'))
                ok_val = res.get('ok', 0)
                email_match = re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', (res.get('email') or '').lower())
                return {
                    'is_organizer': ok_val in [1, True, '1', 'true', 'True'],
                    'best_email': res.get('email') if email_match else '',
                    'reason': res.get('reason', '')[:200],
                    'title': res.get('title', '')[:50],
                    'short_description': res.get('short_description', '')[:200]
                }
            except: continue
        
        elif status_code == 429:
            set_provider_cooldown(provider_name)
            logger.warning(f"[C{consumer_id}] AI: {provider_name} → RATE LIMIT, przełączam...")
            continue
        else:
            logger.error(f"[C{consumer_id}] AI: {provider_name} → BŁĄD {status_code}, przełączam...")
            continue
    
    return None # Żaden AI nie zadziałał

async def consumer_task(run_id: str, consumer_id: int, target: int):
    global verified_in_run, task_status
    logger.info(f"[C{consumer_id}] Consumer thread started.")
    
    consecutive_fatal_errors = 0 # Licznik błędów dla całego zlecenia

    while True:
        if task_status != "running" or task_run_id != run_id:
            if task_status in ("completed", "cancelled"): break
            await asyncio.sleep(1); continue
        
        if task_pause_event.is_set(): await asyncio.sleep(1); continue
        
        try:
            # Pobieramy JEDEN lead
            raw_leads = await supabase.select('marketing_raw_contacts', 'id,url,title,page_text,emails_found', {'status': 'pending'}, limit=1)
            if not raw_leads: await asyncio.sleep(2); continue
            
            lead = raw_leads[0]
            lead_id, lead_url = lead['id'], lead['url']
            
            # Blokada rekordu
            if not await supabase.update('marketing_raw_contacts', {'status': 'processing'}, {'id': lead_id, 'status': 'pending'}):
                continue
            
            result = await verify_raw_lead(run_id, lead, consumer_id)
            
            if result is None:
                # Żaden AI nie zadziałał (błędy/rate limity)
                consecutive_fatal_errors += 1
                logger.error(f"[C{consumer_id}] FAILED: Brak odpowiedzi od AI dla {lead_url} (Błąd {consecutive_fatal_errors}/3)")
                await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead_id})
                
                if consecutive_fatal_errors >= 3:
                    logger.critical(f"[C{consumer_id}] KILL SWITCH: 3 fatalne błędy z rzędu. Przerywam zlecenie.")
                    task_stop_event.set()
                    task_status = "cancelled"
                    break
                continue

            # Jeśli dostaliśmy JAKĄKOLWIEK odpowiedź od AI, zerujemy licznik błędów krytycznych
            consecutive_fatal_errors = 0
            
            if result['is_organizer'] and result['best_email']:
                await supabase.insert('marketing_verified_contacts', {
                    'title': result['title'] or lead.get('title'),
                    'email': result['best_email'],
                    'url': lead_url,
                    'short_description': result['short_description'],
                    'verify_reason': result['reason']
                })
                verified_in_run += 1
                logger.info(f"[C{consumer_id}] VERIFIED! ({verified_in_run}/{target})")
                await supabase.delete('marketing_raw_contacts', {'id': lead_id})
                
                if verified_in_run >= target:
                    task_stop_event.set()
                    task_status = "completed"
            else:
                await supabase.update('marketing_raw_contacts', {'status': 'rejected', 'reject_reason': result['reason'][:500]}, {'id': lead_id})
                logger.info(f"[C{consumer_id}] REJECTED: {result['reason'][:50]}")
                
        except Exception as e:
            logger.error(f"[C{consumer_id}] Loop error: {e}")
            await asyncio.sleep(1)

async def run_worker(run_id: str, target_count: int):
    global task_status, verified_in_run
    task_status = "running"
    verified_in_run = 0
    
    await warmup_ai_providers() # Rozgrzewka na początku ZLECENIA
    
    await supabase.call_rpc('clear_marketing_search_logs')
    await log_to_db("info", f"Start zlecenia: {target_count} leadów.")
    
    producer = asyncio.create_task(producer_task(run_id))
    consumers = [asyncio.create_task(consumer_task(run_id, i, target_count)) for i in range(NUM_CONSUMERS)]
    
    try:
        while not task_stop_event.is_set() and verified_in_run < target_count:
            await asyncio.sleep(1)
            if task_pause_event.is_set(): continue
        
        if verified_in_run >= target_count:
            task_status = "completed"
            await log_to_db("success", f"Zlecenie zakończone! ({verified_in_run})")
            await send_telegram(f"✅ Lead Finder: Zakończono ({verified_in_run})")
        elif task_status != "completed":
            task_status = "cancelled"
            await log_to_db("warning", "Zlecenie przerwane.")
    finally:
        producer.cancel()
        for c in consumers: c.cancel()
        await asyncio.gather(producer, *consumers, return_exceptions=True)

# --- API ---
@app.post("/api/search-runs")
async def start_run(target_count: int = 50):
    global active_task, task_run_id, task_status
    if task_status == "running": raise HTTPException(400, "Zlecenie już działa")
    task_run_id = str(uuid.uuid4())
    task_stop_event.clear()
    task_pause_event.clear()
    active_task = asyncio.create_task(run_worker(task_run_id, target_count))
    return {"ok": True, "run_id": task_run_id}

@app.post("/api/search-runs/{run_id}/pause")
async def pause_run(run_id: str):
    if task_run_id == run_id: task_pause_event.set(); task_status = "paused"
    return {"ok": True}

@app.post("/api/search-runs/{run_id}/resume")
async def resume_run(run_id: str):
    if task_run_id == run_id: task_pause_event.clear(); task_status = "running"
    return {"ok": True}

@app.post("/api/search-runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    if task_run_id == run_id: task_stop_event.set(); task_status = "cancelled"
    return {"ok": True}

@app.get("/api/search-runs/status")
async def get_status(): return {"status": task_status, "run_id": task_run_id, "verified": verified_in_run}

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

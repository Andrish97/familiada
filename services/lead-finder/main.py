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

AI_DELAY = get_cfg('AI_DELAY', 5)  # Wspólna zwłoka
PROVIDER_COOLDOWN_SECONDS = get_cfg('PROVIDER_COOLDOWN_SECONDS', 60)

TIMEOUT_GET_PROVIDER = get_cfg('TIMEOUT_GET_PROVIDER', 5)
TIMEOUT_IS_PAGE_FRESH = get_cfg('TIMEOUT_IS_PAGE_FRESH', 10)
TIMEOUT_SCRAPE = get_cfg('TIMEOUT_SCRAPE', 12)
TIMEOUT_SCRAPE_JS = get_cfg('TIMEOUT_SCRAPE_JS', 15)
TIMEOUT_SUPABASE_RPC = get_cfg('TIMEOUT_SUPABASE_RPC', 30)
TIMEOUT_SEARCH = get_cfg('TIMEOUT_SEARCH', 25)

SEARCH_RESULTS_LIMIT = get_cfg('SEARCH_RESULTS_LIMIT', 50)
SEARCH_MIN_RESULTS = get_cfg('SEARCH_MIN_RESULTS', 5)

logger.info(f"[CONFIG] AI: DELAY={AI_DELAY}s COOLDOWN={PROVIDER_COOLDOWN_SECONDS}s")
logger.info(f"[CONFIG] Search: RESULTS_LIMIT={SEARCH_RESULTS_LIMIT} MIN_RESULTS={SEARCH_MIN_RESULTS}")
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
provider_order = ['openrouter', 'groq', 'gemini']  # Loaded at startup

# --- AI Provider Rate Limit Tracking ---
provider_cooldowns = {}  # {provider: timestamp_kiedy_dostepny}

def get_provider_order():
    """Get provider order from ai_settings table (sync version for startup)"""
    import httpx
    try:
        url = f"{SUPABASE_URL}/rest/v1/ai_settings?select=provider_order,updated_at&limit=1"
        r = httpx.get(url, headers={'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'}, timeout=TIMEOUT_GET_PROVIDER)
        if r.status_code == 200:
            data = r.json()
            if data:
                order = data[0].get('provider_order', 'openrouter,groq,gemini')
                return [p.strip().lower() for p in order.split(',') if p.strip()]
    except Exception as e:
        logger.error(f"Failed to load provider order: {e}")
    return ['openrouter', 'groq', 'gemini']  # Default

def is_provider_on_cooldown(provider: str) -> bool:
    """Check if provider is on cooldown"""
    import time
    if provider not in provider_cooldowns:
        return False
    if time.time() >= provider_cooldowns[provider]:
        del provider_cooldowns[provider]
        return False
    return True

def get_cooldown_remaining(provider: str) -> float:
    """Return seconds remaining until cooldown expires"""
    import time
    if provider not in provider_cooldowns:
        return 0
    remaining = provider_cooldowns[provider] - time.time()
    return max(0, remaining)

def set_provider_cooldown(provider: str):
    """Set provider on cooldown after 429"""
    import time
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
    logger.info("[WARMUP] Rozgrzewanie AI providerów...")
    providers = get_provider_order()
    
    for provider_name in providers:
        if provider_name not in AI_PROVIDERS:
            logger.warning(f"[WARMUP] ✗ {provider_name} - nieznany provider")
            continue
            
        status_code, _, error = await call_ai_provider(provider_name, "say 'yes'")
        
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
    global provider_order
    provider_order = get_provider_order()
    logger.info(f"[STARTUP] Provider order loaded: {provider_order}")
    yield

app.router.lifespan_context = lifespan

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
                r = await client.get(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params, timeout=TIMEOUT_SUPABASE_RPC)
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
        async with httpx.AsyncClient(timeout=TIMEOUT_SUPABASE_RPC) as client:
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
        async with httpx.AsyncClient(timeout=TIMEOUT_SUPABASE_RPC) as client:
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
async def fetch_next_target(run_id: str) -> Optional[tuple]:
    """Finds a City+Role target that hasn't been 'swept' yet."""
    logger.info("[PRODUCER] fetch_next_target: start")
    cities_data = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
    if not cities_data: 
        logger.warning("[PRODUCER] fetch_next_target: brak miast w bazie")
        return None
    
    cities = [c['name'] for c in cities_data]
    history_data = await supabase.select('marketing_search_queries_log', 'query_text')
    history = {h['query_text'] for h in history_data} if history_data else set()
    logger.info(f"[PRODUCER] Miasta: {len(cities)}, Historia: {len(history)}")

    # Generate all possible targets: "Role | City"
    pool = []
    for city in cities:
        for role in ROLES:
            target_key = f"{role} | {city}"
            if target_key not in history:
                pool.append((city, role, target_key))

    if not pool:
        await log_to_db("warning", "Wszystkie miasta i role zostały sprawdzone. Resetuję historię...")
        await supabase.call_rpc('truncate_marketing_queries_log')
        return await fetch_next_target(run_id)
    
    # Pick one target to sweep
    city, role, key = random.choice(pool)
    return city, role, key

async def is_page_fresh(url: str, max_age_days: int = 730) -> bool:
    """Check if page was updated recently. Returns True if fresh or can't determine."""
    try:
        import email.utils
        async with httpx.AsyncClient(timeout=TIMEOUT_IS_PAGE_FRESH, follow_redirects=True) as client:
            r = await client.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            if r.status_code != 200: return True
            
            # Method 1: Last-Modified header
            last_modified = r.headers.get('last-modified')
            if last_modified:
                date_tuple = email.utils.parsedate_tz(last_modified)
                if date_tuple:
                    import time
                    last_ts = email.utils.mktime_tz(date_tuple)
                    age_days = (time.time() - last_ts) / 86400
                    if age_days > max_age_days:
                        return False
                    return True
            
            # Method 2: Check sitemap for this domain
            try:
                parsed = urlparse(url)
                sitemap_url = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
                sr = await client.get(sitemap_url, timeout=TIMEOUT_IS_PAGE_FRESH)
                if sr.status_code == 200:
                    sitemap_text = sr.text
                    url_in_sitemap = parsed.path
                    import re as re_module
                    url_match = re_module.search(r'<loc>[^<]*' + re_module.escape(url_in_sitemap) + r'[^<]*</loc>.*?<lastmod>([^<]+)</lastmod>', sitemap_text, re_module.I | re_module.DOTALL)
                    if url_match:
                        lastmod = url_match.group(1)
                        lastmod_parsed = email.utils.parsedate_tz(lastmod)
                        if lastmod_parsed:
                            import time
                            last_ts = email.utils.mktime_tz(lastmod_parsed)
                            age_days = (time.time() - last_ts) / 86400
                            if age_days > max_age_days:
                                return False
                            return True
            except: pass
            
            # Method 3: Meta tags (og:updated_time, article:modified_time)
            content = r.text
            og_updated = re.search(r'<meta[^>]*property=["\']og:updated_time["\'][^>]*content=["\']([^"\']+)["\']', content, re.I)
            if not og_updated:
                og_updated = re.search(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:updated_time["\']', content, re.I)
            if og_updated:
                try:
                    import time
                    ts = time.mktime(time.strptime(og_updated.group(1), '%Y-%m-%dT%H:%M:%S'))
                    age_days = (time.time() - ts) / 86400
                    if age_days > max_age_days:
                        return False
                    return True
                except: pass
            
            # Method 4: If-Modified-Since (conditional request)
            # Already fetched above, but we could use this for future checks
            
    except: pass
    return True

async def scrape_with_playwright(url: str, timeout: int = 15) -> tuple[str, str, str]:
    """
    Scrape page using Playwright (for JS-rendered sites).
    Returns: (title, text, html)
    """
    try:
        from playwright.async_api import async_playwright
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport={'width': 1280, 'height': 720}
            )
            page = await context.new_page()
            
            try:
                response = await page.goto(url, wait_until='networkidle', timeout=timeout * 1000)
                if not response or response.status >= 400:
                    await browser.close()
                    return '', '', ''
                
                await page.wait_for_timeout(2000)
                
                title = await page.title()
                text = await page.inner_text('body')
                html = await page.content()
                
                await browser.close()
                return title, text[:50000], html[:100000]
                
            except Exception as e:
                logger.debug(f"Playwright error for {url}: {e}")
                await browser.close()
                return '', '', ''
    except Exception as e:
        logger.debug(f"Playwright init error: {e}")
        return '', '', ''

async def scrape_and_save_lead(res: dict, query: str, existing_emails: Set[str]):
    """Scrapes a single search result and saves to raw_contacts if valid."""
    url = res.get('url', '').lower()
    if not url: return 0
    
    if not await is_page_fresh(url):
        logger.info(f"[PRODUCER] Za stara: {url}")
        return 0
    
    # 1. Block by domain keywords
    if any(d in url for d in BLOCKED_DOMAINS): return 0
    
    # 2. Block foreign country TLDs and check domain deduplication
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'): domain = domain[4:]

        # Deduplicate exact URL
        exists_v = await supabase.select('marketing_verified_contacts', 'id', {'url': url})
        exists_r = await supabase.select('marketing_raw_contacts', 'id', {'url': url})
        if exists_v or exists_r: return 0

        # Domain-level deduplication (check if any URL from this domain exists)
        root_domain = domain
        if root_domain not in SOCIAL_PLATFORMS:
            exists_dom_v = await supabase.select('marketing_verified_contacts', 'id', {'url': f'ilike.%{root_domain}%'})
            exists_dom_r = await supabase.select('marketing_raw_contacts', 'id', {'url': f'ilike.%{root_domain}%'})
            if (exists_dom_v and len(exists_dom_v) > 0) or (exists_dom_r and len(exists_dom_r) > 0):
                return 0

        tld = domain.split('.')[-1]
        allowed_2l = ('pl', 'eu', 'io', 'me', 'co', 'tv')
        if len(tld) == 2 and tld not in allowed_2l: return 0
    except: pass

    page_title = res.get('title', '')
    if any(k in page_title.lower() for k in NEGATIVE_KEYWORDS): return 0

    page_text = ''
    meta_desc = ''
    emails = set()
    
    def extract_content(text: str, title: str) -> tuple[str, str, str]:
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', text, re.I)
        if title_match and not title:
            title = title_match.group(1).strip()
        
        # Extract Meta Description
        m_match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', text, re.I)
        if not m_match:
            m_match = re.search(r'<meta[^>]*content=["\']([^"\']+)["\'] [^>]*name=["\']description["\']', text, re.I)
        m_desc = m_match.group(1).strip() if m_match else ''

        # Initial clean
        text = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.DOTALL | re.I)
        text = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.DOTALL | re.I)
        text = re.sub(r'<nav[^>]*>.*?</nav>', ' ', text, flags=re.DOTALL | re.I)
        text = re.sub(r'<footer[^>]*>.*?</footer>', ' ', text, flags=re.DOTALL | re.I)
        text = re.sub(r'<[^>]+>', ' ', text)
        
        # Filter junk lines
        junk_patterns = [
            r'cookies', r'polityka prywatności', r'wszelkie prawa zastrzeżone',
            r'zaloguj', r'rejestracja', r'szukaj', r'newsletter', r'sklep',
            r'koszyk', r'regulamin', r'mapa strony', r'autor projektu',
            r'ta strona korzysta', r'używamy plików', r'wyrażam zgodę'
        ]
        
        lines = []
        for line in text.split('\n'):
            line = line.strip()
            if not line or len(line) < 20: continue # Skip short fragments (menus)
            if any(re.search(p, line, re.I) for p in junk_patterns): continue
            lines.append(line)
            
        clean_text = ' '.join(lines)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
        words = clean_text.split()
        words = [w for w in words if len(w) > 2 and not w.startswith('http')]
        
        return title, ' '.join(words)[:1500], m_desc
    
    try:
        parsed = urlparse(url)
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        async with httpx.AsyncClient(timeout=TIMEOUT_SCRAPE, follow_redirects=True, headers=headers) as client:
            r_crawl = await client.get(url)
            if r_crawl.status_code == 200:
                text = r_crawl.text[:50000]
                page_title, page_text, meta_desc = extract_content(text, page_title)
                
                if any(k in page_title.lower() for k in NEGATIVE_KEYWORDS): return 0

                if meta_desc: page_text = f"DESC: {meta_desc} | TEXT: {page_text}"

                found_emails = EMAIL_REGEX.findall(text)
                for e in found_emails:
                    if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                        emails.add(e)
            
            base = f"{parsed.scheme}://{parsed.netloc}"
            if parsed.netloc.lower().replace('www.', '') not in SOCIAL_PLATFORMS:
                for path in SUBPAGE_PATHS:
                    contact_url = base + path
                    if contact_url.rstrip('/') == url.rstrip('/'): continue
                    
                    try:
                        r_contact = await client.get(contact_url)
                        if r_contact.status_code == 200:
                            found = EMAIL_REGEX.findall(r_contact.text[:30000])
                            for e in found:
                                if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                                    emails.add(e)
                            
                            if len(page_text) < 1000:
                                _, c_text, _ = extract_content(r_contact.text[:20000], "")
                                if c_text:
                                    page_text += f" | CONTACT_PAGE ({path}): {c_text[:800]}"
                    except: pass
        
        thin_content = len(page_text) < 500 or not found_emails
        js_indicators = ['__NEXT_DATA__', '__NUXT__', '__nuxt', '__wp__', 'gatsby-', 'gatsby-', 'react-root', 'data-reactroot', 'ng-app', 'ng-version', 'ng-version', 'v-app', 'data-v-', 'wp-footer', 'div id="app"']
        has_js_framework = any(ind in text for ind in js_indicators)
        
        if (thin_content or has_js_framework) and not emails:
            logger.info(f"[PRODUCER] Playwright: {url} (thin={thin_content}, js_framework={has_js_framework})")
            pw_title, pw_text, pw_html = await scrape_with_playwright(url)
            if pw_title:
                page_title = pw_title
                if any(k in page_title.lower() for k in NEGATIVE_KEYWORDS): return 0
            if pw_text:
                page_text = pw_text[:1500]
            if pw_html:
                pw_emails = EMAIL_REGEX.findall(pw_html)
                for e in pw_emails:
                    if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS):
                        emails.add(e)
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
    """Producer: Search for new contacts - no buffer limit"""
    logger.info("[PRODUCER] refill_raw_buffer: start")
    
    # Skip if too many pending already (but allow some)
    pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'})
    if pending and len(pending) > 100:
        logger.info(f"[PRODUCER] Too many pending ({len(pending)}), waiting...")
        return
    
    logger.info("[PRODUCER] Pobieram next target...")
    target = await fetch_next_target(run_id)
    if not target: 
        logger.warning("[PRODUCER] Brak targetu")
        return
    city_name, role_name, target_key = target
    logger.info(f"[PRODUCER] Target: {target_key}")
    
    all_results = []
    logger.info(f"[PRODUCER] Szukam z {len(SEARCH_TEMPLATES)} szablonami...")
    async with httpx.AsyncClient(timeout=TIMEOUT_SEARCH) as client:
        for template in SEARCH_TEMPLATES:
            query = template.format(city=city_name, role=role_name)
            try:
                logger.info(f"[PRODUCER] SearXNG query: {query}")
                r = await client.get(f'{SEARXNG_URL}/search', params={
                    'q': query, 'format': 'json', 'language': 'pl-PL', 'region': 'pl-PL', 'limit': SEARCH_RESULTS_LIMIT
                })
                logger.info(f"[PRODUCER] SearXNG response: {r.status_code}")
                if r.status_code == 200:
                    results = r.json().get('results', [])
                    logger.info(f"[PRODUCER] Wyników: {len(results)}")
                    if len(results) < SEARCH_MIN_RESULTS:
                        logger.warning(f"[SEARCH] Mało wyników ({len(results)}) dla: {query}")
                    all_results.extend(results)
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Search error for {query}: {e}")

    if all_results:
        unique_results = []
        seen_urls = set()
        for res in all_results:
            u = res.get('url', '').lower()
            if u and u not in seen_urls:
                seen_urls.add(u)
                unique_results.append(res)

        verified_contacts = await supabase.select('marketing_verified_contacts', 'email')
        raw_contacts = await supabase.select('marketing_raw_contacts', 'emails_found')
        existing_emails = {v['email'].lower() for v in (verified_contacts or []) if v.get('email')}
        for r in (raw_contacts or []):
            raw_list = r.get('emails_found', [])
            if isinstance(raw_list, str):
                try: raw_list = json.loads(raw_list)
                except: raw_list = []
            for e in raw_list: existing_emails.add(e.lower())

        tasks = [scrape_and_save_lead(res, "batch", existing_emails) for res in unique_results]
        new_counts = await asyncio.gather(*tasks)
        total_new = sum(new_counts)
        if total_new > 0:
            await log_to_db("success", f"Deep Sweep ({role_name} | {city_name}) zakończony. Dodano {total_new} kontaktów.")

    await supabase.insert('marketing_search_queries_log', {
        'query_text': target_key,
        'urls_found': len(all_results),
        'status': 'completed'
    })
    await log_to_db("info", f"[DONE] {target_key}")

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
    
    current_order = get_provider_order()
    logger.info(f"[C{consumer_id}] Weryfikuję: {url}")
    
    prompt_path = os.path.join(os.path.dirname(__file__), 'ai_prompt.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        lines = [l for l in f.readlines() if not l.startswith('#')]
        prompt_template = ''.join(lines)
    
    emails_str = ', '.join(emails) if emails else 'brak'
    text_str = page_text[:2000] if page_text else 'brak'
    title_str = (title or 'brak')[:200]
    
    try:
        prompt = prompt_template.format(
            url=url,
            title=title_str,
            emails=emails_str,
            text=text_str
        )
    except Exception as e:
        logger.error(f"[C{consumer_id}] Prompt format error: {e}")
        return None

    # Try providers in order from settings
    for provider_name in current_order:
        # 1. Sprawdź cooldown
        if is_provider_on_cooldown(provider_name):
            remaining = get_cooldown_remaining(provider_name)
            logger.info(f"[C{consumer_id}] AI: {provider_name} → pomijam, cooldown {remaining:.0f}s")
            continue
        
        # 2. Wywołaj AI
        status_code, content, error = await call_ai_provider(provider_name, prompt)
        
        # 3. Obsłuż wynik
        if status_code == 200:
            logger.info(f"[C{consumer_id}] AI: {provider_name} → 200 OK")
            try:
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if not match:
                    logger.warning(f"[C{consumer_id}] AI: {provider_name} → brak JSON w odpowiedzi")
                    await asyncio.sleep(AI_DELAY)
                    continue
                
                res = json.loads(match.group().replace("'", '"'))
                ok_val = res.get('ok', 0)
                is_organizer = ok_val in [1, True, '1', 'true', 'True']
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
                logger.error(f"[C{consumer_id}] AI: {provider_name} → parse error: {e}")
        
        elif status_code == 429:
            set_provider_cooldown(provider_name)
            remaining = get_cooldown_remaining(provider_name)
            logger.warning(f"[C{consumer_id}] AI: {provider_name} → 429 cooldown {remaining:.0f}s, próbuję następny")
        else:
            logger.error(f"[C{consumer_id}] AI: {provider_name} → {status_code} {error}")
        
        # 4. Po każdym zapytaniu czekaj AI_DELAY
        await asyncio.sleep(AI_DELAY)
    
    logger.error(f"[C{consumer_id}] Żaden AI nie zadziałał dla {url}")
    return None

# --- Main Task Loop ---
NUM_CONSUMERS = 1

async def producer_task(run_id: str):
    """Producer: Searches for new raw contacts continuously"""
    while task_status == "running" and task_run_id == run_id:
        try:
            # No buffer limit - just keep searching
            logger.info(f"[PRODUCER] Searching for new leads...")
            await refill_raw_buffer(run_id)
        except Exception as e:
            logger.error(f"Producer error: {e}")
        await asyncio.sleep(5)

async def consumer_task(run_id: str, consumer_id: int, target: int):
    """Consumer: Continuously verifies raw contacts"""
    global verified_in_run
    logger.info(f"[C{consumer_id}] Consumer started for run {run_id}")
    
    while True:
        if task_status != "running" or task_run_id != run_id:
            logger.info(f"[C{consumer_id}] Breaking: status={task_status}, run_id={task_run_id}")
            break
        
        if task_pause_event.is_set():
            await asyncio.sleep(1)
            continue
        
        try:
            logger.info(f"[C{consumer_id}] Querying for pending leads...")
            raw_leads = await supabase.select('marketing_raw_contacts', '*', {'status': 'pending'}, limit=5)
            logger.info(f"[C{consumer_id}] Found {len(raw_leads) if raw_leads else 0} pending leads")
            
            if not raw_leads or len(raw_leads) == 0:
                logger.info(f"[C{consumer_id}] No pending leads, waiting...")
                await asyncio.sleep(2)
                continue
            
            lead = raw_leads[0]
            lead_id = lead['id']
            lead_url = lead.get('url')
            logger.info(f"[C{consumer_id}] Processing lead: {lead_url}")
            
            await supabase.update('marketing_raw_contacts', {'status': 'processing'}, {'id': lead_id, 'status': 'pending'})
            
            logger.info(f"[C{consumer_id}] Calling AI for: {lead_url}")
            result = await verify_raw_lead(run_id, lead, consumer_id)
            logger.info(f"[C{consumer_id}] AI result: {result.get('is_event_organizer') if result else 'None'}")
            
            if task_status not in ("running", "paused") or task_run_id != run_id:
                break
            
            if result is None:
                logger.error(f"[C{consumer_id}] AI failed - aborting")
                task_stop_event.set()
                task_status = "cancelled"
                break
            elif result.get('is_event_organizer') and result.get('best_email'):
                await supabase.insert('marketing_verified_contacts', {
                    'title': result.get('title') or lead.get('title'),
                    'email': result['best_email'],
                    'url': result.get('url') or lead_url,
                    'short_description': result.get('short_description', '')[:200],
                    'verify_reason': result.get('reason', '')[:500]
                })
                verified_in_run += 1
                logger.info(f"[C{consumer_id}] Verified! ({verified_in_run}/{target})")
                await supabase.delete('marketing_raw_contacts', {'id': lead_id})
                
                if verified_in_run >= target:
                    logger.info(f"[C{consumer_id}] TARGET REACHED! Stopping...")
                    task_stop_event.set()
                    task_status = "completed"
            else:
                reason = result.get('reason') or 'Not organizer'
                await supabase.update('marketing_raw_contacts', {'status': 'rejected', 'reject_reason': reason[:500]}, {'id': lead_id})
                logger.info(f"[C{consumer_id}] Rejected: {reason[:50]}")
                
        except Exception as e:
            logger.error(f"[C{consumer_id}] Error: {e}")
            await asyncio.sleep(1)
    
    logger.info(f"[C{consumer_id}] Consumer finished")

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
    
    # Warmup AI before starting job
    await warmup_ai_providers()
    
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

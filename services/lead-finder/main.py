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
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright

# --- Logger ---
logger = logging.getLogger("lead_finder")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(_handler)

# --- Configuration ---
SEARXNG_URL = "http://searxng:8080"
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

# --- Helper functions ---
def load_txt_lines(filename):
    path = os.path.join(os.path.dirname(__file__), filename)
    if not os.path.exists(path): return []
    with open(path, 'r', encoding='utf-8') as f:
        # Lowercase for better matching
        return [l.strip().lower() for l in f if l.strip() and not l.startswith('#')]

def load_config():
    path = os.path.join(os.path.dirname(__file__), 'config.txt')
    config = {}
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and '=' in line and not line.startswith('#'):
                    key, val = line.split('=', 1)
                    val = val.strip().split('#')[0].strip()
                    try: config[key.strip()] = int(val)
                    except: config[key.strip()] = val.strip()
    return config

CONFIG = load_config()
ROLES = load_txt_lines('roles.txt')
SEARCH_TEMPLATES = load_txt_lines('templates.txt')
NEGATIVE_KEYWORDS = load_txt_lines('negative_keywords.txt')
BLOCKED_DOMAINS = load_txt_lines('blocked_domains.txt')
GARBAGE_EMAIL_DOMAINS = set(load_txt_lines('garbage_email_domains.txt'))
SOCIAL_PLATFORMS = tuple(load_txt_lines('social_platforms.txt'))
SUBPAGE_PATHS = ['/' + p for p in load_txt_lines('subpage_paths.txt')]

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
RAW_BUFFER_THRESHOLD = CONFIG.get('RAW_BUFFER_THRESHOLD', 20)
AI_DELAY = CONFIG.get('AI_DELAY', 5) 
PROVIDER_COOLDOWN_SECONDS = int(CONFIG.get('PROVIDER_COOLDOWN_SECONDS', 60))
TIMEOUT_SUPABASE_RPC = 30
TIMEOUT_SEARCH = 25
TIMEOUT_SCRAPE = 12
TIMEOUT_SCRAPE_JS = 15

# --- Global State ---
task_status = "idle" 
task_run_id = None
verified_in_run = 0
provider_cooldowns = {} 
scrape_semaphore = asyncio.Semaphore(10)
playwright_semaphore = asyncio.Semaphore(3)

# --- AI & DB Helpers ---

async def get_provider_order_async():
    try:
        url = f"{SUPABASE_URL}/rest/v1/ai_settings?select=provider_order&limit=1"
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url, headers={'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'})
            if r.status_code == 200 and r.json():
                return [p.strip().lower() for p in r.json()[0]['provider_order'].split(',') if p.strip()]
    except: pass
    return ['openrouter', 'groq', 'gemini']

def is_provider_on_cooldown(provider):
    if provider in provider_cooldowns and time.time() < provider_cooldowns[provider]:
        return True
    if provider in provider_cooldowns: del provider_cooldowns[provider]
    return False

def set_provider_cooldown(provider):
    provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_SECONDS

async def call_ai_provider(name, prompt):
    cfg = AI_PROVIDERS.get(name)
    if not cfg or not cfg['key']: return 500, None, "Missing config"
    try:
        async with httpx.AsyncClient(timeout=cfg['timeout']) as client:
            if name == 'gemini':
                url = cfg['endpoint'].format(model=cfg['model']) + f"?key={cfg['key']}"
                r = await client.post(url, json={'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0.1}})
                if r.status_code == 200:
                    text = r.json().get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    return 200, text, None
            else:
                r = await client.post(cfg['endpoint'], headers={'Authorization': f'Bearer {cfg["key"]}', **cfg['headers']},
                    json={'model': cfg['model'], 'messages': [{'role': 'system', 'content': 'Odpowiadaj tylko JSON.'}, {'role': 'user', 'content': prompt}], 'temperature': 0.1})
                if r.status_code == 200:
                    return 200, r.json()['choices'][0]['message']['content'], None
            return r.status_code, None, r.text[:100]
    except Exception as e: return 500, None, str(e)

class SupabaseClient:
    def __init__(self, url, key):
        self.url, self.headers = url, {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    
    async def insert(self, table, data):
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data)
            if r.status_code not in (200, 201):
                logger.error(f"[SUPABASE INSERT ERROR] {table}: {r.status_code} - {r.text[:200]}")
            return r.status_code in (200, 201)

    async def select(self, table, columns='*', filters=None, limit=None):
        async with httpx.AsyncClient(timeout=30) as client:
            params = {'select': columns}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            if limit: params['limit'] = limit
            r = await client.get(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params)
            return r.json() if r.status_code == 200 else None

    async def update(self, table, data, filters):
        async with httpx.AsyncClient(timeout=30) as client:
            params = {k: f'eq.{v}' for k, v in filters.items()}
            r = await client.patch(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data, params=params)
            return r.status_code in (200, 204)

    async def delete(self, table, filters=None):
        async with httpx.AsyncClient(timeout=30) as client:
            params = {k: f'eq.{v}' for k, v in filters.items()} if filters else {}
            r = await client.delete(f'{self.url}/rest/v1/{table}', headers=self.headers, params=params)
            if r.status_code not in (200, 204, 404):
                logger.error(f"[SUPABASE DELETE ERROR] {table}: {r.status_code} - {r.text[:200]}")
            return r.status_code in (200, 204, 404)
    
    async def call_rpc(self, fn, params=None):
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f'{self.url}/rest/v1/rpc/{fn}', headers=self.headers, json=params or {})
            if r.status_code in (200, 201):
                return r.json()
            elif r.status_code == 204:
                return True
            return None

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Core Logic ---

def extract_emails(html):
    found = set()
    # Filter for common non-email matches (like SVG paths or images)
    EXCLUDED_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.zip', '.js', '.css', '.webp', '.woff', '.woff2')
    for e in EMAIL_REGEX.findall(html):
        e_low = e.lower()
        if any(e_low.endswith(ext) for ext in EXCLUDED_EXT): continue
        if not any(g in e_low for g in GARBAGE_EMAIL_DOMAINS):
            found.add(e)
    return found

async def scrape_with_playwright(url):
    async with playwright_semaphore:
        logger.info(f"[SCRAPE JS] {url}")
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                page = await context.new_page()
                try:
                    await page.goto(url, timeout=TIMEOUT_SCRAPE_JS * 1000, wait_until="networkidle")
                except: pass 
                
                content = await page.content()
                text = await page.evaluate("() => document.body.innerText")
                await browser.close()
                return text[:5000], extract_emails(content)
        except Exception as e:
            logger.error(f"[PLAYWRIGHT ERROR] {url}: {e}")
            return None, None

async def scrape_and_save_lead(res):
    url = res.get('url', '').lower()
    if not url: return 0
    
    # 1. Blocked domains filter
    domain = urlparse(url).netloc.lower()
    if any(b in domain for b in BLOCKED_DOMAINS):
        return 0
    
    # 2. Title-based filter
    title_low = res.get('title', '').lower()
    if any(k in title_low for k in NEGATIVE_KEYWORDS):
        return 0
    
    try:
        # 3. Deduplication
        if await supabase.select('marketing_verified_contacts', 'id', {'url': url}) or \
           await supabase.select('marketing_raw_contacts', 'id', {'url': url}): return 0
    except: return 0
    
    page_text, emails = '', set()
    async with scrape_semaphore:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SCRAPE, follow_redirects=True, headers={'User-Agent': 'Mozilla/5.0'}) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    page_text = re.sub(r'<[^>]+>', ' ', r.text)[:2000]
                    emails = extract_emails(r.text)
                    
                    if not any(s in url for s in SOCIAL_PLATFORMS) and not emails:
                        for path in SUBPAGE_PATHS:
                            sub_url = url.rstrip('/') + path
                            try:
                                r_sub = await client.get(sub_url, timeout=5)
                                if r_sub.status_code == 200:
                                    emails.update(extract_emails(r_sub.text))
                                    if emails: break
                            except: continue
        except: pass

    # 4. Heavy Scraping (Playwright) - ONLY for business/relevant domains
    is_pl_domain = domain.endswith('.pl') or '.pl/' in url
    is_social = any(s in domain for s in SOCIAL_PLATFORMS)
    is_likely_business = any(k in title_low for k in ['dj', 'wodzirej', 'zespół', 'oprawa', 'atrakcje', 'organizacja', 'event'])
    
    # Playwright on Social Media is usually blocked or overkill, skip it for them
    if (not emails or not page_text) and not is_social and (is_pl_domain or is_likely_business):
        pw_text, pw_emails = await scrape_with_playwright(url)
        if pw_text: page_text = pw_text[:2000]
        if pw_emails: emails.update(pw_emails)

    if not emails or not page_text: return 0
    
    # 5. Content-based negative keywords filter
    text_low = page_text.lower()
    if any(k in text_low for k in NEGATIVE_KEYWORDS):
        logger.info(f"[PRODUCER] Rejected by keyword: {url}")
        return 0

    ok = await supabase.insert('marketing_raw_contacts', {
        'url': url, 
        'title': res.get('title',''), 
        'page_text': page_text, 
        'emails_found': list(emails), 
        'status': 'pending'
    })
    if ok: 
        logger.info(f"[PRODUCER] Added: {url}")
        return 1
    return 0

async def producer_task(run_id):
    while task_status == "running" and task_run_id == run_id:
        pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'}, limit=RAW_BUFFER_THRESHOLD)
        if not pending or len(pending) < RAW_BUFFER_THRESHOLD:
            cities = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
            if cities:
                city, role = random.choice(cities)['name'], random.choice(ROLES)
                logger.info(f"[PRODUCER] Target: {role} | {city}")
                try:
                    async with httpx.AsyncClient(timeout=TIMEOUT_SEARCH) as client:
                        r = await client.get(f'{SEARXNG_URL}/search', params={'q': f'{role} {city}', 'format': 'json', 'language': 'pl-PL'})
                        if r.status_code == 200:
                            results = r.json().get('results', [])
                            for res in results: 
                                if task_status != "running": break
                                await scrape_and_save_lead(res)
                except Exception as e:
                    logger.error(f"[PRODUCER ERROR] Search failed: {e}")
        await asyncio.sleep(15)

async def verify_raw_lead(lead, c_id):
    url, page_text, emails = lead['url'], lead['page_text'], lead['emails_found']
    order = await get_provider_order_async()
    
    # Enhanced prompt to avoid false positives (movies, databases)
    prompt = (
        f"URL: {url}\nEmails: {emails}\nContent: {page_text[:2000]}\n"
        "ZADANIE: Sprawdź czy to jest strona BIZNESU oferującego oprawę imprez (Wodzirej, DJ, Zespół, Firma Eventowa).\n"
        "KRYTYCZNE ZASADY:\n"
        "1. ODRZUĆ (ok: 0) bazy filmów (np. filmpolski, fdb, filmweb, imdb) - interesują nas realne firmy, a nie filmy fabularne.\n"
        "2. ODRZUĆ (ok: 0) artykuły prasowe, Wikipedie, blogi o historii.\n"
        "3. ODRZUĆ (ok: 0) urzędy, szkoły, parafie, gazownie.\n"
        "4. AKCEPTUJ (ok: 1) tylko jeśli widzisz ofertę usług na imprezy/wesela.\n"
        "Odpowiedz TYLKO JSON: {'ok': 1/0, 'email': 'najbardziej sensowny mail', 'reason': 'dlaczego tak/nie (krótko)'}"
    )

    for provider in order:
        if is_provider_on_cooldown(provider): continue
        logger.info(f"[C{c_id}] AI: {provider} → {url}")
        status, content, err = await call_ai_provider(provider, prompt)
        
        if status == 200:
            try:
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if not match: continue
                res = json.loads(match.group().replace("'", '"'))
                logger.info(f"[C{c_id}] AI response: {res}")
                await asyncio.sleep(AI_DELAY)
                return res
            except Exception as e:
                logger.error(f"[C{c_id}] AI parsing error: {e}")
                continue
        elif status == 429: 
            logger.warning(f"[C{c_id}] AI: {provider} → Rate Limit (429)")
            set_provider_cooldown(provider)
        else:
            logger.warning(f"[C{c_id}] AI: {provider} → Error {status}: {err}")
    
    return None

async def consumer_task(run_id, c_id, target):
    global verified_in_run, task_status
    logger.info(f"[C{c_id}] Consumer thread started.")
    consecutive_errors = 0
    
    while task_run_id == run_id:
        if task_status != "running" or verified_in_run >= target:
            break
        
        # ATOMIC CLAIM via RPC
        result = await supabase.call_rpc('claim_next_pending_lead')
        if not result or not isinstance(result, list) or len(result) == 0:
            await asyncio.sleep(5); continue
        
        lead = result[0]
        # RE-CHECK TARGET after claiming to avoid overshoot
        if verified_in_run >= target:
            await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead['id']})
            break

        logger.info(f"[C{c_id}] Got lead: {lead['url']} | emails: {lead.get('emails_found',[])}")
        
        res = await verify_raw_lead(lead, c_id)
        if res is None:
            consecutive_errors += 1
            logger.error(f"[C{c_id}] AI failed for {lead['url']}. Errors: {consecutive_errors}/3")
            await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead['id']})
            if consecutive_errors >= 3:
                logger.critical(f"[C{c_id}] KILL SWITCH! 3 consecutive AI failures."); task_status = "cancelled"; break
            continue
        
        consecutive_errors = 0
        if res.get('ok') and res.get('email'):
            email = str(res['email']).strip().lower()
            if not await supabase.select('marketing_verified_contacts', 'id', {'email': email}):
                await supabase.insert('marketing_verified_contacts', {
                    'email': email, 
                    'url': lead['url'], 
                    'verify_reason': res.get('reason','')[:500]
                })
                verified_in_run += 1
                logger.info(f"[C{c_id}] VERIFIED! ({verified_in_run}/{target}) - {email}")
            
            await supabase.delete('marketing_raw_contacts', {'id': lead['id']})
            if verified_in_run >= target: 
                task_status = "completed"
                logger.info("[CONSUMER] Target reached.")
                break
        else:
            await supabase.update('marketing_raw_contacts', {
                'status': 'rejected', 
                'reject_reason': res.get('reason','')[:500]
            }, {'id': lead['id']})
            logger.info(f"[C{c_id}] REJECTED: {res.get('reason','')[:100]}")

async def warmup_ai_providers():
    logger.info("[WARMUP] Checking AI providers (Hey)...")
    order = await get_provider_order_async()
    for p in order:
        status, content, err = await call_ai_provider(p, "Hey, reply only OK")
        if status == 200: logger.info(f"[WARMUP] ✓ {p} - OK")
        else: 
            set_provider_cooldown(p)
            logger.warning(f"[WARMUP] ✗ {p} - Error/Limited {status}")

async def run_worker(run_id, target):
    global task_status, verified_in_run
    task_status = "running"
    verified_in_run = 0
    await warmup_ai_providers()
    
    p_task = asyncio.create_task(producer_task(run_id))
    c_tasks = [asyncio.create_task(consumer_task(run_id, i, target)) for i in range(3)]
    
    while task_status == "running" and verified_in_run < target:
        await asyncio.sleep(1)
    
    p_task.cancel()
    for c in c_tasks: c.cancel()
    if task_status == "running": task_status = "completed"

# --- API ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/search-runs")
async def start(target_count: int = 50):
    global task_run_id, task_status
    if task_status == "running": raise HTTPException(400, "Active")
    task_run_id = str(uuid.uuid4())
    asyncio.create_task(run_worker(task_run_id, target_count))
    return {"ok": True, "run_id": task_run_id}

@app.get("/api/search-runs/status")
async def status(): return {"status": task_status, "run_id": task_run_id, "verified": verified_in_run}

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

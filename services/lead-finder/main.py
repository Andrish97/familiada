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
                    try: config[key.strip()] = int(val.strip())
                    except: config[key.strip()] = val.strip()
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

AI_DELAY = get_cfg('AI_DELAY', 12)  # Zwiększona zwłoka dla wszystkich AI
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

GARBAGE_EMAIL_DOMAINS = set(load_txt_lines('garbage_email_domains.txt'))
SOCIAL_PLATFORMS = tuple(load_txt_lines('social_platforms.txt'))
SUBPAGE_PATHS = ['/' + p for p in load_txt_lines('subpage_paths.txt')]

# --- Global State ---
active_task = None
task_stop_event = asyncio.Event()
task_pause_event = asyncio.Event()
task_status = "idle" 
task_run_id = None
verified_in_run = 0
provider_order = ['openrouter', 'groq', 'gemini']
scrape_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)
playwright_semaphore = asyncio.Semaphore(MAX_CONCURRENT_PLAYWRIGHT)
provider_cooldowns = {} 

# --- AI Helpers ---

async def get_provider_order_async():
    try:
        url = f"{SUPABASE_URL}/rest/v1/ai_settings?select=provider_order&limit=1"
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
    if provider not in provider_cooldowns: return False
    if time.time() >= provider_cooldowns[provider]:
        del provider_cooldowns[provider]
        return False
    return True

def set_provider_cooldown(provider: str):
    provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_SECONDS
    logger.warning(f"[COOLDOWN] {provider} na {PROVIDER_COOLDOWN_SECONDS}s")

async def call_ai_provider(provider_name, prompt):
    if provider_name not in AI_PROVIDERS: return 500, None, "Unknown"
    config = AI_PROVIDERS[provider_name]
    if not config['key']: return 500, None, "No API Key"
    try:
        async with httpx.AsyncClient(timeout=config['timeout']) as client:
            if provider_name == 'gemini':
                url = config['endpoint'].format(model=config['model']) + f"?key={config['key']}"
                r = await client.post(url, json={'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0.1}})
                if r.status_code == 200:
                    data = r.json()
                    content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    return 200, content, None
                return r.status_code, None, r.text[:200]
            else:
                r = await client.post(config['endpoint'], headers={'Authorization': f'Bearer {config["key"]}', **config['headers']},
                    json={'model': config['model'], 'messages': [{'role': 'system', 'content': 'Odpowiadaj tylko JSON.'}, {'role': 'user', 'content': prompt}], 'temperature': 0.1})
                if r.status_code == 200:
                    return 200, r.json()['choices'][0]['message']['content'], None
                return r.status_code, None, r.text[:200]
    except Exception as e: return 500, None, str(e)

# --- DB Client ---

class SupabaseClient:
    def __init__(self, url, key):
        self.url, self.headers = url, {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    
    async def insert(self, table, data):
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f'{self.url}/rest/v1/{table}', headers=self.headers, json=data)
            return r.status_code in (200, 201)

    async def select(self, table, columns='*', filters=None, order=None, limit=None):
        async with httpx.AsyncClient(timeout=TIMEOUT_SUPABASE_RPC) as client:
            params = {'select': columns}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            if order: params['order'] = order
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
            return r.status_code in (200, 204, 404)
    
    async def call_rpc(self, fn, params=None):
        async with httpx.AsyncClient(timeout=TIMEOUT_SUPABASE_RPC) as client:
            r = await client.post(f'{self.url}/rest/v1/rpc/{fn}', headers={**self.headers, 'Prefer': 'return=minimal'}, json=params or {})
            return r.status_code in (200, 201, 204)

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Core Logic ---

async def scrape_and_save_lead(res, query, existing_emails):
    url = res.get('url', '').lower()
    if not url: return 0
    try:
        domain = urlparse(url).netloc.lower().replace('www.', '')
        if await supabase.select('marketing_verified_contacts', 'id', {'url': url}) or await supabase.select('marketing_raw_contacts', 'id', {'url': url}): return 0
    except: return 0
    
    page_text, emails = '', set()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SCRAPE, follow_redirects=True, headers={'User-Agent': 'Mozilla/5.0'}) as client:
            r = await client.get(url)
            if r.status_code == 200:
                page_text = re.sub(r'<[^>]+>', ' ', r.text)[:2000]
                for e in EMAIL_REGEX.findall(r.text):
                    if not any(g in e.lower() for g in GARBAGE_EMAIL_DOMAINS): emails.add(e)
    except: pass

    if not emails or not page_text: return 0
    ok = await supabase.insert('marketing_raw_contacts', {'url': url, 'title': res.get('title',''), 'page_text': page_text, 'emails_found': list(emails), 'status': 'pending'})
    if ok: logger.info(f"[PRODUCER] Added: {url}"); return 1
    return 0

async def producer_task(run_id: str):
    while task_status == "running" and task_run_id == run_id:
        pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'}, limit=RAW_BUFFER_THRESHOLD)
        if not pending or len(pending) < RAW_BUFFER_THRESHOLD:
            cities = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
            if cities:
                city = random.choice(cities)['name']
                role = random.choice(ROLES)
                logger.info(f"[PRODUCER] Target: {role} | {city}")
                async with httpx.AsyncClient(timeout=TIMEOUT_SEARCH) as client:
                    r = await client.get(f'{SEARXNG_URL}/search', params={'q': f'{role} {city}', 'format': 'json', 'language': 'pl-PL'})
                    if r.status_code == 200:
                        for res in r.json().get('results', []): await scrape_and_save_lead(res, "", set())
        await asyncio.sleep(10)

async def verify_raw_lead(lead, consumer_id):
    url, page_text = lead.get('url'), lead.get('page_text', '')
    emails = lead.get('emails_found', [])
    current_order = await get_provider_order_async()
    
    prompt = f"URL: {url}\nEmails: {emails}\nContent: {page_text[:2000]}\nVerify if organizer. Reply JSON: {{'ok': 1/0, 'email': '...', 'reason': '...'}}"

    for provider in current_order:
        if is_provider_on_cooldown(provider): continue
        logger.info(f"[C{consumer_id}] AI: {provider} → {url}")
        status, content, err = await call_ai_provider(provider, prompt)
        await asyncio.sleep(AI_DELAY)
        
        if status == 200:
            try:
                res = json.loads(re.search(r'\{.*\}', content, re.DOTALL).group().replace("'", '"'))
                return {'ok': res.get('ok'), 'email': res.get('email'), 'reason': res.get('reason','')}
            except: continue
        elif status == 429: set_provider_cooldown(provider)
    return None

async def consumer_task(run_id, consumer_id, target):
    global verified_in_run, task_status
    logger.info(f"[C{consumer_id}] Consumer START.")
    consecutive_errors = 0
    
    while True:
        if task_run_id != run_id: break
        if task_status != "running": await asyncio.sleep(1); continue
        
        try:
            leads = await supabase.select('marketing_raw_contacts', 'id,url,page_text,emails_found', {'status': 'pending'}, limit=1)
            if not leads: await asyncio.sleep(2); continue
            
            lead = leads[0]
            if not await supabase.update('marketing_raw_contacts', {'status': 'processing'}, {'id': lead['id'], 'status': 'pending'}): continue
            
            res = await verify_raw_lead(lead, consumer_id)
            if res is None:
                consecutive_errors += 1
                await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead['id']})
                if consecutive_errors >= 3:
                    logger.critical(f"[C{consumer_id}] KILL SWITCH! 3 errors."); task_status = "cancelled"; break
                continue
            
            consecutive_errors = 0
            if res['ok'] and res['email']:
                await supabase.insert('marketing_verified_contacts', {'email': res['email'], 'url': lead['url'], 'verify_reason': res['reason']})
                verified_in_run += 1
                logger.info(f"[C{consumer_id}] VERIFIED! ({verified_in_run}/{target})")
                await supabase.delete('marketing_raw_contacts', {'id': lead['id']})
                if verified_in_run >= target: task_status = "completed"; break
            else:
                await supabase.update('marketing_raw_contacts', {'status': 'rejected', 'reject_reason': res['reason']}, {'id': lead['id']})
                logger.info(f"[C{consumer_id}] REJECTED.")
        except Exception as e:
            logger.error(f"[C{consumer_id}] Err: {e}"); await asyncio.sleep(2)

async def run_worker(run_id, target):
    global task_status, verified_in_run
    task_status = "running"
    verified_in_run = 0
    
    logger.info("[WORKER] Warmup...")
    await warmup_ai_providers()
    
    logger.info(f"[WORKER] Starting tasks for {run_id}...")
    p_task = asyncio.create_task(producer_task(run_id))
    c_tasks = [asyncio.create_task(consumer_task(run_id, i, target)) for i in range(3)]
    
    while task_status == "running" and verified_in_run < target:
        await asyncio.sleep(1)
    
    logger.info(f"[WORKER] Finished with status: {task_status}")
    p_task.cancel()
    for c in c_tasks: c.cancel()

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

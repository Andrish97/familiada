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

class SupabaseLoggingHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            asyncio.create_task(supabase.insert('marketing_search_logs', {
                'level': record.levelname.lower(),
                'message': msg
            }))
        except: pass

_db_handler = SupabaseLoggingHandler()
_db_handler.setLevel(logging.INFO)
logger.addHandler(_db_handler)

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
                    val = val.strip().split('#')[0].strip()
                    try: config[key.strip()] = int(val)
                    except: config[key.strip()] = val.strip()
    return config

CONFIG = load_config()
ROLES = load_txt_lines('roles.txt')
SEARCH_TEMPLATES = load_txt_lines('templates.txt')
NEGATIVE_KEYWORDS = [k.lower() for k in load_txt_lines('negative_keywords.txt')]
BLOCKED_DOMAINS = [d.lower() for d in load_txt_lines('blocked_domains.txt')]
GARBAGE_EMAIL_DOMAINS = [g.lower() for g in load_txt_lines('garbage_email_domains.txt')]
SOCIAL_PLATFORMS = tuple(load_txt_lines('social_platforms.txt'))
SUBPAGE_PATHS = ['/' + p for p in load_txt_lines('subpage_paths.txt')]

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
RAW_BUFFER_THRESHOLD = CONFIG.get('RAW_BUFFER_THRESHOLD', 20)
AI_DELAY = 12
PROVIDER_COOLDOWN_SECONDS = int(CONFIG.get('PROVIDER_COOLDOWN_SECONDS', 60))
TIMEOUT_SEARCH = 25
TIMEOUT_SCRAPE = 12
TIMEOUT_SCRAPE_JS = 15

# --- Global State ---
task_status = "idle" 
task_run_id = None
verified_in_run = 0
critical_errors_in_run = 0
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
            return r.status_code in (200, 204, 404)
    
    async def call_rpc(self, fn, params=None):
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f'{self.url}/rest/v1/rpc/{fn}', headers=self.headers, json=params or {})
            return r.json() if r.status_code in (200, 201) else (True if r.status_code == 204 else None)

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Core Logic ---

def extract_emails(html):
    found = set()
    EXCLUDED_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.zip', '.js', '.css', '.webp', '.woff', '.woff2')
    for e in EMAIL_REGEX.findall(html):
        e_low = e.lower()
        if any(e_low.endswith(ext) for ext in EXCLUDED_EXT): continue
        if not any(g in e_low for g in GARBAGE_EMAIL_DOMAINS): found.add(e)
    return found

async def scrape_with_playwright(url):
    async with playwright_semaphore:
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                page = await context.new_page()
                try: await page.goto(url, timeout=TIMEOUT_SCRAPE_JS * 1000, wait_until="networkidle")
                except: pass
                content = await page.content()
                text = await page.evaluate("() => document.body.innerText")
                await browser.close()
                return text[:2000], extract_emails(content)
        except: return None, None

async def scrape_and_save_lead(res):
    url = res.get('url', '').lower()
    if not url or any(b in urlparse(url).netloc.lower() for b in BLOCKED_DOMAINS): return 0
    if await supabase.select('marketing_verified_contacts', 'id', {'url': url}) or \
       await supabase.select('marketing_raw_contacts', 'id', {'url': url}): return 0
    
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
                            try:
                                r_sub = await client.get(url.rstrip('/') + path, timeout=5)
                                if r_sub.status_code == 200:
                                    emails.update(extract_emails(r_sub.text))
                                    if len(page_text) < 1500: page_text += " " + re.sub(r'<[^>]+>', ' ', r_sub.text)[:1000]
                                    if emails: break
                            except: continue
        except: pass

    if (not emails or not page_text) and not any(s in url for s in SOCIAL_PLATFORMS):
        pw_text, pw_emails = await scrape_with_playwright(url)
        if pw_text: page_text = pw_text[:2000]
        if pw_emails: emails.update(pw_emails)

    if not emails or not page_text: return 0
    if any(k in page_text.lower() for k in NEGATIVE_KEYWORDS): return 0

    return 1 if await supabase.insert('marketing_raw_contacts', {
        'url': url, 'title': res.get('title',''), 'page_text': page_text[:2000], 
        'emails_found': list(emails), 'status': 'pending'
    }) else 0

async def producer_task(run_id):
    while task_status == "running" and task_run_id == run_id:
        pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'}, limit=RAW_BUFFER_THRESHOLD)
        if not pending or len(pending) < RAW_BUFFER_THRESHOLD:
            cities = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
            if cities:
                city, role = random.choice(cities)['name'], random.choice(ROLES)
                template = random.choice(SEARCH_TEMPLATES)
                query = template.replace('{role}', role).replace('{city}', city)
                logger.info(f"[PRODUCER] Query: {query}")
                try:
                    async with httpx.AsyncClient(timeout=TIMEOUT_SEARCH) as client:
                        r = await client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json', 'language': 'pl-PL'})
                        if r.status_code == 200:
                            for res in r.json().get('results', []): await scrape_and_save_lead(res)
                except: pass
        await asyncio.sleep(15)

async def verify_raw_lead(lead, c_id):
    url, page_text, emails, title = lead['url'], lead['page_text'], lead['emails_found'], lead.get('title', '')
    order = await get_provider_order_async()
    
    # Load prompt from file and ignore comment lines starting with #
    prompt_path = os.path.join(os.path.dirname(__file__), 'ai_prompt.txt')
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            base_prompt = "\n".join([l for l in lines if not l.strip().startswith('#')])
    except:
        base_prompt = "Verify if event organizer. Reply ONLY JSON: {'ok': 1/0, 'email': '...', 'reason': '...'}"

    # .replace() is safe for JSON brackets {} in the prompt
    prompt = base_prompt.replace('{url}', url).replace('{title}', title).replace('{emails}', str(emails)).replace('{text}', page_text[:2000])

    for provider in order:
        if is_provider_on_cooldown(provider): continue
        logger.info(f"[C{c_id}] AI: {provider} → {url}")
        status, content, err = await call_ai_provider(provider, prompt)
        
        if status == 200:
            try:
                res = json.loads(re.search(r'\{.*\}', content, re.DOTALL).group().replace("'", '"'))
                await asyncio.sleep(AI_DELAY)
                return res
            except: continue
        elif status == 429: set_provider_cooldown(provider)
    return None

async def consumer_task(run_id, c_id, target):
    global verified_in_run, critical_errors_in_run, task_status
    consecutive_critical = 0
    while task_run_id == run_id and task_status == "running" and verified_in_run < target:
        result = await supabase.call_rpc('claim_next_pending_lead')
        if not result or not isinstance(result, list) or len(result) == 0:
            await asyncio.sleep(5); continue
        
        lead = result[0]
        res = await verify_raw_lead(lead, c_id)
        
        if res is None:
            consecutive_critical += 1
            critical_errors_in_run += 1
            await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead['id']})
            if consecutive_critical >= 3:
                logger.critical(f"[C{c_id}] KILL SWITCH! 3 consecutive AI failures."); task_status = "cancelled"; break
            continue
        
        consecutive_critical = 0
        if res.get('ok') and res.get('email'):
            email = str(res['email']).strip().lower()
            if not await supabase.select('marketing_verified_contacts', 'id', {'email': email}):
                # Zapisujemy do zweryfikowanych - dane punktowe (score) idą tylko do logów (już są w logger.info wyżej)
                await supabase.insert('marketing_verified_contacts', {
                    'email': email, 
                    'url': lead['url'], 
                    'title': res.get('title') or lead.get('title'),
                    'short_description': res.get('short_description'),
                    'verify_reason': str(res.get('reason',''))[:500]
                })
                verified_in_run += 1
                logger.info(f"[C{c_id}] VERIFIED! ({verified_in_run}/{target}) - {email}")
            await supabase.delete('marketing_raw_contacts', {'id': lead['id']})
        else:
            # Rezygnacja/Odrzucenie - zapisujemy powód w marketing_raw_contacts zgodnie z Twoim schematem
            await supabase.update('marketing_raw_contacts', {
                'status': 'rejected', 
                'reject_reason': str(res.get('reason',''))[:500]
            }, {'id': lead['id']})
            logger.info(f"[C{c_id}] REJECTED.")

async def warmup_ai_providers():
    order = await get_provider_order_async()
    for p in order:
        status, _, _ = await call_ai_provider(p, "Hey")
        if status != 200: set_provider_cooldown(p)

async def run_worker(run_id, target):
    global task_status, verified_in_run, critical_errors_in_run
    task_status, verified_in_run, critical_errors_in_run = "running", 0, 0
    await warmup_ai_providers()
    p_task = asyncio.create_task(producer_task(run_id))
    c_tasks = [asyncio.create_task(consumer_task(run_id, i, target)) for i in range(3)]
    while task_status == "running" and verified_in_run < target: await asyncio.sleep(1)
    p_task.cancel()
    for c in c_tasks: c.cancel()
    if task_status == "running": task_status = "completed"

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
async def status(): return {"status": task_status, "run_id": task_run_id, "verified": verified_in_run, "errors": critical_errors_in_run}

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

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

class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
        self.client = httpx.AsyncClient(timeout=30, headers=self.headers)
    
    async def insert(self, table, data):
        try:
            r = await self.client.post(f'{self.url}/rest/v1/{table}', json=data)
            return r.status_code in (200, 201)
        except: return False

    async def select(self, table, columns='*', filters=None, limit=None):
        try:
            params = {'select': columns}
            if filters:
                for k, v in filters.items(): params[k] = f'eq.{v}'
            if limit: params['limit'] = limit
            r = await self.client.get(f'{self.url}/rest/v1/{table}', params=params)
            return r.json() if r.status_code == 200 else None
        except: return None

    async def update(self, table, data, filters):
        try:
            params = {k: f'eq.{v}' for k, v in filters.items()}
            r = await self.client.patch(f'{self.url}/rest/v1/{table}', json=data, params=params)
            return r.status_code in (200, 204)
        except: return False

    async def delete(self, table, filters=None):
        try:
            params = {k: f'eq.{v}' for k, v in filters.items()} if filters else {}
            r = await self.client.delete(f'{self.url}/rest/v1/{table}', params=params)
            return r.status_code in (200, 204, 404)
        except: return False
    
    async def call_rpc(self, fn, params=None):
        try:
            r = await self.client.post(f'{self.url}/rest/v1/rpc/{fn}', json=params or {})
            return r.json() if r.status_code in (200, 201) else (True if r.status_code == 204 else None)
        except: return None

SUPABASE_URL = "http://kong:8000"
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SERVICE_ROLE_KEY", ""))
supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

class SupabaseLoggingHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(supabase.insert('marketing_search_logs', {'level': record.levelname.lower(), 'message': msg}))
        except: pass

_db_handler = SupabaseLoggingHandler()
_db_handler.setLevel(logging.INFO)
logger.addHandler(_db_handler)

# --- Configuration ---
SEARXNG_URL = "http://searxng:8080"
AI_PROVIDERS = {
    'openrouter': {'key': os.getenv("OPENROUTER_API_KEY", ""), 'model': os.getenv("OPENROUTER_MODEL", "anthropic/claude-3-haiku"), 'endpoint': "https://openrouter.ai/api/v1/chat/completions", 'timeout': 60},
    'groq': {'key': os.getenv("GROQ_API_KEY", ""), 'model': os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"), 'endpoint': "https://api.groq.com/openai/v1/chat/completions", 'timeout': 30},
    'gemini': {'key': os.getenv("GEMINI_API_KEY", ""), 'model': os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite"), 'endpoint': "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", 'timeout': 30},
}

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
                if line.strip() and '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    try: config[k.strip()] = int(v.split('#')[0].strip())
                    except: config[k.strip()] = v.split('#')[0].strip()
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
playwright_semaphore = asyncio.Semaphore(3)

# --- Logic ---

def extract_emails(html):
    found = set()
    EXT = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.zip', '.js', '.css', '.webp', '.woff', '.woff2')
    for e in EMAIL_REGEX.findall(html):
        e_low = e.lower()
        if not any(e_low.endswith(x) for x in EXT) and not any(g in e_low for g in GARBAGE_EMAIL_DOMAINS): found.add(e)
    return found

async def scrape_with_playwright(url):
    async with playwright_semaphore:
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                ctx = await browser.new_context(user_agent="Mozilla/5.0")
                page = await ctx.new_page()
                try: await page.goto(url, timeout=TIMEOUT_SCRAPE_JS * 1000, wait_until="networkidle")
                except: pass
                txt, html = await page.evaluate("() => document.body.innerText"), await page.content()
                await browser.close()
                return txt[:2000], extract_emails(html)
        except: return None, None

async def scrape_and_save_lead(res):
    url = res.get('url', '').lower()
    if not url or any(b in urlparse(url).netloc.lower() for b in BLOCKED_DOMAINS): return 0
    if await supabase.select('marketing_verified_contacts', 'id', {'url': url}) or await supabase.select('marketing_raw_contacts', 'id', {'url': url}): return 0
    
    txt, emails = '', set()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SCRAPE, follow_redirects=True, headers={'User-Agent': 'Mozilla/5.0'}) as client:
            r = await client.get(url)
            if r.status_code == 200:
                txt = re.sub(r'<[^>]+>', ' ', r.text)[:2000]
                emails = extract_emails(r.text)
                if not any(s in url for s in SOCIAL_PLATFORMS) and not emails:
                    for path in SUBPAGE_PATHS:
                        try:
                            r_sub = await client.get(url.rstrip('/') + path, timeout=5)
                            if r_sub.status_code == 200:
                                emails.update(extract_emails(r_sub.text))
                                if len(txt) < 1500: txt += " " + re.sub(r'<[^>]+>', ' ', r_sub.text)[:1000]
                                if emails: break
                        except: continue
    except: pass

    if (not emails or not txt) and not any(s in url for s in SOCIAL_PLATFORMS):
        p_txt, p_emails = await scrape_with_playwright(url)
        if p_txt: txt = p_txt[:2000]
        if p_emails: emails.update(p_emails)

    if not emails or not txt or any(k in txt.lower() for k in NEGATIVE_KEYWORDS): return 0
    return 1 if await supabase.insert('marketing_raw_contacts', {'url': url, 'title': res.get('title',''), 'page_text': txt[:2000], 'emails_found': list(emails), 'status': 'pending'}) else 0

async def producer_task(run_id):
    while task_status == "running" and task_run_id == run_id:
        pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'}, limit=RAW_BUFFER_THRESHOLD)
        if not pending or len(pending) < RAW_BUFFER_THRESHOLD:
            cities = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
            if cities:
                # Pool logic: role:city
                history = await supabase.select('marketing_search_queries_log', 'query_text')
                done = set(h['query_text'] for h in history) if history else set()
                pool = [f"{r}:{c['name']}" for r in ROLES for c in cities]
                available = [p for p in pool if p not in done]
                
                if not available:
                    logger.info("[PRODUCER] Pool exhausted. Clearing history.")
                    await supabase.delete('marketing_search_queries_log')
                    available = pool

                picked = random.choice(available)
                role, city = picked.split(':', 1)
                logger.info(f"[PRODUCER] Picking: {role} in {city}")
                
                # Execute ALL templates for this pair
                for template in SEARCH_TEMPLATES:
                    if task_status != "running": break
                    query = template.replace('{role}', role).replace('{city}', city)
                    logger.info(f"[PRODUCER] Query: {query}")
                    try:
                        r = await supabase.client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json', 'language': 'pl-PL'}, timeout=TIMEOUT_SEARCH)
                        if r.status_code == 200:
                            for res in r.json().get('results', []): await scrape_and_save_lead(res)
                    except: pass
                
                await supabase.insert('marketing_search_queries_log', {'query_text': picked})
        await asyncio.sleep(15)

async def verify_raw_lead(lead, c_id):
    url, txt, emails, title = lead['url'], lead['page_text'], lead['emails_found'], lead.get('title', '')
    order = await supabase.call_rpc('get_provider_order') or ['openrouter', 'groq', 'gemini']
    if isinstance(order, list) and len(order) > 0 and isinstance(order[0], dict): order = [o.get('provider_order','') for o in order][0].split(',')

    prompt_path = os.path.join(os.path.dirname(__file__), 'ai_prompt.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        base = "\n".join([l for l in f.readlines() if not l.strip().startswith('#')])
    prompt = base.replace('{url}', url).replace('{title}', title).replace('{emails}', str(emails)).replace('{text}', txt[:2000])

    for provider in [p.strip().lower() for p in order if p.strip()]:
        if provider in provider_cooldowns and time.time() < provider_cooldowns[provider]: continue
        logger.info(f"[C{c_id}] AI: {provider} → {url}")
        status, content, err = await call_ai_provider(provider, prompt)
        if status == 200:
            try:
                res = json.loads(re.search(r'\{.*\}', content, re.DOTALL).group().replace("'", '"'))
                logger.info(f"[C{c_id}] AI response: {res}")
                await asyncio.sleep(AI_DELAY)
                return res
            except: continue
        elif status == 429: provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_SECONDS
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
                logger.critical(f"[C{c_id}] KILL SWITCH! 3 failures."); task_status = "cancelled"; break
            continue
        
        consecutive_critical = 0
        if res.get('ok') and res.get('email'):
            email = str(res['email']).strip().lower()
            if not await supabase.select('marketing_verified_contacts', 'id', {'email': email}):
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
            await supabase.update('marketing_raw_contacts', {'status': 'rejected', 'reject_reason': str(res.get('reason',''))[:500]}, {'id': lead['id']})
            logger.info(f"[C{c_id}] REJECTED.")

async def run_worker(run_id, target):
    global task_status, verified_in_run, critical_errors_in_run
    try:
        task_status, verified_in_run, critical_errors_in_run = "running", 0, 0
        p_task = asyncio.create_task(producer_task(run_id))
        c_tasks = [asyncio.create_task(consumer_task(run_id, 0, target))]
        
        while task_status == "running" and verified_in_run < target:
            await asyncio.sleep(1)
        
        p_task.cancel()
        for c in c_tasks: c.cancel()
        
        if task_status == "running":
            task_status = "completed"
            logger.info(f"[SYSTEM] Task {run_id} completed successfully.")
    except Exception as e:
        logger.error(f"[SYSTEM] Error in run_worker: {e}")
        task_status = "error"
    finally:
        # Give logs a moment to flush and set back to idle after a delay
        await asyncio.sleep(5)
        task_status = "idle"
        logger.info("[SYSTEM] System is now IDLE and ready for next run.")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_event(): await supabase.client.aclose()

@app.post("/api/search-runs")
async def start(target_count: int = 50):
    global task_run_id, task_status
    if task_status != "idle":
        logger.warning(f"[API] Blocked start request. Current status: {task_status}")
        raise HTTPException(400, f"System is currently {task_status}. Wait for it to finish.")
    
    task_run_id = str(uuid.uuid4())
    logger.info(f"[API] Starting new run: {task_run_id} with target {target_count}")
    asyncio.create_task(run_worker(task_run_id, target_count))
    return {"ok": True, "run_id": task_run_id}

@app.get("/api/search-runs/status")
async def status(): return {"status": task_status, "run_id": task_run_id, "verified": verified_in_run, "errors": critical_errors_in_run}

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

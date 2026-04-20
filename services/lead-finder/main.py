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

# --- Logger Configuration ---
logger = logging.getLogger("lead_finder")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(_handler)

global_client = httpx.AsyncClient(timeout=60)

class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
        self.client = httpx.AsyncClient(timeout=30, headers=self.headers)
    
    async def insert(self, table, data):
        try:
            r = await self.client.post(f'{self.url}/rest/v1/{table}', json=data)
            return r.status_code in (200, 201)
        except Exception as e:
            print(f"[SERVER] DB Insert Error: {e}")
            return False

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
            params = {}
            if filters:
                for k, v in filters.items():
                    params[k] = v if '.' in str(v) else f'eq.{v}'
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
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def send_telegram_notification(message):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID: return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        await global_client.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"})
    except Exception as e:
        print(f"[SERVER] Telegram Error: {e}")

class SupabaseLoggingHandler(logging.Handler):
    def emit(self, record):
        if record.levelname in ('INFO', 'ERROR', 'CRITICAL'):
            try:
                msg = self.format(record)
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    level = 'info' if record.levelname == 'INFO' else 'error'
                    loop.create_task(supabase.insert('marketing_search_logs', {'level': level, 'message': msg}))
            except: pass

_db_handler = SupabaseLoggingHandler()
_db_handler.setLevel(logging.INFO)
logger.addHandler(_db_handler)

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
SEARXNG_URL = "http://searxng:8080"
AI_DELAY = CONFIG.get('AI_DELAY', 12)
AI_DELAY_REJECT = 2
PROVIDER_COOLDOWN_SECONDS = CONFIG.get('PROVIDER_COOLDOWN_SECONDS', 60)
PROVIDER_COOLDOWN_LONG = CONFIG.get('PROVIDER_COOLDOWN_LONG', 300)
RAW_BUFFER_THRESHOLD = CONFIG.get('RAW_BUFFER_THRESHOLD', 20)
SEARCH_RESULTS_LIMIT = CONFIG.get('SEARCH_RESULTS_LIMIT', 20)
TIMEOUT_SEARCH = 25
TIMEOUT_SCRAPE = 12
TIMEOUT_SCRAPE_JS = 15
TIMEOUT_AI = 30

MAX_CONCURRENT_SCRAPES = CONFIG.get('MAX_CONCURRENT_SCRAPES', 10)
MAX_CONCURRENT_PLAYWRIGHT = CONFIG.get('MAX_CONCURRENT_PLAYWRIGHT', 3)

AI_PROVIDERS = {
    'openrouter': {'key': os.getenv("OPENROUTER_API_KEY", ""), 'model': os.getenv("OPENROUTER_MODEL", "anthropic/claude-3-haiku"), 'endpoint': "https://openrouter.ai/api/v1/chat/completions", 'timeout': 60},
    'groq': {'key': os.getenv("GROQ_API_KEY", ""), 'model': os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"), 'endpoint': "https://api.groq.com/openai/v1/chat/completions", 'timeout': TIMEOUT_AI},
    'deepseek': {'key': os.getenv("DEEP_SEEK_API_KEY", ""), 'model': "deepseek-chat", 'endpoint': "https://api.deepseek.com/chat/completions", 'timeout': 60}
}

ROLES = load_txt_lines('roles.txt')
SEARCH_TEMPLATES = load_txt_lines('templates.txt')
NEGATIVE_KEYWORDS = [k.lower() for k in load_txt_lines('negative_keywords.txt')]
BLOCKED_DOMAINS = [d.lower() for d in load_txt_lines('blocked_domains.txt')]
GARBAGE_EMAIL_DOMAINS = [g.lower() for g in load_txt_lines('garbage_email_domains.txt')]
SOCIAL_PLATFORMS = tuple(load_txt_lines('social_platforms.txt'))
SUBPAGE_PATHS = ['/' + p for p in load_txt_lines('subpage_paths.txt')]

REQUIRED_KEYWORDS = [
    'dj', 'wodzirej', 'konferansjer', 'animator', 'zespół', 'muzyka', 'oprawa',
    'event', 'wesele', 'urodziny', 'imprez', 'organizacja', 'komunie', 'studniówk', 
    'bal', 'prowadzen', 'integrac', 'nagłośnienie', 'oświetlenie'
]

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

# --- Global State ---
task_status = "idle" 
task_run_id = None
verified_in_run = 0
attempts_in_run = 0
critical_errors_in_run = 0
provider_cooldowns = {} 
provider_blacklist = set() 
rejected_domains = set() 
scrape_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)
playwright_semaphore = asyncio.Semaphore(MAX_CONCURRENT_PLAYWRIGHT)

# --- Logic ---

def clean_text(text):
    if not text: return ""
    text = re.sub(r'\s+', ' ', text).strip()
    if "function(" in text or "var " in text or "window." in text:
        text = re.sub(r'\{[^\}]+\}', '', text)
    return text[:2000]

def extract_emails(html):
    found = set()
    EXT = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.zip', '.js', '.css', '.webp', '.woff', '.woff2')
    JUNK_PREFIXES = ('webmaster@', 'dmca@', 'privacy@', 'subscriptions@', 'legal@', 'press@', 'noreply@', 'office@it')
    for e in EMAIL_REGEX.findall(html):
        e_low = e.lower()
        if any(e_low.endswith(x) for x in EXT): continue
        if any(e_low.startswith(p) for p in JUNK_PREFIXES): continue
        if not any(g in e_low for g in GARBAGE_EMAIL_DOMAINS): found.add(e)
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
                return clean_text(txt), extract_emails(html)
        except: return None, None

async def scrape_and_save_lead(res):
    url = res.get('url', '').lower()
    if not url: return 0
    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace('www.', '')
    if domain in rejected_domains: return 0
    if any(b in domain for b in BLOCKED_DOMAINS): return 0
    
    allowed_tlds = ('.pl', '.com', '.net', '.org', '.eu', '.info', '.biz', '.online', '.site')
    if not any(url.endswith(t) or f'{t}/' in url for t in allowed_tlds): return 0

    if await supabase.select('marketing_verified_contacts', 'id', {'url': url}) or await supabase.select('marketing_raw_contacts', 'id', {'url': url}): return 0
    
    txt, emails = '', set()
    async with scrape_semaphore:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SCRAPE, follow_redirects=True, headers={'User-Agent': 'Mozilla/5.0'}) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    txt = clean_text(re.sub(r'<[^>]+>', ' ', r.text))
                    emails = extract_emails(r.text)
                    if not any(s in url for s in SOCIAL_PLATFORMS) and not emails:
                        for path in SUBPAGE_PATHS:
                            try:
                                r_sub = await client.get(url.rstrip('/') + path, timeout=5)
                                if r_sub.status_code == 200:
                                    emails.update(extract_emails(r_sub.text))
                                    if len(txt) < 1500: txt += " " + clean_text(re.sub(r'<[^>]+>', ' ', r_sub.text))[:1000]
                                    if emails: break
                            except: continue
        except: pass

    is_social = any(s in url for s in SOCIAL_PLATFORMS)
    if (not emails or len(txt) < 250) and not is_social:
        p_txt, p_emails = await scrape_with_playwright(url)
        if p_txt: txt = p_txt
        if p_emails: emails.update(p_emails)

    if not emails or len(txt) < 100: return 0
    txt_low = txt.lower()
    if not any(k in txt_low for k in REQUIRED_KEYWORDS): return 0
    if any(k in txt_low for k in NEGATIVE_KEYWORDS): return 0

    return 1 if await supabase.insert('marketing_raw_contacts', {'url': url, 'title': res.get('title',''), 'page_text': txt[:2000], 'emails_found': list(emails), 'status': 'pending'}) else 0

async def producer_task(run_id):
    while task_status in ("running", "paused") and task_run_id == run_id:
        if task_status == "paused":
            await asyncio.sleep(5); continue
        pending = await supabase.select('marketing_raw_contacts', 'id', {'status': 'pending'}, limit=RAW_BUFFER_THRESHOLD)
        if not pending or len(pending) < RAW_BUFFER_THRESHOLD:
            cities = await supabase.select('marketing_cities', 'name', {'is_active': 'true'})
            if cities:
                history = await supabase.select('marketing_search_queries_log', 'query_text')
                done = set(h['query_text'] for h in history) if history else set()
                pool = [f"{r}:{c['name']}" for r in ROLES for c in cities]
                available = [p for p in pool if p not in done]
                if not available:
                    await supabase.delete('marketing_search_queries_log', {'query_text': 'neq.null'})
                    available = pool
                picked = random.choice(available)
                role, city = picked.split(':', 1)
                logger.info(f"Za mało surowych kontaktów w bazie, rozpoczynam wyszukiwanie {role} {city}")
                total_added = 0
                for template in SEARCH_TEMPLATES:
                    if task_status != "running": break
                    query = template.replace('{role}', role).replace('{city}', city)
                    try:
                        r = await global_client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json', 'language': 'pl-PL', 'limit': SEARCH_RESULTS_LIMIT}, timeout=TIMEOUT_SEARCH)
                        if r.status_code == 200:
                            for res in r.json().get('results', []): total_added += await scrape_and_save_lead(res)
                        else:
                            print(f"[SERVER] SearXNG Error {r.status_code}: {r.text[:100]}")
                    except Exception as e:
                        print(f"[SERVER] SearXNG Connection Error: {e}")
                logger.info(f"Zakończono wyszukiwanie {role} {city}, dodano {total_added} surowych kontaktów.")
                await supabase.insert('marketing_search_queries_log', {'query_text': picked})
        await asyncio.sleep(15)

async def call_ai_provider(name, prompt):
    cfg = AI_PROVIDERS.get(name)
    if not cfg or not cfg['key']: return 500, None, "Missing config"
    headers = {'Content-Type': 'application/json'}
    if name == 'openrouter':
        headers.update({'Authorization': f'Bearer {cfg["key"]}', 'HTTP-Referer': 'https://familiada.online', 'X-Title': 'Familiada Lead Finder'})
    else:
        headers.update({'Authorization': f'Bearer {cfg["key"]}'})
        
    try:
        r = await global_client.post(cfg['endpoint'], headers=headers,
            json={'model': cfg['model'], 'messages': [{'role': 'system', 'content': 'Odpowiadaj tylko JSON.'}, {'role': 'user', 'content': prompt}], 'temperature': 0.1}, timeout=cfg['timeout'])
        if r.status_code == 200: return 200, r.json()['choices'][0]['message']['content'], None
        else:
            err_body = r.text.lower()
            print(f"[SERVER] {name.capitalize()} Error {r.status_code}: {r.text[:200]}")
            # Wykrywanie limitów dziennych (per day / quota / limit exceeded)
            if r.status_code == 429 and any(x in err_body for x in ("day", "daily", "quota", "credit")):
                return 403, None, "Daily limit reached"
            return r.status_code, None, r.text[:100]
    except Exception as e: return 500, None, str(e)

async def verify_raw_lead(lead, target):
    global verified_in_run, attempts_in_run
    url, txt, emails, title = lead['url'], lead['page_text'], lead['emails_found'], lead.get('title', '')
    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace('www.', '')
    if domain in rejected_domains: return {"ok": 0, "reason": "Domena wcześniej odrzucona w tej sesji."}

    order_data = await supabase.call_rpc('get_provider_order')
    if order_data and isinstance(order_data, list) and len(order_data) > 0:
        order = order_data[0].get('provider_order','').split(',') if isinstance(order_data[0], dict) else order_data
    else: order = ['openrouter', 'groq', 'deepseek']
    
    prompt_path = os.path.join(os.path.dirname(__file__), 'ai_prompt.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        base = "\n".join([l for l in f.readlines() if not l.strip().startswith('#')])
    prompt = base.replace('{url}', url).replace('{title}', title).replace('{emails}', str(emails)).replace('{text}', txt[:2000])

    attempts_in_run += 1
    logger.info(f"Weryfikacja [{attempts_in_run}] (Znaleziono: {verified_in_run}/{target}): {url}")

    while task_status in ("running", "paused") and task_run_id is not None:
        if task_status == "paused":
            await asyncio.sleep(2); continue
            
        any_provider_exists = False
        any_provider_free = False
        
        for provider in [p.strip().lower() for p in order if p.strip()]:
            if provider in provider_blacklist: continue
            any_provider_exists = True
            if provider in provider_cooldowns:
                if time.time() < provider_cooldowns[provider]: continue
                else: del provider_cooldowns[provider]
            
            any_provider_free = True
            logger.info(f"Weryfikuję przez {provider}")
            status, content, err = await call_ai_provider(provider, prompt)
            if status == 200:
                try:
                    res = json.loads(re.search(r'\{.*\}', content, re.DOTALL).group().replace("'", '"'))
                    delay = AI_DELAY if res.get('ok') else AI_DELAY_REJECT
                    await asyncio.sleep(delay)
                    if not res.get('ok'): rejected_domains.add(domain)
                    return res
                except: 
                    provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_SECONDS
                    continue
            elif status in (401, 403, 404):
                logger.info(f"Model {provider} wykluczony z tej sesji (Błąd {status}).")
                provider_blacklist.add(provider)
                continue
            elif status == 429:
                provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_SECONDS
                continue
            else:
                logger.info(f"Nie udało się przez {provider} (Błąd {status})")
                provider_cooldowns[provider] = time.time() + PROVIDER_COOLDOWN_LONG
                continue
        
        if not any_provider_exists:
            logger.error("Brak dostępnych modeli AI!")
            return "FATAL"
            
        if not any_provider_free:
            print("[SERVER] Oczekiwanie na odblokowanie AI (30s)...")
            await asyncio.sleep(30)
            continue
    return None

async def consumer_task(run_id, target):
    global verified_in_run, critical_errors_in_run, task_status
    consecutive_critical = 0
    while task_run_id == run_id and task_status in ("running", "paused") and verified_in_run < target:
        if task_status == "paused":
            await asyncio.sleep(5); continue
        result = await supabase.call_rpc('claim_next_pending_lead')
        if not result or not isinstance(result, list) or len(result) == 0:
            await asyncio.sleep(5); continue
        lead = result[0]
        res = await verify_raw_lead(lead, target)
        if res is None or res == "FATAL":
            consecutive_critical += 1
            critical_errors_in_run += 1
            await supabase.update('marketing_raw_contacts', {'status': 'pending'}, {'id': lead['id']})
            if consecutive_critical >= 10:
                logger.warning("Wykryto serię błędów AI. Zasypiam na 10 minut...")
                await asyncio.sleep(600)
                consecutive_critical = 0
            continue
        consecutive_critical = 0
        if res.get('ok') and res.get('email'):
            email = str(res['email']).strip().lower()
            if not await supabase.select('marketing_verified_contacts', 'id', {'email': email}):
                await supabase.insert('marketing_verified_contacts', {
                    'email': email, 'url': lead['url'], 'title': res.get('title') or lead.get('title'),
                    'short_description': res.get('short_description'), 'verify_reason': str(res.get('reason',''))[:500]
                })
                verified_in_run += 1
                logger.info(f"Zweryfikowano {lead['url']}. Przyczyna: {res.get('reason','')}")
            await supabase.delete('marketing_raw_contacts', {'id': lead['id']})
        else:
            reason = str(res.get('reason',''))
            await supabase.update('marketing_raw_contacts', {'status': 'rejected', 'reject_reason': reason[:500]}, {'id': lead['id']})
            logger.info(f"Odrzucono {lead['url']}. Przyczyna: {reason}")

async def warmup_ai_providers():
    print("[SERVER] Rozgrzewanie modeli AI (Hey)...")
    order_data = await supabase.call_rpc('get_provider_order')
    if order_data and isinstance(order_data, list) and len(order_data) > 0:
        order = order_data[0].get('provider_order','').split(',') if isinstance(order_data[0], dict) else order_data
    else: order = ['openrouter', 'groq', 'deepseek']
    for p in [x.strip().lower() for x in order if x.strip()]:
        status, _, _ = await call_ai_provider(p, "Hey")
        if status in (401, 403, 404):
            provider_blacklist.add(p)
        elif status != 200:
            provider_cooldowns[p] = time.time() + (60 if status == 429 else 300)

async def run_worker(run_id, target):
    global task_status, verified_in_run, attempts_in_run, critical_errors_in_run, provider_blacklist, provider_cooldowns, rejected_domains
    try:
        task_status, verified_in_run, attempts_in_run, critical_errors_in_run = "running", 0, 0, 0
        provider_blacklist, provider_cooldowns, rejected_domains = set(), {}, set()
        await supabase.delete('marketing_search_logs', {'level': 'neq.null'})
        logger.info(f"Zlecono {target} kontaktów.")
        await warmup_ai_providers()
        p_task, c_task = asyncio.create_task(producer_task(run_id)), asyncio.create_task(consumer_task(run_id, target))
        while task_status in ("running", "paused") and verified_in_run < target: await asyncio.sleep(1)
        p_task.cancel(); c_task.cancel()
        if task_status == "running": 
            task_status = "completed"
            msg = f"✅ <b>Zlecenie zakończone</b>\nSukces: {verified_in_run}/{target}"
            logger.info(f"Zlecenie zakończone. Sukces: {verified_in_run}/{target}.")
            await send_telegram_notification(msg)
    except Exception as e:
        print(f"[SERVER] Error: {e}"); task_status = "error"
        await send_telegram_notification(f"❌ <b>Błąd krytyczny bota</b>\n{e}")
    finally:
        await asyncio.sleep(5); task_status = "idle"

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_event(): 
    await supabase.client.aclose()
    await global_client.aclose()

@app.post("/api/search-runs")
async def start(target_count: int = 50):
    global task_run_id, task_status
    if task_status != "idle": raise HTTPException(400, f"System zajęty ({task_status})")
    task_run_id = str(uuid.uuid4())
    asyncio.create_task(run_worker(task_run_id, target_count))
    return {"ok": True, "run_id": task_run_id}

@app.post("/api/search-runs/{run_id}/pause")
async def pause(run_id: str):
    global task_status
    if task_run_id == run_id and task_status == "running":
        task_status = "paused"; logger.info("Zlecenie wstrzymane."); return {"ok": True}
    raise HTTPException(404)

@app.post("/api/search-runs/{run_id}/resume")
async def resume(run_id: str):
    global task_status
    if task_run_id == run_id and task_status == "paused":
        task_status = "running"; logger.info("Zlecenie wznowione."); return {"ok": True}
    raise HTTPException(404)

@app.post("/api/search-runs/{run_id}/cancel")
async def cancel(run_id: str):
    global task_status
    if task_run_id == run_id:
        task_status = "cancelled"; logger.info("Zlecenie anulowane przez użytkownika."); return {"ok": True}
    raise HTTPException(404)

@app.get("/api/search-runs/status")
async def status(): return {"status": task_status, "run_id": task_run_id, "verified": verified_in_run, "errors": critical_errors_in_run}

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

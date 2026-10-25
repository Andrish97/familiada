"""
Lead Finder 2 — kontakty z gotowych danych (wyszukiwarka, CEIDG) bez
odwiedzania stron, ocena AI paczkami. Plan: docs/lead-finder-nowy-plan.md.
Wynik jak wcześniej: marketing_verified_contacts; te same endpointy panelu.
"""

import asyncio
import hmac
import logging
import os
import uuid
from typing import Optional

import dns.asyncresolver
import dns.exception
import dns.resolver
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from lf.config import cfg
from lf.db import Supabase
from lf.filters import FREEMAIL_DOMAINS
from lf.pipeline import Engine
from lf.sources.ceidg import Ceidg

logger = logging.getLogger('lead_finder')
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(_handler)

SUPABASE_URL = os.getenv('LEAD_FINDER_SUPABASE_URL', 'http://kong:8000')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', os.getenv('SERVICE_ROLE_KEY', ''))
SEARXNG_URL = os.getenv('SEARXNG_URL', 'http://searxng:8080')
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')
LEAD_FINDER_API_KEY = os.getenv('LEAD_FINDER_API_KEY', '').strip()
ADMIN_ORIGIN = 'https://admin.familiada.online'

http = httpx.AsyncClient(timeout=60)
db = Supabase(SUPABASE_URL, SUPABASE_KEY)


class DbLogHandler(logging.Handler):
    """Wpisy INFO/ERROR do marketing_search_logs (dziennik w panelu)."""

    def emit(self, record):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if record.getMessage().startswith('DB '):
            return  # błąd samej bazy — tylko w logach kontenera (bez pętli)
        level = 'error' if record.levelno >= logging.ERROR else 'info'
        loop.create_task(db.insert('marketing_search_logs', {'level': level, 'message': self.format(record)[:2000]}))


_db_handler = DbLogHandler()
_db_handler.setLevel(logging.INFO)
_db_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(_db_handler)


async def notify(text):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        await http.post(f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
                        json={'chat_id': TELEGRAM_CHAT_ID, 'text': text, 'parse_mode': 'HTML'})
    except httpx.HTTPError as e:
        print(f'[SERVER] Telegram: {e}')


_mx_cache = {}


async def mx_check(domain):
    """False tylko, gdy domena na pewno nie przyjmuje poczty (brak domeny / brak MX i A)."""
    domain = domain.lower()
    if domain in FREEMAIL_DOMAINS:
        return True
    if domain in _mx_cache:
        return _mx_cache[domain]
    ok = True
    resolver = dns.asyncresolver.Resolver()
    resolver.lifetime = 4
    try:
        await resolver.resolve(domain, 'MX')
    except dns.resolver.NXDOMAIN:
        ok = False
    except dns.resolver.NoAnswer:
        try:
            await resolver.resolve(domain, 'A')
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            ok = False
        except dns.exception.DNSException:
            pass
    except dns.exception.DNSException:
        pass  # timeout / brak serwera DNS — nie odrzucamy
    _mx_cache[domain] = ok
    return ok


engine = Engine(db, http, SEARXNG_URL,
                ceidg=Ceidg(http, os.getenv('CEIDG_API_KEY', '').strip(), cfg('CEIDG_DETAIL_DELAY', 4)),
                mx_check=mx_check, notify=notify)


def require_api_key(authorization: Optional[str] = Header(default=None)):
    # Ten sam klucz co sekret Workera LEAD_FINDER_API_KEY. Bez klucza w env: odmowa.
    if not LEAD_FINDER_API_KEY:
        raise HTTPException(503, 'API niekonfigurowane')
    given = (authorization or '').encode('utf-8')
    if not hmac.compare_digest(given, f'Bearer {LEAD_FINDER_API_KEY}'.encode('utf-8')):
        raise HTTPException(401, 'Brak autoryzacji')


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=[ADMIN_ORIGIN], allow_methods=['GET', 'POST'],
                   allow_headers=['Authorization', 'Content-Type'])


def _start(kind, **kw):
    if engine.status != 'idle':
        raise HTTPException(400, f'System zajęty ({engine.status})')
    run_id = str(uuid.uuid4())
    engine.status = 'starting'
    asyncio.create_task(engine.start(run_id, kind, **kw))
    return {'ok': True, 'run_id': run_id}


@app.post('/api/search-runs', dependencies=[Depends(require_api_key)])
async def start_search(target_count: int = 50):
    return _start('search', target=max(1, min(1000, target_count)))


@app.post('/api/contacts-review', dependencies=[Depends(require_api_key)])
async def start_review(all: bool = False):
    return _start('review', all_rows=all)


@app.get('/api/search-runs/status', dependencies=[Depends(require_api_key)])
async def status():
    s = engine.snapshot()
    s['ceidg'] = engine.ceidg.enabled
    return s


def _own_run(run_id):
    if engine.run_id != run_id:
        raise HTTPException(404, 'Nieznane zlecenie')


@app.post('/api/search-runs/{run_id}/pause', dependencies=[Depends(require_api_key)])
async def pause(run_id: str):
    _own_run(run_id)
    if engine.status != 'running':
        raise HTTPException(400, f'Nie można wstrzymać w stanie {engine.status}')
    engine.status = 'paused'
    return {'ok': True, 'status': engine.status}


@app.post('/api/search-runs/{run_id}/resume', dependencies=[Depends(require_api_key)])
async def resume(run_id: str):
    _own_run(run_id)
    if engine.status != 'paused':
        raise HTTPException(400, f'Nie można wznowić w stanie {engine.status}')
    engine.status = 'running'
    return {'ok': True, 'status': engine.status}


@app.post('/api/search-runs/{run_id}/cancel', dependencies=[Depends(require_api_key)])
async def cancel(run_id: str):
    _own_run(run_id)
    if engine.status not in ('running', 'paused'):
        raise HTTPException(400, 'Brak aktywnego zlecenia do anulowania')
    engine.status = 'cancelled'
    return {'ok': True, 'status': engine.status}


@app.get('/health')
async def health():
    return {'status': 'ok'}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)

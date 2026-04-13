"""
Marketing Lead Finder Service
Searches for event organizer contacts using SearXNG + AI verification
Runs as Docker container, communicates with Cloudflare Worker for Telegram notifications
"""

import asyncio
import json
import logging
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx

# Configuration (from docker/.env)
SEARXNG_URL = os.getenv("SEARXNG_URL", "https://search.familiada.online")
SEARXNG_API_KEY = os.getenv("SEARXNG_API_KEY", "")
AI_ENDPOINT = os.getenv("AI_ENDPOINT", "https://ai.familiada.online")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "qwen2.5")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
WORKER_TELEGRAM_ENDPOINT = os.getenv("WORKER_TELEGRAM_ENDPOINT", "https://settings.familiada.online/_admin_api/config/telegram/notify-service")
SERVICE_TOKEN = os.getenv("LEAD_FINDER_SERVICE_TOKEN", "")

BLOCKED_DOMAINS = {
    'olx.pl', 'oferteo.pl', 'fixly.pl', 'useme.pl', 'pracuj.pl', 'jooble.pl',
    'infopraca.pl', 'praca.pl', 'linkedin.com', 'facebook.com', 'instagram.com',
    'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'wa.link', 't.me',
    'fb.me', 'm.me', 'discord.gg', 'reddit.com', 'pinterest.com', 'medium.com',
    'substack.com', 'wordpress.com', 'wix.com', 'squarespace.com', 'shopify.com',
    'etsy.com', 'ebay.com', 'amazon.com', 'allegro.pl', 'empik.com', 'ceneo.pl',
    'skapiec.pl', 'nexo.pl', 'mediaexpert.pl', 'x-kom.pl', 'morele.net',
    'komputronik.pl', 'proline.pl', 'agd.pl', 'euro.com.pl', 'rtv-euroagd.pl',
    'media-markt.pl', 'saturn.pl', 'expert.pl', 'neonet.pl', 'avs.pl',
    'tele-poli.pl', 'gsm-online.pl', 'komorkomania.pl', 'benchmark.pl',
    'pcformat.pl', 'cdaction.pl', 'gry-online.pl', 'gamepressure.com',
    'igromania.pl', 'gry.pl', 'gram.pl', 'swiatgier.pl', 'stopklatka.pl',
    'filmweb.pl', 'imdb.com', 'rottentomatoes.com', 'metacritic.com',
    'letterboxd.com', 'trakt.tv', 'simkl.com', 'justwatch.com',
    'kino-polska.pl', 'filmoteka.pl', 'ninateka.pl', 'culture.pl',
    'instytutksiazki.pl', 'biblioteka.pl', 'bookcrossing.com', 'goodreads.com',
    'lubimyczytac.pl', 'granice.pl', 'swiatczytnika.pl', 'ebooki.pl',
    'legimi.com', 'virtualo.pl', 'publio.pl', 'wolnelektury.pl', 'polona.pl',
}

SEARCH_QUERIES = [
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

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("lead-finder")

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Marketing Lead Finder")

# CORS - allow settings.familiada.online
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://settings.familiada.online"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Global state
running_tasks = {}
shutdown_event = asyncio.Event()

# Auth
API_TOKEN = os.getenv("LEAD_FINDER_API_TOKEN", "")

async def verify_token(request: Request):
    if not API_TOKEN:
        return  # No token configured, allow all
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != API_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


class SupabaseClient:
    """Simple Supabase client using HTTP API"""
    
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip('/')
        self.service_key = service_key
        self.headers = {
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    
    async def insert(self, table: str, data: dict, on_conflict: str = None) -> Optional[dict]:
        async with httpx.AsyncClient() as client:
            params = {}
            if on_conflict:
                params['on_conflict'] = on_conflict
            response = await client.post(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                json=data,
                params=params
            )
            if response.status_code in (200, 201):
                result = response.json()
                return result[0] if result else data
            else:
                logger.error(f"Supabase insert error {response.status_code}: {response.text}")
                return None
    
    async def select(self, table: str, columns: str = '*', filters: dict = None, 
                     order: str = None, limit: int = None, offset: int = None) -> list:
        async with httpx.AsyncClient() as client:
            params = {'select': columns}
            if filters:
                for key, value in filters.items():
                    params[key] = f'eq.{value}'
            if order:
                params['order'] = order
            if limit:
                params['limit'] = limit
            if offset:
                params['offset'] = offset
            
            response = await client.get(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                params=params
            )
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Supabase select error {response.status_code}: {response.text}")
                return []
    
    async def update(self, table: str, data: dict, filters: dict) -> bool:
        async with httpx.AsyncClient() as client:
            filter_params = {}
            for key, value in filters.items():
                filter_params[key] = f'eq.{value}'
            
            response = await client.patch(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                json=data,
                params=filter_params
            )
            return response.status_code == 200
    
    async def delete(self, table: str, filters: dict) -> bool:
        async with httpx.AsyncClient() as client:
            filter_params = {}
            for key, value in filters.items():
                filter_params[key] = f'eq.{value}'
            
            response = await client.delete(
                f'{self.url}/rest/v1/{table}',
                headers=self.headers,
                params=filter_params
            )
            return response.status_code == 204


supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def log_to_db(run_id: str, level: str, message: str, details: dict = None):
    """Log a message to the database"""
    await supabase.insert('marketing_search_logs', {
        'run_id': run_id,
        'level': level,
        'message': message,
        'details': details or {}
    })
    logger.info(f"[{run_id[:8]}] {level}: {message}")


async def send_telegram_notification(message: str):
    """Send notification to Telegram via Cloudflare Worker"""
    if not SERVICE_TOKEN:
        logger.warning("Telegram not configured (no SERVICE_TOKEN)")
        return
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                WORKER_TELEGRAM_ENDPOINT,
                headers={
                    'Authorization': f'Bearer {SERVICE_TOKEN}',
                    'Content-Type': 'application/json'
                },
                json={'text': message}
            )
            if response.status_code == 200:
                logger.info("Telegram notification sent via Worker")
            else:
                logger.error(f"Telegram send failed via Worker: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Telegram notification error: {e}")


async def search_searxng(query: str) -> list:
    """Search using SearXNG and return list of URLs"""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f'{SEARXNG_URL}/search',
                headers={'Authorization': f'Bearer {SEARXNG_API_KEY}'},
                params={
                    'q': query,
                    'format': 'json',
                    'categories': 'general',
                    'engines': 'google,bing,duckduckgo',
                    'pageno': 1
                }
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('results', [])
            else:
                logger.error(f"SearXNG search error {response.status_code}: {response.text}")
                return []
    except Exception as e:
        logger.error(f"SearXNG search exception: {e}")
        return []


async def extract_emails_from_url(url: str, timeout: int = 10) -> list:
    """Fetch a URL and extract email addresses"""
    emails = set()
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code == 200:
                # Find emails in HTML
                found = EMAIL_REGEX.findall(response.text)
                emails.update(found)
                
                # Also try to find emails on /kontakt or /contact subpage
                parsed = urlparse(url)
                for path in ['/kontakt', '/contact', '/kontakt.html', '/contact.html']:
                    contact_url = f'{parsed.scheme}://{parsed.netloc}{path}'
                    try:
                        resp2 = await client.get(contact_url, timeout=5)
                        if resp2.status_code == 200:
                            found2 = EMAIL_REGEX.findall(resp2.text)
                            emails.update(found2)
                    except:
                        pass
    except Exception as e:
        logger.warning(f"Error fetching {url}: {e}")
    
    return list(emails)


async def verify_with_ai(title: str, description: str, url: str, emails: list) -> dict:
    """Use AI to verify if this is a valid event organizer contact"""
    prompt = f"""Sprawdź czy ta strona należy do organizatora eventów (DJ, wodzirej, animator, agencja eventowa, itp.):

Tytuł: {title}
URL: {url}
Maile: {', '.join(emails)}

Odpowiedz w formacie JSON:
{{
    "is_event_organizer": true/false,
    "confidence": "high/medium/low",
    "reasoning": "krótkie wyjaśnienie",
    "contact_type": "DJ/Wodzirej/Animator/Agencja eventowa/Konferansjer/Inne",
    "best_email": "najbardziej pasujący email lub null"
}}

Uwaga: Nie może to być restauracja, firma wynajmująca sprzęt, czy portal ogłoszeniowy. 
Musi to być ktoś kto SAM organizuje eventy."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f'{AI_ENDPOINT}/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {AI_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': AI_MODEL,
                    'messages': [
                        {'role': 'system', 'content': 'Jesteś asystentem weryfikującym kontakty marketingowe. Odpowiadaj TYLKO w formacie JSON.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'temperature': 0.1,
                    'max_tokens': 500
                }
            )
            if response.status_code == 200:
                data = response.json()
                content = data['choices'][0]['message']['content']
                # Try to parse JSON from response
                try:
                    # Find JSON in response
                    json_match = re.search(r'\{.*\}', content, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group())
                except:
                    pass
                return {'is_event_organizer': False, 'confidence': 'low', 'reasoning': 'Invalid AI response'}
            else:
                logger.error(f"AI verification error {response.status_code}: {response.text}")
                return {'is_event_organizer': False, 'confidence': 'low', 'reasoning': 'AI request failed'}
    except Exception as e:
        logger.error(f"AI verification exception: {e}")
        return {'is_event_organizer': False, 'confidence': 'low', 'reasoning': str(e)}


async def process_search_run(run_id: str):
    """Main processing loop for a search run"""
    try:
        # Mark as running
        await supabase.update('marketing_search_runs', 
            {'status': 'running', 'started_at': datetime.now(timezone.utc).isoformat()},
            {'id': run_id})
        await log_to_db(run_id, 'info', 'Rozpoczęto przetwarzanie zlecenia')
        
        # Get run config
        runs = await supabase.select('marketing_search_runs', filters={'id': run_id})
        if not runs:
            await log_to_db(run_id, 'error', 'Nie znaleziono zlecenia')
            return
        
        run = runs[0]
        target_count = run.get('target_count', 50)
        
        # Get cities
        cities_data = await supabase.select('marketing_cities', filters={'is_active': True})
        cities = [c['name'] for c in cities_data]
        
        # Get already used queries
        queries_log = await supabase.select('marketing_search_queries_log', 
            columns='full_query', filters={'run_id': run_id})
        used_queries = set(q['full_query'] for q in queries_log)
        
        # Get blocked/processed URLs
        processed_urls_data = await supabase.select('marketing_search_urls',
            columns='url', filters={'run_id': run_id})
        processed_urls = set(u['url'] for u in processed_urls_data)
        
        # Get existing emails from raw and verified contacts
        existing_emails = set()
        raw_data = await supabase.select('marketing_raw_contacts', columns='emails_found', filters={'run_id': run_id})
        for r in raw_data or []:
            existing_emails.update(r.get('emails_found', []))
        verified_data = await supabase.select('marketing_verified_contacts', columns='email', filters={'run_id': run_id})
        for v in verified_data or []:
            if v.get('email'):
                existing_emails.add(v['email'])
        
        verified = 0
        while verified < target_count and not shutdown_event.is_set():
            # Check if paused
            runs = await supabase.select('marketing_search_runs', filters={'id': run_id})
            if runs and runs[0].get('status') == 'paused':
                await log_to_db(run_id, 'info', 'Zlecenie wstrzymane')
                await asyncio.sleep(10)
                continue
            elif runs and runs[0].get('status') == 'cancelled':
                await log_to_db(run_id, 'info', 'Zlecenie anulowane')
                return
            
            # Generate next query
            query_made = False
            for query_template in SEARCH_QUERIES:
                for city in cities:
                    full_query = query_template.format(city=city)
                    if full_query not in used_queries:
                        used_queries.add(full_query)
                        query_made = True
                        
                        # Log query
                        await supabase.insert('marketing_search_queries_log', {
                            'run_id': run_id,
                            'query_text': query_template,
                            'city': city,
                            'full_query': full_query,
                            'status': 'searching'
                        })
                        
                        await log_to_db(run_id, 'info', f'Wyszukiwanie: {full_query}')
                        
                        # Search SearXNG
                        results = await search_searxng(full_query)
                        
                        # Update query log
                        await supabase.update('marketing_search_queries_log',
                            {
                                'status': 'completed',
                                'urls_found': len(results),
                                'searched_at': datetime.now(timezone.utc).isoformat()
                            },
                            {'full_query': full_query})
                        
                        # Process results
                        for result in results:
                            url = result.get('url', '')
                            if not url:
                                continue
                            
                            # Skip blocked domains
                            domain = urlparse(url).netloc.lower()
                            if domain in BLOCKED_DOMAINS or any(bd in domain for bd in BLOCKED_DOMAINS):
                                await supabase.insert('marketing_search_urls', {
                                    'run_id': run_id,
                                    'url': url,
                                    'source_query': full_query,
                                    'domain': domain,
                                    'status': 'rejected',
                                    'blocked_reason': 'blocked_domain',
                                    'page_title': result.get('title', '')
                                }, on_conflict='url')
                                continue
                            
                            # Skip already processed
                            if url in processed_urls:
                                continue
                            
                            # Add to search URLs
                            await supabase.insert('marketing_search_urls', {
                                'run_id': run_id,
                                'url': url,
                                'source_query': full_query,
                                'domain': domain,
                                'status': 'pending',
                                'page_title': result.get('title', '')
                            }, on_conflict='url')
                            processed_urls.add(url)
                        
                        await log_to_db(run_id, 'success', 
                            f'Znaleziono {len(results)} URL-i')
                        
                        # Small delay between queries
                        await asyncio.sleep(1)
                        break
                
                if query_made:
                    break
            
            if not query_made:
                await log_to_db(run_id, 'warning', 'Wyczerpano pulę zapytań')
                break
            
            # Process pending URLs
            pending_urls = await supabase.select('marketing_search_urls',
                filters={'run_id': run_id, 'status': 'pending'}, limit=10)
            
            for url_data in pending_urls:
                url = url_data['url']
                await supabase.update('marketing_search_urls',
                    {'status': 'collecting_emails'},
                    {'id': url_data['id']})
                
                # Extract emails
                emails = await extract_emails_from_url(url)
                
                if not emails:
                    await supabase.update('marketing_search_urls',
                        {'status': 'processed'},
                        {'id': url_data['id']})
                    continue
                
                # Check for duplicate emails
                if any(email in existing_emails for email in emails):
                    await supabase.update('marketing_search_urls',
                        {'status': 'rejected', 'blocked_reason': 'duplicate_email'},
                        {'id': url_data['id']})
                    continue
                
                # Add to raw contacts
                raw_contact = await supabase.insert('marketing_raw_contacts', {
                    'run_id': run_id,
                    'url': url,
                    'emails_found': emails,
                    'page_title': url_data.get('page_title', ''),
                    'status': 'pending'
                })
                
                if raw_contact:
                    existing_emails.update(emails)
                    
                    # Update URL status
                    await supabase.update('marketing_search_urls',
                        {'status': 'collected'},
                        {'id': url_data['id']})
                    
                    await log_to_db(run_id, 'success', 
                        f'Zebrano maile z {url}: {", ".join(emails[:3])}')
                
                await asyncio.sleep(0.5)
            
            # Process raw contacts with AI
            pending_raw = await supabase.select('marketing_raw_contacts',
                filters={'run_id': run_id, 'status': 'pending'}, limit=5)
            
            for raw_contact in pending_raw:
                url = raw_contact['url']
                emails = raw_contact.get('emails_found', [])
                title = raw_contact.get('page_title', '')
                
                await supabase.update('marketing_raw_contacts',
                    {'status': 'processing'},
                    {'id': raw_contact['id']})
                
                # Verify with AI
                ai_result = await verify_with_ai(title, '', url, emails)
                
                if ai_result.get('is_event_organizer'):
                    # Add to verified contacts
                    best_email = ai_result.get('best_email') or (emails[0] if emails else '')
                    if best_email:
                        await supabase.insert('marketing_verified_contacts', {
                            'run_id': run_id,
                            'title': title,
                            'short_description': ai_result.get('reasoning', '')[:200],
                            'email': best_email,
                            'url': url,
                            'is_event_organizer': True,
                            'ai_confidence': ai_result.get('confidence', 'medium'),
                            'ai_reasoning': ai_result.get('reasoning', ''),
                            'contact_type': ai_result.get('contact_type', 'Inne')
                        })
                        verified += 1
                        
                        await log_to_db(run_id, 'success', 
                            f'✅ Zweryfikowano: {title} ({best_email})')
                    else:
                        await log_to_db(run_id, 'warning', 
                            f'❌ Brak maila po weryfikacji: {title}')
                    
                    await supabase.update('marketing_raw_contacts',
                        {'status': 'verified'},
                        {'id': raw_contact['id']})
                else:
                    await log_to_db(run_id, 'info', 
                        f'❌ Odrzucono po weryfikacji: {title}')
                    
                    await supabase.update('marketing_raw_contacts',
                        {'status': 'rejected'},
                        {'id': raw_contact['id']})
                
                await asyncio.sleep(1)
            
            # Update run stats
            await supabase.update('marketing_search_runs',
                {
                    'contacts_verified': verified,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                },
                {'id': run_id})
            
            # Progress log
            await log_to_db(run_id, 'info', 
                f'Postęp: {verified}/{target_count} zweryfikowanych kontaktów')
            
            await asyncio.sleep(2)
        
        # Mark as completed
        await supabase.update('marketing_search_runs',
            {
                'status': 'completed',
                'completed_at': datetime.now(timezone.utc).isoformat(),
                'contacts_verified': verified
            },
            {'id': run_id})
        
        await log_to_db(run_id, 'success', 
            f'✅ Zakończono! Znaleziono {verified} kontaktów')
        
        # Send Telegram notification via Worker
        await send_telegram_notification(
            f'🔍 Familiada - Lead Finder\n'
            f'Zlecenie #{run_id[:8]} zakończone!\n'
            f'Znaleziono: {verified} kontaktów'
        )
        
    except Exception as e:
        logger.error(f"Error in process_search_run {run_id}: {e}", exc_info=True)
        await supabase.update('marketing_search_runs',
            {
                'status': 'error',
                'error_message': str(e)
            },
            {'id': run_id})
        
        await log_to_db(run_id, 'error', f'Błąd: {str(e)}')
        
        await send_telegram_notification(
            f'❌ Familiada - Lead Finder\n'
            f'Zlecenie #{run_id[:8]} zakończone błędem:\n'
            f'{str(e)[:200]}'
        )


# ═══════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.post("/api/search-runs")
async def create_search_run(request: Request, target_count: int = 50):
    """Create a new search run"""
    await verify_token(request)
    run = await supabase.insert('marketing_search_runs', {
        'target_count': target_count,
        'status': 'pending'
    })
    
    if run:
        run_id = run.get('id')
        # Start processing in background
        task = asyncio.create_task(process_search_run(run_id))
        running_tasks[run_id] = task
        return JSONResponse({'ok': True, 'run_id': run_id, 'status': 'pending'})
    else:
        raise HTTPException(status_code=500, detail='Failed to create run')


@app.post("/api/search-runs/{run_id}/pause")
async def pause_search_run(request: Request, run_id: str):
    """Pause a running search run"""
    await verify_token(request)
    await supabase.update('marketing_search_runs',
        {
            'status': 'paused',
            'paused_at': datetime.now(timezone.utc).isoformat()
        },
        {'id': run_id})
    
    await log_to_db(run_id, 'info', 'Zlecenie wstrzymane przez użytkownika')
    return JSONResponse({'ok': True, 'status': 'paused'})


@app.post("/api/search-runs/{run_id}/resume")
async def resume_search_run(request: Request, run_id: str):
    """Resume a paused search run"""
    await verify_token(request)
    await supabase.update('marketing_search_runs',
        {'status': 'running'},
        {'id': run_id})
    
    await log_to_db(run_id, 'info', 'Wznowiono zlecenie')
    
    # Restart processing if not already running
    if run_id not in running_tasks or running_tasks[run_id].done():
        task = asyncio.create_task(process_search_run(run_id))
        running_tasks[run_id] = task
    
    return JSONResponse({'ok': True, 'status': 'running'})


@app.post("/api/search-runs/{run_id}/cancel")
async def cancel_search_run(request: Request, run_id: str):
    """Cancel a search run"""
    await verify_token(request)
    await supabase.update('marketing_search_runs',
        {'status': 'cancelled'},
        {'id': run_id})
    
    await log_to_db(run_id, 'info', 'Zlecenie anulowane')
    
    if run_id in running_tasks and not running_tasks[run_id].done():
        running_tasks[run_id].cancel()
    
    return JSONResponse({'ok': True, 'status': 'cancelled'})


@app.get("/api/search-runs")
async def list_search_runs(limit: int = 20, offset: int = 0):
    """List all search runs"""
    runs = await supabase.select(
        'marketing_search_runs',
        order='created_at.desc',
        limit=limit,
        offset=offset
    )
    return JSONResponse(runs)


@app.get("/api/search-runs/{run_id}")
async def get_search_run(run_id: str):
    """Get a specific search run"""
    runs = await supabase.select('marketing_search_runs', filters={'id': run_id})
    if not runs:
        raise HTTPException(status_code=404, detail='Run not found')
    return JSONResponse(runs[0])


@app.get("/api/search-runs/{run_id}/logs")
async def get_search_run_logs(run_id: str, limit: int = 100):
    """Get logs for a search run"""
    logs = await supabase.select(
        'marketing_search_logs',
        filters={'run_id': run_id},
        order='created_at.desc',
        limit=limit
    )
    return JSONResponse(logs)


@app.get("/api/search-runs/{run_id}/contacts")
async def get_search_run_contacts(run_id: str):
    """Get verified contacts for a search run"""
    contacts = await supabase.select(
        'marketing_verified_contacts',
        filters={'run_id': run_id},
        order='added_at.desc'
    )
    return JSONResponse(contacts)


@app.get("/api/stats")
async def get_stats():
    """Get overall statistics"""
    runs = await supabase.select('marketing_search_runs', columns='id')
    verified = await supabase.select('marketing_verified_contacts', columns='id')
    used = await supabase.select('marketing_verified_contacts', columns='id', filters={'is_used': True})
    running = await supabase.select('marketing_search_runs', columns='id', filters={'status': 'running'})
    
    stats = {
        'total_runs': len(runs) if runs else 0,
        'total_verified': len(verified) if verified else 0,
        'total_used': len(used) if used else 0,
        'running_runs': len(running) if running else 0
    }
    return JSONResponse(stats)


@app.post("/api/contacts/{contact_id}/mark-used")
async def mark_contact_used(request: Request, contact_id: str, used: bool = True):
    """Mark a contact as used/unused"""
    await verify_token(request)
    data = {'is_used': used}
    if used:
        data['used_at'] = datetime.now(timezone.utc).isoformat()
    else:
        data['used_at'] = None
    
    success = await supabase.update('marketing_verified_contacts', data, {'id': contact_id})
    return JSONResponse({'ok': success})


@app.put("/api/contacts/{contact_id}")
async def update_contact(request: Request, contact_id: str, data: dict):
    """Update contact fields (editable like Excel)"""
    await verify_token(request)
    allowed_fields = {'title', 'short_description', 'email', 'url', 'contact_type', 'notes', 'is_used'}
    filtered_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if 'is_used' in filtered_data and filtered_data['is_used']:
        filtered_data['used_at'] = datetime.now(timezone.utc).isoformat()
    
    success = await supabase.update('marketing_verified_contacts', filtered_data, {'id': contact_id})
    return JSONResponse({'ok': success})


@app.delete("/api/contacts/{contact_id}")
async def delete_contact(request: Request, contact_id: str):
    """Delete a contact"""
    await verify_token(request)
    success = await supabase.delete('marketing_verified_contacts', {'id': contact_id})
    return JSONResponse({'ok': success})


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse({
        'status': 'ok',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': '1.0.0'
    })


# ═══════════════════════════════════════════════════════════
# SHUTDOWN
# ═══════════════════════════════════════════════════════════

async def shutdown(sig):
    """Graceful shutdown"""
    logger.info(f"Received signal {sig.name}, shutting down...")
    shutdown_event.set()
    
    # Cancel all running tasks
    for run_id, task in running_tasks.items():
        if not task.done():
            task.cancel()
            await log_to_db(run_id, 'warning', 'Service shutting down')
    
    # Wait for tasks to finish
    if running_tasks:
        await asyncio.gather(*running_tasks.values(), return_exceptions=True)
    
    sys.exit(0)


# Register signal handlers
for sig in (signal.SIGTERM, signal.SIGINT):
    asyncio.get_event_loop().add_signal_handler(sig, lambda s=sig: asyncio.create_task(shutdown(s)))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

"""Pobranie strony w budżecie (bez Chromium): tylko dla kandydata ocenionego
przez AI jako dobry, ze stroną www, bez e-maila. Strona główna, potem
podstrony kontaktu, do pierwszego znalezionego adresu."""

import re
from urllib.parse import urljoin, urlparse

import httpx

from . import filters
from .config import cfg, load_lines

CONTACT_PATHS = load_lines('subpage_paths.txt')
MAX_BYTES = 600_000
_TAG_RE = re.compile(r'<(script|style)[^>]*>.*?</\1>|<[^>]+>', re.DOTALL | re.IGNORECASE)


async def _get(client, url):
    try:
        async with client.stream('GET', url, timeout=cfg('TIMEOUT_SCRAPE', 12), follow_redirects=True,
                                 headers={'User-Agent': 'Mozilla/5.0 (compatible; FamiliadaLeadFinder/2.0)'}) as r:
            if r.status_code != 200 or 'html' not in r.headers.get('content-type', 'text/html'):
                return None
            body = b''
            async for chunk in r.aiter_bytes():
                body += chunk
                if len(body) > MAX_BYTES:
                    break
            return body.decode(r.encoding or 'utf-8', errors='replace')
    except (httpx.HTTPError, UnicodeDecodeError, ValueError):
        return None


async def find_emails(client, url, max_pages=3):
    """Zwraca (e-maile, liczba pobranych stron)."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return [], 0
    root = f'{parsed.scheme}://{parsed.hostname}/'
    pages = [root] + [urljoin(root, p) for p in CONTACT_PATHS]
    fetched = 0
    for page in pages[:max_pages]:
        raw = await _get(client, page)
        fetched += 1
        if not raw:
            continue
        emails = filters.extract_emails(_TAG_RE.sub(' ', raw), raw)
        if emails:
            return emails, fetched
    return [], fetched

"""Źródło 1: wyniki SearXNG — e-mail z tytułu i opisu wyniku, bez wchodzenia na stronę."""

import httpx

from .. import filters
from ..config import load_lines

ROLES = load_lines('roles.txt')
REGIONS = load_lines('regions.txt')
TEMPLATES = load_lines('templates.txt')


def query_pool():
    """Wszystkie zapytania: szablon × rola × region (bez regionu, gdy szablon go nie ma)."""
    pool = []
    for tpl in TEMPLATES:
        roles = ROLES if '{role}' in tpl else ['']
        regions = REGIONS if '{region}' in tpl else ['']
        for role in roles:
            for region in regions:
                q = ' '.join(tpl.replace('{role}', role).replace('{region}', region).split())
                if q not in pool:
                    pool.append(q)
    return pool


def result_to_candidate(res):
    """Wynik wyszukiwania → kandydat (dict) albo None, gdy nie ma czego oceniać."""
    url = (res.get('url') or '').strip()
    if not url.startswith(('http://', 'https://')):
        return None
    title = (res.get('title') or '').strip()
    snippet = (res.get('content') or '').strip()
    domain = filters.url_domain(url)
    emails = filters.extract_emails(f'{title} {snippet}')
    portal = filters.is_portal(domain)
    # Bez maila zostaje tylko własna strona firmy (pobranie w budżecie po ocenie AI).
    if not emails and portal:
        return None
    return {
        'source': 'search',
        'source_ref': url.split('#')[0][:1000],
        'name': title[:300],
        'url': url[:1000],
        'domain': '' if portal else domain,
        'emails': emails,
        'snippet': snippet[:600],
    }


async def search(client, base_url, query, pageno=1, timeout=25):
    """Zwraca (wyniki, liczba silników bez odpowiedzi)."""
    r = await client.get(f'{base_url}/search', params={
        'q': query, 'format': 'json', 'language': 'pl-PL', 'pageno': pageno, 'safesearch': 0,
    }, timeout=timeout)
    if r.status_code != 200:
        raise httpx.HTTPStatusError(f'SearXNG {r.status_code}', request=r.request, response=r)
    data = r.json()
    return data.get('results') or [], len(data.get('unresponsive_engines') or [])

"""Źródło: wyniki SearXNG dla fraz kategorii — e-mail z tytułu i opisu wyniku,
bez wchodzenia na stronę."""

import httpx

from .. import filters


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

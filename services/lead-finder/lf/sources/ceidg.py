"""Źródło 2: CEIDG — rejestr jednoosobowych firm (API Hurtowni Danych v3).

Lista firm po kodzie PKD (z rozwinięcia kategorii), potem szczegóły wpisu z e-mailem
i stroną www (jeśli przedsiębiorca je podał). Nazwy pól odpowiedzi
odczytywane ostrożnie (szukanie kluczy w całym wpisie), bo dokumentacja nie
była dostępna przy pisaniu — sprawdzić na kluczu (plan, etap 4).
Limit szczegółów ~50 na 3 min: odstęp CEIDG_DETAIL_DELAY.
"""

import asyncio

import httpx

from .. import filters

BASE_URL = 'https://dane.biznes.gov.pl/api/ceidg/v3'


def _find(obj, keys):
    """Pierwsza niepusta wartość tekstowa pod jednym z kluczy (rekurencyjnie)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in keys and isinstance(v, str) and v.strip():
                return v.strip()
        for v in obj.values():
            found = _find(v, keys)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _find(v, keys)
            if found:
                return found
    return None


def _pkd_list(obj):
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in ('pkd', 'pkdglowny', 'kod') and isinstance(v, str) and len(v) <= 8:
                out.append(v)
            else:
                out.extend(_pkd_list(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_pkd_list(v))
    return list(dict.fromkeys(out))


def firm_id(firm):
    return _find(firm, {'id'}) or ''


def firm_to_candidate(firm):
    firm_id = _find(firm, {'id'}) or ''
    name = _find(firm, {'nazwa', 'firma'}) or ''
    email = _find(firm, {'email', 'adresemail', 'e-mail'})
    www = _find(firm, {'www', 'adresstronyinternetowej', 'stronawww'})
    if www and not www.startswith(('http://', 'https://')):
        www = 'https://' + www
    emails = filters.extract_emails(email or '')
    if not firm_id or (not emails and not www):
        return None
    domain = filters.url_domain(www) if www else ''
    return {
        'source': 'ceidg',
        'source_ref': firm_id,
        'name': name[:300],
        'url': (www or f'https://aplikacja.ceidg.gov.pl/ceidg/ceidg.public.ui/search.aspx#{firm_id}')[:1000],
        'domain': domain,
        'emails': emails,
        'snippet': '',
        'pkd': _pkd_list(firm)[:10],
    }


class Ceidg:
    def __init__(self, client, token, detail_delay=4, request_deadline=60):
        self.client = client
        self.token = token
        self.detail_delay = detail_delay
        self.request_deadline = request_deadline

    @property
    def enabled(self):
        return bool(self.token)

    async def _get(self, path, params=None):
        for attempt in range(2):
            try:
                # Twardy limit całego zapytania: sam timeout httpx dotyczy pojedynczych
                # odczytów, więc wolno sączący się serwer mógł trzymać przebieg godzinami.
                r = await asyncio.wait_for(
                    self.client.get(f'{BASE_URL}{path}', params=params,
                                    headers={'Authorization': f'Bearer {self.token}'}, timeout=45),
                    self.request_deadline)
                if r.status_code == 204:
                    return {}
                r.raise_for_status()
                return r.json()
            except (httpx.TimeoutException, asyncio.TimeoutError):
                if attempt == 0:
                    await asyncio.sleep(2)
                    continue
                raise

    async def list_firms(self, pkd, page=1, limit=25):
        data = await self._get('/firmy', {'pkd': pkd.replace('.', ''), 'status': 'AKTYWNY', 'page': page, 'limit': limit})
        firms = data.get('firmy') or data.get('firma') or []
        has_next = bool((data.get('links') or {}).get('next'))
        return firms, has_next

    async def details(self, firm):
        firm_id = _find(firm, {'id'})
        if not firm_id:
            return firm
        await asyncio.sleep(self.detail_delay)
        data = await self._get(f'/firma/{firm_id}')
        items = data.get('firma') or data.get('firmy') or [data]
        return items[0] if isinstance(items, list) and items else items

"""Ocena AI paczkami: jedno zapytanie na 20–30 kandydatów, odpowiedź sprawdzana w kodzie.

AI nie podaje e-maila (e-mail zawsze ze źródła). Każdy id z paczki musi
wrócić dokładnie raz; brakujące i błędne pozycje wracają do kolejnej paczki.
"""

import json
import logging
import os
import re

from .config import cfg, load_text

log = logging.getLogger('lead_finder')

SYSTEM = ('You are a precise classifier. Return ONLY one valid JSON object, no markdown, '
          'no explanation outside JSON.')

PROVIDERS = {
    'groq': {'key': os.getenv('GROQ_API_KEY', ''), 'model': os.getenv('GROQ_MODEL', 'openai/gpt-oss-20b'),
             'endpoint': 'https://api.groq.com/openai/v1/chat/completions'},
    'deepseek': {'key': os.getenv('DEEP_SEEK_API_KEY', ''), 'model': os.getenv('DEEPSEEK_MODEL', 'deepseek-chat'),
                 'endpoint': 'https://api.deepseek.com/chat/completions'},
    'anthropic': {'key': os.getenv('ANTHROPIC_API_KEY', ''),
                  'model': os.getenv('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001'),
                  'endpoint': 'https://api.anthropic.com/v1/messages'},
}

QUOTA_WORDS = ('day', 'daily', 'quota', 'credit', 'unauthorized', 'insufficient', 'billing')


def item_for_lead(cid, c):
    item = {'id': cid, 'name': c.get('name') or '', 'site': c.get('domain') or c.get('url') or ''}
    if c.get('snippet'):
        item['text'] = c['snippet'][:cfg('AI_ITEM_TEXT_LIMIT', 600)]
    if c.get('pkd'):
        item['pkd'] = c['pkd']
    if c.get('emails'):
        item['email_domains'] = sorted({e.rpartition('@')[2] for e in c['emails']})
    return item


def item_for_review(cid, row):
    return {'id': cid, 'name': row.get('title') or '', 'site': row.get('url') or '',
            'text': (row.get('short_description') or '')[:400],
            'email_domain': (row.get('email') or '').rpartition('@')[2]}


def build_prompt(items, mode='lead'):
    base = load_text('ai_prompt.txt' if mode == 'lead' else 'ai_review_prompt.txt')
    return base.replace('{items}', json.dumps(items, ensure_ascii=False))


def _clean(v, limit):
    return ' '.join(str(v or '').split())[:limit]


def parse_results(content, ids):
    """JSON modelu → {id: {ok, title, short_description, reason}} tylko dla znanych id."""
    m = re.search(r'\{.*\}', content or '', re.DOTALL)
    if not m:
        raise ValueError('brak JSON w odpowiedzi')
    data = json.loads(m.group())
    rows = data.get('results') if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise ValueError('brak listy results')
    out, wanted = {}, set(ids)
    for r in rows:
        if not isinstance(r, dict):
            continue
        rid = str(r.get('id', ''))
        if rid not in wanted or rid in out:
            continue
        ok = r.get('ok')
        if ok in (1, True, '1', 'true'):
            ok = True
        elif ok in (0, False, '0', 'false'):
            ok = False
        else:
            continue
        reason = _clean(r.get('reason'), 300)
        if not reason:
            continue
        out[rid] = {
            'ok': ok,
            'group': _clean(r.get('group'), 2).upper(),
            'title': _clean(r.get('title'), 200),
            'short_description': _clean(r.get('short_description'), 300),
            'reason': reason,
        }
    return out


class Classifier:
    def __init__(self, db, client, stats=None):
        self.db = db
        self.client = client
        self.stats = stats

    async def _call(self, name, prompt):
        p = PROVIDERS.get(name)
        if not p or not p['key']:
            return 500, None, 'missing config'
        timeout = cfg('TIMEOUT_AI', 90)
        max_tokens = cfg('AI_MAX_TOKENS', 6000)
        try:
            if name == 'anthropic':
                r = await self.client.post(p['endpoint'], timeout=timeout, headers={
                    'x-api-key': p['key'], 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
                }, json={'model': p['model'], 'max_tokens': max_tokens, 'temperature': 0, 'system': SYSTEM,
                         'messages': [{'role': 'user', 'content': prompt}]})
                if r.status_code == 200:
                    parts = r.json().get('content') or []
                    text = ''.join(x.get('text', '') for x in parts if x.get('type') == 'text')
                    return 200, text, None
                return r.status_code, None, r.text.lower()[:300]
            r = await self.client.post(p['endpoint'], timeout=timeout, headers={
                'Authorization': f'Bearer {p["key"]}', 'Content-Type': 'application/json',
            }, json={'model': p['model'], 'temperature': 0, 'max_tokens': max_tokens,
                     'response_format': {'type': 'json_object'},
                     'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': prompt}]})
            if r.status_code == 200:
                choices = r.json().get('choices') or []
                text = (choices[0].get('message') or {}).get('content') if choices else None
                return 200, text, None
            return r.status_code, None, r.text.lower()[:300]
        except Exception as e:  # sieć, timeout, zły JSON odpowiedzi HTTP
            return 500, None, str(e)[:300]

    async def _cooldown(self, name, seconds, msg):
        await self.db.rpc('set_ai_provider_cooldown', {'p_name': name, 'p_seconds': seconds, 'p_error': msg[:500]})

    async def classify(self, items, mode='lead'):
        """{id: wynik} albo None, gdy żaden dostawca nie jest dostępny."""
        prompt = build_prompt(items, mode)
        ids = [i['id'] for i in items]
        providers = await self.db.rpc('get_available_ai_providers')
        if not providers:
            return None
        for p in providers if isinstance(providers, list) else [providers]:
            name = p['name']
            if self.stats:
                self.stats['ai_calls'] += 1
            status, content, err = await self._call(name, prompt)
            if status == 200:
                try:
                    res = parse_results(content, ids)
                except (ValueError, json.JSONDecodeError) as e:
                    log.error(f'Model {name}: niepoprawna odpowiedź ({e})')
                    await self._cooldown(name, 30, f'zły format: {e}')
                    continue
                log.info(f'Ocena {name}: {len(res)}/{len(ids)} pozycji')
                return res
            if any(w in str(err) for w in QUOTA_WORDS):
                await self._cooldown(name, cfg('PROVIDER_COOLDOWN_QUOTA', 86400), f'limit ({status}): {err}')
            elif status == 429:
                await self._cooldown(name, cfg('PROVIDER_COOLDOWN_SECONDS', 60), f'429: {err}')
            else:
                await self._cooldown(name, cfg('PROVIDER_COOLDOWN_LONG', 300), f'błąd {status}: {err}')
            log.info(f'Dostawca {name}: błąd {status}')
        return {}

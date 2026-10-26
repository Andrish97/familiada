"""Prywatne zlecenia pytań: rzeczywiste źródła, DeepSeek, baza i gry."""
import asyncio
import hashlib
import ipaddress
import json
import logging
import math
import socket
import uuid
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, StrictInt

from .resources import deepseek, BudgetUnavailable, ProviderUnavailable
from .sources.search import search

log = logging.getLogger('question_bank')
LANGUAGES = {'pl': 'Polish', 'en': 'English', 'uk': 'Ukrainian'}
MODEL = 'paraphrase-multilingual-minilm-l12-v2-qa-v1'


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def norm(text):
    return ' '.join(str(text or '').casefold().split()).rstrip('?!.')


def validate_question(raw, lang, kind, source=None, enrich=False):
    if not isinstance(raw, dict) or not isinstance(raw.get('text'), str) or not isinstance(raw.get('answers'), list):
        return None
    text = raw['text'].strip()
    if not 8 <= len(text) <= 500 or not 3 <= len(raw['answers']) <= 6:
        return None
    answers, seen = [], set()
    for answer in raw['answers']:
        if not isinstance(answer, dict) or not isinstance(answer.get('text'), str):
            return None
        label, points = answer['text'].strip(), answer.get('fixed_points')
        if not 1 <= len(label) <= 17 or isinstance(points, bool) or not isinstance(points, int) or not 1 <= points <= 100 or norm(label) in seen:
            return None
        seen.add(norm(label))
        answers.append({'text': label, 'fixed_points': points})
    if len(text)>100 or sum(a['fixed_points'] for a in answers) > 100:
        return None
    evidence = str(raw.get('evidence') or '').strip()
    if kind == 'search':
        if not source or len(evidence) < 8 or evidence not in source['content']:
            return None
        # Dowód musi zawierać treść każdej odpowiedzi i każdą liczbę.
        evidence_norm = norm(evidence)
        if norm(text) not in evidence_norm or (not enrich and any(norm(a['text']) not in evidence_norm for a in answers)):
            return None
        import re
        if not enrich and any(not re.search(r'(?<!\d)' + str(a['fixed_points']) + r'(?!\d)', evidence) for a in answers):
            return None
        provenance = {'url': source['url'], 'evidence': evidence[:5000], 'content_hash': source['hash'],
                      'fetched_at': datetime.now(timezone.utc).isoformat(), 'points_origin': 'estimated' if enrich else 'source',
                      'answers_origin': 'ai_completed' if enrich else 'source', 'source_kind': str(raw.get('source_kind') or 'published_material')[:80]}
    else:
        provenance = {'points_origin': 'estimated', 'model': 'deepseek-chat', 'generated_at': datetime.now(timezone.utc).isoformat()}
    return {'lang': lang, 'text': text, 'answers': sorted(answers, key=lambda a: -a['fixed_points']),
            'category_hint': str(raw.get('category_hint') or '')[:300], 'origin': kind, 'source': provenance}


async def public_address(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 80, 443):
        raise ValueError('unsafe_url')
    records = await asyncio.get_running_loop().getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    addresses = list(dict.fromkeys(record[4][0] for record in records))
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError('unsafe_address')
    return parsed, addresses[0]


async def fetch_source(client, url):
    """DNS przypięty do zatwierdzonego IP; każdy redirect sprawdzany od nowa."""
    for _ in range(5):
        parsed, address = await public_address(url)
        pinned = httpx.URL(url).copy_with(host=address)
        async with client.stream('GET', pinned, headers={'Host': parsed.netloc, 'User-Agent': 'FamiliadaQuestionFinder/1.0', 'Accept': 'text/html,text/plain'},
                                 extensions={'sni_hostname': parsed.hostname}, timeout=15, follow_redirects=False) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                url = urljoin(url, response.headers.get('location', ''))
                continue
            response.raise_for_status()
            if not any(t in response.headers.get('content-type', '') for t in ('text/html', 'text/plain', 'application/xhtml')):
                raise ValueError('unsupported_source')
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > 2_000_000:
                    raise ValueError('source_too_large')
            soup = BeautifulSoup(body.decode(response.encoding or 'utf-8', errors='replace'), 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe', 'form']):
                tag.decompose()
            content = '\n'.join(line.strip() for line in soup.get_text('\n').splitlines() if line.strip())
            return {'url': url, 'content': content[:24000], 'hash': hashlib.sha256(body).hexdigest()}
    raise ValueError('too_many_redirects')


class QuestionBank:
    def __init__(self, db, client, searx_url, api_key):
        self.db, self.client, self.searx_url, self.api_key = db, client, searx_url, api_key
        self.task = None

    async def rpc(self, name, params=None):
        result = await self.db.rpc(name, params or {})
        if result is None:
            raise ProviderUnavailable('Baza pytań jest chwilowo niedostępna.')
        return result

    async def embed(self, texts):
        if not texts:
            return []
        vectors = []
        for offset in range(0, len(texts), 32):
            response = await self.db.client.post(self.db.url + '/functions/v1/question-bank',
                headers={'X-Internal-Secret': self.api_key}, json={'action': 'embed', 'texts': texts[offset:offset+32]}, timeout=60)
            if response.status_code != 200:
                raise ProviderUnavailable('Model porównywania pytań jest niedostępny.')
            data = response.json()
            batch = data.get('vectors')
            if data.get('model') != MODEL or not isinstance(batch, list) or len(batch) != len(texts[offset:offset+32]):
                raise ProviderUnavailable('Niepoprawna odpowiedź modelu znaczenia.')
            for vector in batch:
                if not isinstance(vector, list) or len(vector) != 384 or any(not isinstance(n, (float, int)) or not math.isfinite(n) for n in vector):
                    raise ProviderUnavailable('Niepoprawny wektor pytania.')
            vectors.extend(batch)
        return vectors

    async def ask(self, prompt, max_tokens=3000):
        return await deepseek(self.db, self.client, prompt, 'questions', max_tokens)

    async def review(self, candidates, category, lang):
        if not candidates:
            return []
        prompt = ('Evaluate these survey-game questions in ' + LANGUAGES[lang] + '. Category requested (empty means general): ' + compact(category) + '. '
                  'Accept only natural, clear, family-friendly questions with many plausible survey answers, coherent mutually distinct answer groups, plausible ordered points and correct language. '
                  'Reject trivia with a single correct answer, ambiguity, duplicate/synonym answers and category mismatch. Do not rewrite text or points. '
                  'Return JSON {"accepted":[zero-based integer indices]}. Questions: ' + compact(candidates))
        result = await self.ask(prompt, 700)
        indices = result.get('accepted')
        if not isinstance(indices, list):
            raise ProviderUnavailable('Kontrola jakości zwróciła zły format.')
        accepted = {i for i in indices if type(i) is int and 0 <= i < len(candidates)}
        return [question for i, question in enumerate(candidates) if i in accepted]

    async def process(self, job):
        state = {'cursor': job['cursor'], 'queries': job['queries'], 'round': job['round'], 'status': 'queued', 'delay': 5, 'rejected': 0, 'duplicates': 0}
        try:
            remaining = job['target'] - job['accepted']
            candidates = []
            if job['kind'] == 'generated':
                recent = await self.db.select('producer_question_pool', {'lang': 'eq.' + job['lang'], 'select': 'text', 'order': 'created_at.desc', 'limit': 20}) or []
                result = await self.ask('Create ' + str(min(5, remaining)) + ' excellent Family Feud survey-style questions in ' + LANGUAGES[job['lang']] + '. '
                    'Category (empty means varied categories): ' + compact(job['category']) + '. Each question must have 4–6 short distinct answer groups, '
                    'Question max 100 characters; answer max 17 characters. Integer fixed_points 1–100, plausible unequal frequencies ordered from popular to rare, sum 90–100. These are estimates, never a real survey. '
                    'No trivia, no synonym answers, no repeated meaning or answer sets. Avoid: ' + compact(recent) + '. Variation seed: ' + str(uuid.uuid4()) + '. '
                    'Return {"questions":[{"text":"...","category_hint":"approximate description","answers":[{"text":"...","fixed_points":35}]}]}.', 3500)
                raw = result.get('questions', [])
                if not isinstance(raw, list):
                    raise ProviderUnavailable('Zły format wygenerowanych pytań.')
                candidates = [q for q in (validate_question(q, job['lang'], 'generated') for q in raw[:5]) if q]
                state['rejected'] += len(raw[:5]) - len(candidates)
            else:
                if state['cursor'] >= len(state['queries']):
                    result = await self.ask('Find sources of Family Feud survey-style questions in ' + LANGUAGES[job['lang']] + '. ' +
                        ('Answers and numeric points optional; focus on original questions. ' if job.get('enrich') else 'Require answers and numeric points. ') + 'Requested category: ' + compact(job['category']) + '. Return {"queries":[8 distinct search phrases]}. '
                        'Use native language names for the show, survey questions, answer points, episode transcripts. Do not return answers or URLs. '
                        'Broaden phrases but preserve category. Prior search round: ' + str(job['round']) + '. Avoid prior phrases: ' + compact(job['queries'][-12:]), 1200)
                    queries = result.get('queries')
                    if not isinstance(queries, list) or not queries:
                        raise ProviderUnavailable('AI nie przygotowała fraz wyszukiwania.')
                    state['queries'] = [{'query': str(q)[:200], 'page': page} for q in queries[:8] if isinstance(q, str) and q.strip() for page in (1, 2)]
                    state['cursor'] = 0
                    state['round'] += 1
                if not state['queries']:
                    raise ProviderUnavailable('Brak poprawnych fraz.')
                item = state['queries'][state['cursor']]
                if 'query' in item:
                    results, dead = await search(self.client, self.searx_url, item['query'], item.get('page', 1), owner='questions', language={'pl': 'pl-PL', 'en': 'en-US', 'uk': 'uk-UA'}[job['lang']])
                    links, seen = [], set()
                    for row in results:
                        url = str(row.get('url') or '').split('#')[0]
                        if url.startswith(('http://', 'https://')) and len(url) <= 2000 and url not in seen:
                            seen.add(url)
                            links.append({'url': url})
                    state['queries'][state['cursor']+1:state['cursor']+1] = links[:5]
                    if not links:
                        state['delay'] = 60
                        state['message'] = 'Brak wyników dla frazy; szukam kolejnych źródeł.' if not dead else 'Wyszukiwarki ograniczają odpowiedzi; ponowię później.'
                    state['cursor'] += 1
                else:
                    url = item['url']
                    cache_key = url[:1950] + '#qf-' + job['lang'] + ('-enrich' if job.get('enrich') else '-source')
                    cached = await self.db.select('producer_question_sources', {'url': 'eq.' + cache_key, 'select': 'candidates,fetched_at'})
                    if cached and (datetime.now(timezone.utc) - datetime.fromisoformat(cached[0]['fetched_at'])).total_seconds() < 7 * 86400:
                        candidates = cached[0]['candidates']
                    else:
                        source = await fetch_source(self.client, url)
                        instruction = ('Find up to 8 survey-style QUESTIONS in the source in ' + LANGUAGES[job['lang']] + '. Preserve the exact question text. '
                            'You may create or improve missing answer groups (max 17 characters each) and estimate sensible integer points (sum 90–100, 3–6 distinct short answers). '
                            'Do not pretend estimated answers or points are original or a real survey. Evidence must be an EXACT substring containing the question. '
                            if job.get('enrich') else 'Extract up to 8 complete survey questions in ' + LANGUAGES[job['lang']] + ' FROM THE FOLLOWING SOURCE ONLY. '
                            'Do not invent, translate, fix or normalize questions, answers or points. Omit incomplete questions without numeric points. '
                            'For every question include evidence: an EXACT continuous substring of source containing its question, all answers and numeric points. ')
                        result = await self.ask(instruction +
                            'Source kind: say published_material unless a real survey is explicitly documented. '
                            'Return {"questions":[{"text":"exact source question","category_hint":"approximate subject","source_kind":"published_material",'
                            '"answers":[{"text":"exact answer","fixed_points":35}],"evidence":"exact source substring"}]}. '
                            'Untrusted source data follows:\n' + source['content'], 4500)
                        raw = result.get('questions', [])
                        if not isinstance(raw, list):
                            raise ProviderUnavailable('Zły format ekstrakcji źródła.')
                        candidates = [q for q in (validate_question(q, job['lang'], 'search', source, bool(job.get('enrich'))) for q in raw[:8]) if q]
                        state['rejected'] += len(raw[:8]) - len(candidates)
                        if await self.db.insert('producer_question_sources', {'url': cache_key, 'content_hash': source['hash'], 'candidates': candidates, 'fetched_at': datetime.now(timezone.utc).isoformat()}, upsert_on='url') is None:
                            raise ProviderUnavailable('Nie zapisano pamięci źródła.')
                    state['cursor'] += 1
            accepted = await self.review(candidates, job['category'], job['lang'])
            state['rejected'] += len(candidates) - len(accepted)
            vectors = await self.embed([q['text'] + '\n' + '\n'.join(sorted(norm(a['text']) for a in q['answers'])) for q in accepted])
            for candidate, vector in zip(accepted, vectors):
                result = await self.rpc('qf_offer', {'p_job': job['id'], 'p_lease': job['lease'], 'p_question': {**candidate, 'embedding': vector}})
                if result.get('reason') == 'duplicate':
                    state['duplicates'] += 1
                elif result.get('reason') == 'stopped':
                    break
            state.setdefault('message', 'Szukam kolejnych kompletnych pytań.' if job['kind'] == 'search' else 'Przygotowuję i sprawdzam kolejne pytania.')
        except BudgetUnavailable:
            state['cursor'] = job['cursor'] if state['queries'] == job['queries'] else state['cursor']
            state.update(status='waiting_budget', delay=3600, message='Dzienny budżet AI tej usługi wyczerpany. Postęp zapisany; wznowię po odnowieniu.')
        except ProviderUnavailable as error:
            state['cursor'] = job['cursor'] if state['queries'] == job['queries'] else state['cursor']
            state.update(status='waiting_provider', delay=120, message=str(error))
        except (httpx.HTTPError, ValueError, OSError):
            state['cursor'] += 1
            state.update(delay=30, message='Źródło niedostępne lub niekompletne; przechodzę do kolejnego.')
            state['rejected'] += 1
        except Exception:
            log.exception('question_job_failed id=%s', job['id'])
            state.update(status='waiting_provider', delay=300, message='Błąd przetwarzania. Postęp zachowany; ponowię później.')
        await self.rpc('qf_job_checkpoint', {'p_id': job['id'], 'p_lease': job['lease'], 'p_state': state})

    async def worker(self):
        while True:
            try:
                job = await self.db.rpc('qf_job_claim')
                if job:
                    await self.process(job)
                else:
                    await asyncio.sleep(3)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.error('question_worker_retry')
                await asyncio.sleep(15)

    async def overview(self, body):
        lang = body.get('lang')
        rows = await self.db.select_all('producer_question_pool', 'id,lang,text,answers,category_hint,origin,source,created_at', extra={'lang': f'eq.{lang}'})
        if rows is None:
            raise ProviderUnavailable('Nie można wczytać puli pytań.')
        jobs = await self.db.select('producer_question_jobs', {'lang': f'eq.{lang}', 'select': 'id,lang,kind,enrich,category,target,accepted,rejected,duplicates,status,message,next_run_at,created_at', 'order': 'created_at.desc', 'limit': 50})
        games = await self.db.select('producer_question_games', {'lang': f'eq.{lang}', 'select': 'id,lang,title,description,mode,category,payload,published_id,created_at,published:market_games(status)', 'order': 'created_at.desc', 'limit': 100})
        if jobs is None or games is None:
            raise ProviderUnavailable('Nie można wczytać zleceń lub gier.')
        published_ids = {game['published_id'] for game in games if game.get('published_id')}
        legacy = await self.db.select('market_games', {'lang': f'eq.{lang}', 'origin': 'eq.producer', 'select': 'id,lang,title,description,payload,status,created_at', 'order': 'created_at.desc'})
        if legacy is None:
            raise ProviderUnavailable('Nie można wczytać istniejących gier Producenta.')
        games.extend({**game, 'published_id': game['id'], 'published': {'status': game['status']}, 'legacy': True, 'mode': 'legacy', 'category': ''} for game in legacy if game['id'] not in published_ids)
        return {'ok': True, 'questions': rows, 'jobs': jobs, 'games': games, 'used_count': sum(len(game.get('payload', {}).get('questions', [])) for game in games if not game.get('legacy'))}

    async def create_games(self, body):
        lang, mode = body['lang'], body.get('mode')
        count, quantity = body.get('count'), 1 if mode == 'manual' else body.get('quantity')
        if type(count) is not int or count < 10 or type(quantity) is not int or quantity < 1 or mode not in ('manual', 'auto', 'category'):
            raise ValueError('Podaj liczbę gier od 1 i pytań w każdej od 10.')
        total = count * quantity
        if total > 10000:
            raise ValueError('Jednorazowo utwórz gry z maksymalnie 10 000 pytań.')
        category = str(body.get('category') or '').strip()[:200]
        if mode == 'category' and not category:
            raise ValueError('Wpisz kategorię gier.')
        existing = await self.db.select('producer_question_games', {'batch_id': 'eq.' + str(uuid.UUID(body['request_id'])), 'select': '*', 'order': 'created_at,id'})
        if existing:
            return {'ok': True, 'games': existing}
        vector = (await self.embed([category]))[0] if mode == 'category' else None
        params = {'p_lang': lang, 'p_include_ai': bool(body.get('include_ai')) or mode == 'manual', 'p_limit': max(total * 5, 500)}
        # PostgREST zachowuje null jako wartość JSONB; brak argumentu daje SQL NULL.
        if vector is not None:
            params['p_embedding'] = vector
        candidates = await self.rpc('qf_candidates', params)
        if mode == 'manual':
            ids = body.get('ids')
            if not isinstance(ids, list) or len(set(ids)) != count:
                raise ValueError('Wybierz dokładnie tyle różnych pytań, ile ma zawierać gra.')
            validated_ids = [str(uuid.UUID(value)) for value in ids]
            candidates = await self.db.select('producer_question_pool', {'lang': 'eq.' + lang, 'id': 'in.(' + ','.join(validated_ids) + ')', 'select': '*'})
            if candidates is None:
                raise ProviderUnavailable('Nie można wczytać wybranych pytań.')
            order = {value: index for index, value in enumerate(validated_ids)}
            candidates.sort(key=lambda q: order[q['id']])
            if not str(body.get('title') or '').strip() or not str(body.get('description') or '').strip():
                raise ValueError('Wpisz nazwę i opis gry.')
        elif mode == 'category':
            relevant = []
            for offset in range(0, len(candidates), 30):
                batch = candidates[offset:offset+30]
                result = await self.ask('Select ONLY questions whose full meaning fits category ' + compact(category) + ' in ' + LANGUAGES[lang] + '. '
                    'No fixed category labels. Do not broaden the requested meaning to fill a count. Return {"ids":[matching IDs]}. '
                    'Candidates: ' + compact([{'id': q['id'], 'text': q['text'], 'answers': [a['text'] for a in q['answers']]} for q in batch]), 1600)
                accepted_ids = result.get('ids')
                if not isinstance(accepted_ids, list):
                    raise ProviderUnavailable('Niepoprawny wynik dopasowania kategorii.')
                relevant.extend(q for q in batch if q['id'] in accepted_ids)
                if len(relevant) >= total:
                    break
            candidates = relevant
        if len(candidates) < total:
            raise ValueError(f'Za mało pasujących pytań: {len(candidates)}/{total}. Gry nie powstały. Zbierz pytania i spróbuj ponownie.')
        chosen = candidates[:total]
        if mode == 'manual':
            metadata = [{'title': body['title'].strip(), 'description': body['description'].strip()}]
        else:
            metadata = []
            # Małe paczki metadanych; bez ponownego wysyłania pełnych źródeł.
            for offset in range(0, quantity, 5):
                batches = [[q['text'] for q in chosen[i*count:(i+1)*count]] for i in range(offset, min(quantity, offset+5))]
                inputs = [{'game_index': offset + index, 'questions': questions} for index, questions in enumerate(batches)]
                prompt = ('Create metadata for exactly ' + str(len(inputs)) + ' GAMES in ' + LANGUAGES[lang] + '. '
                    'Each object below is ONE GAME; its questions all belong to that same game, not separate games. '
                    'Write one natural title (2–5 words) and an inviting description (2–3 sentences) per GAME. '
                    'Match its actual questions; do not claim a real survey. Distinct titles and descriptions. Category: ' + compact(category) + '. '
                    'Return exactly {"games":[{"game_index":0,"title":"...","description":"..."}]} with exactly ' + str(len(inputs)) + ' items, in input order. Input games: ' + compact(inputs))
                rows = None
                for attempt in range(2):
                    result = await self.ask(prompt + (' Your previous response had the wrong number of games. Follow the exact output schema and count.' if attempt else ''), 2500)
                    items = result.get('games')
                    if isinstance(items, list) and len(items) == len(inputs) and all(isinstance(item, dict) and isinstance(item.get('title'), str) and item['title'].strip() and isinstance(item.get('description'), str) and item['description'].strip() for item in items):
                        rows = items
                        break
                    log.warning('question_metadata_shape expected=%s keys=%s type=%s count=%s', len(inputs), sorted(result.keys()), type(items).__name__, len(items) if isinstance(items, (list, dict)) else -1)
                if rows is None:
                    raise ProviderUnavailable('Brak pełnych nazw i opisów. Żadna gra nie została zapisana.')
                metadata.extend(rows)
            if len({norm(m.get('title')) for m in metadata}) != quantity:
                raise ProviderUnavailable('AI powtórzyła nazwy gier. Żadna gra nie została zapisana; spróbuj ponownie.')
        if any(not isinstance(m, dict) or not isinstance(m.get('title'), str) or not 1 <= len(m['title'].strip()) <= 120 or not isinstance(m.get('description'), str) or not m['description'].strip() for m in metadata):
            raise ProviderUnavailable('Niepełna nazwa lub opis; gry nie zostały zapisane.')
        games = await self.rpc('qf_games_commit', {'p_request': body['request_id'], 'p_lang': lang, 'p_mode': mode, 'p_category': category,
            'p_ids': [q['id'] for q in chosen], 'p_metadata': metadata, 'p_count': count})
        return {'ok': True, 'games': games}


class RequestBody(BaseModel):
    lang: str = Field(pattern='^(pl|en|uk)$')
    request_id: uuid.UUID | None = None
    kind: str | None = None
    target: StrictInt | None = None
    category: str = Field(default='', max_length=200)
    job_id: uuid.UUID | None = None
    control: str | None = None
    mode: str | None = None
    count: StrictInt | None = None
    quantity: StrictInt | None = None
    ids: list[uuid.UUID] = Field(default_factory=list)
    title: str = Field(default='', max_length=120)
    description: str = Field(default='', max_length=10000)
    include_ai: bool = False
    enrich: bool = False
    game_id: uuid.UUID | None = None


def router_for(bank, authenticate):
    from fastapi import Depends
    router = APIRouter(prefix='/api/questions', dependencies=[Depends(authenticate)])

    @router.post('/{action}')
    async def action(action: str, request: RequestBody):
        body = request.model_dump(mode='json')
        try:
            if action == 'overview':
                return await bank.overview(body)
            if action == 'collect':
                if not request.request_id or request.kind not in ('search', 'generated') or type(request.target) is not int or request.target < 1:
                    raise ValueError('Podaj liczbę nowych pytań i wybierz wyszukiwanie albo generowanie.')
                job = await bank.rpc('qf_job_create', {'p_request': body['request_id'], 'p_lang': body['lang'], 'p_kind': body['kind'], 'p_target': body['target'], 'p_category': body['category'], 'p_enrich': body['enrich']})
                return {'ok': True, 'job': job}
            if action == 'control':
                if not request.job_id or request.control not in ('pause', 'resume', 'cancel'):
                    raise ValueError('Niepoprawne sterowanie zleceniem.')
                rows = await bank.db.select('producer_question_jobs', {'id': 'eq.' + body['job_id'], 'lang': 'eq.' + body['lang'], 'select': 'id'})
                if not rows:
                    raise HTTPException(404, 'Nie znaleziono zlecenia w tym języku.')
                return {'ok': await bank.rpc('qf_job_control', {'p_id': body['job_id'], 'p_action': body['control']})}
            if action == 'create':
                if not request.request_id:
                    raise ValueError('Brak identyfikatora żądania.')
                return await bank.create_games(body)
            if action in ('publish', 'unpublish'):
                if not request.game_id:
                    raise ValueError('Wybierz grę.')
                rows = await bank.db.select('producer_question_games', {'id': 'eq.' + body['game_id'], 'lang': 'eq.' + body['lang'], 'select': 'id'})
                if not rows:
                    legacy = await bank.db.select('market_games', {'id': 'eq.' + body['game_id'], 'lang': 'eq.' + body['lang'], 'origin': 'eq.producer', 'select': 'id'})
                    if not legacy:
                        raise HTTPException(404, 'Nie znaleziono gry.')
                    ok = await bank.db.update('market_games', {'status': 'published' if action == 'publish' else 'withdrawn'}, {'id': 'eq.' + body['game_id'], 'lang': 'eq.' + body['lang'], 'origin': 'eq.producer'})
                    return {'ok': ok}
                return await bank.rpc('qf_publish', {'p_id': body['game_id']}) if action == 'publish' else {'ok': await bank.rpc('qf_unpublish', {'p_id': body['game_id']})}
            raise HTTPException(404, 'Nieznana akcja.')
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        except BudgetUnavailable as error:
            raise HTTPException(429, str(error)) from None
        except ProviderUnavailable as error:
            raise HTTPException(503, str(error)) from None
    return router

"""Prywatne zlecenia pytań: rzeczywiste źródła, DeepSeek, baza i gry."""
import asyncio
import hashlib
import ipaddress
import json
import logging
import math
import re
import socket
import uuid
from datetime import datetime, timedelta, timezone
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

EXCLUDED_DOMAINS = {
    'facebook.com', 'm.facebook.com', 'instagram.com', 'twitter.com', 'x.com',
    'tiktok.com', 'youtube.com', 'youtu.be', 'linkedin.com', 'pinterest.com',
    'reddit.com', 'allegro.pl', 'ceneo.pl', 'olx.pl', 'amazon.com', 'ebay.com',
    'aliexpress.com', 'wykop.pl', 'filmweb.pl', 'imdb.com', 'gov.pl', 'sejm.gov.pl',
    'bip.gov.pl', 'stat.gov.pl', 'podatki.gov.pl', 'zus.pl'
}

EXCLUDED_EXTENSIONS = (
    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.mkv',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
)


def is_excluded_url(url):
    try:
        parts = urlsplit(url)
        host = (parts.hostname or '').lower()
        if host.startswith('www.'):
            host = host[4:]
        if host in EXCLUDED_DOMAINS or any(host.endswith('.' + d) for d in EXCLUDED_DOMAINS):
            return True
        path = (parts.path or '').lower()
        if any(path.endswith(ext) for ext in EXCLUDED_EXTENSIONS):
            return True
        if any(s in path for s in ('/login', '/signin', '/rejestracja', '/regulamin', '/polityka-prywatnosci', '/privacy-policy', '/terms', '/cart', '/koszyk')):
            return True
        return False
    except Exception:
        return True


def is_promising_source(content, lang, enrich=False):
    if not content or len(content.strip()) < 40:
        return False
    keywords = ('pytani', 'odpowiedzi', 'familiad', 'ankieta', 'teleturniej', 'feud', 'survey', 'question', 'quiz', 'питання', 'відповід')
    content_lower = content[:6000].lower()
    has_qmark = '?' in content
    has_keyword = any(k in content_lower for k in keywords)
    if not has_qmark and not has_keyword:
        return False
    if not enrich:
        import re
        digits = re.findall(r'\b(?:[1-9][0-9]?|100)\b', content)
        if len(digits) < 3:
            return False
    return True


def focus_text(content, limit=12000, after=14):
    """Tylko fragmenty strony wokół pytań (linia ze znakiem zapytania i kilka
    kolejnych linii z odpowiedziami), w kolejności strony, do limitu znaków.
    Bez pytań — początek strony jak dotąd. Fragmenty to ciągłe kawałki treści."""
    lines = str(content or '').split('\n')
    scored = [bool(re.search(r'(?<!\d)(?:[1-9]\d?|100)(?!\d)', line)) for line in lines]
    ranges = []
    for i, line in enumerate(lines):
        # Pytanie: znak zapytania albo linia bez liczb, po której są >= 3 linie z punktami.
        if '?' in line or (len(line) > 15 and not scored[i] and sum(scored[i + 1:i + 9]) >= 3):
            start, end = max(0, i - 1), min(len(lines), i + after + 1)
            if ranges and start <= ranges[-1][1]:
                ranges[-1][1] = max(ranges[-1][1], end)
            else:
                ranges.append([start, end])
    if not ranges:
        return str(content or '')[:limit]
    out, size = [], 0
    for start, end in ranges:
        part = '\n'.join(lines[start:end])
        if size + len(part) > limit:
            part = part[:max(0, limit - size)]
        if part:
            out.append(part)
            size += len(part) + 2
        if size >= limit:
            break
    return '\n\n'.join(out)


IDLE_LIMIT = 25  # pustych prób przypominania z rzędu, po których zlecenie się wstrzymuje


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def norm(text):
    return ' '.join(str(text or '').casefold().split()).rstrip('?!.')


def embedding_text(question):
    return question['text'] + '\n' + '\n'.join(sorted(norm(a['text']) for a in question['answers']))


def _words(text):
    return re.findall(r'\w+', str(text or '').lower())


def evidence_window(content, question, size=700):
    """Fragment strony z pytaniem (słowa w tej samej kolejności, dowolne znaki
    między nimi) albo None. Zwraca oryginalny tekst strony od pytania."""
    words = _words(question)
    if len(words) < 2:
        return None
    flat = ' '.join(str(content or '').split())
    match = re.search(r'\W+'.join(re.escape(w) for w in words), flat, re.IGNORECASE)
    return flat[match.start():match.start() + size] if match else None


def answer_in(window, answer):
    """Odpowiedź i jej liczba punktów obok siebie (przed albo po, do 40 znaków)."""
    words = _words(answer['text'])
    text = window.lower()
    points = re.compile(r'(?<!\d)' + str(answer['fixed_points']) + r'(?!\d)')
    for found in re.finditer(r'\W+'.join(re.escape(w) for w in words), text) if words else []:
        if points.search(text[found.end():found.end() + 40]) or points.search(text[max(0, found.start() - 40):found.start()]):
            return True
    return False


def fix_caps(text):
    text = (text or '').strip()
    if not text:
        return text
    letters = [c for c in text if c.isalpha()]
    if letters and sum(1 for c in letters if c.isupper()) / len(letters) > 0.7 and len(letters) > 3:
        chars = list(text.lower())
        for i, c in enumerate(chars):
            if c.isalpha():
                chars[i] = c.upper()
                break
        return ''.join(chars)
    return text


def validate_question(raw, lang, kind, source=None, enrich=False):
    if not isinstance(raw, dict) or not isinstance(raw.get('text'), str) or not isinstance(raw.get('answers'), list):
        return None
    text = fix_caps(raw['text'])
    if not 8 <= len(text) <= 500 or not 3 <= len(raw['answers']) <= 6:
        return None
    answers, seen = [], set()
    for answer in raw['answers']:
        if not isinstance(answer, dict) or not isinstance(answer.get('text'), str):
            return None
        label, points = fix_caps(answer['text']), answer.get('fixed_points')
        if not 1 <= len(label) <= 17 or isinstance(points, bool) or not isinstance(points, int) or not 1 <= points <= 100 or norm(label) in seen:
            return None
        seen.add(norm(label))
        answers.append({'text': label, 'fixed_points': points})
    if len(text)>100 or sum(a['fixed_points'] for a in answers) > 100:
        return None
    evidence = str(raw.get('evidence') or '').strip()
    if kind == 'search':
        if not source:
            return None
        if not evidence:
            # Dowód z treści strony wyznacza kod (AI nie przepisuje cytatu — mniej tokenów).
            evidence = evidence_window(source['content'], text, 900) or ''
        if len(evidence) < 8 or (evidence not in source['content'] and evidence not in ' '.join(source['content'].split())):
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
        async with client.stream('GET', pinned, headers={'Host': parsed.netloc, 'User-Agent': 'FamilijnaQuestionFinder/1.0', 'Accept': 'text/html,text/plain'},
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

    async def note(self, lang, message, level='info', job_id=None):
        """Wpis dziennika zlecenia widoczny w panelu (bez sekretów; błąd zapisu nie przerywa pracy)."""
        try:
            await self.db.insert('producer_question_logs', {'lang': lang, 'job_id': job_id, 'level': level, 'message': str(message)[:4000]})
        except Exception:
            log.error('question_log_write_failed lang=%s', lang)

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
                  'Reject trivia with a single correct answer, ambiguity, duplicate/synonym answers, ALL-CAPS uppercase screaming text and category mismatch. Do not rewrite text or points. '
                  'Return JSON {"accepted":[zero-based integer indices]}. Questions: ' + compact(candidates))
        result = await self.ask(prompt, 700)
        indices = result.get('accepted')
        if not isinstance(indices, list):
            raise ProviderUnavailable('Kontrola jakości zwróciła zły format.')
        accepted = {i for i in indices if type(i) is int and 0 <= i < len(candidates)}
        return [question for i, question in enumerate(candidates) if i in accepted]

    async def drop_known(self, lang, items, state):
        """Wczesne odsiewanie: powtórzenia w paczce i pytania znane z puli, historii lub
        gier Producenta odpadają przed wyszukiwaniem stron i kontrolą jakości AI.
        Zwraca (nowe pytania, wektory wg treści) — wektory wracają przy zapisie."""
        unique, seen = [], set()
        for item in items:
            key = norm(item['text'])
            if key in seen:
                state['duplicates'] += 1
                continue
            seen.add(key)
            unique.append(item)
        if not unique:
            return [], {}
        vectors = await self.embed([embedding_text(q) for q in unique])
        result = await self.rpc('qf_known_questions', {'p_lang': lang, 'p_questions': [
            {'text': q['text'], 'answers': q['answers'], 'embedding': v} for q, v in zip(unique, vectors)]})
        if not isinstance(result, dict) or not isinstance(result.get('known'), list):
            raise ProviderUnavailable('Nie można sprawdzić powtórzeń pytań.')
        known = {i for i in result['known'] if type(i) is int}
        state['duplicates'] += len(known)
        return [q for i, q in enumerate(unique) if i not in known], {norm(q['text']): v for q, v in zip(unique, vectors)}

    async def recall(self, job, seen):
        """Krótka prośba do DeepSeeka o znane pytania ankietowe — bez źródeł stron w prompcie."""
        # Powtórzenia odsiewa drop_known (bez AI); lista do pominięcia tylko kieruje
        # DeepSeeka — krótka, bo to największa stała część kosztu prośby.
        recent = await self.db.select('producer_question_pool', {'lang': 'eq.' + job['lang'], 'select': 'text', 'order': 'created_at.desc', 'limit': 15}) or []
        avoid = list(dict.fromkeys([r['text'] for r in recent] + seen[-25:]))
        result = await self.ask('List up to 10 survey questions in ' + LANGUAGES[job['lang']] + ' that were really used in the TV show '
            + {'pl': '"Familiada"', 'en': '"Family Feud"', 'uk': '"Сто к одному" or Ukrainian "Family Feud"'}[job['lang']]
            + ' or published as its survey questions (fan sites, quizzes, transcripts). Category (empty means varied): ' + compact(job['category']) + '. '
            'Give the exact wording as it is commonly published, so it can be found with an exact-phrase web search. '
            'Each question: 3–6 short distinct answers (max 17 characters) with the points you remember, ordered from most popular. '
            'Question max 100 characters. No trivia with one correct answer. Natural sentence case, never ALL-CAPS. '
            'Do not repeat or paraphrase any of these: ' + compact(avoid) + '. '
            'Return {"questions":[{"text":"...","category_hint":"approximate subject","answers":[{"text":"...","fixed_points":35}]}]}.', 2600)
        raw = result.get('questions', [])
        if not isinstance(raw, list):
            raise ProviderUnavailable('Zły format propozycji pytań.')
        seen_norm = set(seen) | {norm(t) for t in avoid}
        out = []
        for item in raw[:10]:
            q = validate_question(item, job['lang'], 'generated')
            if q and norm(q['text']) not in seen_norm:
                seen_norm.add(norm(q['text']))
                out.append(q)
        return out

    async def verify_sources(self, job, proposals, state, budget=200):
        """Potwierdzenie na stronie: pytanie (i przy braku uzupełniania — wszystkie
        odpowiedzi z punktami) w jednym fragmencie. Bez potwierdzenia — odrzucone."""
        started = asyncio.get_running_loop().time()
        confirmed, pages = [], []
        language = {'pl': 'pl-PL', 'en': 'en-US', 'uk': 'uk-UA'}[job['lang']]
        for proposal in proposals:
            if asyncio.get_running_loop().time() - started > budget:
                break
            try:
                results, _ = await search(self.client, self.searx_url, '"' + proposal['text'].rstrip('?!. ') + '"', 1, owner='questions', language=language)
            except (httpx.HTTPError, ValueError):
                continue
            urls = []
            for row in results:
                url = str(row.get('url') or '').split('#')[0]
                if url.startswith(('http://', 'https://')) and len(url) <= 2000 and not is_excluded_url(url) and url not in urls:
                    urls.append(url)
            match = None
            for url in urls[:2]:
                try:
                    source = await fetch_source(self.client, url)
                except (httpx.HTTPError, ValueError, OSError):
                    continue
                window = evidence_window(source['content'], proposal['text'])
                if window:
                    match = (source, window)
                    break
            if not match:
                state['rejected'] += 1
                continue
            source, window = match
            pages.append(source['url'])
            complete = all(answer_in(window, a) for a in proposal['answers'])
            if not complete and not job.get('enrich'):
                state['rejected'] += 1
                continue
            confirmed.append({**proposal, 'origin': 'search', 'source': {
                'url': source['url'], 'evidence': window, 'content_hash': source['hash'],
                'fetched_at': datetime.now(timezone.utc).isoformat(),
                'points_origin': 'source' if complete else 'estimated',
                'answers_origin': 'source' if complete else 'ai_completed',
                'source_kind': 'published_material', 'found_by': 'deepseek_recall'}})
        return confirmed, pages

    async def extract_page(self, job, url, state):
        """Pełny odczyt strony, która już potwierdziła pytanie (pamięć 7 dni)."""
        cache_key = url[:1950] + '#qf-' + job['lang'] + ('-enrich' if job.get('enrich') else '-source')
        cached = await self.db.select('producer_question_sources', {'url': 'eq.' + cache_key, 'select': 'candidates,fetched_at'})
        if cached and (datetime.now(timezone.utc) - datetime.fromisoformat(cached[0]['fetched_at'])).total_seconds() < 7 * 86400:
            return cached[0]['candidates']
        source = await fetch_source(self.client, url)
        candidates = []
        if is_promising_source(source['content'], job['lang'], bool(job.get('enrich'))):
            instruction = ('Find up to 8 survey-style QUESTIONS in the source in ' + LANGUAGES[job['lang']] + '. '
                'Category requested (if specified): ' + compact(job['category']) + '. '
                'Focus exclusively on Family Feud / survey questions with multiple respondent answers (e.g. "Name something...", "What do people do when..."). '
                'Reject single-correct-answer trivia, general knowledge tests or facts with 1 answer. Preserve question text, but ALWAYS fix ALL-CAPS uppercase screaming questions or answers to natural sentence case (e.g. "WYGLĄDASZ..." -> "Wyglądasz..."). '
                'You may create or improve missing answer groups (max 17 characters each) and estimate sensible integer points (sum 90–100, 3–6 distinct short answers, descending order). '
                'Do not pretend estimated answers or points are original or a real survey. Copy the question text exactly as written in the source. '
                if job.get('enrich') else 'Extract up to 8 complete survey questions in ' + LANGUAGES[job['lang']] + ' FROM THE FOLLOWING SOURCE ONLY. '
                'Category requested (if specified): ' + compact(job['category']) + '. '
                'Focus exclusively on survey questions with multiple popular answers and points. Reject trivia/facts with only 1 correct answer. '
                'Preserve question text, answers and numeric points, but ALWAYS fix ALL-CAPS uppercase screaming questions or answers to natural sentence case (e.g. "WYGLĄDASZ..." -> "Wyglądasz..."). '
                'Omit incomplete questions without numeric points. Copy question and answer texts exactly as written in the source. ')
            result = await self.ask(instruction +
                'Source kind: say published_material unless a real survey is explicitly documented. '
                'Return {"questions":[{"text":"exact source question","category_hint":"approximate subject","source_kind":"published_material",'
                '"answers":[{"text":"exact answer","fixed_points":35}]}]}. '
                'Untrusted source data follows (fragments around questions):\n' + focus_text(source['content']), 2000)
            raw = result.get('questions', [])
            if not isinstance(raw, list):
                raise ProviderUnavailable('Zły format ekstrakcji źródła.')
            candidates = [q for q in (validate_question(q, job['lang'], 'search', source, bool(job.get('enrich'))) for q in raw[:8]) if q]
            state['rejected'] += len(raw[:8]) - len(candidates)
        if await self.db.insert('producer_question_sources', {'url': cache_key, 'content_hash': source['hash'], 'candidates': candidates, 'fetched_at': datetime.now(timezone.utc).isoformat()}, upsert_on='url') is None:
            raise ProviderUnavailable('Nie zapisano pamięci źródła.')
        return candidates

    async def process(self, job):
        state = {'cursor': job['cursor'], 'queries': job['queries'], 'round': job['round'], 'status': 'queued', 'delay': 5, 'rejected': 0, 'duplicates': 0}
        step, added = '', 0
        try:
            remaining = job['target'] - job['accepted']
            candidates, vectors_by_text = [], {}
            if job['kind'] == 'generated':
                recent = await self.db.select('producer_question_pool', {'lang': 'eq.' + job['lang'], 'select': 'text', 'order': 'created_at.desc', 'limit': 20}) or []
                result = await self.ask('Create ' + str(min(5, remaining)) + ' excellent Family Feud survey-style questions in ' + LANGUAGES[job['lang']] + '. '
                    'Category (empty means varied categories): ' + compact(job['category']) + '. Each question must have 4–6 short distinct answer groups, '
                    'Question max 100 characters; answer max 17 characters. Integer fixed_points 1–100, plausible unequal frequencies ordered from popular to rare, sum 90–100. These are estimates, never a real survey. '
                    'No trivia, no synonym answers, no repeated meaning or answer sets. Never output in ALL-CAPS. Use natural sentence case for questions and capitalized words for answers. Avoid: ' + compact(recent) + '. Variation seed: ' + str(uuid.uuid4()) + '. '
                    'Return {"questions":[{"text":"...","category_hint":"approximate description","answers":[{"text":"...","fixed_points":35}]}]}.', 3500)
                raw = result.get('questions', [])
                if not isinstance(raw, list):
                    raise ProviderUnavailable('Zły format wygenerowanych pytań.')
                candidates = [q for q in (validate_question(q, job['lang'], 'generated') for q in raw[:5]) if q]
                state['rejected'] += len(raw[:5]) - len(candidates)
                valid = len(candidates)
                candidates, vectors_by_text = await self.drop_known(job['lang'], candidates, state)
                step = f'Generowanie: {len(raw[:5])} propozycji DeepSeeka, {valid} poprawnych, {len(candidates)} nowych.'
            else:
                # Wyszukiwanie: DeepSeek proponuje znane pytania, kod potwierdza je na
                # prawdziwej stronie (dokładna fraza w SearXNG, bez AI). Strona, która
                # potwierdziła pytanie, trafia do kolejki pełnego odczytu przez AI.
                memory = [item for item in state['queries'] if isinstance(item, dict) and ('url' in item or 'seen' in item)]
                idle = next((item['idle'] for item in state['queries'] if isinstance(item, dict) and isinstance(item.get('idle'), int)), 0)
                pages = [item for item in memory if 'url' in item]
                if pages:
                    page = pages[0]
                    memory.remove(page)
                    # Zapis kolejki przed odczytem: nieczytelna strona nie wraca w kółko.
                    state['queries'] = memory
                    step = f'Strona {urlsplit(page["url"]).hostname or page["url"][:80]}: odczyt pytań przez DeepSeeka.'
                    candidates = await self.extract_page(job, page['url'], state)
                    found = len(candidates)
                    candidates, vectors_by_text = await self.drop_known(job['lang'], candidates, state)
                    step = f'Strona {urlsplit(page["url"]).hostname or page["url"][:80]}: {found} pytań ze strony, {len(candidates)} nowych.'
                else:
                    seen = [item['seen'] for item in memory if 'seen' in item]
                    proposals = await self.recall(job, seen)
                    state['round'] += 1
                    memory.extend({'seen': norm(q['text'])} for q in proposals)
                    fresh, vectors_by_text = await self.drop_known(job['lang'], proposals, state)
                    candidates, found_pages = await self.verify_sources(job, fresh, state)
                    domains = sorted({urlsplit(q['source']['url']).hostname or '' for q in candidates} - {''})
                    step = (f'Wyszukiwanie: DeepSeek zaproponował {len(proposals)} pytań, już znanych (pominięte przed sprawdzaniem stron): '
                            f'{len(proposals) - len(fresh)}, potwierdzone na stronach: {len(candidates)}'
                            + (f' ({", ".join(domains[:5])}).' if domains else '.'))
                    known = {item.get('url') for item in memory}
                    memory.extend({'url': url} for url in found_pages if url not in known)
                    state['message'] = (f'Sprawdzono {len(proposals)} propozycji DeepSeeka, ze źródłem: {len(candidates)}.'
                                        if proposals else 'DeepSeek nie zaproponował nowych pytań; spróbuję ponownie.')
                    # Puste próby z rzędu: coraz rzadziej, po IDLE_LIMIT wstrzymanie — DeepSeek
                    # nie zna już nowych pytań, dalsze prośby tylko zużywają budżet.
                    idle = 0 if candidates or found_pages else idle + 1
                    if idle >= IDLE_LIMIT:
                        state.update(status='paused', delay=60, message=f'{IDLE_LIMIT} prób z rzędu bez nowego pytania ze źródłem — wstrzymane, żeby nie zużywać budżetu AI. Zmień kategorię albo wybierz tryb generowania; „Wznów” spróbuje ponownie.')
                        idle = 0
                        await self.note(job['lang'], state['message'], 'warning', job['id'])
                    elif not candidates:
                        state['delay'] = min(900, 20 * 2 ** min(idle, 6))
                pages_left = [item for item in memory if 'url' in item][:30]
                state['queries'] = [item for item in memory if 'seen' in item][-200:] + pages_left + [{'idle': idle}]
                state['cursor'] = 0
            accepted = await self.review(candidates, job['category'], job['lang'])
            state['rejected'] += len(candidates) - len(accepted)
            # Wektory policzone przy odsiewaniu; brakujące (np. inna treść po kontroli) liczone teraz.
            missing = [q for q in accepted if norm(q['text']) not in vectors_by_text]
            if missing:
                for q, v in zip(missing, await self.embed([embedding_text(q) for q in missing])):
                    vectors_by_text[norm(q['text'])] = v
            vectors = [vectors_by_text[norm(q['text'])] for q in accepted]
            for candidate, vector in zip(accepted, vectors):
                result = await self.rpc('qf_offer', {'p_job': job['id'], 'p_lease': job['lease'], 'p_question': {**candidate, 'embedding': vector}})
                if result.get('ok'):
                    added += 1
                elif result.get('reason') == 'duplicate':
                    state['duplicates'] += 1
                elif result.get('reason') == 'stopped':
                    break
            if step or added:
                await self.note(job['lang'], f'{step} Po kontroli jakości: {len(accepted)}, dodano: {added}, powtórzenia: {state["duplicates"]}. '
                                f'Postęp: {job["accepted"] + added}/{job["target"]}.'.strip(), 'success' if added else 'info', job['id'])
            if added and job['accepted'] + added >= job['target']:
                await self.note(job['lang'], f'Zlecenie zakończone: {job["target"]}/{job["target"]} nowych pytań.', 'success', job['id'])
            state.setdefault('message', 'Szukam kolejnych kompletnych pytań.' if job['kind'] == 'search' else 'Przygotowuję i sprawdzam kolejne pytania.')
        except BudgetUnavailable:
            # Krok powtarzany po odnowieniu budżetu: kolejka bez zmian.
            state.update(queries=job['queries'], cursor=job['cursor'], round=job['round'])
            state.update(status='waiting_budget', delay=3600, message='Dzienny budżet AI tej usługi wyczerpany. Postęp zapisany; wznowię po odnowieniu.')
            await self.note(job['lang'], state['message'], 'warning', job['id'])
        except ProviderUnavailable as error:
            state.update(queries=job['queries'], cursor=job['cursor'], round=job['round'])
            state.update(status='waiting_provider', delay=120, message=str(error))
            await self.note(job['lang'], f'{step} Wstrzymane na 2 min: {error}'.strip(), 'warning', job['id'])
        except (httpx.HTTPError, ValueError, OSError):
            state['cursor'] += 1
            state.update(delay=30, message='Źródło niedostępne lub niekompletne; przechodzę do kolejnego.')
            state['rejected'] += 1
            await self.note(job['lang'], f'{step} Źródło niedostępne lub niekompletne — pomijam.'.strip(), 'warning', job['id'])
        except Exception:
            log.exception('question_job_failed id=%s', job['id'])
            state.update(status='waiting_provider', delay=300, message='Błąd przetwarzania. Postęp zachowany; ponowię później.')
            await self.note(job['lang'], 'Błąd przetwarzania zlecenia; postęp zachowany, ponowię za 5 min.', 'error', job['id'])
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


    async def disassemble(self, body):
        """Gra nieopublikowana → z powrotem pojedyncze pytania puli (jedna transakcja w bazie)."""
        lang, game_id = body['lang'], body['game_id']
        rows = await self.db.select('producer_question_games', {'id': 'eq.' + game_id, 'lang': 'eq.' + lang, 'select': 'id,title,payload,published_id'})
        if rows is None:
            raise ProviderUnavailable('Nie można wczytać gry.')
        if not rows:
            rows = await self.db.select('market_games', {'id': 'eq.' + game_id, 'lang': 'eq.' + lang, 'origin': 'eq.producer', 'select': 'id,title,payload,status'})
            if rows is None:
                raise ProviderUnavailable('Nie można wczytać gry.')
        if not rows:
            raise HTTPException(404, 'Nie znaleziono gry.')
        game = rows[0]
        questions = [q for q in (game.get('payload') or {}).get('questions') or [] if isinstance(q, dict) and isinstance(q.get('text'), str) and isinstance(q.get('answers'), list)]
        texts = [q['text'] + '\n' + '\n'.join(sorted(norm(a.get('text')) for a in q['answers'] if isinstance(a, dict))) for q in questions]
        vectors = await self.embed(texts)
        payload = [{'text': q['text'], 'answers': q['answers'], 'origin': q.get('origin'), 'source': q.get('source'),
                    'category_hint': q.get('category_hint') or '', 'embedding': vector} for q, vector in zip(questions, vectors)]
        result = await self.rpc('qf_disassemble', {'p_id': game_id, 'p_lang': lang, 'p_questions': payload})
        if result.get('reason') == 'published':
            raise ValueError('Najpierw wycofaj grę z publikacji. Rozłożyć można tylko grę nieopublikowaną.')
        if result.get('reason') == 'not_found':
            raise HTTPException(404, 'Nie znaleziono gry.')
        await self.note(lang, f'Gra „{game.get("title") or ""}” rozłożona na pytania: wróciło do puli {result.get("restored", 0)}, '
                        f'powtórzenia: {result.get("duplicates", 0)}, pominięte (format): {result.get("skipped", 0)}.', 'success')
        return {'ok': True, 'restored': result.get('restored', 0), 'duplicates': result.get('duplicates', 0), 'skipped': result.get('skipped', 0)}

    async def update_question(self, body):
        qid = str(body.get('id') or '').strip()
        lang = str(body.get('lang') or '').strip()
        raw_text = str(body.get('text') or '').strip()
        raw_cat = str(body.get('category_hint') or '').strip()
        if not qid or not lang or not raw_text:
            raise ValueError('Brak wymaganych danych pytania.')
        text = fix_caps(raw_text)
        if not 8 <= len(text) <= 100:
            raise ValueError('Treść pytania musi mieć od 8 do 100 znaków.')
        rows = await self.db.select('producer_question_pool', {'id': f'eq.{qid}', 'lang': f'eq.{lang}'})
        if not rows:
            raise HTTPException(404, 'Nie znaleziono pytania w puli.')
        q = rows[0]
        fp = hashlib.sha256(norm(text).encode('utf-8')).hexdigest()
        dup = await self.db.select('producer_question_pool', {'lang': f'eq.{lang}', 'fingerprint': f'eq.{fp}', 'id': f'neq.{qid}', 'select': 'id'})
        if dup:
            raise ValueError('Pytanie o takiej samej treści już istnieje w puli.')
        answers = q.get('answers') or []
        emb_text = text + '\n' + '\n'.join(sorted(norm(a['text']) for a in answers))
        vectors = await self.embed([emb_text])
        vector = vectors[0] if vectors else None
        if not vector:
            raise ProviderUnavailable('Nie udało się wyliczyć wektora pytania.')
        category_hint = raw_cat if raw_cat else q.get('category_hint', '')
        update_data = {
            'text': text,
            'category_hint': category_hint,
            'fingerprint': fp,
            'embedding': vector
        }
        ok = await self.db.update('producer_question_pool', update_data, {'id': f'eq.{qid}', 'lang': f'eq.{lang}'})
        if not ok:
            raise HTTPException(500, 'Nie udało się zapisać zmian pytania.')
        return {'ok': True, 'question': {**q, **update_data}}


class RequestBody(BaseModel):
    lang: str = Field(pattern='^(pl|en|uk)$')
    id: uuid.UUID | None = None
    text: str = Field(default='', max_length=500)
    category_hint: str = Field(default='', max_length=300)
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
                if job.get('accepted', 0) == 0 and job.get('status') == 'queued':
                    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
                    await bank.db.delete('producer_question_logs', {'lang': 'eq.' + body['lang'], 'created_at': 'lt.' + cutoff})
                    kind = 'wyszukiwanie' if body['kind'] == 'search' else 'generowanie'
                    await bank.note(body['lang'], f'Zlecono {body["target"]} nowych pytań ({kind}'
                                    + (', z uzupełnianiem odpowiedzi przez AI' if body['enrich'] else '')
                                    + (f', kategoria: {body["category"]}' if body['category'] else ', różne kategorie') + ').', 'info', job.get('id'))
                return {'ok': True, 'job': job}
            if action == 'control':
                if not request.job_id or request.control not in ('pause', 'resume', 'cancel'):
                    raise ValueError('Niepoprawne sterowanie zleceniem.')
                rows = await bank.db.select('producer_question_jobs', {'id': 'eq.' + body['job_id'], 'lang': 'eq.' + body['lang'], 'select': 'id'})
                if not rows:
                    raise HTTPException(404, 'Nie znaleziono zlecenia w tym języku.')
                changed = await bank.rpc('qf_job_control', {'p_id': body['job_id'], 'p_action': body['control']})
                if changed:
                    await bank.note(body['lang'], {'pause': 'Zlecenie wstrzymane.', 'resume': 'Zlecenie wznowione.', 'cancel': 'Zlecenie anulowane; dodane pytania zostają w puli.'}[body['control']], 'info', body['job_id'])
                return {'ok': changed}
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
            if action == 'delete':
                if not request.game_id:
                    raise ValueError('Wybierz grę.')
                # Jedna transakcja w bazie (migracja 500): tylko gra nieopublikowana;
                # pytania dawnej gry Producenta zostają w historii powtórzeń.
                result = await bank.rpc('qf_delete', {'p_id': body['game_id'], 'p_lang': body['lang']})
                if result.get('reason') == 'published':
                    raise ValueError('Najpierw wycofaj grę z publikacji. Można usuwać wyłącznie gry nieopublikowane.')
                if result.get('reason') == 'not_found':
                    raise HTTPException(404, 'Nie znaleziono gry.')
                return {'ok': bool(result.get('ok'))}
            if action == 'disassemble':
                if not request.game_id:
                    raise ValueError('Wybierz grę.')
                return await bank.disassemble(body)
            if action == 'update_question':
                return await bank.update_question(body)
            raise HTTPException(404, 'Nieznana akcja.')
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        except BudgetUnavailable as error:
            raise HTTPException(429, str(error)) from None
        except ProviderUnavailable as error:
            raise HTTPException(503, str(error)) from None
    return router

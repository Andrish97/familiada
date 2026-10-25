"""Przebiegi: wyszukiwanie kontaktów (źródła → odsiew → AI paczkami → zapis)
i przegląd zapisanych kontaktów (reguły + AI, oznaczenie good/junk)."""

import asyncio
import logging
import random
from datetime import datetime, timezone

from . import fetch, filters
from .classify import Classifier, item_for_lead, item_for_review
from .config import cfg
from .sources import ceidg as ceidg_src
from .sources import search as search_src

log = logging.getLogger('lead_finder')

STAT_KEYS = ('search_queries', 'search_results', 'search_engine_errors', 'ceidg_records', 'candidates',
             'dropped_no_email', 'dropped_duplicate', 'dropped_public', 'dropped_rule', 'pages_fetched',
             'sent_to_ai', 'ai_calls', 'ai_accepted', 'ai_rejected', 'errors')


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class NoQuota(Exception):
    pass


class Stopped(Exception):
    pass


class Engine:
    def __init__(self, db, client, searx_url, ceidg=None, mx_check=None, notify=None):
        self.db = db
        self.client = client
        self.searx_url = searx_url
        self.ceidg = ceidg
        self.mx_check = mx_check
        self.notify = notify
        self.status = 'idle'
        self.kind = None
        self.run_id = None
        self.target = 0
        self.verified = 0
        self.stats = dict.fromkeys(STAT_KEYS, 0)
        self.known_emails, self.known_domains, self.known_refs = set(), set(), set()
        self.done_queries = set()
        self.fetch_budget = 0
        self.attempts = {}
        self.extra_ceidg = []
        self.junk = 0

    # --- stan ---

    def snapshot(self):
        return {'status': self.status, 'run_id': self.run_id, 'kind': self.kind, 'verified': self.verified,
                'target': self.target, 'errors': self.stats['errors'], 'stats': dict(self.stats)}

    async def _checkpoint(self):
        while self.status == 'paused':
            await asyncio.sleep(2)
        if self.status != 'running':
            raise Stopped()

    async def save_stats(self, finished=False):
        row = {'run_id': self.run_id, 'kind': self.kind, 'target': self.target, **self.stats}
        if finished:
            row['finished_at'] = now_iso()
        await self.db.insert('marketing_run_stats', row, upsert_on='run_id')

    # --- wspólne ---

    async def load_known(self):
        verified = await self.db.select_all('marketing_verified_contacts', 'id,email,url') or []
        for v in verified:
            self.known_emails.add((v.get('email') or '').strip().lower())
            d = filters.url_domain(v.get('url') or '')
            if d and not filters.is_portal(d):
                self.known_domains.add(d)
        cands = await self.db.select_all('marketing_candidates', 'id,source,source_ref,domain') or []
        for c in cands:
            self.known_refs.add((c['source'], c['source_ref']))
            if c.get('domain'):
                self.known_domains.add(c['domain'])
        logs = await self.db.select_all('marketing_search_queries_log', 'id,query_text') or []
        self.done_queries = {r['query_text'] for r in logs}

    # --- zbieranie ---

    def _next_query(self):
        options = []
        if self.ceidg and self.ceidg.enabled:
            ceidg_left = [q for q in ceidg_src.query_pool() if q not in self.done_queries]
            ceidg_left += [q for q in self.extra_ceidg if q not in self.done_queries]
            if ceidg_left:
                options.append(ceidg_left[0])
        search_left = [q for q in (f'search:{q}' for q in search_src.query_pool()) if q not in self.done_queries]
        if search_left:
            options.append(random.choice(search_left))
        return random.choice(options) if options else None

    async def _mx_ok(self, emails):
        if not self.mx_check:
            return emails
        out = []
        for e in emails:
            if await self.mx_check(e.rpartition('@')[2]):
                out.append(e)
        return out

    async def admit(self, c):
        """Odsiew kandydata i zapis do marketing_candidates. True, gdy czeka na ocenę."""
        self.stats['candidates'] += 1
        ref = (c['source'], c['source_ref'])
        emails = [e for e in c.get('emails') or [] if e not in self.known_emails]
        if ref in self.known_refs or (c.get('emails') and not emails) or \
                (c.get('domain') and c['domain'] in self.known_domains):
            self.stats['dropped_duplicate'] += 1
            return False
        self.known_refs.add(ref)
        emails = await self._mx_ok(emails)
        c = {**c, 'emails': emails, 'run_id': self.run_id}
        rule = filters.rule_reason(c.get('url', ''), c.get('name', ''), c.get('snippet', ''), emails)
        if not emails and not c.get('domain'):
            self.stats['dropped_no_email'] += 1
            return False
        if rule:
            kind, reason = rule
            self.stats['dropped_public' if kind == 'public' else 'dropped_rule'] += 1
            await self.db.insert('marketing_candidates', {**c, 'status': 'rejected', 'reject_reason': reason},
                                 upsert_on='source,source_ref', ignore_duplicates=True)
            return False
        if c.get('domain'):
            self.known_domains.add(c['domain'])
        await self.db.insert('marketing_candidates', {**c, 'status': 'new'},
                             upsert_on='source,source_ref', ignore_duplicates=True)
        return True

    async def collect_once(self):
        """Jedno zapytanie do źródła. Zwraca liczbę nowych kandydatów albo None, gdy pula pusta."""
        q = self._next_query()
        if not q:
            return None
        added = found = 0
        try:
            if q.startswith('ceidg:'):
                pkd, region, page = ceidg_src.parse_query(q)
                firms, has_next = await self.ceidg.list_firms(pkd, region, page)
                if has_next:
                    self.extra_ceidg.append(f'ceidg:{pkd}:{region}:{page + 1}')
                for firm in firms:
                    await self._checkpoint()
                    detail = await self.ceidg.details(firm)
                    self.stats['ceidg_records'] += 1
                    c = ceidg_src.firm_to_candidate(detail, region)
                    if c:
                        found += 1
                        added += await self.admit(c)
                    else:
                        self.stats['dropped_no_email'] += 1
            else:
                self.stats['search_queries'] += 1
                results, dead = await search_src.search(self.client, self.searx_url, q[len('search:'):],
                                                        timeout=cfg('TIMEOUT_SEARCH', 25))
                self.stats['search_results'] += len(results)
                self.stats['search_engine_errors'] += dead
                if not results:
                    log.info(f'Brak wyników ({dead} silników bez odpowiedzi): {q}')
                for res in results:
                    c = search_src.result_to_candidate(res)
                    if c:
                        found += 1
                        added += await self.admit(c)
                    else:
                        self.stats['dropped_no_email'] += 1
        except Stopped:
            raise
        except Exception as e:
            self.stats['errors'] += 1
            log.error(f'Źródło {q.split(":")[0]}: {str(e)[:200]}')
        self.done_queries.add(q)
        await self.db.insert('marketing_search_queries_log',
                             {'query_text': q, 'urls_found': found, 'urls_added': added, 'status': 'completed'},
                             upsert_on='query_text')
        log.info(f'Zapytanie {q}: {found} kandydatów, {added} do oceny')
        return added

    # --- ocena ---

    async def accept(self, c, res, email):
        title = res.get('title') or c.get('name') or ''
        group = res.get('group') or ''
        row = {'email': email, 'url': c.get('url') or '', 'title': title[:200],
               'short_description': res.get('short_description') or None,
               'verify_reason': (f'[{group}] ' if group else '') + res['reason'],
               'source': c['source'], 'quality': 'good', 'quality_reason': res['reason'], 'reviewed_at': now_iso()}
        if await self.db.insert('marketing_verified_contacts', row):
            self.known_emails.add(email)
            self.verified += 1
            self.stats['ai_accepted'] += 1
            log.info(f'Zweryfikowano {c.get("url")}: {res["reason"]}')
            return True
        self.stats['errors'] += 1
        return False

    async def classify_once(self, classifier):
        size = cfg('AI_BATCH_SIZE', 25)
        rows = await self.db.select('marketing_candidates', {
            'select': '*', 'status': 'eq.new', 'order': 'created_at', 'limit': size}) or []
        if not rows:
            return 0
        ids = [r['id'] for r in rows]
        await self.db.update('marketing_candidates', {'status': 'classifying'}, {'id': f'in.({",".join(ids)})'})
        items = {f'c{i + 1}': r for i, r in enumerate(rows)}
        self.stats['sent_to_ai'] += len(rows)
        results = await classifier.classify([item_for_lead(cid, r) for cid, r in items.items()])
        if not results:
            await self.db.update('marketing_candidates', {'status': 'new'}, {'id': f'in.({",".join(ids)})'})
            if results is None:
                raise NoQuota()
            return -1  # wszyscy dostępni dostawcy zawiedli — ponowić za chwilę
        for cid, c in items.items():
            if self.verified >= self.target:
                await self.db.update('marketing_candidates', {'status': 'new'}, {'id': f'eq.{c["id"]}'})
                continue
            res = results.get(cid)
            if not res:
                n = self.attempts.get(c['id'], 0) + 1
                self.attempts[c['id']] = n
                status = {'status': 'rejected', 'reject_reason': 'brak oceny AI'} if n >= 3 else {'status': 'new'}
                await self.db.update('marketing_candidates', status, {'id': f'eq.{c["id"]}'})
                continue
            if not res['ok']:
                self.stats['ai_rejected'] += 1
                await self.db.update('marketing_candidates', {'status': 'rejected', 'reject_reason': res['reason']},
                                     {'id': f'eq.{c["id"]}'})
                log.info(f'Odrzucono {c.get("url")}: {res["reason"]}')
                continue
            emails = c.get('emails') or []
            if not emails and c.get('domain') and self.fetch_budget > 0:
                self.fetch_budget -= 1
                emails, pages = await fetch.find_emails(self.client, c['url'])
                self.stats['pages_fetched'] += pages
                emails = await self._mx_ok([e for e in emails if e not in self.known_emails])
            email = filters.best_email(emails, c.get('domain') or '')
            if not email:
                await self.db.update('marketing_candidates', {'status': 'rejected', 'reject_reason': 'dobry, ale bez e-maila'},
                                     {'id': f'eq.{c["id"]}'})
                continue
            ok = await self.accept(c, res, email)
            await self.db.update('marketing_candidates', {'status': 'accepted' if ok else 'new'}, {'id': f'eq.{c["id"]}'})
        return len(rows)

    # --- przebiegi ---

    async def _pending(self):
        rows = await self.db.select('marketing_candidates', {
            'select': 'id', 'status': 'eq.new', 'limit': cfg('AI_BATCH_SIZE', 25)})
        return len(rows or [])

    async def run_search(self, target):
        classifier = Classifier(self.db, self.client, self.stats)
        batch = cfg('AI_BATCH_SIZE', 25)
        self.extra_ceidg = []
        self.fetch_budget = cfg('FETCH_BUDGET_PER_RUN', 20)
        await self.db.update('marketing_candidates', {'status': 'new'}, {'status': 'eq.classifying'})
        await self.load_known()
        sources_left, idle_rounds = True, 0
        while self.verified < target:
            await self._checkpoint()
            pending = await self._pending()
            if pending < batch and sources_left:
                added = await self.collect_once()
                if added is None:
                    sources_left = False
                    log.info('Wszystkie zapytania wykonane — oceniam to, co zostało.')
                idle_rounds = idle_rounds + 1 if not added else 0
                # Zbierać dalej do pełnej paczki; po 3 pustych zapytaniach ocenić, co jest.
                if sources_left and pending + (added or 0) < batch and (idle_rounds < 3 or not pending):
                    await self.save_stats()
                    continue
                pending = await self._pending()
            if not pending:
                if not sources_left:
                    log.info('Brak kandydatów i zapytań — koniec przebiegu.')
                    break
                continue
            idle_rounds = 0
            if await self.classify_once(classifier) == -1:
                log.info('Dostawcy AI chwilowo niedostępni — ponowię za 30 s.')
                await asyncio.sleep(30)
            await self.save_stats()

    async def run_review(self, all_rows=False):
        classifier = Classifier(self.db, self.client, self.stats)
        extra = {} if all_rows else {'reviewed_at': 'is.null'}
        rows = await self.db.select_all('marketing_verified_contacts',
                                        'id,email,url,title,short_description,reaction', extra=extra) or []
        self.target = len(rows)
        log.info(f'Przegląd kontaktów: {len(rows)} do sprawdzenia.')
        size = cfg('AI_BATCH_SIZE', 25)
        for i in range(0, len(rows), size):
            await self._checkpoint()
            batch, to_ai = rows[i:i + size], {}
            for row in batch:
                self.stats['candidates'] += 1
                email = (row.get('email') or '').strip().lower()
                verdict = None
                if row.get('reaction') == 'replied':
                    verdict = ('good', 'odpowiedział na wiadomość')
                elif not filters.email_ok(email):
                    verdict = ('junk', 'adres e-mail niepoprawny albo portalu')
                else:
                    rule = filters.rule_reason(row.get('url') or '', row.get('title') or '',
                                               row.get('short_description') or '', [email])
                    if rule:
                        verdict = ('junk', rule[1])
                        self.stats['dropped_public' if rule[0] == 'public' else 'dropped_rule'] += 1
                if verdict:
                    await self._mark(row, *verdict)
                else:
                    to_ai[f'c{len(to_ai) + 1}'] = row
            if to_ai:
                self.stats['sent_to_ai'] += len(to_ai)
                results = await classifier.classify([item_for_review(k, r) for k, r in to_ai.items()], 'review')
                if results is None:
                    raise NoQuota()
                if not results:
                    log.info('Dostawcy AI chwilowo niedostępni — paczka zostaje bez oceny.')
                for k, row in to_ai.items():
                    res = results.get(k)
                    if res:
                        self.stats['ai_accepted' if res['ok'] else 'ai_rejected'] += 1
                        await self._mark(row, 'good' if res['ok'] else 'junk', res['reason'])
            await self.save_stats()

    async def _mark(self, row, quality, reason):
        await self.db.update('marketing_verified_contacts',
                             {'quality': quality, 'quality_reason': reason[:300], 'reviewed_at': now_iso()},
                             {'id': f'eq.{row["id"]}'})
        if quality == 'good':
            self.verified += 1
        else:
            self.junk += 1

    async def start(self, run_id, kind, target=0, all_rows=False):
        self.run_id, self.kind, self.target, self.verified = run_id, kind, target, 0
        self.stats = dict.fromkeys(STAT_KEYS, 0)
        self.attempts = {}
        self.junk = 0
        self.status = 'running'
        await self.db.delete('marketing_search_logs', {'level': 'not.is.null'})
        log.info(f'Zlecono {target} kontaktów.' if kind == 'search' else 'Zlecono przegląd zapisanych kontaktów.')
        await self.save_stats()
        try:
            if kind == 'search':
                await self.run_search(target)
            else:
                await self.run_review(all_rows)
            self.status = 'completed'
            msg = (f'Zlecenie zakończone. Sukces: {self.verified}/{target}.' if kind == 'search'
                   else f'Przegląd zakończony: dobre {self.verified}, śmieci {self.junk}, '
                        f'bez oceny {self.target - self.verified - self.junk}.')
            log.info(msg)
            if self.notify:
                await self.notify(f'✅ <b>Lead Finder</b>\n{msg}')
        except Stopped:
            log.info('Zlecenie przerwane.')
        except NoQuota:
            self.status = 'cancelled'
            log.error('Brak dostępnych limitów u wszystkich dostawców AI. Przerywam.')
            if self.notify:
                await self.notify('⚠️ <b>Zlecenie przerwane</b>\nBrak limitów AI u wszystkich dostawców.')
        except Exception as e:
            self.status = 'error'
            self.stats['errors'] += 1
            log.error(f'Błąd przebiegu: {str(e)[:300]}')
            if self.notify:
                await self.notify('❌ <b>Błąd Lead Findera</b> — szczegóły w logach panelu.')
        finally:
            await self.save_stats(finished=True)
            await asyncio.sleep(3)
            self.status = 'idle'

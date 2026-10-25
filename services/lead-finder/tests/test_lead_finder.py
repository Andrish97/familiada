"""Testy Lead Finder 2: python3 -m unittest discover -s services/lead-finder/tests"""

import asyncio
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lf import classify, filters, pipeline  # noqa: E402
from lf.sources import ceidg, search  # noqa: E402


class FiltersTest(unittest.TestCase):
    def test_freemail_not_garbage(self):
        # Stary system: `mail.com` (podciąg) wycinało wszystkie @gmail.com.
        for e in ('dj.marek@gmail.com', 'kontakt@hotmail.com', 'biuro@wp.pl', 'x@interia.pl', 'biuro@djcontest.pl'):
            self.assertTrue(filters.email_ok(e), e)
        for e in ('a@example.com', 'jan@fixly.pl', 'x@sub.olx.pl', 'noreply@firma.pl', 'webmaster@dj.pl', 'logo@2x.png'):
            self.assertFalse(filters.email_ok(e), e)

    def test_extract_obfuscated(self):
        self.assertEqual(filters.extract_emails('Pisz: biuro [at] dj-max [dot] pl'), ['biuro@dj-max.pl'])
        self.assertEqual(filters.extract_emails('kontakt&#64;wodzirej.pl'), ['kontakt@wodzirej.pl'])
        key = 0x42
        enc = bytes([key]) + bytes(ord(c) ^ key for c in 'hej@quiz.pl')
        html = f'<a data-cfemail="{enc.hex()}">[email protected]</a>'
        self.assertEqual(filters.extract_emails('', html), ['hej@quiz.pl'])

    def test_domain_exact(self):
        self.assertTrue(filters.domain_in('sub.olx.pl', {'olx.pl'}))
        self.assertFalse(filters.domain_in('djolx.pl', {'olx.pl'}))
        self.assertFalse(filters.domain_in('gmail.com', {'mail.com'}))

    def test_best_email(self):
        self.assertEqual(filters.best_email(['x@gmail.com', 'biuro@djmax.pl', 'a@inna.pl'], 'djmax.pl'), 'biuro@djmax.pl')
        self.assertEqual(filters.best_email(['x@gmail.com', 'a@inna.pl'], 'djmax.pl'), 'a@inna.pl')
        self.assertIsNone(filters.best_email(['noreply@djmax.pl'], 'djmax.pl'))


class SourcesTest(unittest.TestCase):
    def test_search_uses_searxng_engine_settings(self):
        class Client:
            async def get(client, url, params, timeout):
                self.assertEqual(url, 'http://searxng:8080/search')
                self.assertNotIn('engines', params)
                self.assertEqual((params['q'], params['pageno']), ('DJ kontakt', 2))
                self.assertEqual(params['format'], 'json')
                class Response:
                    status_code = 200
                    def json(self):
                        return {'results': [{'url': 'https://dj.pl'}], 'unresponsive_engines': []}
                return Response()
        results, dead = run(search.search(Client(), 'http://searxng:8080', 'DJ kontakt', 2))
        self.assertEqual((results, dead), ([{'url': 'https://dj.pl'}], []))

    def test_result_to_candidate(self):
        c = search.result_to_candidate({'url': 'https://www.djmax.pl/oferta', 'title': 'DJ Max',
                                        'content': 'Wesela, kontakt: biuro@djmax.pl'})
        self.assertEqual((c['domain'], c['emails']), ('djmax.pl', ['biuro@djmax.pl']))
        self.assertIsNone(search.result_to_candidate({'url': 'https://www.facebook.com/djmax', 'title': 'DJ'}))
        fb = search.result_to_candidate({'url': 'https://facebook.com/djmax', 'title': 'DJ', 'content': 'djmax@gmail.com'})
        self.assertEqual((fb['domain'], fb['emails']), ('', ['djmax@gmail.com']))

    def test_ceidg_candidate(self):
        firm = {'id': 'abc', 'nazwa': 'DJ Max Jan Nowak', 'adresDzialalnosci': {'miasto': 'Lublin'},
                'email': 'Biuro@DJMax.pl', 'www': 'djmax.pl', 'pkd': [{'kod': '93.29.Z'}]}
        c = ceidg.firm_to_candidate(firm)
        self.assertEqual((c['source_ref'], c['emails'], c['domain'], c['pkd']), ('abc', ['biuro@djmax.pl'], 'djmax.pl', ['93.29.Z']))
        self.assertIsNone(ceidg.firm_to_candidate({'id': 'x', 'nazwa': 'Bez kontaktu'}))


class ParseTest(unittest.TestCase):
    def test_parse_results(self):
        content = 'Wynik: ' + json.dumps({'results': [
            {'id': 'c1', 'ok': 1, 'group': 'a', 'title': ' DJ  Max ', 'reason': 'DJ weselny'},
            {'id': 'c2', 'ok': 0, 'reason': 'szkoła'},
            {'id': 'c2', 'ok': 1, 'reason': 'duplikat id'},
            {'id': 'c9', 'ok': 1, 'reason': 'nieznane id'},
            {'id': 'c3', 'ok': 'tak', 'reason': 'zła wartość'},
            {'id': 'c4', 'ok': 1},
        ]})
        res = classify.parse_results(content, ['c1', 'c2', 'c3', 'c4'])
        self.assertEqual(set(res), {'c1', 'c2'})
        self.assertEqual((res['c1']['title'], res['c1']['group'], res['c2']['ok']), ('DJ Max', 'A', False))
        with self.assertRaises(ValueError):
            classify.parse_results('brak', ['c1'])

    def test_prompts(self):
        p = classify.build_prompt([{'id': 'c1', 'name': 'Łódź DJ'}], {'name': 'Szkoły', 'description': 'Szkoły podstawowe'})
        self.assertIn('"Łódź DJ"', p)
        self.assertIn('KATEGORIA: Szkoły', p)
        self.assertIn('Szkoły podstawowe', p)
        self.assertNotIn('{', p.split('KANDYDACI:')[0].replace('{"results"', ''))
        e = classify.build_expand_prompt('Wodzireje')
        self.assertIn('KATEGORIA: Wodzireje', e)
        self.assertNotIn('{category}', e)

    def test_parse_category(self):
        res = classify.parse_category(json.dumps({
            'description': ' DJ-e  weselni ', 'queries': ['DJ wesele kontakt', 'dj wesele kontakt', 'DJ @gmail.com', 'oprawa muzyczna', ''],
            'pkd': ['9329Z', '90.01.Z', 'zły', '93.29.Z']}))
        self.assertEqual(res, {'description': 'DJ-e weselni', 'queries': ['DJ wesele kontakt', 'DJ @gmail.com', 'oprawa muzyczna'],
                               'pkd': ['93.29.Z', '90.01.Z']})
        with self.assertRaises(ValueError):
            classify.parse_category('{"description": "x", "queries": ["a"]}')


class DeepSeekOnlyTest(unittest.TestCase):
    """Lead Finder używa wyłącznie DeepSeeka (decyzja 2026-10-25)."""

    class Db:
        def __init__(self, available):
            self.available, self.cooldowns = available, []

        async def rpc(self, fn, params=None):
            if fn == 'get_available_ai_providers':
                return self.available
            self.cooldowns.append(params)
            return True

    def ask(self, available, reply):
        db = self.Db(available)
        c = classify.Classifier(db, None)

        async def fake_call(prompt):
            return reply
        c._call = fake_call
        return run(c._ask('p', lambda text: {'ok': text})), db

    def test_only_deepseek(self):
        res, db = self.ask([{'name': 'groq'}, {'name': 'anthropic'}], (200, 'x', None))
        self.assertIsNone(res)  # inni dostawcy nie są używani
        res, _ = self.ask([{'name': 'deepseek'}], (200, 'x', None))
        self.assertEqual(res, {'ok': 'x'})
        res, db = self.ask([{'name': 'deepseek'}], (402, None, 'insufficient balance'))
        self.assertIsNone(res)
        self.assertEqual(db.cooldowns[0]['p_name'], 'deepseek')
        res, db = self.ask([{'name': 'deepseek'}], (503, None, 'busy'))
        self.assertEqual(res, {})


class FakeDb:
    def __init__(self):
        self.tables = {'marketing_verified_contacts': [], 'marketing_candidates': [], 'marketing_categories': [],
                       'marketing_search_queries_log': [], 'marketing_run_stats': [], 'marketing_search_logs': []}
        self.n = 0

    def _match(self, row, filters_):
        for k, v in filters_.items():
            if k in ('select', 'limit', 'order', 'offset'):
                continue
            op, _, val = v.partition('.')
            cur = row.get(k)
            cur = str(cur).lower() if isinstance(cur, bool) else cur
            if op == 'eq' and str(cur) != val:
                return False
            if op == 'in' and str(cur) not in val.strip('()').split(','):
                return False
            if op == 'is' and val == 'null' and cur is not None:
                return False
        return True

    async def select(self, table, params):
        rows = [r for r in self.tables[table] if self._match(r, params)]
        return rows[:int(params.get('limit', 10 ** 6))]

    async def select_all(self, table, columns, page=1000, extra=None):
        return await self.select(table, extra or {})

    async def insert(self, table, data, upsert_on=None, ignore_duplicates=False):
        rows = data if isinstance(data, list) else [data]
        for row in rows:
            if upsert_on:
                keys = upsert_on.split(',')
                old = next((r for r in self.tables[table] if all(r.get(k) == row.get(k) for k in keys)), None)
                if old:
                    if not ignore_duplicates:
                        old.update(row)
                    continue
            self.n += 1
            self.tables[table].append({'id': f'id{self.n}', 'created_at': self.n, **row})
        return rows

    async def update(self, table, data, filters_):
        for r in self.tables[table]:
            if self._match(r, filters_):
                r.update(data)
        return True

    async def delete(self, table, filters_):
        return True

    async def rpc(self, fn, params=None):
        return [{'name': 'groq'}] if fn == 'get_available_ai_providers' else True


class FakeClassifier:
    """Akceptuje kandydatów z „DJ” w nazwie; rozwija kategorię w stałe frazy."""

    def __init__(self, *a, **kw):
        self.calls = 0
        self.categories = []

    async def classify(self, items, category):
        self.calls += 1
        self.categories.append(category['name'])
        return {i['id']: {'ok': 'DJ' in i['name'], 'group': '', 'title': i['name'], 'short_description': 'opis',
                          'reason': 'test'} for i in items}

    async def expand(self, name):
        return {'description': f'opis {name}', 'queries': [f'{name} kontakt', f'{name} @gmail.com', f'{name} oferta'], 'pkd': ['93.29.Z']}


def run(coro):
    return asyncio.run(coro)


CAT = {'id': 'k1', 'name': 'DJ', 'description': 'DJ-e', 'queries': ['dj'], 'pkd': []}


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        self.engine = pipeline.Engine(self.db, None, 'http://searx')
        self.engine.run_id, self.engine.status, self.engine.target = 'r1', 'running', 10

    def cand(self, ref, name, domain, emails, source='search', cat='k1'):
        return {'source': source, 'source_ref': ref, 'name': name, 'url': f'https://{domain}', 'domain': domain,
                'emails': emails, 'snippet': '', 'category_id': cat}

    def test_admit_and_classify_with_category(self):
        db, e = self.db, self.engine
        db.tables['marketing_verified_contacts'].append({'id': 'v1', 'email': 'old@djstary.pl', 'url': 'https://djstary.pl'})
        run(e.load_known())
        cands = [
            self.cand('https://djmax.pl', 'DJ Max', 'djmax.pl', ['biuro@djmax.pl']),
            self.cand('https://djmax.pl', 'DJ Max', 'djmax.pl', ['biuro@djmax.pl']),
            self.cand('https://djstary.pl/x', 'DJ', 'djstary.pl', ['nowy@djstary.pl']),
            self.cand('https://apteka.pl', 'Apteka Zdrowie', 'apteka.pl', ['a@apteka.pl']),
            self.cand('f1', 'Sala Weselna', 'sala.pl', ['sala@gmail.com'], source='ceidg'),
            # Szkoła przechodzi odsiew w kodzie — o szkołach decyduje kategoria.
            self.cand('https://sp5.edu.pl', 'Szkoła Podstawowa nr 5', 'sp5.edu.pl', ['sekretariat@sp5.edu.pl'], cat='k2'),
        ]
        self.assertEqual([run(e.admit(c)) for c in cands], [True, False, False, False, True, True])
        self.assertEqual((e.stats['dropped_duplicate'], e.stats['dropped_rule']), (2, 1))
        fc = FakeClassifier()
        self.assertEqual(run(e.classify_once(fc, CAT)), 2)
        self.assertEqual(fc.categories, ['DJ'])
        verified = db.tables['marketing_verified_contacts']
        self.assertEqual([v['email'] for v in verified], ['old@djstary.pl', 'biuro@djmax.pl'])
        self.assertEqual((verified[1]['category_id'], verified[1]['source'], verified[1]['title']), ('k1', 'search', 'DJ Max'))
        statuses = {c['source_ref']: c['status'] for c in db.tables['marketing_candidates']}
        self.assertEqual(statuses['https://djmax.pl'], 'accepted')
        self.assertEqual(statuses['f1'], 'rejected')
        self.assertEqual(statuses['https://sp5.edu.pl'], 'new')  # inna kategoria — inna paczka

    def test_no_quota_and_provider_failure(self):
        e = self.engine
        run(e.admit(self.cand('u', 'DJ', 'dj.pl', ['a@dj.pl'])))

        class Down:
            def __init__(self, result):
                self.result = result

            async def classify(self, items, category):
                return self.result
        self.assertEqual(run(e.classify_once(Down({}), CAT)), -1)
        self.assertEqual(self.db.tables['marketing_candidates'][0]['status'], 'new')
        with self.assertRaises(pipeline.NoQuota):
            run(e.classify_once(Down(None), CAT))
        self.assertEqual(self.db.tables['marketing_candidates'][0]['status'], 'new')

    def test_categories_expanded_once_and_saved(self):
        db, e = self.db, self.engine
        db.tables['marketing_categories'] = [
            {'id': 'k1', 'name': 'DJ', 'is_active': True, 'description': None, 'queries': [], 'pkd': [], 'expanded_at': None, 'created_at': 1},
            {'id': 'k2', 'name': 'Szkoły', 'is_active': False, 'queries': [], 'pkd': [], 'expanded_at': None, 'created_at': 2},
            {'id': 'k3', 'name': 'Agencje', 'is_active': True, 'description': 'gotowe', 'queries': ['a', 'b', 'c'], 'pkd': [], 'expanded_at': 'x', 'created_at': 3},
        ]
        cats = run(e.load_categories(FakeClassifier()))
        self.assertEqual([c['name'] for c in cats], ['DJ', 'Agencje'])
        saved = db.tables['marketing_categories'][0]
        self.assertEqual((saved['description'], saved['pkd'], len(saved['queries'])), ('opis DJ', ['93.29.Z'], 3))
        self.assertTrue(saved['expanded_at'])
        self.assertEqual(pipeline.search_queries(cats[1], 2)[:2], ['search:k3:1:a', 'search:k3:1:b'])
        self.assertEqual(pipeline.ceidg_queries(cats[0]), ['ceidg:k1:93.29.Z:1'])

    def test_search_down_queries_return_to_pool(self):
        db, e = self.db, self.engine
        db.tables['marketing_categories'] = [
            {'id': 'k1', 'name': 'DJ', 'is_active': True, 'description': 'x', 'queries': [f'q{i}' for i in range(20)], 'pkd': [], 'expanded_at': 'x', 'created_at': 1}]

        async def blocked(client, base, phrase, pageno=1, timeout=25):
            return [], [['google', 'CAPTCHA'], ['bing', 'timeout']]
        orig_search, orig_cls = search.search, pipeline.Classifier
        search.search, pipeline.Classifier = blocked, FakeClassifier
        try:
            run(e.run_search(5))
        finally:
            search.search, pipeline.Classifier = orig_search, orig_cls
        self.assertEqual(db.tables['marketing_search_queries_log'], [])  # nic nie „zużyte”
        self.assertLessEqual(e.stats['search_queries'], 12)  # wstrzymane po serii odmów
        self.assertEqual(e.search_reasons, {'google': 'CAPTCHA', 'bing': 'timeout'})

    def test_run_search_end_to_end(self):
        db, e = self.db, self.engine
        db.tables['marketing_categories'] = [
            {'id': 'k1', 'name': 'DJ', 'is_active': True, 'description': 'x', 'queries': ['dj wesele'], 'pkd': [], 'expanded_at': 'x', 'created_at': 1}]

        async def fake_search(client, base, phrase, pageno=1, timeout=25):
            if pageno > 1:
                return [], []
            return [{'url': 'https://djmax.pl', 'title': 'DJ Max', 'content': 'kontakt biuro@djmax.pl'},
                    {'url': 'https://www.facebook.com/x', 'title': 'Profil', 'content': ''}], [['google', 'CAPTCHA']]
        orig_search, orig_cls = search.search, pipeline.Classifier
        search.search, pipeline.Classifier = fake_search, FakeClassifier
        try:
            run(e.run_search(5))
        finally:
            search.search, pipeline.Classifier = orig_search, orig_cls
        self.assertEqual([v['email'] for v in db.tables['marketing_verified_contacts']], ['biuro@djmax.pl'])
        self.assertEqual(e.stats['search_queries'], 2)
        self.assertEqual(e.stats['search_engine_errors'], 1)
        self.assertEqual({r['query_text'] for r in db.tables['marketing_search_queries_log']},
                         {'search:k1:1:dj wesele', 'search:k1:2:dj wesele'})


if __name__ == '__main__':
    unittest.main()

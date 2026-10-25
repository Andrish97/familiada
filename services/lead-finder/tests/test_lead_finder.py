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

    def test_public(self):
        for d in ('sp12.krakow.pl', 'bip.gmina.pl', 'zs-wola.edu.pl', 'mok-radom.pl', 'um.warszawa.pl', 'szkola-nr1.pl'):
            self.assertTrue(filters.is_public_domain(d), d)
        for d in ('djmarek.pl', 'wodzirej-lublin.pl', 'spokoj-events.pl', 'lodz-dj.pl', 'dkmusic.dk'):
            self.assertFalse(filters.is_public_domain(d), d)
        self.assertEqual(filters.rule_reason('https://x.pl', 'Szkoła Podstawowa nr 5', '', ['a@x.pl'])[0], 'public')
        self.assertEqual(filters.rule_reason('https://x.pl', 'DJ', '', ['sekretariat@sp5.edu.pl'])[0], 'public')
        self.assertIsNone(filters.rule_reason('https://djmax.pl', 'DJ Max — wesela', 'Wodzirej i DJ', ['a@djmax.pl']))

    def test_best_email(self):
        self.assertEqual(filters.best_email(['x@gmail.com', 'biuro@djmax.pl', 'a@inna.pl'], 'djmax.pl'), 'biuro@djmax.pl')
        self.assertEqual(filters.best_email(['x@gmail.com', 'a@inna.pl'], 'djmax.pl'), 'a@inna.pl')
        self.assertIsNone(filters.best_email(['noreply@djmax.pl'], 'djmax.pl'))


class SourcesTest(unittest.TestCase):
    def test_query_pool(self):
        pool = search.query_pool()
        self.assertGreater(len(pool), 500)
        self.assertEqual(len(pool), len(set(pool)))
        self.assertFalse(any('{' in q for q in pool))

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
        c = ceidg.firm_to_candidate(firm, 'lubelskie')
        self.assertEqual((c['source_ref'], c['emails'], c['domain'], c['pkd']), ('abc', ['biuro@djmax.pl'], 'djmax.pl', ['93.29.Z']))
        self.assertIsNone(ceidg.firm_to_candidate({'id': 'x', 'nazwa': 'Bez kontaktu'}))
        self.assertEqual(len(ceidg.query_pool()), len(ceidg.PKD_CODES) * 16)


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

    def test_prompts_have_items(self):
        for mode in ('lead', 'review'):
            p = classify.build_prompt([{'id': 'c1', 'name': 'Łódź DJ'}], mode)
            self.assertIn('"Łódź DJ"', p)
            self.assertNotIn('{items}', p)


class FakeDb:
    def __init__(self):
        self.tables = {'marketing_verified_contacts': [], 'marketing_candidates': [],
                       'marketing_search_queries_log': [], 'marketing_run_stats': [], 'marketing_search_logs': []}
        self.n = 0

    def _match(self, row, filters_):
        for k, v in filters_.items():
            if k in ('select', 'limit', 'order', 'offset'):
                continue
            op, _, val = v.partition('.')
            cur = row.get(k)
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
    """Akceptuje kandydatów z „DJ” w nazwie."""

    def __init__(self, *a, **kw):
        self.calls = 0

    async def classify(self, items, mode='lead'):
        self.calls += 1
        return {i['id']: {'ok': 'DJ' in i['name'], 'group': 'A', 'title': i['name'], 'short_description': 'opis',
                          'reason': 'test'} for i in items}


def run(coro):
    return asyncio.run(coro)


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        self.engine = pipeline.Engine(self.db, None, 'http://searx')
        self.engine.run_id, self.engine.status, self.engine.target = 'r1', 'running', 10

    def test_admit_and_classify(self):
        db, e = self.db, self.engine
        db.tables['marketing_verified_contacts'].append({'id': 'v1', 'email': 'old@djstary.pl', 'url': 'https://djstary.pl'})
        run(e.load_known())
        cands = [
            {'source': 'search', 'source_ref': 'https://djmax.pl', 'name': 'DJ Max', 'url': 'https://djmax.pl',
             'domain': 'djmax.pl', 'emails': ['biuro@djmax.pl'], 'snippet': 'wesela'},
            {'source': 'search', 'source_ref': 'https://djmax.pl', 'name': 'DJ Max', 'url': 'https://djmax.pl',
             'domain': 'djmax.pl', 'emails': ['biuro@djmax.pl'], 'snippet': ''},
            {'source': 'search', 'source_ref': 'https://djstary.pl/x', 'name': 'DJ', 'url': 'https://djstary.pl/x',
             'domain': 'djstary.pl', 'emails': ['nowy@djstary.pl'], 'snippet': ''},
            {'source': 'search', 'source_ref': 'https://sp5.pl', 'name': 'Szkoła Podstawowa nr 5', 'url': 'https://sp5.pl',
             'domain': 'sp5.pl', 'emails': ['sekretariat@sp5.pl'], 'snippet': ''},
            {'source': 'ceidg', 'source_ref': 'f1', 'name': 'Sala Weselna', 'url': 'https://sala.pl',
             'domain': 'sala.pl', 'emails': ['sala@gmail.com'], 'snippet': ''},
        ]
        admitted = [run(e.admit(c)) for c in cands]
        self.assertEqual(admitted, [True, False, False, False, True])
        self.assertEqual((e.stats['dropped_duplicate'], e.stats['dropped_public']), (2, 1))
        done = run(e.classify_once(FakeClassifier()))
        self.assertEqual(done, 2)
        verified = db.tables['marketing_verified_contacts']
        self.assertEqual([v['email'] for v in verified], ['old@djstary.pl', 'biuro@djmax.pl'])
        self.assertEqual((verified[1]['quality'], verified[1]['source'], verified[1]['verify_reason']), ('good', 'search', '[A] test'))
        statuses = {c['source_ref']: c['status'] for c in db.tables['marketing_candidates']}
        self.assertEqual(statuses, {'https://djmax.pl': 'accepted', 'https://sp5.pl': 'rejected', 'f1': 'rejected'})

    def test_no_quota_and_provider_failure(self):
        e = self.engine
        run(e.admit({'source': 'search', 'source_ref': 'u', 'name': 'DJ', 'url': 'https://dj.pl', 'domain': 'dj.pl',
                     'emails': ['a@dj.pl'], 'snippet': ''}))

        class Down:
            def __init__(self, result):
                self.result = result

            async def classify(self, items, mode='lead'):
                return self.result
        self.assertEqual(run(e.classify_once(Down({}))), -1)
        self.assertEqual(self.db.tables['marketing_candidates'][0]['status'], 'new')
        with self.assertRaises(pipeline.NoQuota):
            run(e.classify_once(Down(None)))
        self.assertEqual(self.db.tables['marketing_candidates'][0]['status'], 'new')

    def test_review_marks_without_deleting(self):
        db, e = self.db, self.engine
        db.tables['marketing_verified_contacts'] = [
            {'id': 'a', 'email': 'biuro@djmax.pl', 'url': 'https://djmax.pl', 'title': 'DJ Max', 'reviewed_at': None},
            {'id': 'b', 'email': 'sekretariat@sp5.edu.pl', 'url': 'https://sp5.edu.pl', 'title': 'SP5', 'reviewed_at': None},
            {'id': 'c', 'email': 'x@hotel.pl', 'url': 'https://hotel.pl', 'title': 'Hotel', 'reviewed_at': None},
            {'id': 'd', 'email': 'y@hotel2.pl', 'url': 'https://hotel2.pl', 'title': 'Hotel', 'reaction': 'replied',
             'reviewed_at': None},
            {'id': 'e', 'email': 'z@done.pl', 'url': 'https://done.pl', 'title': 'Hotel', 'reviewed_at': 'x'},
        ]
        orig = pipeline.Classifier
        pipeline.Classifier = FakeClassifier
        try:
            run(e.run_review())
        finally:
            pipeline.Classifier = orig
        q = {r['id']: r.get('quality') for r in db.tables['marketing_verified_contacts']}
        self.assertEqual(q, {'a': 'good', 'b': 'junk', 'c': 'junk', 'd': 'good', 'e': None})
        self.assertEqual(len(db.tables['marketing_verified_contacts']), 5)
        self.assertEqual((e.verified, e.junk), (2, 2))


if __name__ == '__main__':
    unittest.main()

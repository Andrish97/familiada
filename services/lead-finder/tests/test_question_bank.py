import asyncio
import copy
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from lf.question_bank import validate_question, public_address, QuestionBank
from lf.resources import FairGate, BudgetUnavailable, ProviderUnavailable, deepseek


def question():
    return {'text': 'Co zabierasz na plażę?', 'answers': [{'text': 'Ręcznik', 'fixed_points': 40}, {'text': 'Parasol', 'fixed_points': 30}, {'text': 'Wodę', 'fixed_points': 22}],
            'evidence': 'Co zabierasz na plażę? Ręcznik 40 Parasol 30 Wodę 22'}


class ValidationTest(unittest.TestCase):
    def test_points_and_origin(self):
        raw = question()
        source = {'url': 'https://example.org/x', 'content': raw['evidence'], 'hash': 'abc'}
        value = validate_question(raw, 'pl', 'search', source)
        self.assertEqual(sum(a['fixed_points'] for a in value['answers']), 92)
        self.assertEqual(value['source']['points_origin'], 'source')
        changed = copy.deepcopy(raw)
        changed['answers'][0]['fixed_points'] = 41
        self.assertIsNone(validate_question(changed, 'pl', 'search', source))
        enriched = validate_question(changed, 'pl', 'search', source, enrich=True)
        self.assertEqual(enriched['source']['points_origin'], 'estimated')
        self.assertEqual(enriched['source']['answers_origin'], 'ai_completed')

    def test_missing_points_and_duplicate_answers(self):
        raw = question()
        raw['answers'][0]['fixed_points'] = True
        self.assertIsNone(validate_question(raw, 'pl', 'generated'))
        raw = question()
        raw['answers'][1]['text'] = raw['answers'][0]['text'].upper()
        self.assertIsNone(validate_question(raw, 'pl', 'generated'))
        raw = question()
        raw['answers'][2]['fixed_points'] = 90
        self.assertIsNone(validate_question(raw, 'pl', 'generated'))


class AsyncTest(unittest.IsolatedAsyncioTestCase):
    async def test_ssrf_rejected_before_fetch(self):
        for url in ('file:///etc/passwd', 'https://user:pass@example.org', 'http://example.org:8001/'):
            with self.assertRaises(ValueError):
                await public_address(url)
        with patch('asyncio.get_running_loop') as loop:
            loop.return_value.getaddrinfo = AsyncMock(return_value=[(2, 1, 6, '', ('127.0.0.1', 80))])
            with self.assertRaises(ValueError):
                await public_address('http://example.org')

    async def test_shared_gate_limit_and_fairness(self):
        gate = FairGate(2)
        entered, release = [], asyncio.Event()
        async def work(owner):
            async with gate.slot(owner):
                entered.append(owner)
                self.assertLessEqual(gate.active, 2)
                await release.wait()
        tasks = [asyncio.create_task(work('marketing')) for _ in range(4)]
        tasks.append(asyncio.create_task(work('questions')))
        await asyncio.sleep(0)
        self.assertEqual(len(entered), 2)
        release.set()
        await asyncio.gather(*tasks)
        self.assertEqual(entered[2], 'questions')
        self.assertEqual(gate.active, 0)

    async def test_cancelled_waiter_does_not_leak_slot(self):
        gate = FairGate(1)
        async with gate.slot('marketing'):
            async def pending():
                async with gate.slot('questions'):
                    pass
            task = asyncio.create_task(pending())
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertEqual(gate.active, 0)
        async with gate.slot('questions'):
            self.assertEqual(gate.active, 1)

    async def test_budget_reservation_before_network(self):
        db, client = AsyncMock(), AsyncMock()
        db.rpc.return_value = False
        with patch.dict(os.environ, {'DEEP_SEEK_API_KEY': 'test-only'}):
            with self.assertRaises(BudgetUnavailable):
                await deepseek(db, client, 'Test', 'questions')
        client.post.assert_not_called()

    async def test_no_games_on_short_pool_and_manual_metadata(self):
        db, client = AsyncMock(), AsyncMock()
        db.select.return_value = []
        db.rpc.return_value = []
        bank = QuestionBank(db, client, 'http://searxng', 'test-only')
        bank.ask = AsyncMock()
        with self.assertRaisesRegex(ValueError, 'Za mało'):
            await bank.create_games({'lang': 'pl', 'mode': 'auto', 'count': 10, 'quantity': 2, 'request_id': '00000000-0000-4000-8000-000000000001'})
        bank.ask.assert_not_called()
        candidate_call = next(call for call in db.rpc.call_args_list if call.args[0] == 'qf_candidates')
        self.assertNotIn('p_embedding', candidate_call.args[1])
        self.assertTrue(all(call.args[0] != 'qf_games_commit' for call in db.rpc.call_args_list))

    async def test_search_round_recalls_verifies_source_and_queues_page(self):
        db = AsyncMock()
        db.rpc = AsyncMock(side_effect=lambda name, params=None: {'known': []} if name == 'qf_known_questions' else {'ok': True})
        db.select.return_value = []
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        recalled = {'questions': [
            {'text': 'Co zabierasz na plażę?', 'category_hint': 'wakacje', 'answers': [{'text': 'Ręcznik', 'fixed_points': 40}, {'text': 'Parasol', 'fixed_points': 30}, {'text': 'Wodę', 'fixed_points': 22}]},
            {'text': 'Co robisz w deszczowy dzień?', 'answers': [{'text': 'Czytam', 'fixed_points': 40}, {'text': 'Śpię', 'fixed_points': 30}, {'text': 'Gram', 'fixed_points': 20}]}]}
        bank.ask = AsyncMock(return_value=recalled)
        bank.embed = AsyncMock(side_effect=lambda texts: [[1.0] * 384 for _ in texts])
        bank.review = AsyncMock(side_effect=lambda candidates, category, lang: candidates)
        page = {'url': 'https://fani.example.org/familiada', 'hash': 'h1',
                'content': 'Menu\nPytanie 7: CO ZABIERASZ NA PLAŻĘ?\nRęcznik – 40 pkt\nParasol – 30 pkt\nWodę – 22 pkt\nStopka'}
        searches = []

        async def fake_search(client, url, query, page_no, owner, language):
            searches.append(query)
            return ([{'url': page['url']}] if 'plażę' in query else [{'url': 'https://inna.example.org/'}]), []

        async def fake_fetch(client, url):
            return page if url == page['url'] else {'url': url, 'hash': 'h2', 'content': 'Inna treść bez pytania'}
        job = {'id': 'job', 'lease': 'lease', 'lang': 'pl', 'kind': 'search', 'enrich': False, 'category': 'wakacje', 'target': 50, 'accepted': 0, 'cursor': 0, 'queries': [], 'round': 0}
        with patch('lf.question_bank.search', fake_search), patch('lf.question_bank.fetch_source', fake_fetch):
            await bank.process(job)
        self.assertIn('Familiada', bank.ask.call_args.args[0])
        self.assertEqual(searches, ['"Co zabierasz na plażę"', '"Co robisz w deszczowy dzień"'])
        offers = [c.args[1]['p_question'] for c in db.rpc.call_args_list if c.args[0] == 'qf_offer']
        self.assertEqual([o['text'] for o in offers], ['Co zabierasz na plażę?'])
        self.assertEqual(offers[0]['origin'], 'search')
        self.assertEqual(offers[0]['source']['url'], page['url'])
        self.assertEqual(offers[0]['source']['points_origin'], 'source')
        self.assertTrue(offers[0]['source']['evidence'].startswith('CO ZABIERASZ NA PLAŻĘ?'))
        checkpoint = [c for c in db.rpc.call_args_list if c.args[0] == 'qf_job_checkpoint'][-1].args[1]['p_state']
        self.assertEqual(checkpoint['rejected'], 1)
        self.assertIn({'url': page['url']}, checkpoint['queries'])
        self.assertIn({'seen': 'co robisz w deszczowy dzień'}, checkpoint['queries'])
        self.assertEqual(checkpoint['round'], 1)
        logs = [c.args[1] for c in db.insert.call_args_list if c.args[0] == 'producer_question_logs']
        self.assertEqual(len(logs), 1)
        self.assertEqual((logs[0]['lang'], logs[0]['job_id'], logs[0]['level']), ('pl', 'job', 'success'))
        self.assertIn('DeepSeek zaproponował 2 pytań, już znanych (pominięte przed sprawdzaniem stron): 0, potwierdzone na stronach: 1 (fani.example.org)', logs[0]['message'])
        self.assertIn('dodano: 1', logs[0]['message'])
        self.assertIn('Postęp: 1/50', logs[0]['message'])

    async def test_collect_and_control_are_logged_per_language(self):
        from lf.question_bank import router_for, RequestBody
        import uuid
        db = AsyncMock()
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        route = [r for r in router_for(bank, lambda: True).routes if r.path == '/api/questions/{action}'][0]
        db.rpc.return_value = {'id': 'job-1', 'status': 'queued', 'accepted': 0}
        await route.endpoint('collect', RequestBody(lang='uk', request_id=uuid.uuid4(), kind='search', target=20, category='зима', enrich=True))
        table, filters = db.delete.await_args.args
        self.assertEqual((table, filters['lang']), ('producer_question_logs', 'eq.uk'))
        entry = db.insert.await_args.args[1]
        self.assertEqual((entry['lang'], entry['job_id']), ('uk', 'job-1'))
        self.assertIn('Zlecono 20 nowych pytań (wyszukiwanie, z uzupełnianiem odpowiedzi przez AI, kategoria: зима)', entry['message'])
        db.select.return_value = [{'id': 'x'}]
        db.rpc.return_value = True
        await route.endpoint('control', RequestBody(lang='uk', job_id=uuid.uuid4(), control='pause'))
        self.assertEqual(db.insert.await_args.args[1]['message'], 'Zlecenie wstrzymane.')

    async def test_provider_wait_is_logged_as_warning(self):
        db = AsyncMock()
        db.rpc.return_value = True
        db.select.return_value = []
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.ask = AsyncMock(side_effect=ProviderUnavailable('Dostawca AI: HTTP 503.'))
        job = {'id': 'job', 'lease': 'lease', 'lang': 'en', 'kind': 'generated', 'enrich': False, 'category': '', 'target': 5, 'accepted': 0, 'cursor': 0, 'queries': [], 'round': 0}
        await bank.process(job)
        entry = [c.args[1] for c in db.insert.call_args_list if c.args[0] == 'producer_question_logs'][-1]
        self.assertEqual((entry['lang'], entry['level']), ('en', 'warning'))
        self.assertIn('HTTP 503', entry['message'])

    async def test_disassemble_sends_questions_with_vectors_and_logs(self):
        from lf.question_bank import router_for, RequestBody
        import uuid
        db = AsyncMock()
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        route = [r for r in router_for(bank, lambda: True).routes if r.path == '/api/questions/{action}'][0]
        payload = {'questions': [{'text': 'Co zabierasz na plażę?', 'answers': [{'text': 'Ręcznik', 'fixed_points': 40}], 'origin': 'search', 'source': {'url': 'https://x.example/q'}}]}
        db.select.side_effect = [[], [{'id': 'g1', 'title': 'Stara gra', 'payload': payload, 'status': 'withdrawn'}]]
        bank.embed = AsyncMock(return_value=[[0.5] * 384])
        db.rpc.return_value = {'ok': True, 'restored': 1, 'duplicates': 0, 'skipped': 0}
        gid = uuid.UUID('00000000-0000-4000-8000-000000000001')
        result = await route.endpoint('disassemble', RequestBody(lang='pl', game_id=gid))
        self.assertEqual(result, {'ok': True, 'restored': 1, 'duplicates': 0, 'skipped': 0})
        name, params = db.rpc.await_args.args
        self.assertEqual((name, params['p_id'], params['p_lang']), ('qf_disassemble', str(gid), 'pl'))
        self.assertEqual(params['p_questions'][0]['source'], {'url': 'https://x.example/q'})
        self.assertEqual(len(params['p_questions'][0]['embedding']), 384)
        self.assertIn('Stara gra', db.insert.await_args.args[1]['message'])
        db.select.side_effect = [[{'id': 'g1', 'title': 'Nowa', 'payload': payload, 'published_id': 'm1'}]]
        db.rpc.return_value = {'ok': False, 'reason': 'published'}
        with self.assertRaises(Exception) as ctx:
            await route.endpoint('disassemble', RequestBody(lang='pl', game_id=gid))
        self.assertIn('Najpierw wycofaj', str(ctx.exception.detail))

    async def test_known_proposals_skip_page_search_and_review(self):
        db = AsyncMock()
        db.select.return_value = []
        known_calls = []

        async def rpc(name, params=None):
            if name == 'qf_known_questions':
                known_calls.append([q['text'] for q in params['p_questions']])
                return {'known': [0]}
            return {'ok': True}
        db.rpc = AsyncMock(side_effect=rpc)
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        answers = [{'text': 'Ręcznik', 'fixed_points': 40}, {'text': 'Parasol', 'fixed_points': 30}, {'text': 'Wodę', 'fixed_points': 22}]
        bank.ask = AsyncMock(return_value={'questions': [
            {'text': 'Co zabierasz na plażę?', 'answers': answers},
            {'text': 'CO ZABIERASZ NA PLAŻĘ?', 'answers': answers},
            {'text': 'Co robisz w deszczowy dzień?', 'answers': answers}]})
        bank.embed = AsyncMock(side_effect=lambda texts: [[1.0] * 384 for _ in texts])
        bank.review = AsyncMock(side_effect=lambda candidates, category, lang: candidates)
        searches = []

        async def fake_search(client, url, query, page_no, owner, language):
            searches.append(query)
            return [], []
        job = {'id': 'job', 'lease': 'lease', 'lang': 'pl', 'kind': 'search', 'enrich': False, 'category': '', 'target': 50, 'accepted': 0, 'cursor': 0, 'queries': [], 'round': 0}
        with patch('lf.question_bank.search', fake_search):
            await bank.process(job)
        # Powtórka w paczce odpada bez bazy (już przy propozycjach), znane pytanie po zapytaniu do bazy — żadne nie idzie do wyszukiwarki.
        self.assertEqual(known_calls, [['Co zabierasz na plażę?', 'Co robisz w deszczowy dzień?']])
        self.assertEqual(searches, ['"Co robisz w deszczowy dzień"'])
        checkpoint = [c for c in db.rpc.call_args_list if c.args[0] == 'qf_job_checkpoint'][-1].args[1]['p_state']
        self.assertEqual(checkpoint['duplicates'], 1)
        log = [c.args[1] for c in db.insert.call_args_list if c.args[0] == 'producer_question_logs'][-1]
        self.assertIn('już znanych (pominięte przed sprawdzaniem stron): 1', log['message'])
        bank.review.assert_awaited_once()
        self.assertEqual(bank.review.await_args.args[0], [])

    def test_evidence_window_and_answer_points(self):
        from lf.question_bank import evidence_window, answer_in
        window = evidence_window('x\nCo   zabierasz, na plażę?\n40 Ręcznik | Parasol: 30', 'Co zabierasz na plażę?')
        self.assertTrue(window.startswith('Co zabierasz, na plażę?'))
        self.assertTrue(answer_in(window, {'text': 'Ręcznik', 'fixed_points': 40}))
        self.assertTrue(answer_in(window, {'text': 'Parasol', 'fixed_points': 30}))
        self.assertFalse(answer_in(window, {'text': 'Parasol', 'fixed_points': 31}))
        self.assertIsNone(evidence_window('Co bierzesz na plażę?', 'Co zabierasz na plażę?'))

    async def test_cached_source_budget_wait_retries_same_page(self):
        from datetime import datetime, timezone
        db = AsyncMock()
        db.rpc = AsyncMock(side_effect=lambda name, params=None: {'known': []} if name == 'qf_known_questions' else True)
        db.select.return_value = [{'candidates':[question()], 'fetched_at':datetime.now(timezone.utc).isoformat()}]
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.embed = AsyncMock(return_value=[[1.0] + [0.0] * 383])
        bank.review = AsyncMock(side_effect=BudgetUnavailable())
        job = {'id':'job', 'lease':'lease', 'lang':'pl', 'kind':'search', 'enrich':False, 'category':'', 'target':50, 'accepted':0, 'cursor':0, 'queries':[{'url':'https://example.org/q'}], 'round':1}
        await bank.process(job)
        checkpoint = db.rpc.call_args.args[1]['p_state']
        self.assertEqual(checkpoint['status'], 'waiting_budget')
        self.assertEqual(checkpoint['cursor'], 0)

    async def test_generated_questions_reviewed_before_offer(self):
        db = AsyncMock()
        db.select.return_value = []
        db.rpc = AsyncMock(side_effect=lambda name, params=None: {'known': []} if name == 'qf_known_questions' else {'reason': 'accepted'})
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.ask = AsyncMock(side_effect=[{'questions':[question()]}, {'accepted':[0]}])
        bank.embed = AsyncMock(return_value=[[1.0]+[0.0]*383])
        await bank.process({'id':'job','lease':'lease','lang':'pl','kind':'generated','category':'wakacje','target':1,'accepted':0,'cursor':0,'queries':[],'round':0})
        calls = db.rpc.call_args_list
        names = [c.args[0] for c in calls]
        # Odsiewanie powtórzeń przed kontrolą jakości, zapis po niej, wektor policzony raz.
        self.assertLess(names.index('qf_known_questions'), names.index('qf_offer'))
        offer = calls[names.index('qf_offer')]
        self.assertEqual(offer.args[1]['p_question']['source']['points_origin'], 'estimated')
        self.assertEqual(bank.embed.await_count, 1)
        self.assertEqual(calls[-1].args[0], 'qf_job_checkpoint')
        self.assertEqual(bank.ask.await_count, 2)

    async def test_game_metadata_repairs_wrong_count_before_atomic_commit(self):
        db = AsyncMock()
        db.select.return_value = []
        candidates = [{'id':str(i), 'text':'Pytanie '+str(i)} for i in range(10)]
        db.rpc.side_effect = [candidates, [{'id':'new-game'}]]
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.ask = AsyncMock(side_effect=[{'games':[]}, {'games':[{'game_index':0,'title':'Rodzinny wieczór','description':'Gra dla całej rodziny.'}]}])
        result = await bank.create_games({'lang':'pl','mode':'auto','count':10,'quantity':1,'include_ai':True,'request_id':'00000000-0000-4000-8000-000000000001'})
        self.assertEqual(result['games'][0]['id'],'new-game')
        self.assertEqual(bank.ask.await_count,2)
        self.assertIn('exactly 1 GAMES',bank.ask.call_args.args[0])
        self.assertEqual(db.rpc.call_args.args[0],'qf_games_commit')
        self.assertEqual(db.rpc.call_args.args[1]['p_count'],10)

    async def test_delete_withdrawn_game_and_prevent_published(self):
        from lf.question_bank import router_for, RequestBody
        import uuid
        db = AsyncMock()
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        router = router_for(bank, lambda: True)
        delete_route = [r for r in router.routes if r.path == '/api/questions/{action}'][0]
        gid = uuid.UUID('00000000-0000-4000-8000-000000000001')

        # Gra opublikowana: odmowa z bazy, bez żadnego usunięcia po stronie usługi.
        db.rpc.return_value = {'ok': False, 'reason': 'published'}
        with self.assertRaises(Exception) as ctx:
            await delete_route.endpoint('delete', RequestBody(lang='pl', game_id=gid))
        self.assertIn('Najpierw wycofaj', str(ctx.exception.detail))
        db.rpc.assert_awaited_with('qf_delete', {'p_id': str(gid), 'p_lang': 'pl'})

        # Gra wycofana: jedno wywołanie transakcji qf_delete (historia pytań w bazie).
        db.rpc.return_value = {'ok': True, 'history_added': 10}
        res = await delete_route.endpoint('delete', RequestBody(lang='pl', game_id=gid))
        self.assertEqual(res, {'ok': True})
        db.delete.assert_not_awaited()

        db.rpc.return_value = {'ok': False, 'reason': 'not_found'}
        with self.assertRaises(Exception) as ctx:
            await delete_route.endpoint('delete', RequestBody(lang='uk', game_id=gid))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_url_exclusion(self):
        from lf.question_bank import is_excluded_url
        self.assertTrue(is_excluded_url('https://www.facebook.com/groups/quiz'))
        self.assertTrue(is_excluded_url('https://allegro.pl/oferta/gra-teleturniej-123'))
        self.assertTrue(is_excluded_url('https://onet.pl/regulamin.pdf'))
        self.assertTrue(is_excluded_url('https://strona.pl/login'))
        self.assertFalse(is_excluded_url('https://fani-familiady.pl/odcinki/498'))

    def test_promising_source_filter(self):
        from lf.question_bank import is_promising_source
        self.assertFalse(is_promising_source('za krótki tekst', 'pl'))
        self.assertFalse(is_promising_source('To jest zwykły artykuł o pogodzie w górach. Pada deszcz i wieje silny wiatr. Temperatura wynosi 12 stopni i nic więcej.', 'pl'))
        self.assertFalse(is_promising_source('Jakie jest ulubione zwierzę Polaków? Pies, kot, chomik, papuga, królik bez żadnych liczb na stronie.', 'pl', enrich=False))
        content = 'Pytanie: Co najczęściej zabieramy na plażę? 1. Ręcznik 35 2. Krem z filtrem 25 3. Parasol 18 4. Piłkę 12.'
        self.assertTrue(is_promising_source(content, 'pl', enrich=False))
        self.assertTrue(is_promising_source('Co najczęściej zabieramy na plażę? Ręcznik, krem z filtrem, parasol.', 'pl', enrich=True))

    async def test_unpromising_source_skips_ai_call(self):
        db = AsyncMock()
        db.select.return_value = []
        db.insert.return_value = True
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.ask = AsyncMock()
        bank.review = AsyncMock(return_value=[])
        bank.rpc = AsyncMock(return_value={})

        with patch('lf.question_bank.fetch_source', new=AsyncMock(return_value={'content': 'Regulamin strony i polityka cookies bez ankiet i bez żadnych pytań.', 'hash': 'h1'})):
            job = {'id': 'j1', 'lease': 'l1', 'lang': 'pl', 'kind': 'search', 'target': 10, 'accepted': 0, 'category': '',
                   'cursor': 0, 'queries': [{'url': 'https://example.com/regulamin'}], 'round': 1}
            await bank.process(job)
        bank.ask.assert_not_called()
        cache = [c.args[1] for c in db.insert.call_args_list if c.args[0] == 'producer_question_sources']
        self.assertEqual([row['candidates'] for row in cache], [[]])

    def test_fix_caps_and_validate_question(self):
        from lf.question_bank import fix_caps, validate_question
        raw = {
            'text': 'WYGLĄDASZ PROFESJONALNIE NA CALLU, ALE CO MASZ NA SOBIE OD PASA W DÓŁ?',
            'answers': [
                {'text': 'DRESY', 'fixed_points': 40},
                {'text': 'PIŻAMA', 'fixed_points': 30},
                {'text': 'BOKSERKI', 'fixed_points': 20}
            ]
        }
        res = validate_question(raw, 'pl', 'generated')
        self.assertIsNotNone(res)
        self.assertEqual(res['text'], 'Wyglądasz profesjonalnie na callu, ale co masz na sobie od pasa w dół?')
        self.assertEqual([a['text'] for a in res['answers']], ['Dresy', 'Piżama', 'Bokserki'])

    async def test_update_question_content_and_caps_normalization(self):
        from lf.question_bank import router_for, RequestBody
        import uuid
        db = AsyncMock()
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.embed = AsyncMock(return_value=[[0.1] * 384])
        router = router_for(bank, lambda: True)
        update_route = [r for r in router.routes if r.path == '/api/questions/{action}'][0]
        qid = uuid.UUID('00000000-0000-4000-8000-000000000002')

        # Pytanie nie istnieje
        db.select.return_value = []
        with self.assertRaises(Exception):
            await update_route.endpoint('update_question', RequestBody(lang='pl', id=qid, text='Nowe pytanie testowe?'))

        # Poprawna edycja z normalizacją capsa
        db.select.side_effect = [
            [{'id': str(qid), 'text': 'Stare pytanie?', 'answers': [{'text': 'Odp 1', 'fixed_points': 50}], 'category_hint': 'Praca'}],
            [] # brak duplikatu
        ]
        db.update.return_value = True
        res = await update_route.endpoint('update_question', RequestBody(lang='pl', id=qid, text='CO ROBIMY W WOLNYM CZASIE?'))
        self.assertTrue(res['ok'])
        self.assertEqual(res['question']['text'], 'Co robimy w wolnym czasie?')
        self.assertEqual(db.update.await_count, 1)


if __name__ == '__main__':
    unittest.main()

import asyncio
import copy
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from lf.question_bank import validate_question, public_address, QuestionBank
from lf.resources import FairGate, BudgetUnavailable, deepseek


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
        self.assertTrue(all(call.args[0] != 'qf_games_commit' for call in db.rpc.call_args_list))

    async def test_search_round_uses_optional_completion_and_persists_links(self):
        db = AsyncMock()
        db.rpc.return_value = True
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.ask = AsyncMock(return_value={'queries': ['familiada pytania']})
        bank.embed = AsyncMock(return_value=[])
        bank.review = AsyncMock(return_value=[])
        job = {'id':'job', 'lease':'lease', 'lang':'pl', 'kind':'search', 'enrich':True, 'category':'wakacje', 'target':50, 'accepted':0, 'cursor':0, 'queries':[], 'round':0}
        with patch('lf.question_bank.search', AsyncMock(return_value=([{'url':'https://example.org/questions'}], False))):
            await bank.process(job)
        self.assertIn('optional', bank.ask.call_args.args[0])
        checkpoint = db.rpc.call_args.args[1]['p_state']
        self.assertEqual(checkpoint['cursor'], 1)
        self.assertEqual(checkpoint['queries'][1], {'url':'https://example.org/questions'})
        self.assertEqual(checkpoint['round'], 1)

    async def test_cached_source_budget_wait_retries_same_page(self):
        from datetime import datetime, timezone
        db = AsyncMock()
        db.rpc.return_value = True
        db.select.return_value = [{'candidates':[question()], 'fetched_at':datetime.now(timezone.utc).isoformat()}]
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.review = AsyncMock(side_effect=BudgetUnavailable())
        job = {'id':'job', 'lease':'lease', 'lang':'pl', 'kind':'search', 'enrich':False, 'category':'', 'target':50, 'accepted':0, 'cursor':0, 'queries':[{'url':'https://example.org/q'}], 'round':1}
        await bank.process(job)
        checkpoint = db.rpc.call_args.args[1]['p_state']
        self.assertEqual(checkpoint['status'], 'waiting_budget')
        self.assertEqual(checkpoint['cursor'], 0)

    async def test_generated_questions_reviewed_before_offer(self):
        db = AsyncMock()
        db.select.return_value = []
        db.rpc.return_value = {'reason':'accepted'}
        bank = QuestionBank(db, AsyncMock(), 'http://searxng', 'test-only')
        bank.ask = AsyncMock(side_effect=[{'questions':[question()]}, {'accepted':[0]}])
        bank.embed = AsyncMock(return_value=[[1.0]+[0.0]*383])
        await bank.process({'id':'job','lease':'lease','lang':'pl','kind':'generated','category':'wakacje','target':1,'accepted':0,'cursor':0,'queries':[],'round':0})
        calls = db.rpc.call_args_list
        self.assertEqual(calls[0].args[0], 'qf_offer')
        self.assertEqual(calls[0].args[1]['p_question']['source']['points_origin'], 'estimated')
        self.assertEqual(calls[-1].args[0], 'qf_job_checkpoint')
        self.assertEqual(bank.ask.await_count, 2)


if __name__ == '__main__':
    unittest.main()

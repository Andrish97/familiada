import test from 'node:test';
import assert from 'node:assert/strict';
import { createPollVoteSession, createPollVoteView } from '../../web/shared/js/core/poll-vote-session.js';

const messages = Object.fromEntries(['thanks','sending','loadTimeout','pollStopped','pollEnded','linkExpired','pollNotFound','inviteDone','inviteExpired','taskInvalid','loginToVote','emailRequired','openTaskFail'].map(key => [key, () => key]));
function setup(type, handler, context = { gameId: 'game', key: 'run', taskToken: 'task' }) {
  const calls = [], waits = [], statuses = [], progress = [];
  const client = { rpc(name, args) { calls.push({ name, args }); return handler(name, args, calls); } };
  const values = new Map();
  const session = createPollVoteSession({ type, messages, getClient: () => client,
    readContext: () => context, resolveContext: data => Object.assign(context, { gameId: data.game_id, key: data.key }),
    view: { setSub: text => progress.push(text), showStatus: text => statuses.push(text) }, getUser: async () => null,
    sleep: async ms => waits.push(ms), storage: () => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }), idFactory: () => 'local-voter',
  });
  return { session, calls, waits, statuses, progress, context };
}

for (const [type, rpc] of [['points','poll_points_vote_batch'], ['text','poll_text_submit_batch']]) {
  test(`${type}: resolution supplies game/run/voter, retries and chunks preserve vote identity`, async () => {
    let failures = 2;
    const x = setup(type, async name => {
      if (name === 'poll_task_resolve') return { data: { ok: true, kind: 'task', game_id: 'resolved-game', key: 'resolved-run', voter_token: 'task-voter' } };
      if (name === rpc && failures-- > 0) return { error: new Error('temporary') };
      return {};
    }, { gameId: null, key: null, taskToken: 'task' });
    await x.session.resolveTaskToken();
    const items = Array.from({ length: 53 }, (_, i) => ({ question_id: i }));
    await x.session.submitBatch(items);
    const votes = x.calls.filter(call => call.name === rpc);
    assert.equal(votes.length, 5);
    assert.deepEqual(votes.map(call => call.args.p_items.length), [25,25,25,25,3]);
    assert.deepEqual(votes.slice(2).flatMap(call => call.args.p_items), items);
    assert.ok(votes.every(call => call.args.p_game_id === 'resolved-game' && call.args.p_key === 'resolved-run' && call.args.p_voter_token === 'task-voter'));
    assert.deepEqual(x.waits, [650,1300]);
    assert.deepEqual(x.progress, ['sending (25/53)','sending (50/53)','sending (53/53)']);
    assert.ok(x.calls.some(call => call.name === 'poll_task_opened'));
  });
}

test('third failed attempt stops the batch without sending the following chunk or marking done', async () => {
  const x = setup('points', async () => ({ error: new Error('offline') }));
  await assert.rejects(x.session.submitBatch(Array(30).fill({ question_id: 1 })), /offline/);
  assert.equal(x.calls.length, 3);
  assert.ok(x.calls.every(call => call.args.p_voter_token === 'local-voter' && call.args.p_items.length === 25));
  assert.deepEqual(x.waits, [650,1300]);
});

test('anonymous voting sends the complete form once and reuses its submission identity on retry', async () => {
  const x = setup('text', async () => ({ data: { ok: true } }), { gameId: 'anonymous-game', key: 'anonymous-run', taskToken: null });
  const items = Array.from({ length: 61 }, (_, question_id) => ({ question_id, answer_raw: 'A' }));
  await x.session.submitBatch(items);
  await x.session.submitBatch(items);
  await x.session.markTaskDone();
  assert.equal(x.calls.length, 2);
  assert.ok(x.calls.every(call => call.name === 'poll_anonymous_submit' && call.args.p_items.length === 61));
  assert.equal(x.calls[0].args.p_browser_token, x.calls[1].args.p_browser_token);
  assert.equal(x.calls[0].args.p_voter_token, x.calls[1].args.p_voter_token);
});

test('anonymous cooldown is returned to the existing retry UI without internal resubmission', async () => {
  const x = setup('points', async () => ({ data: { ok: false, error: 'rate_limited', retry_after: 24 } }), { gameId: 'limited', key: 'run', taskToken: null });
  await assert.rejects(x.session.submitBatch([]), error => error.code === 'rate_limited' && error.retryAfter === 24);
  assert.equal(x.calls.length, 1);
  assert.deepEqual(x.waits, []);
});

test('link states retain distinct stopped, ended, expired and not-found messages', async () => {
  for (const [state, expected] of [['stopped','pollStopped'],['ended','pollEnded'],['expired','linkExpired'],['draft','linkExpired'],['not_found','pollNotFound'],['open',null]]) {
    const x = setup('points', async () => ({ data: { state } }));
    assert.equal(await x.session.describeLinkState(), expected);
  }
  const invalid = setup('text', async () => ({ error: { message: 'invalid input syntax for type uuid' } }));
  assert.equal(await invalid.session.describeLinkState(), 'pollNotFound');
  const unavailable = setup('text', async () => { throw new Error('network'); });
  assert.equal(await unavailable.session.describeLinkState(), null);
});

test('task access requirements never resolve the context or mark the task opened', async () => {
  for (const [extra, expected] of [[{ requires_auth: true },'loginToVote'],[{ needs_email: true },'emailRequired'],[{ ok: false, error: 'already_done' },'inviteDone'],[{ ok: false, error: 'poll_stopped' },'pollStopped']]) {
    const x = setup('text', async () => ({ data: { ok: true, kind: 'task', ...extra } }));
    await x.session.resolveTaskToken();
    assert.deepEqual(x.statuses, [expected]);
    assert.equal(x.calls.length, 1);
    assert.equal(x.context.gameId, 'game');
  }
});

test('payload accepts Supabase thenables without a finally method and propagates RPC errors', async () => {
  const x = setup('text', () => ({ then(resolve) { resolve({ data: { questions: ['q'] } }); } }));
  assert.deepEqual(await x.session.loadPayload(), { questions: ['q'] });
  const bad = setup('text', async () => ({ error: new Error('payload unavailable') }));
  await assert.rejects(bad.session.loadPayload(), /payload unavailable/);
});

test('the final thank-you is idempotent, hides the questions and schedules only one redirect', async () => {
  const element = () => ({ hidden: false, textContent: '', classList: { add() {} } });
  const qbox = element(), closed = element(), subEl = element(), timers = [], redirects = [];
  const view = createPollVoteView({ qbox, closed, subEl, messages, getUser: async () => null,
    document: { querySelector: () => element() }, location: { replace: url => redirects.push(url) },
    withLangParam: url => url + '?lang=uk', schedule: (fn, ms) => timers.push({ fn, ms }),
  });
  view.showFinished(); view.showFinished();
  assert.equal(view.finished, true);
  assert.equal(qbox.hidden, true);
  assert.equal(closed.hidden, true);
  assert.equal(subEl.textContent, 'thanks');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 5000);
  timers[0].fn(); await Promise.resolve();
  assert.deepEqual(redirects, ['/?lang=uk']);
});

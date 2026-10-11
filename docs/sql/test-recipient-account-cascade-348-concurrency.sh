#!/usr/bin/env bash
set -euo pipefail
ACCOUNT348_TMP=$(mktemp -d)
finish() {
 ACCOUNT348_STATUS=$?
 if [[ "$ACCOUNT348_STATUS" != 0 ]]; then cat "$ACCOUNT348_TMP/holder" "$ACCOUNT348_TMP/waiter" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3488-0000-0000-000000000001','bbbbbbbb-3488-0000-0000-000000000002')"
 rm -rf "$ACCOUNT348_TMP"
 exit "$ACCOUNT348_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3488-0000-0000-000000000001','owner348race@example.invalid');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('dddddddd-3488-0000-0000-000000000004','aaaaaaaa-3488-0000-0000-000000000001','Race348','poll_text','poll_open','race348');
INSERT INTO public.questions(game_id,ord,text) SELECT 'dddddddd-3488-0000-0000-000000000004',n,'Q'||n FROM generate_series(1,10) n;
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,n,'A'||n FROM public.questions q CROSS JOIN generate_series(1,4) n WHERE q.game_id='dddddddd-3488-0000-0000-000000000004';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id='dddddddd-3488-0000-0000-000000000004';
SQL
for ACCOUNT348_TYPE in poll_text poll_points; do
 for ACCOUNT348_SIZE in partial complete; do
  for ACCOUNT348_ORDER in delete-first vote-first; do
   psql -q -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.poll_tasks WHERE game_id='dddddddd-3488-0000-0000-000000000004';
DELETE FROM public.poll_text_entries WHERE game_id='dddddddd-3488-0000-0000-000000000004';
DELETE FROM public.poll_votes WHERE game_id='dddddddd-3488-0000-0000-000000000004';
UPDATE public.games SET type='$ACCOUNT348_TYPE'::public.game_type WHERE id='dddddddd-3488-0000-0000-000000000004';
INSERT INTO auth.users(id,email) VALUES('bbbbbbbb-3488-0000-0000-000000000002','recipient348race@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('bbbbbbbb-3488-0000-0000-000000000002','recipient348race@example.invalid','recipient348race') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.poll_tasks(id,owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES('eeeeeeee-3488-0000-0000-000000000005','aaaaaaaa-3488-0000-0000-000000000001','bbbbbbbb-3488-0000-0000-000000000002','dddddddd-3488-0000-0000-000000000004','$ACCOUNT348_TYPE','race348');
SQL
   ACCOUNT348_RPC=poll_text_submit_batch
   [[ "$ACCOUNT348_TYPE" == poll_text ]] || ACCOUNT348_RPC=poll_points_vote_batch
   ACCOUNT348_FILTER=true
   [[ "$ACCOUNT348_SIZE" == complete ]] || ACCOUNT348_FILTER='q.ord=1'
   ACCOUNT348_VOTE="PERFORM public.$ACCOUNT348_RPC('dddddddd-3488-0000-0000-000000000004','race348','task:eeeeeeee-3488-0000-0000-000000000005',(SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot')) FROM public.questions q JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id='dddddddd-3488-0000-0000-000000000004' AND $ACCOUNT348_FILTER));"
   ACCOUNT348_DELETE="DELETE FROM auth.users WHERE id='bbbbbbbb-3488-0000-0000-000000000002';"
   if [[ "$ACCOUNT348_ORDER" == delete-first ]]; then
    ACCOUNT348_HOLDER="$ACCOUNT348_DELETE"
    ACCOUNT348_WAITER="BEGIN $ACCOUNT348_VOTE RAISE EXCEPTION 'vote survived deletion'; EXCEPTION WHEN raise_exception THEN IF SQLERRM IS DISTINCT FROM 'Task unavailable' THEN RAISE; END IF; END;"
   else
    ACCOUNT348_HOLDER="$ACCOUNT348_VOTE"
    ACCOUNT348_WAITER="$ACCOUNT348_DELETE"
   fi
   rm -f "$ACCOUNT348_TMP/locked"
   psql -qAt -v ON_ERROR_STOP=1 > "$ACCOUNT348_TMP/holder" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL "request.jwt.claim.sub"='bbbbbbbb-3488-0000-0000-000000000002';
DO \$\$ BEGIN $ACCOUNT348_HOLDER END \$\$;
\! touch '$ACCOUNT348_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='account348-waiter' AND wait_event_type='Lock') INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'actions did not serialize'; END IF;
END \$\$;
COMMIT;
SQL
   ACCOUNT348_PID=$!
   for ACCOUNT348_TRY in {1..100}; do [[ -f "$ACCOUNT348_TMP/locked" ]] && break; sleep .05; done
   [[ -f "$ACCOUNT348_TMP/locked" ]]
   PGAPPNAME=account348-waiter psql -qAt -v ON_ERROR_STOP=1 > "$ACCOUNT348_TMP/waiter" 2>&1 <<SQL
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL "request.jwt.claim.sub"='bbbbbbbb-3488-0000-0000-000000000002';
DO \$\$ BEGIN $ACCOUNT348_WAITER END \$\$;
COMMIT;
SQL
   wait "$ACCOUNT348_PID"
   ACCOUNT348_EXPECTED=0
   if [[ "$ACCOUNT348_ORDER" == vote-first && "$ACCOUNT348_SIZE" == complete ]]; then ACCOUNT348_EXPECTED=10; fi
   psql -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ DECLARE n integer; BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='bbbbbbbb-3488-0000-0000-000000000002') OR EXISTS(SELECT 1 FROM public.poll_tasks WHERE id='eeeeeeee-3488-0000-0000-000000000005') THEN RAISE EXCEPTION 'recipient deletion incomplete'; END IF;
 IF '$ACCOUNT348_TYPE'='poll_text' THEN SELECT count(*) INTO n FROM public.poll_text_entries WHERE game_id='dddddddd-3488-0000-0000-000000000004'; ELSE SELECT count(*) INTO n FROM public.poll_votes WHERE game_id='dddddddd-3488-0000-0000-000000000004'; END IF;
 IF n IS DISTINCT FROM $ACCOUNT348_EXPECTED THEN RAISE EXCEPTION 'wrong result % expected%',n,$ACCOUNT348_EXPECTED; END IF;
END \$\$;
SQL
  done
 done
done
echo '348 concurrency OK: both poll types, partial/full batches, deletion-first/vote-first'

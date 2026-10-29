#!/usr/bin/env bash
set -euo pipefail
POLL344_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.games WHERE id='dddddddd-3448-0000-0000-000000000004';
DELETE FROM auth.users WHERE id='aaaaaaaa-3448-0000-0000-000000000001';
SQL
 rm -rf "$POLL344_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3448-0000-0000-000000000001','raceowner344@example.net');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('dddddddd-3448-0000-0000-000000000004','aaaaaaaa-3448-0000-0000-000000000001','Race344','poll_text','poll_open','race344');
INSERT INTO public.questions(game_id,ord,text) SELECT 'dddddddd-3448-0000-0000-000000000004',n,'Q'||n FROM generate_series(1,10) n;
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id='dddddddd-3448-0000-0000-000000000004';
INSERT INTO public.poll_tasks(id,owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES
 ('eeeeeeee-3448-0000-0000-000000000005','aaaaaaaa-3448-0000-0000-000000000001','one344@example.net','dddddddd-3448-0000-0000-000000000004','poll_text','race344'),
 ('eeeeeeee-3448-0000-0000-000000000006','aaaaaaaa-3448-0000-0000-000000000001','two344@example.net','dddddddd-3448-0000-0000-000000000004','poll_text','race344');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$POLL344_TMP/first" <<SQL &
BEGIN;
SELECT public.poll_text_submit_batch('dddddddd-3448-0000-0000-000000000004','race344','task:eeeeeeee-3448-0000-0000-000000000005',
 (SELECT jsonb_agg(jsonb_build_object('question_id',id,'answer_raw','Kot','answer_norm','kot')) FROM public.questions WHERE game_id='dddddddd-3448-0000-0000-000000000004'));
\! touch '$POLL344_TMP/locked'
SELECT pg_sleep(3);
COMMIT;
SQL
POLL344_PID=$!
for POLL344_TRY in {1..100}; do [[ -f "$POLL344_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$POLL344_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL lock_timeout='1s';
SELECT public.poll_text_submit_batch('dddddddd-3448-0000-0000-000000000004','race344','task:eeeeeeee-3448-0000-0000-000000000006',
 (SELECT jsonb_agg(jsonb_build_object('question_id',id,'answer_raw','Pies','answer_norm','pies')) FROM public.questions WHERE game_id='dddddddd-3448-0000-0000-000000000004'));
COMMIT;
BEGIN;
DO $$ DECLARE result text; BEGIN
 result:=public.poll_task_decline((SELECT token FROM public.poll_tasks WHERE id='eeeeeeee-3448-0000-0000-000000000005'));
 IF result IS DISTINCT FROM 'already_used' THEN RAISE EXCEPTION 'refusal overtook completed batch %',result; END IF;
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3448-0000-0000-000000000004')<>20
 OR (SELECT count(*) FROM public.poll_tasks WHERE game_id='dddddddd-3448-0000-0000-000000000004' AND status='done')<>2 THEN RAISE EXCEPTION 'completion race lost votes/status'; END IF;
END $$;
COMMIT;
SQL
wait "$POLL344_PID"
echo '344 concurrency OK: two independent voters complete concurrently; completed batch beats later refusal'

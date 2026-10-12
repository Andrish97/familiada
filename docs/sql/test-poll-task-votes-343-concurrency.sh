#!/usr/bin/env bash
set -euo pipefail
POLL343_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.games WHERE id='dddddddd-3438-0000-0000-000000000004';
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3438-0000-0000-000000000001','bbbbbbbb-3438-0000-0000-000000000002');
SQL
 rm -rf "$POLL343_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3438-0000-0000-000000000001','raceowner343@example.net'),('bbbbbbbb-3438-0000-0000-000000000002','racerecipient343@example.net');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3438-0000-0000-000000000001','raceowner343@example.net','raceowner343'),('bbbbbbbb-3438-0000-0000-000000000002','racerecipient343@example.net','racerecipient343') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('dddddddd-3438-0000-0000-000000000004','aaaaaaaa-3438-0000-0000-000000000001','Race343','poll_text','poll_open','race343');
INSERT INTO public.questions(game_id,ord,text) SELECT 'dddddddd-3438-0000-0000-000000000004',n,'Q'||n FROM generate_series(1,10) n;
INSERT INTO public.poll_tasks(id,owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES('eeeeeeee-3438-0000-0000-000000000005','aaaaaaaa-3438-0000-0000-000000000001','bbbbbbbb-3438-0000-0000-000000000002','dddddddd-3438-0000-0000-000000000004','poll_text','race343');
SQL
for POLL343_ACTION in decline stop delete; do
 rm -f "$POLL343_TMP/locked"
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
UPDATE public.games SET status='poll_open' WHERE id='dddddddd-3438-0000-0000-000000000004';
UPDATE public.poll_tasks SET status='pending',declined_at=NULL,cancelled_at=NULL,done_at=NULL WHERE id='eeeeeeee-3438-0000-0000-000000000005';
SQL
 case "$POLL343_ACTION" in
 decline) POLL343_QUERY="SELECT public.poll_task_decline((SELECT token FROM public.poll_tasks WHERE id='eeeeeeee-3438-0000-0000-000000000005'));"; POLL343_ERROR='Task unavailable';;
 stop) POLL343_QUERY="UPDATE public.games SET status='poll_stopped' WHERE id='dddddddd-3438-0000-0000-000000000004';"; POLL343_ERROR='Poll is not open';;
 delete) POLL343_QUERY="DELETE FROM public.games WHERE id='dddddddd-3438-0000-0000-000000000004';"; POLL343_ERROR='Game not found';;
 esac
 psql -qAt -v ON_ERROR_STOP=1 > "$POLL343_TMP/first" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3438-0000-0000-000000000002',true);
$POLL343_QUERY
\! touch '$POLL343_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
 POLL343_PID=$!
 for POLL343_TRY in {1..100}; do [[ -f "$POLL343_TMP/locked" ]] && break; sleep 0.05; done
 [[ -f "$POLL343_TMP/locked" ]]
 psql -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3438-0000-0000-000000000002',true);
DO \$\$ BEGIN
 BEGIN
  PERFORM public.poll_text_submit_batch('dddddddd-3438-0000-0000-000000000004','race343','task:eeeeeeee-3438-0000-0000-000000000005','[]');
  RAISE EXCEPTION 'vote races $POLL343_ACTION';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%$POLL343_ERROR%' THEN RAISE; END IF; END;
END \$\$;
COMMIT;
SQL
 wait "$POLL343_PID"
done
echo '343 concurrency OK: refusal, stop and deletion block queued votes without deadlock'

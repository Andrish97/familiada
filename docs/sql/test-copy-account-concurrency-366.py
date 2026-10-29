"""Disposable database: source snapshot locks and clone retries/lifecycle."""
import json
import os
import shlex
import subprocess
import time

args = shlex.split(os.environ.get('CLONE_TEST_PSQL', 'psql')) + ['-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
actor = 'aaaaaaaa-3661-1000-0000-000000000001'
recipient = 'aaaaaaaa-3661-1000-0000-000000000002'
source = 'bbbbbbbb-3661-1000-0000-000000000001'
packet = json.dumps({'game': {'name': 'Race send366', 'type': 'prepared'}, 'questions': []})
send = f"SELECT set_config('request.jwt.claim.sub','{actor}',true); SELECT public._copy_game_send('{source}','{recipient}','{packet}','ffffffff-3661-1000-0000-000000000001');"
remove = f"SELECT public.delete_user_everything('{recipient}');"


def sql(statement):
    return subprocess.check_output(args + ['-c', statement], text=True).strip()


def hold(statement):
    proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    proc.stdin.write('BEGIN;' + statement + '\n\\echo CLONE_LOCKED\n')
    proc.stdin.flush()
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError('Lock setup failed: ' + proc.stderr.read())
        if line.strip() == 'CLONE_LOCKED':
            return proc


def commit(proc):
    proc.stdin.write('COMMIT;\n')
    proc.stdin.close()
    if proc.wait(timeout=15) != 0:
        raise RuntimeError(proc.stderr.read())


def waiting(statement, application):
    proc = subprocess.Popen(args + ['-c', f"SET application_name='{application}';" + statement], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{application}' AND wait_event_type='Lock'") == '1':
            return proc
        if proc.poll() is not None:
            raise AssertionError('Mutation bypassed snapshot lock: ' + proc.stderr.read())
        time.sleep(.05)
    proc.kill()
    raise AssertionError('Mutation never reached the snapshot lock')


def finish(proc):
    stdout, stderr = proc.communicate(timeout=15)
    if proc.returncode:
        raise AssertionError(stderr)
    return stdout


held = None
mutation = None
try:
    sql(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{actor}','send-race366@example.invalid',false,now(),'{{\"username\":\"sendrace366\"}}');")
    sql(f"INSERT INTO public.games(id,owner_id,name,type,status) VALUES('{source}','{actor}','Race send366','prepared','draft');")
    def seed_recipient():
        sql(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{recipient}','receive-race366@example.invalid',false,now(),'{{\"username\":\"receiverace366\"}}');")
        sql(f"INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status) VALUES('{actor}','{recipient}','{recipient}','active');")
    seed_recipient()
    verified_send = f"SELECT set_config('request.jwt.claim.sub','{actor}',true); DO $$ DECLARE result jsonb; BEGIN result:=public._copy_game_send('{source}','{recipient}','{packet}','ffffffff-3661-1000-0000-000000000001'); IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'send fixture failed: %', result; END IF; IF NOT EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE recipient_id='{recipient}' AND status='pending' AND game_id IS NOT NULL) THEN RAISE EXCEPTION 'pending copy absent'; END IF; END $$;"
    held = hold(verified_send)
    mutation = waiting(remove, 'copy366-delete-after-send')
    commit(held)
    held = None
    finish(mutation)
    mutation = None
    assert sql(f"SELECT count(*) FROM public.games WHERE owner_id='{recipient}'") == '0'
    assert sql(f"SELECT count(*) FROM public.resource_copy_offers WHERE recipient_id='{recipient}'") == '0'
    seed_recipient()
    held = hold(remove)
    retry = subprocess.run(args + ['-c', send], capture_output=True, text=True)
    assert retry.returncode != 0 and '55P03' in retry.stderr, 'Send bypassed deleting recipient lock'
    commit(held)
    held = None
    assert sql(f"SELECT count(*) FROM auth.users WHERE id='{recipient}'") == '0'
    assert sql(f"SELECT count(*) FROM public.resource_copy_offers WHERE recipient_id='{recipient}'") == '0'
    assert sql(f"SELECT count(*) FROM public.games WHERE id='{source}'") == '1'
    print('Copy366 races: account deletion after pending Send, and Send after deletion lock passed')
finally:
    if mutation and mutation.poll() is None:
        mutation.kill()
        mutation.wait(timeout=5)
    if held and held.poll() is None:
        held.stdin.write('ROLLBACK;\n')
        held.stdin.close()
        held.wait(timeout=5)
    sql(f"SELECT public.delete_user_everything('{recipient}'); SELECT public.delete_user_everything('{actor}');")

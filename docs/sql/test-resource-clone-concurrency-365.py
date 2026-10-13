"""Disposable database: source snapshot locks and clone retries/lifecycle."""
import json
import os
import shlex
import subprocess
import time

args = shlex.split(os.environ.get('CLONE_TEST_PSQL', 'psql')) + ['-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
actor = 'aaaaaaaa-3655-1000-0000-000000000001'
source = 'bbbbbbbb-3655-1000-0000-000000000001'
question = 'cccccccc-3655-1000-0000-000000000001'
category = 'dddddddd-3655-1000-0000-000000000001'
tag = 'eeeeeeee-3655-1000-0000-000000000001'
request = 'ffffffff-3655-1000-0000-000000000001'
packet = json.dumps({'base': {'name': 'Race base kopia'}, 'categories': [], 'tags': [], 'questions': [], 'question_tags': [], 'category_tags': []})
read = f"SELECT public._resource_clone_read('{actor}','base','{source}');"
write = f"SELECT public._resource_clone_write('{actor}','{actor}','base','duplicate','{source}','{request}','{packet}',false);"


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
    sql(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{actor}','clone-race365@example.invalid',false,now(),'{{\"username\":\"clonerace365\"}}');")
    sql(f"INSERT INTO public.question_bases(id,owner_id,name) VALUES('{source}','{actor}','Race base');")
    sql(f"INSERT INTO public.qb_categories(id,base_id,name) VALUES('{category}','{source}','Race folder');")
    sql(f"INSERT INTO public.qb_tags(id,base_id,name,color) VALUES('{tag}','{source}','Race tag','red');")
    sql(f"INSERT INTO public.qb_questions(id,base_id,category_id,payload,updated_by) VALUES('{question}','{source}','{category}','{{\"text\":\"Old question\"}}','{actor}');")
    for index, statement in enumerate([
        f"UPDATE public.qb_questions SET payload='{{\"text\":\"Changed\"}}' WHERE id='{question}';",
        f"INSERT INTO public.qb_questions(base_id,payload) VALUES('{source}','{{\"text\":\"Inserted\"}}');",
        f"INSERT INTO public.qb_question_tags(question_id,tag_id) VALUES('{question}','{tag}');",
    ]):
        held = hold(read)
        mutation = waiting(statement, f'clone365-child-{index}')
        commit(held)
        held = None
        finish(mutation)
        mutation = None
    held = hold(write)
    retry = subprocess.run(args + ['-c', write], capture_output=True, text=True)
    assert retry.returncode != 0 and '55P03' in retry.stderr, 'Concurrent retry bypassed owner lock'
    commit(held)
    held = None
    result = json.loads(sql(write))
    assert result['already'] is True, 'Lost-response retry made a second base'
    assert sql(f"SELECT count(*) FROM public.resource_clone_receipts WHERE recipient_id='{actor}'") == '1'
    copied = result['id']
    held = hold(read)
    mutation = waiting(f"DELETE FROM public.question_bases WHERE id='{source}';", 'clone365-source-delete')
    commit(held)
    held = None
    finish(mutation)
    mutation = None
    assert sql(f"SELECT count(*) FROM public.question_bases WHERE id='{copied}'") == '1', 'Source cascade removed owned copy'
    assert json.loads(sql(write))['id'] == copied, 'Retry depended on deleted source'
    # A fresh source permits a second operation; account deletion must wait for
    # the write commit and then remove both resources and private receipts.
    sql(f"INSERT INTO public.question_bases(id,owner_id,name) VALUES('{source}','{actor}','Race second source');")
    second_write = write.replace(request, 'ffffffff-3655-1000-0000-000000000002')
    held = hold(second_write)
    mutation = waiting(f"SELECT public.delete_user_everything('{actor}');", 'clone365-account-delete')
    commit(held)
    held = None
    finish(mutation)
    mutation = None
    assert sql(f"SELECT count(*) FROM auth.users WHERE id='{actor}'") == '0'
    assert sql(f"SELECT count(*) FROM public.question_bases WHERE owner_id='{actor}'") == '0'
    assert sql(f"SELECT count(*) FROM public.resource_clone_receipts WHERE recipient_id='{actor}'") == '0'
    print('Clone365 races: question mutation/insertion, tag insertion, retry, source deletion and account deletion passed')
finally:
    if mutation and mutation.poll() is None:
        mutation.kill()
        mutation.wait(timeout=5)
    if held and held.poll() is None:
        held.stdin.write('ROLLBACK;\n')
        held.stdin.close()
        held.wait(timeout=5)
    sql(f"SELECT public.delete_user_everything('{actor}');")

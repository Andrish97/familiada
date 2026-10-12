"""Isolated PG only: base invitations vs friendship removal, with real lock barriers."""
import os, shlex, subprocess, time
PSQL = shlex.split(os.environ.get('BASE357_PSQL', 'psql')) + ['-X', '-At', '-v', 'ON_ERROR_STOP=1']
UID = 'bbbbbbbb-3543-0000-0000-000000000002'
def run(sql):
    p = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1800:])
    return p.stdout.strip()
def start(sql, keep=False):
    p = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(sql + '\n'); p.stdin.flush()
    if not keep: p.stdin.close(); p.stdin = None
    return p
def barrier(name, condition):
    until = time.monotonic() + 8
    while time.monotonic() < until:
        if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}") == '1': return
        time.sleep(.05)
    raise RuntimeError('Missing barrier: ' + name)
def finish(p):
    out, err = p.communicate(timeout=10)
    if p.returncode: raise RuntimeError(err[-1800:])
    return out

assert run('SELECT current_database()') in ('fam','fam357draft','fam356draft'), 'Isolated DB only'
owner='aaaaaaaa-3572-0000-0000-000000000001'
recipient='bbbbbbbb-3572-0000-0000-000000000002'
friend='dddddddd-3572-0000-0000-000000000004'
base='cccccccc-3572-0000-0000-000000000003'
for action in ('friend-send','manual-send','accept'):
 for mutation in ('cancel','delete','base-delete','recipient-delete'):
  for order in ('operation-first','mutation-first'):
   processes=[]
   names=[f'b357_{os.getpid()}_{action}_{mutation}_{order}_{i}' for i in (1,2)]
   try:
    run(f"INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES('{owner}','owner357race@example.invalid',false,'{{\"username\":\"owner357race\"}}'),('{recipient}','recipient357race@example.invalid',false,'{{\"username\":\"recipient357race\"}}'); INSERT INTO public.friendships(id,requester_id,addressee_id,status) VALUES('{friend}','{owner}','{recipient}','active'); INSERT INTO public.question_bases(id,owner_id,name) VALUES('{base}','{owner}','Race357'); UPDATE public.user_flags SET email_notifications=false WHERE user_id='{recipient}';")
    send=f"SELECT set_config('request.jwt.claim.sub','{owner}',true); SELECT ok FROM public.base_share_to_friend('{base}','{recipient}','viewer')"
    if action=='accept':
     run('BEGIN; '+send+'; COMMIT;')
     task=run(f"SELECT id FROM public.base_share_tasks WHERE base_id='{base}'")
     operation=f"SELECT set_config('request.jwt.claim.sub','{recipient}',true); SELECT public.base_share_accept('{task}')"
    elif action=='manual-send':
     operation=f"SELECT set_config('request.jwt.claim.sub','{owner}',true); SELECT ok FROM public.base_share_by_user('{base}','{recipient}'::uuid,'viewer')"
    else: operation=send
    change=f"SELECT set_config('request.jwt.claim.sub','{owner}',true); SELECT public.friends_remove('{friend}')" if mutation=='cancel' else (f"DELETE FROM public.question_bases WHERE id='{base}'" if mutation=='base-delete' else (f"DELETE FROM auth.users WHERE id='{recipient}'" if mutation=='recipient-delete' else f"DELETE FROM public.friendships WHERE id='{friend}'"))
    if action=='accept' and mutation=='recipient-delete':
     # Deleting the authenticated actor may deny through the common root guard.
     operation=("CREATE FUNCTION pg_temp.accept357(t uuid) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RETURN public.base_share_accept(t); EXCEPTION WHEN raise_exception THEN IF SQLERRM='Not your task' THEN RETURN false; END IF; RAISE; END $$; "
      +operation.replace('public.base_share_accept(', 'pg_temp.accept357('))
    first_sql,second_sql=(operation,change) if order=='operation-first' else (change,operation)
    first=start(f"SET application_name='{names[0]}'; BEGIN; {first_sql};",keep=True);processes.append(first)
    barrier(names[0],"state='idle in transaction'")
    second=start(f"SET application_name='{names[1]}'; BEGIN; {second_sql};",keep=True);processes.append(second)
    barrier(names[1],"(wait_event_type='Lock' OR state='idle in transaction')" if action=='manual-send' and mutation not in ('base-delete','recipient-delete') else "wait_event_type='Lock'")
    first.stdin.write('COMMIT;\n');first.stdin.close();first.stdin=None
    second.stdin.write('COMMIT;\n');second.stdin.close();second.stdin=None
    a,b=finish(first),finish(second)
    op_out=a if order=='operation-first' else b
    expected_ok=(action=='manual-send' and mutation not in ('base-delete','recipient-delete')) or order=='operation-first'
    assert [line for line in op_out.splitlines() if line in ('t','f')]==[('t' if expected_ok else 'f')],op_out
    expected_accepted='1' if action=='accept' and order=='operation-first' and mutation not in ('base-delete','recipient-delete') else '0'
    assert run(f"SELECT count(*) FROM public.question_base_shares WHERE base_id='{base}' AND user_id='{recipient}'")==expected_accepted
    expected_pending='1' if action=='manual-send' and mutation not in ('base-delete','recipient-delete') else '0'
    assert run(f"SELECT count(*) FROM public.base_share_tasks WHERE base_id='{base}' AND status='pending' AND cancelled_at IS NULL")==expected_pending
    print('PASS base357',action,mutation,order,flush=True)
   finally:
    run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('"+"','".join(names)+"');")
    for p in processes:
     if p.poll() is None:
      if p.stdin is not None:p.stdin.close();p.stdin=None
      p.communicate(timeout=10)
    run(f"DELETE FROM auth.users WHERE id IN('{owner}','{recipient}');")

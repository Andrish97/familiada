"""Isolated PG only: metadata changes vs confirmed conversion in both orders."""
import os, shlex, subprocess, time
PSQL = shlex.split(os.environ.get('PROPOSAL355_PSQL', 'psql')) + ['-X', '-At', '-v', 'ON_ERROR_STOP=1']
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

assert run('SELECT current_database()') in ('fam','fam355draft'), 'Isolated DB only'
owner='aaaaaaaa-3552-0000-0000-000000000001'
recipient='bbbbbbbb-3552-0000-0000-000000000002'
source='cccccccc-3552-0000-0000-000000000003'
for action in ('create','accept'):
 for mutation in ('cancel','delete'):
  for order in ('operation-first','mutation-first'):
   processes=[]
   names=[f'proposal355_{os.getpid()}_{action}_{mutation}_{order}_{i}' for i in (1,2)]
   try:
    run(f"INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES('{owner}','owner355race@example.invalid',false,'{{\"username\":\"owner355race\"}}'); INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('{source}','{owner}','recipient355race@example.invalid','active'); INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES('{recipient}','recipient355race@example.invalid',false,'{{\"username\":\"recipient355race\"}}');")
    create=f"SELECT set_config('request.jwt.claim.sub','{recipient}',true); SELECT public.friend_invites_from_subscriptions()"
    if action=='accept':
     run('BEGIN; '+create+'; COMMIT;')
     proposal=run(f"SELECT id FROM public.friendships WHERE requester_id='{owner}' AND addressee_id='{recipient}'")
     operation=f"SELECT set_config('request.jwt.claim.sub','{recipient}',true); SELECT public.friends_accept('{proposal}')"
    else: operation=create
    change=f"SELECT set_config('request.jwt.claim.sub','{owner}',true); SELECT public.polls_hub_subscriber_remove('{source}')" if mutation=='cancel' else f"DELETE FROM public.poll_subscriptions WHERE id='{source}'"
    first_sql,second_sql=(operation,change) if order=='operation-first' else (change,operation)
    first=start(f"SET application_name='{names[0]}'; BEGIN; {first_sql};",keep=True);processes.append(first)
    barrier(names[0],"state='idle in transaction'")
    second=start(f"SET application_name='{names[1]}'; BEGIN; {second_sql}; COMMIT;");processes.append(second)
    barrier(names[1],"wait_event_type='Lock'")
    first.stdin.write('COMMIT;\n');first.stdin.close();first.stdin=None
    a,b=finish(first),finish(second)
    op_out=a if order=='operation-first' else b
    if action=='create':
     assert ('"created": 1' if order=='operation-first' else '"created": 0') in op_out,op_out
    else:
     assert ('"ok": true' if order=='operation-first' else '"ok": false') in op_out,op_out
    expected_active='1' if action=='accept' and order=='operation-first' else '0'
    assert run(f"SELECT count(*) FROM public.friendships WHERE requester_id='{owner}' AND addressee_id='{recipient}' AND status='active'")==expected_active
    assert run(f"SELECT count(*) FROM public.friendships WHERE requester_id='{owner}' AND addressee_id='{recipient}' AND status='pending' AND cancelled_at IS NULL")=='0'
    print('PASS proposal355',action,mutation,order,flush=True)
   finally:
    run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('"+"','".join(names)+"');")
    for p in processes:
     if p.poll() is None:
      if p.stdin is not None:p.stdin.close();p.stdin=None
      p.communicate(timeout=10)
    run(f"DELETE FROM auth.users WHERE id IN('{owner}','{recipient}');")

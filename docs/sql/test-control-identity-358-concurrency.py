"""Isolated PG only: Control grants vs parent and identity changes, with real lock barriers."""
import os, shlex, subprocess, time
PSQL = shlex.split(os.environ.get('CONTROL358_PSQL', 'psql')) + ['-X', '-At', '-v', 'ON_ERROR_STOP=1']
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

assert run('SELECT current_database()') in ('fam','fam358faithful'), 'Isolated DB only'
owner='aaaaaaaa-3583-0000-0000-000000000001'
recipient='bbbbbbbb-3583-0000-0000-000000000002'
friend='dddddddd-3583-0000-0000-000000000003'
game='cccccccc-3583-0000-0000-000000000004'
for action in ('uid','email','friend'):
 for mutation in ('recipient-delete','game-delete','expire','friend-remove','email-change','owner-delete'):
  if mutation=='friend-remove' and action!='friend':continue
  for order in ('operation-first','mutation-first'):
   names=[f'c358_{os.getpid()}_{action}_{mutation}_{order}_{i}' for i in (1,2)]; processes=[]
   try:
    run(f"INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES('{owner}','owner358race@example.invalid',false,'{{\"username\":\"owner358race\"}}'),('{recipient}','recipient358race@example.invalid',false,'{{\"username\":\"recipient358race\"}}'); INSERT INTO public.friendships(id,requester_id,addressee_id,status) VALUES('{friend}','{owner}','{recipient}','active'); INSERT INTO public.games(id,owner_id,name,type,status) VALUES('{game}','{owner}','Control358','prepared','draft'); INSERT INTO public.control_runtime_sessions(game_id,owner_id) VALUES('{game}','{owner}'); UPDATE public.user_flags SET email_notifications=false WHERE user_id='{recipient}';")
    if action=='uid':create=f"public.control_device_share_create('{game}','host','{recipient}',NULL)"
    elif action=='email':create=f"public.control_device_share_create_by_lookup('{game}','host','recipient358race@example.invalid')"
    else:create=f"public.control_device_share_to_friend('{game}','host','{recipient}')"
    operation=f"SELECT set_config('request.jwt.claim.sub','{owner}',true); SELECT {create}->>'ok'"
    changes={'owner-delete':f"DELETE FROM auth.users WHERE id='{owner}'",'recipient-delete':f"DELETE FROM auth.users WHERE id='{recipient}'",'game-delete':f"DELETE FROM public.games WHERE id='{game}'",'expire':f"UPDATE public.control_runtime_sessions SET expires_at=now()-interval '1 second' WHERE game_id='{game}'",'email-change':f"UPDATE auth.users SET email='changed358race@example.invalid' WHERE id='{recipient}'",'friend-remove':f"SELECT set_config('request.jwt.claim.sub','{owner}',true); SELECT public.friends_remove('{friend}')"}
    first_sql,second_sql=(operation,changes[mutation]) if order=='operation-first' else (changes[mutation],operation)
    first=start(f"SET application_name='{names[0]}'; BEGIN; {first_sql};",keep=True);processes.append(first)
    barrier(names[0],"state='idle in transaction'")
    second=start(f"SET application_name='{names[1]}'; BEGIN; {second_sql};",keep=True);processes.append(second)
    barrier(names[1],"wait_event_type='Lock'")
    first.stdin.write('COMMIT;\n');first.stdin.close();first.stdin=None
    second.stdin.write('COMMIT;\n');second.stdin.close();second.stdin=None
    a,b=finish(first),finish(second);op=a if order=='operation-first' else b
    expected_ok=order=='operation-first' or (mutation=='email-change' and action!='email')
    assert [x for x in op.splitlines() if x in ('true','false')]==[('true' if expected_ok else 'false')],op
    expected='1' if (mutation in('expire','friend-remove') and order=='operation-first') or (mutation=='email-change' and expected_ok) else '0'
    assert run(f"SELECT count(*) FROM public.control_device_shares WHERE game_id='{game}'")==expected
    assert run(f"SELECT count(*) FROM public.control_device_shares sh JOIN public.control_runtime_sessions s ON s.id=sh.session_id WHERE sh.game_id='{game}' AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()")==('1' if (mutation=='friend-remove' and order=='operation-first') or (mutation=='email-change' and expected_ok) else '0')
    print('PASS control358',action,mutation,order,flush=True)
   finally:
    run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('"+"','".join(names)+"');")
    for p in processes:
     if p.poll() is None:
      if p.stdin is not None:p.stdin.close();p.stdin=None
      p.communicate(timeout=10)
    run(f"DELETE FROM auth.users WHERE id IN('{owner}','{recipient}');")

"""Isolated PostgreSQL only. Real transaction barriers, no SMTP or test accounts."""
import json, os, shlex, subprocess, time
PSQL = shlex.split(os.environ.get('MAIL_NOTIFICATION_PSQL', 'psql')) + ['-X', '-At', '-v', 'ON_ERROR_STOP=1']
def run(sql):
    p = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1600:])
    return p.stdout.strip()
def start(sql):
    p = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(sql + '\n'); p.stdin.flush(); return p
def finish(p, suffix=''):
    if suffix: p.stdin.write(suffix + '\n'); p.stdin.flush()
    p.stdin.close(); p.stdin = None
    out, err = p.communicate(timeout=15)
    if p.returncode: raise RuntimeError(err[-1600:])
    return out

def barrier(name, condition):
    until = time.monotonic() + 9
    while time.monotonic() < until:
        if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}") == '1': return
        time.sleep(.025)
    raise RuntimeError('Missing barrier: ' + name)

assert run('SELECT current_database()') in ('fam361proof', 'fam'), 'Isolated database only'
owner='aaaaaaaa-3615-0000-0000-000000000001'; peer='bbbbbbbb-3615-0000-0000-000000000002'
game='cccccccc-3615-0000-0000-000000000003'; base='dddddddd-3615-0000-0000-000000000004'; session='eeeeeeee-3615-0000-0000-000000000005'
actor=f"SELECT set_config('request.jwt.claim.sub','{owner}',false);"
address='peerrace361@example.invalid'
actions={'friend':'friend:invite','subscription':'poll:resend','poll':'poll:share','base':'base:share','device':'device:share'}
tables={'friend':'friendships','subscription':'poll_subscriptions','poll':'poll_tasks','base':'base_share_tasks','device':'control_device_shares'}
def seed(kind):
    run(f"""DELETE FROM auth.users WHERE id IN('{owner}','{peer}');
    DELETE FROM public.email_unsub_tokens WHERE email IN('{address}','anonrace361@example.invalid');
    INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
    ('{owner}','ownerrace361@example.invalid',false,now(),'{{"username":"ownerrace361"}}'),
    ('{peer}','{address}',false,now(),'{{"username":"peerrace361"}}');
    INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('{game}','{owner}','Race361','poll_text','poll_open','race361');
    INSERT INTO public.question_bases(id,owner_id,name) VALUES('{base}','{owner}','Race361');
    INSERT INTO public.control_runtime_sessions(id,owner_id,game_id) VALUES('{session}','{owner}','{game}');
    INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('{actions[kind]}','pair',0,false) ON CONFLICT(action_key) DO UPDATE SET cooldown_seconds=0,enforce=false;
    """)
    inserts={
      'friend':f"INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status) VALUES('{owner}','{peer}','{peer}','pending')",
      'subscription':f"INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES('{owner}','anonrace361@example.invalid','pending')",
      'poll':f"INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status) VALUES('{owner}','{peer}','{game}','poll_text','race361','pending')",
      'base':f"INSERT INTO public.base_share_tasks(owner_id,recipient_user_id,base_id,role,status) VALUES('{owner}','{peer}','{base}','viewer','pending')",
      'device':f"INSERT INTO public.control_device_shares(owner_id,recipient_id,session_id,game_id,device_type) VALUES('{owner}','{peer}','{session}','{game}','display')"}
    source=run(inserts[kind]+ ' RETURNING id').splitlines()[0]
    alloc=run(actor+f"SELECT public._mail_allocate_notification_prototype('{kind}','{source}','{actions[kind]}')").splitlines()[-1]
    data=json.loads(run(f"SELECT to_jsonb(a) FROM public.mail_notification_allocations_prototype a WHERE id='{alloc}'"))
    metadata=json.dumps({'notification_reference':data['snapshot']['resource']}).replace("'","''")
    enqueue=f"""INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token,meta)
    VALUES('{owner}','{data['to_email']}','Race361','Fixture','{actions[kind]}','fixture','{kind}','{data['source_token']}','{metadata}');"""
    return source, alloc, enqueue

passed=0
for operation in ['enqueue','delivery']:
 for kind in actions:
  for mutation in ['close','delete','flag']:
   for order in [0,1]:
    source, alloc, enqueue=seed(kind)
    if operation=='delivery':
      run(actor+enqueue)
      queue=run(f"UPDATE public.mail_queue SET status='sending' WHERE notification_allocation_id='{alloc}' RETURNING id").splitlines()[0]
      op=f"SELECT public.mail_queue_delivery_context_prototype('{queue}');"
    else:
      op=f"DO $$ BEGIN {enqueue} EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN('invalid_notification_source','invalid_notification_attempt') THEN RAISE; END IF; END $$;"
    close=f"UPDATE public.{tables[kind]} SET "+ ('revoked_at=now()' if kind=='device' else "status='declined',declined_at=now()")+f" WHERE id='{source}';"
    changes={'close':close,'delete':f"DELETE FROM public.{tables[kind]} WHERE id='{source}';",
      'flag':f"UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email='anonrace361@example.invalid';" if kind=='subscription' else f"UPDATE public.user_flags SET email_notifications=false WHERE user_id='{peer}';"}
    if mutation=='flag' and kind=='subscription':run("SELECT public._ensure_unsub_token('anonrace361@example.invalid')")
    commands=[op,changes[mutation]]; processes=[]
    print(operation,kind,mutation,order,flush=True)
    try:
      first=start(f"SET application_name='notif361_first'; {actor} BEGIN; {commands[order]}");processes.append(first)
      barrier('notif361_first',"state='idle in transaction'")
      second=start(f"SET application_name='notif361_second'; {actor} BEGIN; {commands[1-order]} COMMIT;");processes.append(second)
      barrier('notif361_second',"wait_event_type IN('Lock','Timeout')")
      # A legacy child-first writer must still be able to acquire Auth roots:
      # the competing operation has to release its temporary root locks.
      suffix=(f"SELECT 1 FROM auth.users WHERE id='{peer}' FOR UPDATE; " if order==1 else '')+'COMMIT;'
      finish(first,suffix);finish(second)
      assert run(f"SELECT count(*) FROM public.mail_queue q WHERE q.notification_allocation_id='{alloc}' AND public._mail_notification_queue_live_prototype(q)")=='0'
      if operation=='delivery':
        assert json.loads(run(f"SELECT public.mail_queue_delivery_context_prototype('{queue}')"))['allowed'] is False
      passed+=1
    finally:
      run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('notif361_first','notif361_second')")
      for p in processes:
        if p.poll() is None:p.kill()
      run(f"DELETE FROM auth.users WHERE id IN('{owner}','{peer}')")
print(f'{passed} notification races passed')

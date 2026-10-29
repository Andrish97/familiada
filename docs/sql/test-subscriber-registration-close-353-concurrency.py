"""Isolated only: signup cannot leave an anonymous old-token request authorized."""
import os,shlex,subprocess,time
PSQL=shlex.split(os.environ.get('SOURCE353_PSQL','psql'))+['-X','-At','-v','ON_ERROR_STOP=1']
A='aaaaaaaa-3535-0000-0000-000000000001'; B='bbbbbbbb-3535-0000-0000-000000000002'
S='eeeeeeee-3535-0000-0000-000000000005'; G='dddddddd-3535-0000-0000-000000000004'; T='ffffffff-3535-0000-0000-000000000006'
MAIL='recipient353close@example.invalid'; KEY=353512

def run(sql):
 p=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if p.returncode: raise RuntimeError(p.stderr[-2000:])
 return p.stdout.strip()
def start(sql,keep=False):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(sql+'\n');p.stdin.flush()
 if not keep:p.stdin.close();p.stdin=None
 return p
def barrier(name,condition):
 until=time.monotonic()+8
 while time.monotonic()<until:
  if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}")=='1':return
  time.sleep(.05)
 raise RuntimeError('Missing barrier '+name)
def finish(p):
 out,err=p.communicate(timeout=10)
 if p.returncode:raise RuntimeError(err[-2000:])
 return out
assert run('SELECT current_database()') in ('fam','fam353draft','fam353final'), 'Isolated DB only'
for typ in ('poll_text','poll_points'):
 for action in ('unsubscribe','owner-remove'):
  for order in ('registration-first','close-first'):
   names=[f's353_{os.getpid()}_{typ[-4:]}_{action[:3]}_{order[:3]}_{i}' for i in range(3)];procs=[]
   try:
    run(f"DELETE FROM auth.users WHERE id IN('{A}','{B}'); INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING; INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('{A}','owner353close@example.invalid','{{\"username\":\"owner353close\"}}'); INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('{S}','{A}','{MAIL}','active'); INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('{G}','{A}','Source353 close race','{typ}','poll_open','close353'); INSERT INTO public.questions(game_id,ord,text) SELECT '{G}',n,'Q'||n FROM generate_series(1,10)n; INSERT INTO public.answers(question_id,ord,text) SELECT id,n,'A'||n FROM public.questions CROSS JOIN generate_series(1,4)n WHERE game_id='{G}'; INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id='{G}'; INSERT INTO public.poll_tasks(id,owner_id,recipient_email,game_id,poll_type,share_key_poll,source_subscription_id) VALUES('{T}','{A}','{MAIL}','{G}','{typ}','close353','{S}');")
    vote='poll_text_submit_batch' if typ=='poll_text' else 'poll_points_vote_batch'
    run(f"SELECT public.{vote}('{G}','close353','task:{T}',(SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot')) FROM public.questions q JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id='{G}' AND q.ord=1));")
    assert run(f"SELECT count(*) FROM {'poll_text_entries' if typ=='poll_text' else 'poll_votes'} WHERE game_id='{G}'")=='1'
    register=f"INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES('{B}','{MAIL}',now(),'{{\"username\":\"recipient353close\"}}');"
    close=(f"SELECT set_config('request.jwt.claim.sub','',true); SELECT public.poll_sub_unsubscribe((SELECT token FROM public.poll_subscriptions WHERE id='{S}'));" if action=='unsubscribe' else f"SELECT set_config('request.jwt.claim.sub','{A}',true); SELECT public.polls_hub_subscriber_remove('{S}');")
    if order=='registration-first':
     run(f"CREATE FUNCTION public._source353_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='{S}' AND NEW.registered_user_id IS NOT NULL AND OLD.registered_user_id IS NULL THEN PERFORM pg_advisory_xact_lock({KEY}); END IF; RETURN NEW; END $$; CREATE TRIGGER source353_test_gate BEFORE UPDATE OF registered_user_id ON public.poll_subscriptions FOR EACH ROW EXECUTE FUNCTION public._source353_test_gate();")
     gate=start(f"SET application_name='{names[0]}'; SELECT pg_advisory_lock({KEY});",True);procs.append(gate);barrier(names[0],"state='idle'")
     reg=start(f"SET application_name='{names[1]}'; BEGIN; {register} COMMIT;");procs.append(reg);barrier(names[1],"wait_event='advisory'")
     closer=start(f"SET application_name='{names[2]}'; BEGIN; {close} COMMIT;");procs.append(closer);barrier(names[2],"wait_event='advisory'")
     gate.stdin.write(f'SELECT pg_advisory_unlock({KEY});\n');gate.stdin.close();gate.stdin=None
     finish(gate);finish(reg);out=finish(closer)
    else:
     closer=start(f"SET application_name='{names[1]}'; BEGIN; {close}",True);procs.append(closer);barrier(names[1],"state='idle in transaction'")
     reg=start(f"SET application_name='{names[2]}'; BEGIN; {register} COMMIT;");procs.append(reg);barrier(names[2],"wait_event_type='Lock'")
     closer.stdin.write('COMMIT;\n');closer.stdin.close();closer.stdin=None
     out=finish(closer);finish(reg)
    denied=order=='registration-first' and action=='unsubscribe'
    assert ('"ok": false' if denied else '"ok": true') in out,out
    assert run(f"SELECT registered_user_id FROM public.poll_subscriptions WHERE id='{S}'")==B
    assert run(f"SELECT status FROM public.poll_subscriptions WHERE id='{S}'")==('active' if denied else 'declined' if action=='unsubscribe' else 'cancelled')
    assert run(f"SELECT count(*) FROM {'poll_text_entries' if typ=='poll_text' else 'poll_votes'} WHERE game_id='{G}'")==('1' if denied else '0')
    if action=='owner-remove':assert run(f"SELECT count(*) FROM public.poll_tasks WHERE id='{T}'")=='0'
    else:assert run(f"SELECT recipient_user_id FROM public.poll_tasks WHERE id='{T}'")==B
    print('PASS source353 close',typ,action,order,flush=True)
   finally:
    run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('"+"','".join(names)+"');")
    for p in procs:
     if p.poll() is None:
      if p.stdin is not None:p.stdin.close();p.stdin=None
      p.communicate(timeout=10)
    run(f"DROP TRIGGER IF EXISTS source353_test_gate ON public.poll_subscriptions; DROP FUNCTION IF EXISTS public._source353_test_gate(); DELETE FROM auth.users WHERE id IN('{A}','{B}');")

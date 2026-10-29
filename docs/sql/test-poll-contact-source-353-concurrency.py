import os, shlex, subprocess, time
PSQL=shlex.split(os.environ.get('SOURCE353_PSQL','psql'))+['-X','-v','ON_ERROR_STOP=1','-At']
A='aaaaaaaa-3511-0000-0000-000000000001'; B='bbbbbbbb-3511-0000-0000-000000000002'; G='dddddddd-3511-0000-0000-000000000004'; T='cccccccc-3511-0000-0000-000000000003'
def run(sql):
 p=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if p.returncode: raise RuntimeError(p.stderr[-1800:])
 return p.stdout.strip()
def start(sql):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(sql); p.stdin.close(); p.stdin=None
 return p
def wait_lock(name,event=None):
 end=time.monotonic()+8
 while time.monotonic()<end:
  cond=" AND wait_event='"+event+"'" if event else " AND wait_event_type='Lock' AND wait_event<>'advisory'"
  if run("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='"+name+"'"+cond)=='1': return
  time.sleep(.05)
 raise RuntimeError('barrier not reached: '+name+' '+run("SELECT state||':'||coalesce(wait_event,'') FROM pg_stat_activity WHERE application_name='"+name+"'"))
def finish(p):
 out,err=p.communicate(timeout=10)
 return p.returncode,out,err
assert run('SELECT current_database()') in ('fam','fam353final','fam353draft'), 'isolated databases only'
run('CREATE UNIQUE INDEX identity351_test_email_unique ON auth.users(email)')
try:
 cases=[(m,o,t) for m in ('registration','email','deletion','conversion') for o in ('vote-first','change-first') for t in ('poll_text','poll_points')]
 for ix,(mode,order,typ) in enumerate(cases):
  prefix='identity351_'+str(os.getpid())+'_'+str(ix); gate=351100+ix
  names={k:prefix+'_'+k for k in ('gate','vote','change')}; procs=[]
  try:
   run("DELETE FROM auth.users WHERE id IN('"+A+"','"+B+"');")
   recipient='identity351-recipient@example.invalid'
   setup="INSERT INTO auth.users(id,email) VALUES('"+A+"','identity351-owner@example.invalid'); INSERT INTO public.profiles(id,email,username) VALUES('"+A+"','identity351-owner@example.invalid','identity351_owner') ON CONFLICT(id) DO NOTHING;"
   if mode!='registration':
    guest=mode=='conversion'
    setup+="INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) VALUES('"+B+"','"+recipient+"',now(),"+('true' if guest else 'false')+",'"+('{"is_guest":true}' if guest else '{}')+"'); INSERT INTO public.profiles(id,email,username,is_guest) VALUES('"+B+"','"+recipient+"','identity351_receiver',"+('true' if guest else 'false')+") ON CONFLICT(id) DO NOTHING;"
   source_id='eeeeeeee-3512-0000-0000-000000000005'
   friend_id='ffffffff-3512-0000-0000-000000000006'
   if mode in ('registration','conversion'):
    setup+="INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('"+source_id+"','"+A+"','"+recipient+"','active');"
   else:
    setup+="INSERT INTO public.friendships(id,requester_id,addressee_id,status) VALUES('"+friend_id+"','"+A+"','"+B+"','active');"
   target_col='recipient_email' if mode in ('registration','conversion') else 'recipient_user_id'
   target_value=recipient if target_col=='recipient_email' else B
   setup+="INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('"+G+"','"+A+"','Identity351 race','"+typ+"','poll_open','identity351'); INSERT INTO public.questions(game_id,ord,text) SELECT '"+G+"',n,'Q'||n FROM generate_series(1,10)n; INSERT INTO public.answers(question_id,ord,text) SELECT id,n,'A'||n FROM public.questions CROSS JOIN generate_series(1,4)n WHERE game_id='"+G+"'; INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id='"+G+"'; INSERT INTO public.poll_tasks(id,owner_id,"+target_col+",game_id,poll_type,share_key_poll,source_subscription_id) VALUES('"+T+"','"+A+"','"+target_value+"','"+G+"','"+typ+"','identity351',"+("'"+source_id+"'" if mode in ('registration','conversion') else 'NULL')+");"
   run(setup)
   if mode=='registration': change="INSERT INTO auth.users(id,email) VALUES('"+B+"','"+recipient+"'); INSERT INTO public.profiles(id,email,username) VALUES('"+B+"','"+recipient+"','identity351_receiver') ON CONFLICT(id) DO NOTHING;"
   elif mode=='email': change="UPDATE auth.users SET email='changed351@example.invalid' WHERE id='"+B+"'; UPDATE public.profiles SET email='changed351@example.invalid' WHERE id='"+B+"';"
   elif mode=='deletion': change="DELETE FROM auth.users WHERE id='"+B+"';"
   else: change="SELECT set_config('request.jwt.claim.sub','"+B+"',true); SELECT public.guest_convert_account('"+recipient+"');"
   actor='' if mode=='registration' else B
   count=10 if mode=='deletion' else 1
   items="(SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id='"+G+"' AND q.ord<="+str(count)+")"
   fn='poll_text_submit_batch' if typ=='poll_text' else 'poll_points_vote_batch'
   vote="SELECT public."+fn+"('"+G+"','identity351','task:"+T+"',"+items+");"
   guard="SELECT public._poll_assert_voter('"+G+"','identity351','task:"+T+"');"
   vp="BEGIN; SET LOCAL application_name='"+names['vote']+"'; SELECT set_config('request.jwt.claim.sub','"+actor+"',true); "+guard+" SELECT pg_advisory_lock("+str(gate)+"); "+vote+" COMMIT;"
   cp="BEGIN; SET LOCAL application_name='"+names['change']+"'; "+change+" SELECT pg_advisory_lock("+str(gate)+"); COMMIT;"
   gp=start("SET application_name='"+names['gate']+"'; SELECT pg_advisory_lock("+str(gate)+"); SELECT pg_sleep(25);"); procs.append(gp)
   wait_lock(names['gate'],'PgSleep')
   first=start(vp if order=='vote-first' else cp); procs.append(first)
   wait_lock(names['vote'] if order=='vote-first' else names['change'],'advisory')
   second=start(cp if order=='vote-first' else vp); procs.append(second)
   wait_lock(names['change'] if order=='vote-first' else names['vote'])
   run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name='"+names['gate']+"';")
   f=finish(first); s=finish(second); finish(gp)
   vr=f if order=='vote-first' else s; cr=s if order=='vote-first' else f
   assert cr[0]==0, cr[2]
   denied=order=='change-first' and mode in ('registration','deletion')
   assert (vr[0]!=0)==denied, vr[2]
   if denied: assert 'Not your task' in vr[2], vr[2]
   table='poll_text_entries' if typ=='poll_text' else 'poll_votes'
   expected=0 if denied else count
   assert run("SELECT count(*) FROM public."+table+" WHERE game_id='"+G+"'")==str(expected), 'wrong retained votes'
   if mode=='deletion': assert run("SELECT count(*) FROM public.poll_tasks WHERE id='"+T+"'")=='0'
   else: assert run("SELECT recipient_user_id FROM public.poll_tasks WHERE id='"+T+"'")==B, 'identity not stable'
   if mode in ('registration','conversion'):
    assert run("SELECT source_subscription_id FROM public.poll_tasks WHERE id='"+T+"'")==source_id, 'source lost'
    assert run("SELECT registered_user_id FROM public.poll_subscriptions WHERE id='"+source_id+"'")==B, 'source identity lost'
   elif mode=='email': assert run("SELECT source_friendship_id FROM public.poll_tasks WHERE id='"+T+"'")==friend_id, 'friend source lost'
   print('PASS source353',mode,order,typ,flush=True)
  finally:
   run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('"+names['gate']+"','"+names['vote']+"','"+names['change']+"');")
   for p in procs:
    if p.poll() is None: finish(p)
   run("DELETE FROM auth.users WHERE id IN('"+A+"','"+B+"');")
finally:
 run('DROP INDEX auth.identity351_test_email_unique')

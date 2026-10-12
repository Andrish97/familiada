"""Isolated browser rate, idempotency and parent lifecycle race contracts."""
import json,os,shlex,subprocess,time,uuid
PSQL=shlex.split(os.environ.get('ANON362_PSQL','docker exec -i familiada-pg323 psql -U postgres -d fam362draft'))+['-X','-At','-v','ON_ERROR_STOP=1']
def run(sql):
 p=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr[-1600:])
 return p.stdout.strip()
def start(name,sql):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(f"SET application_name='{name}';SET statement_timeout='12s';"+sql+'\n');p.stdin.flush();return p
def barrier(name,condition):
 deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}")=='1':return
  time.sleep(.025)
 raise RuntimeError('Missing barrier '+name)
def finish(p,suffix=''):
 if suffix:p.stdin.write(suffix+'\n');p.stdin.flush()
 p.stdin.close();p.stdin=None
 out,err=p.communicate(timeout=15)
 if p.returncode:raise RuntimeError(err[-1600:])
 return [json.loads(line) for line in out.splitlines() if line.startswith('{')]
assert run('SELECT current_database()')=='fam362draft','isolated database only'
owner=str(uuid.uuid4());processes=[]
run(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{owner}','race362@example.invalid',false,now(),'{{\"username\":\"race362\"}}')")
try:
 for index,case in enumerate(['same-browser','same-attempt','different-browser','submit-then-close','close-then-submit','submit-then-delete','delete-then-submit','legacy-child-first']):
  game=str(uuid.uuid4());browser=str(uuid.uuid4());voter=str(uuid.uuid4())
  run(f"""INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('{game}','{owner}','Race362','poll_text','draft','race362');
   INSERT INTO public.questions(game_id,ord,text) SELECT '{game}',n,'Question '||n FROM generate_series(1,10) n;
   SELECT set_config('request.jwt.claim.sub','{owner}',false);SELECT public.poll_open('{game}','race362');""")
  key=run(f"SELECT share_key_poll FROM public.games WHERE id='{game}'")
  items=run(f"SELECT jsonb_agg(jsonb_build_object('question_id',id,'answer_raw','Cat','answer_norm','cat') ORDER BY ord) FROM public.questions WHERE game_id='{game}'")
  call=lambda b,v:f"SELECT public.poll_anonymous_submit_prototype('{game}','{key}','{b}','{v}','{items}'::jsonb);"
  name=f'anon362_{index}'
  if case in ['same-browser','same-attempt','different-browser','submit-then-close','submit-then-delete']:
   first=start(name+'_first','BEGIN;'+call(browser,voter));processes.append(first)
   barrier(name+'_first',"state='idle in transaction'")
   if case.startswith('submit-then-'):
    sql=f"UPDATE public.games SET status='poll_stopped' WHERE id='{game}';" if case.endswith('close') else f"DELETE FROM public.games WHERE id='{game}';"
    second=start(name+'_second',sql);processes.append(second);barrier(name+'_second',"wait_event_type='Lock'")
   else:
    second_browser=str(uuid.uuid4()) if case=='different-browser' else browser
    second_voter=voter if case=='same-attempt' else str(uuid.uuid4())
    second=start(name+'_second',call(second_browser,second_voter));processes.append(second)
    if case=='different-browser':barrier(name+'_second',"state='idle'")
    else:barrier(name+'_second',"wait_event_type='Lock'")
   one=finish(first,'COMMIT;');two=finish(second)
   assert one[-1]['ok'],case
   if case=='same-browser':assert two[-1].get('error')=='cooldown',two
   if case=='same-attempt':assert two[-1].get('already_submitted') is True,two
   if case=='different-browser':assert two[-1]['ok'],two
  else:
   if case=='legacy-child-first':sql=f"BEGIN;SELECT 1 FROM public.games WHERE id='{game}' FOR UPDATE;"
   elif case=='close-then-submit':sql=f"BEGIN;UPDATE public.games SET status='poll_stopped' WHERE id='{game}';"
   else:sql=f"BEGIN;DELETE FROM public.games WHERE id='{game}';"
   first=start(name+'_first',sql);processes.append(first);barrier(name+'_first',"state='idle in transaction'")
   second=start(name+'_second',call(browser,voter));processes.append(second);barrier(name+'_second',"wait_event='PgSleep'")
   suffix=f"UPDATE auth.users SET updated_at=now() WHERE id='{owner}';COMMIT;" if case=='legacy-child-first' else 'COMMIT;'
   finish(first,suffix);two=finish(second)
   if case=='close-then-submit':assert two[-1].get('error')=='closed',two
   elif case=='delete-then-submit':assert two[-1].get('error')=='gone',two
   else:assert two[-1]['ok'],two
  expected=20 if case=='different-browser' else 0 if case in ['close-then-submit','submit-then-delete','delete-then-submit'] else 10
  assert run(f"SELECT count(*) FROM public.poll_text_entries WHERE game_id='{game}'")==str(expected),case
  if 'close' in case or 'delete' in case:assert run(f"SELECT count(*) FROM public.poll_anonymous_limits_prototype WHERE game_id='{game}'")=='0',case
  run(f"DELETE FROM public.games WHERE id='{game}'")
  print(case+' passed')
finally:
 run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'anon362_%'")
 for p in processes:
  if p.poll() is None:p.kill()
 run(f"DELETE FROM auth.users WHERE id='{owner}'")

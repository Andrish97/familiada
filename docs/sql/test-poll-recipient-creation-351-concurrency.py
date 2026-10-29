import os, shlex, subprocess, time
PSQL=shlex.split(os.environ.get('IDENTITY351_PSQL','psql'))+['-X','-v','ON_ERROR_STOP=1','-At']
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

assert run('SELECT current_database()') in ('fam','fam351draft'), 'isolated databases only'
def waiting(name,event=None):
 end=time.monotonic()+8
 while time.monotonic()<end:
  cond=" AND wait_event='"+event+"'" if event else " AND wait_event_type='Lock'"
  if run("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='"+name+"'"+cond)=='1': return
  time.sleep(.05)
 raise RuntimeError('creation barrier missing: '+name+' '+run("SELECT state||':'||coalesce(wait_event,'') FROM pg_stat_activity WHERE application_name='"+name+"'"))
for ix,(order,typ) in enumerate((o,t) for o in ('creation-first','registration-first') for t in ('poll_text','poll_points')):
 names={k:'creator351_'+str(os.getpid())+'_'+str(ix)+'_'+k for k in ('gate','create','register')}; procs=[]; gate=351200+ix
 try:
  run("DELETE FROM auth.users WHERE id IN('"+A+"','"+B+"'); INSERT INTO auth.users(id,email) VALUES('"+A+"','owner351@example.invalid'); INSERT INTO public.profiles(id,email,username) VALUES('"+A+"','owner351@example.invalid','owner351') ON CONFLICT(id) DO NOTHING; INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('"+G+"','"+A+"','Creation351','"+typ+"','poll_open','creation351');")
  lock_game="BEGIN; SELECT 1 FROM public.games WHERE id='"+G+"' FOR UPDATE; " if order=='creation-first' else ''
  gp=start("SET application_name='"+names['gate']+"'; "+lock_game+"SELECT pg_advisory_lock("+str(gate)+"); SELECT pg_sleep(25);");procs.append(gp);waiting(names['gate'],'PgSleep')
  creation="BEGIN; SET LOCAL application_name='"+names['create']+"'; INSERT INTO public.poll_tasks(id,owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES('"+T+"','"+A+"','receiver351@example.invalid','"+G+"','"+typ+"','creation351'); COMMIT;"
  registration="BEGIN; SET LOCAL application_name='"+names['register']+"'; INSERT INTO auth.users(id,email) VALUES('"+B+"','receiver351@example.invalid'); INSERT INTO public.profiles(id,email,username) VALUES('"+B+"','receiver351@example.invalid','receiver351') ON CONFLICT(id) DO NOTHING; "+("SELECT pg_advisory_lock("+str(gate)+"); " if order=='registration-first' else '')+"COMMIT;"
  first=start(creation if order=='creation-first' else registration);procs.append(first);waiting(names['create'] if order=='creation-first' else names['register'])
  second=start(registration if order=='creation-first' else creation);procs.append(second);waiting(names['register'] if order=='creation-first' else names['create'],'advisory')
  run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name='"+names['gate']+"';")
  for p in (first,second):
   rc,out,err=finish(p);assert rc==0,err
  finish(gp)
  assert run("SELECT recipient_user_id FROM public.poll_tasks WHERE id='"+T+"'")==B, 'creation lost registered identity'
  print('PASS creator351',order,typ,flush=True)
 finally:
  run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('"+names['gate']+"','"+names['create']+"','"+names['register']+"');")
  for p in procs:
   if p.poll() is None: finish(p)
  run("DELETE FROM auth.users WHERE id IN('"+A+"','"+B+"');")

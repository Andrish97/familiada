"""Apply the voter gate atomically while a legacy Game-first writer is active."""
import os,pathlib,shlex,subprocess,time
PSQL=shlex.split(os.environ.get('ANON362_DDL_PSQL','psql'))+['-X','-At','-v','ON_ERROR_STOP=1']
def run(sql):
 p=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr[-1600:])
 return p.stdout.strip()
def start(name,sql):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(f"SET application_name='{name}';SET statement_timeout='15s';"+sql+'\n');p.stdin.flush();return p
def barrier(name,condition):
 until=time.monotonic()+8
 while time.monotonic()<until:
  if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}")=='1':return
  time.sleep(.025)
 raise RuntimeError('missing barrier '+name)
def finish(p,suffix=''):
 if suffix:p.stdin.write(suffix+'\n');p.stdin.flush()
 p.stdin.close();p.stdin=None
 out,err=p.communicate(timeout=20)
 if p.returncode:raise RuntimeError(err[-1600:])
 return out
assert run('SELECT current_database()')=='fam362final','isolated database only'
owner='aaaaaaaa-3626-0000-0000-000000000001';game='cccccccc-3626-0000-0000-000000000001';processes=[]
run(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{owner}','owner362ddl@example.invalid',false,now(),'{{\"username\":\"owner362ddl\"}}');INSERT INTO public.games(id,owner_id,name,type,status) VALUES('{game}','{owner}','DDL362','poll_text','draft');")
try:
 holder=start('anon362_old_writer',f"BEGIN;SELECT 1 FROM public.games WHERE id='{game}' FOR UPDATE;");processes.append(holder)
 barrier('anon362_old_writer',"state='idle in transaction'")
 migration=pathlib.Path(os.environ.get('ANON362_FINAL_SQL','docs/sql/draft-poll-anonymous-final-362.sql')).read_text()
 ddl=start('anon362_ddl',migration);processes.append(ddl)
 barrier('anon362_ddl',"wait_event='PgSleep'")
 finish(holder,f"UPDATE auth.users SET updated_at=now() WHERE id='{owner}';COMMIT;")
 finish(ddl)
 assert run("SELECT to_regprocedure('public.poll_anonymous_submit(uuid,text,uuid,uuid,jsonb)') IS NOT NULL")=='t'
 assert run("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%_prototype'")=='0'
 print('final362 atomic migration, legacy Game-first writer and final API passed')
finally:
 run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('anon362_old_writer','anon362_ddl')")
 for p in processes:
  if p.poll() is None:p.kill()
 run(f"DELETE FROM auth.users WHERE id='{owner}'")

"""Apply the complete forward migration while old Game-first code is active."""
import os, pathlib, shlex, subprocess, time
PSQL=shlex.split(os.environ.get('MAIL_CENTER_DDL_PSQL','psql'))+['-X','-At','-v','ON_ERROR_STOP=1']
def run(sql):
 p=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr[-1600:])
 return p.stdout.strip()
def start(sql):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(sql+'\n');p.stdin.flush();return p

def barrier(name,condition):
 deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}")=='1':return
  time.sleep(.025)
 raise RuntimeError('missing '+name+' barrier')
def finish(p,suffix=''):
 if suffix:p.stdin.write(suffix+'\n');p.stdin.flush()
 p.stdin.close();p.stdin=None
 out,err=p.communicate(timeout=20)
 if p.returncode:raise RuntimeError(err[-2000:])
 return out
assert run('SELECT current_database()') in ('fam360ddl','fam_final'),'isolated database only'
owner='aaaaaaaa-3606-0000-0000-000000000001';peer='bbbbbbbb-3606-0000-0000-000000000002'
game='cccccccc-3606-0000-0000-000000000003';session='dddddddd-3606-0000-0000-000000000004'
run(f"""INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('{owner}','owner360ddl@example.invalid',false,now(),'{{"username":"owner360ddl"}}'),
 ('{peer}','peer360ddl@example.invalid',false,now(),'{{"username":"peer360ddl"}}');
 INSERT INTO public.games(id,owner_id,name,type,status) VALUES('{game}','{owner}','DDL360','prepared','draft');
 INSERT INTO public.control_runtime_sessions(id,game_id,owner_id) VALUES('{session}','{game}','{owner}');""")
processes=[]
try:
 holder=start(f"SET application_name='mail360_old_writer';BEGIN;SET LOCAL statement_timeout='15s';SELECT 1 FROM public.games WHERE id='{game}' FOR UPDATE;");processes.append(holder)
 barrier('mail360_old_writer',"state='idle in transaction'")
 migration=pathlib.Path(os.environ.get('MAIL_CENTER_FINAL_SQL','docs/sql/draft-mail-center-final-360.sql')).read_text()
 ddl=start("SET application_name='mail360_ddl';SET statement_timeout='15s';"+migration);processes.append(ddl)
 barrier('mail360_ddl',"wait_event='PgSleep'")
 finish(holder,f"INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_id,device_type) VALUES('{session}','{game}','{owner}','{peer}','host');COMMIT;")
 finish(ddl)
 assert run("SELECT to_regprocedure('public.mail_center_request_link(text,text,text,text,text)') IS NOT NULL")== 't'
 assert run("SELECT to_regprocedure('public.mail_queue_delivery_context(uuid)') IS NOT NULL")== 't'
 assert run(f"SELECT count(*) FROM public.control_device_shares WHERE game_id='{game}'")== '1'
 assert run("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%_prototype'")== '0'
 print('complete migration360, legacy Game-first insert, preserved grant and final API names passed')
finally:
 run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('mail360_old_writer','mail360_ddl')")
 for p in processes:
  if p.poll() is None:p.kill()
 run(f"DELETE FROM auth.users WHERE id IN('{owner}','{peer}')")

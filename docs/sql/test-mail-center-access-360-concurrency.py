"""Local PostgreSQL only, two transactions coordinated by real lock barriers."""
import subprocess, time, json, os, shlex
PSQL=shlex.split(os.environ.get('MAIL_CENTER_PSQL','psql'))+['-X','-At','-v','ON_ERROR_STOP=1']
def run(sql):
 p=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if p.returncode: raise RuntimeError(p.stderr[-1800:])
 return p.stdout.strip()
def start(sql):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(sql+'\n');p.stdin.flush();return p
def finish(p, commit=False):
 if commit:p.stdin.write('COMMIT;\n');p.stdin.flush()
 p.stdin.close();p.stdin=None
 out,err=p.communicate(timeout=12)
 if p.returncode:raise RuntimeError(err[-1800:])
 return out

def barrier(name,condition):
 until=time.monotonic()+8
 while time.monotonic()<until:
  if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}")=='1':return
  time.sleep(.03)
 raise RuntimeError('missing '+name+' barrier')

assert run('SELECT current_database()') in ('fam360draft','fam'), 'Isolated database only'
address='race360@example.invalid'; uid='aaaaaaaa-3609-0000-0000-000000000001'; passed=0
for kind in ['single-use','registration','revoke','root-delete']:
 for order in [0,1]:
  for repeat in range(3):
   run(f"DELETE FROM auth.users WHERE id='{uid}'; DELETE FROM public.email_unsub_tokens WHERE email='{address}'")
   issued=json.loads(run(f"SELECT public.mail_center_issue_link_prototype('{address}','verification')")); token=issued['token']; link=issued['link_id']
   op=f"SELECT public.mail_center_exchange_link_prototype('{token}')"
   mutations={'single-use':op,'registration':f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{uid}','{address}',false,now(),'{{\"username\":\"race360\"}}')",'revoke':f"UPDATE public.mail_center_links_prototype SET revoked_at=clock_timestamp() WHERE id='{link}'",'root-delete':f"DELETE FROM public.email_unsub_tokens WHERE email='{address}'"}
   print(kind,order,repeat,flush=True); commands=[op,mutations[kind]]; names=['cap360_first','cap360_second']; processes=[]
   try:
    first=start(f"SET application_name='{names[0]}'; BEGIN; {commands[order]};");processes.append(first)
    barrier(names[0],"state='idle in transaction'")
    second=start(f"SET application_name='{names[1]}'; BEGIN; {commands[1-order]}; COMMIT;");processes.append(second)
    barrier(names[1],"wait_event_type IN('Lock','Timeout')")
    a=finish(first,True); b=finish(second)
    results=[json.loads(line) for line in (a+'\n'+b).splitlines() if line.startswith('{')]
    if kind=='single-use':
     assert sum(x.get('ok') is True for x in results)==1, results
    else:
     assert json.loads(run(op))['ok'] is False
     for result in results:
      if result.get('ok'):
       assert json.loads(run(f"SELECT public._mail_center_scope_prototype('{result['session_secret']}')"))['ok'] is False
    passed+=1
   finally:
    run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN('cap360_first','cap360_second')")
    for p in processes:
     if p.poll() is None:p.kill()
    run(f"DELETE FROM auth.users WHERE id='{uid}'; DELETE FROM public.email_unsub_tokens WHERE email='{address}'")
print(f'{passed} capability races passed')

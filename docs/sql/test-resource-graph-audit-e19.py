"""Only isolated fixtures; prove the aggregate read-only audit catches bad clocks and column grants."""
import pathlib,subprocess,json
PSQL=['docker','exec','-i','familiada-pg323','psql','-U','postgres','-d','fam362final','-X','-At','-v','ON_ERROR_STOP=1']
def run(sql):
 result=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if result.returncode:raise RuntimeError(result.stderr[-1500:])
 return result.stdout.strip()
assert run('SELECT current_database()')=='fam362final','isolated database only'
audit=pathlib.Path('docs/sql/audit-resource-graph-e19.sql').read_text()
def check(field=None):
 result=subprocess.run(PSQL,input=audit,text=True,capture_output=True)
 line=next(line for line in result.stderr.splitlines() if 'E19 graph counts:' in line)
 counts=json.loads(line.split('E19 graph counts: ',1)[1])
 assert (result.returncode!=0)==bool(field),result.stderr
 if field:assert counts[field]==1,counts
 else:assert sum(counts.values())==0,counts
owner='aaaaaaaa-363a-0000-0000-000000000001';game='cccccccc-363a-0000-0000-000000000001'
try:
 check()
 run(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{owner}','gaudit@example.invalid',false,now(),'{{\"username\":\"gaudit\"}}');INSERT INTO public.games(id,owner_id,name,type,status) VALUES('{game}','{owner}','Graph audit','prepared','draft');")
 run(f"INSERT INTO public.poll_anonymous_limits(game_id,key_hash,browser_hash) VALUES('{game}','bad-key','bad-browser')")
 check('anonymous_clock_parent')
 assert run(f"SELECT count(*) FROM public.poll_anonymous_limits WHERE game_id='{game}'")=='1','read-only audit changed its fixture'
 run(f"DELETE FROM public.poll_anonymous_limits WHERE game_id='{game}';GRANT SELECT(game_id) ON public.poll_anonymous_limits TO anon")
 check('private_graph_table_permissions')
 run('REVOKE SELECT(game_id) ON public.poll_anonymous_limits FROM anon')
 check()
 print('read-only graph audit: clean schema, invalid clock, column-only privilege and no mutation passed')
finally:
 run(f"REVOKE SELECT(game_id) ON public.poll_anonymous_limits FROM anon;DELETE FROM auth.users WHERE id='{owner}'")

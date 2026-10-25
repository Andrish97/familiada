#!/usr/bin/env python3
"""Isolated PG16 + pgvector test. Existing container, no network or production access.
Usage: python3 tests/sql/market-uniqueness-local.py --container familiada-uniqueness-pg
"""
import argparse, pathlib, re, subprocess, uuid, json
root=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--container',required=True);parser.add_argument('--public-games');parser.add_argument('--vectors');parser.add_argument('--reports-output');parser.add_argument('--expect-all-similar',action='store_true');args=parser.parse_args()
database='market_uniqueness_'+uuid.uuid4().hex[:12]
base=['docker','--host=unix:///var/run/docker.sock','exec','-i',args.container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At']
def sql(text, db=database):
 result=subprocess.run(base+['-d',db],input=text,text=True,capture_output=True)
 if result.returncode:raise RuntimeError(result.stderr)
 return result.stdout
schema=(root/'supabase/schema.sql').read_text()
def original(name, renamed=None):
 candidate=renamed if renamed and re.search(r'CREATE FUNCTION "public"\."'+renamed+r'"',schema) else name
 found=re.search(r'CREATE FUNCTION "public"\."'+candidate+r'".*?\n\$\$;',schema,re.S)
 if not found:raise RuntimeError('missing source '+candidate)
 return found.group(0).replace('"public"."'+candidate+'"','"public"."'+name+'"',1)
try:
 sql('CREATE DATABASE '+database,'postgres')
 roles="\n".join("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+r+"') THEN CREATE ROLE "+r+"; END IF; END $$;" for r in ['anon','authenticated','service_role','agent_reader'])
 fixture=roles+'''
CREATE EXTENSION vector; CREATE EXTENSION pg_trgm; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('audit.uid',true),'')::uuid $$;
CREATE TYPE public.market_game_status AS ENUM ('pending','published','withdrawn','rejected');
CREATE TABLE public.games(id uuid PRIMARY KEY,owner_id uuid,source_market_id uuid,is_demo boolean,type text,status text,name text);
CREATE TABLE public.questions(id uuid PRIMARY KEY,game_id uuid,text text,ord integer);
CREATE TABLE public.answers(question_id uuid,text text,fixed_points integer,ord integer);
CREATE TABLE public.app_config(key text,value text);
CREATE TABLE public.market_games(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,author_user_id uuid,source_game_id uuid,title text,description text,lang text,status public.market_game_status,payload jsonb,questions_text text,questions_fingerprint text,origin text DEFAULT 'community',slug text,moderation_note text);
GRANT INSERT ON public.market_games TO authenticated;
CREATE FUNCTION public.game_rules_compute(uuid,text,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"play":{"ok":true}}'::jsonb $$;
CREATE FUNCTION public.unique_market_slug(text,uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'fixture-'||$2::text $$;
'''
 for name,old in [('market_games_build_questions_text',None),('market_games_compute_fingerprint',None),('market_games_set_questions_fields',None),('market_submit_game','_market_submit_game_before_content_guard'),('market_admin_review','_market_admin_review_before_content_guard')]:fixture+=original(name,old)+'\n'
 fixture+='CREATE TRIGGER trg_market_games_questions_fields BEFORE INSERT OR UPDATE OF payload ON public.market_games FOR EACH ROW EXECUTE FUNCTION public.market_games_set_questions_fields();'
 sql(fixture)
 for filename in ['supabase/migrations/2026-10-25_487_market_uniqueness_model.sql','tests/sql/market-uniqueness-487.sql','supabase/migrations/2026-10-25_488_market_exact_copy_guard.sql','tests/sql/market-uniqueness-488.sql']:
  sql((root/filename).read_text());print('PASS '+filename,flush=True)
 # Two different sources/authors compete for exactly the same content key.
 actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';ids=['77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888']
 sql("INSERT INTO games SELECT x::uuid,'"+actor+"',null,false,'prepared','ready','Race' FROM unnest(ARRAY['"+ids[0]+"','"+ids[1]+"']) x; INSERT INTO questions SELECT gen_random_uuid(),g.id,'Race question '||n,n FROM games g CROSS JOIN generate_series(1,10) n; INSERT INTO answers SELECT q.id,'Answer '||n,10,n FROM questions q CROSS JOIN generate_series(1,3) n;")
 a=subprocess.Popen(base+['-d',database],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 a.stdin.write("BEGIN; SET LOCAL audit.uid='"+actor+"'; SELECT ok FROM market_submit_game('"+ids[0]+"','First','Description','pl',null); \\echo FIRST_INSERT_DONE\nSELECT pg_sleep(1); COMMIT;\n");a.stdin.close()
 while True:
  line=a.stdout.readline()
  if 'FIRST_INSERT_DONE' in line:break
  if not line:raise RuntimeError('first transaction stopped: '+a.stderr.read())
 second=sql("SET audit.uid='"+actor+"'; SELECT jsonb_build_object('ok',ok,'err',err) FROM market_submit_game('"+ids[1]+"','Second','Description','uk',null);")
 a.wait(timeout=15)
 if a.returncode:raise RuntimeError(a.stderr.read())
 response=json.loads(next(line for line in second.splitlines() if line.startswith('{')))
 assert response=={'ok':False,'err':'duplicate_content'},response
 assert sql('SELECT count(*) FROM market_games').strip()=='1'
 print('PASS concurrent submissions: exactly one accepted, other duplicate_content',flush=True)
 if args.public_games:
  import numpy as np
  games=json.loads(pathlib.Path(args.public_games).read_text());vectors=np.load(args.vectors)
  delimiter='$AUDIT'+uuid.uuid4().hex+'$'
  data=json.dumps(games,ensure_ascii=False,allow_nan=False)
  sql('DELETE FROM public.market_games; INSERT INTO public.market_games(id,title,lang,status,payload) SELECT (g->>'+"'id'"+')::uuid,g->>'+"'title'"+',g->>'+"'lang'"+",'published',g->'payload' FROM jsonb_array_elements("+delimiter+data+delimiter+'::jsonb) g;')
  offset=0;statements=[]
  model='paraphrase-multilingual-minilm-l12-v2-qa-v1'
  for game in games:
   batch=[{'question_pos':i+1,'embedding':vectors[offset+i].tolist()} for i in range(len(game['payload']['questions']))]
   offset+=len(batch);payload=json.dumps(batch,allow_nan=False)
   statements.append("SELECT public.market_store_question_embeddings('"+game['id']+"',public.market_content_revision(payload),'"+model+"',"+delimiter+payload+delimiter+"::jsonb) FROM public.market_games WHERE id='"+game['id']+"';")
  assert offset==len(vectors)
  stored=sql('\n'.join(statements));assert all(json.loads(x)['ok'] for x in stored.splitlines())
  report=sql("WITH reports AS MATERIALIZED(SELECT public.market_uniqueness_report(id) r FROM public.market_games) SELECT jsonb_build_object('games',count(*),'complete',count(*) FILTER(WHERE (r->'semantic'->>'complete')::boolean),'with_matches',count(*) FILTER(WHERE jsonb_array_length(r->'matches')>0),'max_matches',max(jsonb_array_length(r->'matches'))) FROM reports;")
  summary=json.loads(report.strip());assert summary['games']==len(games) and summary['complete']==len(games)
  if args.expect_all_similar:assert summary['with_matches']==len(games),summary
  print('PASS public corpus: '+json.dumps(summary),flush=True)
  if args.reports_output:
   reports=sql("SELECT public.market_uniqueness_report(id) FROM public.market_games ORDER BY id;")
   pathlib.Path(args.reports_output).write_text(json.dumps([json.loads(row) for row in reports.splitlines()],ensure_ascii=False))

finally:
 sql('DROP DATABASE IF EXISTS '+database+' WITH (FORCE)','postgres')

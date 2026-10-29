"""Test rzeczywistej funkcji PL/pgSQL; pg_net/Vault to lokalne atrapy bez sieci."""
import pathlib
import subprocess
import uuid

root = pathlib.Path(__file__).resolve().parents[2]
database = 'market_cron_' + uuid.uuid4().hex[:12]
base = ['docker','--host=unix:///var/run/docker.sock','exec','-i','familijna-uniqueness-pg','psql','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1']

def sql(query, db=database):
    result = subprocess.run(base + ['-d',db], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout

try:
    sql('create database '+database, 'postgres')
    for role in ['anon','authenticated','service_role']:
        sql("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+role+"') THEN CREATE ROLE "+role+"; END IF; END $$")
    sql("""
      create schema vault; create schema net;
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values ('project_url','http://fixture.invalid'),('anon_key','fixture-anon'),('generate_game_secret','fixture-internal');
      create table net.captured(url text,headers jsonb,body jsonb,timeout integer);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$
      begin insert into net.captured values(url,headers,body,timeout_milliseconds);return 1;end $$;
      create function public.invoke_embed_missing_market_games(p_lang text default 'all',p_limit integer default 25) returns void language sql as $$ select $$;
      revoke all on function public.invoke_embed_missing_market_games(text,integer) from public,anon,authenticated;
      grant execute on function public.invoke_embed_missing_market_games(text,integer) to service_role;
    """)
    sql((root/'supabase/migrations/2026-10-25_489_market_embedding_cron_timeout.sql').read_text())
    sql("select public.invoke_embed_missing_market_games('',999)")
    result = sql("""select timeout=90000 and url='http://fixture.invalid/functions/v1/generate-game'
      and headers->>'X-Internal-Secret'='fixture-internal' and headers->>'apikey'='fixture-anon'
      and body->>'action'='embed-missing' and body->>'lang'='all' and body->>'limit'='50' from net.captured""").strip()
    assert result == 't', 'timeout, auth headers or request body differs'
    sql("truncate net.captured; select public.invoke_embed_missing_market_games('uk',0)")
    assert sql("select body->>'lang'='uk' and body->>'limit'='1' from net.captured").strip() == 't'
    sql("truncate net.captured; delete from vault.decrypted_secrets where name='generate_game_secret'; select public.invoke_embed_missing_market_games()")
    assert sql('select count(*) from net.captured').strip() == '0', 'no request without internal secret'
    assert sql("select not has_function_privilege('anon','public.invoke_embed_missing_market_games(text,integer)','EXECUTE') and not has_function_privilege('authenticated','public.invoke_embed_missing_market_games(text,integer)','EXECUTE') and has_function_privilege('service_role','public.invoke_embed_missing_market_games(text,integer)','EXECUTE')").strip() == 't', 'existing permissions changed'
    print('PASS cron timeout 90 s, headers, limits, missing secret and preserved grants')
finally:
    sql('drop database if exists '+database+' with (force)', 'postgres')

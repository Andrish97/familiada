\set ON_ERROR_STOP on
-- Runs after the statistics fixture, only inside its disposable CI database.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion: %',message; END IF; END $$;
ALTER TABLE games ADD COLUMN share_key_host text, ADD COLUMN settings jsonb DEFAULT '{}';
CREATE TABLE user_logos(id uuid PRIMARY KEY,user_id uuid,name text,type text,payload jsonb);
CREATE TABLE edit_locks(resource_type text,resource_id uuid,heartbeat_at timestamptz);
\ir ../../supabase/migrations/2026-10-06_302_host2_logo_lock.sql
UPDATE games SET share_key_host='host-key',settings='{"display":{"logoId":"00000000-0000-0000-0000-000000000003"}}';
INSERT INTO user_logos VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Logo','GLYPH_30x10','{"layers":[]}');
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(host2_logo_get_public('00000000-0000-0000-0000-000000000001','host-key')#>>'{logo,name}'='Logo','host sees selected logo');
SELECT pg_temp.assert_true(host2_logo_get_public('00000000-0000-0000-0000-000000000001','wrong-key') IS NULL,'wrong host key cannot read logo or lock');
RESET ROLE;
INSERT INTO edit_locks VALUES('logo','00000000-0000-0000-0000-000000000003',now());
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((host2_logo_get_public('00000000-0000-0000-0000-000000000001','host-key')->>'busy')::boolean,'active editing lock exposed only as busy');
SELECT pg_temp.assert_true(host2_logo_get_public('00000000-0000-0000-0000-000000000001','host-key')->'logo'='null','edited payload withheld');
RESET ROLE;
UPDATE edit_locks SET heartbeat_at=now()-interval '26 seconds';
SELECT pg_temp.assert_true(host2_logo_get_public('00000000-0000-0000-0000-000000000001','host-key')#>>'{logo,name}'='Logo','expired lock releases selected logo');
UPDATE user_logos SET user_id='00000000-0000-0000-0000-000000000009';
SELECT pg_temp.assert_true(host2_logo_get_public('00000000-0000-0000-0000-000000000001','host-key')->'logo'='null','other owner logo withheld');
ROLLBACK;
\echo 'Host2 logo authorization and editing lock checks passed'

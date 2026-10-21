-- Audyt E24: polityki storage bez bucket_id w warunku. Kody cmd: 1 SELECT, 2 INSERT, 3 UPDATE, 4 DELETE, 5 ALL.
-- anon: rola anon/public, auth_uid: warunek z auth.uid(), always: warunek true lub pusty.
select row_number() over (order by tablename, policyname) as nr,
  (case tablename when 'objects' then 1 else 2 end) as tbl,
  (case cmd when 'SELECT' then 1 when 'INSERT' then 2 when 'UPDATE' then 3 when 'DELETE' then 4 else 5 end) as cmd_code,
  (roles && array['public', 'anon']::name[]) as anon,
  (roles && array['authenticated']::name[]) as auth_role,
  (roles && array['service_role']::name[]) as service,
  cardinality(roles) as nroles,
  (coalesce(qual, '') || coalesce(with_check, '') ~ 'auth.uid|owner') as auth_uid,
  (coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true') as always
from pg_policies
where schemaname = 'storage' and (tablename = 'buckets' or coalesce(qual, '') || coalesce(with_check, '') !~ 'bucket_id')

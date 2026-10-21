-- Audyt E24: polityki storage.objects na produkcji (same liczby).
-- b1 message-attachments, b2 user-logos, b3 user-sounds, b4 homepage-screenshots: _all liczba polityk, _anon dostępne dla anon/public.
-- other: polityki bez żadnego z tych bucketów, open: polityki z warunkiem bez bucket_id.
select
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects') as total,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%message-attachments%') as b1_all,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%message-attachments%' and (roles && array['public', 'anon']::name[])) as b1_anon,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%user-logos%') as b2_all,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%user-logos%' and (roles && array['public', 'anon']::name[])) as b2_anon,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%user-sounds%') as b3_all,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%user-sounds%' and (roles && array['public', 'anon']::name[])) as b3_anon,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%homepage-screenshots%') as b4_all,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%homepage-screenshots%' and (roles && array['public', 'anon']::name[])) as b4_anon,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') !~ '(message-attachments|user-logos|user-sounds|homepage-screenshots)') as other,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') !~ 'bucket_id') as open,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'buckets') as buckets_pol

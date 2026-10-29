-- Audyt publicznego odczytu tabel z danymi osobowymi/kluczami (produkcja).
-- p_*: profiles, d_*: device_connect_codes, r_*: app_ratings, q_*: game_gen_queue.
select
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as p_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_authenticated') as p_pol_all,
  has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') as p_auth_email,
  has_column_privilege('anon', 'public.profiles', 'email', 'SELECT') as p_anon_email,
  (select relrowsecurity from pg_class where oid = 'public.device_connect_codes'::regclass) as d_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'device_connect_codes' and policyname = 'anyone can read device_connect_codes') as d_pol_all,
  has_column_privilege('anon', 'public.device_connect_codes', 'share_key', 'SELECT') as d_anon_key,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_ratings' and policyname = 'Anyone can view ratings') as r_pol_all,
  has_column_privilege('anon', 'public.app_ratings', 'user_id', 'SELECT') as r_anon_uid,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'game_gen_queue' and policyname = 'Allow public read access to queue') as q_pol_all,
  has_table_privilege('anon', 'public.game_gen_queue', 'SELECT') as q_anon

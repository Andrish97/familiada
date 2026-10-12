-- Isolated fake history; deliberately reproduce pre354 profile corruption.
DO $$ BEGIN
 IF current_database() NOT IN ('fam','fam354draft') THEN RAISE EXCEPTION 'isolated database only'; END IF;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) VALUES
('aaaaaaaa-3542-0000-0000-000000000001',NULL,NULL,true,'{"username":"history354bad","is_guest":false}'),
('aaaaaaaa-3542-0000-0000-000000000002','history354converted@example.invalid',now(),true,'{"username":"history354converted","is_guest":false}'),
('aaaaaaaa-3542-0000-0000-000000000003','history354regular@example.invalid',NULL,false,'{"username":"history354regular","is_guest":false}');
UPDATE public.profiles SET is_guest=false,guest_last_active_at=NULL,guest_expires_at=NULL
 WHERE id::text LIKE 'aaaaaaaa-3542-%';

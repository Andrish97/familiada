-- 503: import motywów wyświetlacza dla wybranych kont.
-- Plan: familiada-server/docs/import-motywow-plan.md. Migracja dodająca:
-- dostęp nadaje panel admina (service_role), plik zapisuje wyłącznie funkcja
-- Edge display-themes po walidacji; konto czyta tylko swoje motywy.
BEGIN;

CREATE TABLE public.theme_import_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_display_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 1572864),
  background text CHECK (background ~ '^#[0-9a-f]{6}$'),
  uses_background boolean NOT NULL DEFAULT true,
  -- Nazwa trzeciego koloru z pliku motywu: { pl, en, uk } (NULL, gdy motyw go nie używa).
  background_label jsonb CHECK (background_label IS NULL OR jsonb_typeof(background_label) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_display_themes_owner_idx ON public.user_display_themes(owner_id, created_at);

ALTER TABLE public.theme_import_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_display_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY theme_import_access_own ON public.theme_import_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_display_themes_own ON public.user_display_themes
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.theme_import_access, public.user_display_themes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.theme_import_access, public.user_display_themes TO authenticated;
GRANT ALL ON public.theme_import_access, public.user_display_themes TO service_role;

-- Bucket: odczyt publiczny po losowym id (jak logo), zapis tylko service_role
-- (brak polityk INSERT/UPDATE/DELETE dla kont).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-themes', 'user-themes', true, 1572864, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

-- Usunięcie motywu (także z kontem) sprząta plik przez kolejkę storage-cleanup.
ALTER TABLE public.storage_cleanup_queue DROP CONSTRAINT storage_cleanup_queue_bucket_check;
ALTER TABLE public.storage_cleanup_queue ADD CONSTRAINT storage_cleanup_queue_bucket_check
  CHECK (bucket = ANY (ARRAY['user-sounds'::text, 'user-logos'::text, 'user-themes'::text]));

CREATE FUNCTION public._user_display_theme_cleanup() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
  VALUES ('user-themes', OLD.id::text || '.json', false, 'user', OLD.owner_id)
  ON CONFLICT DO NOTHING;
  PERFORM public.storage_cleanup_kick();
  RETURN OLD;
END $$;
CREATE TRIGGER user_display_themes_cleanup AFTER DELETE ON public.user_display_themes
  FOR EACH ROW EXECUTE FUNCTION public._user_display_theme_cleanup();

-- Ustawienia gry: czy konto może wgrywać i jego motywy.
CREATE FUNCTION public.my_display_themes() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'can_import', EXISTS (SELECT 1 FROM public.theme_import_access WHERE user_id = auth.uid()),
    'limit', 20,
    'themes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'background', t.background,
        'uses_background', t.uses_background, 'background_label', t.background_label, 'created_at', t.created_at) ORDER BY t.created_at)
      FROM public.user_display_themes t WHERE t.owner_id = auth.uid()), '[]'::jsonb))
  WHERE auth.uid() IS NOT NULL
$$;

-- Panel admina: lista kont z dostępem i nadawanie/odbieranie po nazwie lub e-mailu.
CREATE FUNCTION public.admin_theme_import_access_list() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', a.user_id, 'username', p.username, 'email', p.email, 'granted_at', a.granted_at,
    'themes', (SELECT count(*) FROM public.user_display_themes t WHERE t.owner_id = a.user_id))
    ORDER BY a.granted_at), '[]'::jsonb)
  FROM public.theme_import_access a LEFT JOIN public.profiles p ON p.id = a.user_id
$$;

CREATE FUNCTION public.admin_theme_import_access_set(p_login text, p_enabled boolean) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prof public.profiles;
BEGIN
  SELECT * INTO prof FROM public.profiles
   WHERE lower(username) = lower(btrim(p_login)) OR lower(email) = lower(btrim(p_login))
   ORDER BY (lower(username) = lower(btrim(p_login))) DESC LIMIT 1;
  IF prof.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF prof.is_guest THEN RETURN jsonb_build_object('ok', false, 'error', 'guest'); END IF;
  IF p_enabled THEN
    INSERT INTO public.theme_import_access(user_id) VALUES (prof.id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.theme_import_access WHERE user_id = prof.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'user_id', prof.id, 'username', prof.username, 'enabled', p_enabled);
END $$;

REVOKE ALL ON FUNCTION public.my_display_themes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_display_themes() TO authenticated;
REVOKE ALL ON FUNCTION public._user_display_theme_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_theme_import_access_list() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_theme_import_access_set(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_theme_import_access_list() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_theme_import_access_set(text, boolean) TO service_role;

COMMIT;

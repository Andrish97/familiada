-- ============================================================
-- 128: market_games — slug + uproszczony market_admin_upsert
-- ============================================================

-- 1. Dodaj kolumnę slug (unikalna)
ALTER TABLE public.market_games
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS market_games_slug_key ON public.market_games (slug);

-- 2. Funkcja pomocnicza: generuje slug z tytułu (PL + UA transliteracja)
CREATE OR REPLACE FUNCTION public.slugify(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
declare
  v text;
begin
  v := lower(p_text);

  -- Polskie znaki
  v := translate(v, 'ąćęłńóśźż', 'acelnoszz');

  -- Ukraińskie/rosyjskie wieloznakowe (najpierw dłuższe sekwencje)
  v := replace(v, 'щ', 'shch');
  v := replace(v, 'ж', 'zh');
  v := replace(v, 'х', 'kh');
  v := replace(v, 'ц', 'ts');
  v := replace(v, 'ч', 'ch');
  v := replace(v, 'ш', 'sh');
  v := replace(v, 'є', 'ie');
  v := replace(v, 'ї', 'i');
  v := replace(v, 'ю', 'iu');
  v := replace(v, 'я', 'ia');
  v := replace(v, 'ё', 'e');

  -- Ukraińskie/rosyjskie jednoznakowe
  -- from (24): а б в г ґ д е з и й і к л м н о п р с т у ф ь ъ
  -- to   (22): a b v h g d e z y i i k l m n o p r s t u f  (ь i ъ → usunięte)
  v := translate(v, 'абвгґдезийіклмнопрстуфьъ',
                    'abvhgdezyiiklmnoprstuf');

  -- Usuń pozostałe znaki spoza ASCII
  v := regexp_replace(v, '[^a-z0-9\s\-]', '', 'g');
  v := regexp_replace(trim(v), '[\s\-]+', '-', 'g');
  v := left(v, 80);
  return v;
end;
$$;

-- 3. Funkcja: zwraca unikalny slug (dodaje -2, -3... jeśli zajęty)
CREATE OR REPLACE FUNCTION public.unique_market_slug(p_base text, p_exclude_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
declare
  v_slug text;
  v_candidate text;
  v_n integer := 1;
begin
  v_slug := slugify(p_base);
  if v_slug = '' then
    v_slug := 'game';
  end if;

  v_candidate := v_slug;
  loop
    if not exists (
      select 1 from public.market_games
       where slug = v_candidate
         and (p_exclude_id is null or id <> p_exclude_id)
    ) then
      return v_candidate;
    end if;
    v_n := v_n + 1;
    v_candidate := v_slug || '-' || v_n;
  end loop;
end;
$$;

-- 4. Backfill istniejących rekordów (slug z tytułu)
DO $$
declare
  r record;
  v_slug text;
begin
  for r in
    select id, title from public.market_games where slug is null order by created_at asc
  loop
    v_slug := public.unique_market_slug(r.title, r.id);
    update public.market_games set slug = v_slug where id = r.id;
  end loop;
end;
$$;

-- 5. Nowy market_admin_upsert — bez storage_path, deduplication po slug
DROP FUNCTION IF EXISTS public.market_admin_upsert(text, text, text, text, jsonb);
CREATE FUNCTION public.market_admin_upsert(
  p_title       text,
  p_description text,
  p_lang        text,
  p_payload     jsonb
)
RETURNS TABLE(ok boolean, err text, market_id uuid, existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_id       uuid;
  v_existing uuid;
  v_slug     text;
begin
  if p_payload is null then
    return query select false, 'payload_required'::text, null::uuid, false;
    return;
  end if;

  -- generuj slug kandydacyjny, sprawdź czy taka gra już istnieje
  v_slug := slugify(p_title);

  select id into v_existing
    from public.market_games
   where slug = v_slug;

  if v_existing is not null then
    update public.market_games
       set title       = p_title,
           description = p_description,
           lang        = p_lang,
           payload     = p_payload,
           origin      = 'producer',
           updated_at  = now()
     where id = v_existing;

    return query select true, ''::text, v_existing, true;
    return;
  end if;

  -- nowa gra
  v_slug := public.unique_market_slug(p_title);

  insert into public.market_games (
    title, description, lang, payload, status, author_user_id, origin, slug
  ) values (
    p_title, p_description, p_lang, p_payload,
    'published', auth.uid(), 'producer', v_slug
  )
  returning id into v_id;

  return query select true, ''::text, v_id, false;
end;
$$;

-- 6. market_admin_review — nadaje slug przy approve jeśli brak
CREATE OR REPLACE FUNCTION public.market_admin_review(
  p_id uuid,
  p_action text,
  p_note text DEFAULT ''
)
RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_new_status public.market_game_status;
  v_title      text;
  v_slug       text;
begin
  if p_action = 'approve' then
    v_new_status := 'published';
  elsif p_action = 'reject' then
    v_new_status := 'rejected';
  else
    return query select false, 'invalid_action';
    return;
  end if;

  select title, slug into v_title, v_slug
    from public.market_games
   where id = p_id and status = 'pending';

  if not found then
    return query select false, 'not_found_or_not_pending';
    return;
  end if;

  if p_action = 'approve' and (v_slug is null or v_slug = '') then
    v_slug := public.unique_market_slug(v_title, p_id);
  end if;

  update public.market_games
     set status          = v_new_status,
         origin          = case when p_action = 'approve' then 'community' else origin end,
         moderation_note = case when p_action = 'reject' then btrim(coalesce(p_note, '')) else null end,
         slug            = case when p_action = 'approve' then v_slug else slug end
   where id = p_id;

  return query select true, '';
end;
$$;

-- 7. RPC publiczne: pobierz grę po slug
CREATE OR REPLACE FUNCTION public.market_game_by_slug(p_slug text)
RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  author_username text,
  status          public.market_game_status,
  payload         jsonb,
  in_library      boolean,
  origin          text,
  slug            text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    mg.status, mg.payload,
    CASE
      WHEN auth.uid() IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.user_market_library uml
         WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid()
      )
    END AS in_library,
    mg.origin::text AS origin,
    mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.slug = p_slug AND mg.status = 'published';
$$;

-- 8. market_admin_detail + slug
DROP FUNCTION IF EXISTS public.market_admin_detail(uuid);
CREATE FUNCTION public.market_admin_detail(p_id uuid)
RETURNS TABLE(
  id uuid, title text, description text, lang text,
  status public.market_game_status, moderation_note text,
  library_count integer, author_username text, author_email text,
  payload jsonb, created_at timestamptz, source_game_id uuid,
  origin text, slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.status,
    mg.moderation_note, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '') AS author_email,
    mg.payload, mg.created_at, mg.source_game_id,
    mg.origin::text AS origin, mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;

-- 9. Public market_game_detail — dodaj slug
DROP FUNCTION IF EXISTS public.market_game_detail(uuid);
CREATE FUNCTION public.market_game_detail(p_id uuid)
RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  author_username text,
  status          public.market_game_status,
  payload         jsonb,
  in_library      boolean,
  origin          text,
  slug            text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    mg.status, mg.payload,
    CASE
      WHEN auth.uid() IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.user_market_library uml
         WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid()
      )
    END AS in_library,
    mg.origin::text AS origin,
    mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;

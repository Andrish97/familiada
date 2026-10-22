-- E25: panel admina bez śmieci z testów (decyzja użytkownika 2026-10-22):
-- gry Społeczności autorstwa kont testowych, wiadomości i zgłoszenia od/do
-- adresów testowych, oceny kont testowych w średnich gier Społeczności.
-- Konto testowe = automatyczne wykluczenie (stats_exclusions_effective bez
-- 'manual' -- ręcznie wykluczone prawdziwe konta zostają widoczne) albo adres
-- testowy (testN@ / e2e+ w domenie familiada.online).

CREATE OR REPLACE FUNCTION public.is_test_user(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id = p_user_id AND e.reason <> 'manual');
$$;

CREATE OR REPLACE FUNCTION public.is_test_email(p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    lower(btrim(p_email)) ~ '^(test[0-9]+|e2e\+[a-z0-9.]+)@familiada\.online$'
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE lower(p.email) = lower(btrim(p_email)) AND public.is_test_user(p.id)),
    false);
$$;
REVOKE ALL ON FUNCTION public.is_test_user(uuid), public.is_test_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_test_user(uuid), public.is_test_email(text) TO service_role;

CREATE OR REPLACE FUNCTION "public"."market_admin_list"("p_status" "text" DEFAULT 'pending'::"text") RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "lang" "text", "status" "public"."market_game_status", "moderation_note" "text", "library_count" integer, "author_username" "text", "author_email" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "source_game_id" "uuid", "origin" "text", "slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.status, mg.moderation_note, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '')    AS author_email,
    mg.created_at, mg.updated_at, mg.source_game_id,
    mg.origin::text AS origin, mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = p_status::public.market_game_status
    AND NOT public.is_test_user(mg.author_user_id)
  ORDER BY mg.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION "public"."list_messages"("p_filter" "text" DEFAULT 'inbox'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "source" "text", "direction" "text", "from_email" "text", "to_email" "text", "subject" "text", "body" "text", "body_html" "text", "body_preview" "text", "report_id" "uuid", "ticket_number" "text", "report_status" "text", "queue_id" "uuid", "is_read" boolean, "is_marketing" boolean, "created_at" timestamp with time zone, "deleted_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Inbox: przychodzące, nie w koszu
  IF p_filter = 'inbox' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'inbound' AND m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Sent: wychodzące (w tym marketingowe), nie w koszu
  ELSIF p_filter = 'sent' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'outbound' AND m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Marketing: wszystkie oznaczone jako marketing (przychodzące i wychodzące)
  ELSIF p_filter = 'marketing' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.is_marketing = true AND m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Trash: usunięte
  ELSIF p_filter = 'trash' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NOT NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.deleted_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Reports: zgłoszenia z formularza
  ELSIF p_filter = 'reports' THEN
    RETURN QUERY
      SELECT
        r.id, 'form'::text AS source, 'inbound'::text AS direction,
        r.email AS from_email, NULL::text AS to_email, r.subject,
        NULL::text AS body, NULL::text AS body_html,
        left(r.message, 120) AS body_preview,
        r.id AS report_id, r.ticket_number, r.status AS report_status,
        NULL::uuid AS queue_id, false AS is_read, false AS is_marketing, r.created_at, NULL::timestamp AS deleted_at
      FROM public.contact_reports r
      ORDER BY r.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- All: wszystko (dla wątków)
  ELSE
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."list_reports"("p_status" "text" DEFAULT 'all'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "ticket_number" "text", "status" "text", "subject" "text", "lang" "text", "created_at" timestamp with time zone, "message_count" bigint, "last_message_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
    SELECT
      r.id,
      r.ticket_number,
      r.status,
      r.subject,
      r.lang,
      r.created_at,
      COUNT(m.id)        AS message_count,
      MAX(m.created_at)  AS last_message_at
    FROM public.reports r
    LEFT JOIN public.messages m ON m.report_id = r.id AND m.deleted_at IS NULL
    WHERE (p_status = 'all' OR r.status = p_status)
      AND NOT EXISTS (SELECT 1 FROM public.messages t
                      WHERE t.report_id = r.id AND t.direction = 'inbound' AND public.is_test_email(t.from_email))
    GROUP BY r.id
    ORDER BY COALESCE(MAX(m.created_at), r.created_at) DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Średnie ocen gier Społeczności bez ocen kont testowych (także publicznie).
CREATE OR REPLACE FUNCTION public.sync_market_game_rating_stats() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE(NEW.market_game_id, OLD.market_game_id);
  UPDATE public.market_games
  SET
    rating_count = (SELECT COUNT(*) FROM public.market_game_ratings r
                    WHERE r.market_game_id = v_id AND NOT public.is_test_user(r.user_id)),
    avg_rating   = COALESCE((SELECT ROUND(AVG(r.stars::numeric), 2) FROM public.market_game_ratings r
                    WHERE r.market_game_id = v_id AND NOT public.is_test_user(r.user_id)), 0)
  WHERE id = v_id;
  RETURN NULL;
END;
$$;

UPDATE public.market_games mg
SET rating_count = x.cnt, avg_rating = x.avg
FROM (
  SELECT g.id,
         (SELECT COUNT(*) FROM public.market_game_ratings r WHERE r.market_game_id = g.id AND NOT public.is_test_user(r.user_id)) AS cnt,
         COALESCE((SELECT ROUND(AVG(r.stars::numeric), 2) FROM public.market_game_ratings r
                   WHERE r.market_game_id = g.id AND NOT public.is_test_user(r.user_id)), 0) AS avg
  FROM public.market_games g
) x
WHERE x.id = mg.id AND (mg.rating_count IS DISTINCT FROM x.cnt OR mg.avg_rating IS DISTINCT FROM x.avg);

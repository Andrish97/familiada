-- Realne śledzenie rozgrywek (odpowiedź na: "czy to był klik czy rozgrywka,
-- i czy poszło bez błędów?"). Osobna, addytywna tabela — nie dotyka
-- public.games ani public.device_presence (device_presence zostaje jak jest,
-- bo obsługuje żywe połączenia urządzeń, nie statystyki).
--
-- Zapis wyłącznie przez poniższe funkcje SECURITY DEFINER (właściciel gry),
-- nie ma polityk INSERT/UPDATE dla klienta wprost na tabeli.

CREATE TABLE "public"."game_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "rounds_played" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "client_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_sessions_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'playing'::"text", 'final'::"text", 'won'::"text", 'lost'::"text", 'abandoned'::"text", 'error'::"text"]))),
    CONSTRAINT "game_sessions_rounds_played_check" CHECK (("rounds_played" >= 0))
);

ALTER TABLE ONLY "public"."game_sessions"
    ADD CONSTRAINT "game_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;

CREATE INDEX "game_sessions_game_id_idx" ON "public"."game_sessions" USING "btree" ("game_id");
CREATE INDEX "game_sessions_started_at_idx" ON "public"."game_sessions" USING "btree" ("started_at");
CREATE INDEX "game_sessions_status_idx" ON "public"."game_sessions" USING "btree" ("status");

ALTER TABLE "public"."game_sessions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_sessions_owner_read" ON "public"."game_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


-- game_session_start: nowa sesja przy starcie rozgrywki (GAME_INTRO).
CREATE FUNCTION "public"."game_session_start"("p_game_id" "uuid", "p_client_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_id uuid;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  insert into public.game_sessions(game_id, client_meta)
  values (p_game_id, coalesce(p_client_meta, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- game_session_update: heartbeat / przejście rundy / zmiana statusu.
CREATE FUNCTION "public"."game_session_update"("p_session_id" "uuid", "p_status" "text" DEFAULT NULL::"text", "p_rounds_played" integer DEFAULT NULL::integer, "p_client_meta_patch" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
begin
  select g.owner_id into v_owner
  from public.game_sessions s
  join public.games g on g.id = s.game_id
  where s.id = p_session_id;

  if not found then raise exception 'session not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_sessions
  set
    last_seen_at = now(),
    status = coalesce(p_status, status),
    rounds_played = coalesce(p_rounds_played, rounds_played),
    client_meta = case when p_client_meta_patch is not null then client_meta || p_client_meta_patch else client_meta end
  where id = p_session_id;
end;
$$;

-- game_session_end: zamknięcie sesji (wygrana/przegrana/porzucona/błąd).
CREATE FUNCTION "public"."game_session_end"("p_session_id" "uuid", "p_status" "text", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
begin
  select g.owner_id into v_owner
  from public.game_sessions s
  join public.games g on g.id = s.game_id
  where s.id = p_session_id;

  if not found then raise exception 'session not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_sessions
  set
    ended_at = now(),
    last_seen_at = now(),
    status = p_status,
    error_message = coalesce(p_error_message, error_message)
  where id = p_session_id;
end;
$$;

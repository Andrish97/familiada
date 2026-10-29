-- Wspólna tabela stanów gry (Control v2) — czysto addytywna migracja.
--
-- Nie dotyka żadnej istniejącej tabeli/funkcji/typu. Dzisiejszy system
-- (public.device_state / public.device_presence + broadcast komend przez
-- Realtime) zostaje bez zmian i dalej obsługuje control.html/display.html/
-- host.html/buzzer.html. Nowe strony control2/display2/host2/buzzer2 (poza
-- zakresem tej migracji) będą czytać wyłącznie z public.game_state poniżej.
--
-- public.device_presence zostaje reużyte bez zmian jako mechanizm "kto jest
-- online" (fakt obecności, pingowany często) — public.game_state odpowiada
-- wyłącznie za "co jest teraz prawdą o grze" (decyzja/stan, zapisywana przy
-- każdej zmianie, nie pingowana).

-- ---------------------------------------------------------------------
-- Typy
-- ---------------------------------------------------------------------

-- Spłaszczony, jawny "wskaźnik gdzie jesteśmy" — jeden enum zamiast
-- dzisiejszego rozbicia na steps.devices/steps.setup/rounds.step/final.step.
-- Celowo pomija dziś nieosiągalne/martwe kroki (devices_audio — krok
-- odblokowania dźwięku znika całkowicie w v2; historyczne setup_names/
-- setup_look/setup_game/setup_final/setup_rounds — dawno przeniesione do
-- osobnego modala game-settings.html i nieosiągalne w dzisiejszym control.js).
CREATE TYPE "public"."game_step" AS ENUM (
    'devices_display',
    'devices_hostbuzzer',
    'setup_finish',
    'r_intro',
    'r_roundStart',
    'r_duel',
    'r_play',
    'r_gameEnd',
    'f_start',
    'f_p1_entry',
    'f_p1_map_q1',
    'f_p1_map_q2',
    'f_p1_map_q3',
    'f_p1_map_q4',
    'f_p1_map_q5',
    'f_p2_start',
    'f_p2_entry',
    'f_p2_map_q1',
    'f_p2_map_q2',
    'f_p2_map_q3',
    'f_p2_map_q4',
    'f_p2_map_q5',
    'f_end'
);

CREATE TYPE "public"."game_top_card" AS ENUM (
    'devices',
    'setup',
    'rounds',
    'final'
);

-- Tylko istotne, gdy top_card='rounds'; NULL poza rundami.
CREATE TYPE "public"."game_round_phase" AS ENUM (
    'IDLE',
    'READY',
    'DUEL',
    'PLAY',
    'STEAL',
    'REVEAL'
);

-- Celowo NIE "team_code" (nazwa użyta w porzuconej próbie z migracji
-- 2026-08-17_224_drop_dead_game_runtime_devices_cluster.sql), żeby uniknąć
-- pomyłki z tamtym, nigdy nieukończonym klastrem.
CREATE TYPE "public"."game_team" AS ENUM (
    'A',
    'B'
);

-- ---------------------------------------------------------------------
-- Tabela: public.game_state — jeden wiersz na grę, bieżący stan (nie log).
-- ---------------------------------------------------------------------

CREATE TABLE "public"."game_state" (
    "game_id" "uuid" NOT NULL,
    "rev" bigint DEFAULT 0 NOT NULL,
    "top_card" "public"."game_top_card" DEFAULT 'devices'::"public"."game_top_card" NOT NULL,
    "step" "public"."game_step" DEFAULT 'devices_display'::"public"."game_step" NOT NULL,
    "phase" "public"."game_round_phase",
    "control_team" "public"."game_team",
    "sound_cue_key" "text",
    "sound_cue_seq" bigint DEFAULT 0 NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_state_pkey" PRIMARY KEY ("game_id")
);

ALTER TABLE ONLY "public"."game_state"
    ADD CONSTRAINT "game_state_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;

COMMENT ON TABLE "public"."game_state" IS 'Control v2: jedyne, autorytatywne źródło "co jest teraz prawdą o grze". Zapis wyłącznie przez game_state_write/game_state_buzzer_press/game_state_undo (SECURITY DEFINER) — brak polityk INSERT/UPDATE dla klienta wprost na tabeli.';
COMMENT ON COLUMN "public"."game_state"."rev" IS 'Monotoniczny licznik — optymistyczna kontrola współbieżności (p_expected_rev) i tania de-duplikacja odczytu po stronie urządzeń.';
COMMENT ON COLUMN "public"."game_state"."detail" IS 'Wszystko poza jawnymi kolumnami: drużyny, wyniki, bank, X-y, pytanie/odpowiedzi/odkryte, timery jako endsAt, mapowanie odpowiedzi finału, detail.settings (zdenormalizowane z games.settings raz na start gry), detail.display.{mode,qrTarget}, detail.host.covered.';

-- device_presence już istnieje i jest reużyte bez zmian (kto jest online).
-- Ta tabela odpowiada wyłącznie za bieżący, autorytatywny stan gry.

-- ---------------------------------------------------------------------
-- Tabela: public.game_state_history — migawki do "lekkiego cofnięcia".
-- ---------------------------------------------------------------------

CREATE TABLE "public"."game_state_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "rev" bigint NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_state_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE ONLY "public"."game_state_history"
    ADD CONSTRAINT "game_state_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;

CREATE INDEX "game_state_history_game_id_rev_idx" ON "public"."game_state_history" USING "btree" ("game_id", "rev" DESC);

COMMENT ON TABLE "public"."game_state_history" IS 'Migawki wiersza game_state SPRZED każdej zmiany (pisane przez game_state_write) — jednopoziomowe "Cofnij ostatnią akcję" w Control v2 przez game_state_undo. Przycinane do ~20 najnowszych na grę.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE "public"."game_state" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_state_owner_read" ON "public"."game_state" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_state"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));

-- Anon musi mieć bezpośredni SELECT, żeby postgres_changes mogło w ogóle
-- filtrować wiersze dla Display/Host/Buzzer (SECURITY DEFINER RPC nie
-- uczestniczy w strumieniu Realtime). gameId jest już dziś jawny w URL-ach
-- urządzeń (control/js/devices.js), więc to nie obniża realnego poziomu
-- zaufania — realnym sekretem zawsze był i zostaje share_key_*, który
-- nadal gates zapis (RPC) i pierwsze połączenie (?id=&key=). Zawężone do
-- gier status='ready', bo tylko wtedy realnie toczy się rozgrywka.
CREATE POLICY "game_state_anon_read_ready" ON "public"."game_state" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_state"."game_id") AND ("g"."status" = 'ready'::"public"."game_status")))));

ALTER TABLE "public"."game_state_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_state_history_owner_read" ON "public"."game_state_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_state_history"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));

-- ---------------------------------------------------------------------
-- Realtime — wzorzec dokładnie jak w 2026-04-15_145_fix_realtime_logs.sql
-- (jedyny w tym repo potwierdzony działający przykład postgres_changes na
-- tym self-hosted Supabase; potwierdzone dotąd tylko dla roli authenticated
-- — pierwszy krok implementacji Control v2 to zweryfikowanie, że to samo
-- działa dla anon zanim napiszemy resztę logiki gry).
-- ---------------------------------------------------------------------

ALTER TABLE "public"."game_state" REPLICA IDENTITY FULL;
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."game_state";

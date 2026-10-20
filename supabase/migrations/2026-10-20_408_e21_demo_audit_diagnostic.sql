-- 408: E21 — odczyt szablonów demo i ich kopii (tylko NOTICE, bez zmian danych).
-- Cel: sprawdzić, czy każda gra demo spełnia reguły swojego typu i statusu
-- (docs/reguly-gier-transfer-plan.md §3), zanim migracja poprawi szablony
-- i nieedytowane kopie. Wypisuje liczby i punkty, bez tekstów.

DO $$
DECLARE
  r record;
  q record;
  v_n int;
  v_line text;
BEGIN
  FOR r IN SELECT slot, lang, payload FROM public.demo_template_data
           WHERE slot NOT IN ('base', 'logo_text', 'logo_draw', 'logo_image') ORDER BY slot, lang LOOP
    v_n := coalesce(jsonb_array_length(r.payload->'votes'), 0);
    RAISE NOTICE 'E21 demo %/%: typ %, pytań %, głosów (ankiet) %', r.slot, r.lang,
      r.payload->'game'->>'type', jsonb_array_length(coalesce(r.payload->'questions', '[]')), v_n;
    FOR q IN SELECT qn, qv FROM jsonb_array_elements(coalesce(r.payload->'questions', '[]')) WITH ORDINALITY AS t(qv, qn) LOOP
      SELECT 'odp ' || count(*) || ' pkt [' || coalesce(string_agg(coalesce(a->>'fixed_points', '-'), ',' ORDER BY an), '') || '] suma '
             || coalesce(sum(coalesce((a->>'fixed_points')::int, 0)), 0)
             || ' pytanie ' || char_length(q.qv->>'text') || 'zn'
             || ' odp>17 ' || count(*) FILTER (WHERE char_length(a->>'text') > 17)
             || ' znaki ' || count(*) FILTER (WHERE cardinality(public.fam_answer_invalid_chars(a->>'text')) > 0)
        INTO v_line
      FROM jsonb_array_elements(coalesce(q.qv->'answers', '[]')) WITH ORDINALITY AS x(a, an);
      -- głosy punktowe: liczba wskazań każdej odpowiedzi
      IF v_n > 0 AND r.payload->'votes'->0 ? 'picks' THEN
        v_line := v_line || ' wskazania [' || coalesce((
          SELECT string_agg(c::text, ',' ORDER BY i) FROM (
            SELECT i, (SELECT count(*) FROM jsonb_array_elements(r.payload->'votes') v
                       WHERE (v->'picks'->>(q.qn::int - 1))::int = i - 1) c
            FROM generate_series(1, greatest(jsonb_array_length(coalesce(q.qv->'answers', '[]')), 1)) i) s), '') || ']';
      END IF;
      -- głosy tekstowe: liczności grup po oczyszczeniu (malejąco)
      IF v_n > 0 AND r.payload->'votes'->0 ? 'answers_raw' THEN
        v_line := v_line || ' grupy [' || coalesce((
          SELECT string_agg(c::text, ',' ORDER BY c DESC) FROM (
            SELECT upper(public.fam_answer_clean(v->'answers_raw'->>(q.qn::int - 1))) k, count(*) c
            FROM jsonb_array_elements(r.payload->'votes') v
            WHERE public.fam_answer_clean(coalesce(v->'answers_raw'->>(q.qn::int - 1), '')) <> ''
            GROUP BY 1) s), '') || ']';
      END IF;
      RAISE NOTICE 'E21 demo %/% p%: %', r.slot, r.lang, q.qn, v_line;
    END LOOP;
  END LOOP;

  -- Kopie demo w grach użytkowników: wg typu/statusu, ze zmienionymi ustawieniami, z głosami
  FOR r IN SELECT g.type::text t, g.status::text s, count(*) c,
                  count(*) FILTER (WHERE g.settings <> '{}'::jsonb) cs,
                  count(*) FILTER (WHERE (g.rules_state->'play'->>'ok')::boolean) cplay
           FROM public.games g WHERE g.is_demo GROUP BY 1, 2 ORDER BY 1, 2 LOOP
    RAISE NOTICE 'E21 kopie demo %/%: %, z ustawieniami %, grywalne %', r.t, r.s, r.c, r.cs, r.cplay;
  END LOOP;
END $$;

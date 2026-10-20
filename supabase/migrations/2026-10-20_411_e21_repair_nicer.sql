-- 411: E21 — ładniejsza nocna naprawa (decyzja 2026-10-20: dane poprawione
-- „ładnie”, nie mechanicznie). Odczyty db-read 2026-10-20: 546 odpowiedzi
-- >17 znaków w bazach demo to 21 starych tekstów szablonu -- wszystkie mają
-- krótkie wersje w mapie migracji 298; pytania >100 (11 w grach, 24 w bazach)
-- przy cięciu na 100 w 29 przypadkach przecinały słowo, a na granicy słowa
-- każde zachowuje ≥70 znaków.
--  * fam_clip_words: ucięcie na ostatniej spacji w limicie (gdy zostaje
--    ≥60% limitu, inaczej twardo), bez wiszącego , ; : - / ( na końcu;
--    pytanie zakończone „?” zachowuje „?”. Tylko skracanie -- bez nowych słów;
--  * bazy demo: stare długie odpowiedzi szablonu -> wersje z 298;
--  * e21_data_repair (wersja 409) używa obu; reszta bez zmian.

CREATE OR REPLACE FUNCTION public.fam_clip_words(p_text text, p_max int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  t text := btrim(coalesce(p_text, ''));
  v_q boolean;
  v_lim int;
  w text;
BEGIN
  IF char_length(t) <= p_max THEN RETURN t; END IF;
  v_q := right(t, 1) = '?';
  v_lim := p_max - CASE WHEN v_q THEN 1 ELSE 0 END;
  w := substring(left(t, v_lim + 1) from '^(.*)[[:space:]]');
  IF w IS NULL OR char_length(btrim(w)) < v_lim * 0.6 THEN w := left(t, v_lim); END IF;
  w := rtrim(btrim(w), ' ,;:-–—/(');
  RETURN w || CASE WHEN v_q AND right(w, 1) <> '?' THEN '?' ELSE '' END;
END $$;

CREATE OR REPLACE FUNCTION public.e21_demo_answer_map() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $map$ SELECT $j${"Zadzwoń jak dotrzesz": "Zadzwoń z miejsca", "Nie rozmawiaj z obcymi": "Unikaj obcych", "Dziecko / przedszkole": "Przedszkole", "Przejście dla pieszych": "Przejście piesze", "Nagrywają telefonem": "Nagrywają film", "Świeczka / dekoracje": "Świeczka", "Brzęk tłuczonego szkła": "Brzęk szkła", "Pisk hamulców (z zewnątrz)": "Pisk hamulców", "Festiwal / jarmark": "Festiwal", "Pytam w internecie": "Pytam online", "Odezwę się później": "Pogadamy później", "Problemy z jedzeniem": "Złe jedzenie", "Kupuję prezent na szybko": "Kupuję prezent", "Umawiam się na kawę": "Umawiam kawę", "Patrzę co chwilę na zegarek": "Sprawdzam zegarek", "Piszę że się spóźnię": "Piszę o zwłoce", "Macham do kierowcy": "Macham kierowcy", "Piszę na klawiaturze": "Piszę na laptopie", "Idę szybko z kartką": "Biegnę z kartką", "Rozmawiam o projekcie": "Omawiam projekt", "Kupuje ostatnie prezenty": "Kupuje prezenty", "Spotkanie ze znajomymi": "Spotkanie", "piją kawę lub herbatę": "piją kawę", "sięgają po telefon": "biorą telefon", "telefon z ładowarką": "telefon", "autobus się spóźnił": "spóźniony autobus", "zapomniałem czegoś": "zapomniałem torby", "robienie kawy/herbaty": "parzenie kawy", "spotykam się ze znajomymi": "widzę znajomych", "wychodzę na spacer": "spaceruję", "spotkanie z bliskimi": "bliscy", "Call when you get there": "Call on arrival", "Don't talk to strangers": "Avoid strangers", "Check the schedule": "Check timetable", "Downtown / main square": "Downtown", "Kutia / poppy seed cake": "Poppy seed cake", "Record on their phone": "Film on a phone", "Behind the wardrobe": "Behind a wardrobe", "Cabinet under the sink": "Under the sink", "Top of the wardrobe": "Atop a wardrobe", "Travel-size toiletries": "Mini toiletries", "Candle / decorations": "Candle", "Sound of breaking glass": "Breaking glass", "Silence after a noise": "Sudden silence", "Screeching brakes (outside)": "Screeching brakes", "Market square / downtown": "Market square", "Substitute with another": "Find a substitute", "I'm getting back to my task": "Back to my task", "I'll get back to you later": "Talk to you later", "I have to make a call": "I need to call", "Buy a last-minute gift": "Buy a gift", "Arrange a coffee meet-up": "Plan a coffee", "Check the time constantly": "Check time often", "Text that I'll be late": "Text about delay", "Run as fast as I can": "Run at full speed", "Wave at the driver": "Wave to driver", "Note with a number": "A written number", "Type on the keyboard": "Type on a laptop", "Stare at the monitor": "Stare at a screen", "Walk quickly with a paper": "Rush with a paper", "Talk about a project": "Discuss a project", "Buy last-minute gifts": "Buy gifts", "drink coffee or tea": "drink coffee", "reach for their phone": "grab their phone", "go to the bathroom": "use the bathroom", "phone with charger": "phone", "cleaning the counter": "wipe the counter", "taking out the trash": "take out trash", "meeting loved ones": "seeing loved ones", "Подзвони, як дійдеш": "Подзвони з місця", "Не розмовляй з незнайомцями": "Остерігайся чужих", "Термін придатності": "Термін зберігання", "Буде занадто солоне": "Буде пересолене", "Пішохідний перехід": "Зебра", "Знімають телефоном": "Знімають відео", "Телефон на беззвучному": "Тихий режим", "Дзвін розбитого скла": "Дзвін скла", "Сигналізація / датчик": "Сигналізація", "Скрегіт гальм (ззовні)": "Скрегіт гальм", "Фестиваль / ярмарок": "Фестиваль", "Повертаюсь до завдання": "Час працювати", "Мені треба подзвонити": "Треба подзвонити", "Хтось запізнюється": "Запізнення гостя", "Неправильна музика": "Невдала музика", "Купую швидкий подарунок": "Купую подарунок", "Домовляюся про каву": "Планую каву", "Постійно дивлюся на годинник": "Перевіряю час", "Пишу, що запізнююсь": "Пишу про затримку", "Друкую на клавіатурі": "Друкую на ноуті", "Швидко йду з папірцем": "Поспішаю з листом", "Кондиціонер для білизни": "Ополіскувач", "Прикрашають ялинку": "Оздоблюють ялинку", "Купують останні подарунки": "Купують подарунки", "п'ють каву або чай": "п'ють каву", "тягнуться до телефону": "беруть телефон", "телефон із зарядкою": "телефон", "автобус запізнився": "затримка автобуса", "приготування кави/чаю": "заварювання кави", "прибирання стільниці": "прибирання столу", "зустрічаюся з друзями": "бачуся з друзями", "зустріч з близькими": "бачуся з рідними"}$j$::jsonb $map$;
REVOKE ALL ON FUNCTION public.e21_demo_answer_map() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.e21_data_repair() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_active uuid[];
  v_q int; v_a int; v_bq int; v_ba int; v_bd int;
  v_left_q int; v_left_a int; v_empty uuid[];
  v_demo jsonb;
  v_report jsonb;
  v_job bigint;
BEGIN
  -- Gry z niewygasłą sesją Control: bez zmian treści do jej końca/wygaśnięcia.
  SELECT coalesce(array_agg(DISTINCT game_id), '{}') INTO v_active
  FROM public.control_runtime_sessions WHERE ended_at IS NULL AND expires_at > now();

  -- Kopie demo (409): zwykły tryb -- usunięcie odpowiedzi i dopisanie głosów
  -- z wyzwalaczami i kluczami obcymi.
  v_demo := public.e21_demo_repair(v_active);

  -- Bez wyzwalaczy (oczekujące kopie, cache reguł, updated_at): zmiana samego
  -- tekstu tych samych wierszy; rules_state przeliczany niżej.
  PERFORM set_config('session_replication_role', 'replica', true);

  UPDATE public.questions q SET text = public.fam_clip_words(q.text, 100)
  WHERE char_length(q.text) > 100 AND q.game_id <> ALL (v_active);
  GET DIAGNOSTICS v_q = ROW_COUNT;

  UPDATE public.answers a SET text = public.fam_answer_clean(a.text)
  FROM public.questions q
  WHERE q.id = a.question_id AND q.game_id <> ALL (v_active)
    AND cardinality(public.fam_answer_invalid_chars(a.text)) > 0 AND public.fam_answer_clean(a.text) <> '';
  GET DIAGNOSTICS v_a = ROW_COUNT;

  -- Bazy demo (411): stare długie odpowiedzi szablonu -> krótkie wersje
  -- z migracji 298 (dokładnie ten sam tekst); reszta jak niżej.
  UPDATE public.qb_questions q SET payload = jsonb_set(q.payload, '{answers}', (
    SELECT jsonb_agg(CASE WHEN jsonb_typeof(a->'text') = 'string' AND public.e21_demo_answer_map() ? (a->>'text')
                          THEN jsonb_set(a, '{text}', public.e21_demo_answer_map()->(a->>'text')) ELSE a END ORDER BY i)
    FROM jsonb_array_elements(q.payload->'answers') WITH ORDINALITY AS t(a, i)))
  FROM public.question_bases b
  WHERE b.id = q.base_id AND b.is_demo AND jsonb_typeof(q.payload->'answers') = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.payload->'answers') a
                WHERE jsonb_typeof(a->'text') = 'string' AND public.e21_demo_answer_map() ? (a->>'text'));
  GET DIAGNOSTICS v_bd = ROW_COUNT;

  -- Bazy pytań: payload.text ≤100; odpowiedzi ≤17 i znaki z czcionki.
  UPDATE public.qb_questions SET payload = jsonb_set(payload, '{text}', to_jsonb(public.fam_clip_words(payload->>'text', 100)))
  WHERE jsonb_typeof(payload->'text') = 'string' AND char_length(payload->>'text') > 100;
  GET DIAGNOSTICS v_bq = ROW_COUNT;

  WITH bad AS (
    SELECT q.id FROM public.qb_questions q
    WHERE jsonb_typeof(q.payload->'answers') = 'array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(q.payload->'answers') a
      WHERE jsonb_typeof(a->'text') = 'string'
        AND (char_length(a->>'text') > 17 OR cardinality(public.fam_answer_invalid_chars(a->>'text')) > 0)
        AND public.fam_answer_clean(a->>'text') <> '')
  )
  UPDATE public.qb_questions q SET payload = jsonb_set(q.payload, '{answers}', (
    SELECT jsonb_agg(CASE
      WHEN jsonb_typeof(a->'text') = 'string'
           AND (char_length(a->>'text') > 17 OR cardinality(public.fam_answer_invalid_chars(a->>'text')) > 0)
           AND public.fam_answer_clean(a->>'text') <> ''
        THEN jsonb_set(a, '{text}', to_jsonb(public.fam_answer_clean(a->>'text')))
      ELSE a END ORDER BY i)
    FROM jsonb_array_elements(q.payload->'answers') WITH ORDINALITY AS t(a, i)))
  FROM bad WHERE bad.id = q.id;
  GET DIAGNOSTICS v_ba = ROW_COUNT;

  -- Cache reguł po naprawie (bez zmiany updated_at -- nadal bez wyzwalaczy).
  UPDATE public.games g SET rules_state = public.game_rules_compute(g.id, g.type::text, g.status::text)
  WHERE g.id <> ALL (v_active);
  PERFORM set_config('session_replication_role', 'origin', true);

  -- Co zostało: pytania >100 (aktywne gry) i odpowiedzi do decyzji (puste po oczyszczeniu).
  SELECT count(*) INTO v_left_q FROM public.questions WHERE char_length(text) > 100;
  SELECT count(*) INTO v_left_a FROM public.answers WHERE cardinality(public.fam_answer_invalid_chars(text)) > 0;
  SELECT coalesce(array_agg(a.id ORDER BY a.id), '{}') INTO v_empty
  FROM public.answers a WHERE cardinality(public.fam_answer_invalid_chars(a.text)) > 0 AND public.fam_answer_clean(a.text) = '';

  -- Ograniczenia bazy, gdy dane są czyste (wcześniej NOT VALID zablokowałby
  -- zwykłe zmiany innych kolumn w wierszach czekających na naprawę).
  IF v_left_q = 0 THEN
    ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_text_len;
    ALTER TABLE public.questions ADD CONSTRAINT questions_text_len CHECK (char_length(text) BETWEEN 1 AND 100);
  END IF;
  IF v_left_a = 0 AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'answers_text_chars') THEN
    ALTER TABLE public.answers ADD CONSTRAINT answers_text_chars CHECK (cardinality(public.fam_answer_invalid_chars(text)) = 0);
  END IF;

  v_report := jsonb_build_object(
    'questions_truncated', v_q, 'answers_cleaned', v_a,
    'base_questions_truncated', v_bq, 'base_questions_answers_fixed', v_ba, 'demo_base_questions_mapped', v_bd,
    'skipped_active_control_games', to_jsonb(v_active),
    'questions_over_100_left', v_left_q, 'answers_invalid_left', v_left_a,
    'answers_empty_after_clean', to_jsonb(v_empty),
    'questions_constraint', v_left_q = 0, 'answers_constraint', v_left_a = 0) || v_demo;
  INSERT INTO public.e21_repair_runs(report) VALUES (v_report);
  RAISE NOTICE 'e21_data_repair: %', v_report;

  -- Koniec: zostały co najwyżej odpowiedzi czekające na decyzję i żadna kopia
  -- demo nie czekała na koniec sesji Control -> zadanie nie wraca.
  IF v_left_q = 0 AND v_left_a = cardinality(v_empty) AND coalesce((v_demo->>'demo_skipped_active_control')::int, 0) = 0
     AND to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''e21-data-repair'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
  END IF;
  RETURN v_report;
END $$;
REVOKE ALL ON FUNCTION public.e21_data_repair() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF public.fam_clip_words(repeat('ab ', 40) || 'koniec?', 100) !~ '\?$' OR char_length(public.fam_clip_words(repeat('ab ', 40) || 'koniec?', 100)) > 100 THEN
    RAISE EXCEPTION 'fam_clip_words: samosprawdzenie';
  END IF;
END $$;

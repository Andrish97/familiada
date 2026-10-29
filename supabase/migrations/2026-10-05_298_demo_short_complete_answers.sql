-- Short, complete demo answers in PL/EN/UK. Preserve user-edited copies.
-- Never delete/reseed user content or change IDs, points, question order or settings.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Prevent edits between comparison with the old template and the update.
LOCK TABLE public.games, public.questions, public.answers,
  public.question_bases, public.qb_questions, public.qb_categories,
  public.qb_tags, public.qb_question_tags, public.qb_category_tags,
  public.demo_template_data, public.poll_text_entries, public.game_state
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE demo_before ON COMMIT DROP AS
SELECT lang, slot, payload FROM public.demo_template_data;

CREATE FUNCTION pg_temp.rewrite_demo_answers(value jsonb, replacements jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE result jsonb; replacement text;
BEGIN
  IF jsonb_typeof(value) = 'string' THEN
    replacement := replacements ->> (value #>> '{}');
    RETURN CASE WHEN replacement IS NULL THEN value ELSE to_jsonb(replacement) END;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT coalesce(jsonb_agg(pg_temp.rewrite_demo_answers(v, replacements) ORDER BY n), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS x(v,n);
    RETURN result;
  ELSIF jsonb_typeof(value) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(k, pg_temp.rewrite_demo_answers(v, replacements)), '{}'::jsonb)
      INTO result FROM jsonb_each(value) AS x(k,v);
    RETURN result;
  END IF;
  RETURN value;
END
$function$;

CREATE TEMP TABLE demo_after ON COMMIT DROP AS
SELECT lang, slot, pg_temp.rewrite_demo_answers(payload,
  ($map${"pl":{"Zadzwoń jak dotrzesz":"Zadzwoń z miejsca","Nie rozmawiaj z obcymi":"Unikaj obcych","Dziecko / przedszkole":"Przedszkole","Przejście dla pieszych":"Przejście piesze","Nagrywają telefonem":"Nagrywają film","Świeczka / dekoracje":"Świeczka","Brzęk tłuczonego szkła":"Brzęk szkła","Pisk hamulców (z zewnątrz)":"Pisk hamulców","Festiwal / jarmark":"Festiwal","Pytam w internecie":"Pytam online","Odezwę się później":"Pogadamy później","Problemy z jedzeniem":"Złe jedzenie","Kupuję prezent na szybko":"Kupuję prezent","Umawiam się na kawę":"Umawiam kawę","Patrzę co chwilę na zegarek":"Sprawdzam zegarek","Piszę że się spóźnię":"Piszę o zwłoce","Macham do kierowcy":"Macham kierowcy","Piszę na klawiaturze":"Piszę na laptopie","Idę szybko z kartką":"Biegnę z kartką","Rozmawiam o projekcie":"Omawiam projekt","Kupuje ostatnie prezenty":"Kupuje prezenty","Spotkanie ze znajomymi":"Spotkanie","piją kawę lub herbatę":"piją kawę","sięgają po telefon":"biorą telefon","telefon z ładowarką":"telefon","autobus się spóźnił":"spóźniony autobus","zapomniałem czegoś":"zapomniałem torby","robienie kawy/herbaty":"parzenie kawy","spotykam się ze znajomymi":"widzę znajomych","wychodzę na spacer":"spaceruję","spotkanie z bliskimi":"bliscy"},"en":{"Call when you get there":"Call on arrival","Don't talk to strangers":"Avoid strangers","Check the schedule":"Check timetable","Downtown / main square":"Downtown","Kutia / poppy seed cake":"Poppy seed cake","Record on their phone":"Film on a phone","Behind the wardrobe":"Behind a wardrobe","Cabinet under the sink":"Under the sink","Top of the wardrobe":"Atop a wardrobe","Travel-size toiletries":"Mini toiletries","Candle / decorations":"Candle","Sound of breaking glass":"Breaking glass","Silence after a noise":"Sudden silence","Screeching brakes (outside)":"Screeching brakes","Market square / downtown":"Market square","Substitute with another":"Find a substitute","I'm getting back to my task":"Back to my task","I'll get back to you later":"Talk to you later","I have to make a call":"I need to call","Buy a last-minute gift":"Buy a gift","Arrange a coffee meet-up":"Plan a coffee","Check the time constantly":"Check time often","Text that I'll be late":"Text about delay","Run as fast as I can":"Run at full speed","Wave at the driver":"Wave to driver","Note with a number":"A written number","Type on the keyboard":"Type on a laptop","Stare at the monitor":"Stare at a screen","Walk quickly with a paper":"Rush with a paper","Talk about a project":"Discuss a project","Buy last-minute gifts":"Buy gifts","drink coffee or tea":"drink coffee","reach for their phone":"grab their phone","go to the bathroom":"use the bathroom","phone with charger":"phone","cleaning the counter":"wipe the counter","taking out the trash":"take out trash","meeting loved ones":"seeing loved ones"},"uk":{"Подзвони, як дійдеш":"Подзвони з місця","Не розмовляй з незнайомцями":"Остерігайся чужих","Термін придатності":"Термін зберігання","Буде занадто солоне":"Буде пересолене","Пішохідний перехід":"Зебра","Знімають телефоном":"Знімають відео","Телефон на беззвучному":"Тихий режим","Дзвін розбитого скла":"Дзвін скла","Сигналізація / датчик":"Сигналізація","Скрегіт гальм (ззовні)":"Скрегіт гальм","Фестиваль / ярмарок":"Фестиваль","Повертаюсь до завдання":"Час працювати","Мені треба подзвонити":"Треба подзвонити","Хтось запізнюється":"Запізнення гостя","Неправильна музика":"Невдала музика","Купую швидкий подарунок":"Купую подарунок","Домовляюся про каву":"Планую каву","Постійно дивлюся на годинник":"Перевіряю час","Пишу, що запізнююсь":"Пишу про затримку","Друкую на клавіатурі":"Друкую на ноуті","Швидко йду з папірцем":"Поспішаю з листом","Кондиціонер для білизни":"Ополіскувач","Прикрашають ялинку":"Оздоблюють ялинку","Купують останні подарунки":"Купують подарунки","п'ють каву або чай":"п'ють каву","тягнуться до телефону":"беруть телефон","телефон із зарядкою":"телефон","автобус запізнився":"затримка автобуса","приготування кави/чаю":"заварювання кави","прибирання стільниці":"прибирання столу","зустрічаюся з друзями":"бачуся з друзями","зустріч з близькими":"бачуся з рідними"}}$map$::jsonb)->lang) AS payload
FROM demo_before;

-- Reject an unexpected long answer instead of silently chopping it again.
DO $validation$
DECLARE bad record;
BEGIN
  SELECT t.lang, t.slot, a.value->>'text' AS answer INTO bad
  FROM demo_after t CROSS JOIN LATERAL jsonb_array_elements(coalesce(t.payload->'questions','[]')) q
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.value->'answers',q.value->'payload'->'answers','[]')) a
  WHERE char_length(a.value->>'text') > 17 OR char_length(a.value->>'text') < 1 LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Invalid demo answer: %/%: %', bad.lang,bad.slot,bad.answer; END IF;
  SELECT t.lang,t.slot,a.value #>> '{}' AS answer INTO bad
  FROM demo_after t CROSS JOIN LATERAL jsonb_array_elements(coalesce(t.payload->'votes','[]')) v
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.value->'answers_raw','[]')) a
  WHERE char_length(a.value #>> '{}') > 17 LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Invalid demo vote: %/%: %', bad.lang,bad.slot,bad.answer; END IF;
END
$validation$;

-- Compare the complete question/answer content, rather than is_demo alone.
-- Use the same 17-character normalization as the old seed procedure.
CREATE TEMP TABLE eligible_demo_games ON COMMIT DROP AS
SELECT g.id, t.lang,t.slot
FROM public.games g JOIN demo_before t
  ON t.slot <> 'base' AND t.payload ? 'game'
  AND g.name = t.payload->'game'->>'name'
  AND g.type::text = t.payload->'game'->>'type'
WHERE g.is_demo AND g.settings = '{}'::jsonb
  AND NOT EXISTS (
    SELECT 1 FROM public.game_state s WHERE s.game_id=g.id
    AND coalesce((s.detail->'locks'->>'gameStarted')::boolean,false)
    AND NOT coalesce((s.detail->'locks'->>'gameEnded')::boolean,false)
  )
  AND coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord',q.ord,'text',q.text,'answers',coalesce((
      SELECT jsonb_agg(jsonb_build_object('ord',a.ord,'text',a.text,'fixed_points',a.fixed_points) ORDER BY a.ord)
      FROM public.answers a WHERE a.question_id=q.id
    ),'[]'::jsonb)) ORDER BY q.ord) FROM public.questions q WHERE q.game_id=g.id
  ),'[]'::jsonb) = coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord',qn,'text',q->>'text','answers',coalesce((
      SELECT jsonb_agg(jsonb_build_object('ord',an,'text',left(trim(a->>'text'),17),
        'fixed_points',coalesce((a->>'fixed_points')::int,0)) ORDER BY an)
      FROM jsonb_array_elements(coalesce(q->'answers','[]')) WITH ORDINALITY AS aa(a,an)
    ),'[]'::jsonb)) ORDER BY qn)
    FROM jsonb_array_elements(coalesce(t.payload->'questions','[]')) WITH ORDINALITY AS qq(q,qn)
  ),'[]'::jsonb);

-- Preserve an entire base if any question, category, tag or tag assignment differs.
CREATE TEMP TABLE eligible_demo_bases ON COMMIT DROP AS
SELECT b.id,t.lang,t.slot
FROM public.question_bases b JOIN demo_before t
  ON t.slot='base' AND b.name=t.payload->'base'->>'name'
WHERE b.is_demo
  AND coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord',q.ord,'payload',q.payload,
      'category',c.name) ORDER BY q.ord)
    FROM public.qb_questions q LEFT JOIN public.qb_categories c ON c.id=q.category_id WHERE q.base_id=b.id
  ),'[]'::jsonb) = coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord',(q->>'ord')::int,'payload',q->'payload',
      'category',(SELECT c->>'name' FROM jsonb_array_elements(t.payload->'categories') c WHERE c->>'id'=q->>'category_id'))
      ORDER BY (q->>'ord')::int) FROM jsonb_array_elements(t.payload->'questions') q
  ),'[]'::jsonb)
  AND coalesce((
    SELECT jsonb_agg(jsonb_build_object('name',c.name,'ord',c.ord,'parent',p.name) ORDER BY c.name,c.ord)
    FROM public.qb_categories c LEFT JOIN public.qb_categories p ON p.id=c.parent_id WHERE c.base_id=b.id
  ),'[]'::jsonb) = coalesce((
    SELECT jsonb_agg(jsonb_build_object('name',c->>'name','ord',(c->>'ord')::int,'parent',
      (SELECT p->>'name' FROM jsonb_array_elements(t.payload->'categories') p WHERE p->>'id'=c->>'parent_id'))
      ORDER BY c->>'name',(c->>'ord')::int) FROM jsonb_array_elements(t.payload->'categories') c
  ),'[]'::jsonb)
  AND coalesce((
    SELECT jsonb_agg(jsonb_build_object('name',x.name,'ord',x.ord,'color',x.color) ORDER BY x.name,x.ord)
    FROM public.qb_tags x WHERE x.base_id=b.id
  ),'[]'::jsonb) = coalesce((
    SELECT jsonb_agg(jsonb_build_object('name',x->>'name','ord',(x->>'ord')::int,'color',x->>'color')
      ORDER BY x->>'name',(x->>'ord')::int) FROM jsonb_array_elements(t.payload->'tags') x
  ),'[]'::jsonb)
  AND coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord',q.ord,'tag',x.name) ORDER BY q.ord,x.name)
    FROM public.qb_question_tags l JOIN public.qb_questions q ON q.id=l.question_id
    JOIN public.qb_tags x ON x.id=l.tag_id WHERE q.base_id=b.id
  ),'[]'::jsonb) = coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord',(q->>'ord')::int,'tag',x->>'name') ORDER BY (q->>'ord')::int,x->>'name')
    FROM jsonb_array_elements(coalesce(t.payload->'question_tags','[]')) l
    JOIN LATERAL jsonb_array_elements(t.payload->'questions') q ON q->>'id'=l->>'question_id'
    JOIN LATERAL jsonb_array_elements(t.payload->'tags') x ON x->>'id'=l->>'tag_id'
  ),'[]'::jsonb)
  AND coalesce((
    SELECT jsonb_agg(jsonb_build_object('category',c.name,'tag',x.name) ORDER BY c.name,x.name)
    FROM public.qb_category_tags l JOIN public.qb_categories c ON c.id=l.category_id
    JOIN public.qb_tags x ON x.id=l.tag_id WHERE c.base_id=b.id
  ),'[]'::jsonb) = coalesce((
    SELECT jsonb_agg(jsonb_build_object('category',c->>'name','tag',x->>'name') ORDER BY c->>'name',x->>'name')
    FROM jsonb_array_elements(coalesce(t.payload->'category_tags','[]')) l
    JOIN LATERAL jsonb_array_elements(t.payload->'categories') c ON c->>'id'=l->>'category_id'
    JOIN LATERAL jsonb_array_elements(t.payload->'tags') x ON x->>'id'=l->>'tag_id'
  ),'[]'::jsonb);

UPDATE public.answers a SET text=new_answer->>'text'
FROM eligible_demo_games e JOIN demo_after t ON t.lang=e.lang AND t.slot=e.slot
JOIN public.questions q ON q.game_id=e.id
CROSS JOIN LATERAL jsonb_array_elements(t.payload->'questions') WITH ORDINALITY AS qq(new_question,qn)
CROSS JOIN LATERAL jsonb_array_elements(new_question->'answers') WITH ORDINALITY AS aa(new_answer,an)
WHERE a.question_id=q.id AND q.ord=qn AND a.ord=an AND a.text IS DISTINCT FROM new_answer->>'text';

UPDATE public.qb_questions q SET payload=new_question->'payload'
FROM eligible_demo_bases e JOIN demo_after t ON t.lang=e.lang AND t.slot=e.slot
CROSS JOIN LATERAL jsonb_array_elements(t.payload->'questions') AS qq(new_question)
WHERE q.base_id=e.id AND q.ord=(new_question->>'ord')::int
  AND q.payload IS DISTINCT FROM new_question->'payload';

-- Historical demo votes use the same wording as their template. Only change
-- seeded entries that still match the original raw/normalized pair.
UPDATE public.poll_text_entries p
SET answer_raw=pg_temp.rewrite_demo_answers(to_jsonb(p.answer_raw),($map${"pl":{"Zadzwoń jak dotrzesz":"Zadzwoń z miejsca","Nie rozmawiaj z obcymi":"Unikaj obcych","Dziecko / przedszkole":"Przedszkole","Przejście dla pieszych":"Przejście piesze","Nagrywają telefonem":"Nagrywają film","Świeczka / dekoracje":"Świeczka","Brzęk tłuczonego szkła":"Brzęk szkła","Pisk hamulców (z zewnątrz)":"Pisk hamulców","Festiwal / jarmark":"Festiwal","Pytam w internecie":"Pytam online","Odezwę się później":"Pogadamy później","Problemy z jedzeniem":"Złe jedzenie","Kupuję prezent na szybko":"Kupuję prezent","Umawiam się na kawę":"Umawiam kawę","Patrzę co chwilę na zegarek":"Sprawdzam zegarek","Piszę że się spóźnię":"Piszę o zwłoce","Macham do kierowcy":"Macham kierowcy","Piszę na klawiaturze":"Piszę na laptopie","Idę szybko z kartką":"Biegnę z kartką","Rozmawiam o projekcie":"Omawiam projekt","Kupuje ostatnie prezenty":"Kupuje prezenty","Spotkanie ze znajomymi":"Spotkanie","piją kawę lub herbatę":"piją kawę","sięgają po telefon":"biorą telefon","telefon z ładowarką":"telefon","autobus się spóźnił":"spóźniony autobus","zapomniałem czegoś":"zapomniałem torby","robienie kawy/herbaty":"parzenie kawy","spotykam się ze znajomymi":"widzę znajomych","wychodzę na spacer":"spaceruję","spotkanie z bliskimi":"bliscy"},"en":{"Call when you get there":"Call on arrival","Don't talk to strangers":"Avoid strangers","Check the schedule":"Check timetable","Downtown / main square":"Downtown","Kutia / poppy seed cake":"Poppy seed cake","Record on their phone":"Film on a phone","Behind the wardrobe":"Behind a wardrobe","Cabinet under the sink":"Under the sink","Top of the wardrobe":"Atop a wardrobe","Travel-size toiletries":"Mini toiletries","Candle / decorations":"Candle","Sound of breaking glass":"Breaking glass","Silence after a noise":"Sudden silence","Screeching brakes (outside)":"Screeching brakes","Market square / downtown":"Market square","Substitute with another":"Find a substitute","I'm getting back to my task":"Back to my task","I'll get back to you later":"Talk to you later","I have to make a call":"I need to call","Buy a last-minute gift":"Buy a gift","Arrange a coffee meet-up":"Plan a coffee","Check the time constantly":"Check time often","Text that I'll be late":"Text about delay","Run as fast as I can":"Run at full speed","Wave at the driver":"Wave to driver","Note with a number":"A written number","Type on the keyboard":"Type on a laptop","Stare at the monitor":"Stare at a screen","Walk quickly with a paper":"Rush with a paper","Talk about a project":"Discuss a project","Buy last-minute gifts":"Buy gifts","drink coffee or tea":"drink coffee","reach for their phone":"grab their phone","go to the bathroom":"use the bathroom","phone with charger":"phone","cleaning the counter":"wipe the counter","taking out the trash":"take out trash","meeting loved ones":"seeing loved ones"},"uk":{"Подзвони, як дійдеш":"Подзвони з місця","Не розмовляй з незнайомцями":"Остерігайся чужих","Термін придатності":"Термін зберігання","Буде занадто солоне":"Буде пересолене","Пішохідний перехід":"Зебра","Знімають телефоном":"Знімають відео","Телефон на беззвучному":"Тихий режим","Дзвін розбитого скла":"Дзвін скла","Сигналізація / датчик":"Сигналізація","Скрегіт гальм (ззовні)":"Скрегіт гальм","Фестиваль / ярмарок":"Фестиваль","Повертаюсь до завдання":"Час працювати","Мені треба подзвонити":"Треба подзвонити","Хтось запізнюється":"Запізнення гостя","Неправильна музика":"Невдала музика","Купую швидкий подарунок":"Купую подарунок","Домовляюся про каву":"Планую каву","Постійно дивлюся на годинник":"Перевіряю час","Пишу, що запізнююсь":"Пишу про затримку","Друкую на клавіатурі":"Друкую на ноуті","Швидко йду з папірцем":"Поспішаю з листом","Кондиціонер для білизни":"Ополіскувач","Прикрашають ялинку":"Оздоблюють ялинку","Купують останні подарунки":"Купують подарунки","п'ють каву або чай":"п'ють каву","тягнуться до телефону":"беруть телефон","телефон із зарядкою":"телефон","автобус запізнився":"затримка автобуса","приготування кави/чаю":"заварювання кави","прибирання стільниці":"прибирання столу","зустрічаюся з друзями":"бачуся з друзями","зустріч з близькими":"бачуся з рідними"}}$map$::jsonb)->e.lang) #>> '{}',
    answer_norm=lower(regexp_replace(trim(pg_temp.rewrite_demo_answers(to_jsonb(p.answer_raw),($map${"pl":{"Zadzwoń jak dotrzesz":"Zadzwoń z miejsca","Nie rozmawiaj z obcymi":"Unikaj obcych","Dziecko / przedszkole":"Przedszkole","Przejście dla pieszych":"Przejście piesze","Nagrywają telefonem":"Nagrywają film","Świeczka / dekoracje":"Świeczka","Brzęk tłuczonego szkła":"Brzęk szkła","Pisk hamulców (z zewnątrz)":"Pisk hamulców","Festiwal / jarmark":"Festiwal","Pytam w internecie":"Pytam online","Odezwę się później":"Pogadamy później","Problemy z jedzeniem":"Złe jedzenie","Kupuję prezent na szybko":"Kupuję prezent","Umawiam się na kawę":"Umawiam kawę","Patrzę co chwilę na zegarek":"Sprawdzam zegarek","Piszę że się spóźnię":"Piszę o zwłoce","Macham do kierowcy":"Macham kierowcy","Piszę na klawiaturze":"Piszę na laptopie","Idę szybko z kartką":"Biegnę z kartką","Rozmawiam o projekcie":"Omawiam projekt","Kupuje ostatnie prezenty":"Kupuje prezenty","Spotkanie ze znajomymi":"Spotkanie","piją kawę lub herbatę":"piją kawę","sięgają po telefon":"biorą telefon","telefon z ładowarką":"telefon","autobus się spóźnił":"spóźniony autobus","zapomniałem czegoś":"zapomniałem torby","robienie kawy/herbaty":"parzenie kawy","spotykam się ze znajomymi":"widzę znajomych","wychodzę na spacer":"spaceruję","spotkanie z bliskimi":"bliscy"},"en":{"Call when you get there":"Call on arrival","Don't talk to strangers":"Avoid strangers","Check the schedule":"Check timetable","Downtown / main square":"Downtown","Kutia / poppy seed cake":"Poppy seed cake","Record on their phone":"Film on a phone","Behind the wardrobe":"Behind a wardrobe","Cabinet under the sink":"Under the sink","Top of the wardrobe":"Atop a wardrobe","Travel-size toiletries":"Mini toiletries","Candle / decorations":"Candle","Sound of breaking glass":"Breaking glass","Silence after a noise":"Sudden silence","Screeching brakes (outside)":"Screeching brakes","Market square / downtown":"Market square","Substitute with another":"Find a substitute","I'm getting back to my task":"Back to my task","I'll get back to you later":"Talk to you later","I have to make a call":"I need to call","Buy a last-minute gift":"Buy a gift","Arrange a coffee meet-up":"Plan a coffee","Check the time constantly":"Check time often","Text that I'll be late":"Text about delay","Run as fast as I can":"Run at full speed","Wave at the driver":"Wave to driver","Note with a number":"A written number","Type on the keyboard":"Type on a laptop","Stare at the monitor":"Stare at a screen","Walk quickly with a paper":"Rush with a paper","Talk about a project":"Discuss a project","Buy last-minute gifts":"Buy gifts","drink coffee or tea":"drink coffee","reach for their phone":"grab their phone","go to the bathroom":"use the bathroom","phone with charger":"phone","cleaning the counter":"wipe the counter","taking out the trash":"take out trash","meeting loved ones":"seeing loved ones"},"uk":{"Подзвони, як дійдеш":"Подзвони з місця","Не розмовляй з незнайомцями":"Остерігайся чужих","Термін придатності":"Термін зберігання","Буде занадто солоне":"Буде пересолене","Пішохідний перехід":"Зебра","Знімають телефоном":"Знімають відео","Телефон на беззвучному":"Тихий режим","Дзвін розбитого скла":"Дзвін скла","Сигналізація / датчик":"Сигналізація","Скрегіт гальм (ззовні)":"Скрегіт гальм","Фестиваль / ярмарок":"Фестиваль","Повертаюсь до завдання":"Час працювати","Мені треба подзвонити":"Треба подзвонити","Хтось запізнюється":"Запізнення гостя","Неправильна музика":"Невдала музика","Купую швидкий подарунок":"Купую подарунок","Домовляюся про каву":"Планую каву","Постійно дивлюся на годинник":"Перевіряю час","Пишу, що запізнююсь":"Пишу про затримку","Друкую на клавіатурі":"Друкую на ноуті","Швидко йду з папірцем":"Поспішаю з листом","Кондиціонер для білизни":"Ополіскувач","Прикрашають ялинку":"Оздоблюють ялинку","Купують останні подарунки":"Купують подарунки","п'ють каву або чай":"п'ють каву","тягнуться до телефону":"беруть телефон","телефон із зарядкою":"телефон","автобус запізнився":"затримка автобуса","приготування кави/чаю":"заварювання кави","прибирання стільниці":"прибирання столу","зустрічаюся з друзями":"бачуся з друзями","зустріч з близькими":"бачуся з рідними"}}$map$::jsonb)->e.lang) #>> '{}'),'\s+',' ','g'))
FROM eligible_demo_games e JOIN demo_before t ON t.lang=e.lang AND t.slot=e.slot
WHERE p.game_id=e.id AND p.voter_token LIKE 'demo_seed_v%'
  AND p.answer_norm=lower(regexp_replace(trim(p.answer_raw),'\s+',' ','g'))
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(t.payload->'votes','[]')) v
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(v->'answers_raw','[]')) a
    WHERE a=p.answer_raw
  )
  AND (($map${"pl":{"Zadzwoń jak dotrzesz":"Zadzwoń z miejsca","Nie rozmawiaj z obcymi":"Unikaj obcych","Dziecko / przedszkole":"Przedszkole","Przejście dla pieszych":"Przejście piesze","Nagrywają telefonem":"Nagrywają film","Świeczka / dekoracje":"Świeczka","Brzęk tłuczonego szkła":"Brzęk szkła","Pisk hamulców (z zewnątrz)":"Pisk hamulców","Festiwal / jarmark":"Festiwal","Pytam w internecie":"Pytam online","Odezwę się później":"Pogadamy później","Problemy z jedzeniem":"Złe jedzenie","Kupuję prezent na szybko":"Kupuję prezent","Umawiam się na kawę":"Umawiam kawę","Patrzę co chwilę na zegarek":"Sprawdzam zegarek","Piszę że się spóźnię":"Piszę o zwłoce","Macham do kierowcy":"Macham kierowcy","Piszę na klawiaturze":"Piszę na laptopie","Idę szybko z kartką":"Biegnę z kartką","Rozmawiam o projekcie":"Omawiam projekt","Kupuje ostatnie prezenty":"Kupuje prezenty","Spotkanie ze znajomymi":"Spotkanie","piją kawę lub herbatę":"piją kawę","sięgają po telefon":"biorą telefon","telefon z ładowarką":"telefon","autobus się spóźnił":"spóźniony autobus","zapomniałem czegoś":"zapomniałem torby","robienie kawy/herbaty":"parzenie kawy","spotykam się ze znajomymi":"widzę znajomych","wychodzę na spacer":"spaceruję","spotkanie z bliskimi":"bliscy"},"en":{"Call when you get there":"Call on arrival","Don't talk to strangers":"Avoid strangers","Check the schedule":"Check timetable","Downtown / main square":"Downtown","Kutia / poppy seed cake":"Poppy seed cake","Record on their phone":"Film on a phone","Behind the wardrobe":"Behind a wardrobe","Cabinet under the sink":"Under the sink","Top of the wardrobe":"Atop a wardrobe","Travel-size toiletries":"Mini toiletries","Candle / decorations":"Candle","Sound of breaking glass":"Breaking glass","Silence after a noise":"Sudden silence","Screeching brakes (outside)":"Screeching brakes","Market square / downtown":"Market square","Substitute with another":"Find a substitute","I'm getting back to my task":"Back to my task","I'll get back to you later":"Talk to you later","I have to make a call":"I need to call","Buy a last-minute gift":"Buy a gift","Arrange a coffee meet-up":"Plan a coffee","Check the time constantly":"Check time often","Text that I'll be late":"Text about delay","Run as fast as I can":"Run at full speed","Wave at the driver":"Wave to driver","Note with a number":"A written number","Type on the keyboard":"Type on a laptop","Stare at the monitor":"Stare at a screen","Walk quickly with a paper":"Rush with a paper","Talk about a project":"Discuss a project","Buy last-minute gifts":"Buy gifts","drink coffee or tea":"drink coffee","reach for their phone":"grab their phone","go to the bathroom":"use the bathroom","phone with charger":"phone","cleaning the counter":"wipe the counter","taking out the trash":"take out trash","meeting loved ones":"seeing loved ones"},"uk":{"Подзвони, як дійдеш":"Подзвони з місця","Не розмовляй з незнайомцями":"Остерігайся чужих","Термін придатності":"Термін зберігання","Буде занадто солоне":"Буде пересолене","Пішохідний перехід":"Зебра","Знімають телефоном":"Знімають відео","Телефон на беззвучному":"Тихий режим","Дзвін розбитого скла":"Дзвін скла","Сигналізація / датчик":"Сигналізація","Скрегіт гальм (ззовні)":"Скрегіт гальм","Фестиваль / ярмарок":"Фестиваль","Повертаюсь до завдання":"Час працювати","Мені треба подзвонити":"Треба подзвонити","Хтось запізнюється":"Запізнення гостя","Неправильна музика":"Невдала музика","Купую швидкий подарунок":"Купую подарунок","Домовляюся про каву":"Планую каву","Постійно дивлюся на годинник":"Перевіряю час","Пишу, що запізнююсь":"Пишу про затримку","Друкую на клавіатурі":"Друкую на ноуті","Швидко йду з папірцем":"Поспішаю з листом","Кондиціонер для білизни":"Ополіскувач","Прикрашають ялинку":"Оздоблюють ялинку","Купують останні подарунки":"Купують подарунки","п'ють каву або чай":"п'ють каву","тягнуться до телефону":"беруть телефон","телефон із зарядкою":"телефон","автобус запізнився":"затримка автобуса","приготування кави/чаю":"заварювання кави","прибирання стільниці":"прибирання столу","зустрічаюся з друзями":"бачуся з друзями","зустріч з близькими":"бачуся з рідними"}}$map$::jsonb)->e.lang) ? p.answer_raw;

UPDATE public.demo_template_data t SET payload=n.payload
FROM demo_after n WHERE t.lang=n.lang AND t.slot=n.slot AND t.payload IS DISTINCT FROM n.payload;

DO $report$
BEGIN
  RAISE NOTICE 'Demo answers refreshed: % eligible games, % eligible bases; PL/EN/UK templates checked.',
    (SELECT count(*) FROM eligible_demo_games),(SELECT count(*) FROM eligible_demo_bases);
END
$report$;
COMMIT;

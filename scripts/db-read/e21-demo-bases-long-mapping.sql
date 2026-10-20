-- E21: odpowiedzi >17 znaków w bazach demo -- ile ma krótką wersję z mapy
-- migracji 298 (ten sam stary tekst szablonu), ile trzeba by uciąć, oraz ile
-- przy ucięciu na granicy słowa zostałoby ≥8 znaków. Tylko liczby.
WITH dl AS (
  SELECT a->>'text' AS t
  FROM public.question_bases b
  JOIN public.qb_questions q ON q.base_id = b.id
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers') = 'array' THEN q.payload->'answers' ELSE '[]' END) a
  WHERE b.is_demo AND char_length(a->>'text') > 17
), mapa AS (
  SELECT jsonb_array_elements_text($m$["Arrange a coffee meet-up", "Behind the wardrobe", "Brzęk tłuczonego szkła", "Buy a last-minute gift", "Buy last-minute gifts", "Cabinet under the sink", "Call when you get there", "Candle / decorations", "Check the schedule", "Check the time constantly", "Don't talk to strangers", "Downtown / main square", "Dziecko / przedszkole", "Festiwal / jarmark", "I have to make a call", "I'll get back to you later", "I'm getting back to my task", "Idę szybko z kartką", "Kupuje ostatnie prezenty", "Kupuję prezent na szybko", "Kutia / poppy seed cake", "Macham do kierowcy", "Market square / downtown", "Nagrywają telefonem", "Nie rozmawiaj z obcymi", "Note with a number", "Odezwę się później", "Patrzę co chwilę na zegarek", "Pisk hamulców (z zewnątrz)", "Piszę na klawiaturze", "Piszę że się spóźnię", "Problemy z jedzeniem", "Przejście dla pieszych", "Pytam w internecie", "Record on their phone", "Rozmawiam o projekcie", "Run as fast as I can", "Screeching brakes (outside)", "Silence after a noise", "Sound of breaking glass", "Spotkanie ze znajomymi", "Stare at the monitor", "Substitute with another", "Talk about a project", "Text that I'll be late", "Top of the wardrobe", "Travel-size toiletries", "Type on the keyboard", "Umawiam się na kawę", "Walk quickly with a paper", "Wave at the driver", "Zadzwoń jak dotrzesz", "autobus się spóźnił", "cleaning the counter", "drink coffee or tea", "go to the bathroom", "meeting loved ones", "phone with charger", "piją kawę lub herbatę", "reach for their phone", "robienie kawy/herbaty", "sięgają po telefon", "spotkanie z bliskimi", "spotykam się ze znajomymi", "taking out the trash", "telefon z ładowarką", "wychodzę na spacer", "zapomniałem czegoś", "Świeczka / dekoracje", "Буде занадто солоне", "Дзвін розбитого скла", "Домовляюся про каву", "Друкую на клавіатурі", "Знімають телефоном", "Кондиціонер для білизни", "Купую швидкий подарунок", "Купують останні подарунки", "Мені треба подзвонити", "Не розмовляй з незнайомцями", "Неправильна музика", "Пишу, що запізнююсь", "Повертаюсь до завдання", "Подзвони, як дійдеш", "Постійно дивлюся на годинник", "Прикрашають ялинку", "Пішохідний перехід", "Сигналізація / датчик", "Скрегіт гальм (ззовні)", "Телефон на беззвучному", "Термін придатності", "Фестиваль / ярмарок", "Хтось запізнюється", "Швидко йду з папірцем", "автобус запізнився", "зустріч з близькими", "зустрічаюся з друзями", "п'ють каву або чай", "прибирання стільниці", "приготування кави/чаю", "телефон із зарядкою", "тягнуться до телефону"]$m$::jsonb) AS k
)
SELECT count(*) AS wszystkie,
       count(*) FILTER (WHERE t IN (SELECT k FROM mapa)) AS z_mapy_298,
       count(*) FILTER (WHERE t NOT IN (SELECT k FROM mapa)) AS do_uciecia,
       count(*) FILTER (WHERE t NOT IN (SELECT k FROM mapa) AND char_length(rtrim(substring(left(t, 18) from '^(.*)[[:space:]]'), ' ,.:-/(')) >= 8) AS granica_slowa_min_8,
       count(DISTINCT t) AS roznych_tekstow,
       count(DISTINCT t) FILTER (WHERE t IN (SELECT k FROM mapa)) AS roznych_z_mapy
FROM dl

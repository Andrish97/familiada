-- Zużycie AI na dzień (UTC, 7 dni): wywołania, tokeny rozliczone, rezerwacje
-- bez rozliczenia (przerwane wywołania), pytania dodane do puli tego dnia.
SELECT u.day,
       (u.service = 'questions')::int AS pytania_1_marketing_0,
       count(*) AS wywolania,
       coalesce(sum(u.actual), 0) AS tokeny_rozliczone,
       count(*) FILTER (WHERE u.actual IS NULL) AS nierozliczone,
       coalesce(sum(u.reserved) FILTER (WHERE u.actual IS NULL), 0) AS tokeny_nierozliczone,
       coalesce(sum(coalesce(u.actual, u.reserved)), 0) AS tokeny_do_limitu,
       round(avg(u.actual))::int AS srednio_na_wywolanie,
       CASE WHEN u.service = 'questions' THEN (SELECT count(*) FROM public.producer_question_pool p
         WHERE (p.created_at AT TIME ZONE 'UTC')::date = u.day) END AS pytania_dodane
FROM public.producer_ai_usage u
WHERE u.day > (now() AT TIME ZONE 'UTC')::date - 7
GROUP BY u.day, u.service
ORDER BY u.day DESC, u.service

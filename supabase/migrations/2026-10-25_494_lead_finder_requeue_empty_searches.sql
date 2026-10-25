-- 494: zapytania wyszukiwarki zapisane jako wykonane mimo 0 wyników (silniki
-- SearXNG odmawiały — przebieg 2026-10-25 16:22: 60 zapytań, 0 wyników)
-- wracają do puli. Od tej wersji usługa nie zapisuje takich zapytań.
DELETE FROM public.marketing_search_queries_log
 WHERE query_text LIKE 'search:%' AND coalesce(urls_found, 0) = 0;

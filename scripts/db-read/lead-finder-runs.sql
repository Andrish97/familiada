-- Lead Finder 2: liczniki lejka ostatnich przebiegów (same liczby i daty).
SELECT started_at, finished_at, kind = 'review' AS przeglad, target, search_queries, search_results,
       search_engine_errors, ceidg_records, candidates, dropped_no_email, dropped_duplicate, dropped_public,
       dropped_rule, pages_fetched, sent_to_ai, ai_calls, ai_accepted, ai_rejected, errors
  FROM public.marketing_run_stats
 ORDER BY started_at DESC
 LIMIT 5

-- 172: Wymuś reload schematu PostgREST po dodaniu get_stats_detail (migr. 171)
NOTIFY pgrst, 'reload schema';

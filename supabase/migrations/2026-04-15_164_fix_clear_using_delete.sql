-- Use DELETE instead of TRUNCATE

CREATE OR REPLACE FUNCTION public.clear_marketing_search_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM marketing_search_logs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_marketing_search_logs() TO service_role;

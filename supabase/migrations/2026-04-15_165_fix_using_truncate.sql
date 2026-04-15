-- Use TRUNCATE instead of DELETE (PostgRest requires WHERE in DELETE)

CREATE OR REPLACE FUNCTION public.clear_marketing_search_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    TRUNCATE marketing_search_logs RESTART IDENTITY CASCADE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_marketing_search_logs() TO service_role;

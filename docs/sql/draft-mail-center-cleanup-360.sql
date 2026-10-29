-- LOCAL DRAFT: capabilities expire; preference roots and source cooldowns stay.
CREATE INDEX ON public.mail_center_links_prototype(expires_at);
CREATE INDEX ON public.mail_center_sessions_prototype(link_id);
CREATE OR REPLACE FUNCTION public.mail_center_cleanup_prototype()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate record; link public.mail_center_links_prototype; dropped_sessions integer:=0; dropped_links integer:=0; dropped_events integer:=0; affected integer;
BEGIN
 FOR candidate IN SELECT id FROM public.mail_center_links_prototype l
  WHERE revoked_at IS NOT NULL OR expires_at<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM public.mail_center_sessions_prototype s WHERE s.link_id=l.id
      AND (s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.last_seen_at<=clock_timestamp()-interval '1 hour'))
  ORDER BY id LIMIT 500 LOOP
  BEGIN
   SELECT * INTO link FROM public.mail_center_links_prototype WHERE id=candidate.id FOR UPDATE NOWAIT;
   IF NOT FOUND THEN CONTINUE; END IF;
   -- Preflight children without waiting; concurrent parent-first access and
   -- legacy child-first queue operations cannot create a lock cycle.
   PERFORM 1 FROM public.mail_center_sessions_prototype WHERE link_id=link.id ORDER BY secret_hash FOR UPDATE NOWAIT;
   PERFORM 1 FROM public.mail_queue WHERE mail_center_link_id_prototype=link.id ORDER BY id FOR UPDATE NOWAIT;
   DELETE FROM public.mail_center_sessions_prototype WHERE link_id=link.id
    AND (link.revoked_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at<=clock_timestamp() OR last_seen_at<=clock_timestamp()-interval '1 hour');
   GET DIAGNOSTICS affected=ROW_COUNT; dropped_sessions:=dropped_sessions+affected;
   IF link.revoked_at IS NOT NULL OR (link.expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.mail_center_sessions_prototype WHERE link_id=link.id)) THEN
    DELETE FROM public.mail_center_links_prototype WHERE id=link.id;
    dropped_links:=dropped_links+1;
   END IF;
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
 END LOOP;
 DELETE FROM public.mail_center_request_events_prototype WHERE created_at<=clock_timestamp()-interval '48 hours';
 GET DIAGNOSTICS dropped_events=ROW_COUNT;
 RETURN jsonb_build_object('sessions_removed',dropped_sessions,'links_removed',dropped_links,'events_removed',dropped_events);
END $$;
REVOKE ALL ON FUNCTION public.mail_center_cleanup_prototype() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_cleanup_prototype() TO service_role;

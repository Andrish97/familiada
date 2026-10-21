-- Zmiana typu gry z zamkniętą ankietą (decyzja użytkownika 2026-10-21):
-- bez osobnego pytania o reset — okno „Zmień typ” jest potwierdzeniem.
-- Głosy, wpisy, sesje, zadania i kody QR ankiety zawsze znikają; wyniki
-- (odpowiedzi i punkty z podliczenia) można opcjonalnie zachować (p_keep):
--   * -> preparowana: z punktowej zostają punkty, z tekstowej odpowiedzi i punkty;
--     bez p_keep: z punktowej punkty zerowane, z tekstowej zostają same pytania,
--   * tekstowa -> punktacja: zostają odpowiedzi (punkty da nowa ankieta);
--     bez p_keep: same pytania,
--   * -> tekstowa: same pytania (bez wyboru).
-- Zgodne wstecz: wywołanie bez p_keep działa jak dotąd (reset zeruje punkty).

CREATE OR REPLACE FUNCTION public._game_poll_clear(p_game_id uuid, p_zero_points boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_key text := public.gen_share_key(18);
BEGIN
  DELETE FROM public.poll_votes WHERE game_id = p_game_id;
  DELETE FROM public.poll_text_entries WHERE game_id = p_game_id;
  DELETE FROM public.poll_sessions WHERE game_id = p_game_id;
  DELETE FROM public.poll_tasks WHERE game_id = p_game_id;
  DELETE FROM public.device_connect_codes WHERE game_id = p_game_id AND device_type = 'poll_qr';

  UPDATE public.games
     SET status = 'draft', poll_opened_at = NULL, poll_closed_at = NULL,
         share_key_poll = v_key, poll_share_updated_at = now(), updated_at = now()
   WHERE id = p_game_id;

  IF p_zero_points THEN
    UPDATE public.answers a
       SET fixed_points = 0
      FROM public.questions q
     WHERE q.id = a.question_id AND q.game_id = p_game_id AND a.fixed_points <> 0;
  END IF;

  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION public._game_poll_clear(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._game_poll_reset(p_game_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public._game_poll_clear(p_game_id, true);
END $$;
REVOKE ALL ON FUNCTION public._game_poll_reset(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.game_change_type(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.game_change_type(p_game_id uuid, p_type text, p_reset boolean DEFAULT false, p_keep boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_uid uuid := auth.uid();
  g record;
  v_edit jsonb;
  v_removed int := 0;
  v_cleared int := 0;
  v_reset boolean := false;
  v_keep boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_type is null or p_type not in ('prepared', 'poll_points', 'poll_text') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  select id, type::text as type, status::text as status into g
  from public.games where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  v_edit := public.game_rules_compute(g.id, g.type, g.status)->'edit';
  if not coalesce((v_edit->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'edit_blocked', 'code', v_edit->>'code');
  end if;
  if public._game_control_active(g.id) then
    return jsonb_build_object('ok', false, 'error', 'edit_blocked', 'code', 'controlActive');
  end if;
  if coalesce((v_edit->>'needs_reset')::boolean, false) then
    if not coalesce(p_reset, false) then
      return jsonb_build_object('ok', false, 'error', 'needs_reset');
    end if;
    -- Wyniki zamkniętej ankiety: zachowanie tylko przy zmianie na typ, który je wykorzysta.
    v_keep := coalesce(p_keep, false) and p_type <> g.type and p_type <> 'poll_text';
    perform public._game_poll_clear(g.id, not (v_keep and p_type = 'prepared'));
    -- Tekstowa: odpowiedzi pochodzą z ankiety -- bez zachowania zostają same pytania.
    if not v_keep and g.type = 'poll_text' and p_type <> g.type then
      delete from public.answers a using public.questions q
       where q.id = a.question_id and q.game_id = g.id;
      get diagnostics v_removed = row_count;
    end if;
    v_reset := true;
  end if;

  if p_type = g.type then
    return jsonb_build_object('ok', true, 'changed', v_reset, 'type', g.type, 'reset', v_reset);
  end if;

  if p_type = 'poll_text' then
    delete from public.answers a using public.questions q
     where q.id = a.question_id and q.game_id = g.id;
    get diagnostics v_removed = row_count;
  elsif p_type = 'poll_points' then
    update public.answers a set fixed_points = 0
      from public.questions q
     where q.id = a.question_id and q.game_id = g.id and a.fixed_points <> 0;
    get diagnostics v_cleared = row_count;
  end if;

  update public.games
     set type = p_type::public.game_type, status = 'draft',
         poll_opened_at = null, poll_closed_at = null, updated_at = now()
   where id = g.id;

  return jsonb_build_object('ok', true, 'changed', true, 'type', p_type, 'reset', v_reset,
                            'kept', v_keep, 'removed_answers', v_removed, 'cleared_points', v_cleared);
end;
$$;
REVOKE ALL ON FUNCTION public.game_change_type(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.game_change_type(uuid, text, boolean, boolean) TO authenticated;

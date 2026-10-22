-- E25 (docs/konta-testowe-plan.md): konta testowe -- role, wypożyczanie (lease),
-- czyszczenie przy lease, kwarantanna, automatyczne wykluczenie w statystykach.
-- Dodająca: stare konta testN i ich reguły działają bez zmian do pakietu F.
-- delete_user_everything zachowuje zachowanie: ciało przeniesione do
-- _delete_user_data (plus jawny przebieg po FK, który przy usuwaniu profilu
-- i tak wykonałaby kaskada), potem usunięcie profilu i konta jak dotąd.

-- 1. Tożsamości i wypożyczenia ------------------------------------------------
CREATE TABLE public.e2e_identities (
  name text PRIMARY KEY CHECK (name ~ '^(e2e|resource)\.[a-z]+[0-9]{2}$'),
  role text NOT NULL CHECK (role IN ('standard','noaccount','disposable','dedicated','resource')),
  email text UNIQUE CHECK (email IS NULL OR email ~ '^e2e\+[a-z]+[0-9]{2}@familiada\.online$'),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text CHECK (purpose IS NULL OR purpose ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  purpose_note text,
  assigned_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text,
  last_leased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'resource') = (email IS NULL)),
  CHECK (role IN ('dedicated','resource') OR purpose IS NULL),
  CHECK (role <> 'resource' OR purpose IS NOT NULL),
  CHECK (role NOT IN ('noaccount','resource') OR user_id IS NULL)
);
COMMENT ON TABLE public.e2e_identities IS
  'E25: jedno źródło kont testowych. purpose: dla dedicated przypisanie na stałe do czynności (NULL = wolne), dla resource rodzaj zasobu (mail/heavy).';

CREATE TABLE public.e2e_leases (
  name text PRIMARY KEY REFERENCES public.e2e_identities(name) ON DELETE CASCADE,
  run_id text NOT NULL CHECK (length(run_id) BETWEEN 1 AND 100),
  worker text NOT NULL DEFAULT '' CHECK (length(worker) <= 100),
  label text CHECK (label IS NULL OR length(label) <= 200),
  leased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX e2e_leases_run_idx ON public.e2e_leases(run_id);

ALTER TABLE public.e2e_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.e2e_identities, public.e2e_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.e2e_identities, public.e2e_leases TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
    GRANT SELECT ON public.e2e_identities, public.e2e_leases TO agent_reader;
  END IF;
END $$;

INSERT INTO public.e2e_identities(name, role, email)
SELECT format('e2e.%s%s', r.role, lpad(n::text, 2, '0')), r.role,
       format('e2e+%s%s@familiada.online', r.role, lpad(n::text, 2, '0'))
FROM (VALUES ('standard',40),('noaccount',10),('disposable',6),('dedicated',6)) r(role, cnt)
CROSS JOIN LATERAL generate_series(1, r.cnt) n;
INSERT INTO public.e2e_identities(name, role, purpose) VALUES
  ('resource.mail01','resource','mail'), ('resource.mail02','resource','mail'),
  ('resource.heavy01','resource','heavy');
UPDATE public.e2e_identities
   SET purpose = 'e20-gallery', purpose_note = 'galeria E20 (e20-gallery.spec.js, e2e-tests.yml)', assigned_at = now()
 WHERE name = 'e2e.dedicated01';

-- Tożsamość testowa po adresie (także wariant .new dla disposable).
CREATE FUNCTION public.e2e_identity(p_email text) RETURNS public.e2e_identities
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.* FROM public.e2e_identities i
  WHERE i.email = regexp_replace(lower(btrim(p_email)), '^(e2e\+[a-z]+[0-9]{2})\.new@', '\1@')
    AND (lower(btrim(p_email)) = i.email OR (i.role = 'disposable' AND lower(btrim(p_email)) ~ '^e2e\+[a-z]+[0-9]{2}\.new@'));
$$;

-- 2. Dane konta: wspólne dla usuwania konta i czyszczenia przy lease -----------
CREATE FUNCTION public._delete_user_data(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_emails text[];
  v_email text;
  fk record;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 312: e-maile konta (małymi literami) -- po nich czyścimy dane bez user_id
  select coalesce(array_agg(distinct e), array[]::text[]) into v_emails
  from (
    select lower(trim(u.email)) as e from auth.users u where u.id = p_user_id
    union
    select lower(trim(p.email)) from public.profiles p where p.id = p_user_id
  ) x
  where e is not null and e <> '';

  -- Serialize against snapshot/write jobs before inspecting the inbox.
  perform 1 from auth.users where id = p_user_id for update;

  --366: remove only this recipient inbox before pending resource guards.
  -- Sent copies already belong to their recipients and remain independent.
  delete from public.resource_copy_offers where recipient_id = p_user_id;

  -- 312: usunięcie konta jest nadrzędne -- nie sprawdza blokad (edit_locks);
  -- blokady trzymane przez to konto i na jego zasobach znikają.
  delete from public.edit_locks where holder_user_id = p_user_id;
  delete from public.edit_locks
   where (resource_type = 'game' and resource_id in (select id from public.games where owner_id = p_user_id))
      or (resource_type = 'base' and resource_id in (select id from public.question_bases where owner_id = p_user_id))
      or (resource_type = 'logo' and resource_id in (select id from public.user_logos where user_id = p_user_id));

  -- 312: głosy w cudzych ankietach zostają anonimowe (bez powiązania z kontem);
  -- głosy w własnych grach znikają razem z grami niżej.
  update public.poll_text_entries set voter_user_id = null where voter_user_id = p_user_id;
  update public.poll_votes set voter_user_id = null where voter_user_id = p_user_id;

  delete from public.friendships where requester_id=p_user_id OR addressee_id=p_user_id;
  delete from public.shared_devices where recipient_id=p_user_id;

  delete from public.poll_subscriptions where registered_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  -- 312: zaproszenia do baz (po user_id i po e-mailu)
  delete from public.base_share_tasks where recipient_user_id = p_user_id;
  delete from public.base_share_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  -- 312: gry (maile ankietowe właściciela znikają niżej przez created_by)
  delete from public.shared_devices where game_id in (select id from public.games where owner_id = p_user_id);
  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- 312: wszystko powiązane z e-mailem konta
  delete from public.mail_queue where created_by = p_user_id;
  delete from public.mail_function_logs where actor_user_id = p_user_id;
  delete from public.email_intents where user_id = p_user_id;
  delete from public.contact_reports where user_id = p_user_id;
  delete from public.mail_cooldowns
   where position(p_user_id::text in target_key) > 0;

  foreach v_email in array v_emails loop
    delete from public.shared_devices where lower(trim(recipient_email))=v_email;
    delete from public.poll_subscriptions where lower(subscriber_email) = v_email;
    delete from public.poll_tasks where lower(recipient_email) = v_email;
    delete from public.base_share_tasks where lower(recipient_email) = v_email;
    delete from public.mail_queue where lower(trim(to_email)) = v_email;
    delete from public.mail_function_logs where lower(recipient_email) = v_email;
    delete from public.email_unsub_tokens where lower(email) = v_email;
    delete from public.email_intents where lower(email) = v_email;
    delete from public.email_cooldowns where email_hash = md5(v_email);
    delete from public.mail_cooldowns where position(md5(v_email) in target_key) > 0;
    delete from public.contact_reports where lower(email) = v_email;
  end loop;


  -- 460: ogólny przebieg po kluczach obcych do kont -- to, co przy usuwaniu
  -- konta zrobiłaby kaskada (ON DELETE CASCADE / SET NULL), tutaj jawnie,
  -- żeby czyszczenie bez usuwania profilu (e2e_reset_identity) było pełne.
  -- Nowa tabela z kluczem do profiles/auth.users jest objęta automatycznie.
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, c.confdeltype as act
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.conrelid not in ('public.profiles'::regclass,
                             'public.reserved_username_accounts'::regclass,
                             'public.stats_excluded_users'::regclass,
                             'public.e2e_identities'::regclass)
      and c.confdeltype in ('c', 'n')
    order by c.conrelid::regclass::text, a.attname
  loop
    if fk.act = 'c' then
      execute format('delete from %s where %I = $1', fk.tbl, fk.col) using p_user_id;
    else
      execute format('update %s set %I = null where %I = $1', fk.tbl, fk.col, fk.col) using p_user_id;
    end if;
  end loop;
end;
$$;
REVOKE ALL ON FUNCTION public._delete_user_data(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_user_everything(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  perform public._delete_user_data(p_user_id);
  -- profile first (also cascades by FK from auth.users if still present)
  delete from public.profiles where id = p_user_id;
  -- final auth user hard delete
  delete from auth.users where id = p_user_id;
end;
$$;

-- Dane związane wyłącznie z adresem (odbiorca bez konta, stary adres).
CREATE FUNCTION public._e2e_reset_email(p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v text := lower(btrim(p_email));
begin
  delete from public.shared_devices where lower(trim(recipient_email)) = v;
  delete from public.control_device_shares where lower(trim(recipient_email)) = v;
  delete from public.friendships where lower(trim(requested_email)) = v;
  delete from public.poll_subscriptions where lower(subscriber_email) = v;
  delete from public.poll_tasks where lower(recipient_email) = v;
  delete from public.base_share_tasks where lower(recipient_email) = v;
  delete from public.mail_queue where lower(trim(to_email)) = v;
  delete from public.mail_notification_allocations where lower(trim(to_email)) = v;
  delete from public.mail_function_logs where lower(recipient_email) = v;
  delete from public.mail_center_links where lower(email) = v;
  delete from public.email_unsub_tokens where lower(email) = v;
  delete from public.email_intents where lower(email) = v;
  delete from public.email_cooldowns where email_hash = md5(v);
  delete from public.mail_cooldowns where position(md5(v) in target_key) > 0;
  delete from public.e2e_emails where recipient = v;
end;
$$;
REVOKE ALL ON FUNCTION public._e2e_reset_email(text) FROM PUBLIC, anon, authenticated;

-- 3. Czyszczenie tożsamości (rzuca błąd, gdy po czyszczeniu zostają dane) ----
CREATE FUNCTION public.e2e_reset_identity(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  i public.e2e_identities;
  fk record;
  n bigint;
begin
  select * into i from public.e2e_identities where name = p_name;
  if not found then raise exception 'e2e_reset: unknown %', p_name; end if;
  if i.role = 'resource' then return; end if;

  if i.role = 'dedicated' then
    -- dane zostają; tylko blokady, sesje Control, cooldowny i skrzynka
    if i.user_id is not null then
      delete from public.edit_locks where holder_user_id = i.user_id;
      delete from public.control_runtime_sessions where owner_id = i.user_id;
      delete from public.mail_cooldowns where position(i.user_id::text in target_key) > 0;
      delete from public.user_cooldowns where user_id = i.user_id;
    end if;
    delete from public.e2e_emails where recipient = i.email;
    return;
  end if;

  if i.role in ('standard','disposable') and i.user_id is not null then
    delete from public.market_games where author_user_id = i.user_id;
    perform public._delete_user_data(i.user_id);
    -- sprawdzenie: żadnych wierszy w tabelach z kluczem do konta
    for fk in
      select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1
        and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
        and c.conrelid not in ('public.profiles'::regclass,
                               'public.reserved_username_accounts'::regclass,
                               'public.stats_excluded_users'::regclass,
                               'public.e2e_identities'::regclass)
    loop
      execute format('select count(*) from %s where %I = $1', fk.tbl, fk.col) into n using i.user_id;
      if n > 0 then
        raise exception 'e2e_reset: % rows left in %.%', n, fk.tbl, fk.col;
      end if;
    end loop;
    if exists (select 1 from public.edit_locks where holder_user_id = i.user_id) then
      raise exception 'e2e_reset: edit_locks left';
    end if;
    -- konto zostaje: zwykłe flagi wracają (jak przy założeniu konta)
    insert into public.user_flags(user_id) values (i.user_id) on conflict (user_id) do nothing;
  end if;

  perform public._e2e_reset_email(i.email);
  if i.role = 'disposable' then
    perform public._e2e_reset_email(replace(i.email, '@', '.new@'));
  end if;
end;
$$;

-- 4. Wypożyczanie -------------------------------------------------------------
-- p_needs: {"standard":2,"noaccount":1,"disposable":0,"dedicated":["e20-gallery"],"resources":["mail"]}
-- Wynik: {"ok":true,"identities":[...]} albo {"ok":false,"error":"busy"|..., "holders":[...]}.
-- Komplet albo nic. Czyszczenie dopiero po zebraniu kompletu (busy nie czyści
-- kont na próżno); konto, którego nie da się wyczyścić -> kwarantanna i
-- następne wolne.
CREATE FUNCTION public.e2e_lease(p_run_id text, p_worker text, p_needs jsonb,
                                 p_ttl_seconds integer DEFAULT 1200, p_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_role text;
  v_need int;
  v_kind text;
  v_name text;
  v_picked text[] := array[]::text[];
  v_role_picked text[];
  v_err text;
  v_ok boolean;
begin
  if coalesce(btrim(p_run_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'run_id_required');
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 7200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ttl');
  end if;
  delete from public.e2e_leases where expires_at < now();

  -- tanie sprawdzenie dostępności, zanim cokolwiek zostanie wyczyszczone
  foreach v_role in array array['standard','noaccount','disposable'] loop
    v_need := coalesce((p_needs->>v_role)::int, 0);
    if v_need < 0 or v_need > 50 then
      return jsonb_build_object('ok', false, 'error', 'invalid_need', 'role', v_role);
    end if;
    if v_need > (select count(*) from public.e2e_identities i
                 where i.role = v_role and i.quarantined_at is null
                   and not exists (select 1 from public.e2e_leases l where l.name = i.name)) then
      return jsonb_build_object('ok', false, 'error', 'busy', 'role', v_role,
                                'holders', public.e2e_lease_holders());
    end if;
  end loop;
  for v_kind in select jsonb_array_elements_text(coalesce(p_needs->'resources', '[]'::jsonb)) loop
    if not exists (select 1 from public.e2e_identities i where i.role = 'resource' and i.purpose = v_kind
                   and not exists (select 1 from public.e2e_leases l where l.name = i.name)) then
      return jsonb_build_object('ok', false, 'error',
        case when exists (select 1 from public.e2e_identities where role = 'resource' and purpose = v_kind)
             then 'busy' else 'unknown_resource' end,
        'resource', v_kind, 'holders', public.e2e_lease_holders());
    end if;
  end loop;

  -- konta wymienne
  foreach v_role in array array['standard','noaccount','disposable'] loop
    v_need := coalesce((p_needs->>v_role)::int, 0);
    v_role_picked := array[]::text[];
    while coalesce(array_length(v_role_picked, 1), 0) < v_need loop
      select i.name into v_name from public.e2e_identities i
      where i.role = v_role and i.quarantined_at is null
        and not exists (select 1 from public.e2e_leases l where l.name = i.name)
        and i.name <> all(v_picked || v_role_picked)
      order by i.last_leased_at nulls first, i.name
      limit 1 for update skip locked;
      if v_name is null then
        return jsonb_build_object('ok', false, 'error', 'busy', 'role', v_role,
                                  'holders', public.e2e_lease_holders());
      end if;
      v_ok := true;
      begin
        perform public.e2e_reset_identity(v_name);
      exception when others then
        get stacked diagnostics v_err = message_text;
        v_ok := false;
      end;
      if v_ok then
        v_role_picked := v_role_picked || v_name;
      else
        update public.e2e_identities set quarantined_at = now(), quarantine_reason = left(v_err, 500)
         where name = v_name;
        v_picked := v_picked || v_name;  -- nie wybierać ponownie w tym wywołaniu
      end if;
      v_name := null;
    end loop;
    v_picked := v_picked || v_role_picked;
  end loop;
  -- odsiać kwarantannowane z listy wybranych
  v_picked := array(select x from unnest(v_picked) x
                    where exists (select 1 from public.e2e_identities i where i.name = x and i.quarantined_at is null));

  -- konta przypisane do czynności
  for v_kind in select jsonb_array_elements_text(
      case jsonb_typeof(p_needs->'dedicated') when 'array' then p_needs->'dedicated'
           when 'string' then jsonb_build_array(p_needs->'dedicated') else '[]'::jsonb end) loop
    select i.name into v_name from public.e2e_identities i
     where i.role = 'dedicated' and i.purpose = v_kind;
    if v_name is null then
      return jsonb_build_object('ok', false, 'error', 'dedicated_unassigned', 'purpose', v_kind);
    end if;
    if exists (select 1 from public.e2e_identities where name = v_name and quarantined_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'quarantined', 'name', v_name);
    end if;
    perform 1 from public.e2e_identities where name = v_name for update skip locked;
    if not found or exists (select 1 from public.e2e_leases where name = v_name) then
      return jsonb_build_object('ok', false, 'error', 'busy', 'purpose', v_kind,
                                'holders', public.e2e_lease_holders());
    end if;
    begin
      perform public.e2e_reset_identity(v_name);
    exception when others then
      get stacked diagnostics v_err = message_text;
      update public.e2e_identities set quarantined_at = now(), quarantine_reason = left(v_err, 500)
       where name = v_name;
      return jsonb_build_object('ok', false, 'error', 'quarantined', 'name', v_name, 'reason', v_err);
    end;
    v_picked := v_picked || v_name;
    v_name := null;
  end loop;

  -- zasoby wspólne
  for v_kind in select jsonb_array_elements_text(coalesce(p_needs->'resources', '[]'::jsonb)) loop
    select i.name into v_name from public.e2e_identities i
     where i.role = 'resource' and i.purpose = v_kind
       and not exists (select 1 from public.e2e_leases l where l.name = i.name)
       and i.name <> all(v_picked)
     order by i.name limit 1 for update skip locked;
    if v_name is null then
      if not exists (select 1 from public.e2e_identities where role = 'resource' and purpose = v_kind) then
        return jsonb_build_object('ok', false, 'error', 'unknown_resource', 'resource', v_kind);
      end if;
      return jsonb_build_object('ok', false, 'error', 'busy', 'resource', v_kind,
                                'holders', public.e2e_lease_holders());
    end if;
    v_picked := v_picked || v_name;
    v_name := null;
  end loop;

  insert into public.e2e_leases(name, run_id, worker, label, expires_at)
  select x, p_run_id, coalesce(p_worker, ''), p_label, now() + make_interval(secs => p_ttl_seconds)
  from unnest(v_picked) x;
  update public.e2e_identities set last_leased_at = now() where name = any(v_picked);

  return jsonb_build_object('ok', true, 'identities', coalesce((
    select jsonb_agg(jsonb_build_object('name', i.name, 'role', i.role, 'email', i.email,
                     'user_id', i.user_id, 'purpose', i.purpose) order by i.role, i.name)
    from public.e2e_identities i where i.name = any(v_picked)), '[]'::jsonb));
end;
$$;

CREATE FUNCTION public.e2e_lease_holders() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', run_id, 'label', label, 'count', cnt,
         'since', since, 'expires_at', exp) ORDER BY since), '[]'::jsonb)
  FROM (SELECT run_id, max(label) AS label, count(*) AS cnt, min(leased_at) AS since, max(expires_at) AS exp
        FROM public.e2e_leases WHERE expires_at >= now() GROUP BY run_id) x;
$$;

CREATE FUNCTION public.e2e_lease_renew(p_run_id text, p_ttl_seconds integer DEFAULT 1200) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE public.e2e_leases SET expires_at = now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 7200))
             WHERE run_id = p_run_id AND expires_at >= now() RETURNING 1)
  SELECT count(*)::int FROM u;
$$;

CREATE FUNCTION public.e2e_lease_release(p_run_id text, p_worker text DEFAULT NULL) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.e2e_leases WHERE run_id = p_run_id
             AND (p_worker IS NULL OR worker = p_worker) RETURNING 1)
  SELECT count(*)::int FROM d;
$$;

-- Czy adres należy do tożsamości wypożyczonej przez ten przebieg (dostęp do skrzynki).
CREATE FUNCTION public.e2e_lease_owns(p_run_id text, p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.e2e_leases l JOIN public.e2e_identity(p_email) i ON i.name = l.name
                 WHERE l.run_id = p_run_id AND l.expires_at >= now());
$$;

-- Przypięcie konta Auth do tożsamości (Worker po założeniu konta).
CREATE FUNCTION public.e2e_identity_bind(p_name text, p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  update public.e2e_identities set user_id = p_user_id
   where name = p_name and role in ('standard','disposable','dedicated');
  if not found then raise exception 'e2e_identity_bind: % is not an account identity', p_name; end if;
end;
$$;

-- Ponowna próba dla konta w kwarantannie (po poprawce czyszczenia).
CREATE FUNCTION public.e2e_quarantine_retry(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_err text;
begin
  begin
    perform public.e2e_reset_identity(p_name);
  exception when others then
    get stacked diagnostics v_err = message_text;
    update public.e2e_identities set quarantine_reason = left(v_err, 500) where name = p_name;
    return jsonb_build_object('ok', false, 'error', v_err);
  end;
  update public.e2e_identities set quarantined_at = null, quarantine_reason = null where name = p_name;
  return jsonb_build_object('ok', true);
end;
$$;

REVOKE ALL ON FUNCTION public.e2e_identity(text), public.e2e_reset_identity(text),
  public.e2e_lease(text, text, jsonb, integer, text), public.e2e_lease_holders(),
  public.e2e_lease_renew(text, integer), public.e2e_lease_release(text, text),
  public.e2e_lease_owns(text, text), public.e2e_identity_bind(text, uuid),
  public.e2e_quarantine_retry(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_identity(text), public.e2e_reset_identity(text),
  public.e2e_lease(text, text, jsonb, integer, text), public.e2e_lease_holders(),
  public.e2e_lease_renew(text, integer), public.e2e_lease_release(text, text),
  public.e2e_lease_owns(text, text), public.e2e_identity_bind(text, uuid),
  public.e2e_quarantine_retry(text)
  TO service_role;

-- 5. Nazwy e2e.* tylko dla tożsamości; bez konta na adresach noaccount -------
INSERT INTO public.reserved_username_prefixes(prefix, kind) VALUES ('e2e', 'test')
ON CONFLICT (prefix) DO NOTHING;

CREATE OR REPLACE FUNCTION public.profiles_reserve_test_username() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $_$
DECLARE reason text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN RETURN NEW; END IF;
 reason:=public.reserved_username_reason(NEW.username);
 IF reason IS NULL THEN RETURN NEW; END IF;
 IF reason='test' AND btrim(NEW.username) ~* '^test[0-9]+$' AND EXISTS (
 SELECT 1 FROM auth.users u WHERE u.id=NEW.id
 AND lower(u.email)=lower(btrim(NEW.username))||'@familiada.online'
 ) THEN RETURN NEW; END IF;
 -- 460: e2e.<role><NN> tylko dla konta o adresie tej tożsamości
 IF reason='test' AND EXISTS (
 SELECT 1 FROM public.e2e_identities i JOIN auth.users u ON u.id=NEW.id
 WHERE i.name=lower(btrim(NEW.username)) AND i.role IN ('standard','disposable','dedicated')
 AND lower(u.email) IN (i.email, replace(i.email,'@','.new@'))
 ) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.reserved_username_accounts a WHERE a.user_id=NEW.id AND a.username=lower(btrim(NEW.username))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'username unavailable' USING ERRCODE='23505';
 RETURN NEW;
END $_$;

CREATE FUNCTION public.profiles_block_noaccount_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS NOT NULL AND lower(btrim(NEW.email)) ~ '^e2e\+' AND NOT EXISTS (
    SELECT 1 FROM public.e2e_identities i
    WHERE i.role IN ('standard','disposable','dedicated') AND lower(btrim(NEW.email)) = i.email
  ) THEN
    RAISE EXCEPTION 'e2e address without account identity: %', NEW.email USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_block_noaccount_identity BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_block_noaccount_identity();

-- 6. Skrzynka testowa przyjmuje adresy e2e+ -----------------------------------
ALTER TABLE public.e2e_emails DROP CONSTRAINT e2e_emails_recipient_check;
ALTER TABLE public.e2e_emails ADD CONSTRAINT e2e_emails_recipient_check
  CHECK (recipient ~ '^test([1-9]|1[0-5]|17)@familiada\.online$'
      OR recipient ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$');

-- 7. Automatyczne wykluczenie: oznaczenie roli od Workera albo tożsamość e2e --
CREATE OR REPLACE VIEW public.stats_exclusions_effective AS
 SELECT DISTINCT ON (user_id) user_id, added_at, reason FROM (
 SELECT user_id, added_at, 'manual'::text AS reason, 2 AS priority FROM public.stats_excluded_users
 UNION ALL
 SELECT p.id, p.created_at,
 CASE
   WHEN coalesce(u.raw_app_meta_data->>'is_test_guest','false')='true' THEN 'test_guest'
   WHEN i.role IS NOT NULL THEN 'test:' || i.role
   WHEN u.raw_app_meta_data->>'e2e_role' IS NOT NULL THEN 'test:' || (u.raw_app_meta_data->>'e2e_role')
   ELSE 'test_account'
 END, 1
 FROM public.profiles p
 JOIN auth.users u ON u.id = p.id
 LEFT JOIN public.e2e_identities i ON i.user_id = u.id
 WHERE lower(u.email) ~ '^test[0-9]+@familiada[.]online$'
    OR coalesce(u.raw_app_meta_data->>'is_test_guest','false')='true'
    OR u.raw_app_meta_data->>'e2e_role' IS NOT NULL
    OR i.user_id IS NOT NULL
 ) x ORDER BY user_id, priority;
REVOKE ALL ON public.stats_exclusions_effective FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stats_exclusions_effective TO service_role;

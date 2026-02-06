# Familiada — audyt i porządki w schemacie (Polls / Subskrypcje / Zadania)

> **Cel:** uporządkować DB (tabele + RPC), usunąć legacy/duplikaty, oraz spisać **jedno źródło prawdy** pod nowy front “Centrum sondaży (polls-hub)” zgodny z wytycznymi (UI jak w Builderze).  
> **Język UI:** wszystko co widzi użytkownik **po polsku** ✅

Data: 2026-02-06

---

## 0) Słownik pojęć (żeby mówić jednym językiem)

- **Sondaż otwarty** = stan “jak dotychczas”: można głosować anonimowo (przez `share_key_poll`) i/lub zadań (tokeny). Otwieranie/zamykanie **wyłącznie w `polls`**.
- **Udostępnienie (zadania)** = osobna logika. Sondaż może być otwarty i jednocześnie udostępniany subskrybentom jako zadania.
- **Subskrypcja** = relacja “ja obserwuję Ciebie / Ty obserwujesz mnie” do wysyłania zaproszeń do zadań.
- **Tokeny “go”**:
  - `poll_go.html?s=<token>` → token subskrypcji
  - `poll_go.html?t=<token>` → token zadania (głosowanie w konkretnym sondażu)

---

## 1) Stan bieżący: kluczowe tabele (obecna baza)

### 1.1 `profiles`
- `id uuid` ( = `auth.users.id`)
- `email text`
- `username text` (unikalny; **niezmienialny** w UI)

**W UI:** w auth-bar pokazujemy **username** (fallback: email).

### 1.2 `poll_subscriptions`
Model “moje suby / suby do mnie”. Kluczowe pola:
- `id uuid`
- `owner_id uuid` → `auth.users(id)` ✅
- dokładnie jeden odbiorca: `subscriber_user_id uuid` **albo** `subscriber_email text` (CHECK `poll_subscriptions_one_subscriber_chk`) ✅
- `token uuid` (link “go”)
- `status text` ∈ `pending | active | declined | cancelled`
- daty: `opened_at, accepted_at, declined_at, cancelled_at`
- (w schemacie występują pola do maili: `email_sent_at`, `email_send_count` — używamy do logiki „wysłane tylko raz”)

**Ważne:** `poll_claim_email_records()` już mapuje rekordy email → user (po loginie).

### 1.3 `poll_tasks`
Zadania do zagłosowania:
- `owner_id uuid` → `auth.users(id)` ✅ (już poprawione)
- `recipient_user_id uuid` → `auth.users(id)` ✅ (już poprawione)
- dokładnie jeden odbiorca: `recipient_user_id` **albo** `recipient_email` (CHECK `poll_tasks_one_recipient_chk`) ✅
- `game_id uuid` → `games(id)` ✅
- `poll_type text` ∈ `poll_text | poll_points`
- `share_key_poll text` (żeby głosować)
- `token uuid` (link “go”)
- `status text` ∈ `pending | opened | done | declined | cancelled` (plus daty `opened_at/done_at/declined_at/cancelled_at`)
- (w schemacie są pola do maili: `email_sent_at`, `email_send_count` — potrzebne do “wysyłamy raz”)

### 1.4 `poll_go_resolve(token)` ✅
To jest **właściwa** funkcja rozpoznająca token:
- zwraca `kind = task | sub | none`
- dla task daje `poll_type`, `game_id`, `status`, `token`
- dla sub daje `status`, `token`

➡️ To jest fundament dla `poll-go.html` (tryby opisane w Twoich wytycznych).

---

## 2) Największy chaos (do posprzątania)

### 2.1 Duplikaty / przeciążenia RPC (potwierdzone)

- `poll_text_submit` → **2 warianty** (różnią się argumentami)
- `poll_vote` → **2 warianty** (różne args + różne return)
- `polls_hub_share_poll` → **2 warianty** (jeden dotyka `poll_share_mode`, którego już NIE chcemy)
- „bramki akcji” nakładają się:
  - `poll_action(kind, token, action)`
  - `polls_action(kind, token, action)`
  - `polls_sub_action(action, token?, id?)` ✅ (najlepszy kandydat na jedyną bramkę subskrypcji)

### 2.2 Legacy tabele i legacy RPC

W DB istnieją jeszcze **stary system subów**:
- tabele: `subscriptions`, `subscription_invites`
- funkcje: `resolve_token(uuid)`, `sub_invite_accept/reject`, `subscribe_by_email`, `claim_my_email_records`

To jest **inna ścieżka niż poll_subscriptions/poll_go_resolve** i wprowadza konflikty (np. `poll_action/polls_action` odwołują się do `sub_invite_*`).

➡️ Decyzja: **wywalamy legacy** (tabele + RPC), ale robimy to bezpiecznie: najpierw kontrolne SELECT-y, potem DROP-y.

---

## 3) Docelowa architektura RPC (po sprzątaniu)

### 3.1 Jedno „centrum tokenów” (go)

Zostaje:
- `poll_go_resolve(token)` ✅ (rozpoznanie tokenu)
- `poll_go_task_action(token, action, email?)` ✅ (task: opened/done/decline)
- `poll_go_subscribe_email(token, email)` ✅ (sub dla niezalogowanych: dopina email i aktywuje)
- `poll_go_sub_decline(token)` ✅ (sub decline)

Dla zalogowanych subów:
- **zostaje** `polls_sub_action(action, token?, id?)` ✅ — obsługuje `accept/reject` po tokenie oraz `cancel/remove` po id.

### 3.2 Jedna „bramka akcji z maila” (opcjonalnie)

Możemy zostawić **tylko jedną** funkcję:
- `poll_action(kind, token, action)` jako wrapper:
  - `kind='task'` → deleguje do `poll_go_task_action(token, action)`
  - `kind='sub'` → deleguje do `polls_sub_action(action, token := token)`

A wtedy **kasujemy** `polls_action` (duplikat).

---

## 4) Zmiany w DB pod Twoje wytyczne (bez zmiany logiki open/close)

### 4.1 Otwieranie/zamykanie tylko w `polls`
- `poll_open(...)` i `poll_close_*` zostają jak są (to jest Twoja „stara logika”).
- `polls-hub` ma tylko:
  - listy
  - “udostępnij” (tworzy/anuluje zadania)
  - “szczegóły” (kto głosował; ile anonimowych)

### 4.2 „Udostępniony” vs „Otwarty”
- **Otwarty**: `games.status = poll_open` (Twoja dotychczasowa logika)
- **Udostępniony**: istnieją rekordy `poll_tasks` dla `game_id` w stanie `pending/opened/done` (zależnie od odbiorców)

Nie potrzebujemy `poll_share_mode (anon/subs/mixed)` — usuwamy kolumny i RPC, które to ustawiają.

### 4.3 Mail “wysyłamy raz”
W DB już masz pola (`email_sent_at`, `email_send_count`) na:
- `poll_subscriptions` (sub invite)
- `poll_tasks` (invite do głosowania)

Zasada:
- wysyłamy email **tylko jeśli** `email_sent_at is null`
- jeśli użytkownik został usunięty z udostępnienia i ponownie dodany → email może pójść ponownie (bo powstaje nowy task albo resetujemy email_sent_at celowo).

---

## 5) Minimalny plan prac (kolejność)

1) **Sprzątamy legacy** (tabele `subscriptions/subscription_invites` + funkcje `resolve_token/sub_invite_*` itd.).  
2) **Ujednolicamy bramki**:
   - `poll_action` aktualizujemy, by nie dotykał legacy (`sub_invite_*`)
   - kasujemy `polls_action`  
3) **Ujednolicamy `polls_hub_share_poll`**:
   - usuwamy wariant z `poll_share_mode`
   - zostawiamy tylko 1 funkcję: `polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[]) returns jsonb`
4) Dopiero potem: nowy front polls-hub (UI jak builder, 2 karty / 4 karty mobile).

---

## 6) SQL — “porządki” (bezpieczny skrypt)

> Uruchamiaj po kolei. Skrypt jest defensywny (`IF EXISTS`).  
> Najpierw wykonaj sekcję **6.1 CHECK**, zobacz wyniki, dopiero potem DROP.

### 6.1 CHECK (czy legacy jest używane / czy są dane)

```sql
-- Czy są rekordy w legacy tabelach?
select 'subscriptions' as t, count(*) from public.subscriptions
union all
select 'subscription_invites' as t, count(*) from public.subscription_invites;

-- Czy jakiekolwiek zależności w funkcjach/triggerach odwołują się do legacy?
-- (w UI supabase: wyszukaj w schema.sql albo w pg_proc source)
```

### 6.2 DROP legacy tabele + funkcje

```sql
-- 1) legacy funkcje (stare suby)
drop function if exists public.resolve_token(uuid);
drop function if exists public.sub_invite_accept(uuid);
drop function if exists public.sub_invite_reject(uuid);
drop function if exists public.subscribe_by_email(text, text);
drop function if exists public.claim_my_email_records();

-- 2) legacy tabele
drop table if exists public.subscription_invites cascade;
drop table if exists public.subscriptions cascade;
```

### 6.3 Ujednolicenie „bramek akcji” (kasujemy duplikat)

```sql
drop function if exists public.polls_action(text, uuid, text);
```

### 6.4 Naprawa `poll_action` (żeby nie dotykał legacy)

> Tu wklejasz **nową definicję** `poll_action` (poniżej).

```sql
create or replace function public.poll_action(p_kind text, p_token uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if p_kind = 'task' then
    -- delegujemy do istniejącej logiki tasków
    perform public.poll_go_task_action(p_token, p_action);
    return jsonb_build_object('ok', true, 'kind', 'task', 'action', p_action);
  end if;

  if p_kind = 'sub' then
    -- delegujemy do nowej bramki subów (token)
    return public.polls_sub_action(p_action, p_token, null);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown kind');
end;
$$;
```

### 6.5 Ujednolicenie `polls_hub_share_poll` (1 wariant, bez poll_share_mode)

```sql
-- usuń oba warianty (różne sygnatury)
drop function if exists public.polls_hub_share_poll(uuid, text, uuid[]);
drop function if exists public.polls_hub_share_poll(uuid, text[], boolean);

-- nowy, jedyny wariant
create or replace function public.polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_share_key text;
  v_created int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_mail jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  -- tylko właściciel gry
  select g.type::text, g.share_key_poll
    into v_poll_type, v_share_key
  from public.games g
  where g.id = p_game_id and g.owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'game not found');
  end if;

  if v_poll_type not in ('poll_text','poll_points') then
    return jsonb_build_object('ok', false, 'error', 'not a poll game');
  end if;

  -- 1) anuluj aktywne zadania dla osób, których nie ma już w wyborze
  update public.poll_tasks t
  set status = 'cancelled',
      cancelled_at = now()
  where t.owner_id = v_uid
    and t.game_id = p_game_id
    and t.status in ('pending','opened')
    and (
      (t.recipient_user_id is not null and not exists (
        select 1
        from public.poll_subscriptions s
        where s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
          and s.owner_id = v_uid
          and s.status = 'active'
          and s.subscriber_user_id = t.recipient_user_id
      ))
      or
      (t.recipient_user_id is null and t.recipient_email is not null and not exists (
        select 1
        from public.poll_subscriptions s
        where s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
          and s.owner_id = v_uid
          and s.status = 'active'
          and s.subscriber_email is not null
          and lower(s.subscriber_email) = lower(t.recipient_email)
      ))
    );

  get diagnostics v_cancelled = row_count;

  -- 2) utwórz brakujące zadania dla wybranych subów
  with sel as (
    select
      s.id as sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) as subscriber_email
    from public.poll_subscriptions s
    where s.owner_id = v_uid
      and s.status = 'active'
      and s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
  ),
  existing as (
    select
      sel.sub_id,
      t.id as task_id
    from sel
    left join public.poll_tasks t
      on t.owner_id = v_uid
     and t.game_id = p_game_id
     and t.status in ('pending','opened','done')
     and (
        (sel.subscriber_user_id is not null and t.recipient_user_id = sel.subscriber_user_id)
        or
        (sel.subscriber_user_id is null and sel.subscriber_email is not null and lower(t.recipient_email) = sel.subscriber_email)
     )
  ),
  ins as (
    insert into public.poll_tasks(
      owner_id, recipient_user_id, recipient_email,
      game_id, poll_type, share_key_poll, token, status, created_at
    )
    select
      v_uid,
      e.subscriber_user_id,
      e.subscriber_email,
      p_game_id,
      v_poll_type,
      v_share_key,
      gen_random_uuid(),
      'pending',
      now()
    from (
      select sel.*
      from sel
      join existing ex on ex.sub_id = sel.sub_id
      where ex.task_id is null
    ) e
    returning id, recipient_email, token
  )
  select
    (select count(*) from ins)::int,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'task_id', id,
          'to', recipient_email,
          'token', token,
          'link', ('poll_go.html?t=' || token::text)
        )
      ) filter (where recipient_email is not null),
      '[]'::jsonb
    )
  into v_created, v_mail
  from ins;

  v_kept := greatest(coalesce(array_length(p_sub_ids,1),0) - v_created, 0);

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'cancelled', v_cancelled,
    'kept', v_kept,
    'mail', v_mail
  );
end;
$$;
```

---

## 7) Notatka o błędach, które widziałeś

### 7.1 „cannot change return type of existing function”
To normalne w Postgres: jeśli zmieniasz `RETURNS TABLE(...)`, musisz zrobić:
- `DROP FUNCTION nazwa(sygnatura)`
- potem `CREATE OR REPLACE`

### 7.2 `ERROR: 42809: "array_agg" is an aggregate function`
To nie błąd bazy, tylko błąd w **Twoim zapytaniu testowym** (np. próba użycia `array_agg(...)` jak zwykłej funkcji bez `SELECT ... GROUP BY`).  
W Supabase SQL editor czasem pomaga też wyłączyć LIMIT (masz to w komunikacie).

### 7.3 `poll_vote(uuid, text, uuid, uuid, text) does not exist`
W schemacie masz inne sygnatury `poll_vote` (jedna „po ordach”, druga inna).  
W ramach sprzątania ustalimy **jedną kanoniczną** i potem dopasujemy front (poll-text/poll-points) — ale to robimy po hubie.

---

## 8) Co dalej (następny krok po sprzątaniu DB)

Po uruchomieniu SQL z sekcji 6:
- robimy **nowy** `polls-hub.html/css/js` “od zera” na stylach Buildera:
  - topbar jak Builder (`wróć do moje gry`)
  - desktop: 2 karty (Sondaże / Subskrypcje), każda podzielona na 2 listy z własnym scroll
  - mobile: 4 karty (Moje sondaże / Zadania / Moi subskrybenci / Moje subskrypcje)
  - wpisy list: minimum informacji (nazwa + typ `poll_text/poll_points` + małe kontrolki), kolor wpisu = status

---

### Załącznik: “zdania po polsku” (nazwy typów)
- `poll_text` → **Typowy sondaż**
- `poll_points` → **Punktacja**

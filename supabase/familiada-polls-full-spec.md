# Familiada — Specyfikacja funkcjonalna (Polls / Subskrypcje / Zadania) + mapowanie na bazę danych

> **Cel:** Jeden dokument, który jednoznacznie opisuje:  
> 1) **stany** (sondaże, subskrypcje, zadania)  
> 2) **działania** użytkownika i **co dokładnie dzieje się w DB** (tabele/RPC)  
> 3) **interfejs** (polls-hub, poll-go, poll-text, poll-points, polls) zgodnie z Twoimi wytycznymi  
>  
> **Wszystko, co widzi użytkownik: po polsku** ✅  
> **Koncept:** zostaje dotychczasowa logika otwierania/zamykania sondaży, a „udostępnianie” jest osobną logiką.

Data: 2026-02-06

---

## 0) Słownik i skróty

- **owner**: właściciel gry/sondażu (twórca) = `games.owner_id`
- **subscriber**: osoba z listy „Moi subskrybenci” (może dostawać zadania od ownera)
- **subscription**: relacja owner → subscriber (zaproszenie/akceptacja)
- **task**: zadanie „zagłosuj w tym sondażu” wysłane do subscriberów
- **poll open/close**: dotychczasowa logika w `polls` (otwieranie/zamykanie)
- **udostępnienie**: utworzenie zadań (tasków) do głosowania — NIE jest tym samym co „otwarty”

---

## 1) Model danych — „źródło prawdy”

### 1.1 `profiles`
**Cel:** wyświetlanie nazwy użytkownika (username) zamiast emaila w UI.

Kluczowe pola:
- `id uuid` ( = `auth.users.id`)
- `email text`
- `username text` (unikalny; w UI **niezmienialny**)

**UI:** auth-bar pokazuje `username`, fallback `email`.

### 1.2 `games`
Ważne dla hubu:
- `id uuid`
- `owner_id uuid`
- `name text`
- `type game_type` ∈ `poll_text`, `poll_points`, `prepared`, ...
- `share_key_poll text`
- `poll_opened_at`, `poll_closed_at` (jeśli używasz)
- (status gry) — jak masz obecnie w swojej logice

### 1.3 `poll_sessions`
Opisuje pytania w danym sondażu + które są otwarte/zamknięte na poziomie pytań.
- `game_id`
- `question_ord`
- `question_id`
- `is_open bool`
- `closed_at timestamp?`

### 1.4 `poll_votes` / `poll_text_entries`
- `poll_votes` (poll_points): głosy na odpowiedź, powiązane z sesją/pytaniem
- `poll_text_entries` (poll_text): wpisy tekstowe, powiązane z sesją/pytaniem

Ważne: oba mają `voter_token` (anonim / user / task token — zależnie od Twojej implementacji).

### 1.5 `poll_subscriptions`
**Cel:** lista „Moi subskrybenci” oraz „Moje subskrypcje”.

Pola:
- `owner_id uuid` → `auth.users(id)`
- dokładnie jeden odbiorca: `subscriber_user_id uuid` **albo** `subscriber_email text` (CHECK)
- `token uuid` (do linku `poll_go.html?s=...`)
- `status text`: `pending | active | declined | cancelled`
- daty: `opened_at`, `accepted_at`, `declined_at`, `cancelled_at`
- (opcjonalne pola mail): `email_sent_at`, `email_send_count` (jeśli są)

**Interpretacja:**
- `pending`: zaproszenie wysłane, czeka na decyzję
- `active`: zaakceptowane
- `declined`: odrzucone
- `cancelled`: anulowane/usunięte przez ownera lub przez subskrybenta

### 1.6 `poll_tasks`
**Cel:** „Zadania” w hubie (dla odbiorcy) oraz lista „komu udostępniono” (dla ownera).

Pola:
- `owner_id uuid` → `auth.users(id)` ✅
- dokładnie jeden odbiorca: `recipient_user_id uuid` **albo** `recipient_email text` (CHECK)
- `recipient_user_id uuid` → `auth.users(id)` ✅
- `game_id uuid` → `games(id)` (CASCADE)
- `poll_type text`: `poll_text | poll_points`
- `share_key_poll text`
- `token uuid` (do linku `poll_go.html?t=...`)
- `status text`: `pending | opened | done | declined | cancelled`
- daty: `opened_at`, `done_at`, `declined_at`, `cancelled_at`
- (opcjonalne pola mail): `email_sent_at`, `email_send_count`

**Interpretacja:**
- `pending`: zadanie wysłane, jeszcze nie otwarte
- `opened`: odbiorca kliknął link lub wszedł w zadanie
- `done`: oddano głos (albo zakończono w inny sposób)
- `declined`: odbiorca odrzucił
- `cancelled`: owner odwołał (np. odhaczył w udostępnianiu)

---

## 2) Stany (state machines)

### 2.1 Subskrypcja (poll_subscriptions)
**Stany:** `pending → active` lub `pending → declined`, oraz `active → cancelled`, `pending → cancelled`.

**Zdarzenia i DB:**
1) **Owner wysyła zaproszenie** (email lub username)
   - INSERT `poll_subscriptions`:
     - `owner_id = auth.uid()`
     - jeśli znaleziono user: `subscriber_user_id = ...` else `subscriber_email = lower(email)`
     - `status='pending'`, `token=gen_random_uuid()`, `created_at=now()`
   - Jeśli odbiorca jest userem: pojawia się w jego hubie jako „Moje subskrypcje (pending)”
   - Jeśli email-only: wysyłamy maila z linkiem `poll_go.html?s=<token>` (szczegóły w rozdz. 6)

2) **Odbiorca akceptuje**
   - UPDATE `poll_subscriptions`:
     - `status='active'`, `accepted_at=now()`
   - Widoczne w hubie ownera jako „aktywny subskrybent”

3) **Odbiorca odrzuca**
   - UPDATE:
     - `status='declined'`, `declined_at=now()`
   - Po 5 dniach: sprzątanie (cron / manual) — opcjonalne

4) **Owner usuwa/anuluje**
   - UPDATE:
     - `status='cancelled'`, `cancelled_at=now()`

> **Claim po rejestracji:** jeśli ktoś był email-only i założy konto z tym mailem:  
> `poll_claim_email_records()` mapuje `subscriber_email` → `subscriber_user_id`.

---

### 2.2 Zadanie (poll_tasks)
**Stany:** `pending → opened → done` lub `pending/opened → declined`, oraz `pending/opened → cancelled`.

**Zdarzenia i DB:**
1) **Owner „Udostępnij” (wybór subskrybentów)**
   - Wykonujemy RPC: `polls_hub_share_poll(p_game_id, p_sub_ids[])`
   - Efekt:
     - dla zaznaczonych subów: jeśli brak taska → INSERT `poll_tasks` (`status='pending'`)
     - dla odznaczonych: jeśli istnieje aktywny task (`pending/opened`) → UPDATE `status='cancelled'`, `cancelled_at=now()`
   - RPC powinno też zwrócić listę maili do wysłania (`mail[]`) tylko dla tych, którzy mają `recipient_email` i **nie mieli jeszcze** maila wysłanego (patrz rozdz. 6)

2) **Odbiorca otwiera zadanie (klik w hubie / link mail)**
   - RPC: `poll_task_opened(token)` albo `poll_go_task_action(token,'opened')`
   - UPDATE `poll_tasks`:
     - jeśli status `pending` → `opened`, `opened_at=now()`

3) **Odbiorca oddaje głos**
   - Po stronie poll-text/poll-points: po udanym zapisie głosu wpisujemy “done”:
   - RPC: `poll_task_done(token)` albo `poll_go_task_action(token,'done')`
   - UPDATE `poll_tasks`:
     - `status='done'`, `done_at=now()`
   - UI: po głosowaniu redirect do `polls-hub.html` (dla zalogowanych).

4) **Odbiorca odrzuca zadanie**
   - RPC: `poll_task_decline(token)` albo `poll_go_task_action(token,'decline')`
   - UPDATE:
     - `status='declined'`, `declined_at=now()`

5) **Owner odwołuje udostępnienie**
   - UPDATE:
     - `status='cancelled'`, `cancelled_at=now()`

---

### 2.3 Sondaż: otwarcie / zamknięcie (Twoja dotychczasowa logika)
**Zasada:** otwieranie/zamykanie TYLKO przez stronę `polls`.

- **Otwarty**: wynik Twoich warunków `poll_open(...)` (kryteria: komplet gry, min odpowiedzi, itd.)
- **Zamknięty**: `poll_close_*` / `poll_close_and_normalize` / `poll_points_close_and_normalize` itd.

**Dodatkowy warunek zamknięcia (wg wytycznych):**
- jeśli sondaż **nie był udostępniony** (brak aktywnych tasków): można zamknąć, jeśli >10 anonimowych głosów + stare kryteria
- jeśli sondaż był udostępniony: można zamknąć, jeśli wszystkie taski są `done/declined/cancelled` + stare kryteria ilości odpowiedzi

> To jest logika w `polls` (UI + RPC check), nie w hubie.

---

## 3) Strony i UI (w 100% po polsku)

## 3.1 `polls-hub.html` — „Centrum sondaży” (priorytet teraz)
**Topbar:** jak w Builderze
- lewo: przycisk **„← Moje gry”**
- prawo: auth bar (`Nazwa użytkownika`, `Wyloguj`)

### Układ: Desktop
Dwie karty (jak w Builderze, z „wypustką”):
1) **Karta: Sondaże**
   - lewa kolumna: **Moje sondaże**
   - prawa kolumna: **Zadania**

2) **Karta: Subskrypcje**
   - lewa kolumna: **Moi subskrybenci**
   - prawa kolumna: **Moje subskrypcje**

**Ważne:** każda z 4 list ma **scroll wewnętrzny**; karta jako całość nie scrolluje (desktop).

### Układ: Mobile
4 osobne karty (z nagłówkami na górze):
- Moje sondaże
- Zadania
- Moi subskrybenci
- Moje subskrypcje

---

### 3.1.1 Lista: „Moje sondaże”
**Toolbar listy (góra):**
- `Udostępnij / Zmień udostępnienie` (aktywny tylko jeśli sondaż **otwarty**)
- `Szczegóły` (aktywny jeśli sondaż **otwarty lub zamknięty**)
- Sortowanie (rollup): np.
  - Domyślne
  - Najnowsze / Najstarsze
  - Nazwa A–Z / Z–A
  - Typ (Typowy sondaż / Punktacja)
  - Status (Otwarte / Zamknięte / Szkice)
  - „Najbardziej udostępniane” (liczba tasków)
  - „Najwięcej głosów” (anon + sub)
- Przełącznik: **Aktualne / Archiwalne**
  - Archiwalne = zamknięte > 5 dni

**Wpis listy (minimalnie):**
- Nazwa gry
- Typ w nawiasie: **„Typowy sondaż”** lub **„Punktacja”**
- Małe kontrolki po prawej (ikonki):
  - „Otwórz wyniki” (podwójny klik wiersza) — tylko gdy nie jest „szary szkic”
  - „Udostępnianie” (mała ikonka) — info czy istnieją aktywne taski

**Kolor całego wpisu (status sondażu):**
1) **Szary**: szkic niespełniający warunków otwarcia (blokada wejścia)
2) **Czerwony**: szkic spełniający warunki otwarcia (da się otworzyć w `polls`)
3) **Pomarańczowy**: otwarty, ale brak głosów
4) **Żółty**: otwarty i są aktywne taski **lub** są anonimowe głosy
5) **Zielony**: otwarty i:
   - wszystkie taski „domknięte” (done/declined/cancelled) **albo**
   - >= 10 anonimowych głosów
6) **Niebieski**: zamknięty

**Interakcje:**
- Podwójny klik wiersza: otwiera `polls.html?id=<game_id>` (wyniki/zarządzanie open/close)  
  (dla „szarych szkiców” — blokada + komunikat „Dokończ tworzenie gry w Moje gry”).

**Dane z DB:**
- RPC listy: `polls_hub_list_polls()` (lub docelowo nowa wersja zgodna z kolorami)
- Do kolorów potrzebujemy per gra:
  - czy jest otwarta / zamknięta (z `poll_sessions` / `games.poll_closed_at`)
  - liczba anonim głosów (z `poll_votes`/`poll_text_entries` gdzie voter_token nie jest task-user?) — definicja do ustalenia w DB
  - liczba tasków + stan tasków (z `poll_tasks`)

---

### 3.1.2 Modal: „Udostępnij / Zmień udostępnienie” (tylko dla otwartych)
- slider/zakładki u góry (UI jak Builder):
  - **Anonimowy** (tylko informacyjnie: link/QR) — *bez zmiany logiki open/close*
  - **Subskrybenci** (wybór osób → tworzy taski)
  - **Mieszany** (informacyjnie: pokazuje oba)  
  > Uwaga: w DB nie trzymamy `poll_share_mode`; w modalach to jest tylko UX.

**Subskrybenci:**
- lista checkboxów z „Moi subskrybenci” (status=active)
- przycisk „Zapisz udostępnienie” → RPC `polls_hub_share_poll(game_id, sub_ids[])`
- w wierszu subskrybenta pokazujemy mini-status:
  - `•` pending/opened/done/declined/cancelled dla taska (jeśli istnieje)
- dodatkowo opcja: „Odwołaj wszystkie” (ustawia wszystkie aktywne taski na cancelled)

**Mail:**
- po zapisaniu RPC zwraca `mail[]` (do wysłania) → front odpala Edge Function mailową i potem aktualizuje `email_sent_at` w `poll_tasks`.

---

### 3.1.3 Modal: „Szczegóły głosowania”
Dostępny dla otwartych i zamkniętych.

Pokazuje:
- liczba anonimowych głosów
- lista głosujących subskrybentów (username/email) + ewentualnie „X usuń głos użytkownika” (jeśli masz to już w DB / do dopisania)
- opcjonalnie: lista `voter_token` powiązana z user/task (żeby móc usuwać)

DB:
- docelowo RPC `poll_results(game_id)` albo dedykowane `poll_admin_preview(game_id)` — zależnie co masz w schema.sql
- usuwanie głosu: wymaga RPC (nie direct delete) żeby zachować spójność.

---

### 3.1.4 Lista: „Zadania” (dla mnie jako odbiorcy)
Toolbar:
- sortowanie (jak wyżej)
- Aktualne / Archiwalne (done > 5 dni → archiwum)

Wpis:
- nazwa (albo nazwa gry — docelowo z `games.name`, nie `Sondaż <id>`)
- typ: „Typowy sondaż” / „Punktacja”
- kolor:
  - **Zielony**: zadanie dostępne (`pending/opened`)
  - **Niebieski**: wykonane (`done`)
- ikonka `X` (odrzuć) dla zielonych

Interakcje:
- podwójny klik: otwiera `poll_text.html?...` lub `poll_points.html?...` (przez `poll_go.html?t=token` albo bezpośrednio)
- odrzuć: RPC `polls_hub_task_decline(task_id)` lub `poll_task_decline(token)`

DB:
- lista: `polls_hub_list_tasks()`
- odrzucenie: `polls_hub_task_decline` / `poll_task_decline`

---

### 3.1.5 Lista: „Moi subskrybenci”
Toolbar:
- przycisk „Dodaj” → modal
- sortowanie
- lista scroll

Wpis:
- label: username/email
- kolor:
  - **Żółty**: `pending`
  - **Zielony**: `active`
  - **Czerwony**: `declined/cancelled`
- przyciski:
  - `X`: anuluj/usuń (pending/declined/cancelled) lub usuń aktywnego
  - `↻`: wyślij ponownie (tylko pending)

DB:
- lista: `polls_hub_list_my_subscribers()`
- dodaj: RPC `polls_hub_subscription_invite_a` (docelowo jedna funkcja invite)
- resend: `polls_hub_subscriber_resend(p_id)` (już masz)
- remove: `polls_hub_subscriber_remove(p_id)` (już masz)

Mail:
- pending + email-only → mail `poll_go.html?s=token`
- pending + user → powiadomienie w hubie + mail opcjonalny (wg Twojej decyzji)

---

### 3.1.6 Lista: „Moje subskrypcje” (ja subskrybuję innych)
Toolbar:
- sortowanie
- lista scroll

Wpis:
- label ownera (username/email)
- kolor:
  - **Żółty**: `pending`
  - **Zielony**: `active`
- przyciski:
  - `Akceptuj` (tylko pending)
  - `X`:
    - pending: odrzuć
    - active: anuluj

DB:
- lista: `polls_hub_list_my_subscriptions()`
- akcje: `polls_sub_action(action, token?, id?)`

---

## 3.2 `poll-go.html` — landing z maila (token)
To jest “router”, który w zależności od tokenu i auth robi odpowiednie kroki.

### Wejście
- URL: `poll_go.html?s=<token>` albo `poll_go.html?t=<token>`

### Tryby wg wytycznych

#### 1) Niezalogowany użytkownik
A) token subskrypcji (`s`)
- UI: karta z tekstem:
  - „Zaproszenie do subskrypcji”
  - przyciski: **„Subskrybuj”**, **„Odrzuć”**
  - sugestia: „Masz konto? Zaloguj się” + link do `index.html`
- Akcja „Subskrybuj”:
  - jeśli token dotyczy email-only i wymaga emaila: input email + RPC `poll_go_subscribe_email(token, email)`
- „Odrzuć”:
  - RPC `poll_go_sub_decline(token)`

B) token zadania (`t`)
- UI: „Zaproszenie do głosowania”
  - przyciski: **„Zagłosuj”**, **„Odrzuć”**
  - sugestia rejestracji
- „Zagłosuj”: przekierowanie do `poll_text/poll_points` z parametrami token/share_key (patrz 3.3)
- „Odrzuć”: RPC `poll_go_task_action(token,'decline')`

#### 2) Zalogowany użytkownik
- `poll_go_resolve(token)`
- jeśli session aktywna:
  - sub lub task → przekieruj do `polls-hub.html` (tam użytkownik widzi zaproszenie/zadanie)
- jeśli brak session:
  - redirect do logowania, potem do `polls-hub.html`

#### 3) Niezarejestrowany link wykorzystany
- sub: „Aby zasubskrybować wprowadź adres e-mail” (jeśli token niepowiązany)
- task: „Już wziąłeś udział w głosowaniu” (jeśli task jest `done` lub token zużyty wg Twojej logiki)

DB:
- resolve: `poll_go_resolve(token)`
- sub actions: `poll_go_subscribe_email`, `poll_go_sub_decline`
- task actions: `poll_go_task_action`

---

## 3.3 `poll-text.html` / `poll-points.html`
### Zasada
- Zalogowany: po głosowaniu → **redirect do polls-hub** + oznaczenie task `done`
- Niezalogowany z linka: po głosowaniu → też oznaczenie task `done` (owner widzi), ale użytkownik nie zobaczy w hubie
- Anonimowy „otwarty link”: działa jak dotychczas

### DB po głosowaniu
- poll_points: `poll_vote(...)` / `poll_points_vote_batch(...)` (wg Twojego kanonicznego wariantu)
- poll_text: `poll_text_submit(...)` (kanonicznie raw+norm)
- jeśli było to wejście przez task token:
  - `poll_go_task_action(token,'done')`

---

## 3.4 `polls.html` (wyniki + open/close)
- wyniki zawsze rozwinięte
- przycisk „Zamknij” / „Otwórz” wg Twojej dotychczasowej logiki
- brak QR/linków w tej stronie (przeniesione do hub / modal anon)

Warunki zamknięcia:
- jeśli brak udostępnień (brak aktywnych tasków): min 10 anonimowych głosów + stare kryteria
- jeśli udostępniony: wszystkie taski domknięte + stare kryteria ilości odpowiedzi

DB:
- `poll_open(...)`, `poll_close_and_normalize(...)` / `poll_points_close_and_normalize(...)` itd.

---

## 4) Statusy a kolory w UI (spójny system)

### 4.1 Sondaże (wpisy w „Moje sondaże”)
Kolor = funkcja `poll_state` + `vote/task stats`:
- **Szary**: draft + niespełnia kryteriów otwarcia
- **Czerwony**: draft + spełnia kryteria otwarcia
- **Pomarańczowy**: otwarty + 0 głosów (anon + sub)
- **Żółty**: otwarty + (ma jakiekolwiek głosy albo ma aktywne taski)
- **Zielony**: otwarty + (>=10 anon głosów lub wszystkie taski domknięte)
- **Niebieski**: zamknięty

> Do tego potrzebujesz jednego RPC, który policzy statystyki per game_id (albo rozbudować `polls_hub_list_polls()`).

### 4.2 Zadania
- **Zielony**: `pending/opened`
- **Niebieski**: `done`
- (opcjonalnie czerwony: `declined/cancelled` w archiwum)

### 4.3 Subskrybenci / Subskrypcje
- pending = żółty
- active = zielony
- declined/cancelled = czerwony (w archiwum; po 5 dniach sprzątanie)

---

## 5) Sortowanie i filtrowanie (hub)

Wszystkie 4 listy mają:
- **rollup sortowania** (co najmniej 8 opcji; dokładna lista w UI)
- **przełącznik Aktualne/Archiwalne** (reguła 5 dni)

Dodatkowo (opcjonalnie, ale zalecane):
- filtr: Typ (Typowy sondaż / Punktacja)
- filtr: Statusy (checkboxy)
- wyszukiwarka (text search po nazwie/label)

---

## 6) Maile i powiadomienia (logika “wysyłamy tylko raz”)

### 6.1 Co wysyłamy
1) Zaproszenie do subskrypcji
- do email-only: zawsze email
- do usera: w hubie + email opcjonalnie (Twoja decyzja)

2) Zaproszenie do głosowania (task)
- do email-only: email z `poll_go.html?t=<token>`
- do usera: w hubie + email opcjonalnie

### 6.2 Zasada “tylko raz”
Dla `poll_tasks` i `poll_subscriptions`:
- jeśli `email_sent_at is null` → wysyłamy i ustawiamy `email_sent_at=now()`, `email_send_count += 1`
- jeśli owner odhaczy usuwa i potem ponownie doda:
  - najprościej: powstaje **nowy task** → mail może iść ponownie
  - alternatywa: reset `email_sent_at` ręcznie (nie polecam)

### 6.3 Funkcja Edge (SendGrid)
- Hub wywołuje Edge Function `send-email` (Twoja implementacja)
- Treści maili muszą być **po polsku** i zawierać:
  - tytuł: „Familiada — zaproszenie do subskrypcji” / „Familiada — zaproszenie do głosowania”
  - CTA: „Otwórz zaproszenie” (link do `poll_go.html?...`)

> Treści maili spiszemy osobno jako szablony HTML (nie w tej fazie DB).

---

## 7) Mapowanie działań UI → DB (skrót operacyjny)

### 7.1 polls-hub: listy
- Moje sondaże: `polls_hub_list_polls()` (docelowo rozszerzyć o statystyki)
- Zadania: `polls_hub_list_tasks()`
- Moi subskrybenci: `polls_hub_list_my_subscribers()`
- Moje subskrypcje: `polls_hub_list_my_subscriptions()`

### 7.2 Subskrypcje
- Dodaj subskrybenta (modal): RPC invite (docelowo 1 funkcja)
- Resend: `polls_hub_subscriber_resend(p_id)`
- Remove/cancel: `polls_hub_subscriber_remove(p_id)` / `polls_hub_subscription_cancel(p_id)`
- Accept/reject/cancel: `polls_sub_action(action, token?, id?)`

### 7.3 Udostępnienia
- Zapisz udostępnienie: `polls_hub_share_poll(game_id, sub_ids[])`
- Po RPC: wysyłka maili + update `email_sent_at` w tasks

### 7.4 Zadania
- Odrzuć: `polls_hub_task_decline(task_id)` albo token action
- Otworzono: `poll_task_opened(token)`
- Wykonano: `poll_task_done(token)`

### 7.5 poll-go
- resolve: `poll_go_resolve(token)`
- akcje: `poll_go_task_action`, `poll_go_subscribe_email`, `poll_go_sub_decline`

---

## 8) Uwagi o błędach, które już widziałeś (żeby nie wróciły)

- **„relation public.subscriptions does not exist”**: to znaczy, że tabela legacy już nie istnieje — CHECK w 6.1 powinien używać `to_regclass()` aby nie failować.
- **„cannot change return type of existing function”**: przy zmianie `RETURNS TABLE` trzeba `DROP FUNCTION ...`.
- **RPC duplikaty**: utrzymujemy *jedną kanoniczną ścieżkę* (go_resolve + polls_sub_action + polls_hub_share_poll).

---

## 9) Co jeszcze może wymagać doprecyzowania w DB (na końcu)
To są „potencjalne braki”, ale decyzje są po Twojej stronie:
1) Jak jednoznacznie rozróżniamy „anonimowy głos” vs „głos z taska” (po `voter_token`? po `recipient_user_id`?)
2) Czy owner może usuwać głos konkretnego subskrybenta (wymaga RPC i spójności z wynikami)
3) Sprzątanie archiwum po 5 dniach (cron/job) — czy robimy w DB czy tylko filtr w UI

---

## 10) UI Copy (teksty PL — minimalny zestaw)
- „Centrum sondaży”
- „Moje sondaże”
- „Zadania”
- „Moi subskrybenci”
- „Moje subskrypcje”
- „Udostępnij” / „Zmień udostępnienie”
- „Szczegóły”
- „Aktualne” / „Archiwalne”
- „Dodaj subskrybenta”
- „Wpisz e-mail lub nazwę użytkownika”
- „Wyślij zaproszenie”
- „Wyślij ponownie”
- „Usuń” / „Anuluj” / „Odrzuć” / „Akceptuj”
- Typy:
  - `poll_text` → „Typowy sondaż”
  - `poll_points` → „Punktacja”

# Familiada — Specyfikacja FRONT (Polls Hub + Poll Go + zmiany w Polls/Poll‑Text/Poll‑Points/Builder)
**Wersja:** 2026‑02‑07 (po „ostatniej migracji”)  
**Język UI:** wszystkie teksty widoczne dla użytkownika **po polsku** ✅  
**Kluczowa zasada:** **Udostępnienie = taski (zadania)**. Nie ma „trybów” i **nie ma `poll_share_mode`**.  

---

## 0) Słownik pojęć (konsekwentne nazwy w UI)
- **Typowy sondaż** = `poll_text`
- **Punktacja odpowiedzi** = `poll_points`
- **Sondaż (właściciel)** = gra typu poll_* + jej sesje (otwarta/zamknięta) + ewentualne taski
- **Zadanie** = wpis w `poll_tasks` utworzony dla odbiorcy (udostępnienie)
- **Subskrypcja** = wpis w `poll_subscriptions` (kto kogo subskrybuje) + zaproszenie/akceptacja/odrzucenie

> Uwaga: „Otwarty” i „Udostępniony” to **różne rzeczy**.  
> - **Otwarty**: dostępny do anonimowego głosowania (dotychczasowa logika otwierania/zamykania).  
> - **Udostępniony**: ma wygenerowane taski dla wskazanych osób (osobna logika).  

---

## 1) Kontrakt ogólny: nawigacja i zasady
### 1.1 Wejścia / strony
- `polls-hub.html` — **centrum sondaży** (nowy główny panel)
- `poll-go.html` — „bramka” z tokenem z maila / taska (od zera; opis w rozdz. 5)
- `polls.html?id=<game_id>` — **wyniki + otwieranie/zamykanie** (jak dotychczas, tylko funkcje właściciela)
- `poll-text.html?...` / `poll-points.html?...` — głosowanie (patrz rozdz. 6)

### 1.2 Reguły twarde (backend/UX)
1) **Otwieranie/zamykanie wyłącznie przez `polls.html`** (jak dotychczas).  
2) **Udostępniać (tworzyć taski) można wyłącznie sondaż otwarty**.  
3) Link bezpośredni do `poll-text` / `poll-points` (anonimowy) **zawsze liczymy jako anonimowy**, nawet jeśli użytkownik jest zalogowany.  
4) `cancelled`/`declined` **nie są widoczne u odbiorcy** (w „Zadaniach”).  
5) „Unshare” (odznaczenie osoby w udostępnieniu) = **zadanie znika odbiorcy** (status po stronie DB; UI odbiorcy nie pokazuje).  
6) Ponowne udostępnienie:  
   - jeśli poprzedni task = **done** → tworzymy **nowy** task,  
   - jeśli poprzedni task = **declined/cancelled** → można **reaktywować ten sam** (zależy od RPC, ale efekt w UI ma być jak „nowe zadanie”).  

---

## 2) Polls Hub — layout i komponenty UI (desktop vs mobile)
### 2.1 Topbar (zawsze)
- Lewo: **„← Wróć do moje gry”** (link do builder‑hub / moje gry)
- Prawo: status użytkownika (np. „Zalogowano: …”) + „Wyloguj” (jak w Builder)

### 2.2 Układ DESKTOP (>= breakpoint jak Builder)
Pod topbarem **dwie karty jak w Builder**, każda dzielona pionowo na 2 kolumny (lewo/prawo):

#### Karta A: „Sondaże”
- **Wypustka (nagłówek)**: „Sondaże” + badge (kółko) z liczbą **aktywnych zadań dla mnie** (`tasks_todo`)
  - badge zawsze **złoty**; brak badge, gdy 0
- **Lewy panel:** „Moje sondaże” (lista)
- **Prawy panel:** „Zadania” (lista)

#### Karta B: „Subskrypcje”
- **Wypustka (nagłówek)**: „Subskrypcje” + badge (kółko) z liczbą **aktywnych zaproszeń do mnie** (`subs_their_pending`)
  - badge zawsze **złoty**; brak badge, gdy 0
- **Lewy panel:** „Moi subskrybenci”
- **Prawy panel:** „Moje subskrypcje”

**Ważne (scroll):**
- Sama karta **nie scrolluje** na desktopie.
- Scroll ma działać **wewnątrz każdej listy** (lewy/prawy panel ma własny scroll).

### 2.3 Układ MOBILE
Zamiast 2 kart dzielonych na pół — **4 osobne karty**, każda z własną wypustką i listą:
1) „Moje sondaże”
2) „Zadania” (z badge = tasks_todo)
3) „Moi subskrybenci”
4) „Moje subskrypcje” (z badge = subs_their_pending w karcie Subskrypcje; na mobile można dać go na właściwej karcie)

---

## 3) Listy i zachowania (Polls Hub)
### 3.1 Lista: „Moje sondaże”
Każdy element to „kafelek” (w stylu list Buildera) z:
- **Kolor tła kafelka** = status sondażu (legendę dajemy w manualu, w UI minimalnie)
- Tekst: **„Typowy sondaż — <Nazwa gry>”** albo **„Punktacja odpowiedzi — <Nazwa gry>”**
- Małe kontrolki po prawej (ikonki / mini‑chip):
  - ikona „Udostępnij” (aktywna tylko gdy sondaż otwarty; inaczej wyszarzona)
  - ikona „Szczegóły” (aktywna gdy sondaż otwarty lub zamknięty)
  - mini‑wskaźnik „udostępnione” (np. mały znacznik/liczba aktywnych tasków) — tylko informacyjnie

**Podwójny klik**
- Jeśli kafelek to sondaż (otwarty/zamknięty) → otwiera `polls.html?id=<game_id>` (wyniki + open/close).
- Jeśli szkic niespełniający kryteriów otwarcia → brak akcji (opcjonalnie tooltip „Dokończ tworzenie gry w Moje gry”).

**Statusy / kolory kafelków (UI tylko, logika liczy się z DB):**
1) Szary — szkic niespełniający kryteriów otwarcia (nie da się otworzyć)
2) Czerwony — szkic spełniający kryteria otwarcia
3) Pomarańczowy — otwarty, brak głosów
4) Żółty — otwarty, są anonimowe głosy **albo** są aktywne taski „w toku”
5) Zielony — otwarty i:
   - wszystkie taski wykonane **albo**
   - jest >=10 anonimowych głosów
6) Niebieski — zamknięty sondaż

> Kryteria „czy szkic spełnia otwarcie”, „czy otwarty”, „liczba głosów” itd. bierzemy **z DB**, nie z heurystyk frontu.

### 3.2 Lista: „Zadania” (dla mnie)
Każdy element:
- Kolor kafelka:
  - **Zielony** — zadanie dostępne (do wykonania)
  - **Niebieski** — zadanie wykonane
- Tekst: **„Typowy sondaż — <Nazwa gry>”** / „Punktacja odpowiedzi — <Nazwa gry>” (jak wyżej)
- W rogu przycisk **„X Odrzuć”** tylko dla zadań zielonych

**Podwójny klik (zielone i niebieskie)**
- Otwiera **poll‑go**: `poll-go.html?t=<token>`  
  (nie otwieramy bezpośrednio poll-text/poll-points z tokenem)

**Widoczność:**
- `declined` i `cancelled` **nigdy nie są pokazywane** odbiorcy w tej liście.

### 3.3 Lista: „Moi subskrybenci” (kogo JA mam jako odbiorców)
Każdy element:
- Kolor kafelka:
  - Żółty — zaproszenie wysłane, jeszcze niezaakceptowane (pending)
  - Czerwony — odrzucone / anulowane (declined/cancelled) — usuwamy po 5 dniach
  - Zielony — aktywny subskrybent (active)
- Tekst: label (username/email lub sam email)
- Przyciski:
  - **X**: anuluj zaproszenie / usuń subskrybenta (zależnie od statusu)
  - Dla żółtych: „⟲ Wyślij ponownie” (resend)

### 3.4 Lista: „Moje subskrypcje” (kogo JA subskrybuję)
Każdy element:
- Kolor kafelka:
  - Żółty — wysłane, czeka na akceptację (pending)
  - Zielony — aktywne (active)
- Przyciski:
  - Dla żółtych: „Akceptuj” + „X Odrzuć”
  - Dla zielonych: „X Anuluj subskrypcję”

---

## 4) Modale w Polls Hub (styl jak Builder)
### 4.1 Modal: „Dodaj subskrybenta”
Wejście: przycisk **„Dodaj”** w „Moi subskrybenci”.  
Zawartość:
- Pole tekstowe: „Adres e‑mail lub nazwa użytkownika”
- Przyciski: „Wyślij zaproszenie”, „Anuluj”
- Walidacja front: puste → błąd

Akcja DB:
- RPC: `polls_hub_subscription_invite(p_recipient text)`  
  (jeśli używasz wariantu `_a`, to front mapuje input na właściwe RPC, ale **jeden** widok UX)

Efekt:
- Tworzy wpis w `poll_subscriptions` z `status='pending'`, token, email_sent* itp.
- Jeśli podano zarejestrowanego użytkownika → i tak tworzymy rekord (subscriber_user_id), a **mail** traktujemy jako powiadomienie.

Mail:
- Po sukcesie front woła Edge Function mailową (rozdz. 7) i aktualizuje `email_sent_at`, `email_send_count` w `poll_subscriptions`.

### 4.2 Modal: „Udostępnij” (tylko dla sondaży OTWARTYCH)
Wejście: ikona „Udostępnij” przy sondażu na liście „Moje sondaże”.  
Zawartość:
- Lista checkboxów: **aktywni subskrybenci** (status=active)
- Przyciski: „Zapisz”, „Anuluj”
- Dodatkowy przycisk: „Odwołaj udostępnienie” (oznacza wszystkie aktywne taski jako cancelled)

Akcja DB:
- `polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])` — zapisuje stan udostępnienia jako taski:
  - dodaje / reaktywuje taski dla zaznaczonych
  - usuwa (canceluje) taski dla odznaczonych

Mail i „tylko raz”:
- Front po wyniku share pobiera listę tasków, które **wymagają maila** (email_sent_at is null lub inna logika wynikająca z DB), woła Edge Function i potem:
  - RPC `polls_hub_tasks_mark_emailed(p_task_ids uuid[])`

### 4.3 Modal: „Szczegóły głosowania” (dla otwartych i zamkniętych)
Wejście: ikona „Szczegóły” przy sondażu.  
Układ: **3 kolumny**:
1) **Zagłosowali** (subskrybenci / użytkownicy)
2) **Nie zagłosowali + odrzucili** (zadania nieukończone + odrzucone; nazwy do dopracowania)
3) **Anonimowe** (liczba + ewentualnie lista tokenów, jeśli w DB jest potrzebna diagnostyka)

Reguły:
- Głosów anonimowych **nie usuwamy**.
- Głos użytkownika można usunąć **tylko „u siebie”**:
  - usunięcie głosu nie cofa `done` taska (task zostaje done).

Akcja DB:
- Podgląd: `poll_admin_preview(p_game_id uuid)` (jest w DB)  
- Usuwanie głosu użytkownika: musi być **RPC (nie direct delete)** (jeśli brak, dodajemy później).

---

## 5) Poll Go — projekt od zera (bramka tokenów)
**Poll‑Go** to nowa strona, która:
- bierze token z URL,
- rozpoznaje czy to **subskrypcja** czy **zadanie**,
- wykonuje akcję (subskrybuj/odrzuć/otwórz zadanie),
- i w zależności od zalogowania prowadzi dalej.

### 5.1 Wejście URL
- Subskrypcja: `poll-go.html?s=<token>`
- Zadanie: `poll-go.html?t=<token>`

### 5.2 Zachowania według typu i zalogowania
#### 5.2.1 Niezarejestrowany (brak sesji)
**Subskrypcja (s=token)**
- UI: karta z opisem „Zaproszenie do subskrypcji”
- Przyciski:
  - „Subskrybuj” → jeśli wymagane: pole email + RPC (patrz niżej)
  - „Odrzuć”
  - Sekcja info: „Masz konto? Zarejestruj się / Zaloguj” (link do index)

**Zadanie (t=token)**
- UI: karta „Zaproszenie do głosowania”
- Przyciski:
  - „Zagłosuj” → przejście do poll‑text/poll‑points **anonimowo** (ale z przypięciem do taska po tokenie)
  - „Odrzuć”
  - Sekcja info: zachęta do rejestracji

**Niezarejestrowany link wykorzystany**
- Subskrypcja: „Żeby zasubskrybować, wprowadź e‑mail” (jeśli token jeszcze ważny, ale brak email — zależnie od rodzaju zaproszenia)
- Zadanie: „Już wziąłeś udział w głosowaniu” (jeśli task już done i nie ma ponownego głosowania)

#### 5.2.2 Zarejestrowany (ma konto) — ale może nie mieć sesji
Dla zalogowanych mail jest **powiadomieniem**, a właściwe głosowanie odbywa się w flow zalogowanym.

- Jeśli **jest aktywna sesja** → przekieruj do `polls-hub.html` (a nie do buildera).
- Jeśli **nie ma sesji**:
  1) Poll‑Go przekierowuje do `index.html` (logowanie)
  2) `index.html` rozpoznaje, że przyszliśmy z Poll‑Go (np. param `next=polls-hub` albo zapis w sessionStorage)
  3) Po zalogowaniu `index.html` przekierowuje do `polls-hub.html` (nie do buildera)

### 5.3 Minimalne RPC potrzebne Poll‑Go (tylko to, co jest w DB)
- `poll_action(p_kind text, p_token uuid, p_action text)`

Kontrakt frontu:
- Subskrypcja: `poll_action('sub', token, 'accept'|'decline')`
- Zadanie: `poll_action('task', token, 'opened'|'decline')`  
  (przy „Zagłosuj” najpierw `opened`, potem przejście do poll‑text/poll‑points)

---

## 6) Poll‑Text / Poll‑Points — zmiany w zachowaniu
### 6.1 Źródła wejścia do głosowania
1) **Anonimowy link (bez Poll‑Go)**  
   - zawsze liczymy jako anonimowy (nawet jak user zalogowany)
2) **Zadanie przez Poll‑Go (token taska)**  
   - po wejściu Poll‑Go kieruje do poll‑text/poll‑points tak, aby backend mógł skojarzyć głos z taskiem

### 6.2 Zakończenie głosowania
- **Zalogowany**: po ukończeniu głosowania redirect do `polls-hub.html` oraz oznaczenie taska jako done.
- **Niezalogowany (task/mail)**: po ukończeniu głosowania pokazujemy „Dziękujemy za udział” (bez redirect do hub).

### 6.3 Oznaczanie taska jako done
- Backend: `poll_task_done(p_token uuid)` (jest w DB) lub przez `poll_action('task', token, 'done')` jeśli tak zostanie przyjęte w kolejnym kroku.

---

## 7) Polls (wyniki + otwórz/zamknij) — co zmieniamy
### 7.1 Polls ma zostać miejscem dla:
- wyniki (zawsze rozwinięte)
- **otwieranie i zamykanie** (jak dotychczas)
- anon link + QR **pozostają w Polls** ✅

### 7.2 Warunki zamknięcia (logika backend)
- Dla **nieudostępnionych**: >=10 anonimowych głosów + obecne kryteria
- Dla **udostępnionych**: wszystkie taski wykonane + kryteria kompletności

Backend:
- `poll_admin_can_close(p_game_id uuid)` — aktywacja „Zamknij”
- `poll_close_and_normalize(...)` / `poll_points_close_and_normalize(...)` itd. — zgodnie z DB

---

## 8) Builder — minimalne zmiany
### 8.1 Badge na przycisku „Sondaże” w Builderze
- Zostawiamy przycisk „Sondaże” ✅  
- Backend do badge:
  - `polls_badge_get()` albo `polls_hub_overview()`
- Logika:
  - Builder pobiera:
    - `tasks_todo`
    - `subs_their_pending`
  - wyświetla sumę jako badge (złote kółko z liczbą)

W Polls Hub:
- karta „Sondaże” badge = `tasks_todo`
- karta „Subskrypcje” badge = `subs_their_pending`

---

## 9) Mapa endpointów (RPC + Edge Function) — wyłącznie to, co jest w DB
### 9.1 Polls Hub — dane list
- `polls_hub_overview()`
- `polls_hub_list_polls()`
- `polls_hub_list_tasks()`
- `polls_hub_list_my_subscribers()`
- `polls_hub_list_my_subscriptions()`

### 9.2 Polls Hub — akcje
- `polls_hub_subscription_invite(p_recipient text)`
- `polls_hub_subscriber_remove(p_id uuid)`
- `polls_hub_subscriber_resend(p_id uuid)`
- `polls_hub_subscription_accept(p_id uuid)`
- `polls_hub_subscription_reject(p_id uuid)`
- `polls_hub_subscription_cancel(p_id uuid)`
- `polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])`
- `polls_hub_task_decline(p_task_id uuid)`
- `polls_hub_tasks_mark_emailed(p_task_ids uuid[])`
- `polls_hub_gc(p_days integer)`

### 9.3 Polls / głosowanie
- `poll_open(p_game_id uuid, p_key text)`
- `poll_admin_preview(p_game_id uuid)`
- `poll_admin_can_close(p_game_id uuid)`
- `poll_close_and_normalize(p_game_id uuid, p_key text)` (+ warianty wg DB)
- `poll_get_payload(p_game_id uuid, p_key text)`
- `poll_text_submit(...)` / batch
- `poll_points_vote(...)` / batch

### 9.4 Poll‑Go (nowy front, RPC istnieją)
- `poll_action(p_kind text, p_token uuid, p_action text)`

### 9.5 Edge Function (mail)
- Edge Function (Twój `index.ts`) — wysyłka maili dla:
  - zaproszeń subskrypcji
  - powiadomień o zadaniach
- Po wysyłce oznaczamy `email_sent_at`, `email_send_count` w `poll_subscriptions` / `poll_tasks`.

---

## 10) Stany DB (minimalnie)
### 10.1 poll_subscriptions.status
- `pending`, `active`, `declined`, `cancelled`

Zasady:
- pending/declined/cancelled w „Moi subskrybenci” po 5 dniach **usuwamy** (GC)

### 10.2 poll_tasks.status
- `pending`, `opened`, `done`, `declined`, `cancelled`

Zasady:
- Odbiorca widzi tylko:
  - `pending/opened` jako zielone
  - `done` jako niebieskie
  - `declined/cancelled` nigdy
- Archiwum UI + GC:
  - taski `done` starsze niż 30 dni **kasujemy**

---

## 11) Checklist implementacyjna frontu
### Etap 1 — Polls Hub UI
- [ ] Layout kart jak Builder (desktop 2 karty dzielone, mobile 4 karty)
- [ ] `polls_hub_overview()` + badge w wypustkach
- [ ] Podpięcie list
- [ ] Sortowania (docelowo więcej kategorii; roll‑up jak Builder)
- [ ] Aktualne/Archiwalne (UI filtr)
- [ ] Kolory kafelków wg danych z DB

### Etap 2 — Modale + akcje
- [ ] Invite subskrybenta
- [ ] Udostępnij (taski)
- [ ] Odrzucanie taska, usuwanie/ponawianie/akceptowanie subskrypcji
- [ ] Mail: Edge Function + mark emailed

### Etap 3 — Poll‑Go + index redirect
- [ ] Nowy `poll-go.html` (tokeny, UI, `poll_action`)
- [ ] `index.html` pamięta „skąd przyszliśmy” i po login idzie do `polls-hub.html`

### Etap 4 — Poll‑Text/Poll‑Points/Polls
- [ ] Redirect po ukończeniu (zalogowany → hub; niezalogowany → „Dziękujemy”)
- [ ] Polls: wyniki zawsze rozwinięte; link+QR zostają; open/close działa

---

## 12) Pytania otwarte (do doprecyzowania przed kodem)
1) Dokładny parametr URL do przekazania „task token → głosowanie” (żeby backend przypiął głos do taska).
2) Usuwanie głosu użytkownika w „Szczegółach”: zakres (całość vs per pytanie) i brakujący RPC.
3) Docelowa lista kategorii sortowania dla każdej listy.
4) Dokładny format linków/QR w `polls.html` (żeby zachować to „jak było”).

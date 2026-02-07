# Familiada — Centrum sondaży (Polls Hub) + Poll‑Go + zmiany w Poll‑Text/Poll‑Points/Polls/Builder
**Język UI:** 100% PL (wszystko co widzi użytkownik)

> Kluczowa zasada: **„Udostępnienie” = tworzenie zadań (tasków)**. Nie ma „trybów” ani `poll_share_mode`.  
> **Otwieranie/zamykanie** sondażu (anonimowe głosowanie) jest **wyłącznie** w `polls.html` (jak dotychczas).  
> Taski można tworzyć **tylko dla sondaży otwartych**.

---

## 0) Słownik pojęć (backend/UI)

- **Sondaż otwarty**: w `poll_sessions` istnieje sesja z `is_open=true` i `closed_at IS NULL` (logika jak było, kontrolowana w `polls.html`).
- **Sondaż zamknięty**: są sesje, ale brak otwartych (`closed_at` ustawione).
- **Szkic**: gra typu `poll_text` / `poll_points` bez otwartej sesji (i/lub nie spełnia kryteriów otwarcia).
- **Udostępnienie**: aktywne **taski** w `poll_tasks` dla danej gry. Udostępnienie może istnieć równolegle z anonimowym otwarciem (bo to dwie niezależne rzeczy).
- **Task (zadanie)**: zaproszenie do zagłosowania, przypisane do użytkownika lub e‑maila, z tokenem do wejścia przez `poll_go.html`.
- **Subskrypcja**: relacja “ja subskrybuję Ciebie / Ty subskrybujesz mnie”, zarządzana w `poll_subscriptions`.

---

## 1) Strony i ich role

### 1.1 `polls-hub.html` (Centrum sondaży)
- Panel z **dwoma kartami** (jak w Builderze):  
  1) **Sondaże** (Moje sondaże + Zadania dla mnie)  
  2) **Subskrypcje** (Moi subskrybenci + Moje subskrypcje)
- Desktop: 2 karty, każda karta podzielona pionowo na 2 kolumny z niezależnym przewijaniem list.
- Mobile: **4 osobne karty** (każda lista osobno) – także styl Buildera.

### 1.2 `poll_go.html` (wejście z maila / tokenu)
- Strona‑bramka **wyłącznie dla linków mailowych** (tokeny w URL):
  - **task token (głosowanie z maila)**: `poll_go.html?t=<uuid>`
  - **subscription token (zaproszenie do subskrypcji z maila)**: `poll_go.html?s=<uuid>`
- Dla zarejestrowanych: to **powiadomienie** → logowanie/index → `polls-hub` (tam użytkownik wybiera zadanie i dopiero wtedy przechodzi do głosowania).
- Dla niezarejestrowanych: UI z przyciskami “Subskrybuj / Odrzuć” lub “Zagłosuj / Odrzuć”.

### 1.3 `poll-text.html` i `poll-points.html`
- Dwa wejścia:
  1) **Anonimowe** (zawsze anonimowe):  
     `https://www.familiada.online/poll-text.html?id=<gameId>&key=<key>`  
     `https://www.familiada.online/poll-points.html?id=<gameId>&key=<key>`
  2) **Zadaniowe** (z tokenu taska):  
     `poll-text.html?t=<taskToken>` / `poll-points.html?t=<taskToken>`  
     (wtedy front najpierw woła `poll_task_resolve` i dopiero oddaje głosy; finalnie oznacza task jako wykonany)

### 1.4 `polls.html`
- Zostaje jako **panel właściciela** do:
  - podglądu wyników (zawsze rozwinięte),
  - **otwarcia / zamknięcia** (jak było),
  - oraz pokazania linku/QR do anonimowego głosowania (jak było).

### 1.5 Builder (`builder.html`)
- Zmiana dotyczy **badge**: w Builderze pokazujemy **sumę**:
  - liczba aktywnych tasków dla mnie + liczba aktywnych zaproszeń do subskrypcji dla mnie.  
  Źródło: RPC `polls_badge_get()`.

---

## 2) UI — komponenty i układ (w 100% w stylu Buildera)

### 2.1 Topbar (`polls-hub.html`)
- Lewy przycisk: **„← Moje gry”** (powrót do index/builder — zgodnie z Twoim routingiem).
- Tytuł/brand: **„Centrum sondaży”**.
- Prawa strona: status zalogowania (`who`) +  przycisk „Wyloguj”.

### 2.2 Karty (Desktop)

#### Karta A: **Sondaże**
- **Nagłówek karty** (“wypustka” jak w Builderze): „Sondaże”
- W wypustce **badge** (złota kropka z liczbą) = **liczba aktywnych tasków dla mnie** (niezagłosowane).
- Wewnątrz karty: **2 kolumny**
  - **Lewo: Moje sondaże**
  - **Prawo: Zadania**

#### Karta B: **Subskrypcje**
- Nagłówek: „Subskrypcje”
- Badge (złota kropka) = **liczba aktywnych zaproszeń do subskrypcji do mnie**.
- Wewnątrz: **2 kolumny**
  - **Lewo: Moi subskrybenci**
  - **Prawo: Moje subskrypcje**

### 2.3 Karty (Mobile)
- Cztery osobne karty (kolejność):
  1) „Moje sondaże”
  2) „Zadania”
  3) „Moi subskrybenci”
  4) „Moje subskrypcje”
- Każda karta ma własną listę i własne sterowanie (sort, filtr, przyciski).

---

## 3) Listy — nagłówki, sortowanie, archiwum

Każda lista ma nagłówek sekcji (wewnątrz karty) i mały pasek sterowania:

- **Sortowanie**: roll‑up (dropdown).
- **Przełącznik “Aktualne / Archiwalne”**:
  - to jest **wyłącznie UI** (filtr po dacie / statusach).
  - dodatkowo mamy GC w DB dla starych rekordów (patrz rozdz. 9).

Lista sondaże na pasku sterowania ma dodatkowo:
 - **Przycisk “Udostępnij”** (w pasku nad listą):
  - aktywny **tylko gdy sondaż otwarty**,
  - po zaznaczeniu elementu na liscie kliknęciu otwiera modal udostępniania (taski).
- **Przycisk “Szczegóły”**:
  - aktywny dla otwartych i zamkniętych,
  - po zaznaczeniu elementu na liscie kliknęciu otwiera modal “Szczegóły głosowania”.

### 3.1 Proponowane sortowania (sensowne i kompletne)

> Te sortowania są “wystarczające” i uniwersalne – implementacyjnie to tylko sort po polu + kierunek.

#### Moje sondaże
- Domyślne (Najnowsze)
- Najnowsze
- Najstarsze
- Nazwa A–Z
- Nazwa Z–A
- Typ (Typowy sondaż → Punktacja odpowiedzi)
- Stan (Szkic → Otwarty → Zamknięty)
- Najwięcej aktywnych zadań
- Najwięcej oddanych zadań

#### Zadania
- Domyślne (Najnowsze)
- Najnowsze
- Najstarsze
- Nazwa A–Z
- Nazwa Z–A
- Typ (Typowy sondaż / Punktacja odpowiedzi)
- Tylko dostępne (zielone)
- Tylko wykonane (niebieskie)

#### Moi subskrybenci
- Domyślne (Najnowsze)
- Najnowsze
- Najstarsze
- Nazwa/Email A–Z
- Nazwa/Email Z–A
- Status (Aktywni → Oczekujące → Odrzucone/Anulowane)

#### Moje subskrypcje
- Domyślne (Najnowsze)
- Najnowsze
- Najstarsze
- Nazwa A–Z
- Nazwa Z–A
- Status (Aktywne → Oczekujące)

### 3.2 Archiwum (logika UI)
- “Moje sondaże”: archiwalne = zamknięte > 5 dni (UI filtr).
- “Zadania”: archiwalne = wykonane > 5 dni (UI filtr).
- “Subskrypcje”: cancelled/declined nie pokazujemy w listach (poza specyficznymi miejscami, jeśli kiedyś uznasz to za potrzebne) i czyścimy po 5 dniach (GC).

---

## 4) Wpisy w listach — minimalna treść i kolory (bez zbędnych detali)

### 4.1 Moje sondaże (kafelek)
**Minimalna treść w wierszu:**
- **kolor tła całego kafelka** (status)
- tytuł: **„Typowy sondaż — <Nazwa gry>”** dla `poll_text`  
  **„Punktacja odpowiedzi — <Nazwa gry>”** dla `poll_points`

**Kolory kafelka (6 stanów):**
1) Szary: szkic, **nie spełnia kryteriów otwarcia** (nie da się wejść w `polls.html` po double‑click).
2) Czerwony: szkic, spełnia kryteria otwarcia (double‑click → `polls.html?id=<gameId>`).
3) Pomarańczowy: otwarty, 0 głosów.
4) Żółty: otwarty i są głosy (anon) i/lub są aktywne taski.
5) Zielony: otwarty i (wszystkie taski wykonane **albo** ≥10 anonimowych głosów).
6) Niebieski: zamknięty.

**Interakcje:**
- **Double‑click**:
  - szary: komunikat “Dokończ grę w Moich grach”
  - pozostałe: otwiera `polls.html?id=<gameId>` (panel wyników + open/close).


### 4.2 Zadania (kafelek)
**Minimalna treść:**
- tytuł: “Typowy sondaż — …” / “Punktacja odpowiedzi — …” (jak na liscie sondaży)
- kolor:
  - zielony = dostępne,
  - niebieski = wykonane.
- mały przycisk “X” = **Odrzuć** (tylko dla zielonych).

**Interakcje:**
- klik “X” → odrzuca task (znika z listy odbiorcy): RPC `polls_hub_task_decline(task_id)`
- **Klik pojedynczy**: tylko zaznacza wpis / pokazuje akcje (bez przekierowania)
- **Double‑click zielonego** → **od razu do głosowania**:
  - `poll-text.html?t=<token>` dla tasków `poll_text`
  - `poll-points.html?t=<token>` dla tasków `poll_points`
- double‑click niebieskiego: brak akcji;

### 4.3 Moi subskrybenci (kafelek)
**Minimalna treść:**
- etykieta: username/email (lub email wpisany)
- kolor:
  - żółty: pending
  - zielony: active
  - czerwony: declined/cancelled (ale docelowo i tak zniknie po GC)
- przyciski:
  - “X” (anuluj / usuń)
  - “↻” (ponów zaproszenie) — tylko dla pending (żółtych)

### 4.4 Moje subskrypcje (kafelek)
**Minimalna treść:**
- etykieta ownera (username/email)
- kolor:
  - żółty: pending
  - zielony: active
- przyciski:
  - “X” (odrzuć / anuluj)
  - “✓” (akceptuj) — tylko dla pending

---

## 5) Modale (styl Buildera)

### 5.1 Modal: „Udostępnij” (taski) — tylko dla otwartych
**Zawartość:**
- tytuł: „Udostępnij sondaż”
- lista checkboxów: **tylko moi subskrybenci ze statusem `active`**
- każdy wiersz pokazuje mini‑status taska dla tej gry (jeśli istnieje):
  - “Dostępne” / “Wykonane” / “Brak” (a nie 5 statusów technicznych)
- przyciski:
  - „Zapisz udostępnienie”

**Zapis:**
- klik „Zapisz udostępnienie” → RPC `polls_hub_share_poll(p_game_id, p_sub_ids)`
- po sukcesie: odświeżamy listy (Moje sondaże + Zadania w tle jeśli dotyczy)

**Reguły udostępniania:**
- można udostępniać **tylko otwarte** (w UI przycisk wyszarzony poza tym)
- “unshare” (odznaczenie subskrybenta) → task u odbiorcy znika (status cancelled/declined nie jest widoczny odbiorcy)
- ponowne udostępnienie:
  - jeśli task był `done` → tworzymy **nowy** task
  - jeśli task był `declined`/`cancelled` → można “reaktywować” (zależnie od implementacji RPC – docelowo tak robimy)

### 5.2 Modal: „Szczegóły głosowania” (owner)
**Układ 3‑kolumnowy (jak ustaliliśmy):**
- **Lewo‑góra:** „Zagłosowali”
- **Lewo‑dół:** „Nie zagłosowali / Odrzucili” (w praktyce: taski aktywne + odrzucone, ale tylko dla ownera)
- **Prawo (węższe):** „Anonimowe” (liczba)

**Usuwanie głosu:**
- tylko dla głosów **powiązanych z użytkownikiem / taskiem** (nie dla anonimowych)
- usuwa **całość głosu per gra (zadanie)**, nie per pytanie
- po usunięciu:
  - task pozostaje `done` (nie cofamy wykonanego zadania)
- RPC: `poll_admin_delete_vote(p_game_id, p_voter_token)`

---

## 6) Poll‑Go — zachowanie (od zera, bez „legacy” UX)

### 6.1 Wejście task: `poll_go.html?t=<taskToken>`

**Krok 1: resolve**
- RPC: `poll_task_resolve(p_token, p_email DEFAULT NULL)`
- zwraca m.in.:
  - `ok, kind='task', game_id, poll_type, key, voter_token`
  - `requires_auth` (gdy task przypisany do user_id)
  - `needs_email` (gdy task “e‑mailowy” i trzeba zebrać e‑mail w UI)

**Tryby UI:**
1) **Zarejestrowany + zalogowany** (albo task e‑mailowy bez wymogu auth):
   - przycisk: **„Przejdź do głosowania”**
   - drugi: **„Odrzuć”**
2) **Zarejestrowany, ale brak sesji** (`requires_auth=true`):
   - komunikat: „Zaloguj się, aby przejść do głosowania.”
   - przycisk: **„Zaloguj się”** → redirect do `index.html?next=polls-hub` (szczegóły w rozdz. 7)
3) **Niezarejestrowany / task e‑mailowy** (`needs_email=true`):
   - pole e‑mail + „Dalej”
   - po podaniu e‑mail: ponowne `poll_task_resolve(token, email)` → dostajemy `key/voter_token` → „Przejdź do głosowania”
4) **Token wykorzystany / nieważny**:
   - `already_done`: „Już wziąłeś udział w głosowaniu.”
   - `invalid_or_unavailable_token`: „Link jest nieważny lub nieaktywny.”

**Odrzuć:**
- dla taska: (masz już funkcje `poll_task_decline(p_token)` lub `polls_hub_task_decline(task_id)` – front wybiera jedną drogę; w Poll‑Go wygodniej tokenem)

### 6.2 Wejście subskrypcja: `poll_go.html?s=<subToken>`
Tu trzymamy prosty flow (dla niezarejestrowanych pozwalamy operować e‑mailem):

- Dla niezarejestrowanych:
  - „Subskrybuj” / „Odrzuć”
  - sugestia: „Załóż konto” (link do index)
- Dla zarejestrowanych:
  - to jest powiadomienie → “Zaloguj się” i po zalogowaniu lądujesz w `polls-hub`

> Konkretne RPC w schema są: `poll_sub_accept`, `poll_sub_decline`, `poll_sub_accept_email`, `poll_go_sub_*` – ale UI i routing robimy od nowa; technicznie wybieramy jedno stabilne API i trzymamy się go w front.

---

## 7) Index/login — routing po wejściu z Poll‑Go

Wymóg: mail dla zarejestrowanych ma prowadzić do logowania, a po logowaniu do **polls-hub**, nie do buildera.

### 7.1 Minimalna umowa URL
- Poll‑Go przekierowuje do:
  - `index.html?from=poll-go&next=polls-hub`
- Index po udanym logowaniu:
  - jeśli `next=polls-hub` → `polls-hub.html`
  - w przeciwnym razie dotychczasowe zachowanie

> To jest najprostsze i stabilne. Token (t=... / s=...) przenosimy przez `index.html` do `polls-hub.html`, żeby po zalogowaniu dało się od razu podświetlić właściwe zaproszenie/zadanie. (Głosowanie i tak startuje dopiero z Polls‑Hub — nie z Poll‑Go).

---

## 8) Poll‑Text / Poll‑Points — integracja z taskami

### 8.1 Wejście anonimowe (id&key)
- Jeśli URL ma `id` i `key`, to **zawsze** liczymy jako anonimowe – nawet gdy użytkownik ma aktywną sesję.
- `voter_token` generujemy tak jak było (losowe lub z localStorage) – to jest „anonimowe”.

### 8.2 Poll‑Text / Poll‑Points (głosowanie)

**Wejście anonimowe** (jak było):
- URL: `poll-text.html?id=<gameId>&key=<key>` (analogicznie `poll-points.html?id=<gameId>&key=<key>`)
- Zawsze liczymy jako anonimowe, nawet gdy użytkownik ma aktywną sesję.

**Wejście zadaniowe (task)**:
- Startujesz **z Polls‑Hub**, wybierasz zadanie i dopiero klikasz **„Głosuj”** (Polls‑Hub otwiera wtedy `poll-text`/`poll-points`).
- Polls‑Hub przekazuje token zadania w URL (ustalamy jeden parametr, np. `t=<taskToken>`):
  - `poll-text.html?id=<gameId>&key=<key>&t=<taskToken>`
  - `poll-points.html?id=<gameId>&key=<key>&t=<taskToken>`
- `t` służy wyłącznie do powiązania oddanego głosu z `poll_tasks`:
  - przy wejściu: RPC `poll_task_opened(token)` (ustawia `opened_at`, jeśli puste)
  - po kompletnym oddaniu głosu: RPC `poll_task_done(token)` (ustawia `done_at`, status=done)
- Dla zalogowanych: po zakończeniu głosowania redirect do `polls-hub.html`.
- Dla niezalogowanych (głosowanie przez token): ekran podziękowania (bez redirectu); task i tak zostaje widoczny tylko u właściciela w szczegółach, a u odbiorcy — jeśli to było „zadanie” — zależy od tego, czy odbiorca jest zalogowany (w praktyce: zadania są dla kont).


## 9) Garbage collection (porządki po czasie)

Masz RPC: `polls_hub_gc(p_days integer)`.

Ustalenia:
- pending/cancelled/declined w subskrypcjach: usuwane po **5 dniach** (bez “archiwum”).
- wykonane taski: w UI archiwum po 5 dniach, a fizycznie można czyścić po **30 dniach**.

---

## 10) Mapa backendu dla frontu (RPC + Edge)

### 10.1 Widoki/listy (polls-hub)
- `polls_hub_list_polls()`
- `polls_hub_list_tasks()`
- `polls_hub_list_my_subscribers()`
- `polls_hub_list_my_subscriptions()`
- `polls_badge_get()`
- `polls_hub_overview()` (jeśli używasz jako jedno RPC zbiorcze)

### 10.2 Akcje w hub’ie
- Subskrybenci:
  - `polls_hub_subscription_invite(p_recipient text)` (zaproszenie)
  - `polls_hub_subscriber_resend(p_id uuid)`
  - `polls_hub_subscriber_remove(p_id uuid)`
- Moje subskrypcje:
  - `polls_hub_subscription_accept(p_id uuid)`
  - `polls_hub_subscription_reject(p_id uuid)`
  - `polls_hub_subscription_cancel(p_id uuid)`
- Taski:
  - `polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])`
  - `polls_hub_task_decline(p_task_id uuid)` (dla odbiorcy)
  - `polls_hub_tasks_mark_emailed(p_task_ids uuid[])` (po wysyłce maili)

### 10.3 Poll‑Go / task‑vote
- `poll_task_resolve(p_token uuid, p_email text DEFAULT NULL)` ✅
- `poll_task_done(p_token uuid)`
- `poll_task_decline(p_token uuid)` (jeśli użyjesz token‑based decline w Poll‑Go)

### 10.4 Admin (owner)
- `poll_admin_preview(p_game_id uuid)` (zestawienie do „Szczegółów”)
- `poll_admin_delete_vote(p_game_id uuid, p_voter_token text)` ✅
- `poll_admin_can_close(p_game_id uuid)` (logika przycisku “Zamknij” w polls)

### 10.5 Edge Function mailowa
- Jedna funkcja (Twoje `index.ts`) do wysyłki:
  - zaproszeń do subskrypcji
  - powiadomień o taskach
- Zasada: “wyślij tylko raz”, ponów dopiero po re‑dodaniu/reaktywacji lub ręcznym resend.
  - Do tego służą pola `email_sent_at` i `email_send_count` w `poll_subscriptions` i `poll_tasks`.

---

## 11) Kontrakt “task token → głosowanie” (ustalone)

**Jedyny parametr URL, który musi istnieć, to:**
- `t=<taskToken>` (w `poll_go.html` i w `poll-text.html` / `poll-points.html`)

**Dlaczego to wystarcza:**
- `poll_task_resolve(token)` zwraca:
  - `game_id` + `key` (czyli “gdzie głosować”)
  - `voter_token` (czyli “jak przypiąć głos do taska”)
- Front nie musi nic “wymyślać” i nie przekazuje osobno `task_id` ani `voter_token` w URL.

---

## 12) Checklista implementacyjna frontu (kolejność prac)

1) **Design system / CSS**
   - przenieść z Buildera: karty, wypustki, roll‑upy, modale, listy, przyciski, badge.
2) **Polls Hub — data layer**
   - jeden loader: overview + listy (równolegle)
   - lokalne sorty/filtry UI
   - badge w wypustkach
3) **Polls Hub — akcje**
   - invite/resend/remove subscriber
   - accept/reject/cancel subscription
   - share/unshare poll (taski)
   - decline task
4) **Modale**
   - “Udostępnij”
   - “Szczegóły głosowania” (3 kolumny + delete vote)
5) **Poll‑Go (od zera)**
   - rozpoznanie `t` vs `s`
   - flow auth/anon zgodnie z rozdz. 6–7
6) **Poll‑Text/Poll‑Points**
   - obsługa `t=<taskToken>` (resolve → vote → done → redirect)
   - zachowanie anonimowego `id&key` bez zmian
7) **Builder badge**
   - RPC `polls_badge_get()` i wyświetlenie sumy na przycisku „Sondaże”

---

## 13) Niezmienniki / zasady bezpieczeństwa (żeby nie wrócić do chaosu)

- Nie wprowadzamy `poll_share_mode`.
- Nie dodajemy nowych “pół‑RPC” typu `polls_action` jeśli nie mają jasnej roli.
- Tokeny:
  - task: zawsze `t=<uuid>`
  - sub: zawsze `s=<uuid>`
- `declined/cancelled` tasków: **niewidoczne odbiorcy**.
- `id&key` w poll‑text/poll‑points: **zawsze anonimowe** (nawet przy sesji).

## 14) Przykłąd wygladu wiadomosci e-mail

**Widomości e-mail maja być wysyłane za pomocą edge-function**

```html
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    
    <!-- topbar-ish -->
    <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">
        FAMILIADA
      </div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">
        Potwierdzenie konta
      </div>
    </div>

    <!-- card -->
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">
        Aktywuj konto
      </div>

      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">
        Kliknij przycisk poniżej, aby potwierdzić adres e-mail i dokończyć rejestrację.
      </div>

      <!-- primary button (gold) -->
      <div style="margin:16px 0;">
        <a href="{{ .ConfirmationURL }}"
           style="display:block;text-align:center;padding:12px 14px;border-radius:14px;
                  border:1px solid rgba(255,234,166,.35);
                  background:rgba(255,234,166,.10);
                  color:#ffeaa6;
                  text-decoration:none;font-weight:1000;letter-spacing:.06em;">
          POTWIERDŹ KONTO
        </a>
      </div>

      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">
        Jeśli to nie Ty, zignoruj tę wiadomość.
      </div>

      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        Link nie działa? Skopiuj i wklej do przeglądarki:
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">
          {{ .ConfirmationURL }}
        </div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">
      Wiadomość automatyczna — prosimy nie odpowiadać.
    </div>
  </div>
</div>
```

# E19 — Znajomi, Subskrybenci, Zadania: plan techniczny

Decyzje: [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md), sekcje od
„Udostępnianie — wiersze, role, sekcje wg stanu (E19)” do końca. Zasady pracy:
[`wdrozenia.md`](wdrozenia.md). Nowe migracje od **320**.

Rozbieżność do poprawy: `usuwanie-danych.md` (tabela „dziś”, wiersz 43) mówi,
że subskrypcje po e-mailu zostają po usunięciu konta — decyzja 2026-10-07
i E19 oraz obecny `delete_user_everything` je usuwają (tabela opisuje stan
sprzed E12).

## 1. Model danych

- **`friendships`** (320): `id`, `requester_id`, `addressee_id` (FK `profiles`,
  ON DELETE CASCADE), `status` ∈ `pending|active`, `token` (link `go?f=`),
  `created_at`, `accepted_at`, `email_sent_at`, `email_send_count`. CHECK
  różne osoby; unikalna para nieuporządkowana (`least/greatest`). Odrzucenie,
  cofnięcie, usunięcie = DELETE; blokada ponownego zaproszenia w
  `mail_cooldowns` (`friend:invite_after_reject`). RLS ENABLE+FORCE, SELECT
  tylko strony relacji, zapis wyłącznie przez RPC SECURITY DEFINER.
  `are_friends(a,b)`. Polityki maili `friend:invite`, `friend:resend`.
- **`poll_subscriptions`** zostaje tylko dla e-maili (wiersze z
  `subscriber_user_id` nie są już tworzone ani czytane; kolumna znika w E14).
  `poll_claim_email_records` przestaje przepinać subskrypcje na konto
  (przepinanie `poll_tasks` zostaje).
- **Migracja danych** (320 i powtórka w 321, idempotentna): aktywne
  i oczekujące subskrypcje kont → `friendships` (ten sam `token`, więc stare
  maile `go?s=` działają przez `poll_go_resolve` rozszerzone o `friendships`).
  Stare wiersze kasuje E14.
- **Subskrybent zakłada konto**: `friend_invites_from_subscriptions()` (przy
  logowaniu / listach) tworzy zaproszenie do znajomych od właściciela;
  subskrypcja zostaje.
- **Urządzenia bez konta**: `shared_devices.recipient_email` (+ `recipient_id`
  nullable, CHECK jedno z dwóch, unikalny indeks po e-mailu). E-mail konta →
  zapis po `recipient_id`.
- **Usunięcie konta**: `delete_user_everything` dodatkowo usuwa `friendships`
  (obie strony), `shared_devices` po `recipient_id` i `recipient_email`.
  Definicja na bazie wersji z `schema.sql` po 319.

## 2. RPC

| Obszar | Nowe | Zmienione | Do E14 (usunięcie) |
|---|---|---|---|
| Znajomi | `friends_invite(handle)`, `friends_list()`, `friends_accept/reject/cancel/remove/resend(id)`, `friends_token_info(token)` | — | `polls_hub_list_my_subscriptions`, `polls_hub_subscription_accept/_reject/_cancel/_invite/_invite_a`, `poll_sub_accept` |
| Subskrybenci | `subscribers_invite(email)` (konto → `has_account`), `subscribers_list()` (+`friend_user_id`) | `poll_claim_email_records`, `poll_go_resolve` | kolumna `subscriber_user_id`, CHECK, indeks |
| Ankieta | `poll_share_send(game, friend_ids[], subscriber_ids[])` | — | `polls_hub_share_poll` |
| Bazy | — | `base_share_by_user` wyszukuje konto (znajomość nie jest wymagana); linki `go?b=` zamiast `/bases?share=` | `bases_count_incoming_share_invites` (jeśli zbędne) |
| Urządzenia | `device_share_create(user|email, …)`, `device_shares_list_mine()`, `device_share_revoke(id)` | `e2e_shared_devices_cleanup` | `share_device`, `unshare_device`, `list_my_device_shares` |
| Zadania | `tasks_list()` (ankiety, bazy do akceptacji, aktywne urządzenia), `badges_get()` | `site_activity_ping` (+friends/subscribers/tasks) | `polls_badge_get`, `polls_hub_overview`, `polls_hub_list_tasks` |
| Testy | `e2e_friendships_cleanup` | `294_e2e_cleanup_mail_cooldowns` (+`friend:*`) | — |

## 3. Strony

- `PAGES`: `friends`, `subscribers`, `tasks` (access `user`, parent `games`);
  `subscriptions` usunięte (z `from`, przycisków, `manual.tabs`). Lista gier:
  `btnFriends`, `btnSubscribers`, `btnTasks` + plakietki. `PAGE_ROUTES` w
  Workerze. Katalog `web/subscriptions/` usunięty.
- `/friends/`: Zaproszenia do mnie · Wysłane · Znajomi, „+ Zaproś” (konto).
- `/subscribers/`: Oczekujące · Aktywni, „+ Zaproś” (e-mail).
- `/tasks/`: Do zrobienia · Zrobione (zwinięte), filtr rodzaju.
- `/go/`: `?t=` → `/tasks/`, nowe `?b=` (baza) i `?f=` (znajomi), `?s=` tylko
  subskrybenci e-mail.
- Wspólny komponent: `share-sections.js` — sekcje jako parametr, wiersz z
  inicjałem, szarą linijką i kanałem (`friend|subscriber|mail`), akcje w
  wierszu (tekst / ikona), usuwanie ikoną; `renderShareSources` (mail/nazwa +
  znajomi [+ subskrybenci w ankiecie]). Jeden moduł maili zaproszeń
  (`invite-mail.js`), bez trzeciej kopii szablonu.

## 4. Kroki (każdy: branch → unit → e2e → `main` → e2e)

1. Migracja 320 (dodająca, od razu na `main`): tabela, RLS, RPC nowe, kopia danych.
2. Komponent wierszy + `/tasks/` (stare `/subscriptions/` działa dalej).
3. `/friends/`, `/subscribers/` + migracja 321 (przełączenie) razem z kodem;
   usunięcie `/subscriptions/`, `/go/`, `delete_user_everything`.
4. Ankieta (`poll_share_send`).
5. Bazy (migracja 322: `base_share_by_user` + `go?b=`), akceptacja w `/tasks/`.
6. Urządzenia (`shareDevice.js`: znajomi + dowolny e-mail).
7. Ujednolicenie udostępniania, Znajomych i Subskrybentów według tabel
   w `ujednolicenie-wygladu.md`; sprawdzenie widoków telefonu i komputera.

Ryzyka do obsłużenia: okno 320→321 (powtórka kopii); dwa źródła tokenu `go?s=`;
unieważnienie linku urządzenia musi być związane z konkretnym udostępnieniem i
sesją Control; duplikaty znajomy+subskrybent; stare linki `/bases?share=` martwe
po kroku 5 (≤ 5 dni). Zasady cofania i czyszczenia zasobów nadrzędnych opisuje
tabela cyklu życia w sekcji 7.

Specy: przepisanie `subscriptions.spec.js` na `friends.spec.js` /
`subscribers.spec.js`, nowe `tasks.spec.js`, zmiany `go`, `bases`, `control2`
(urządzenia), `frontend-navigation`, `account-deletion`. Konta tylko z puli —
pula test1–test8; test9/test10 zarezerwowane.

## 5. Stan kroków (2026-10-10)

| Krok | Stan |
|---|---|
| 1. Migracja 320 (`friendships`, `friends_*`, `tasks_list`, `badges_get`, kopia subskrypcji kont) | **zrobione** — na produkcji (`d38e829`), test SQL `docs/sql/test-friendships-320.sql` 60/60 |
| 2. Komponent wierszy (`renderRowSections`/`rowEl` w `share-sections.js`) + `/tasks/` | **zrobione** — e2e `tasks`, `frontend-navigation`, `go` zielone |
| 3. `/friends/`, `/subscribers/` + migracja 321 (przełączenie), usunięcie `/subscriptions/` | **zrobione** — migracja 321, front, Pages i Worker wdrożone; runner SQL/unit 38096872246 ✓; kontrole produkcji: friends 38099344264 (2/2), subscribers 38099196468 (2/2), go 38099459575 (2/2), frontend-navigation 38099534030 (11/11), account-deletion 38099771245 (1/1), regresja dźwięku 38099849073 (2/2); unit 401/401 w każdym przebiegu |
| 4. Ankieta: udostępnianie oknem (Znajomi · Subskrybenci), jedna lista odbiorców | **zrobione** — branch po synchronizacji 38100967351 ✓; Pages 38101052370 ✓; produkcja 38101089865 ✓, unit 401/401. Test zaliczył retry: pierwsza próba nie doczekała maila, który nadal był w kolejce; retry zakończył się pomyślnie |
| 5. Bazy: jedno okno (udostępnieni + dodawanie), `go?b=`, akceptacja w `/tasks/` | **zrobione** — migracja 322 i front na produkcji; runner SQL 38101686798 ✓; Pages 38102630814 ✓; branch E2E 38102541764 ✓; produkcyjne E2E 38103300067 ✓, 2/2, unit 401/401. Cron `*/2` aktywny; po wydłużeniu timeoutu mail test8 dotarł po 33 s; oba scenariusze bazy zaliczone |
| 6. Urządzenia: jedno okno, odbiorca bez konta, token unieważniany per osoba i sesję Control | do zrobienia — wymagania doprecyzowane 2026-10-11 |
| 7. Ujednolicenie Znajomych, Subskrybentów i udostępnień wg tabeli zachowań | do zrobienia — wymagania doprecyzowane 2026-10-11 |

## 6. Decyzje użytkownika (do 2026-10-10)

Model (z `ujednolicenie-wygladu.md`, E19):
- **Trzy osobne strony**: `/friends/` (Znajomi — konta, dwustronnie),
  `/subscribers/` (Subskrybenci — tylko e-mail bez konta, jednostronnie, tylko
  ankiety), `/tasks/` (Zadania — co mi przysłano). `/subscriptions/` znika
  (bez aliasu; linki z maili przez `/go/`).
- **Kanały**: ankiety → znajomi + subskrybenci; bazy → zawsze **konto**
  (e-mail/nazwa tylko do wyszukania konta; znajomi = skrót, znajomość nie
  jest wymagana); urządzenia → e-mail/nazwa, **konto niekonieczne** (bez
  konta — tylko mail; z kontem — widać w Zadaniach i „Podłącz urządzenie”);
  znajomi = skrót.
- **Powiadomienie o zadaniu dla konta = e-mail**, globalnie wyłączalny
  (`user_flags.email_notifications`); wyłączenie maila nie usuwa zadania z `/tasks/`.
- **Usunięcie konta**: znajomości (obie strony), zaproszenia, wpisy
  subskrybenta na jego e-mail, udostępnienia baz/urządzeń, zadania — usunięte;
  u znajomych osoba znika bez maila; nowe konto na ten sam e-mail nie
  odzyskuje niczego.

Odpowiedzi na pytania planu:
1. Subskrybent zakłada konto → zaproszenie do znajomych tylko na `/friends/` +
   plakietka, **bez maila**.
2. Pomyłka strony → komunikat: „Do tego maila jest przypisane konto w systemie
   Familiada — możesz zaprosić tę osobę do znajomych. Przejdź →” (i odwrotnie:
   „…możesz dodać ją jako subskrybenta. Przejdź →”). Bez automatycznego
   przełączania.
3. Usunięcie znajomego → kasuje oczekujące zaproszenia/zadania pary; przyjęte
   bazy i urządzenia **zostają**; okno potwierdzenia o tym mówi (można je
   cofnąć osobno).
4. Link urządzenia → **osobny klucz na udostępnienie, przypięty do sesji
   Control/rozgrywki** (`game_sessions`). Sesja Control wygasa po godzinie
   bezczynności; jej wygaśnięcie czyści rekordy Storage i unieważnia linki,
   po czym Control zaczyna ponownie od podłączania urządzeń (doprecyzowanie
   2026-10-11). Otwarty wygasły link: „Zaproszenie wygasło —
   poproś o nowy link”; w Zadaniach i na liście urządzeń wygasłe **nie są
   widoczne**. **Link do skopiowania z panelu Control działa tak samo.**
5. Plakietka Zadań → ankiety + bazy do zaakceptowania (urządzenia mają własną
   plakietkę na „Podłącz urządzenie” — nie dublujemy).
6. Mail z urządzeniem do osoby bez konta → tak, z limitem i linkiem wypisania.
7. Baza zawsze na konto (patrz wyżej).
8. Subskrybent, który przyjmie zaproszenie do znajomych → **znika z listy
   subskrybentów**, zostaje znajomym (ankiety dostaje jako znajomy).
9. „Podłącz” w Zadaniach → `/connect/?share=<id>` z wybranym udostępnieniem.
10. Filtr rodzaju w Zadaniach w adresie (`?kind=`), lista rozwijana `ui-select`.

Wygląd i układ:
- Wiersze zamiast kafli, akcje w wierszu (komputer: tekst, telefon: ikona;
  usuwanie ikoną), jedna kolumna ok. 760 px.
- **Zadania**: bazy tylko do zaakceptowania (po akceptacji/odrzuceniu
  znikają), urządzenia tylko aktywne, „Zrobione” tylko ankiety.
- **Listy już udostępnionych** (bazy, urządzenia, ankieta): **jedna lista**,
  bez podziału na sekcje wg kanału; na wierszu oznaczenie znajomy /
  subskrybent.
- **Ankieta**: udostępnieni widoczni na stronie ankiety (panel), **dodawanie
  w oknie** z dwiema listami (Znajomi · Subskrybenci), w jedną stronę (tylko
  dodaje), już wybrani nie pokazują się w oknie.
- **Bazy i urządzenia**: **jedno okno** — w nim lista już udostępnionych
  i dodawanie (pole mail/nazwa + znajomi).

## 7. Ujednolicone zachowanie — decyzje 2026-10-11

Źródło tabel wyglądu i układu: [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md),
sekcja „Ujednolicenie E19”. Zasady kolejki i cooldownów: [`maile-granice.md`](maile-granice.md).
Ta sekcja zastępuje wcześniejsze, ogólne opisy E19 wszędzie, gdzie różnią się
od niej.

### Reguła wspólna powiadomień i ponowień

- W całym systemie **powiadomienie oznacza e-mail**. Uprawnienie/udostępnienie
  oraz widoczność zadania na koncie odbiorcy są niezależne od dostarczenia maila.
- Zanim jakikolwiek mail powiadomieniowy zostanie wstawiony do kolejki, należy
  sprawdzić `user_flags.email_notifications` odbiorcy. Flaga wyłączona oznacza
  brak wpisu w kolejce; nie blokuje dostępu przez konto. Reguła ma być wymuszona
  wspólnie na granicy kolejki, a nie tylko w poszczególnych ekranach.
- „Ponów” wysyła wyłącznie mail przypominający do istniejącego zaproszenia/
  udostępnienia; nie tworzy uprawnienia, tokenu ani nowego zadania. Gdy odbiorca
  wyłączył powiadomienia, przycisku ponowienia nie pokazujemy.
- Cooldowny dotyczą wysyłania maili. Serwer jest źródłem prawdy, UI pokazuje
  pozostały czas. Stan dostępu zmienia się wyłącznie przez udostępnienie,
  cofnięcie lub zakończenie nadrzędnej sesji/zasobu.

### Zasady per funkcja

| Obszar | Kto może być odbiorcą i jak dodać | Lista udostępnionych / stany | Ponowienie, cooldown i cofnięcie |
|---|---|---|---|
| Urządzenie w Control | Sekcje: „Mail lub nazwa użytkownika” (pole + Udostępnij) oraz „Znajomi, którym możesz udostępnić” (checkboxy, jeden przycisk Udostępnij). | Trzecia sekcja „Udostępnione” obejmuje odbiorców bieżącego urządzenia i sesji gry: znajomy z nazwą i etykietą „znajomy”; konto wyszukane nazwą/e-mailem z etykietą „konto”; adres bez konta z etykietą „mail”. Udostępniony znajomy znika z wyboru. Każdy wiersz ma X/kosz i widoczny cooldown. | Ponowienia maila nie ma. Aby wysłać ponownie, właściciel cofa konkretne udostępnienie i tworzy je ponownie. Dymek przy polu maila/nazwy pokazuje cooldown lub komunikat, że osobie już udostępniono urządzenie w tej sesji. Dostęp/token unieważniają się po cofnięciu. |
| Baza | Sekcje mail/nazwa użytkownika i znajomi; w obu wybór roli Edytor/Przeglądający. Znajomi wybierani checkboxami i wspólnym przyciskiem. Odbiorca musi mieć konto. | Wspólna lista udostępnionych pokazuje kanał/tożsamość, status (oczekuje, zaakceptowano, odrzucono), rolę i cooldown. | Rola zmieniana przy wierszu; cofnięcie unieważnia dostęp. Dla odrzuconego można ponowić zaproszenie zgodnie z cooldownem; to tylko przypominający e-mail do istniejącego zaproszenia. |
| Ankieta — Anonimowo | Osobna, równa połowa karty na komputerze. Dotychczasowy anonimowy link, poprawiony wizualnie. Każdy posiadacz linku może głosować wielokrotnie. | Stan anonimowego głosowania i udostępnianie kontowe pozostają odrębnymi trybami. | W przeglądzie klienta i migracji nie znaleziono IP-limit; przed zmianą sprawdzić Edge/Worker i potwierdzić, czy dodawać ochronę IP. |
| Ankieta — Udostępnij | Druga równa połowa karty; znajomi i subskrybenci jako analogiczne listy checkboxów, bez pola mailowego. | Lista odbiorców pokazuje: oczekuje/otworzył, zagłosował lub odrzucił. Każdy wpis należy do konkretnego uruchomienia ankiety. | Dla oczekujących bez głosu i odrzuconych można ponowić przypominający e-mail z cooldownem (ukryty przy wyłączonych powiadomieniach). Usunięcie udostępnienia cofa zadanie i związane z nim głosy. |
| Znajomi | Po lewej dodawanie przez e-mail/nazwę; poniżej zaproszenia wychodzące oczekujące lub odrzucone. Po prawej znajomi oraz zaproszenia przychodzące z Akceptuj/Odrzuć. | Wiersze ze stanem; układ na komputerze: lewa/prawa kolumna. Telefon: cztery sekcje albo dwie karty. | Oczekujące i odrzucone zaproszenie wychodzące można ponowić jako mail przypominający do tego samego zaproszenia; nie tworzy nowego rekordu. X cofa oczekujące zaproszenie. Znajomego można usunąć. Usunięcie znajomości nie usuwa już przyjętych baz/urządzeń — są osobnymi uprawnieniami. Backend ma dziś friend invite/resend 5 dni, limit dwóch maili/30 dni i 30 dni po odmowie dla nowego zaproszenia. Zgodność ponowienia odrzuconego wpisu z jego stanem/tokenem wymaga dopięcia w implementacji. |
| Subskrybenci | Lista jednostronna dodawana e-mailem; podobny układ do Znajomych, bez propozycji przychodzących i bez sekcji znajomych. | Oczekujący i aktywni subskrybenci w wierszach ze stanem. | Ponowienie oczekującego/odrzuconego zaproszenia to e-mail przypominający z cooldownem; brak przycisku przy wyłączonych powiadomieniach. Usunięcie subskrybenta kończy subskrypcję. |

### Sesje, cofanie i czyszczenie zależności

| Zdarzenie nadrzędne | Skutek dla udostępnień i odbiorców |
|---|---|
| Ankietę otwarto ponownie po zamknięciu/przerwaniu | Nowy przebieg: nowy klucz, nowe sesje i wyczyszczone zadania/udostępnienia poprzedniego przebiegu. Zaproszenia są przypięte do uruchomienia, nie do całej gry. |
| Ankietę zamknięto i podliczono | Sesje głosowania są zamknięte; oczekujące/otwarte zaproszenia są kasowane. Wykonane i odrzucone wpisy zostają jako historia do kolejnego otwarcia, które czyści poprzedni przebieg. |
| Ankietę przerwano | Głosy, wpisy, sesje i wszystkie zadania udostępnienia są kasowane; klucz jest rotowany. |
| Udostępnienie ankiety cofnięto | Usuwa się zaproszenie/zadanie i głos tej osoby z bieżącego przebiegu. |
| Udostępnienie bazy lub urządzenia cofnięto | Unieważnia się konkretny rekord/token; nie wolno pozostawiać działającego linku. Usunięcie znajomości nie cofa odrębnych przyjętych uprawnień do zasobów. |
| Gra/ankieta, baza lub konto nadrzędne usunięte | Kaskadowo unieważnić udostępnienia, tokeny i oczekujące maile/zadania zależne od zasobu. Usunięcie konta odbiorcy usuwa jego relacje/udostępnienia i nie pozwala nowemu kontu odzyskać starych. |
| Sesja Control bezczynna przez godzinę | Wygasić sesję Control, usunąć jej rekordy Storage i unieważnić udostępnienia urządzeń tej sesji. Po wygaśnięciu ekran zaczyna proces od początku i ponownie pokazuje podłączanie urządzeń. Aktywność odnawia termin; dokładny sygnał aktywności i zakres kluczy Storage należy dopiąć w implementacji. |

### Zasada hierarchii zasobów i propagacji usuwania

Elementy traktujemy jako drzewo zależności. Przykładowe ścieżki:

| Ścieżka | Potomkowie | Skutek usunięcia lub wygaśnięcia rodzica |
|---|---|---|
| Konto właściciela → gra → przebieg ankiety → udostępnienie | token i zadanie odbiorcy, głos/odmowa, sesje i wyniki przebiegu | Usunięcie konta usuwa gry i potomków; usunięcie gry usuwa przebiegi i udostępnienia; zamknięcie/przerwanie kończy przebieg zgodnie z tabelą wyżej. |
| Konto właściciela → gra → sesja Control → urządzenie → udostępnienie | rekord udostępnienia, token/link odbiorcy | Usunięcie gry albo wygaśnięcie Control unieważnia wszystkie linki potomne i czyści Storage tej sesji. Cofnięcie pojedynczego wpisu unieważnia tylko jego token. |
| Konto właściciela → baza → udostępnienie | zadanie akceptacji, rola i dostęp | Usunięcie konta lub bazy unieważnia wpisy i zadania potomne. Zmiana roli aktualizuje istniejące uprawnienie. |
| Konto → znajomość/zaproszenie | relacja dwustronna albo zaproszenie | Usunięcie konta kasuje relację i zaproszenia. Usunięcie znajomości kasuje zaproszenia/zadania pary, lecz przyjęte uprawnienia do baz i urządzeń pozostają jako osobne gałęzie. |
| Konto nadawcy → subskrypcja → zaproszenie ankietowe | wpis subskrybenta i zadanie przebiegu | Usunięcie subskrypcji kończy przyszłe zaproszenia. Dla istniejących zadań/głosów zachować lub usunąć zgodnie z właścicielem zasobu; zachowanie każdego RPC usuwającego subskrypcję trzeba jawnie zweryfikować. |

Reguła wykonawcza: każda operacja kasująca lub wygaszająca rodzica przechodzi
wszystkie krawędzie do potomków, unieważnia tokeny i uprawnienia oraz usuwa
albo anuluje oczekujące powiadomienia powiązane z potomkami. Kolejka musi mieć
identyfikowalne powiązanie do zasobu/tokena, by cofnięty lub wygasły link nie
został wysłany po usunięciu. Zmiana relacji pobocznej nie kasuje automatycznie
odrębnego uprawnienia zasobowego. Dla każdej ścieżki testować usunięcie
każdego poziomu oraz stan tokenu, zadania, Storage i kolejki.

### Cooldowny do zachowania i kwestia weryfikacji

Obecne wartości polityk są zapisane w [`maile-granice.md`](maile-granice.md):
udostępnienie bazy 24 h, urządzenia 1 h, ankieta 24 h na parę/ankietę,
zaproszenie subskrypcyjne 5 dni, jego ponowienie 5 dni; zaproszenie do
znajomych i przypomnienie 5 dni, limit dwóch maili/30 dni, po odmowie 30 dni
do nowego zaproszenia. Dla maili ankietowych obowiązuje także limit 3/24 h na
nadawcę i odbiorcę oraz maksymalnie dwa przypomnienia na przebieg. Dla zmiany
roli/cofnięcia należy zinwentaryzować backend; cofnięcie jest natychmiastowe,
a cooldown może ograniczać tylko ponowną wysyłkę maila, nigdy utrzymać dostęp.

Weryfikacja kodu 2026-10-11: w klientach głosowania i migracjach ankiet nie
znalazłem ograniczenia anonimowych głosów po IP; zapis głosu opiera się na
`voter_token`. Zweryfikować ścieżki Edge/Worker i potwierdzić z użytkownikiem,
czy wprowadzać IP-limit, zanim wpiszemy go jako wymóg. Ustalić niezarejestrowany
adres urządzenia z wyłączonymi powiadomieniami (konto zachowuje ścieżkę Zadania, adres bez konta może dostać
link poza kolejką tylko przez jawne skopiowanie przez właściciela); ustalić
czy cooldown cofnięcia/zmiany roli ma już politykę backendową.

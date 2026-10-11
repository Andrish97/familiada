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
- Cel: każdy link przeznaczony do udostępnienia innej osobie najpierw trafia
  na `/go/`, gdzie waliduje się stan i pokazuje spójny, estetyczny komunikat
  (aktywne, użyte, odrzucone, cofnięte/wygasłe, zamknięta ankieta lub błąd),
  a dopiero potem przechodzi do docelowej strony. Dziś zaproszenia
  (`t/s/f/b`) są rozwiązywane przez wspólny resolver, linki urządzeń (`d`)
  tylko przekierowuje `go/index.html`, a anonimowy link i QR ankiety omijają
  `/go/` — to niespójności do usunięcia. Rezygnacje mailowe (`u` lub
  `s&action=unsub`) używają `/go/`, ale są osobnym typem komunikatu.
  Wewnętrzne podglądy Control nie są linkami do udostępniania i mogą omijać
  `/go/`.
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
7. Ujednolicić hierarchię zależności zasobów, blokad, uprawnień i kaskadowego
   usuwania w `blokady-zasobow.md`; wdrożyć macierz cyklu życia i weryfikację
   potomków. Dokończyć UI według tabel w `ujednolicenie-wygladu.md`.

Ryzyka do obsłużenia: okno 320→321 (powtórka kopii); dwa źródła tokenu `go?s=`;
unieważnienie linku urządzenia musi być związane z konkretnym udostępnieniem i
sesją Control; duplikaty znajomy+subskrybent; stare linki `/bases?share=` martwe
po kroku 5 (≤ 5 dni). Zasady cofania i czyszczenia zasobów nadrzędnych opisuje
tabela cyklu życia w sekcji 7.

### Routing linków (weryfikacja 2026-10-11)

| Rodzaj linku | Stan obecny (2026-10-11) | Wymaganie docelowe |
|---|---|---|
| Zaproszenie do zadania ankiety | `/go/?t=<token>` → `/tasks/` albo głosowanie | Pozostaje przez `/go/`; pokaż elegancko stany zaproszenia i ankiety, potem akcję/wejście. Token jest przypisany do odbiorcy i bieżącego uruchomienia. |
| Zaproszenie subskrybenta / znajomości / bazy | `/go/?s=…`, `?f=…`, `?b=…` | Pozostaje przez wspólny `/go/` resolver; jeden spójny układ dla typów i stanów. |
| Link anonimowego głosowania | Dziś wprost `/polls/vote/text|points/?id=…&key=…` | Zmienić URL udostępniany/QR na `/go/?p=<klucz>` (lub równoważny typ jawnie obsługiwany przez resolver); sprawdzić ważność, otwartość i typ ankiety, czytelnie pokazać stan, a dla aktywnej przejść do głosowania. Zachować anonimowość: bez tokenu odbiorcy/konta i bez ujawniania właścicielowi tożsamości. |
| Link urządzenia | `/go/?d=display|host|buzzer|qr&id=…&key=…` → natychmiastowy redirect | Zostawić wspólny adres wejściowy, dodać walidację i czytelne stany dla poprawnego, cofniętego/wygasłego/niepoprawnego linku; dopiero aktywny kierować do urządzenia. Ujednolicić stan wizualny z pozostałymi wejściami. |
| Rezygnacja z maili | `/go/?u=…` albo `/go/?s=…&action=unsub` | Pozostaje przez `/go/`, z własnymi czytelnymi stanami (wykonano, już wyłączone, niepoprawny link, błąd). |
| Wewnętrzny podgląd Control | Bezpośrednio `/control/<device>/…` | Nie jest linkiem udostępniania, więc może omijać `/go/`. |

Wspólny `/go/` ma prezentować właściwy, jednoznaczny komunikat dla każdego
rodzaju linku i stanu; nie może merytorycznie mieszać „link błędny”, „dostęp
cofnięty”, „zaproszenie odrzucone”, „ankieta zamknięta” ani chwilowego błędu
sieci. Aktywne linki prowadzą dalej do właściwej strony, a terminalne stany
nie wykonują automatycznego przekierowania. Stare `/poll-go/` oraz
`/bases?share=` nie są aktywnymi aliasami; nie dodawać fallbacków.

Specy: przepisanie `subscriptions.spec.js` na `friends.spec.js` /
`subscribers.spec.js`, nowe `tasks.spec.js`, zmiany `go`, `bases`, `control2`
(urządzenia), `frontend-navigation`, `account-deletion`. Konta tylko z puli —
pula test1–test8; test9/test10 zarezerwowane.

## 5. Stan kroków (aktualizacja 2026-10-11)

| Krok | Stan |
|---|---|
| 1. Migracja 320 (`friendships`, `friends_*`, `tasks_list`, `badges_get`, kopia subskrypcji kont) | **zrobione** — na produkcji (`d38e829`), test SQL `docs/sql/test-friendships-320.sql` 60/60 |
| 2. Komponent wierszy (`renderRowSections`/`rowEl` w `share-sections.js`) + `/tasks/` | **zrobione** — e2e `tasks`, `frontend-navigation`, `go` zielone |
| 3. `/friends/`, `/subscribers/` + migracja 321 (przełączenie), usunięcie `/subscriptions/` | **zrobione** — migracja 321, front, Pages i Worker wdrożone; runner SQL/unit 38096872246 ✓; kontrole produkcji: friends 38099344264 (2/2), subscribers 38099196468 (2/2), go 38099459575 (2/2), frontend-navigation 38099534030 (11/11), account-deletion 38099771245 (1/1), regresja dźwięku 38099849073 (2/2); unit 401/401 w każdym przebiegu |
| 4. Ankieta: udostępnianie oknem (Znajomi · Subskrybenci), jedna lista odbiorców | **zrobione** — branch po synchronizacji 38100967351 ✓; Pages 38101052370 ✓; produkcja 38101089865 ✓, unit 401/401. Test zaliczył retry: pierwsza próba nie doczekała maila, który nadal był w kolejce; retry zakończył się pomyślnie |
| 5. Bazy: jedno okno (udostępnieni + dodawanie), `go?b=`, akceptacja w `/tasks/` | **zrobione** — migracja 322 i front na produkcji; runner SQL 38101686798 ✓; Pages 38102630814 ✓; branch E2E 38102541764 ✓; produkcyjne E2E 38103300067 ✓, 2/2, unit 401/401. Cron `*/2` aktywny; po wydłużeniu timeoutu mail test8 dotarł po 33 s; oba scenariusze bazy zaliczone |
| 6. Urządzenia: jedno okno, odbiorca bez konta, token unieważniany per osoba i sesję Control | **zrobione — backend i TTL sprawdzone produkcyjnie (38130087825, 38130327633, 38130590463); dopracowany modal i przywrócony styl Urządzeń na main `44063a604`, Pages 38133157139 ✓, branch 38132982841: 2/2 + unit 401/401; kontrola produkcyjna nowego UI 38133215588 ✓: 2/2 + unit 401/401** |
| 7. Ujednolicenie Znajomych, Subskrybentów i udostępnień wg tabeli zachowań | **w toku — audyt**; wzorzec Control gotowy produkcyjnie, pozostałe strony i kontrakty RPC do wdrożenia |

### Dalsza realizacja kroku 7 po zamknięciu Control

1. Przenieść wspólne reguły sekcji/list/checkboxów z modala Control do
   wspólnego komponentu i CSS. Zachować gotowy wygląd Control jako wzorzec.
2. Znajomi/Subskrybenci: formularz w karcie, bez wyszukiwania i dolnego
   paska; oczekujące/odrzucone obok formularza, znajomi i propozycje po
   prawej (Subskrybenci bez propozycji); dwie karty na telefonie.
3. Uzupełnić kontrakty RPC o odrzucone wpisy, flagę dostępności maila
   i dane do odliczania. Obecnie `friends_resend` przyjmuje tylko pending,
   `friends_reject` usuwa rekord zamiast zachować declined,
   a `subscribers_list` nie zwraca declined. Ponowienie przypomina mailem,
   nie tworzy nowego dostępu ani nie resetuje decyzji odbiorcy.
4. Bazy: mail/nazwa i lista znajomych z checkboxami oraz rolą w obu sekcjach;
   jedna lista udostępnionych, role i kompaktowe akcje po prawej.
5. Ankiety: wspólne sekcje odbiorców, stan głosu/odmowy i odliczanie;
   przypomnienie dla niegłosujących/odrzuconych. Zachować dwie karty oraz
   przejścia Głosów, globalne akcje umieścić nad nimi zgodnie z planem.
6. Ujednolicić treści i wygląd wszystkich maili (zaproszenia, przypomnienia
   i uwierzytelnianie), PL/EN/UK; zakres w `maile-granice.md`.
7. Domknąć graf zależności, blokady, kaskady, routing `/go/` i łagodny
   limit anonimowych głosów. Manual aktualizować dopiero na końcu.

Każda paczka wyglądu kończy się zrzutami z przykładowymi danymi; nie czekać
na osobną akceptację wyglądu przed dalszą pracą. Wykonane etapy powyżej
pozostają zamknięte; ta lista opisuje nowe doprecyzowania.

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
   rozgrywki**; dodatkowo sesja Control wygasa po godzinie bezczynności.
   Jej wygaśnięcie czyści rekordy Storage i unieważnia linki, po czym Control
   zaczyna ponownie od podłączania urządzeń (doprecyzowanie 2026-10-11).
   Nie zakładać, że `game_sessions` jest rejestrem sesji Control: aktualnie
   jest to tabela telemetrii przebiegów gry. Otwarty wygasły link: „Zaproszenie wygasło —
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

**Postęp implementacji:** wspólna bramka przed kolejką jest wdrożona na
produkcję w migracji `2026-10-11_323`. Pełny restore PG16, test lokalny i
izolowany job SQL `38126186374` są zielone; log migracji `38126386184`
potwierdza zastosowanie, a rollbackowy smoke test produkcyjny `38126593098`
przeszedł. Pozostałe zachowania tabeli nadal są planem do wykonania.

### Zasady per funkcja

| Obszar | Kto może być odbiorcą i jak dodać | Lista udostępnionych / stany | Ponowienie, cooldown i cofnięcie |
|---|---|---|---|
| Urządzenie w Control | Sekcje: „Mail lub nazwa użytkownika” (pole + Udostępnij) oraz „Znajomi, którym możesz udostępnić” (checkboxy, jeden przycisk Udostępnij). | Trzecia sekcja „Udostępnione” obejmuje odbiorców bieżącego urządzenia i sesji gry: znajomy z nazwą i etykietą „znajomy”; konto wyszukane nazwą/e-mailem z etykietą „konto”; adres bez konta z etykietą „mail”. Udostępniony znajomy znika z wyboru. Każdy wiersz ma X/kosz i widoczny cooldown. | Ponowienia maila nie ma. Aby wysłać ponownie, właściciel cofa konkretne udostępnienie i tworzy je ponownie. Dymek przy polu maila/nazwy pokazuje cooldown lub komunikat, że osobie już udostępniono urządzenie w tej sesji. Dostęp/token unieważniają się po cofnięciu. |
| Baza | Sekcje mail/nazwa użytkownika i znajomi; w obu wybór roli Edytor/Przeglądający. Znajomi wybierani checkboxami i wspólnym przyciskiem. Odbiorca musi mieć konto. | Wspólna lista udostępnionych pokazuje kanał/tożsamość, status (oczekuje, zaakceptowano, odrzucono), rolę i cooldown. | Rola zmieniana przy wierszu; cofnięcie unieważnia dostęp. Dla odrzuconego można ponowić zaproszenie zgodnie z cooldownem; to tylko przypominający e-mail do istniejącego zaproszenia. |
| Ankieta — karta „Głosy” (starsza nazwa planu: „Wyniki”) | Karta zachowuje wcześniej rozpisane zachowanie zależne od stanu: wyniki na żywo, surowe wyniki po zatrzymaniu, płynne przejście animacją do trybu podliczania i widok końcowy. | Na żywo odświeżają się liczby i paski bez przebudowy/przeskakiwania listy. Pełny opis przejść, stanów i animacji pozostaje w `ankiety-refaktor.md` §1 i §6.1–6.2. | Bez zmian w ramach poprawy wyglądu globalnego paska akcji. |
| Ankieta — karta „Udostępnianie” | Karta ma dwie sekcje: „Anonimowo” (link/QR dla każdego, kto go ma) oraz „Odbiorcy” (znajomi i subskrybenci, wybierani checkboxami, bez pola mailowego). | W sekcji Odbiorcy lista pokazuje: oczekuje/otworzył, zagłosował lub odrzucił. Każde udostępnienie jest przypisane do konkretnego uruchomienia ankiety. | Przyciski wewnątrz karty pozostają bez zmian. Dla oczekujących bez głosu i odrzuconych można ponowić przypominający e-mail z cooldownem (ukryty przy wyłączonych powiadomieniach). Usunięcie udostępnienia cofa zadanie i związane z nim głosy. |
| Ankieta — globalny pasek akcji | Akcje nad kartami zależą od stanu ankiety, zgodnie z `ankiety-refaktor.md` §1 i §6.1–6.2 (np. Uruchom, Zamknij, Przerwij, Podlicz głosy, Uruchom ponownie). | Zachować istniejące stany i przejścia karty Głosy; poprawa jest wizualna. | Użyć rozmiaru `.btn.sm` jak na stronie Gier; zachować główną akcję `.btn.gold` i „Przerwij” jako stonowany czerwony obrys `.pollAbort`. Na mobile przyciski mają być kompaktowe. Nie dotyczy przycisków wewnątrz kart, nawigacji ani zamykania dialogów/okien. |
| Znajomi | Po lewej dodawanie przez e-mail/nazwę; poniżej zaproszenia wychodzące oczekujące lub odrzucone. Po prawej znajomi oraz zaproszenia przychodzące z Akceptuj/Odrzuć. Bez wyszukiwarki list i bez dolnego paska narzędziowego. | Wiersze ze stanem; układ na komputerze: lewa/prawa kolumna. Telefon: cztery sekcje albo dwie karty, w układzie zgodnym z planem Znajomych. | Oczekujące i odrzucone zaproszenie wychodzące można ponowić jako mail przypominający do tego samego zaproszenia; nie tworzy nowego rekordu. X cofa oczekujące zaproszenie. Znajomego można usunąć. Usunięcie znajomości nie usuwa już przyjętych baz/urządzeń — są osobnymi uprawnieniami. Backend ma dziś friend invite/resend 5 dni, limit dwóch maili/30 dni i 30 dni po odmowie dla nowego zaproszenia. Zgodność ponowienia odrzuconego wpisu z jego stanem/tokenem wymaga dopięcia w implementacji. |
| Subskrybenci | Lista jednostronna dodawana e-mailem; układ bliski Znajomym, lecz bez propozycji przychodzących i bez sekcji znajomych. Bez wyszukiwarki list i bez dolnego paska narzędziowego. | Oczekujący i aktywni subskrybenci w wierszach ze stanem; wspólny CSS sekcji z odpowiednimi sekcjami Znajomych. | Ponowienie oczekującego/odrzuconego zaproszenia to e-mail przypominający z cooldownem; brak przycisku przy wyłączonych powiadomieniach. Usunięcie subskrybenta kończy subskrypcję. |

### Sesje, cofanie i czyszczenie zależności

**Stan implementacji kroku 6 (2026-10-11):** migracja `2026-10-11_324` dodaje
TTL sesji Control (60 minut), osobne tokeny linków parowania i odbiorców,
atomowe cofnięcie tokenu, gateway `/go/`, listę odbiorcy w
`list_shared_devices_for_me()` dla strony „Podłącz urządzenie” oraz reset stanu,
telemetrii, presence, kodów i odblokowania audio. Każde urządzenie waliduje
token przy ping/read/write/logo/audio. Stare globalne udostępnienia są
unieważniane, bo nie mają informacji o sesji. Lokalny restore PG16 + test SQL
324 zaliczył 21 asercji lokalnie i w izolowanym GitHub Actions
(`38128975422`), w tym aktywne/odrzucone tokeny, wyłączone powiadomienia
i odkrywanie grantu bez maila. Unit: 401/401. Migracja 324 oraz front są już
wdrożone (`main` `e9bf7c7ba`, Pages `38129037981` ✓, DB `38129037842` ✓).
Branch E2E parowania `38129156808` przeszedł. Kontrola mailowa
`38129255218` wykryła różnicę typów: produkcyjne `auth.users.email` jest
`varchar`, lokalny stub `text`; migracja 325 rzutuje wynik listy na `text`.
Migracja 325 przeszła Agent checks `38129652050` i wdrożyła się produkcyjnie
runem `38129693122`. W E2E `38129826723` RPC listy i utworzenie grantu
przeszły, mail dotarł i link zadziałał przy ponowieniu; pierwsza próba
przekroczyła domyślne 90 s, bo kolejka była nadal pending. Limit testu
wydłużono do 150 s; przebieg `38130087825` przeszedł czysto (1/1), mail
dotarł w 104 s i link otworzył urządzenie bez logowania. Produkcyjny
rollbackowy expiry smoke w DB workflow `38130590463` przeszedł: potwierdził
minutowy cron, wygaśnięcie po 60 minutach, reset Control do podłączenia
urządzeń, zakończenie telemetrii, unieważnienie tokenów oraz usunięcie kodów,
presence i odblokowania audio. Krok 6 — Control — wdrożony i sprawdzony.

| Zdarzenie nadrzędne | Skutek dla udostępnień i odbiorców |
|---|---|
| Ankietę otwarto ponownie po zamknięciu/przerwaniu | Nowy przebieg: nowy klucz, nowe sesje i wyczyszczone zadania/udostępnienia poprzedniego przebiegu. Zaproszenia są przypięte do uruchomienia, nie do całej gry. |
| Ankietę zamknięto i podliczono | Sesje głosowania są zamknięte; oczekujące/otwarte zaproszenia są kasowane. Wykonane i odrzucone wpisy zostają jako historia do kolejnego otwarcia, które czyści poprzedni przebieg. |
| Ankietę przerwano | Głosy, wpisy, sesje i wszystkie zadania udostępnienia są kasowane; klucz jest rotowany. |
| Udostępnienie ankiety cofnięto | Usuwa się zaproszenie/zadanie i głos tej osoby z bieżącego przebiegu. |
| Udostępnienie bazy lub urządzenia cofnięto | Unieważnia się konkretny rekord/token; nie wolno pozostawiać działającego linku. Usunięcie znajomości nie cofa odrębnych przyjętych uprawnień do zasobów. |
| Gra/ankieta, baza lub konto nadrzędne usunięte | Kaskadowo unieważnić udostępnienia, tokeny i oczekujące maile/zadania zależne od zasobu. Usunięcie konta odbiorcy usuwa jego relacje/udostępnienia i nie pozwala nowemu kontu odzyskać starych. |
| Sesja Control bezczynna przez godzinę | Wygasić sesję Control, usunąć jej rekordy Storage i unieważnić udostępnienia urządzeń tej sesji. Po wygaśnięciu ekran zaczyna proces od początku i ponownie pokazuje podłączanie urządzeń. Aktywność odnawia termin; dokładny sygnał aktywności i zakres kluczy Storage należy dopiąć w implementacji. |

**Mapowanie Control (2026-10-11):** aktualny stan do wyzerowania jest w
`game_state` (domyślna para to `devices` / `devices_display`); telemetria
przebiegów (`game_sessions`, `game_session_active`) nie jest sesją runtime.
Kody parowania są w `device_connect_codes`, obecne granty w `shared_devices`,
a `device_presence` wygasa operacyjnie po 6,5 s. Control nie trzyma stanu
rozgrywki w `localStorage`; `sessionStorage` zawiera tylko początek animacji
ekranu końcowego. Logo i pliki dźwiękowe w Storage należą do gry i mają
przetrwać wygaśnięcie Control. Potrzebny jest osobny rejestr sesji runtime,
do którego będą przypięte kody oraz share tokeny. Zasada per odbiorca wymaga,
by link zaproszenia niósł ten token przez `/go/` aż do endpointów urządzenia;
redirect do globalnego `share_key_*` nie zapewnia selektywnego cofnięcia.

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

**Doprecyzowanie wyglądu:** wspólny wzorzec kompaktowych akcji i liczników
opisuje `ujednolicenie-wygladu.md`, podsekcja „Kompaktowe akcje i liczniki”.
Wszystkie ostatnie doprecyzowania obowiązują wspólnie w modalu Control,
modalu Baz i sekcjach udostępniania Ankiet: układ nazwy/statusów i akcji,
rozmiary przycisków, małe liczniki, wyszarzenie przy cooldownie, przycisk
udostępniania po prawej, etykieta „ma konto”, osobne przewijanie list
oraz wspólny dymek nad polem znikający po 3 s. Realizować przez wspólne
komponenty i CSS, a nie osobne wersje wyglądu na poszczególnych stronach.
Ponowienie ma ikonę okrężnej strzałki i mały licznik pod przyciskiem;
strzałka i kosz/X mają takie same wymiary, stoją obok siebie po prawej
i zajmują wysokość wiersza. Nazwa/mail są po lewej; statusy obok, jeśli
mieszczą się w jednej linii, w przeciwnym razie pod nimi.
Przełącznik roli w Bazach należy do tej samej grupy akcji obok kosza/X,
ma podobną wielkość i taką samą wysokość.
Dostępność pokazuje odliczanie do zera bez powtarzanych zdań. Format czasu
dobierany jest do jego skali. Nie zmienia to polityk cooldownu ani braku
ponowienia w Control. Karta Urządzeń Control zachowuje poprzedni wygląd
i dotychczasowy guard na telefonach.

Obecne wartości polityk są zapisane w [`maile-granice.md`](maile-granice.md):
udostępnienie bazy 24 h, urządzenia 1 h, ankieta 24 h na parę/ankietę,
zaproszenie subskrypcyjne 5 dni, jego ponowienie 5 dni; zaproszenie do
znajomych i przypomnienie 5 dni, limit dwóch maili/30 dni, po odmowie 30 dni
do nowego zaproszenia. Dla maili ankietowych obowiązuje także limit 3/24 h na
nadawcę i odbiorcę oraz maksymalnie dwa przypomnienia na przebieg. Dla zmiany
roli/cofnięcia należy zinwentaryzować backend; cofnięcie jest natychmiastowe,
a cooldown może ograniczać tylko ponowną wysyłkę maila, nigdy utrzymać dostęp.

Weryfikacja kodu 2026-10-11: brak IP-limit w kliencie/migracjach; anonimowe
głosy z sekcji „Anonimowo” karty Udostępnianie zapisują się pod losowym `voter_token` z `localStorage`, per gra i klucz
uruchomienia. Przed głosem klient sprawdza też lokalny znacznik „już głosował”.
DB ma unikalność per sesja pytania i `voter_token`; klient może ominąć tę
tożsamość przez wyczyszczenie danych. Plan łagodnego limitu częstotliwości
opisano wyżej. Ustalić niezarejestrowany adres urządzenia z wyłączonymi
powiadomieniami (konto zachowuje ścieżkę Zadania, adres bez konta może dostać
link poza kolejką tylko przez jawne skopiowanie przez właściciela); ustalić
czy cooldown cofnięcia/zmiany roli ma już politykę backendową.

### Powiązanie z blokadami zasobów

Hierarchia zasobów i dziedziczenie blokad są wspólnym modelem dla E19 i
[`blokady-zasobow.md`](blokady-zasobow.md). Udostępnienie jest operacją
potomną: nie blokuje edycji treści, ale musi atomowo sprawdzić rodzica, jego
stan, uprawnienia właściciela i blokadę operacji destrukcyjnej. Mapa locków i
zasady dziedziczenia są opisane w planie blokad; nie powstaje drugie, odrębne
drzewo.

### Anonimowy token przeglądarki — propozycja do implementacji

1. Zostawić losowy identyfikator wyłącznie dla danej gry i uruchomienia; bez
   IP, fingerprintingu ani wspólnego identyfikatora między grami.
2. Rozdzielić go od `voter_token` pojedynczego głosu. Stały token przeglądarki
   służy wyłącznie do limitu tempa; nowy token głosu pozwala oddać kolejny
   anonimowy głos bez nadpisywania poprzedniego.
3. Rezerwować tempo atomowo w RPC/bazie dla `(game_id, share_key_poll,
   hash(browser_token))`. Proponowane minimum: odstęp **30 sekund między
   pełnymi wysłaniami ankiety** z tej samej przeglądarki; bez dziennego ani
   łącznego limitu. Odrzucenie zwraca `retry_after`, UI pokazuje krótki
   komunikat.
4. Rezerwację wykonać raz na kompletny formularz, nie raz na pytanie ani chunk
   (klient może dzielić duże ankiety na kilka RPC). Odróżnić anonimowy link od
   zaproszenia zadaniowego; zadania nie zużywają anon limitu.
5. Rotacja `share_key_poll`, zamknięcie/przerwanie i usunięcie gry porządkują
   liczniki razem z przebiegiem. Brak śledzenia między przebiegami lub grami.

To ogranicza przypadkowe wielokrotne/dwukrotne wysłanie i prosty automat, nie
jest dowodem unikalnej osoby ani ochroną przed celowym obejściem (token można
skasować lub podmienić). 30 s to propozycja do wdrożenia; zachowuje
nieograniczoną łączną liczbę głosów i nie karze osób we wspólnej sieci.

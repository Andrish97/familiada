# E19 — Znajomi, Subskrybenci, Zadania: plan techniczny

Decyzje: [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md), sekcje od
„Udostępnianie — wiersze, role, sekcje wg stanu (E19)” do końca. Zasady pracy:
[`wdrozenia.md`](wdrozenia.md). Nowe migracje od **320**.

Rozbieżność do poprawy: `usuwanie-danych.md` (tabela „dziś”, wiersz 43) mówi,
że subskrypcje po e-mailu zostają po usunięciu konta — decyzja 2026-10-07
i E19 oraz obecny `delete_user_everything` je usuwają (tabela opisuje stan
sprzed E12).

## 1. Model danych

> **Stan aktualny:** opis320 poniżej jest historycznym modelem wykonanego
> etapu, nie aktualną specyfikacją odmów. Odmowy Znajomych329,
> Subskrybentów333–336 oraz Baz337–339 i Ankiet340–344 wdrożone
> i sprawdzone produkcyjnie. Wypisanie Znajomych346 także zamknięte:
> DB38174746414/log21:04:59, branch38174928575/38175511620 oraz
> main38175836595 ✓3/3 bez retry/unit447.
> Aktualne zasady są w §7 i końcowych podsekcjach pkt7.

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
  **Aktualizacja 2026-10-11:** ikony pochodzenia po lewej zamiast inicjału;
  delikatne kolory ankiet/baz/urządzeń. Telefon: krótszy opis bez dat,
  maksymalnie dwie linie tytułu/opisu, mniejsza ikona. Desktop: pełne opisy.
  Szczegóły i zrzuty: „Zadania — odstępy i pełny przegląd kafelków” niżej;
  ogólny przegląd ograniczenia informacji na telefonie należy do E20.
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
  inicjałem (w Zadaniach ikoną pochodzenia `avatarIcon`), szarą linijką
  (opcjonalny skrót mobilny `noteMobile`) i kanałem (`friend|subscriber|mail`), akcje w
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
| 2. Komponent wierszy (`renderRowSections`/`rowEl` w `share-sections.js`) + `/tasks/` | **zrobione** — e2e `tasks`, `frontend-navigation`, `go` zielone; późniejsze ikony/kolory produkcja 38139841640 ✓, kompaktowy mobile produkcja 38140200630 ✓ (3/3 + unit 408/408), zrzuty i tabela stanów niżej |
| 3. `/friends/`, `/subscribers/` + migracja 321 (przełączenie), usunięcie `/subscriptions/` | **zrobione** — migracja 321, front, Pages i Worker wdrożone; runner SQL/unit 38096872246 ✓; kontrole produkcji: friends 38099344264 (2/2), subscribers 38099196468 (2/2), go 38099459575 (2/2), frontend-navigation 38099534030 (11/11), account-deletion 38099771245 (1/1), regresja dźwięku 38099849073 (2/2); unit 401/401 w każdym przebiegu |
| 4. Ankieta: udostępnianie oknem (Znajomi · Subskrybenci), jedna lista odbiorców | **zrobione** — branch po synchronizacji 38100967351 ✓; Pages 38101052370 ✓; produkcja 38101089865 ✓, unit 401/401. Test zaliczył retry: pierwsza próba nie doczekała maila, który nadal był w kolejce; retry zakończył się pomyślnie |
| 5. Bazy: jedno okno (udostępnieni + dodawanie), `go?b=`, akceptacja w `/tasks/` | **zrobione** — migracja 322 i front na produkcji; runner SQL 38101686798 ✓; Pages 38102630814 ✓; branch E2E 38102541764 ✓; produkcyjne E2E 38103300067 ✓, 2/2, unit 401/401. Cron `*/2` aktywny; po wydłużeniu timeoutu mail test8 dotarł po 33 s; oba scenariusze bazy zaliczone |
| 6. Urządzenia: jedno okno, odbiorca bez konta, token unieważniany per osoba i sesję Control | **zrobione — backend i TTL sprawdzone produkcyjnie (38130087825, 38130327633, 38130590463); dopracowany modal i przywrócony styl Urządzeń na main `44063a604`, Pages 38133157139 ✓, branch 38132982841: 2/2 + unit 401/401; kontrola produkcyjna nowego UI 38133215588 ✓: 2/2 + unit 401/401** |
| 7. Ujednolicenie Znajomych, Subskrybentów i udostępnień wg tabeli zachowań | **w toku — implementacja**; Control i układ kontaktów na produkcji (38134439124: 4/4); kontrakty odmów/cooldownów, Bazy/Ankiety i przegląd maili nadal do wdrożenia |

### Dalsza realizacja kroku 7 po zamknięciu Control

1. Przenieść wspólne reguły sekcji/list/checkboxów z modala Control do
   wspólnego komponentu i CSS. Zachować gotowy wygląd Control jako wzorzec.
2. Znajomi/Subskrybenci: formularz w karcie, bez wyszukiwania i dolnego
   paska; oczekujące/odrzucone obok formularza, znajomi i propozycje po
   prawej (Subskrybenci bez propozycji); na telefonie dwie zakładki
   z wypustkami jak w Grach. Formularz/sekcje/statusy gotowe; zakładki
   w paczce kończącej pkt 2 (branch, potem produkcja).
3. Uzupełnić kontrakty RPC o odrzucone wpisy, flagę dostępności maila
   i dane do odliczania. Paczka 328 zachowuje odmowę znajomości, ale pozwala
   przypomnieć odrzucone — nowa decyzja wymaga zablokowania tego w RPC i UI.
   `subscribers_list` nadal nie zwraca declined. Ukrywanie po czasie nie
   kasuje decyzji ani limitów; szczegóły w §7 „Odmowy i duplikaty”.
4. Bazy: mail/nazwa i lista znajomych z checkboxami oraz rolą w obu sekcjach;
   jedna lista udostępnionych, role i kompaktowe akcje po prawej.
5. Ankiety: wspólne sekcje odbiorców, stan głosu/odmowy i odliczanie;
   przypomnienie tylko dla niegłosujących, którzy nie odrzucili. Zachować dwie karty oraz
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

### Odmowy i duplikaty — aktualizacja 2026-10-11

- **Potwierdzone:** Znajomi/Subskrybenci/Bazy/Ankiety — po wyraźnej odmowie
  nie wysyłamy przypomnień. Ukryty przycisk i odmowa RPC; samo ukrycie
  przycisku nie wystarcza. Oczekujące bez decyzji zachowują Ponów z limitami.
- **Najnowsza decyzja:** odmowa zaproszenia do znajomości, subskrypcji lub
  bazy nie może trwale uniemożliwiać ponownego dodania osoby. Odrzucone
  wpisy znikają z list, a następnie sama odmowa i stary token tracą ważność.
  Działa to jako niejawny cooldown, bez licznika przy odrzuconym kafelku.
- Przyjęty parametr realizacji: **30 dni od pierwszej odmowy** do jej
  wygaśnięcia (zgodnie z dotychczasową karencją znajomości/subskrypcji).
  Użytkownik nie wskazał liczby dni; to założenie realizacji. Dla znikania
  kafelka z list **nadawcy** pozostaje **propozycja 5 dni**, nie ustalony
  osobno wymóg. Odbiorca zachowuje własną odmowę do jej wygaśnięcia.
  Ponowne kliknięcie Odrzuć nie przesuwa terminu. Ukrycie przed upływem
  30 dni nie pozwala obejść blokady przez mail/nazwę, cofnięcie lub usunięcie.
- Wygaśnięcie nie uruchamia żadnego maila, nie akceptuje zaproszenia ani
  nie nadaje dostępu. Dopiero jawne dodanie po karencji tworzy nowe pending
  z nowym tokenem i wymaga nowej decyzji odbiorcy. Stary token pozostaje
  nieważny i nie może przyjąć nowego zaproszenia.
- **Cofnięcie własnej odmowy (doprecyzowanie użytkownika):** odbiorca
  zachowuje odrzucone przez siebie zaproszenie przez cały okres ważności
  odmowy, nawet po ukryciu kafelka u nadawcy. Kompaktowa, domyślnie zwinięta
  sekcja „Odrzucone przeze mnie” z akcją **„Cofnij odmowę”**. Nie mieszać
  jej z aktywnymi propozycjami ani Zrobione.
- „Cofnij odmowę” przywraca istniejące zaproszenie do **oczekujących**.
  Nie oznacza akceptacji: znajomość i dostęp do bazy wymagają
  jeszcze jawnego „Akceptuj”. Nie powstaje nowy rekord/token/mail; daty
  wysyłek i zużyte limity pozostają. Samo cofnięcie nie wysyła przypomnienia.
  Przywrócony wiersz przechodzi do zwykłych oczekujących.
- Dostępność tej sekcji: Znajomi — przy Propozycjach; zaproszenia do baz
  — w Bazy → Udostępnione. Subskrypcje dotyczą wyłącznie osób bez konta;
  nie mają listy własnych odmów ani cofnięcia odmowy.
  **Subskrypcja bez konta: odmowa nieprzywracalna przez 30 dni**, bez
  akcji undo w /go/. Nie dodajemy
  propozycji przychodzących na jednostronnej stronie Subskrybenci nadawcy.
- **Wygląd cofnięcia (doprecyzowanie 2026-10-11):** użyć istniejącej
  ikony `undo` (zawinięta strzałka w lewo), bez napisu w przycisku;
  title/aria-label „Cofnij odmowę”. Ten sam komponent, rozmiar i miejsce
  po prawej co pozostałe akcje wiersza. Bez licznika; ikona `refresh`
  nadal oznacza wysłanie przypomnienia, więc nie używać jej dla cofnięcia.
  Nazwa po lewej, drugi wiersz: nadawca/rola i status Odrzucono.
- Nagłówek zwijanej sekcji: chevron + „Odrzucone przeze mnie” + liczba
  wpisów. Ukryć sekcję, gdy jest pusta; po otwarciu własne przewijanie
  zgodnie ze wspólnym komponentem. Znajomi: ostatnia sekcja prawej karty,
  pod Propozycjami; bazy: pod listą w istniejącej zakładce Bazy → Udostępnione.
- **Doprecyzowanie 2026-10-11:** każda sekcja „Odrzucone przeze mnie”
  jest całkowicie ukryta, gdy nie ma wpisów (bez nagłówka ani pustego stanu).
  W Bazach pozostaje na dole zakładki Udostępnione, nad paskiem narzędzi;
  kafelki baz i rozwinięta lista odmów przewijają się niezależnie.
  Dotyczy również docelowego landscape; istniejący wyjątek przewijania
  całej strony wymaga poprawy w przeglądzie E20, nie jest docelową regułą.
  Bez nowej karty lub zakładki w Bazach. Zadania nie pokazują odmów baz.
- **Bazy — korekta opisu miejsca:** obecnie Akceptuj/Odrzuć istnieją
  zarówno w Bazy → Udostępnione, jak i w Zadaniach; oba ekrany używają
  tego samego task_id i RPC. **Nowsza decyzja: usunąć bazy z Zadań**
  w kolejnej paczce i zostawić obsługę w Bazach. Sekcja cofnięcia odmowy bazy
  jest w Bazy → Udostępnione. Cofnięcie przywraca propozycję bazy; Akceptuj
  dopiero nadaje dostęp. Właściciel widzi odmowę w oknie udostępniania,
  bez prawa cofnięcia za odbiorcę. Przed przywróceniem sprawdzić aktualną
  ważność zaproszenia, bazę i oferowaną rolę; nie odtwarzać danych z kafelka.
- Cofnąć odmowę może wyłącznie właściwy odbiorca (konto; subskrypcja bez konta nie ma tej akcji). Serwer sprawdza ważność i stan nadrzędnego zasobu.
  Jeśli nadawca cofnął zaproszenie, usunął zasób/konto lub odmowa wygasła,
  akcja nie przywraca niczego; UI/Go pokazują powód niedostępności.
  Po wygaśnięciu/cofnięciu starego wpisu potrzebne jest nowe zaproszenie.
- Ankiety nie potrzebują takiej ścieżki zmiany decyzji; zaproszenie pozostaje
  przypisane do uruchomienia. Odmowa nie pozwala przypominać w tym przebiegu.
- **Aktualna decyzja 2026-10-11: wypisanie = odmowa.** Wypisanie z aktywnej
  subskrypcji podlega tym samym terminom 5/30 dni i blokuje stary token;
  po karencji możliwe nowe jawne zaproszenie. Nie dodajemy trwałej blokady
  konkretnego nadawcy ani osobnego mechanizmu przywracania wypisania.
  Globalne wyłączenie maili pozostaje osobną flagą; upływ karencji jej
  nie resetuje, nie reaktywuje subskrypcji i nie wysyła maila.
- Wpisanie e-maila lub nazwy tej samej osoby rozstrzygamy po identyfikatorze
  konta, nie po tekście pola; duplikat nie tworzy rekordu ani maila.

| Stan relacji | Docelowe zachowanie dodawania |
|---|---|
| Ta osoba już jest znajomym | „Ta osoba jest już Twoim znajomym.” |
| Ta osoba wysłała nam oczekującą prośbę | „Masz oczekującą prośbę od tej osoby. Sprawdź Propozycje.”; wskazać właściwy wpis, bez automatycznej akceptacji. |
| My już wysłaliśmy oczekującą prośbę | „Zaproszenie do tej osoby już oczekuje na odpowiedź.”; wskazać wpis, bez ponownej wysyłki. |
| My odrzuciliśmy jej prośbę, odmowa jeszcze ważna | „Cofnij odmowę” w „Odrzucone przeze mnie”, potem zwykłe „Akceptuj”; bez automatycznego maila. |
| Ta osoba odrzuciła naszą prośbę, odmowa jeszcze ważna | Informacja o odmowie, bez Ponów i bez nowego zaproszenia, również po ukryciu kafelka. |
| Odmowa wygasła | Można jawnie utworzyć nowe zaproszenie z nowym tokenem, z normalną kontrolą flagi mailowej i limitów. |

**Obecna implementacja 328:** prośba krzyżowa automatycznie przyjmuje
istniejącą prośbę (pending lub declined); duplikat aktywnego znajomego
zwraca `already`, a UI pokazuje ogólne „Ta osoba jest już na liście”.
Odrzucony rekord sam nie wygasa i blokuje nowe dodanie przez `already`.
Powyższy kontrakt jest korektą do wdrożenia, nie opisem działającej wersji.

Pokrycie korekty: oba kierunki, pending/active/declined, e-mail/nazwa,
cofnięcie odmowy przed wygaśnięciem, osobna akceptacja, odmowa widoczna
odbiorcy/ukryta nadawcy, granica 30 dni,
nowe zaproszenie po wygaśnięciu, nieważny stary token, brak automatycznej
kolejki, wyłączone maile, bezpośredni RPC, wyścigi nowych zaproszeń,
cofnięcie/usunięcie konta/rodzica, osobno rezygnacja z subskrypcji,
niezmienione limity po cofnięciu odmowy, cudze RPC/tokeny, konto/bez konta.

### Odmowy — oba kierunki i czas życia (doprecyzowanie 2026-10-11)

> **Zatwierdzenie użytkownika:** „Wszystkie propozycje są rozpisane dobrze”.
> Parametry tabeli są przyjęte: ukrycie u nadawcy po 5 dniach, wygaśnięcie
> odmowy znajomości/subskrypcji/bazy po 30 dniach, zachowanie własnej odmowy
> odbiorcy z kontem do wygaśnięcia, brak undo subskrypcji bez konta.
> Wcześniejsze oznaczenia tych liczb jako propozycji opisują etap ustaleń.


**Parametry planu:** 30 dni od odmowy dla znajomości/subskrypcji/bazy
(założenie realizacji); ukrywanie u nadawcy po 5 dniach nadal propozycją,
nie liczbą wybraną przez użytkownika. U odbiorcy z kontem własna odmowa
pozostaje do wygaśnięcia. Nie odnawiać okresu przez powtórne Odrzuć.

| Przypadek | Nadawca po odmowie | Odbiorca po odmowie | Cofnięcie i koniec ważności |
|---|---|---|---|
| Znajomość | Wychodzące: Odrzucono, bez Ponów; ukrycie po proponowanych 5 dniach. Nowe dodanie zablokowane do 30 dni niezależnie od maila/nazwy lub usunięcia kafelka. | Zwinięte „Odrzucone przeze mnie” pod Propozycjami w prawej karcie Znajomych, do 30 dni. | Odbiorca: undo → oczekująca propozycja → osobne Akceptuj. Po 30 dniach odmowa wygasa, oba wpisy znikają, stary token nieważny. Nowa prośba możliwa w dowolnym kierunku. |
| Subskrypcja — odbiorca bez konta | Tak samo: bez Ponów, ukrycie po proponowanych 5 dniach, nowe zaproszenie dopiero po 30 dniach. | Brak listy własnych odmów. Go pokazuje Odrzucono, **bez cofnięcia i bez Akceptuj**. | **Decyzja użytkownika: odmowa nieprzywracalna aż do wygaśnięcia 30 dni.** Potem nowe jawne zaproszenie z nowym linkiem; starego nie reaktywujemy. Założenie konta w międzyczasie nie omija tej blokady (zachować tryb odmowy). |
| Baza | Właściciel: Odrzucono w oknie udostępniania danej bazy, bez Ponów; ukrycie po proponowanych 5 dniach. Kolejne udostępnienie tej samej bazy temu odbiorcy zablokowane przez 30 dni, również po zmianie roli/cofnięciu. Inna baza jest osobnym zaproszeniem. | Zwinięte „Odrzucone przeze mnie” w Bazy → Udostępnione, pod listą baz, do 30 dni. Nazwa bazy, nadawca, rola, Odrzucono, undo; bez dostępu do zawartości. | Undo → oczekująca propozycja; Akceptuj w Bazach nadaje dostęp. Obecne Akceptuj/Odrzuć w Zadaniach usuwamy w kolejnej paczce; docelowo obsługa tylko w Bazach. Po 30 dniach stary token nieważny i możliwe nowe udostępnienie. |
| Ankieta — zadanie w konkretnym uruchomieniu | Lista odbiorców: Odrzucono, bez Ponów w całym tym uruchomieniu; kafelek można ukryć po proponowanych 5 dniach lub wcześniej przy końcu nadrzędnego przebiegu. Ukrycie nie umożliwia kolejnego zaproszenia w tym samym przebiegu. | Zadanie znika z Do zrobienia natychmiast po odmowie; nie trafia do Zrobione ani Odrzucone przeze mnie. | Zgodnie z wcześniejszym ustaleniem brak cofnięcia odmowy ankiety. Brak reguły 30 dni; decyzja związana z uruchomieniem. Nowe uruchomienie czyści poprzednie udostępnienia i może tworzyć nowe. |

**Reguły krzyżowe i nadrzędne:**
- Cofnięcie przez nadawcę, usunięcie bazy/konta lub wygaśnięcie nadrzędnego
  zasobu usuwa możliwość undo. Ukrycie kafelka nie jest cofnięciem.
- Wcześniejsze anulowanie/usunięcie zaproszenia nie skraca karencji odmowy.
  Zachować minimalny zegar odmowy niezależny od widocznego rekordu.
- Undo zmienia tylko decyzję właściwego odbiorcy i nie wysyła maila.
  Nie resetuje tokenu, liczby wysyłek ani dat limitów. Ponów pozostaje
  oddzielną akcją oczekującego zaproszenia, według flagi i zachowanych limitów.
- Odmowy anonimowej subskrypcji nie przenosić automatycznie do aktywnej
  subskrypcji ani nie umożliwiać undo przez claim po założeniu konta.
- Porządkowanie baz musi uwzględnić nowe 30 dni odmowy: obecny komentarz
  w handleShareLink opisuje usuwanie tasków po 5 dniach; zbadać i zmienić
  cleanup tak, by nie usuwał przedwcześnie przywracalnej odmowy.
- Kontrakty list, RPC, Go, cleanup i limity korzystają z tego samego terminu.
  Przy wyścigu wygaśnięcia/undo/nowego zaproszenia decyduje stan serwera.

Tabela jest docelowym kontraktem; nie opisuje jeszcze wdrożonego zachowania.
Zrzuty każdego przypadku dopiero po realizacji na rzeczywistych komponentach.

### Zasady per funkcja

| Obszar | Kto może być odbiorcą i jak dodać | Lista udostępnionych / stany | Ponowienie, cooldown i cofnięcie |
|---|---|---|---|
| Urządzenie w Control | Sekcje: „Mail lub nazwa użytkownika” (pole + Udostępnij) oraz „Znajomi, którym możesz udostępnić” (checkboxy, jeden przycisk Udostępnij). | Trzecia sekcja „Udostępnione” obejmuje odbiorców bieżącego urządzenia i sesji gry: znajomy z nazwą i etykietą „znajomy”; konto wyszukane nazwą/e-mailem z etykietą „konto”; adres bez konta z etykietą „mail”. Udostępniony znajomy znika z wyboru. Każdy wiersz ma X/kosz i widoczny cooldown. | Ponowienia maila nie ma. Aby wysłać ponownie, właściciel cofa konkretne udostępnienie i tworzy je ponownie. Dymek przy polu maila/nazwy pokazuje cooldown lub komunikat, że osobie już udostępniono urządzenie w tej sesji. Dostęp/token unieważniają się po cofnięciu. |
| Baza | Sekcje mail/nazwa użytkownika i znajomi; w obu wybór roli Edytor/Przeglądający. Znajomi wybierani checkboxami i wspólnym przyciskiem. Odbiorca musi mieć konto. | Wspólna lista udostępnionych pokazuje kanał/tożsamość, status (oczekuje, zaakceptowano, odrzucono), rolę i cooldown. | Rola zmieniana przy wierszu; cofnięcie unieważnia dostęp. Przypomnienie tylko dla oczekujących, z cooldownem i flagą mailową. Po odmowie brak Ponów; wpis znika z listy po okresie widoczności (§7 „Odmowy i duplikaty”). |
| Ankieta — karta „Głosy” (starsza nazwa planu: „Wyniki”) | Karta zachowuje wcześniej rozpisane zachowanie zależne od stanu: wyniki na żywo, surowe wyniki po zatrzymaniu, płynne przejście animacją do trybu podliczania i widok końcowy. | Na żywo odświeżają się liczby i paski bez przebudowy/przeskakiwania listy. Pełny opis przejść, stanów i animacji pozostaje w `ankiety-refaktor.md` §1 i §6.1–6.2. | Bez zmian w ramach poprawy wyglądu globalnego paska akcji. |
| Ankieta — karta „Udostępnianie” | Karta ma dwie sekcje: „Anonimowo” (link/QR dla każdego, kto go ma) oraz „Odbiorcy” (znajomi i subskrybenci, wybierani checkboxami, bez pola mailowego). | W sekcji Odbiorcy lista pokazuje: oczekuje/otworzył, zagłosował lub odrzucił. Każde udostępnienie jest przypisane do konkretnego uruchomienia ankiety. | Przyciski wewnątrz karty pozostają bez zmian. Dla oczekujących bez głosu, którzy nie odrzucili, można ponowić przypominający e-mail z cooldownem (ukryty przy wyłączonych powiadomieniach). Usunięcie udostępnienia cofa zadanie i związane z nim głosy. |
| Ankieta — globalny pasek akcji | Akcje nad kartami zależą od stanu ankiety, zgodnie z `ankiety-refaktor.md` §1 i §6.1–6.2 (np. Uruchom, Zamknij, Przerwij, Podlicz głosy, Uruchom ponownie). | Zachować istniejące stany i przejścia karty Głosy; poprawa jest wizualna. | Użyć rozmiaru `.btn.sm` jak na stronie Gier; zachować główną akcję `.btn.gold` i „Przerwij” jako stonowany czerwony obrys `.pollAbort`. Na mobile przyciski mają być kompaktowe. Nie dotyczy przycisków wewnątrz kart, nawigacji ani zamykania dialogów/okien. |
| Znajomi | Po lewej dodawanie przez e-mail/nazwę; poniżej zaproszenia wychodzące oczekujące lub odrzucone. Po prawej znajomi oraz zaproszenia przychodzące z Akceptuj/Odrzuć. Bez wyszukiwarki list i bez dolnego paska narzędziowego. | Wiersze ze stanem; układ na komputerze: lewa/prawa kolumna. Telefon: cztery sekcje albo dwie karty, w układzie zgodnym z planem Znajomych. | Tylko oczekujące zaproszenie wychodzące można ponowić jako mail przypominający do tego samego zaproszenia; nie tworzy nowego rekordu. X cofa oczekujące zaproszenie. Znajomego można usunąć. Usunięcie znajomości nie usuwa już przyjętych baz/urządzeń — są osobnymi uprawnieniami. Backend ma dziś friend invite/resend 5 dni, limit dwóch maili/30 dni i 30 dni po odmowie dla nowego zaproszenia. Po odmowie bez ponowienia; widoczność i zmiana decyzji zgodnie z §7 „Odmowy i duplikaty”. |
| Subskrybenci | Lista jednostronna dodawana e-mailem; układ bliski Znajomym, lecz bez propozycji przychodzących i bez sekcji znajomych. Bez wyszukiwarki list i bez dolnego paska narzędziowego. | Oczekujący i aktywni subskrybenci w wierszach ze stanem; wspólny CSS sekcji z odpowiednimi sekcjami Znajomych. | Ponowienie wyłącznie oczekującego zaproszenia to e-mail przypominający z cooldownem; brak przycisku przy wyłączonych powiadomieniach. Usunięcie subskrybenta kończy subskrypcję. |

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

### Krok 7 — paczka metadanych kontaktów (2026-10-11)

- `contacts_list(p_kind)` dodaje metadane do obecnych kontaktów: `email_enabled`
  i `resend_available_at`. Czas z tych samych rezerwacji i limitów co RPC
  ponowienia; stare `friends_list`/`subscribers_list` dla udostępnień zachowane.
- Pierwsze przypomnienie znajomości czeka także na wygaśnięcie rezerwacji
  pierwszego zaproszenia (5 dni), zamiast korzystać z pustego drugiego zegara.
- Flaga mailowa wyłącza przycisk przypomnienia i bezskutkowo kończy wywołanie
  `friends_resend`: bez zwiększenia licznika/rezerwacji, dostęp nadal istnieje.
- Wspólny kafel: strzałka i licznik pod nią, wyszarzenie podczas zwłoki,
  cofnięcie nadal dostępne. Licznik wygasa na żywo bez przeładowania strony.
- Ta paczka nie zmienia stanu odmowy. Zachowanie odrzuconych i trwały limit
  maili po usunięciu relacji pozostają następną częścią kontraktów.
- Polecenie użytkownika: kontynuować zawsze bez pytania, po paczce przechodzić
  dalej; zrzuty po wykonaniu i obowiązkowy cykl kontroli produkcji pozostają.

### Skróty kontaktów (decyzja użytkownika 2026-10-11)

Dodać ikony na przyciskach Znajomych/Subskrybentów, konsekwentne skróty
na stronach, gdzie były Subskrypcje, i „Znajomi” w Control. Szczegóły
routingów i powrotów: `nawigacja-mapa-plan.md`, „Skróty kontaktów”.
Doprecyzowanie: przycisk „Znajomi” w Control **tymczasowo zablokowany**;
odblokować przy wskazanym przez użytkownika etapie usuwania stron modalnych,
nie wcześniej. Pozostałe skróty aktywne.

### Zależność: przegląd stron modalnych i starych funkcjonalności

Przed odblokowaniem Control → Znajomi wykonać dodatkowy przegląd istniejących
funkcji i pełnej mapy przejść, opisany w `nawigacja-mapa-plan.md`, „E19 —
przegląd starych przejść po usuwaniu stron modalnych”. Obejmuje mapę PAGES,
wszystkie stare wejścia, powroty/parametry/język, zapis i blokady oraz testy
wznowienia Control. Historyczny E7 jest wykonany; nowa zależność
`modalPagesReview` pozostaje otwarta i nie wynika z samego statusu E7.

### Zadania — odstępy i pełny przegląd kafelków (2026-10-11)

> **Nowsza decyzja:** Zadania tylko dla ankiet. Poniższy przegląd wszystkich
> rodzajów dokumentuje wykonany etap; w kolejnej paczce usuwamy z Tasks
> bazy i urządzenia, zachowując obsługę na ich właściwych stronach.


Zgłoszenie użytkownika: poprawić odstępy i pokazać każdy rodzaj oraz stan
zadania. Przegląd wykorzystuje prawdziwy renderer strony z przykładowymi
danymi, na komputerze 1400 px i telefonie 390 px. Plansze pełnej listy
rozwijają Zrobione i zdejmują tylko ograniczenie wysokości przewijania,
aby wszystkie kafelki dało się obejrzeć na jednym obrazie. W aplikacji
Zrobione pozostaje domyślnie zwinięte i lista przewija się w karcie.

| Rodzaj | Stan | Co widać w Zadaniach | Akcje |
|---|---|---|---|
| Ankieta tekstowa/punktowa | Oczekuje, także po otwarciu bez oddania głosu | Do zrobienia; otwarcie nie tworzy osobnego wyglądu kafelka | Głosuj, Odrzuć |
| Ankieta tekstowa/punktowa | Oddano głos | Zrobione przez 5 dni od głosu; sekcja domyślnie zwinięta | Brak |
| Ankieta | Odrzucono / cofnięto | Brak kafelka | Brak |
| Baza — przeglądający/edytor | Oczekuje lub otwarto | Do zrobienia; informacja o roli | Akceptuj, Odrzuć |
| Baza | Zaakceptowano | Znika z Zadań; dostępna w Bazach | Brak w Zadaniach |
| Baza | Odrzucono / cofnięto | Brak kafelka | Brak |
| Prowadzący / Przycisk do pojedynku / Wyświetlacz / Wyświetlacz QR | Aktywne, także po podłączeniu | Do zrobienia, nazwa urządzenia i ważność | Podłącz |
| Urządzenie | Cofnięto / wygasło | Brak kafelka | Brak |
| Cała lista | Pusta | Nic do zrobienia | Brak |

To opis aktualnego zachowania, nie nowa zmiana okresu przechowywania.
Poprawka wyglądu: 14 px między nagłówkiem a kartą, 12 px między wierszami,
24 px między sekcjami, opisy i tytuły bez ucinania na telefonie, jednakowe
przyciski mobilne 40 px. Wspólna logika wierszy i akcji pozostaje źródłem.

Zrzuty po poprawce:

| Widok | Komputer | Telefon |
|---|---|---|
| Wszystkie 10 wariantów, Zrobione rozwinięte | [zrzut](img/e19-tasks/all-desktop.png) | [zrzut](img/e19-tasks/all-phone.png) |
| Normalna wysokość strony, Zrobione zwinięte | [zrzut](img/e19-tasks/default-desktop.png) | [zrzut](img/e19-tasks/default-phone.png) |
| Pusta lista | [zrzut](img/e19-tasks/empty-desktop.png) | [zrzut](img/e19-tasks/empty-phone.png) |

**Decyzja użytkownika — ikony pochodzenia Zadania (2026-10-11):** po lewej zamiast inicjału nadawcy ikona rodzaju zasobu: ankieta `polls`, baza `drawer`, urządzenia `host` / `buzzer` / `display` (również wyświetlacz QR). Nazwa nadawcy pozostaje w opisie. Ikona jest taka sama przed i po wykonaniu ankiety. Wspólny renderer wierszy obsługuje opcjonalne `avatarIcon`; korzysta ze wspólnego silnika ikon.

**Doprecyzowanie kolorów Zadania (2026-10-11):** delikatne oznaczenie rodzaju zasobu: ankiety złote, bazy niebieskie, urządzenia zielonkawe. Kolor ikony, jej subtelne tło i lewa krawędź kafelka; teksty/akcje nadal wspólne. Kolor nie zastępuje ikony ani nazwy rodzaju. To samo oznaczenie ankiety w Do zrobienia i Zrobione.

**Korekta mobilnych kafelków Zadania (2026-10-11):** użytkownik zgłosił zbyt dużo informacji i nadmierną wysokość. Na telefonie skrócony opis bez dat otrzymania, głosowania i ważności; pozostaje rodzaj/rola oraz nadawca. Tytuł i opis maksymalnie po dwie linie, ikona pochodzenia 30 px. Pełny opis nadal na komputerze. Zastępuje wcześniejsze doprecyzowanie pełnego zawijania tekstów na mobile; wykonana poprawka odstępów zostaje.

### Trwała odmowa znajomości — paczka 328

> **Aktualizacja decyzji 2026-10-11:** użytkownik potwierdził brak
> przypomnień po odmowie i znikanie odrzuconych z list po czasie.
> Poniżej pozostaje historyczny opis wdrożonej paczki 328; ponawianie
> odrzuconych i automatyczna akceptacja prośby krzyżowej wymagają korekty
> w kolejnej migracji. Aktualny kontrakt jest w §7 „Odmowy i duplikaty”.
> DB 38140986647 ✓ (`OK 328` 12:55:03 UTC), Pages 38140986635 ✓;
> kontrola produkcyjna tej paczki nie została wykonana przed zmianą decyzji.

Odrzucony wpis pozostaje z tym samym tokenem i cooldownem. Wysłane:
Ponów (tylko mail, ukryty bez powiadomień) oraz Cofnij; odbiorca może
świadomie przyjąć odrzucone zaproszenie, ale nie odrzuca go drugi raz.
Krzyżowe zaproszenie od odbiorcy również jest świadomą akceptacją.
Cofnięcie usuwa wpis i unieważnia token, 30-dniowa blokada nowego
zaproszenia po odmowie nie znika. Przyjęte zasoby pozostają osobną gałęzią.

Podgląd renderera z danymi przykładowymi:
[komputer](img/e19-friends/declined-desktop.png) ·
[telefon](img/e19-friends/declined-phone.png).

Testy SQL obejmują ACL, kierunki/uprawnienia, odmowę, niezmienność tokenu
i decyzji przy ponowieniu, flagę mailową, cooldown, świadomą akceptację,
cofnięcie i usunięcie rodzica. Osobny test równoczesnych przypomnień
sprawdza, że tylko jedno dostaje zgodę i zwiększa licznik. Test UI z
kontrolowanymi danymi sprawdza oba kierunki i akcje na desktop/mobile;
prawdziwy mail E2E sprawdza zachowanie dostarczonego linku po odmowie
i akceptacji oraz drugi przypadek cofania, tworzony fixture RPC bez maila.
Okna czasu ponowienia testowane w izolowanym SQL, bez udawania, że
upłynęło pięć dni na produkcji. Trwały limit po usunięciu relacji oraz
kontrakt odmów Subskrybentów nadal w kolejnych paczkach.

### Zakres Zadań i plakietek — decyzja użytkownika 2026-10-11

**Zadania pokazują wyłącznie ankiety.** Użytkownik odrzucił zbiorczą
skrzynkę i sumowanie liczników: każde zaproszenie ma jedno miejsce
obsługi i jedną plakietkę. Wcześniejsza propozycja wspólnej skrzynki
oraz obecność baz/urządzeń w wykonanym etapie nie są docelowym kontraktem.
Historyczne wyniki wdrożeń pozostają zachowane; zakres aktualizujemy
nową paczką, nie oznaczamy dotychczasowych testów jako pokrycia nowej decyzji.

| Rodzaj | Miejsce obsługi | Plakietka |
|---|---|---|
| Ankieta | Zadania: Do zrobienia / Zrobione | Oczekujące ankiety, bez głosów wykonanych i odmów |
| Znajomość | Znajomi: Propozycje / Odrzucone przeze mnie | Przychodzące oczekujące prośby |
| Subskrypcja (wyłącznie bez konta) | Nadawca: Subskrybenci; odbiorca: link Go z maila | Brak przychodzących subskrypcji konta i ich plakietki |
| Baza | Bazy → Udostępnione: propozycje / Odrzucone przeze mnie | Oczekujące propozycje baz |
| Urządzenie | Podłącz urządzenie: Udostępnione dla mnie | Licznik według kontraktu tego ekranu; bez kopii w Zadaniach |

Zakres realizacji:
- tasks_list i plakietka Tasks tylko ankiety; usunąć z Tasks wiersze,
  akcje i filtrowanie baz/urządzeń. Zachować poll_text/poll_points,
  wygląd kompaktowy i Zrobione z głosami przez 5 dni.
- Undo znajomości/bazy poza Zadaniami. Subskrypcja bez konta nie ma undo. Odmowy ankiet nadal
  nie mają undo i znikają z Do zrobienia od razu.
- Go i linki z maili kierują bazy do Bases, urządzenia do Connect,
  znajomości do Friends, ankiety do Tasks/głosowania. Przejrzeć także
  logowanie/powroty, wyróżnienie wiersza i nieaktywne/wygasłe tokeny.
- badges_get, badges klienta i odświeżanie stron nie liczą tego samego
  zaproszenia na więcej niż jednej ikonie. Brak maili nie ukrywa zaproszeń konta. Subskrybent bez konta używa linku z maila.
- Nowe testy lokalne/SQL i punktowe E2E obejmują izolację liczników,
  dostarczone linki, akcje po właściwej stronie, stare/nowe tokeny,
  odmowy/cofnięcia, telefon/komputer; nowe zrzuty po realizacji.

Decyzja zapisana; migracje i frontend tej zmiany jeszcze do wdrożenia.

### Paczka 329 — realizacja odmów Znajomych

Kod na branchu: friends_undo_reject przywraca pending, Akceptuj tylko pending;
resend odrzuconych blokowany; friends_list widoczność nadawcy 5 dni / odbiorcy
30 dni. Resolver i token_info nie uznają wygasłego tokenu; nowe jawne invite
usuwa wygasły rekord i tworzy nowy token. To logiczne wygaśnięcie na odczycie,
rekord fizycznie usuwany przy nowym invite (okresowy cleanup w grafie E19
pozostaje do spięcia). Prośba krzyżowa wymaga jawnej decyzji; osobne
komunikaty dla kierunków/statusów. Flaga wyłączona nie zużywa pierwszego maila.
Pary invite serializowane blokadą advisory, resend/undo blokują wiersz.

Własne odmowy w ostatniej, domyślnie zwiniętej sekcji prawej karty.
Wspólne shareSectionEl z opcjonalnym collapsed/onToggle i ikoną undo;
pusta sekcja ukryta. To wzorzec dla kolejnych odmów Baz/Subskrypcji.

**Wymaganie zrzutów użytkownika:** przy wdrożeniu każdego rodzaju
pokazać sekcję zwiniętą i rozwiniętą z przykładowymi danymi na 1400/390 px;
szczególnie Bazy → Udostępnione. Zrzuty po implementacji, bez pauzy na ocenę.
Znajomi: [zwinięta komputer](img/e19-friends/refusal-collapsed-desktop.png),
[rozwinięta komputer](img/e19-friends/refusal-expanded-desktop.png),
[zwinięta telefon](img/e19-friends/refusal-collapsed-phone.png),
[rozwinięta telefon](img/e19-friends/refusal-expanded-phone.png).

Lokalny SQL 329 + dwa wyścigi (resend i zaproszenia przeciwne) ✓, unit
408/408 ✓. Pełny cykl runner/Pages/DB/E2E jeszcze do wykonania; nie
traktować tej paczki jako zamkniętej produkcyjnie.

### Paczka 330 — Zadania wyłącznie ankiety

SQL 330: izolowany runner 38144647258 ✓, migracja main 38144761004 ✓,
log OK 330 13:52:06 UTC. Front w przygotowaniu: usunięte akcje/wiersze baz
i urządzeń, filtr rodzajów; zachowane ankiety tekstowe/punktowe todo/done
i wyszukiwarka. Go b i login next=bases kierują do Bases b; Bases wskazuje
propozycję w Udostępnione. Opisy PL/EN/UK i PAGES/diagramy zgodne z zakresem.
Nowy test bazy sprawdza brak w Tasks i niezmieniony tasks_pending, potem
akceptację w Bazach. Test mailowy baz rozszerzony o dostarczony link,
login-parametry anonimowego wejścia oraz rzeczywistą akceptację odbiorcy.

Zrzuty renderera: [domyślnie komputer](img/e19-tasks/poll-only-default-desktop.png),
[domyślnie telefon](img/e19-tasks/poll-only-default-phone.png),
[Zrobione rozwinięte komputer](img/e19-tasks/poll-only-all-desktop.png),
[Zrobione rozwinięte telefon](img/e19-tasks/poll-only-all-phone.png).
Kontrolowany test dostaje też stare rodzaje, żeby sprawdzić, że frontend
nie pokazuje baz/urządzeń; widoczne tylko cztery warianty ankiet.

**329 — kontrola produkcyjna zakończona:** main 38144971546 ✓ 8/8 bez
retry + unit 408/408; dwa rzeczywiste maile test8 i wszystkie opisane
przepływy odmowy/undo/akceptacji/cofnięcia oraz tablet. DB/Pages ✓.
To zamyka paczkę Znajomych, nie całe E19. Okna 5/30 dni sprawdzone
w izolowanym SQL, nie przez zmianę czasu produkcji.

### Doprecyzowanie telefonu i pustych list — decyzja 2026-10-11

Znajomi i Subskrybenci: na komputerze dwie kolumny, na telefonie **dwie
przełączane karty**, ze wspólnego wzorca kart systemu (nie dwie długie
kolumny ustawione jedna pod drugą). Zachować sekcje i formularz dodawania.

| Strona | Karta 1 | Karta 2 | Plakietka wymagająca działania |
|---|---|---|---|
| Znajomi | Dodaj znajomego + Wysłane | Znajomi + Propozycje + Odrzucone przeze mnie | Na karcie 2: przychodzące pending; nie liczyć znajomych, wysłanych i odmów |
| Subskrybenci | Dodaj subskrybenta + Oczekujące | Subskrybenci | Zwykłe liczniki sekcji; bez przychodzących propozycji kont i ich plakietki |

Plakietka na karcie korzysta z tego samego źródła i klasy `.badge` co
skrót strony; nie sumować jej ponownie w Zadaniach. Zero ukrywa plakietkę.
Go wskazujące zaproszenie wybiera właściwą kartę; stan karty w mapie
nawigacji i adresie zgodnie z istniejącym modułem tabs.js. Przejście do
komputera pokazuje obie kolumny bez utraty stanu formularza/sekcji.

**Puste listy:** wspólny komponent, CSS, odstępy i sposób wyświetlania
krótkiego komunikatu „Brak …”. Treść dopasowana do listy, bez atrap kafli,
przypadkowych dodatkowych ikon/przycisków i różnych ramek. Rozróżniać
pustą listę od ładowania, błędu oraz braku wyników filtrowania. Opcjonalne
puste sekcje odmów nadal ukryte. Przegląd obejmuje Znajomych,
Subskrybentów, udostępnianie Control/Baz/Ankiet i Zadania; języki PL/EN/UK.

**Bazy:** nowy wygląd udostępniania jest nadal wymagany, nie kończy się
na przeniesieniu akceptacji z Zadań. Te same shareSection/shareRow, listy
z checkboxami, odstępy, osobne przewijanie, wyszarzenie i zegary cooldownu,
krótkie statusy, przyciski po prawej. Zmiana roli obok cofnięcia, podobna
wielkość; powiadomienia/ponowienie zgodnie z aktualnym kontraktem odmów.
Zrzuty po wdrożeniu: 1400/390, dane przykładowe i odmowy zwinięte/rozwinięte.

To aktualizacja otwartego zakresu; wykonana wcześniej wersja mobilna
z dwiema kartami ułożonymi pionowo nie realizuje przełączanych kart.

**330 — realizacja zakończona:** branch 38145406627 ✓ 7/7, Pages
38146034897 ✓, main 38146083458 ✓ 7/7 bez retry + unit 409/409.
Dostarczony mail test8 i rzeczywista akceptacja w Bazach, anonimowy
Go/login, izolacja Tasks/licznika, blokady ról i obcy/cofnięty token.
Nowy wygląd udostępniania Baz i mobilne karty kontaktów nie są częścią
tego zakończonego zakresu i pozostają do wykonania.

### Zadania — uproszczenie po zawężeniu do ankiet (2026-10-11)

Decyzja użytkownika: wyszukiwanie i tekstowe oznaczenie typu zasobu na
liście Zadań są niepotrzebne. Usunąć wyszukiwarkę, jej pusty dolny pasek
i etykiety Ankieta tekstowa/Punktacja z opisów wierszy. Pozostają nazwa,
nadawca, istotny stan i akcje, wspólna ikona ankiety oraz Do zrobienia /
Zrobione. Typ ankiety nadal określa właściwą stronę głosowania wewnętrznie.
Zastępuje zapis paczki 330 o zachowaniu wyszukiwarki; historyczne wyniki
330 pozostają bez zmian. Nowe zrzuty i punktowe testy po implementacji.

Zrzuty uproszczonych Zadań: [telefon](img/e19-tasks/simple-all-phone.png),
[komputer](img/e19-tasks/simple-all-desktop.png); Do zrobienia i Zrobione
z przykładowymi danymi. Widok domyślny: simple-default-*.png.

**Doprecyzowanie użytkownika:** dwie karty na telefonie oznaczają dokładnie
**dwie zakładki z wypustkami, jak w Grach**, przełączające zawartość.
Użyć tego samego wzorca wyglądu wypustek i wspólnego tabs.js; plakietka
na wypustce właściwej zakładki. Na komputerze dwie kolumny.

**Kontakty — decyzja 2026-10-11:** na listach istniejących Znajomych i
aktywnych Subskrybentów nie pokazywać etykiety „Zaakceptowano” (stan
wynika z listy). Nadal pokazywać Oczekuje/Odrzucono przy zaproszeniach.
Wspólna reguła renderera; brak pustego rzędu/odstępu po usuniętej etykiecie.

Podgląd bez statusu active: Znajomi [telefon](img/e19-friends/active-phone.png) /
[komputer](img/e19-friends/active-desktop.png), Subskrybenci
[telefon](img/e19-subscribers/active-phone.png) /
[komputer](img/e19-subscribers/active-desktop.png). Obecny układ przed
wdrożeniem mobilnych zakładek z wypustkami.

### Model Subskrybentów — rozstrzygnięcie 2026-10-11

Użytkownik potwierdził: **subskrybent wyłącznie bez konta; konto → Znajomi**.
Obecne subscribers_invite zwraca has_account dla istniejącego konta.
Nie dodawać niezależnej subskrypcji konta, jego listy przychodzących
propozycji/odmów ani plakietki. Zadania pozostają wyłącznie ankietowe.
Wcześniejsze otwarte propozycje subskrypcji konta są zastąpione tą decyzją.

Założenie konta przez subskrybenta: istniejąca ścieżka może utworzyć
oczekującą propozycję znajomości; nie tworzy aktywnej znajomości ani
subskrypcji konta. Dopiero akceptacja znajomości usuwa stary wpis
subskrybenta. Odmowa anonimowej subskrypcji i karencja 30 dni nie mogą
zostać ominięte rejestracją/claim; zweryfikować ten przypadek w paczce
odmów Subskrybentów. Brak undo tej odmowy zachowany.

**Subskrybenci — panel nadawcy (doprecyzowanie użytkownika):** bez
mechanizmu akceptacji, przychodzących propozycji i cofania odmowy w panelu.
Dwie zakładki telefonu: Dodaj + Oczekujące oraz Subskrybenci. Panel
pozwala zaprosić, przypomnieć oczekującym według flagi/limitu i usunąć/cofnąć.
Odbiorca bez konta akceptuje/odrzuca przez dostarczony link Go z maila.
Przy odmowie przypomnienia zabronione; po 30 dniach dopiero nowe
zaproszenie. Liczba sekcji/zakładki nie jest plakietką przychodzących spraw.

### Domknięcie §5 pkt 2 — zakładki mobilne (2026-10-11)

Wznowienie według kolejności planu: najpierw kończymy pkt 2; potem pkt 3
(odmowy/cooldowny Subskrybentów; Znajomi 329 już zamknięci), następnie
pkt 4 Bazy i pkt 5 Ankiety. Ostatnie doprecyzowania należą do tych punktów.

Zakładki używają CSS Gier (wypustki) i tabs.js; stan invite/received
w PAGES i URL. Komputer dwie kolumny, telefon jeden panel; zmiana
szerokości nie niszczy formularza/sekcji. Go f wskazuje właściwy panel.
Znajomi: prawa plakietka tylko przychodzące pending, lewa liczba wysłanych
pending. Subskrybenci: liczniki oczekujących i aktywnych, bez przychodzących
propozycji/akceptacji w panelu. Zero ukrywa licznik. Odmowy/znajomi aktywni
nie zwiększają plakietki przychodzących spraw.

Zrzuty: Znajomi [zaproszenia telefon](img/e19-friends/tabs-invite-phone.png),
[listy telefon](img/e19-friends/tabs-received-phone.png),
[odmowy rozwinięte telefon](img/e19-friends/tabs-refusal-expanded-phone.png),
[komputer](img/e19-friends/tabs-desktop.png),
[odmowy rozwinięte komputer](img/e19-friends/tabs-refusal-expanded-desktop.png).
Subskrybenci [zaproszenia telefon](img/e19-subscribers/tabs-invite-phone.png),
[listy telefon](img/e19-subscribers/tabs-received-phone.png),
[komputer](img/e19-subscribers/tabs-desktop.png). Zrzuty faktycznego renderera
z danymi przykładowymi; etap dopiero po kontrolach branch/main.

**Wspólna wysokość/przewijanie:** użytkownik rozszerzył zasadę pełnej
wysokości kart i scrolla wewnętrznego na pozostałe strony, stosownie do
ich funkcji. Kontrakt w ujednolicenie-wygladu.md. Realizować przy
właściwych punktach kolejki, bez ponownego przestawiania planu.

### §5 pkt 3 — audyt przed kolejną migracją

Po domknięciu zakładek kontynuować Subskrybentów. Odczyt aktualnego
schema.sql wykazał: subscribers_list nie zwraca declined; contacts_list
nie dołącza declined_at subskrybenta; poll_go_sub_decline zachowuje rekord,
ale nie rezerwuje 30-dniowej karencji; subscribers_invite może więc
utworzyć kolejne pending obok odmowy. Resend dopuszcza tylko pending,
ale nie blokuje wiersza i nie sprawdza flagi przed naliczeniem maila.
Stare poll_sub_accept wciąż podpina adres do subscriber_user_id po
logowaniu — do zabezpieczenia zgodnie z rozstrzygniętym modelem.

Testy paczki: oba kierunki/statusy, brak undo/akceptacji w panelu, odmowa
w Go, granice 5/30 dni, nieważny stary token/nowe jawne zaproszenie,
ponów tylko pending, flag-mailowa przed limitem/kolejką, wyścigi,
cofnięcie bez skrócenia karencji, rejestracja/claim bez obejścia odmowy,
osobno wypisanie z aktywnej subskrypcji i globalna rezygnacja z maili.
Aktualna decyzja użytkownika: **wypisanie = odmowa**, więc dla obu działa
wspólny status declined i karencja 30 dni. Globalna rezygnacja z maili
pozostaje flagą niezależną od czasu życia odmowy.

**Stan pkt 2:** zakończony po Pages 38148810039 i kontroli main
38148894724 (3/3 bez retry, unit 411/411). Następny pkt 3 zgodnie
z powyższym audytem. Globalny landscape ma macierz i kryteria w
ujednolicenie-wygladu.md; nie jest jeszcze wdrożony.

#### Pkt 3 — pierwsza paczka 331: zamknięte tokeny

Przed terminami odmów zabezpieczyć istniejące obejście:
poll_go_subscribe_email po zamknięciu zaproszenia tworzył nowy aktywny
wpis, także dla innego adresu. W 331 oba RPC akceptacji używają
poll_sub_accept_email, blokują wskazany wiersz i nie tworzą nowych wpisów.
Adres musi pasować również przy już aktywnym zaproszeniu. Cofnięcie,
odmowa i usunięcie blokują oba RPC; powtórna poprawna akceptacja jest
idempotentna. To pierwsza paczka pkt 3, nie realizacja całego kontraktu
5/30 dni, flag mailowych ani zabezpieczenia rejestracji/claim.

Testy: rollback SQL wszystkich statusów/adresów i ACL anon, wyścigi
akceptacji z odmową/cofnięciem, punktowe E2E na rzeczywistych mailach
test14: akceptacja/usunięcie i odmowa przez Go, bez zakładania konta.
Następna migracja odmów Subskrybentów otrzyma 333; draft Baz trzeba
przenumerować dopiero przy właściwym pkt 4.

Audyt dla 333 obejmuje również starsze RPC
polls_hub_subscription_invite i polls_hub_subscription_invite_a:
oba nadal tworzą subskrypcje kont, a drugi ma osobne 5-dniowe ograniczenie
zamiast wspólnego kontraktu. Ich brak w obecnym froncie nie wystarcza:
wywołanie bezpośrednie nie może obchodzić reguły konto→Znajomi ani
karencji odmowy. Zweryfikować także polls_hub_subscription_accept/reject,
poll_sub_accept, konwersję friend_invites_from_subscriptions i istniejące
rekordy historyczne. poll_claim_email_records obecnie przepisuje odbiorcę
zadań ankietowych i wywołuje konwersję znajomości; nie podpina już sam
anonimowego wpisu subskrypcji do konta.

Flagi: aktualny _contact_mail_enabled sprawdza user_flags konta,
ale nie email_unsub_tokens.suppressed_at. Testy 333 muszą rozdzielać
flagę konta, globalną rezygnację adresu bez konta i wypisanie z konkretnej
aktywnej subskrypcji. Brak naliczenia maila przy rezygnacji należy sprawdzić
w RPC i kolejce; nie zakładać, że odrzucenie maila przez Worker oznacza
poprawny licznik/cooldown po stronie RPC.

**331/332 zakończone:** main 38152153539 ✓ 3/3 przy --retries=0,
unit 412/412, dwa dostarczone maile 22/102 s. Świeży branch 38151820876
✓ bez retry, SQL i izolowane testy obu migracji ✓. 332 usuwa tylko
pozostawiony baseline własnej pary konta testowego→test14 między
scenariuszami; limit kolejki dla normalnych użytkowników nie zmieniony.
Cały pkt 3 pozostaje otwarty: kolejna paczka 333 według audytu powyżej.

**Praca ciągła:** zamknięcie paczki oznacza zapis wyników i natychmiastowe
przejście do następnego zakresu w tej samej pracy. Nie kończyć tury tylko
dlatego, że dana paczka ma zieloną kontrolę; nie czekać na „kontynuuj”.
Zatrzymanie wyłącznie na polecenie użytkownika lub przy brakującej
kluczowej decyzji architektonicznej. Pytanie o wypisanie rozstrzygnięte:
użytkownik wskazał „Wypisanie = odmowa”; nie pytać ponownie.

**Zakres tej decyzji: w każdym miejscu systemu.** Rezygnacja odbiorcy
z przyjętej relacji/udostępnienia stosuje kontrakt odmowy właściwy dla
zasobu, również w Go i starszych RPC. To wspólna reguła grafu i kaskad,
nie wyjątek Subskrybentów. Karencja 30 dni obowiązuje tam, gdzie odmowa
ma 30 dni; dla ankiety odmowa dotyczy uruchomienia. Globalne wyłączenie
maili zachowuje flagę; wygaśnięcie odmów jej nie zeruje. Uwzględnić
przy kolejnych punktach Baz/Ankiet/grafu, bez zmiany ich kolejności.

### Pkt 3 / 333 — lokalna implementacja wspólnej odmowy

Wypisanie = odmowa również w starych RPC. Subskrybenci: 5 dni widoczności
nadawcy, 30 dni karencji, bez anonimowego undo i bez ponowienia odmowy.
Cofnięcie przez nadawcę zachowuje karencję. Rejestracja odbiorcy nie
omija odmowy przez automatyczne/manualne zaproszenie lub przyjęcie
Znajomych. Globalna flaga mailowa jest trwała, niezależna od karencji.
Odbiorcy z kontem w Go przechodzą do Znajomych zamiast akceptować
subskrypcję konta; komunikat nie obiecuje utworzenia propozycji w karencji.

Lokalny rollback SQL: granice 5/30, stare/nowe tokeny, flagi, brak liczników
przy mail-off, budżet 2/30, stare RPC, rejestracja oraz zakres prywatnych
helperów ✓. Wyścigi invite/resend/refusal oraz regresja 331/329 ✓.
Przed zamknięciem pozostają izolowany runner i cykl wdrożenia branch/main.
Zrzuty wykonanego renderera z przykładowymi danymi:
[telefon — odmowa i mail-off](img/e19-subscribers/refusal-invite-390.png),
[komputer](img/e19-subscribers/refusal-invite-1400.png),
[telefon — aktywni](img/e19-subscribers/refusal-active-390.png).

### Doprecyzowanie przekrojowe po wykonanych odmowach Znajomych

Zasada „wypisanie = odmowa” obejmuje jawną rezygnację odbiorcy z już
przyjętej relacji lub dostępu. Dopięcie starszych wykonanych funkcji jest
nową pracą; ich dotychczasowych kontroli nie oznaczać jako pokrycia tej
zmiany. W pkt 4 Baz uwzględnić `leave_shared_base`: odebranie własnego
dostępu, odmowa 5/30 i późniejsze undo → pending → osobne przyjęcie.
W audycie grafu uwzględnić dobrowolne zakończenie znajomości i pozostałe
wejścia rezygnacji, z zapisaniem osoby podejmującej decyzję. Zwykłe
rozłączenie urządzenia lub wygaśnięcie sesji zachowuje swój cykl techniczny.
Cofnięcie dostępu przez właściciela pozostaje jego operacją cofnięcia.

Go dla odbiorcy, który założył konto, otwiera Znajomi → Propozycje
(`tab=received`) także po logowaniu. Login przepuszcza wyłącznie karty
zadeklarowane w PAGES celu. Test brancha podmienia JS/CSS login, ale HTML
z sitekey Turnstile pozostaje z Workera; unit tego rozdzielenia ✓.
Zrzuty Go z przykładowymi danymi:
[konto, telefon](img/e19-subscribers/go-account-390.png),
[konto, komputer](img/e19-subscribers/go-account-1400.png),
[globalne wypisanie, telefon](img/e19-subscribers/go-global-390.png).

Audyt pkt 3 wykrył dodatkowe wejście po rejestracji: dawny aktywny wpis
email był dostępny w selektorze ankiety i obu RPC wysyłania przed
akceptacją Friendship. Paczka 335 domyka kwalifikację: znane konto
korzysta wyłącznie ze Znajomych, także przy dawnym aktywnym wpisie
subskrypcji. To dopięcie modelu pkt 3; pełny wygląd Ankiet pozostaje
pkt 5. Draft Baz otrzyma 336, z zachowaniem zmian Go 333.

Fixture E2E dawnego wpisu aktywnej subskrypcji konta nie może używać
normalnego INSERT (prawidłowo zabroniony). Helper 336 ograniczony do
własnej pary test1–7→test8, bez maili i zmiany relacji. Draft Baz
otrzymuje 337. Sześć Subscribers w 38156858860 przeszło bez retry;
test kwalifikacji ankiety wymaga świeżej kontroli po wdrożeniu helpera.

### Pkt 4 / Bazy — uzupełnienie audytu wejść (337)

Wypisanie przez `leave_shared_base` zapisuje odmowę i odbiera dostęp;
undo przywraca pending, a osobna akceptacja ponownie udziela dostępu.
Wspólny lock pary obejmuje udostępnienie, decyzje, role i cofnięcie.
Nie zmieniać roli aktywnego dostępu przez próbę ponownego zaproszenia.
Stare `share_base_by_email` i zapis bezpośredni `qb_shares_write`
omijają akceptację: zamknąć uprawnienia starego RPC i politykę zapisu,
zachować odczyt oraz kanoniczne RPC. Fixture E2E Baz/Explorera muszą
przechodzić przez zaproszenie i akceptację, bez przywracania obejścia.
SQL 337 przygotowany lokalnie, jeszcze niewdrożony produkcyjnie.

### Aktualny stan kolejki §5 — 2026-10-11

Pkt 3 zamknięty: SQL333–336, Pages38158473415, kontrola
main38158524056: 7/7 bez retry i unit413/413. Realne maile test14,
pełna odmowa/wypisanie/globalny mail-off oraz zarejestrowany dawny
Subskrybent w obu kanałach ankiet. Następny pkt4 Bazy.

Wykonany podgląd Baz, jeszcze przed produkcją:
[udostępnianie telefon](img/e19-bases/share-390.png),
[komputer](img/e19-bases/share-1400.png),
[odmowy zwinięte telefon](img/e19-bases/refusal-collapsed-390.png),
[rozwinięte telefon](img/e19-bases/refusal-expanded-390.png),
[zwinięte komputer](img/e19-bases/refusal-collapsed-1400.png),
[rozwinięte komputer](img/e19-bases/refusal-expanded-1400.png).


### Pkt 5 / Ankiety — audyt kontraktów po Bazach (340)

Zwykły cooldown mailowy nie blokuje utworzenia zadania przy mail-off;
sprawdzać flagę przed limitami i rezerwacją, także w przypomnieniu.
Odmowa zostaje związana z bieżącym kluczem uruchomienia. Po pięciu dniach
kafelek ukryty, lecz rekord odmowy pozostaje do końca uruchomienia.
Usunięcie udostępnienia przez właściciela zamyka token i usuwa głos,
nie kasuje historii odmowy. Zwykłe cofnięcie pending bez odmowy pozwala
na nowe udostępnienie po istniejącym cooldownie; nowe zadanie/nowy token.
Wznowienie zatrzymanej ankiety zachowuje decyzje, nowe uruchomienie ma
nowy klucz. `poll_share_panel` dostarcza flagi/zegary/stany z jednego RPC.

Audyt ujawnił dalsze obejścia do zamknięcia w tej paczce przed produkcją:
bezpośredni INSERT/UPDATE/DELETE właściciela w poll_tasks, stare
poll_task_send oraz polls_hub_share_poll, zmiana odmowy przez
poll_admin_delete_vote i mutacje tokenu bez kontroli rodzica/odbiorcy.
Fixture Go muszą tworzyć zaproszenie kanonicznie. Lokalny draft340
sprawdza mail-off/dedup/5d/refusal po usunięciu, same-run resume kontra
new-run, reminder2/same token, role i metadata ACL. Front/izolowany
runner oraz komplet granic jeszcze do wykonania; nie oznaczać pkt5
jako gotowego i nie publikować draftu na podstawie samego SQL lokalnego.


### Pkt 4 zamknięty; pkt 5 w realizacji — 2026-10-11

Bazy337–339: SQL/log oraz izolowane runnery ✓, branch38161754445 ✓
3/3 bez retry, Pages38161940974 ✓, main38162414519 ✓ 3/3 bez retry,
unit413/413. Rzeczywisty mail39s na main, pełny cykl odmowy/undo/accept/
opuszczenia/ról/revoke/Go, UI390/1400 i prawdziwa flaga mail-off/noqueue.
Zrzuty wyżej dokumentują gotowy wygląd. Fizyczna kaskada tasków po
usunięciu bazy jest osobną otwartą pracą pkt7, guards już wdrożone.

Ankiety340–341 pozostają draftem brancha. Dołożony audyt: obecny limit
trzech maili/24h używa mail_queue, lecz worker usuwa dostarczony wiersz.
Zachować zatwierdzone trzy/24h, liczyć trwałe zdarzenia zakolejkowania;
nie resetować przez dostarczenie/usunięcie taska/gry. Klucz owner→email,
bez zapisywania treści, hash normalizowanego emaila. Flaga przed kolejką,
atomowa kontrola wyścigów przy insercie; historia wygasa po24h, konto
usuwa własne zdarzenia kaskadowo. Przypomnienie nadal dwa na uruchomienie
oraz24h dla tej gry. Sprawdzić obie niezależne bramki i granice czasowe.

### Pkt 5 / wspólny wygląd oraz zapisy głosów — 2026-10-11

W toku, jeszcze bez publikacji. Karty pozostają „Udostępnianie” i „Głosy”.
Udostępnianie ma równe sekcje „Anonimowo” i „Odbiorcy”; zachowany wykonany
selektor Znajomi/Subskrybenci. Status, podsumowanie i małe akcje jak w Games
są nad kartami; wypustki36px. Listy używają wspólnego shareSection/shareRow,
checkboxów, wyszarzenia blokady, osobnych scrolli i przycisków refresh/kosz
po prawej. Odmowy/done/mail-off bez ponowienia; ukryta odmowa bieżącego runu
nadal wyklucza z selektora. Metadata i zegary pochodzą z jednej odpowiedzi
poll_share_panel; znikający blob jest wspólnym toastem.

Podgląd z przykładowymi danymi po wykonaniu:
[Udostępnianie1400](img/e19-polls/sharing-1400.png),
[Udostępnianie390](img/e19-polls/sharing-390.png),
[lista odbiorców390](img/e19-polls/sharing-recipients-390.png),
[selektor1400](img/e19-polls/recipients-1400.png),
[selektor390](img/e19-polls/recipients-390.png),
[Głosy1400](img/e19-polls/votes-1400.png),
[Głosy390](img/e19-polls/votes-390.png).
Podgląd nie zastępuje kontroli rzeczywistych Pages i dostarczania maili.

343 domyka zapisy z zastrzeżonym tokenem task:id we wszystkich RPC oraz
bezpośrednich zapisach właściciela: rodzic → task, właściwy odbiorca,
bieżący run, brak odmowy/cofnięcia/done. KluczNULL odrzucany. Zwykłe głosy
anonimowe zachowują obecny kontrakt; lekki limit urządzenia pozostaje pkt7.
Lokalne rollback granic i wyścigi odmowa/stop/usunięcie rodzica ✓; świeży
izolowany runner obejmie także dopięty Tasks decline wrapper341.

### Pkt 5 / atomowe zakończenie głosowania — dopięcie344

Status „zagłosowano” wymaga odpowiedzi na wszystkie pytania bieżącej sesji.
Ostatnia paczka głosów i status done zapisują się w jednej transakcji;
wcześniejsze paczki pozostawiają zadanie aktywne. Odmowa przed kompletem
usuwa jego częściowe głosy; po pełnym wykonaniu odmowa jest zablokowana.
RPC done po wykonaniu jest idempotentny i nie odnawia czasu. Batches
zachowują SHARE rodzica → UPDATE własnego taska, bez upgrade rodzica;
dwaj niezależni odbiorcy mogą kończyć równolegle. Zwykłe anonimy nie mają
zadań, więc zachowują swój dotychczasowy cykl. Draft344 jeszcze nieprod.
Lokalnie tekst/punkty, fake done/partial/decline/complete/repeat/ACL oraz
wyścigi dwóch głosujących i complete→decline ✓; stary341 odtwarza fake done.
341–343 nie oznaczać pokryciem tej nowej atomowości; świeży runner i
kontrola branch/main wymagane po344.

Konto z zaproszeniem do ankiety: Go prowadzi do Zadania, podświetla jego
kafelek, dopiero tam Głosuj/Odrzuć. Komunikat i przycisk Go poprawione
PL/EN/UK; anonimowy subskrybent głosuje/odrzuca bez konta bezpośrednio z Go.
Zrzuty po wykonaniu: [Go konto390](img/e19-polls/go-account-390.png),
[Go konto1400](img/e19-polls/go-account-1400.png).

### Pkt5 / bramka brancha kompletna — 2026-10-11

Backend340–344 zastosowany (DB38165033358 i38165841575 ✓, logi w Dzienniku).
Bramka wybranych12 scenariuszy: siedem Go38166322418 ✓, dwa poll-share38166803982 ✓,
pozostałe trzy38167196365 ✓, wszystkie bez retry. Realne maile8/14,
tekst/punkty complete, odmowa/częściowe głosy, mail-off, legacykonto,
UI390/1400 i trzy dostarczone maile14 z trwałym limitem czwartego.
Unit414/414 ✓. Front gotowy do Pages, pkt5 nadal wymaga tych samych12
na rzeczywistej publikacji main. Starsze określenia draft/status wyżej
opisują stan w chwili zapisu; migracje są już wykonane i nie są edytowane.

### §5 pkt5 Ankiety zamknięty produkcyjnie — 2026-10-11

SQL340–344/logi oraz izolowane regresje/wyścigi ✓. Front Pages38167986176 ✓.
Main: siedemGo38168027593 passed, pięćpoll-share38168458967 ✓ bez retry
(prawdziwe pliki Pages, unit414/414). Wszystkie12 wskazanych scenariuszy
potwierdzone produkcyjnie: mail8/14, pełny tekst/punkty i atomowe done,
odmowa/remove/same-run, partial→decline bez głosów, legacykonto wykluczone,
mail-off/noqueue/no clock, UI390/1400 oraz trzy dostarczone maile i blokada
czwartego po usunięciu queue/taska/gry. Pierwszy main poll-share miał
wyścig helpera przed załadowaniem pytań; poprawione oczekiwanie Pytanie1
oraz przejścia1–10, świeży komplet pięciu zielony. Pkt5 zamknięty;
kolejny pkt6 maile w realizacji na branchu. Graf/anonimowy token/Go wszędzie
nadal pkt7; nie rozszerzać tego wyniku na te niewykonane części.

### Pkt6 — druga paczka kontakt/Settings, stan roboczy

Wspólny renderer obejmuje kontakt PL/EN/UK i podgląd/wysyłkę ręcznej
wiadomości z HTML edytora oraz escapowanymi cytatami i podpisami. Admin
compose i marketing raportują rzeczywistą kolejkę i nie zapisują historii
pominiętych adresów. Unit440/440 lokalnie; wymagane bramki branch/main.
Szczegóły, ograniczenia pokrycia i zrzuty w maile-granice.md. Wygląd
marketingu nadal do ujednolicenia. Pierwsza paczka main38170191574:13/14;
powtórzyć tylko Subskrybenci z poprawną asercją odmowy po wypisaniu/ukryciu.

### Pkt6 — domknięcie pierwszej kontroli, marketing na branchu

Main38171488172 ✓: świeże wypisanie/odmowa po poprawie starej asercji; razem
z13 green38170191574 pierwsza paczka wdrożona i zweryfikowana. Marketing
ma wspólny builder podgląd/wysyłka i wspólną ramkę dla wszystkich3 szablonów.
Najnowszy test mail-content obejmuje15 faktycznych szablonów i SMTP test14.
Unit443 lokalnie; bramki izolowane/branch/main wymagane przed zamknięciem.

### §5 pkt6 Maile — zamknięty produkcyjnie (2026-10-11)

Pierwsza paczka: Pages38170086375 / Edge38170086411 ✓, main13/14
38170191574 oraz świeże wypisanie38171488172 ✓ (poprawiona dawna asercja
wygasło po odmowie). Sharing, rzeczywista kolejka/flag i auth reset/change
z przywróceniem oraz treści PL/EN/UK sprawdzone.
Druga paczka: Worker38172431062 / Edge38172431290 / Pages38172431095 ✓.
Main38172503834 ✓2/2 bez retry/unit447:15 faktycznie odebranych maili,
cztery ilustracje HTTP200 i zapisane podglądy przez opublikowane moduły.
Branch SMTP38172035648 i preview38172320249 oraz Agent38172318043 ✓.
Wspólny szablon obejmuje wszystkie zinwentaryzowane generatory; zakres
kontroli i jego granice opisane w maile-granice.md. Pełnego panelu admina
ani signup/guest migration jako prawdziwego przepływu nie uznawać za
sprawdzonego kontrolą szablonów (auth4typy×3lang unit, reset/change E2E).

Następny pkt7: pełny graf, starsze wypisanie Znajomych, kaskady, locks,
Go dla wszystkich linków oraz łagodny limit przeglądarki. Kolejka i historia
admina są nadal osobnymi zapisami; spójność po awarii zapisu historii do
audytu grafu. Manual ostatni.

### Pkt7 — pierwsza paczka fizycznej kaskady Baz345 (draft)

FK base_share_tasks.base_id → question_bases.id ON DELETE CASCADE
usuwa wszystkie stany tasków wraz z rodzicem. Indeks base_id wspiera
kaskadę; istniejące rekordy bez rodzica są usuwane po zablokowaniu tabel
rodzic→dzieci. Kontrakty338 już odmawiały im dostępu, więc porządkowanie
nie odbiera ważnego uprawnienia. Graficzny wygląd Baz bez zmiany.

Lokalny klon PG16: orphan przed migracją odtworzony i posprzątany,
5stanów tasks/token/grant, niezależna baza, account→base→task,
regresje337 oraz wyścigi delete/accept/leave i expired pair ✓.
Wymagane isolated345, SQL/log, rollbackowa kontrola produkcyjna i punktowy
E2E Baz na istniejącym froncie. Pending mail/cancel sending oraz wypisanie
Znajomych to dalsze zakresy pkt7; nie dopisywać ich do pokrycia345.

### Pkt7 — wypisanie Znajomych346 (paczka w realizacji)

Pierwotny nadawca/odbiorca zaproszenia zostają; osobne pole aktora decyzji
wskazuje osobę wypisującą się z aktywnej znajomości. Jej własna odmowa
trafia do zwiniętej sekcji, drugiej stronie do wychodzących. Cofnięcie
odmowy przywraca pending, wymaga osobnej akceptacji i nie wysyła maila.
Cofnięcie przez drugą stronę unieważnia token/undo, zachowuje niejawne30dni
oraz budżet mailowy2/30 w obu kierunkach. Powtórna odmowa po undo nie
przesuwa terminu; Go i plakietki uwzględniają rzeczywistego aktora.

Lokalny PG16: backfill historycznej odmowy i naprawa wydłużonego zegara,
obaj aktorzy, pending/active/declined/cancelled, uprawnienia, 5/30,
wygaśnięcie i nowy token bez resetu budżetu, flagi mailowe,
regresje wcześniejszych odmów/Sub333/335 i wyścigi ✓.
Produkcja jeszcze niezmieniona — wymagane isolated346, SQL/log i real-mail
E2E branch/main. Usunięcie zależnych częściowych głosów i anulowanie
oczekujących maili pozostają następną paczką grafu, nie są rozwiązane346.

### Znajomi346 — zamknięcie produkcyjne i podgląd obu stron

Main38175836595 ✓3/3 bez retry, realne Pages bez podmiany kodu, trzy
rzeczywiste maile test8; oba kierunki wypisania, własna odmowa, ukrycie
pustej sekcji po undo, badge/pending/accept, Go/duplikaty/cancel i stary
nieważny token. Branch38174928575 ✓3/3 oraz38175511620 ✓1/1 ze zrzutami
shot-*.png (artefakt e2e-shots11715797067); SQL/log wcześniej potwierdzone.
Brak zmiany CSS/frontu, więc Pages38172431095 pozostaje aktualną publikacją.

Poniżej **lokalne podglądy z przykładowymi danymi**, nie zdjęcia produkcji.
Rzeczywiste screenshoty E2E zapisane w artefakcie; pobieranie przez API403.
Podgląd korzysta z obecnego wspólnego renderera/CSS; brak poziomego overflow
na390/1400, odrzucający ma własną sekcję niezależnie od kierunku zaproszenia.

| Wypisująca się osoba | Telefon zwinięte / rozwinięte | Komputer zwinięte / rozwinięte |
|---|---|---|
| Pierwotny nadawca | [zwinięte](img/e19-friends/withdraw-sender-collapsed-390.png) · [rozwinięte](img/e19-friends/withdraw-sender-expanded-390.png) | [zwinięte](img/e19-friends/withdraw-sender-collapsed-1400.png) · [rozwinięte](img/e19-friends/withdraw-sender-expanded-1400.png) |
| Pierwotny odbiorca | [zwinięte](img/e19-friends/withdraw-recipient-collapsed-390.png) · [rozwinięte](img/e19-friends/withdraw-recipient-expanded-390.png) | [zwinięte](img/e19-friends/withdraw-recipient-collapsed-1400.png) · [rozwinięte](img/e19-friends/withdraw-recipient-expanded-1400.png) |

346 zamknięte; pkt7 pozostaje otwarty. Draft347: cleanup niepełnych głosów
oraz blokady kontaktów przed grą, isolated38175603877 ✓; jeszcze bez SQL/main.

### Pkt7 — task ankiety → niepełne głosy347 (przygotowanie)

Kontakty blokowane przed grą przy tworzeniu zaproszeń, pary znajomości329
i subskrypcji333 w ustalonej kolejności; po uzyskaniu blokad ponowna
weryfikacja aktualnej relacji. Usunięcie nieukończonego taska lub
przestawienie go na cancelled sprząta jego tekst/punkty, również przy
wypisaniu z kontaktów. Done i jego komplet pozostają; usunięcie konta
może zachować ukończony anonimowy agregat bez taska. Nie kasować historycznych
orphans na podstawie samego braku taska, bo nie wiadomo, czy był ukończony.

Lokalnie wszystkie typy/ścieżki i wcześniejsze kontrakty głosów/kontaktów ✓;
cztery deterministyczne wyścigi wysyłanie×wypisanie friend/subscriber oraz
równoległe ukończenia344 ✓. Brancha pomocniczy codex/e19-347 służy tylko
bramce isolated; SQL347 nie zastosowany na produkcji. Anulowanie kolejki
mailowej i trwała proweniencja maili są kolejną krawędzią grafu.

### Pkt7 — 347 zamknięte produkcyjnie

SQL DB38178919162/log22:05:58, finalny isolated38177985246 oraz
branch38179382545/main38179873750 success. Main2/2 bez retry/unit447,
sześć rzeczywistych maili8/14. Oba typy i oba kontakty: partial przez
RPC po mailu/Go, wypisanie sprząta głosy, stary token zamknięty.
Regresja pełnego tekstu w UI również success. Front bez zmian; aktualne
Pages38172431095. Nie rozszerzać tego na anulowanie kolejki mailowej.

Następne348: konto odbiorcy → taski Baz/Ankiet i legacy subskrypcje.
Trzy FK CASCADE, completed aggregate chroniony347. Draft na osobnym
branchu codex/e19-348, finalny isolated38180137558 success; nie produkcja.
Dalej punktowy real-mail/account deletion, SQL/log i kontrola branch/main.

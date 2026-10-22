# Test accounts — role, lease, dedicated, automatyczne wykluczenia (E25)

Plan uzgodniony z użytkownikiem 2026-10-22. Treść po polsku, **wszystkie
nazwy (konta, role, zasoby, tabele, funkcje, pola) po angielsku**.
Zasady dla speców: `tests/README.md`, sekcja „Test accounts”.

## Decyzje

| Data | Decyzja |
|---|---|
| 2026-10-22 | Zwiększyć pulę kont i podzielić ją tak, żeby agenty nie czekały na siebie. |
| 2026-10-22 | Przerobić zasady przypisywania i używania kont testowych. |
| 2026-10-22 | Skrzynki bez konta mają inny identyfikator niż konta → rola `noaccount`. |
| 2026-10-22 | Bez dopisywania adresów w Cloudflare → jedna reguła `e2e@` + Subaddressing. |
| 2026-10-22 | **Kilka ról, nie osobne nazwy dla każdego konta.** Rola mówi, do czego konto służy; numer w roli nic nie znaczy (konta w roli są wymienne). |
| 2026-10-22 | Jeden mechanizm dla wszystkich scenariuszy: spec deklaruje potrzeby, worker **wypożycza** (lease) konta i zasoby na wyłączność. |
| 2026-10-22 | Automatyczne wykluczanie kont testowych w panelu admina do poprawy (pewne źródło oznaczenia, rola w panelu, pełny przegląd statystyk). |
| 2026-10-22 | **Stare reguły całkowicie do usunięcia** — `test1`…`test17`, `testAccountUsername`, `loginAsPooledTestUser`, `TEST_ACCOUNT_COUNT`, `test_accounts`, wyrażenia `test[0-9]…`, reguły Cloudflare dla pojedynczych adresów. Bez mapy przejściowej i bez aliasów. Spece przepisują dedykowani agenci (pakiety niżej). |
| 2026-10-22 | Nazewnictwo po angielsku (międzynarodowe) — konta, role, zasoby, API. |
| 2026-10-22 | Zamiast roli `gallery` — **pula kont `dedicated`**: konta ogólne z nazwy (`e2e.dedicated01`…), przypisywane na stałe do konkretnej czynności (workflow, spec) w rejestrze przypisań. Widać, które są wolne; czynność, która musi zawsze używać tego samego konta i trzymać na nim dane, bierze wolne konto; gdy pula się skończy — prośba do użytkownika o dodanie konta (użytkownik). |
| 2026-10-22 | **Czyszczenie przy każdym lease i kwarantanna** (użytkownik: „pasuje”): test padający po zmianie systemu nie może zostawić popsutego konta następnemu. Każdy lease zaczyna się od wyczyszczenia konta; konto, którego nie da się wyczyścić, idzie do kwarantanny i nie jest wydawane. §3a. |
| 2026-10-22 | API: `test.use({ needs: { standard, noaccount, disposable, dedicated, resources } })` **na górze pliku** (opcja workera — Playwright nie pozwala w `describe`); wynik w fixture `accounts`. Wdrożone: migracja 460 (log OK 20:21:40), Worker (39848422458), harness + spec wzorcowy `e2e/e2e-lease.spec.js` (39848761419 ✓ 4/4). |
| 2026-10-22 | Panel admina bez śmieci z testów (użytkownik): migracja 461 — gry Społeczności autorstwa kont testowych, wiadomości i zgłoszenia od/do adresów testowych ukryte; średnie ocen gier Społeczności bez ocen kont testowych (także publicznie, przeliczone); Worker — kolejka i logi poczty bez adresów `testN@`/`e2e+`. Konto testowe = automatyczne wykluczenie (ręcznie wykluczone prawdziwe konta zostają widoczne). Napisy w panelu po polsku: „Konto testowe · zwykłe / jednorazowe / przypisane do czynności”, „Gość testowy” (identyfikatory w kodzie zostają angielskie). |
| 2026-10-22 | Reguła Cloudflare `e2e@` + Subaddressing dodana przez użytkownika. Stare reguły pojedynczych adresów `testN@` **zostają do końca pakietu E** (stare spece jeszcze z nich korzystają); usunięcie w pakiecie F. |
| 2026-10-22 | **Spece przepisywane stopniowo, w trakcie pracy** (użytkownik: „testy będziemy przepisywać w trakcie”): kto zmienia spec, przenosi go na `helpers/e2e-test` w tym samym etapie. Nowe pliki tylko z lease. Zapadka `unit/legacyTestAccounts.test.js` + `unit/legacy-test-accounts.json` (na start 59 plików, 691 użyć): użyć starych kont może tylko ubywać, przepisany plik znika z listy. Pakiet F (usunięcie testN, starych helperów, wzorców, reguł Cloudflare `testN@`) — gdy lista będzie pusta. |
| 2026-10-22 | **Stare reguły Cloudflare `testN@` usunięte przez użytkownika** — poczta na adresy `testN@` już nie dochodzi. Konta `test1`…`test17` istnieją dalej (spece bez poczty działają), ale 16 speców z pocztą (account-password-email, base-refusals, bases, control2 udostępnianie, friends, guest-migration, mail-center, mail-content, poll-contact-source, poll-recipient-identity, poll-share, recipient-account-cascade, resource-copy-send, subscribers, test-account-restore, mail-queue-flags) wymaga przepisania na `e2e+` przed kolejnym zielonym przebiegiem. Przygotowanie: migracja 462 (fikstury i sprzątanie e2e przyjmują tożsamości e2e; `e2e_registered_subscriber_fixture(p_recipient_user_id, p_remove)`, `e2e_subscriber_mail_flag(p_email, p_reset)`; zwolnienie par e2e z bazowego limitu poczty), Worker: `/mail-center-preference`, `/mail-center-capabilities`, `/mail-template-fixtures` z wypożyczoną skrzynką `noaccount` zamiast test14 (helpery `mailbox.js` z parametrem `recipient`). |
| 2026-10-22 | **Stare konta usunięte, Worker wyczyszczony** (użytkownik: „usuń konta od razu”, „worker wyczyść… bez tych endpointów przypisanych”, „nie prosiłem o poprawianie testów”). Migracja 463 usuwa `test1`…`test17` przez `delete_user_everything` (z grami Społeczności tych kont). Worker: bez wzorca `testN@`, bez `/_e2e_api/accounts/restore` (test11/12/15/17), bez wyjątku test9/10, bez endpointów pod test14 (`/mail-center-preference`, `/mail-center-capabilities`, `/mail-template-fixtures`); skrzynka testowa, `mail-trigger`, `mail-delivery`, zwolnienie cooldownu — wyłącznie adresy `e2e+` z wypożyczeniem. Spece ze starymi kontami nie działają, dopóki nie zostaną przepisane (zapadka `legacyTestAccounts`); speców e2e agent nie poprawia bez polecenia. |
| 2026-10-22 | **Skrzynka uniwersalna** (użytkownik: „usuń, skrzynka ma być uniwersalna”): z `helpers/mailbox.js` usunięte `restoreTestAccount`, `queueMailTemplateFixtures`, `clearMailCenterCapabilities`, `restoreMailCenterPreference`; migracja 464 usuwa fikstury z adresatem przypisanym do konta (`e2e_registered_subscriber_fixture`, `e2e_subscriber_mail_flag` — stare z test8/test14 i wersje z 462). |
| 2026-10-22 | **Bez wzorców testN w bazie** (użytkownik): migracja 465 — funkcje e2e_* (sprzątanie par, budżet i cooldowny adresu, Społeczność, podgląd kolejki plików), `mail_queue_cooldown_guard`, `is_test_email`, `profiles_reserve_test_username`, widok `stats_exclusions_effective` (tylko tożsamość e2e, `e2e_role`, gość testowy), CHECK `e2e_emails` (tylko `e2e+`), prefiks nazw `test` usunięty. |

**Do potwierdzenia:** liczności puli (propozycja: `standard` 40, `noaccount` 10, `disposable` 6, `dedicated` 6).

## 1. Role

| Role | Name / e-mail | Account | Do czego | Nie wolno |
|---|---|---|---|---|
| `standard` | `e2e.standard01` / `e2e+standard01@familiada.online` | tak | wszystko zwyczajne: własne gry, bazy, logo, ankiety, Control; udostępnianie, współedycja, zadania, kopie, znajomi; poczta do zalogowanego | usuwać konto, zmieniać hasło, e-mail, nazwę |
| `noaccount` | — / `e2e+noaccount01@familiada.online` | **nigdy** (baza blokuje) | odbiorca bez konta: subskrybent tylko e-mail, urządzenie na e-mail, zaproszenie bez konta | logować się, zakładać konto |
| `disposable` | `e2e.disposable01` / `e2e+disposable01@` (+ `e2e+disposable01.new@` jako nowy adres) | tak, **odtwarzane przy każdym lease** | usuwanie konta i kaskady, zmiana i reset hasła, zmiana e-maila, profil | — (stan po teście nieistotny) |
| `dedicated` | `e2e.dedicated01` / `e2e+dedicated01@` | tak, dane zostają | przypisane na stałe do **jednej czynności** (rejestr — §1a); tylko ta czynność go używa | używać bez przypisania; przypisywać drugiej czynności |
| `guest` | tworzony w teście (`loginAsGuest`) | tak, tymczasowe | ograniczenia gościa, migracja gościa | zostawiać po teście |

Zasady nazw:
- każda tożsamość testowa zaczyna się od `e2e`;
- e-mail = nazwa z kropką zamienioną na `+` (`e2e.standard07` → `e2e+standard07@familiada.online`);
- numer dwucyfrowy, bez znaczenia; limit nazwy 3–20 znaków `[a-zA-Z0-9_.-]`
  (najdłuższa `e2e.disposable01` = 16);
- rola w scenariuszu (owner, recipient, invitee…) to **zmienna w teście**,
  nie nazwa konta.

Liczności (propozycja): `standard` 40, `noaccount` 10, `disposable` 6,
`dedicated` 6. Rachunek: typowy spec ≤ 3 konta × 4 workery = 12 → 3 przebiegi
naraz z zapasem.

## 1a. Dedicated accounts — rejestr przypisań

Konto `dedicated` jest z nazwy ogólne (`e2e.dedicated03`); jego
przeznaczenie wynika **wyłącznie z rejestru**: kolumna
`e2e_identities.purpose` (źródło prawdy) i ta sama tabela w
`tests/README.md` („Dedicated accounts”) dla ludzi i agentów.

| Account | Purpose | Kto używa | Od | Dane na koncie |
|---|---|---|---|---|
| `e2e.dedicated01` | `e20-gallery` | workflow `e2e-tests.yml`, galeria E20 (`e20-gallery.spec.js`) | E25 | gry, bazy, logo, ankiety do zrzutów |
| `e2e.dedicated02` | — wolne | | | |
| `e2e.dedicated03` | — wolne | | | |
| `e2e.dedicated04` | — wolne | | | |
| `e2e.dedicated05` | — wolne | | | |
| `e2e.dedicated06` | — wolne | | | |

**Kiedy brać `dedicated`:** czynność musi **zawsze** używać tego samego
konta (np. trwałe dane, które przygotowuje się raz, długo żyjące
ustawienia, historia). Wszystko inne — `standard`.

**Przypisanie** (jedna zmiana, w jednym commicie):
1. wybrać wolne konto z tabeli;
2. migracja: `UPDATE e2e_identities SET purpose='<purpose>', purpose_note=…, assigned_at=now() WHERE name='e2e.dedicatedNN' AND purpose IS NULL`;
3. wiersz w tabeli `tests/README.md`;
4. spec/workflow: `test.use({ needs: { dedicated: "<purpose>" } })`.

**Brak wolnych:** agent prosi użytkownika o dodanie konta (powód,
czynność); po zgodzie migracja dodaje `e2e.dedicatedNN` (Worker zakłada
konto przy pierwszym lease).

**Zwolnienie:** czynność usunięta → migracja `purpose = NULL`, dane konta
wyczyszczone (Worker), wiersz w tabeli „— wolne”.

**Pilnowanie:** unit sprawdza, że każdy `dedicated: "<purpose>"` w specach
i workflow ma wiersz w tabeli README i odwrotnie; fixture pada, gdy
purpose nie ma przypisanego konta (komunikat: „poproś o przypisanie”).

## 2. Zasoby (shared resources)

Ograniczenia wspólne mimo rozłącznych kont — ten sam mechanizm lease,
jako „wirtualne konta” roli `resource`:

| Resource | Sztuk | Kiedy deklarować |
|---|---|---|
| `mail` | 2 | spec wysyła lub czeka na maile (wspólne limity dostawcy, `resetMailProviderLimits`) |
| `heavy` | 1 | Control, wyświetlacz, wiele kontekstów przeglądarki (mały serwer bazy) |

Spec bez deklaracji zasobu go nie zajmuje.

## 3. Mechanizm lease

### Deklaracja w specu

```js
const { test, expect } = require("./helpers/e2e-test");

// na górze pliku -- opcja workera Playwrighta: jedna deklaracja na plik
// (suma potrzeb wszystkich testów pliku; w describe nie wolno)
test.use({ needs: { standard: 2, noaccount: 1, resources: ["mail"] } });

test("base invite", async ({ page, context, accounts, loginAs, mailbox }) => {
  const [owner, recipient] = accounts.standard;
  const [outsider] = accounts.noaccount;
  await loginAs(page, context, owner);
  // ...invite recipient.email and outsider.email
  const mail = await mailbox.waitFor(outsider, { subject: /zaproszenie/i, after });
});
```

### Przebieg

1. Fixture **worker-scoped** `accounts` (`tests/e2e/helpers/e2e-test.js`,
   `test.extend`) przy starcie workera woła Worker `POST /_e2e_api/lease`
   `{ run_id, worker, needs: { standard: 2, noaccount: 1, resource: ["mail"] }, ttl }`.
2. Worker (klucz serwisowy) woła RPC `e2e_lease` — atomowo,
   `FOR UPDATE SKIP LOCKED`; zwraca **cały komplet albo nic** (`busy`).
3. `busy` → fixture odpytuje co 15 s do ~10 min, potem pada z listą
   posiadaczy (`run_id`, od kiedy, spec).
4. W trakcie: `POST /_e2e_api/lease/renew` co 5 min; TTL 20 min.
5. Koniec workera: `POST /_e2e_api/lease/release`. Przerwany przebieg —
   TTL zwalnia sam.
6. Równoległe workery jednego speca dostają różne komplety automatycznie
   (każdy wypożycza swój).

`run_id` = `GITHUB_RUN_ID` + `GITHUB_RUN_ATTEMPT` (lokalnie losowy).

### Przy lease

- Każda rola najpierw przechodzi czyszczenie (§3a).
- `standard`: sprawdzenie logowania nie jest potrzebne; Worker zwraca
  `{ name, email, user_id }` i potwierdza `admin_excluded = true`.
- `disposable`: Worker **odtwarza** konto do znanego stanu — zakłada
  brakujące, ustawia `TEST_PASSWORD`, e-mail, nazwę, potwierdzony adres,
  `app_metadata.e2e_role`, czyści skrzynki (`.` i `.new`).
- `noaccount`: Worker czyści skrzynkę (adres wypożyczony na wyłączność).
- `dedicated`: lease po **czynności** (`dedicated: "e20-gallery"`) — fixture
  bierze konto przypisane tej czynności; dane zostają, Worker odnawia tylko
  hasło, potwierdzony adres i `e2e_role`. Dwa przebiegi tej samej czynności
  nie biegną naraz (konto wypożyczone na wyłączność).

### 3a. Czyszczenie przy lease i kwarantanna

Po co: ktoś zmienił system, test jest nieaktualny i pada w połowie —
zostawia niedokończone gry, blokady edycji, sesje Control, udostępnienia,
znajomych, subskrypcje, cooldowny poczty. Następny test nie może tego
dostać.

**Czyszczenie** (RPC `e2e_reset_identity(p_name)`, woła je `e2e_lease`
przed wydaniem konta):

| Role | Co się dzieje |
|---|---|
| `standard` | usunięcie **wszystkich danych konta** (gry, bazy, logo, ankiety, udostępnienia, znajomi, urządzenia, subskrypcje, zadania, oferty kopii, blokady, sesje Control), cooldowny i budżety poczty, skrzynka; konto, ID, hasło i wykluczenie zostają |
| `disposable` | jak `standard` + odtworzenie konta (założenie brakującego, hasło, e-mail, nazwa, `e2e_role`), skrzynki `.` i `.new` |
| `noaccount` | skrzynka, wpisy subskrybenta e-mail, linki centrum maili, cooldowny dla adresu |
| `dedicated` | **dane zostają**; tylko blokady edycji, sesje Control, cooldowny, skrzynka |

Część „usuń dane konta” to **ta sama funkcja co przy usuwaniu konta**:
z `delete_user_everything` wydzielić `_delete_user_data(p_user_id)`
(bez usunięcia samego konta) i wołać ją z obu miejsc. Nowa tabela dopisana
do usuwania konta (E12) jest więc automatycznie czyszczona przy lease.

**Kwarantanna:** czyszczenie rzuci błąd albo po nim zostaną dane
(sprawdzenie liczników po resecie) → `e2e_identities.quarantined_at`,
`quarantine_reason`; konto **nie jest wydawane** nikomu. Lease bierze
inne wolne konto; jeśli nie ma — test pada z komunikatem
„konto X w kwarantannie: <powód>”. Zdjęcie kwarantanny: po poprawce
czyszczenia ponowne `e2e_reset_identity` (endpoint Workera
`/_e2e_api/quarantine/retry`), sukces = konto wraca do puli.
`db-read`: liczba kont w kwarantannie (powinna być 0).

**Pilnowanie:** test unit (zapadka na `schema.sql`) — każda tabela
z kolumną wskazującą użytkownika (`owner_id`, `user_id`, `*_user_id`,
FK do `profiles`/`auth.users`) jest obsłużona w `_delete_user_data`
albo wpisana na jawną listę wyjątków z powodem.

**Nieaktualny test** sam w sobie nikomu nie przeszkadza: zwalnia konta
(teardown biegnie także po błędzie; przy awarii — TTL), następny dostaje
czyste konto. Poprawia go autor zmiany systemu (zmiana zachowania strony
= poprawka jej testów w tym samym etapie); gdy autor nieznany — najpierw
sprawdzić, czy test pada też na `main`.

### Poczta w teście

- `mailbox.waitFor(identity, …)`, `mailbox.clear(identity)` — tylko dla
  tożsamości wypożyczonych przez ten `run_id` (Worker sprawdza lease;
  cudza skrzynka → 403).
- Fikstury SQL dostają adresata **parametrem** (dziś stałe test8/test14);
  walidacja: wołający i adresat to tożsamości `e2e` (`e2e_identity(email)`),
  a nie wyrażenia `test[1-8]`.

### Scenariusze → deklaracja

| Scenariusz | `needs` (role) | `needs.resources` |
|---|---|---|
| Jedna osoba, własne dane (gry, bazy, logo, edytor, ustawienia, ankiety) | `{ standard: 1 }` | — |
| Udostępnianie, współedycja, zadania, kopie Gier/Logo, znajomi | `{ standard: 2 }` (lub 3) | — |
| Zaproszenie / subskrypcja zalogowanego z mailem | `{ standard: 2 }` | `mail` |
| Odbiorca bez konta (subskrybent e-mail, urządzenie na e-mail) | `{ standard: 1, noaccount: 1 }` | `mail` |
| Usuwanie konta i kaskady | `{ disposable: 1, standard: 1 }` (druga strona) | `mail` |
| Hasło, zmiana e-maila, profil | `{ disposable: 1 }` | `mail` |
| Control 2, wyświetlacz, gra na wielu urządzeniach | `{ standard: 1 }` | `heavy` |
| Równoległe workery jednego speca | jak wyżej — każdy worker osobno | — |
| Czynność z trwałymi danymi na jednym koncie (np. galeria E20) | `{ dedicated: "e20-gallery" }` | wg czynności |
| Gość | nic (`loginAsGuest`), usunięcie na końcu | — |

## 4. Poczta — jedna reguła Cloudflare

Raz (użytkownik, panel Cloudflare):
1. Email Routing → Settings → **Subaddressing: on**.
2. Routing rule: `e2e@familiada.online` → *Send to a Worker* → `familiada`.

Każdy `e2e+…@familiada.online` trafia tą regułą do Workera. Worker:
adres z `e2e_identities` (z wariantem `.new` dla `disposable`) → zapis do
`e2e_emails`; inne `e2e+…` → `message.setReject`. Nic testowego nie idzie
do skrzynki admina, Telegrama ani na przekierowanie. Gdyby `message.to`
przyszło bez `+detail`, adresat z nagłówka `To` (rozstrzyga mail kontrolny).

Sprawdzone w kodzie: `_norm_email` = `lower(btrim)` (plus zostaje);
`auth.js` wymaga tylko `@`; logowanie przyjmuje nazwę użytkownika.
Catch-all odrzucony — obca poczta idzie dziś do admina i Telegrama.

## 5. Automatyczne wykluczenia w panelu admina

**Dziś:** `stats_exclusions_effective` (migracja 304) — e-mail
`^test[0-9]+@familiada.online` albo `is_test_guest`, plus ręczne
`stats_excluded_users`; panel (`web/settings/js/settings.js` ~1320) zna
tylko „Konto testowe” / „Gość testowy”.

**Docelowo:**
1. **Pewne oznaczenie:** Worker przy zakładaniu/odtwarzaniu ustawia
   `app_metadata.e2e_role` (klucz serwisowy; użytkownik nie zmieni — jak
   `is_test_guest`). Drugie źródło: `e2e_identities.user_id`.
2. **Widok:** wykluczone, gdy `e2e_role` jest ustawione **lub** konto jest
   w `e2e_identities` **lub** `is_test_guest`; `reason` = `test:standard`,
   `test:disposable`, `test:dedicated`, `test:guest`; `manual` bez zmian.
   Wzorzec `test[0-9]+` usunięty.
3. **Panel:** napis z rolą („Test account · standard — automatic”),
   wierszy automatycznych nie da się usunąć, licznik według ról.
4. **Pełność:** przegląd wszystkich funkcji statystyk i list admina (dziś
   objęte: `get_admin_stats*`, `get_retention_stats`, `get_stats_detail`,
   `get_admin_poll_*`, `get_admin_snake_stats`, oceny z 442,
   `get_maintenance_activity`, `agent_mail_window_counts`; sprawdzić
   statystyki Control 2 (369), `sync_market_game_rating_stats`,
   marketplace). Test unit — zapadka na `schema.sql`: każda funkcja
   `get_admin_*` / `*_stats*` odwołuje się do widoku.
5. **Kontrola:** lease zwraca `admin_excluded` dla każdego konta; fixture
   pada, gdy konto nie jest wykluczone. `scripts/db-read/e2e-exclusions.sql`:
   liczba kont `e2e` bez wykluczenia = 0.

## 6. Baza — obiekty

- `e2e_identities(name pk, role, email unique, user_id null, created_at)`
  — jedno źródło listy (role: `standard`, `noaccount`, `disposable`,
  `dedicated`, `resource`), `purpose null` (przypisanie `dedicated`;
  null = wolne), `purpose_note`, `assigned_at`.
- `e2e_leases(name pk → e2e_identities, run_id, worker, label, leased_at, expires_at)`.
- RPC (tylko `service_role`): `e2e_lease(p_run_id, p_worker, p_needs jsonb, p_ttl interval, p_label)`,
  `e2e_lease_renew(p_run_id)`, `e2e_lease_release(p_run_id, p_worker)`,
  `e2e_lease_holders()` (diagnostyka), `e2e_identity(p_email)`,
  `e2e_reset_identity(p_name)`, `_delete_user_data(p_user_id)` (wydzielone
  z `delete_user_everything`); kolumny `quarantined_at`, `quarantine_reason`.
- `reserved_username_prefixes`: prefiks `e2e` (kind `test`); trigger
  `profiles_reserve_test_username` dopuszcza nazwę `e2e.*` tylko dla
  `user_id` z `e2e_identities`.
- Blokada rejestracji na adres roli `noaccount` i `*.new`.
- CHECK `e2e_emails.recipient` → adres z `e2e_identities` (funkcja).
- Fikstury `e2e_*` i `mail_queue_cooldown_guard` przez `e2e_identity`.

Worker: lista tożsamości generowana z tabeli (endpoint provisioning) —
bez kopii wyrażeń w kodzie.

## 7. Co znika (bez aliasów)

- konta `test1`…`test17` (usunięte z danymi po uruchomieniu nowej puli),
  reguły Cloudflare dla pojedynczych adresów;
- `testAccountUsername`, `getTestAccountPool`, `loginAsPooledTestUser`,
  domyślne konto w `loginAsTestUser`, `RESERVED/EXCLUDED/NEVER_USE_TEST_ACCOUNTS`,
  `LOGO_E2E_ACCOUNTS`, `restoreTestAccount("test11")` itd.;
- `TEST_ACCOUNT_COUNT`, `TEST_ACCOUNT_NUMBERS`, wejście `test_accounts`,
  `E20_GALLERY_ACCOUNTS` (galeria → `dedicated`), globalne czekanie w `e2e-seq.sh`;
- wszystkie `test[0-9]…` / `test14` / `test8` w Workerze i SQL;
- reguły w CLAUDE.md o kontach na stałe, test14, test15, test9/10.

## 8. Pakiety pracy (dla agentów)

Zależności: A → B → C → E; D po A; F na końcu. Cloudflare (użytkownik)
przed testami B.

| Pakiet | Zakres | Gotowe, gdy |
|---|---|---|
| **A. DB** | migracja dodająca: tabele, RPC lease, `e2e_identity`, `e2e_reset_identity` + `_delete_user_data`, kwarantanna, zapadka tabel użytkownika, prefiks, blokada `noaccount`, nowy widok wykluczeń (stary wzorzec jeszcze obok) | test SQL lokalnie: dwa równoległe `e2e_lease` nie dostają tego samego konta, TTL zwalnia, `noaccount` nie da się zarejestrować; log migracji |
| **B. Worker** | `/_e2e_api/lease*`, provisioning i odtwarzanie wg roli z `e2e_role`, poczta `e2e+`, dostęp do skrzynki tylko z lease | unit Workera; mail kontrolny na `e2e+noaccount01@`; konta założone, `admin_excluded` dla każdego |
| **C. Harness** | `e2e-test.js` (`accounts`, `resources`, `loginAs`, `mailbox`), workflow bez `test_accounts`, `e2e-seq.sh` bez globalnego czekania | spec próbny z `standard: 2, noaccount: 1` zielony; dwa przebiegi naraz zielone |
| **D. Admin** | widok bez `test[0-9]+`, panel z rolą, przegląd funkcji statystyk, zapadka unit, `db-read` | 0 kont `e2e` bez wykluczenia; zrzut panelu |
| **E. Spece** | przepięcie speców na deklaracje, grupami (osobni agenci): E1 Gry/edytor/ustawienia/Control; E2 Bazy/Eksplorator/zadania; E3 Logo/kopie; E4 Ankiety/Go; E5 Poczta/subskrybenci/znajomi/centrum maili; E6 Konto/usuwanie/hasło/goście; E7 galeria E20 (`dedicated: "e20-gallery"`) | każda grupa zielona punktowo; brak użyć starych helperów (lint/unit) |
| **F. Sprzątanie** | usunięcie starych helperów, wzorców SQL/Worker, kont `test1`…`test17`, starych reguł Cloudflare (użytkownik); dokumenty | unit pilnuje braku `test[0-9]+@familiada` w repo; wpis w Dzienniku |

Każdy pakiet według cyklu z CLAUDE.md (lokalny Postgres → branch na
produkcyjnej bazie → Pages → testy kontrolne → Dziennik).

## 9. Weryfikacja całości

- Lokalny Postgres: współbieżne `e2e_lease`, TTL, blokada `noaccount`,
  widok wykluczeń.
- Unit: zapadka wykluczeń, brak starych wzorców, `noConflictMarkers`.
- E2E: dwa przebiegi naraz (np. grupa E2 i E5) na różnych lease — oba
  zielone; `disposable` w usuwaniu konta; Control z `heavy`.
- `db-read`: 0 kont `e2e` bez wykluczenia; panel admina pokazuje role.

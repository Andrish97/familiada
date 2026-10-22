# Testy E2E (Playwright)

Testy w tym folderze uruchamiają się przeciwko **prawdziwej produkcji**
(`www.familiada.online`), przez GitHub Actions (`.github/workflows/e2e-tests.yml`).
Nie ma osobnego środowiska stagingowego.

## Ominięcie captchy Turnstile — jak i dlaczego

Strona logowania (`/login`) ma captchę Cloudflare Turnstile w trybie
"managed" — normalnie przechodzi po cichu, ale przy sygnałach ryzyka
(nowe IP, brak historii — dokładnie profil runnera CI) potrafi wymusić
interaktywne wyzwanie, którego automat nie rozwiąże.

Rozwiązanie: **jednorazowy, krótkożyjący token** weryfikowany przez
Cloudflare Worker (`cloudflare/maintenance-worker/src/index.js`,
funkcja `handleE2ELoginBypass`), który — tylko dla żądań GET na `/login`
z poprawnym tokenem w nagłówku `X-E2E-Token` — podmienia atrybut
`data-captcha-site-key` na `<body>` na oficjalny, zawsze-przechodzący
testowy sitekey Cloudflare (`1x00000000000000000000AA`). Bez tego
nagłówka strona zachowuje się dokładnie jak dla każdego innego
odwiedzającego — brak jakiegokolwiek wpływu na prawdziwych użytkowników.

**Token:**
- Format: `base64(JSON{iat, nonce}).hex(HMAC-SHA256(payload, sekret))`
- Generowany raz na start testu (`tests/e2e/helpers/e2e-token.js`),
  wspólnym sekretem `E2E_BYPASS_SECRET`.
- Ważny max 5 minut od wygenerowania.
- **Jednorazowy** — Worker zapisuje zużyty `nonce` w istniejącym KV
  (`MAINT_KV`, ten sam co reszta workera) na 10 minut; drugie użycie
  tego samego tokenu jest odrzucane.
- Przy logowaniu token jednorazowo omija captchę. Po zalogowaniu test działa
  na normalnej sesji użytkownika.
- Podczas konserwacji testy Control i przełączenia produkcyjnego korzystają
  z `helpers/production-test.js`: każde żądanie do publicznego hosta otrzymuje
  świeży podpisany token, także w osobnych kontekstach urządzeń. Worker
  sprawdza podpis i pięciominutowy limit przed ominięciem konserwacji.
  Ominięcie konserwacji nie nadaje sesji ani uprawnień do panelu administratora.

## Cloudflare Bot Fight Mode — wyłączony na stałe

`Turnstile` w formularzu to nie jedyna ochrona na drodze — strefa
Cloudflare ma (miała) też **Bot Fight Mode** (Security → Bots), który
wykrywa i wyzywa ruch z centrów danych (a runner GitHub Actions to
dokładnie taki ruch) na poziomie edge, **zanim** żądanie w ogóle dotrze
do naszego Workera. Bez ominięcia tego, `/login` w ogóle się nie
renderował dla testów — nie pomagała żadna poprawka w kodzie appki ani
Workera.

Na Cloudflare **Free** ten mechanizm nie działa na silniku reguł —
WAF Custom Rules i Configuration Rules fizycznie go nie widzą, więc
nie da się go pominąć per-request (ani przez regułę Skip, ani przez
API tokenem ze scoped uprawnieniami — sprawdzone). Jedyna opcja bez
płacenia za wyższy plan: **wyłączyć go na stałe** w dashboardzie
(Security → Bots → Bot Fight Mode → off). Turnstile na `/login`
zostaje jako właściwa, aktywna ochrona przed botami przy logowaniu —
to jego omija powyższy mechanizm z tokenem, nie coś, co trzeba dorabiać
osobno.

## Wymagane sekrety

**GitHub Actions** (Settings → Secrets and variables → Actions):
- `E2E_BYPASS_SECRET` — losowy string (np. `openssl rand -hex 32`),
  **musi być identyczny** z sekretem `E2E_BYPASS_SECRET` ustawionym
  w Cloudflare Workerze (patrz niżej).
- `TEST_PASSWORD` — wspólne hasło **wszystkich** kont testowych.

**Tylko te dwa sekrety w ogóle.** Nie ma sekretu na nazwy użytkowników —
wszystkie konta testowe to wzorzec **`test1@familiada.online`,
`test2@familiada.online`, ...** — pełna lista i role w sekcji "Test accounts"
(`testAccountUsername(n)` w `e2e/helpers/login.js`) — domena jest stałą
w kodzie, nie sekretem, bo produkcja to zawsze `familiada.online`, a sam
login bez prawdziwego hasła niczego nie odsłania. Domyślne konto (gdy
test nie podaje jawnego `username`) to `test1@familiada.online`. Patrz
sekcja "Test accounts" niżej — trzeba realnie założyć te konta na
produkcji, tyle ile faktycznie jest używane.

**Cloudflare Worker** (`familiada`, `cloudflare/maintenance-worker`):
- `E2E_BYPASS_SECRET` — ta sama wartość co w GitHub Actions. Ustawiane
  ręcznie, raz: dashboard (Workers & Pages → familiada → Settings →
  Variables and Secrets) albo `wrangler secret put E2E_BYPASS_SECRET`.
  Nie jest częścią `deploy-worker.yml` — przetrwa kolejne deploye tak
  jak `SUPABASE_SERVICE_ROLE_KEY`.

**Cloudflare (dashboard, ustawienie strefy, nie Worker):**
- Security → Bots → Bot Fight Mode: **wyłączone na stałe**. Ręczne
  ustawienie, nie przechodzi przez żaden deploy — zmiana wymaga
  ręcznej edycji w dashboardzie.

## Bezpieczeństwo — czego to NIE jest

To nie jest "100% bezpieczny" mechanizm w sensie matematycznym — żaden
bypass żyjący w tym samym kodzie co obsługuje realny ruch nie jest. To,
co go czyni praktycznie bezpiecznym:
- działa wyłącznie na `/login`, nic więcej nie odblokowuje,
- jednorazowy + 5 min ważności — wyciek jednego tokenu ma minimalne okno,
- weryfikacja po stronie Workera (Cloudflare), nie w publicznym JS —
  sam mechanizm nie jest widoczny/odtwarzalny z bundla appki,
- `trace` Playwrighta celowo wyłączone w `playwright.config.js` (mogłoby
  nagrać nagłówek z tokenem w artefakcie CI) — `video` jest za to
  włączone (`retain-on-failure`), bo to samo nagranie ekranu, bez
  przechwytywania sieci/nagłówków, więc nie niesie tego ryzyka,
- workflow nie odpala się na `pull_request` z forka.

Realne ryzyko to przede wszystkim wyciek **sekretu bazowego**
(`E2E_BYPASS_SECRET`), nie pojedynczego tokenu — traktuj go jak każdy
inny sekret produkcyjny: nigdy nie commituj, nie loguj, nie wklejaj
w issues/PR-y.

## Uruchomienie lokalnie

```bash
cd tests
npm install
npx playwright install --with-deps chromium
E2E_BYPASS_SECRET="..." TEST_PASSWORD="..." npm test
```

## Uruchomienie w CI

**Tylko ręcznie** — celowo brak triggera na push czy pull_request. Ten
workflow loguje się na prawdziwe konta na produkcji, więc odpala się
wyłącznie świadomie: Actions → "E2E Tests (Playwright)" → Run workflow.

Sesja Claude Code nie ma uprawnień żeby triggerować to samodzielnie
(sprawdzone: MCP, bezpośrednie API GitHuba i `repository_dispatch` —
wszystkie zablokowane na poziomie infrastruktury Anthropic dla tego typu
sesji) — odpalenie zawsze wymaga kliknięcia przez człowieka w zakładce
Actions, albo uruchomienia lokalnie.

Pole **"spec_filter"** pozwala odpalić wyrywkowo tylko jeden plik albo
wzorzec zamiast całego zestawu — **to najczęstszy sposób odpalania tego
workflow**, nie pełny zestaw:

Pole **"unit_filter"** pozwala równocześnie ograniczyć unit testy do
wybranych plików rozdzielonych spacją, np.
`unit/rounds.engine.test.js unit/final.engine.test.js`. Puste pole zachowuje
dotychczasowy pełny zestaw.
- `e2e/nazwa-testu.spec.js` — tylko ten plik,
- `--grep "fragment nazwy testu"` — tylko pasujące testy.

Puste pole = wszystkie testy, w równoległych grupach (job `e2e-grouped`,
patrz sekcja "Test accounts" niżej). Filtr trafia w osobny job
(`e2e-custom-filter`) — **jeden silnik testów, jedna komenda wszędzie**:
ten sam `playwright.config.js`, ta sama
`playwright test <pliki/filtr> --workers="$TEST_WORKERS"` w KAŻDEJ
grupie `e2e-grouped` i w `e2e-custom-filter` — bez żadnego "jeśli to ten
plik, to inaczej". Lokalnie to samo bez żadnego dodatkowego ustawienia:
`npx playwright test e2e/nazwa-testu.spec.js`.

## Test accounts

Pełny mechanizm, decyzje i pakiety wdrożenia: [`docs/konta-testowe-plan.md`](../docs/konta-testowe-plan.md)
(E25). Stare zasady (`test1`…`test17`, `testAccountUsername`,
`loginAsPooledTestUser`, `test_accounts`) są **wycofane** — kod jeszcze ich
używa do końca E25, ale **nie dopisywać nowych użyć**; spece przepisują
dedykowani agenci (pakiet E planu).

### Roles

| Role | Name / e-mail | Account | Do czego |
|---|---|---|---|
| `standard` | `e2e.standard01` / `e2e+standard01@familiada.online` | tak | wszystko zwyczajne: własne dane, udostępnianie, znajomi, poczta do zalogowanego |
| `noaccount` | `e2e+noaccount01@familiada.online` | **nigdy** | odbiorca bez konta |
| `disposable` | `e2e.disposable01` (+ `e2e+disposable01.new@`) | tak, odtwarzane przy każdym lease | usuwanie konta, hasło, zmiana e-maila, profil |
| `dedicated` | `e2e.dedicated01` | tak, dane zostają | przypisane na stałe do jednej czynności (tabela niżej) |
| `guest` | tworzony w teście | tymczasowe | `loginAsGuest`, usuwany na końcu |

Numer w roli nic nie znaczy. Rola w scenariuszu (owner, recipient…) to
zmienna w teście, nie nazwa konta.

### Dedicated accounts

Konta ogólne z nazwy; przeznaczenie tylko z tej tabeli (źródło prawdy:
`e2e_identities.purpose`). Brać, gdy czynność musi **zawsze** używać tego
samego konta i trzymać na nim dane. Przypisanie: wolne konto → migracja
`purpose` → wiersz tutaj → `needs: { dedicated: "<purpose>" }`. Brak
wolnych → poprosić użytkownika o dodanie konta. Szczegóły: plan §1a.

| Account | Purpose | Kto używa | Dane na koncie |
|---|---|---|---|
| `e2e.dedicated01` | `e20-gallery` | galeria E20 (`e20-gallery.spec.js`, `e2e-tests.yml`) | dane do zrzutów |
| `e2e.dedicated02`–`06` | — wolne | | |

Resources (wspólne ograniczenia): `mail` (2 naraz — limity dostawcy),
`heavy` (1 naraz — Control, wyświetlacz).

### Rules for specs

1. Spec **deklaruje potrzeby na górze pliku** (jedna deklaracja na plik —
   suma potrzeb jego testów; w `describe` Playwright nie pozwala):
   `const { test, expect } = require("./helpers/e2e-test");`
   `test.use({ needs: { standard: 2, noaccount: 1, resources: ["mail"] } })`
   i bierze konta z fixture: `const [owner, recipient] = accounts.standard`.
   Nigdy adres, nazwa ani numer wpisane w specu. Wzór: `e2e/e2e-lease.spec.js`.
2. Logowanie tylko `loginAs(page, context, identity)` / `loginAsGuest`.
3. Poczta tylko przez `mailbox` i tylko na wypożyczonych tożsamościach.
4. Destrukcyjne operacje na koncie — wyłącznie `disposable`; trwałe dane jednej czynności — wyłącznie przypisany `dedicated`.
5. Na `noaccount` i `*.new` nie logować się i nie zakładać konta.
6. Spec, który wysyła maile, deklaruje `mail`; Control/wyświetlacz — `heavy`.
7. Gość — test sam usuwa konto gościa na końcu.
8. Nowa rola lub zasób — najpierw plan i ta sekcja, potem
   `e2e_identities` (migracja). Nic nie dopisywać tylko w specu.

### Jak przepisać stary spec (stopniowo — przy każdej zmianie speca)

Kto zmienia spec ze starymi kontami, przepisuje go w tym samym etapie.
Zapadka `unit/legacyTestAccounts.test.js` pilnuje, żeby użyć starych kont
tylko ubywało: przepisany plik usuń z `unit/legacy-test-accounts.json`.

| Było | Jest |
|---|---|
| `require("@playwright/test")` | `require("./helpers/e2e-test")` |
| `loginAsTestUser(page, context)` (test1) | `loginAs(page, context, accounts.standard[0])` |
| `testAccountUsername(n)` / `loginAsPooledTestUser(…, testInfo.parallelIndex)` | kolejne `accounts.standard[i]` (każdy worker ma własny komplet) |
| test7/test8 jako odbiorca z pocztą | `accounts.standard[1]` + `resources: ["mail"]` |
| `"test14@familiada.online"` | `accounts.noaccount[0].email` |
| test11/test12(+13)/test15 | `accounts.disposable[0]` (adres zapasowy: `email.replace("@", ".new@")`) |
| `clearMailbox("testN@…")` / `waitForEmail({ recipient })` | `mailbox.clear(identity)` / `mailbox.waitFor(identity, { … })` |
| `restoreTestAccount(...)` | usunięte — konto `disposable` odtwarzane przy każdym lease |
| `@mailbox`, kolejka „pojedynczo” | `resources: ["mail"]`; Control/wyświetlacz `resources: ["heavy"]` |

**Konta `test1`…`test17` usunięte (2026-10-22, migracja 463)**, reguły poczty `testN@`
też — spece ze starymi kontami nie przejdą, dopóki nie zostaną przepisane.
Worker nie ma już `/_e2e_api/accounts/restore` ani endpointów centrum maili/szablonów
pod test14.
**Poczta na `testN@` nie dochodzi** (reguły Cloudflare usunięte 2026-10-22) —
spec z `waitForEmail`/`clearMailbox` na starym adresie trzeba przepisać, zanim
znów przejdzie. Fikstury SQL z adresatem: `e2e_registered_subscriber_fixture(p_recipient_user_id, p_remove)`,
`e2e_subscriber_mail_flag(p_email, p_reset)`.

Konta są czyszczone przy wypożyczeniu — spec sam przygotowuje swoje dane
(bez polegania na danych zostawionych na test1…). Fikstury SQL/Worker
z test8/test14 na stałe (np. `e2e_registered_subscriber_fixture`,
`/_e2e_api/mail-center-*`) wymagają wersji z adresatem w parametrze —
zgłosić w Dzienniku, zanim spec zostanie przepisany (pakiet F).

### Rules for runs

- Każdy worker wypożycza (lease) swój komplet na wyłączność; brak wolnych
  kont → czeka do ~10 min, potem pada z listą posiadaczy.
- Każde konto jest **czyszczone przy wypożyczeniu** (`dedicated` — tylko
  blokady, sesje i skrzynka, dane zostają), więc padający test nie psuje
  kont następnym. Konto, którego nie da się wyczyścić, trafia do
  **kwarantanny** i nie jest wydawane (plan §3a).
- `scripts/agent-tools/e2e-seq.sh`: grupa samych speców z `helpers/e2e-test`
  startuje od razu; grupa ze starym specem czeka jak dotąd.
- Przebiegi równoległe dozwolone bez umawiania się — ogranicza je tylko
  lease (konta i zasoby).
- `TEST_WORKERS` (`--workers`) zostaje niskie (patrz „Pułapki”: run #122).

## Pułapki, na które łatwo wpaść (znalezione przy pierwszym realnym przebiegu)

Bot Fight Mode blokował ruch przez wszystkie pierwsze przebiegi CI, więc
te problemy ujawniły się dopiero gdy testy w ogóle zaczęły docierać do
strony. Zapisane tu, żeby nie trzeba było ich znowu wyłapywać po kolei:

- **Język UI: wymuszony na polski.** `getUiLang()`
  (`translation/translation.js`) sięga po `navigator.language`, zanim
  spadnie na domyślne `"pl"`. Chromium w CI zgłasza `en-US`, więc bez
  interwencji cała strona (w tym teksty przycisków w modalach, np.
  "Usuń"/"Przywróć") renderuje się po angielsku. `withE2EBypass()` w
  `helpers/login.js` ustawia `localStorage.uiLang = "pl"` przez
  `context.addInitScript` przed pierwszą nawigacją — **każdy nowy test
  musi logować się przez `loginAsTestUser`/`loginAsGuest`**, inaczej traci
  tę wymuszoną wartość i selektory z polskim tekstem przestaną trafiać.
- **Overlay z prośbą o ocenę appki** (`js/core/rating-system.js`) pokazuje
  się każdemu zalogowanemu (nie-gościowi) kontu starszemu niż 7 dni —
  a konta testowe (`test1@…` itd.) takie właśnie są. Zasłania klikalne
  elementy na całej stronie. Suppresowany tym samym `addInitScript`
  (`localStorage["fam:app_rating_suppressed"] = "true"`).
- **`/account` dla gościa pokazuje tylko sekcję "Usuń konto"** — reszta
  (w tym `#demoRestoreBtn`) jest schowana przez `hideForGuest()`
  (`account.js` `loadProfile()`). Testy dotykające czegokolwiek poza
  usuwaniem konta (np. restore-demo) nadal muszą logować się przez
  `loginAsTestUser`, nie `loginAsGuest` — patrz pełny opis w sekcji
  "Co jest zablokowane dla gościa" niżej.
- **Testy na współdzielonym koncie (bez jawnego `username`) muszą iść
  sekwencyjnie.** Dwa równoległe logowania na to samo konto testowe
  powodowały niedeterministyczne błędy (raz timeout logowania, raz
  "zawieszony" modal), bo sesje się gryzły. `playwright.config.js` ma
  `workers: 1` jako lokalną wartość domyślną; w CI zawsze nadpisuje to
  jawne `--workers="$TEST_WORKERS"`. Plik, który chce realnej
  równoległości, musi więc sam przypisywać KAŻDEMU workerowi inne konto z
  puli (patrz `loginAsPooledTestUser`, sekcja "Test accounts" wyżej) —
  inaczej wszystkie workery i tak trafią na to samo domyślne `test1@…` i
  wróci ten sam wyścig.
- **Za wysoki `TEST_WORKERS` przeciąża runnera, nie przyspiesza.** Run #122
  (`TEST_WORKERS`/wtedy jeszcze jedna wspólna zmienna = 10, na
  `control2.spec.js`): **12 z 16 testów failed, 57 minut**. Przyczyna: każdy
  POJEDYNCZY test control2 sam otwiera do 4 kontekstów przeglądarki
  (Control+Display+Host+Buzzer) — przy 10 workerach to do 40 jednoczesnych
  Chromium na jednym runnerze GitHub Actions. Runner fizycznie nie nadążał
  renderować strony w czasie, na jaki czekał Playwright — stąd masowe
  `element is not stable`/`element is not enabled` (setki powtórzeń, nie
  pojedyncze) i timeouty, **nie błąd logiki testów**. Dlatego
  `TEST_ACCOUNT_COUNT` (rozmiar puli) i `TEST_WORKERS` (realna
  równoległość) to dwie osobne zmienne — pierwsza może być wysoka, druga
  musi być niska (patrz sekcja "Test accounts" wyżej). Podnoś
  `TEST_WORKERS` po jednym i sprawdzaj wynik, zamiast zakładać, że więcej
  kont = można dać `--workers` na maksa.
- **Selektor karty gry musi być zawężony do `#grid`.** Sam kontener karty
  ma klasę `.card`, ale ma ją też otaczający panel `.card.games-card`
  w `games.html` — goły `.card` łapie oba i Playwright rzuca strict
  mode violation.

## Co jest zablokowane dla gościa i dla niezalogowanego

Przydatne przy pisaniu nowych testów — żeby nie zgadywać który tryb
logowania (`loginAsTestUser` czy `loginAsGuest`) pasuje do danej strony.

**Niezalogowany (brak sesji w ogóle):** każda strona appki wywołuje
`requireAuth()` (`js/core/auth.js`) jako pierwszy krok i bez sesji
przekierowuje na `/login`, zanim cokolwiek się wyrenderuje. Dotyczy to
`games`, `editor` (gra), `logo` (lista i edytory), `game-settings`, `manual`,
`polls`, `bases`/`base-explorer`, `account`, `subscriptions`
i `control/*`. Publicznie, bez logowania, dostępne są tylko strona
główna (`index.html`) i sam `/login`.

**Gość** (`user.is_guest === true`, konto założone przyciskiem "Wejdź
jako gość") **ma sesję, więc mija powyższą blokadę**, ale trafia na
pełnoekranowy, blokujący overlay (`#pageGuard`, `data-kind="guest"`,
`js/core/page-overlay.js`, wołany przez `initPage()` w `js/core/page-init.js`)
na stronach z `access: "user"` — treść
`pageGuard.guestMessage` w tłumaczeniach mówi wprost które to funkcje:
- `/polls` — Centrum ankiet.
- `/subscriptions` — subskrypcje.

**`/account` jest częściowym wyjątkiem** — gość NIE dostaje pełnego
blokującego overlaya. `loadProfile()` (`js/pages/account.js`) chowa mu
sekcje niedotyczące gościa (username/email/hasło, powiadomienia email,
ocena appki, przywracanie demo) przez `hideForGuest()`, ale zostawia
widoczną i działającą sekcję "Usuń konto" — jedyny sposób w UI, żeby
gość mógł sam usunąć swoje konto. `handleDeleteAccount()` ma osobną
gałąź dla gościa: bez weryfikacji hasłem (nie ma go), jedno
potwierdzenie modalem (`account.deleteGuestModalTitle`/`...Text`,
przycisk `account.deleteGuestModalOk` = "Usuń" — celowo inny tekst niż
przycisk `#deleteAccount` na stronie, żeby oba nie miały identycznego
tekstu widocznego jednocześnie, patrz `account-deletion.spec.js`).

Reszta appki (`games`, `editor`, `logo-editor`, `control/*`,
`bases`/`base-explorer`, `manual`, `game-settings`) działa dla gościa
normalnie — to nie jest blokada "gość = tryb tylko do odczytu", tylko
konkretna lista stron związanych z tożsamością/płatnościami.

Dodatkowe różnice gościa, nieblokujące UI, ale istotne dla testów:
- dane konta trzymane tylko w danej przeglądarce — brak cookies/localStorage
  = brak dostępu do konta (nie ma emaila/hasła do odzyskania),
- konto samo znika po 5 dniach nieaktywności (`guest_cleanup_expired`),
  ale **testy nie powinny na tym polegać** — patrz obowiązkowe
  sprzątanie w sekcji "Tryby logowania" niżej,
- przy pierwszym wejściu pokazuje się jednorazowy modal informacyjny
  (`js/core/guest-info-modal.js`, `maybeShowGuestInfoModal`) — w E2E nie
  przeszkadza bo testy nie czekają na żaden konkretny stan strony przed
  akcją inny niż to czego dotyczy dany test, ale jeśli nowy test zacznie
  klikać po `loginAsGuest()` w coś co ten modal mógłby zasłaniać, warto
  o nim pamiętać (analogicznie do `#ratingOverlay` opisanego wyżej).

## Tryby logowania w testach (`tests/e2e/helpers/login.js`)

- `loginAsTestUser(page, context)` — loguje się jako `test1@familiada.online`
  (domyślnie) loginem/hasłem konta testowego, przez prawdziwy formularz, z
  ominięciem captchy. Przekaż `{ username: testAccountUsername(n) }` żeby
  zalogować inne konto z puli.
- `loginAsGuest(page, context)` — zakłada świeże konto gościa przez
  przycisk "Wejdź jako gość", też przez prawdziwy formularz + bypass.
  Gość ma osobne ograniczenia w appce — używaj tego trybu gdy test ma
  sprawdzać właśnie te ograniczenia.
- `testAccountUsername(n)` — **czysta funkcja, nie loguje sama w sobie**.
  Zwraca login n-tego konta z puli testX (`test<n>@familiada.online`,
  domena stała w kodzie). Użyj razem z `loginAsTestUser(page, context,
  { username: testAccountUsername(2) })` w testach interakcji między
  kontami — patrz sekcja "Test accounts" wyżej (`base-explorer.spec.js`/
  `bases.spec.js` już tak robią, dla `test1`/`test2`).
- `getTestAccountPool()` / `loginAsPooledTestUser(page, context,
  workerIndex)` — pula `test1@…`, `test2@…`, ... `testN@…` (rozmiar =
  `TEST_ACCOUNT_COUNT`) do prawdziwej równoległości wewnątrz jednego pliku;
  `loginAsPooledTestUser` wybiera konto po `workerIndex` (przekaż
  `testInfo.parallelIndex`). Używane dziś przez `control2.spec.js`, ale
  nie jest do niego przywiązane — każdy plik może po to sięgnąć, patrz
  sekcja "Test accounts" wyżej.

  **Każdy test używający `loginAsGuest` musi na końcu sam usunąć to
  konto** (przez prawdziwy UI flow — `#deleteAccount` +
  `account.deleteGuestModalOk`, patrz `account-deletion.spec.js`) —
  nie polegaj na automatycznym wygaśnięciu po 5 dniach
  (`guest_cleanup_expired`). CI odpala się często i ręcznie, więc
  poleganie na wygaśnięciu zostawiałoby stertę martwych kont gości w
  prawdziwej produkcyjnej bazie między jednym czyszczeniem a drugim.
  Usuwanie na końcu testu to jedyne "sprzątanie fixture'a", jakiego
  tu potrzeba.

## Frontend po refaktorze

Pliki aplikacji są w `web/`: strona `<nazwa>/index.html`, jej skrypty w
`<nazwa>/js/`, wspólne moduły w `shared/js/`. Publiczne adresy zasobów
odpowiadają ścieżkom względem `web/`. Skrypt wersjonowania obejmuje tylko
frontend. Scenariusze E2E pozostają testami produkcyjnymi.

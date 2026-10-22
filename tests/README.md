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
`test2@familiada.online`, ...** — pełna lista i role w sekcji "Konta testowe"
(`testAccountUsername(n)` w `e2e/helpers/login.js`) — domena jest stałą
w kodzie, nie sekretem, bo produkcja to zawsze `familiada.online`, a sam
login bez prawdziwego hasła niczego nie odsłania. Domyślne konto (gdy
test nie podaje jawnego `username`) to `test1@familiada.online`. Patrz
sekcja "Konta testowe" niżej — trzeba realnie założyć te konta na
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
patrz sekcja "Konta testowe" niżej). Filtr trafia w osobny job
(`e2e-custom-filter`) — **jeden silnik testów, jedna komenda wszędzie**:
ten sam `playwright.config.js`, ta sama
`playwright test <pliki/filtr> --workers="$TEST_WORKERS"` w KAŻDEJ
grupie `e2e-grouped` i w `e2e-custom-filter` — bez żadnego "jeśli to ten
plik, to inaczej". Lokalnie to samo bez żadnego dodatkowego ustawienia:
`npx playwright test e2e/nazwa-testu.spec.js`.

## Konta testowe

Plan zmian i decyzje: [`docs/konta-testowe-plan.md`](../docs/konta-testowe-plan.md)
(etap E25 — tory i skrzynki bez konta). Ta sekcja opisuje **zasady
obowiązujące dziś**; część „Po E25” wchodzi w życie dopiero po wdrożeniu
etapu (wpis w Dzienniku `docs/wdrozenia.md`).

### Rodzaje adresów

Wszystkie w domenie `familiada.online` (stała w kodzie, nie sekret), konta
z jednym hasłem `TEST_PASSWORD`.

| Rodzaj | Adresy dziś | Konto | Skrzynka | Do czego |
|---|---|---|---|---|
| Zwykła pula | test1–test8 | tak | test1–test8 (`@mailbox` tylko test7, test8) | wszystkie zwykłe spece |
| Rezerwa ręczna | test9, test10 | tak | brak (`mail-trigger` odrzuca) | tylko jawnie `test_accounts=9,10`, testy bez poczty |
| Hasło | test11 | tak | tak | `account-password-email` |
| Profil / zmiana adresu | test12 (+ adres test13) | tak | tak | `account-password-email` |
| Skrzynka bez konta | test14 | **nie — nigdy nie zakładać** | tak | odbiorca bez konta (subskrybent tylko e-mail, urządzenie na e-mail) |
| Usuwanie konta | test15 | tak, odtwarzane | tak | `account-deletion`, `recipient-account-cascade`, `poll-*-identity` |
| Galeria E20 | test17 | tak, odtwarzane | tak (tylko odczyt) | wyłącznie workflow galerii E20 |

Po E25 nowe skrzynki używają jednej reguły Cloudflare (`e2e@` + subaddressing,
bez dopisywania reguł): konta torów mają e-mail `e2e+t{L}{k}@familiada.online`
i nazwę użytkownika `test{L}{k}` (logowanie nazwą), skrzynki bez konta —
**inny identyfikator** `e2e+bezkontaN@familiada.online` (N = numer toru).
`test…` zawsze oznacza konto, `bezkonta…` — samą skrzynkę; test14 zostaje
wycofany i nie jest przydzielany ponownie. Szczegóły:
`docs/konta-testowe-plan.md`, „Poczta testowa — jedna reguła”.

### Role kont zwykłej puli

Numer konta w specu = rola (po E25 ta sama rola w każdym torze):

| Konto | Rola | Kto używa dziś |
|---|---|---|
| test1 | konto główne (domyślne `loginAsTestUser`), operator Control | bases, base-explorer, games, editor, game-settings, marketplace, index, polls, privacy-manual, cross-resource-locks, mobile-sheet-modals |
| test2 | drugi użytkownik (właściciel/edytor przy udostępnieniu) | bases, base-explorer, tasks, resource-copy-send, logo |
| test3 | odbiorca udostępnienia | tasks, logo |
| test4, test5 | wolne — workery puli | `loginAsPooledTestUser` |
| test6 | edytor logo, bez maili | logo-editor |
| test7 | zalogowany odbiorca z pocztą | bases, control2 (udostępnianie urządzenia), friends, poll-share, subskrypcje, recipient-account-cascade |
| test8 | zaproszony / odbiorca maili | subscribers, friends, poll-share, bases, cross-resource-locks |
| test14 | bez konta | control2, friends, go, guest-migration, mail-center, mail-content, poll-share, subscribers |

Pula `loginAsPooledTestUser(page, context, testInfo.parallelIndex)`
przydziela konta po indeksie workera z `getTestAccountPool()` —
`TEST_ACCOUNT_COUNT` (= 8) albo jawne `test_accounts`. Bez `test_accounts`
indeks 0 to test1 — to samo konto, którego używają spece z test1 na stałe.

### Warunki przypisywania kont (nowy lub zmieniany spec)

1. Logowanie **tylko** przez `loginAsTestUser` / `loginAsPooledTestUser` /
   `loginAsGuest` (wymuszony język, bypass, wyłączona ocena).
2. Konto wybierać **po roli** z tabeli wyżej przez `testAccountUsername(n)`
   albo pulę — nigdy przez wpisany adres (`"test8@familiada.online"`).
   Spec, który potrzebuje tylko „jakiegoś konta”, używa puli.
3. Test, który czyści lub czyta pocztę (`@mailbox`, `clearMailbox`), używa
   wyłącznie adresów ze skrzynką: test7, test8, skrzynki bez konta;
   `clearMailbox` tylko na adresach, które ten spec przypisał sobie jako
   odbiorców (czyści **całą** skrzynkę).
4. Odbiorca bez konta: tylko skrzynka bez konta (dziś `test14`, po E25
   skrzynka toru). Nie logować się na nią, nie zakładać konta.
5. Konta specjalne (11, 12/13, 15, 17) tylko w spekach z tabeli wyżej;
   odtwarzać przez `restoreTestAccount(...)` przed testem i w `finally`.
6. Gość (`loginAsGuest`) — każdy test sam usuwa konto gościa na końcu
   (patrz „Tryby logowania”).
7. Nowy adres lub nowa rola: najpierw wpis w tej sekcji i w
   `docs/konta-testowe-plan.md`, potem kod (jedno źródło listy adresów:
   JS, SQL, Worker). Po E25 nowe skrzynki to `e2e+<id>@` — bez nowych
   reguł w Cloudflare. Nie dopisywać adresu tylko w specu.

### Warunki używania (przebiegi)

**Dziś:**
- Domyślnie **jeden przebieg e2e naraz** (`scripts/agent-tools/e2e-seq.sh`
  czeka na brak innych przebiegów).
- Równolegle wolno tylko przebiegi z **rozłącznym** `test_accounts`
  (np. `1,2,3` i `4,5,6`), w których spece logują się wyłącznie przez pulę
  i nie mają `@mailbox`. `PARALLEL=1` w `e2e-seq.sh`.
- Pojedynczo, gdy nic innego nie biegnie: spece z kontami na stałe
  (`testAccountUsername(n)`, domyślne test1), `@mailbox`, konta specjalne,
  ciężkie (control2, wyświetlacz).

**Po E25 (tory):**

| Tor | Konta (role 1–8) | Skrzynka bez konta | Konta specjalne |
|---|---|---|---|
| 1 | test1–test8 | `e2e+bezkonta1@` | test11, test12+13, test15, test17 |
| 2 | test21–test28 (`e2e+t21@`…) | `e2e+bezkonta2@` | — |
| 3 | test31–test38 (`e2e+t31@`…) | `e2e+bezkonta3@` | — |
| 4 | test41–test48 (`e2e+t41@`…) | `e2e+bezkonta4@` | — |

- Przebieg = jeden tor (wejście workflow `lane`); `testAccountUsername(n)`
  zwraca rolę `n` bieżącego toru, więc spece działają w każdym torze bez zmian.
- Dwa przebiegi na tym samym torze — nigdy. Agent bierze wolny tor
  (`e2e-seq.sh` wybiera sam), czeka tylko, gdy wszystkie są zajęte.
- Konta specjalne tylko w torze 1 (tag `@specjalne`).
- Wspólne mimo torów: ciężkie spece (control2, wyświetlacz) — jeden naraz
  na wszystkie tory; `@mailbox` — najwyżej 2 tory naraz (wspólne limity
  dostawcy poczty); łącznie najwyżej 3 przebiegi naraz.

### Zmienne workflow

- `TEST_ACCOUNT_COUNT` — górny numer zwykłej puli (dziś 8).
- `TEST_ACCOUNT_NUMBERS` — wejście `test_accounts`: jawny zestaw kont puli
  (dziś 1–10) dla odizolowanego przebiegu.
- `TEST_WORKERS` — ile kont faktycznie działa naraz (`--workers`). **Musi
  zostać niskie** (patrz „Pułapki”: run #122) — podnosić po jednym.

### Konta specjalne — odtwarzanie

`restoreTestAccount("test11" | "test12" | "test15" | "test17")` (Worker
`/_e2e_api/…`) tworzy brakujące konto z potwierdzonym adresem
i `TEST_PASSWORD`; istniejące zachowuje ID. Dla test15 sprawdza też
automatyczny wyjątek admina. Po odtworzeniu sprawdzić logowanie w świeżym
kontekście. Dane i dawne dostępy nie wracają.
`test-account-restore.spec.js` sprawdza 11/12/15; `recipient-account-cascade.spec.js` —
usunięcie test15 przez UI, rzeczywiste maile, oba typy głosów i stare linki.
Każda skrzynka wymaga reguły Cloudflare Email Routing kierującej ją do
Workera `familiada`. Punktowo, jeden przebieg naraz, bez retry. Nie
logować haseł ani tokenów. test17 — stałe konto galerii E20; workflow
galerii nie usuwa jej zasobów ani całej poczty.

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
  puli (patrz `loginAsPooledTestUser`, sekcja "Konta testowe" wyżej) —
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
  musi być niska (patrz sekcja "Konta testowe" wyżej). Podnoś
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
  kontami — patrz sekcja "Konta testowe" wyżej (`base-explorer.spec.js`/
  `bases.spec.js` już tak robią, dla `test1`/`test2`).
- `getTestAccountPool()` / `loginAsPooledTestUser(page, context,
  workerIndex)` — pula `test1@…`, `test2@…`, ... `testN@…` (rozmiar =
  `TEST_ACCOUNT_COUNT`) do prawdziwej równoległości wewnątrz jednego pliku;
  `loginAsPooledTestUser` wybiera konto po `workerIndex` (przekaż
  `testInfo.parallelIndex`). Używane dziś przez `control2.spec.js`, ale
  nie jest do niego przywiązane — każdy plik może po to sięgnąć, patrz
  sekcja "Konta testowe" wyżej.

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

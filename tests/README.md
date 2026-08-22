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
- Potrzebny tylko na moment logowania — po zalogowaniu testy działają
  na normalnej, prawdziwej sesji (ważnej ~1h), token bypass nie jest
  już nigdzie potrzebny w danym runie.

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
- `TEST_USERNAME` / `TEST_PASSWORD` — dane logowania konta testowego
  (zwykłe konto, nie gość — używane tam gdzie test wymaga zalogowanego
  usera, np. `game-deletion.spec.js`).

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
- `trace`/`video` Playwrighta celowo wyłączone w `playwright.config.js`
  (mogłyby nagrać nagłówek z tokenem w artefakcie CI),
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
E2E_BYPASS_SECRET="..." TEST_USERNAME="..." TEST_PASSWORD="..." npm test
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
wzorzec zamiast całego zestawu:
- `e2e/nazwa-testu.spec.js` — tylko ten plik,
- `--grep "fragment nazwy testu"` — tylko pasujące testy.

Puste pole = wszystkie testy. Lokalnie to samo bez żadnego dodatkowego
ustawienia: `npx playwright test e2e/nazwa-testu.spec.js`.

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
  a `TEST_USERNAME` takie właśnie jest. Zasłania klikalne elementy na
  całej stronie. Suppresowany tym samym `addInitScript`
  (`localStorage["fam:app_rating_suppressed"] = "true"`).
- **`/account` dla gościa pokazuje tylko sekcję "Usuń konto"** — reszta
  (w tym `#demoRestoreBtn`) jest schowana przez `hideForGuest()`
  (`account.js` `loadProfile()`). Testy dotykające czegokolwiek poza
  usuwaniem konta (np. restore-demo) nadal muszą logować się przez
  `loginAsTestUser`, nie `loginAsGuest` — patrz pełny opis w sekcji
  "Co jest zablokowane dla gościa" niżej.
- **Testy na współdzielonym `TEST_USERNAME` muszą iść sekwencyjnie.**
  `playwright.config.js` ma `workers: 1` — dwa równoległe logowania na to
  samo konto testowe powodowały niedeterministyczne błędy (raz timeout
  logowania, raz "zawieszony" modal), bo sesje się gryzły. Jeśli kiedyś
  dojdzie tu drugi test na `loginAsTestUser`, zostaw `workers: 1`.
- **Selektor karty gry musi być zawężony do `#grid`.** Sam kontener karty
  ma klasę `.card`, ale ma ją też otaczający panel `.card.builder-card`
  w `builder.html` — goły `.card` łapie oba i Playwright rzuca strict
  mode violation.

## Co jest zablokowane dla gościa i dla niezalogowanego

Przydatne przy pisaniu nowych testów — żeby nie zgadywać który tryb
logowania (`loginAsTestUser` czy `loginAsGuest`) pasuje do danej strony.

**Niezalogowany (brak sesji w ogóle):** każda strona appki wywołuje
`requireAuth()` (`js/core/auth.js`) jako pierwszy krok i bez sesji
przekierowuje na `/login`, zanim cokolwiek się wyrenderuje. Dotyczy to
`builder`, `editor` (gra), `logo-editor`, `game-settings`, `manual`,
`polls-hub`, `polls`, `bases`/`base-explorer`, `account`, `subscriptions`
i `control/*`. Publicznie, bez logowania, dostępne są tylko strona
główna (`index.html`) i sam `/login`.

**Gość** (`user.is_guest === true`, konto założone przyciskiem "Wejdź
jako gość") **ma sesję, więc mija powyższą blokadę**, ale trafia na
pełnoekranowy, blokujący overlay (`showGuestBlockedOverlay`,
`js/core/guest-mode.js`) na dwóch konkretnych stronach — treść
`guestGuard.message` w tłumaczeniach mówi wprost które to funkcje:
- `/polls-hub` (`js/pages/polls-hub.js:1099`) — panel ankiet,
- `/subscriptions` (`js/pages/subscriptions.js:699`) — subskrypcje.

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

Reszta appki (`builder`, `editor`, `logo-editor`, `control/*`,
`bases`/`base-explorer`, `manual`, `game-settings`) działa dla gościa
normalnie — to nie jest blokada "gość = tryb tylko do odczytu", tylko
konkretna lista stron związanych z tożsamością/płatnościami.

Dodatkowe różnice gościa, nieblokujące UI, ale istotne dla testów:
- dane konta trzymane tylko w danej przeglądarce — brak cookies/localStorage
  = brak dostępu do konta (nie ma emaila/hasła do odzyskania),
- konto samo znika po 5 dniach nieaktywności (`guest_cleanup_expired`,
  patrz `tryby logowania` niżej) — zero ręcznego sprzątania fixture'ów,
- przy pierwszym wejściu pokazuje się jednorazowy modal informacyjny
  (`js/core/guest-info-modal.js`, `maybeShowGuestInfoModal`) — w E2E nie
  przeszkadza bo testy nie czekają na żaden konkretny stan strony przed
  akcją inny niż to czego dotyczy dany test, ale jeśli nowy test zacznie
  klikać po `loginAsGuest()` w coś co ten modal mógłby zasłaniać, warto
  o nim pamiętać (analogicznie do `#ratingOverlay` opisanego wyżej).

## Tryby logowania w testach (`tests/e2e/helpers/login.js`)

- `loginAsTestUser(page, context)` — loguje się loginem/hasłem konta
  testowego, przez prawdziwy formularz, z ominięciem captchy.
- `loginAsGuest(page, context)` — zakłada świeże konto gościa przez
  przycisk "Wejdź jako gość", też przez prawdziwy formularz + bypass.
  Gość ma osobne ograniczenia w appce — używaj tego trybu gdy test ma
  sprawdzać właśnie te ograniczenia. Konto samo zniknie po 5 dniach
  (istniejący `guest_cleanup_expired`), zero ręcznego sprzątania.

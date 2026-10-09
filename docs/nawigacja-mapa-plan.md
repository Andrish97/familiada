# Nawigacja — jedna mapa przekierowań (propozycja)

Cel: każda strona deklaruje w JEDNYM miejscu kto może na nią wejść
(niezalogowany / gość / konto), na jakim urządzeniu, dokąd prowadzi „Wstecz”
i jak się nazywa. Strony przestają same składać `?ret=`, `?from=`, etykiety
„← Wróć do …”, overlaye gościa i przekierowania na logowanie.

---

## 1. Co dziś jest niespójne (znalezione w kodzie)

**Powrót („Wstecz”)**

| Strona | Jak dziś liczy powrót | Problem |
|---|---|---|
| games → bases / polls-hub / subscriptions / polls | `?from=games` (`games.js:1393-1610`) | nikt nie czyta `from` — strony czytają `ret`; działa tylko dzięki domyślnemu `/games/` |
| polls-hub → polls | `?ret=<bieżący url>` (`polls-hub.js:548`) | OK, ale to inny mechanizm niż wyżej |
| bases → base-explorer | bez `ret` (`bases.js:1551`), explorer zawsze wraca na `/bases/` (`page.js:53`) | gubi zakładkę/filtr bases |
| editor, logo-editor, control, game-settings | na sztywno `/games/` | wejście z innego miejsca i tak wraca do gier; część bez `withLangParam` (`control/app.js:810`, `game-settings.js:1618`) — gubi język |
| marketplace → manual | `ret=marketplace` (nie ścieżka!) (`marketplace.js:808`) | manual normalizuje to do `/marketplace` przypadkiem |
| device-guard „Wstecz” | `history.back()` / `document.referrer` | inaczej niż wszystkie inne przyciski |
| etykiety „← Wróć do …” | osobne tabele `ret → klucz` w `manual.js:142`, `polls-hub.js:1138`, `subscriptions.js:792` | trzy kopie tej samej logiki, każda z inną listą stron |

**Logowanie i role**

- `requireAuth()` w control jest wołane bez argumentu → domyślne `"login"` to
  ścieżka WZGLĘDNA → przekierowanie na `/control/login` (404).
  (`control/app.js:173`, `auth.js:298`). **To jest realny błąd.**
- Po zalogowaniu zawsze `/games/` — **tak ma zostać** (decyzja). Jedyny
  wyjątek już istnieje: zaproszenie z maila (`/poll-go/` →
  `/login/?next=polls-hub|subscriptions`, `login.js:559`), który po
  zalogowaniu otwiera to zadanie/subskrypcję.
- `account` woła `requireAuth("/login/?setup=username")` — niezalogowany
  ląduje na ekranie ustawiania nazwy zamiast logowania.
- Gość: polls-hub/subscriptions pokazują overlay (`showGuestBlockedOverlay`),
  bases/games/account chowają przyciski (`hideForGuest`), marketplace
  traktuje gościa jak niezalogowanego, connect-device wysyła gościa
  „Wstecz” na `/` (landing), a marketplace na `/games/`.
- Overlay gościa i overlay urządzenia wyglądają inaczej (`guest-mode.js` vs
  `device-guard.js`).

**Topbar**

- „Ustawienia konta” w menu konta jest tylko na games (`withAccountSettings`).
- Wylogowanie ma 3 różne klucze i18n (`control.logout`,
  `logoEditor.topbar.logout`, `baseExplorer.logout`) obok `common.logout`.
- account nie ma sekcji 4 (konta), privacy nie ma „Instrukcji”,
  marketplace w sekcji 1 ma „Moje gry” zamiast „← Wstecz”.

**Mobile / desktop — trzy różne definicje „telefonu”**

| Gdzie | Reguła |
|---|---|
| topbar → hamburger | szerokość okna ≤ 980 px |
| modal-sheet (pełnoekranowe modale) | szerokość okna ≤ 600 px |
| device-guard (control, game-settings) | krótszy bok ekranu < 700 px |

**Tryb modala (strona w `iframe` na innej stronie)** — kierunek: rezygnacja, patrz sekcja 2 „Bez stron modalnych”.

| Strona w modalu | Kto otwiera | Parametr | Problem |
|---|---|---|---|
| `/game-settings/` | Control (`control/app.js:767`) | `modal=1` | inny format niż reszta; zamykanie własnym protokołem `gs:requestClose / gs:close / gs:ready` |
| `/manual/` | Control, game-settings, logo-editor (tylko w trybie edycji) | `modal=control` / `modal=logo-editor` | każda strona ma WŁASNĄ kopię okna pomocy (HTML + JS) — 3 kopie |
| `/privacy/` | te same trzy | `modal=control` / `modal=logo-editor` | w `<head>` chowa topbar dla każdej wartości, ale `privacy.js:51` rozpoznaje tylko `control` → w logo-editorze inny układ |

- Modal w modalu: Control → ustawienia gry (iframe) → „?” → instrukcja
  (iframe w iframe).
- `ret` w modalu jest bez sensu, a bywa zepsuty: game-settings ustawia
  `ret=game-settings?...` (bez `/`, `game-settings.js:1831`).
- Strona w modalu przy braku sesji przekierowuje **sam iframe** na
  `/login/` (game-settings woła `requireAuth`) — logowanie w okienku.
- Ta sama strona otwierana raz jako modal, raz jako zwykła strona: w
  logo-editorze „?” na liście = przejście na `/manual/`, w trybie edycji =
  modal; w game-settings „?” = zawsze modal.

---

## 2. Propozycja: `shared/js/core/nav-map.js`

Jeden deklaratywny plik. Każda strona to wpis:

```js
// shared/js/core/nav-map.js
// access:  kto wchodzi: "public" | "guest" (gość + konto) | "user" (tylko konto)
// device:  "any" | "wide" (Control/ustawienia gry: device-guard)
// parent:  dokąd „Wstecz”, gdy nie ma poprawnego ?ret=
// from:    strony, na które „Wstecz” wolno wrócić (dozwolona ścieżka) — ?ret=
//          spoza tej listy jest ignorowane i „Wstecz” idzie do parent
// manual:  kotwica instrukcji (#...) dla przycisku „?”
export const PAGES = {
  home:          { path: "/",               access: "public" },
  login:         { path: "/login/",         access: "public" },
  games:         { path: "/games/",         access: "guest",  parent: null,        manual: "general" },
  editor:        { path: "/editor/",        access: "guest",  parent: "games",     manual: "editor" },
  polls:         { path: "/polls/",         access: "guest",  parent: "games",     manual: "polls" },
  pollsHub:      { path: "/polls-hub/",     access: "user",   parent: "games",     manual: "polls" },
  subscriptions: { path: "/subscriptions/", access: "user",   parent: "games",     manual: "subscriptions" },
  bases:         { path: "/bases/",         access: "guest",  parent: "games",     manual: "bases" },
  baseExplorer:  { path: "/base-explorer/", access: "guest",  parent: "bases",     manual: "bases" },
  logoEditor:    { path: "/logo/",   access: "guest",  parent: "games",     manual: "logo" },
  control:       { path: "/control/",       access: "guest",  parent: "games",     manual: "control",  device: "wide" },
  gameSettings:  { path: "/game-settings/", access: "guest",  parent: "games",     manual: "control",  device: "wide" },
  marketplace:   { path: "/marketplace/",   access: "public", parent: "games",     manual: "community" },
  connectDevice: { path: "/connect-device/",access: "public", parent: "games",     manual: "connect" },
  account:       { path: "/account/",       access: "guest",  parent: "games",     manual: "general" },
  manual:        { path: "/manual/",        access: "guest",  parent: "games" },  // decyzja: tylko z kontem/gościem
  privacy:       { path: "/privacy/",       access: "public", parent: "manual" },
};
```

Nazwa strony do etykiet: `nav.page.<id>` w `pl/en/uk.js`, przycisk powrotu
zawsze `nav.backTo` = „Wróć do: {page}”. Koniec z tabelami etykiet.

### API (to, czego używają strony)

```js
// Jedno wywołanie na starcie strony zamiast requireAuth + showGuestBlockedOverlay
// + guardDesktopOnly + setTopbarAccount + ręcznego btnBack/btnManual:
const user = await initPage("editor");

linkTo("polls", { id })       // → /polls/?id=…&ret=<bieżący url>&lang=…
backHref("polls")             // ?ret=, jeśli to dozwolona ścieżka (from), inaczej parent
loginUrl()                    // → /login/ (po zalogowaniu zawsze /games/)
```

`initPage(id)` robi po kolei:

1. **Dostęp** wg tabeli z punktu 3 (przekierowanie / overlay / OK).
2. **Urządzenie**: `device: "wide"` → `guardDesktopOnly()`.
3. **Topbar**: podpina `#btnBack` (href + etykieta z mapy), `#btnManual`
   (`/manual/?ret=…#<manual>`), konto (`setTopbarAccount` z tym samym menu
   na każdej stronie).
4. Zwraca użytkownika (albo `null` dla `public`).

### Bez fallbacków (decyzja)

Jedno źródło na każdą rzecz, bez zapasowych ścieżek:
- **Adres** jest jedynym źródłem stanu strony (`id`, `q`, `tab`,
  `folder`). Bez zapasu w `sessionStorage` (dziś bases).
- **Bez aliasów i przekierowań** starych adresów i parametrów:
  `/logo-editor/`, `?base=`, `#control`, `?modal=`, `?from=` znikają razem
  ze zmianą; wszystkie linki w kodzie, instrukcji i mailach zmieniane w tym
  samym kroku.
- **Bez zgadywania**: karta wraca tylko przez `ret`; bez `ret` — `parent`
  na domyślnej karcie.
- **„Wstecz” tylko z mapy**: `ret` z listy `from` albo `parent`. Koniec
  z `history.back()` / `document.referrer` (dziś okno blokady urządzenia,
  `device-guard.js:52`) i z twardymi `/games/` w kodzie stron.
- **Logowanie**: `requireAuth()` bez wartości domyślnej — cel zawsze
  z mapy (dziś domyślne względne `"login"` daje 404 w Control).
- Jedyne, co zostaje: zaproszenie z maila (`next=`) — to funkcja, nie
  zapas.

### „Wstecz” przez wszystkie kroki, tylko po dozwolonej ścieżce (decyzja)

`linkTo()` zapisuje w `ret` **pełny** bieżący adres — razem z jego własnym
`ret`. Dzięki temu łańcuch odtwarza się sam, krok po kroku:

```
/games/
  → /polls-hub/?ret=/games/
    → /polls/?id=7&ret=/polls-hub/?ret=/games/
      → /manual/?ret=/polls/?id=7&ret=/polls-hub/?ret=/games/#polls
↩ manual → polls(7) → polls-hub → games
```

Każdy krok jest sprawdzany z mapą: `ret` musi wskazywać stronę z listy
`from` bieżącej strony (np. `polls.from = ["games", "pollsHub"]`,
`manual.from = *` — wszystkie strony z topbarem). Inny / obcy / zepsuty
`ret` → „Wstecz” do `parent` (to reguła mapy, nie zapas — `parent` jest
celem „Wstecz” dla wejścia bez `ret`, np. z zakładki). Podwójnych powrotów
będzie mało, ale gdyby łańcuch urósł, limit 4 poziomów (głębsze `ret` są
obcinane do `parent`).

### Bez stron modalnych (kierunek)

Każda strona jest zwykłą stroną: `?`, „Prywatność” i ustawienia gry zawsze
**przechodzą** (z `ret`), nigdy nie otwierają się w `iframe`. Tryb
`?modal=` znika z manual, privacy i game-settings, a z nim 3 kopie okna
pomocy i protokół `gs:*`. Okna (modal-sheet) zostają tylko dla dialogów
wewnątrz strony (potwierdzenia, podgląd, formularze) — to nie są strony.

Warunek: **wyjście ze strony nigdy nie gubi pracy.** Dlatego najpierw:

| Strona | Dziś | Potrzebne |
|---|---|---|
| `/editor/` (pytania) | autozapis już jest (`debounce` + `flush` przy wyjściu, `editor.js:101`) | nic — to jest wzór |
| `/logo-editor/` tryb edycji | ręczne „Zapisz”, pytanie przy zamykaniu, `beforeunload` (`main.js:531-584`) | **autozapis + żywy postęp** (niżej) |
| `/game-settings/` | „Zapisz wszystko”, pytanie o niezapisane zmiany (`game-settings.js:173`) | autozapis jak w edytorze pytań |
| `/control/` | stan gry w bazie, `store.hydrate()` wznawia po powrocie (`store.js:78`) | nic — powrót z instrukcji/ustawień odtwarza stan |

**Autozapis bez pytania (logo, ustawienia gry)** — ten sam wzorzec co
`editor.js`. Postęp jest cały czas zapisany, więc nie ma pytania „Masz
niezapisane zmiany” w ogóle, a do pracy można wrócić nawet po zamknięciu
karty:
1. Każda zmiana → zapis z opóźnieniem (`debounce` ~800 ms; rysowanie:
   po puszczeniu pędzla, nie co piksel).
2. `flush()` przy wyjściu: klik „Wstecz”/„?”, `pagehide`,
   `visibilitychange: hidden`. Bez `beforeunload` i bez pytań.
3. Żywy status w miejscu przycisku „Zapisz”: *Zapisywanie… → Zapisano ✓ →
   Błąd zapisu (ponawiam…)*. Błąd też nie pyta — zmiany czekają w kopii
   roboczej i idą przy następnej próbie / następnym otwarciu.
4. Bez kopii roboczej w przeglądarce: zapis idzie prosto do bazy po
   0,7 s przerwy i od razu przy wyjściu / schowaniu karty, więc po
   powrocie na `?id=` praca jest na miejscu. Czynność w toku (pisanie
   napisu na scenie, przeciągany kształt, wczytywany obraz) wstrzymuje
   zapis do jej końca (`isInteracting()` edytora).
5. Nowe logo: wiersz w bazie powstaje od razu po „Nowe logo” (nazwa
   z okna nazwy), żeby `id` było w adresie od pierwszej chwili.
6. Cofnij/ponów w rysowaniu (`draw.js` `history`) żyje do wyjścia ze
   strony.

**Podział edytorów na osobne strony** (koniec z ✕ w topbarze i trybem
„edycja” wewnątrz listy):

| Dziś | Po podziale | ↩ |
|---|---|---|
| `/logo-editor/` lista + tryb edycji (`is-editor`, `topbar-no-menu`, `btnCloseEditor` ✕) | `/logo/` — tylko lista · **3 osobne strony** jak edytor pytań: `/logo/editor-text/?id=…`, `/logo/editor-draw/?id=…`, `/logo/editor-image/?id=…` | „← Wróć do: Logo” → `ret` (lista na karcie, z której wszedł) |
| Control → ustawienia gry w `iframe` | `/game-settings/?id=…&ret=/control/?id=…` | „← Wróć do: Control” |
| Control / game-settings / logo-editor → instrukcja, prywatność w `iframe` | `/manual/?ret=…`, `/privacy/?ret=…` | „← Wróć do: {strona}” |
| `/editor/` — wybrane pytanie tylko w pamięci (`activeQId`, `editor.js:362`) | `/editor/?id=<gra>&q=<pytanie>` — po powrocie (z instrukcji, odświeżeniu, linku) otwiera się to samo pytanie | telefon: ↩ zamyka pytanie (`?q=` znika z adresu); bez pytania: ↩ → `ret` albo `/games/` |

**Adresy (decyzja):** lista `/logo/`, edytory `/logo/editor-text/`,
`/logo/editor-draw/`, `/logo/editor-image/` (`?id=<logo>`); w mapie skrótowo `/logo/editor-<typ>/`. Stary
`/logo-editor/` znika (bez przekierowania); linki w kodzie i instrukcji
zmieniane w tym samym kroku.

W mapie trzy wpisy `logoText`, `logoDraw`, `logoImage` (`access: "guest"`,
`parent: "logoEditor"`, `device: "noPhone"`, `resource: "logo"`) — na
telefonie „Edytuj” i „Nowe logo” są ukryte (ta sama reguła co „Graj”).
Link do edytora zawsze buduje lista z typu logo; logo innego typu niż
strona (np. rysowane pod `/logo/editor-text/`) → komunikat błędu, bez
przekierowania. Edytor logo staje się
4 lekkimi stronami zamiast jednej 871-liniowej `main.js` z trzema trybami:
wspólny kod (zapis, kopia robocza, podgląd, topbar) w module, każda strona
ładuje tylko swój edytor (`text.js` / `draw.js` / `image.js`).

### Co pamięta powrót: zasób na stronach szczegółu, kartę na listach (decyzja)

- **Strony szczegółu** pamiętają swój zasób w adresie (`?id=`) i swój stan:
  edytor pytań — pytanie, eksplorator baz — bazę i folder.
- **Listy** pamiętają tylko **kartę** (`?tab=`). Zaznaczenia gry / logo /
  bazy nie pamiętamy.

| Strona | Stan w adresie (wraca przez `ret`) |
|---|---|
| `/editor/` | `id` (gra), `q` (pytanie) |
| `/control/`, `/game-settings/`, `/polls/` | `id` (gra) |
| `/logo/editor-<typ>/` | `id` (logo) |
| `/base-explorer/` | `id` (baza; dziś `?base=` — zamieniane na `id`, bez aliasu), `folder` |
| `/games/`, `/logo/`, `/bases/`, `/polls-hub/`, `/subscriptions/`, `/marketplace/`, `/manual/` | `tab` (+ w marketplace `q`, `filter`, `sort`, jak dziś) |

```js
editor:       { path: "/editor/",            resource: "game", parent: "games",      state: ["id", "q"] },
control:      { path: "/control/",           resource: "game", parent: "games",      state: ["id"] },
gameSettings: { path: "/game-settings/",     resource: "game", parent: "control",    state: ["id"] },
logoDraw:     { path: "/logo/editor-draw/",  resource: "logo", parent: "logoEditor", state: ["id"] },
baseExplorer: { path: "/base-explorer/",     resource: "base", parent: "bases",      state: ["id", "folder"] },
games:        { path: "/games/",   tabs: ["prepared", "poll_text", "poll_points", "market"], state: ["tab"] },
logoEditor:   { path: "/logo/",    tabs: ["text", "draw", "image"],                       state: ["tab"] },
```

- Karta wraca tylko przez `ret` (karta, z której się wyszło). Bez `ret`
  ↩ prowadzi do `parent` na jego domyślnej karcie — nic nie jest zgadywane
  z typu gry/logo.
- `gameSettings.parent = "control"` — bez `ret` ↩ prowadzi do Control tej
  gry (`/control/?id=…`).
- `state` to jedyne parametry zapisywane w `ret` — reszta adresu (tokeny
  `t`, `s`, `share`, otwarte okna) nie wchodzi do powrotu.

**Eksplorator baz** — baza i folder już są w adresie (`?base=`, `?folder=`,
`base-explorer/js/state.js:131`), ale:
- bases → eksplorator idzie bez `ret` (`bases.js:1551`), a ↩ z eksploratora
  zawsze na `/bases/` (gubi kartę „Udostępnione”);
- rozwinięte gałęzie drzewa (`state.treeOpen`, `actions.js:3304`) żyją
  tylko w pamięci — po powrocie z instrukcji drzewo jest zwinięte.

Propozycja: drzewo (zbiór rozwiniętych folderów) w `localStorage` pod
kluczem `explorer:tree:<id bazy>` — to stan widoku, za długi do adresu;
otwarty folder dalej w `?folder=`, a jego przodkowie zawsze rozwinięci.

### Karty — jeden sposób na wszystkich stronach

Dziś każda strona robi to inaczej:

| Strona | Dziś |
|---|---|
| `/games/` | `?tab=poll_text\|poll_points\|market`, domyślna `prepared` bez parametru, `pushState` |
| `/bases/` | `?tab=shared` + zapas w `sessionStorage` (`basesMobileTab`), `pushState` |
| `/polls-hub/` | `?tab=tasks`, `pushState` |
| `/subscriptions/` | `?tab=subscriptions`, w kodzie karty to `"a"` / `"b"`, `pushState` |
| `/logo-editor/` | `?tab=draw\|image` (domyślna `text`), `pushState` |
| `/manual/` | karta w `#hash` (`#control`), Control dodatkowo `?tab=control` |
| `/base-explorer/` | folder `?folder=`, `pushState` |
| `/settings/` (admin) | `?tab=`, `pushState` |

Jedna reguła (`setTab()` / `tabFromUrl()` we wspólnym module, lista kart
w `PAGES[...].tabs`):
1. Karta zawsze w `?tab=<nazwa>`; nazwy z listy w mapie, nieznana →
   pierwsza; pierwsza (domyślna) bez parametru.
2. Zmiana karty to `replaceState`, nie `pushState` — przeglądarkowe
   „Wstecz” działa jak przycisk ↩: powrót do poprzedniej **strony**, nie
   przewijanie kart (decyzja).
3. Bez zapasu w `sessionStorage` — adres jest jedynym źródłem.
4. Instrukcja: karta też w `?tab=` (`#hash` tylko kotwica w karcie);
   bez obsługi starych `#control`.
5. Te same nazwy w kodzie i w adresie (subscriptions: `tasks`/`subs`
   zamiast `"a"`/`"b"`).

### Okna na telefonie — powrót zawsze do strony podstawowej (decyzja)

Na telefonie dialogi (modal-sheet ≤ 600 px) zajmują cały ekran, ale **nie
są stanem strony**: nie ma ich w adresie ani w `ret`. Wyjście z okna na
inną stronę (np. `?` z podglądu gry) i powrót ↩ → strona podstawowa
z tą samą kartą (`/games/?tab=poll_text`), okno się **nie** otwiera
ponownie. Granica: stan strony (`id`, `q`, `tab`, `folder`) jest
w adresie i wraca; okna nie.

**Control w trakcie gry** (decyzja) — `?` to zwykłe przejście, jak
wszędzie. Wyjście jest bezpieczne: stan gry jest w bazie, urządzenia dalej
wyświetlają, a ↩ wraca do Control i `store.hydrate()` odtwarza pulpit.

**Przejściowo** (do czasu kroków z sekcji 6) obecne `?modal=` działa dalej;
nie dokładamy nowych stron modalnych i nie ujednolicamy starych — idą do
usunięcia razem z parametrem (bez obsługi starych linków).

Strony z własną logiką powrotu (edytor w trybie edycji pytania, modal-sheet,
ostrzeżenie w trakcie gry w Control) dalej przechwytują klik, ale cel
bierą z `backHref()`.

---

## 3. Sześć map: 3 role × 2 urządzenia

Każda mapa to osobny, kompletny obraz tego, co widzi dana osoba: od czego
zaczyna, jakie ma przyciski na każdej stronie i dokąd one prowadzą. Mapy
odpowiadają 1:1 wpisom w `nav-map.js` — kod i test e2e czytają te same dane.

|  | Desktop (> 980 px) | Mobile (≤ 980 px, telefon = krótszy bok < 700 px) |
|---|---|---|
| **Niezalogowany** | Mapa A1 | Mapa A2 |
| **Gość** | Mapa B1 | Mapa B2 |
| **Zalogowany** | Mapa C1 | Mapa C2 |

Oznaczenia w mapach: `→` przejście, `↩` przycisk „Wstecz” (sekcja 1 topbaru),
`?` instrukcja (zawsze wraca tam, skąd weszła), `☰` hamburger,
**⚠ dziś** — jak działa teraz, jeśli inaczej niż w mapie.

Wspólne dla wszystkich map (nie powtarzam w każdej):
- `?` → `/manual/?ret=<bieżąca>#<sekcja>` → `↩` wraca na bieżącą;
  w instrukcji „Prywatność” → `/privacy/` → `↩` do instrukcji.
- **Bez stron modalnych** (sekcja 2): `?`, „Prywatność” i ustawienia gry
  to zawsze przejście z `ret`. Edytor logo to osobna strona
  `/logo/editor-<typ>/`. Nigdzie nie ma ✕ w topbarze — tylko ↩.
- Strony urządzeń (`/display/`, `/host/`, `/buzzer/`, `/poll-*`,
  `/connect-device/tv/`) otwierane z klucza w adresie — bez topbaru,
  bez ról, poza mapami.
- `/reset/` i `/confirm/` — z linku w mailu, po sukcesie → `/login/` /
  `/games/`.

---

### Mapa A1 — Niezalogowany, desktop

Start: `/` (landing). Wszystko poza stronami publicznymi → `/login/`.
Logowanie tylko na `/login/` (landing ma tylko przycisk „Zaczynamy”).

```mermaid
flowchart LR
  home["/ landing"]
  home -->|Zaczynamy| login["/login/"]
  home -->|Społeczność| market["/marketplace/<br/>tylko przeglądanie"]
  home -->|Podłącz urządzenie| cd["/connect-device/"]
  home -->|Prywatność| privacy["/privacy/"]
  login -->|Zaloguj| afterLogin(("/games/<br/>= mapa C1"))
  login -->|Graj jako gość| guest(("/games/<br/>= mapa B1"))
  login -->|Nie pamiętam hasła| reset["/reset/"]
  market -->|↩| home
  cd -->|↩| home
  privacy -->|↩| home
  locked["/games/ /editor/ /manual/ ...<br/>(link z zewnątrz)"] -->|brak sesji| login
```

| Strona | Przyciski | Cel |
|---|---|---|
| `/` | Zaczynamy · Społeczność · Podłącz urządzenie · Prywatność | login · marketplace · connect-device · privacy |
| `/login/` | Zaloguj / Zarejestruj · Graj jako gość · Nie pamiętam hasła | `/games/` (wyjątek: zaproszenie z maila) · `/games/` · reset |
| `/marketplace/` | ↩ „Strona główna” · podgląd gier · topbar: „Zaloguj / Załóż konto” | `/` · — · `/login/` |
| `/privacy/` | ↩ „Strona główna” | `/` |
| `/connect-device/` | ↩ · skan QR / kod | `/` · strona urządzenia |
| każda inna (w tym `/manual/`) | — | `/login/` |

**⚠ dziś:** `/control/` bez sesji → `/control/login` (404); `/account/`
bez sesji → ekran ustawiania nazwy; w marketplace przycisk w sekcji 1 to
„Moje gry”.

### Mapa A2 — Niezalogowany, mobile

Te same strony i cele co A1. Różnice:

| Gdzie | Desktop | Mobile |
|---|---|---|
| topbar marketplace / connect-device / privacy | ↩ · `?` · „Zaloguj / Załóż konto” w pasku | ↩ w pasku, reszta w `☰` |
| modale (podgląd gry w marketplace) | okno | pełny ekran (≤ 600 px), ↩ zamyka modal zamiast wychodzić ze strony |
| connect-device | kod ręcznie, kamera rzadko | skan QR kamerą jako główna akcja |

---

### Mapa B1 — Gość, desktop

Start: `/games/` (po „Graj jako gość”). Konto gościa to prawie pełne konto:
ma swoje gry, bazy, logo, ankiety i grę, bez funkcji społecznościowych
i współdzielenia. Gość wchodzący na `/` lub `/login/` → od razu `/games/`
(tak samo jak zalogowany; na `/login/` zostaje tylko z `force_auth=1`, czyli
gdy sam kliknął „Załóż konto”).

```mermaid
flowchart LR
  games["/games/"]
  games -->|Społeczność| market["/marketplace/<br/>bez oceniania i wysyłania"]
  games -->|Logo| logo["/logo/"]
  games -->|Bazy| bases["/bases/<br/>bez udostępniania"]
  bases -->|otwórz bazę| explorer["/base-explorer/"]
  games -->|Edytuj| editor["/editor/"]
  games -->|Ankieta| polls["/polls/"]
  games -->|Graj| control["/control/"]
  games -->|Ustawienia gry| gs["/game-settings/"]
  games -->|Nazwa ▾ → Ustawienia konta| account["/account/<br/>usuń / zamień na konto"]
  games -->|Nazwa ▾ → Załóż konto| login["/login/ (migracja)"]
  market & logo & bases & editor & polls & control & gs & account -->|↩| games
  explorer -->|↩| bases
  hub["/polls-hub/ /subscriptions/<br/>(link z zewnątrz)"] -->|okno „tylko dla konta”| games
```

| Strona | Widoczne przyciski | Ukryte dla gościa |
|---|---|---|
| `/games/` | Społeczność · Logo · Bazy · `?` · Nazwa ▾ (Ustawienia konta, Załóż konto) | Ankiety · Subskrypcje · Podłącz urządzenie |
| `/bases/` | ↩ Gry · moje bazy | zakładka „Udostępnione” · Udostępnij · Subskrypcje |
| `/marketplace/` | ↩ Gry · przeglądanie · podgląd | Oceń · Moje wysłane |
| `/account/` | ↩ Gry · Zamień na konto · Usuń | nazwa, e-mail, hasło, powiadomienia, ocena, demo |
| `/connect-device/` | ↩ Gry | moje urządzenia |
| `/control/` `/game-settings/` `/logo/` `/logo/editor-<typ>/` | jak w C1 | — |
| `/polls-hub/` `/subscriptions/` | okno „Tylko dla konta”: Wstecz → `/games/`, Załóż konto → `/login/?force_auth=1` | — |

**⚠ dziś:** „Ustawienia konta” w menu tylko na `/games/`; connect-device ↩
prowadzi gościa na `/` (landing) zamiast na `/games/`; okno „tylko dla konta”
wygląda inaczej niż okno blokady urządzenia; gość na `/` zostaje na landingu
(`home/js/index.js:10`).

### Mapa B2 — Gość, mobile

Te same strony co B1. Różnice:

| Gdzie | Desktop | Mobile |
|---|---|---|
| topbar `/games/` | przyciski w pasku, nadmiar w „Więcej ▾” | wszystko w `☰` (licznik na `☰`) |
| „Graj”, „Ustawienia gry” | → control / game-settings | **telefon:** ukryte (decyzja); **tablet w pionie:** widoczne, po wejściu okno „Obróć tablet” |
| `/logo/` | lista + edycja | telefon: tylko lista (podgląd, import/eksport, nazwa) |
| `/editor/` | lista pytań + edycja obok | edycja pytania na pełnym ekranie, ↩ najpierw zamyka pytanie |
| modale | okno | pełny ekran, ↩ zamyka modal |
| `/logo/` | Nowe logo · Edytuj | telefon: ukryte (tylko lista: podgląd, import/eksport, nazwa) |
| `/games/` | — | „Zainstaluj” (PWA), jeśli nie jest zainstalowana |

**⚠ dziś:** na telefonie „Graj” i „Ustawienia gry” prowadzą na stronę,
która od razu pokazuje blokadę — w mapie są na telefonie ukryte. Blokada
urządzenia na `/control/` i `/game-settings/` zostaje jako zabezpieczenie
(link wklejony ręcznie, zakładka).

---

### Mapa C1 — Zalogowany, desktop

Start: `/games/`; wejście na `/` lub `/login/` z sesją → `/games/`.

```mermaid
flowchart LR
  games["/games/"]
  games -->|Społeczność| market["/marketplace/"]
  games -->|Logo| logo["/logo/"]
  logo -->|Nowe / Edytuj| logoEdit["/logo/editor-<typ>/?id="]
  control -->|Ustawienia gry| gs
  logoEdit -->|↩ ret| logo
  gs -->|↩ ret| control
  games -->|Podłącz urządzenie| cd["/connect-device/"]
  games -->|Ankiety| hub["/polls-hub/"]
  games -->|Subskrypcje| subs["/subscriptions/"]
  games -->|Bazy| bases["/bases/"]
  games -->|Edytuj| editor["/editor/"]
  games -->|Ankieta| polls["/polls/"]
  games -->|Graj| control["/control/"]
  games -->|Ustawienia gry| gs["/game-settings/"]
  games -->|Nazwa ▾ → Ustawienia konta| account["/account/"]
  games -->|Nazwa ▾ → Wyloguj| login["/login/"]
  hub -->|otwórz ankietę| polls
  hub <-->|Subskrypcje / Ankiety| subs
  bases -->|Subskrypcje| subs
  bases -->|otwórz bazę| explorer["/base-explorer/"]
  polls -->|↩ ret| hub
  explorer -->|↩ ret| bases
  subs -->|↩ ret| from(("skąd przyszedł:<br/>games / hub / bases"))
  editor & control -->|↩ ret / games| games
  market & logo & cd & hub & bases & account -->|↩| games
```

| Strona | ↩ prowadzi do | Pozostałe przyciski → cel |
|---|---|---|
| `/games/` | — (strona główna) | Społeczność, Logo, Podłącz urządzenie, Ankiety, Subskrypcje, Bazy, `?`, Nazwa ▾; na kafelku: Podgląd, Edytuj, Graj, Ustawienia, Ankieta |
| `/polls-hub/` | `ret` / Gry | Subskrypcje → `/subscriptions/?ret=…`; ankieta → `/polls/?id=…&ret=…`; zadanie → `/poll-*/?t=…` |
| `/subscriptions/` | `ret` / Gry | Ankiety → `/polls-hub/?ret=…` |
| `/polls/` | `ret` / Gry | — |
| `/bases/` | `ret` / Gry | Subskrypcje → `/subscriptions/?ret=…`; baza → `/base-explorer/?id=…&ret=<bases?tab=…>` |
| `/base-explorer/?id=B&folder=F` | `ret` / Bazy (z kartą) | drzewo folderów pamiętane per baza |
| `/editor/?id=G&q=Q` | `ret` / `/games/` | — |
| `/marketplace/`, `/connect-device/`, `/account/` | `ret` / Gry | — |
| `/control/?id=G` | `ret` / `/games/` (z ostrzeżeniem w trakcie gry) | Ustawienia gry → `/game-settings/?id=…&ret=<control>` · `?` → `/manual/?ret=<control>` |
| `/game-settings/?id=G` | `ret` / Control tej gry | Graj → `/control/?id=…` (ukryte, gdy `ret` to Control — ↩ robi to samo) · `?` |
| `/logo/?tab=T` | Gry | Nowe logo → utworzenie + `/logo/editor-<typ>/?id=…`; Edytuj → `/logo/editor-<typ>/?id=L` · `?` |
| `/logo/editor-<typ>/?id=L` | `ret` / `/logo/` (autozapis przed wyjściem, bez pytań) | `?` → `/manual/?ret=<edytor>#logo` |

**⚠ dziś:** z `/games/` wychodzi `?from=games`, którego nikt nie czyta;
bases → base-explorer bez `ret` (powrót gubi zakładkę); editor, logo-editor,
control, game-settings zawsze wracają na `/games/`, część bez języka.

### Mapa C2 — Zalogowany, mobile

Te same strony co C1. Różnice:

| Gdzie | Desktop | Mobile |
|---|---|---|
| topbar `/games/` | 6 przycisków w pasku + „Więcej ▾” | wszystko w `☰`, liczniki zsumowane na `☰` |
| topbar pozostałych stron | ↩ · sekcja 2 · `?` · Nazwa ▾ | ↩ w pasku; sekcja 2, `?`, konto płasko w `☰` |
| „Graj”, „Ustawienia gry” | → control / game-settings | **telefon:** ukryte; **tablet w pionie:** „Obróć tablet”; **wąskie okno komputera:** „Poszerz okno” |
| `/connect-device/` | kod ręcznie, kamera rzadko | skan QR kamerą jako główna akcja |
| `/logo/`, `/editor/`, modale | jak w B2 | jak w B2 |
| `/control/` (tablet) | — | operator na tablecie w poziomie |

---

### Jak z tego zrobić jedno źródło prawdy

Sześć map to sześć „widoków” tej samej tabeli `PAGES` z `nav-map.js`,
rozszerzonej o przyciski:

```js
games: {
  path: "/games/", access: "guest", parent: null,
  buttons: {
    marketplace:   { to: "marketplace" },
    logoEditor:    { to: "logoEditor" },
    connectDevice: { to: "connectDevice", roles: ["user"] },
    pollsHub:      { to: "pollsHub",      roles: ["user"] },
    subscriptions: { to: "subscriptions", roles: ["user"] },
    bases:         { to: "bases" },
    play:          { to: "control",       device: "wide" },  // telefon: ukryty
    settings:      { to: "gameSettings",  device: "wide" },  // telefon: ukryty
  },
},
```

- `initPage()` chowa/blokuje przyciski wg `roles` i `device`, podpina cele
  przez `linkTo()` (z `ret` i językiem).
- Skrypt `scripts/nav-maps.mjs` generuje z `PAGES` sześć diagramów
  (mermaid) do tego dokumentu — mapy nie rozjadą się z kodem.
- Test `frontend-navigation.spec.js` przechodzi każdą z 6 map: dla roli
  i viewportu (1280×800 / 390×844) klika każdy przycisk i sprawdza cel
  oraz ↩.


---

## 4. Topbar — jeden układ na każdej stronie

| Sekcja | Zawartość | Mobile (≤ 980 px) |
|---|---|---|
| 1 | `← Wróć do: {parent}` (z mapy) | zostaje w pasku |
| 2 | nawigacja/tytuł strony (np. przyciski hubów w games, tytuł gry) | do hamburgera |
| 3 | narzędzia strony + **„?” Instrukcja zawsze ostatnia** | hamburger tu |
| 4 | konto: `nazwa ▾` → Ustawienia konta, Wyloguj · gość: `Gość ▾` → Załóż konto, Ustawienia konta · niezalogowany: „Zaloguj / Załóż konto” | do hamburgera |

Do ujednolicenia przy okazji: jeden klucz `common.logout`, menu konta z
„Ustawieniami konta” wszędzie (nie tylko games), sekcja 4 także na account,
„?” także na privacy, w marketplace „Moje gry” → zwykłe „← Wróć do”.

---

## 5. Mobile / desktop — jedno źródło prawdy

W `device-guard.js` (lub nowym `viewport.js`) trzy nazwane progi, używane
przez wszystkie moduły zamiast liczb w kodzie:

```js
export const VIEW = {
  compactTopbar: "(max-width: 980px)", // hamburger
  sheet:         "(max-width: 600px)", // modale jako pełny ekran
};
export const isPhoneScreen = () => shortSide < 700; // blokada Control
```

Progi zostają takie jak dziś — chodzi o to, żeby były nazwane i w jednym
pliku, a CSS korzystał z tych samych wartości (komentarz przy `@media`).

---

## 6. Wdrożenie (kroki, każdy osobno do testu)

1. **Poprawki błędów od razu** (małe, niezależne od mapy):
   `requireAuth()` w control → `"/login/"`; domyślny argument w `auth.js`
   na ścieżkę bezwzględną; account → `requireAuth("/login/")`;
   `withLangParam` w twardych `/games/`.
2. `nav-map.js` + `backHref/linkTo/loginUrl` + klucze `nav.*`; podmiana
   `?from=games` na `linkTo()`; usunięcie trzech tabel etykiet.
3. Gość na `/` → `/games/`; `login` bez zmian w celu (zawsze `/games/`,
   wyjątek zaproszeń z maila zostaje); `ret` łańcuchem z listą `from`.
4. `initPage()` strona po stronie (kolejność jak audyty), wspólny wygląd
   overlayu gość/urządzenie.
5. Rezygnacja ze stron modalnych (każdy punkt osobno):
   a) **zrobione** — refaktor edytora logo: wspólny moduł
      `web/logo/js/editor-page.js` (autozapis, stan, blokady) + 3 strony `/logo/editor-<typ>/?id=`,
      lista tylko listą, usunięcie ✕, `topbar-no-menu` i okien pomocy,
   b) `/editor/?id=&q=` — pytanie w adresie,
   c) autozapis w game-settings, Control → zwykłe przejście do ustawień,
      usunięcie `gs:*`,
   d) usunięcie `?modal=` z manual i privacy.
6. `state` w mapie i w `ret`; jeden moduł kart (`?tab=`, `replaceState`,
   bez `sessionStorage`); eksplorator: `ret` z bases, drzewo w
   `localStorage` per baza.
7. Przyciski w `PAGES` (role/urządzenie), generator diagramów 6 map,
   test e2e przechodzący 6 map (patrz koniec sekcji 3).

## 8. Struktura adresów — jeden folder na zasób (propozycja)

Zasada: **pierwszy segment adresu = obszar aplikacji** (gry, logo, bazy,
ankiety, rozgrywka), a strony szczegółu i edytory leżą w jego folderze.
Wtedy adres sam mówi, gdzie jesteś, „Wstecz” do `parent` to zwykle folder
wyżej, a mapa (`PAGES`) i statystyki aktywności grupują się same.

Nazwy podfolderów znaczą to samo w każdym obszarze: **`editor/`** — tu
właściciel zmienia zasób (`games/editor`, `polls/editor`, `logo/editor`,
`bases/explorer` jako wyjątek nazwy, bo to przeglądarka folderów);
**`vote/`** — strony uczestnika z zewnątrz; urządzenia rozgrywki pod
`control/`.

### Docelowe drzewo

| Dziś | Po zmianie | Uwagi |
|---|---|---|
| `/games/` | `/games/` | lista gier |
| `/editor/?id=` | `/games/editor/?id=&q=` | edytor pytań (z pytaniem w adresie) |
| `/game-settings/?id=` | `/games/settings/?id=` | ustawienia to edycja gry, jak edytor; Control tylko do nich linkuje (decyzja) |
| `/control/?id=` | `/control/?id=` | pulpit operatora |
| `/display/?id=&key=` | `/control/display/?id=&key=` | urządzenia rozgrywki w folderze Control |
| `/host/?id=&key=` | `/control/host/?id=&key=` | |
| `/buzzer/?id=&key=` | `/control/buzzer/?id=&key=` | |
| `/connect-device/` (+ `/tv/`) | `/connect/` (+ `/connect/tv/`) | adres wpisywany ręcznie na telewizorze — krótki (decyzja) |
| `/polls-hub/` | `/polls/` | hub ankiet (karty: ankiety / zadania) |
| `/polls/?id=` | `/polls/editor/?id=` | ankieta jednej gry — od strony właściciela to edytor (otwieranie, zamykanie, wyniki) |
| `/poll-text/` | `/polls/vote/text/` | głosowanie (tekst) — strona głosującego, nie edytora |
| `/poll-points/` | `/polls/vote/points/` | głosowanie (punkty) |
| `/poll-qr/?id=&key=` | `/polls/vote/qr/?id=&key=` | kod QR do głosowania na wyświetlaczu; małe litery w adresach |
| `/subscriptions/` | `/subscriptions/` | **bez zmian** — osobny blok: subskrypcje są używane w różnych miejscach (bazy, ankiety, urządzenia), nie tylko w ankietach (decyzja) |
| `/poll-go/?t=|s=` | `/go/` | **wspólne wejście z zewnątrz** (niżej) |
| `/bases/` | `/bases/` | |
| `/base-explorer/?base=` | `/bases/explorer/?id=&folder=` | |
| `/logo/`, `/logo/editor-<typ>/` | `/logo/`, `/logo/editor/<typ>/` | jak `games/editor/` i `polls/vote/text/` — podfoldery zamiast myślnika (decyzja) |
| `/login/`, `/reset/`, `/confirm/` | `/login/`, `/login/reset/`, `/login/confirm/` | reset i potwierdzenie to kroki logowania; linki z maili żyją godzinę |
| `/account/`, `/marketplace/`, `/manual/`, `/privacy/` | bez zmian | `/privacy/` celowo stały (adres polityki bywa podawany na zewnątrz) |
| `/settings/` (admin), `/maintenance/`, `/404` | bez zmian | |

Na najwyższym poziomie zostaje: `/`, `/login/`, `/games/`, `/control/`,
`/polls/`, `/subscriptions/`, `/bases/`, `/logo/`, `/marketplace/`, `/connect/`, `/go/`,
`/account/`, `/manual/`, `/privacy/` (+ admin i techniczne).

**Korekta 2026-10-09 (E5):** hub ankiet zniknął (E11), więc strona ankiety
gry zostaje pod `/polls/?id=` (bez `/polls/editor/`); głosowanie idzie do
`/polls/vote/…`. Krok 4 (urządzenia `/control/display|host|buzzer/`,
`/connect/`) czeka, aż druga sesja skończy prace nad Hostem/Buzzerem —
przenosiny folderów w trakcie jej zmian dałyby konflikty.

### `/go/` — jedyne adresy, które wychodzą poza aplikację

Dziś na zewnątrz trafiają różne adresy: linki w mailach (`poll-go?t=`,
`poll-go?s=` z RPC w bazie), kody QR urządzeń i ankiety (`/display`,
`/host`, `/buzzer`, `/poll-qr` z `id`+`key`), zakładki na telewizorach.
Każda zmiana struktury je psuje. Propozycja: **wszystko, co opuszcza
aplikację (mail, QR, link do urządzenia), idzie przez `/go/`**, a `/go/`
zamienia je na bieżący adres wewnętrzny:

| Link zewnętrzny | Prowadzi do |
|---|---|
| `/go/?t=<token>` | zadanie ankiety → `/polls/vote/text|points/` (jak dziś poll-go) |
| `/go/?s=<token>` | zaproszenie do subskrypcji → `/subscriptions/` |
| `/go/?d=display&id=&key=` | `/control/display/?id=&key=` (tak samo host, buzzer, poll-qr) |

Wtedy przy kolejnym porządkowaniu zmienia się tylko tabela w `/go/`,
a linki w skrzynkach, kody QR i zakładki dalej działają. To nie jest
„fallback starego adresu”, tylko jeden stały punkt wejścia z zewnątrz.

**Stare linki (decyzja): bez fallbacków.** Zaproszenia nie mają czasu
ważności (`poll_tasks` / `poll_subscriptions` mają tylko status, żyją do
wykonania lub anulowania), więc linki `/poll-go/` w już wysłanych mailach
i zakładki `/display/` na telewizorach po zmianie przestają działać —
świadomie.

### Co trzeba przestawić przy przenosinach (lista kontrolna na stronę)

- ścieżki względne `../../shared/...` w HTML/JS/CSS (głębokość folderu),
- linki w kodzie stron, mapa `PAGES`, etykiety ↩ w instrukcji,
- Worker: `PAGE_ROUTES` (`origin.js`) i wyjątki telewizora (`tv.js`:
  `/display`, `/poll-qr`, `/connect-device`),
- baza: linki w mailach (RPC z `poll-go?t=` / `?s=`, migracja 292) →
  `go?t=` / `go?s=`; lista stron aktywności (`site_activity_ping`) —
  aktywność liczona po pierwszym segmencie, więc edytor i ustawienia gry
  wpadną do „games” (jeśli statystyki mają je rozróżniać, `activity.js`
  musi brać dwa segmenty),
- manifest PWA (`shortcuts`, `file_handlers`), `sitemap.xml`,
  `branch-code.js` i specy e2e, testy jednostkowe,
- `connect-device` zapamiętuje urządzenia (`shared_devices`) — sprawdzić,
  czy trzyma adresy, czy tylko typ i klucz.

### Kolejność (każdy obszar osobno: branch → testy → `main`)

1. `/go/` (nowy, obok `poll-go`) + linki w mailach i kodach QR na `/go/`.
2. Ankiety: `/polls/` (hub), `/polls/editor/`, `/polls/vote/…`.
3. Gry: `/games/editor/`, `/games/settings/`.
4. Rozgrywka: `/control/display|host|buzzer/`, `/connect/`.
5. Bazy: `/bases/explorer/`. Logo: ewentualnie `/logo/editor/<typ>/`.
6. Logowanie: `/login/reset/`, `/login/confirm/`.

## 9. Mapa blokad

Opis blokad ma jedno miejsce: [`docs/blokady-zasobow.md`](blokady-zasobow.md)
(stan faktyczny, rozbieżności, mapa docelowa, kroki). Tutaj tylko
powiązanie z mapą stron: każdy wpis `PAGES` (sekcja 2) dostaje pole
`locks` — co strona / jej okna trzymają (`game:G`, `logos`, `logo:L`,
`base:B` współdzielone…); to, kto zostaje zatrzymany i jakim
komunikatem, wynika z zasobów (tabela „Kto rozpoznaje” w tamtym pliku).

## 7. Decyzje

Podjęte (2026-10-07):
- **Gość na `/`** → od razu `/games/` — konto gościa to prawie pełne konto.
- **`/manual/`** — tylko z kontem/gościem. Publiczna jest tylko polityka
  prywatności (oraz landing, login, Społeczność, podłączanie urządzenia).
- **Po zalogowaniu** zawsze `/games/`. Logowanie tylko na `/login/`.
  Wyjątek, który już działa: zaproszenie z maila do ankiety/subskrypcji.
- **„Wstecz”** wraca przez wszystkie kroki, ale tylko po dozwolonej ścieżce
  (lista `from` w mapie); podwójnych powrotów będzie mało.
- **Telefon**: „Graj” i „Ustawienia gry” są ukryte (przycisk z
  `device: "wide"` znika, gdy `isPhoneScreen()`; tablet je widzi). Blokada
  urządzenia na samych stronach zostaje jako zabezpieczenie.
- **Bez stron modalnych** (kierunek): `?`, prywatność i ustawienia gry to
  zwykłe przejścia; edytor logo osobną stroną z autozapisem; bez ✕
  w topbarze. Większa zmiana — robiona etapami (sekcja 6, krok 5).
- **Edytor logo**: refaktor na 3 osobne strony (tekst / rysunek / obraz)
  otwierane jak edytor pytań, `id` logo w adresie, autozapis bez pytań,
  można wrócić do pracy po zamknięciu.
- **Adresy logo**: `/logo/` (lista) i `/logo/editor-text|draw|image/?id=`;
  `/logo-editor/` znika.
- **Bez fallbacków** (sekcja 2): żadnych aliasów starych adresów i
  parametrów, przekierowań ze starych ścieżek, zapasów w `sessionStorage`,
  zgadywania karty ani `history.back()`/`referrer`.
- **Powroty**: strony szczegółu pamiętają zasób (`?id=`) i swój stan
  (pytanie, baza + foldery); listy pamiętają tylko kartę — bez zaznaczeń.
  Karty ujednolicone (`?tab=`) na wszystkich stronach.
- **Edytor pytań**: `?q=<pytanie>` w adresie, powrót do edytowanego pytania.
- **Okna na telefonie**: powrót zawsze do strony podstawowej, nie do okna.
- **Control**: `?` otwiera instrukcję zwykłym przejściem, także w trakcie
  gry (bez nowej karty).

- **Przeglądarkowe „Wstecz”** działa jak przycisk ↩ (karty przez
  `replaceState`, bez wpisów historii dla stanu wewnątrz strony).
- **Kolejność wdrażania**: zaczynamy od edytora logo (sekcja 6, krok 5a).
- **Adresy (sekcja 8)**: `/games/settings/`, `/logo/editor/<typ>/`,
  `/connect/`, `/go/` jako jedyne wejście z zewnątrz; stare linki
  (maile, zakładki TV) bez fallbacków.
- **Blokady** (`docs/blokady-zasobow.md`, sekcja 6): zasobem edytora logo
  jest tylko logo; Control i ustawienia gry trzymają swoją grę i całą pulę
  logo (współdzielenie) — zajęta gra albo edytowane dowolne logo
  zatrzymuje wejście, każde swoim komunikatem; eksplorator bazy trzyma
  bazę współdzielenie (zmiana nazwy / udostępnianie / usunięcie całej
  bazy zablokowane), elementy jak dziś; opis według „kto trzyma — kto
  rozpoznaje”, nie według czasu trzymania.

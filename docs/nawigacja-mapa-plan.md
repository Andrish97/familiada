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
  logoEditor:    { path: "/logo-editor/",   access: "guest",  parent: "games",     manual: "logo" },
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
`ret` → „Wstecz” do `parent`. Podwójnych powrotów będzie mało, ale gdyby
łańcuch urósł, limit 4 poziomów (głębsze `ret` są obcinane do `parent`).

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
  games -->|Logo| logo["/logo-editor/"]
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
| „Graj”, „Ustawienia gry” | → control / game-settings | **telefon:** przycisk nieaktywny z podpowiedzią „Na komputerze lub tablecie”; **tablet w pionie:** wchodzi, okno „Obróć tablet” |
| `/logo-editor/` | lista + edycja | telefon: tylko lista (podgląd, import/eksport, nazwa) |
| `/editor/` | lista pytań + edycja obok | edycja pytania na pełnym ekranie, ↩ najpierw zamyka pytanie |
| modale | okno | pełny ekran, ↩ zamyka modal |
| `/games/` | — | „Zainstaluj” (PWA), jeśli nie jest zainstalowana |

**⚠ dziś:** na telefonie „Graj” i „Ustawienia gry” prowadzą na stronę,
która od razu pokazuje blokadę — mapa proponuje zablokować już przycisk.

---

### Mapa C1 — Zalogowany, desktop

Start: `/games/`; wejście na `/` lub `/login/` z sesją → `/games/`.

```mermaid
flowchart LR
  games["/games/"]
  games -->|Społeczność| market["/marketplace/"]
  games -->|Logo| logo["/logo-editor/"]
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
  market & logo & cd & hub & bases & editor & control & gs & account -->|↩| games
```

| Strona | ↩ prowadzi do | Pozostałe przyciski → cel |
|---|---|---|
| `/games/` | — (strona główna) | Społeczność, Logo, Podłącz urządzenie, Ankiety, Subskrypcje, Bazy, `?`, Nazwa ▾; na kafelku: Podgląd, Edytuj, Graj, Ustawienia, Ankieta |
| `/polls-hub/` | `ret` / Gry | Subskrypcje → `/subscriptions/?ret=…`; ankieta → `/polls/?id=…&ret=…`; zadanie → `/poll-*/?t=…` |
| `/subscriptions/` | `ret` / Gry | Ankiety → `/polls-hub/?ret=…` |
| `/polls/` | `ret` / Gry | — |
| `/bases/` | `ret` / Gry | Subskrypcje → `/subscriptions/?ret=…`; baza → `/base-explorer/?base=…&ret=…` |
| `/base-explorer/` | `ret` / Bazy | — |
| `/editor/`, `/logo-editor/`, `/marketplace/`, `/connect-device/`, `/account/` | `ret` / Gry | — |
| `/control/` | Gry (z ostrzeżeniem w trakcie gry) | Ustawienia gry (modal) |
| `/game-settings/` | `ret` / Gry | Graj → `/control/?id=…` |

**⚠ dziś:** z `/games/` wychodzi `?from=games`, którego nikt nie czyta;
bases → base-explorer bez `ret` (powrót gubi zakładkę); editor, logo-editor,
control, game-settings zawsze wracają na `/games/`, część bez języka.

### Mapa C2 — Zalogowany, mobile

Te same strony co C1. Różnice:

| Gdzie | Desktop | Mobile |
|---|---|---|
| topbar `/games/` | 6 przycisków w pasku + „Więcej ▾” | wszystko w `☰`, liczniki zsumowane na `☰` |
| topbar pozostałych stron | ↩ · sekcja 2 · `?` · Nazwa ▾ | ↩ w pasku; sekcja 2, `?`, konto płasko w `☰` |
| „Graj”, „Ustawienia gry” | → control / game-settings | **telefon:** nieaktywne z podpowiedzią; **tablet w pionie:** „Obróć tablet”; **wąskie okno komputera:** „Poszerz okno” |
| `/connect-device/` | kod ręcznie, kamera rzadko | skan QR kamerą jako główna akcja |
| `/logo-editor/`, `/editor/`, modale | jak w B2 | jak w B2 |
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
    play:          { to: "control",       device: "wide" },  // telefon: nieaktywny
    settings:      { to: "gameSettings",  device: "wide" },
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
5. Przyciski w `PAGES` (role/urządzenie), generator diagramów 6 map,
   test e2e przechodzący 6 map (patrz koniec sekcji 3).

## 7. Decyzje

Podjęte (2026-10-07):
- **Gość na `/`** → od razu `/games/` — konto gościa to prawie pełne konto.
- **`/manual/`** — tylko z kontem/gościem. Publiczna jest tylko polityka
  prywatności (oraz landing, login, Społeczność, podłączanie urządzenia).
- **Po zalogowaniu** zawsze `/games/`. Logowanie tylko na `/login/`.
  Wyjątek, który już działa: zaproszenie z maila do ankiety/subskrypcji.
- **„Wstecz”** wraca przez wszystkie kroki, ale tylko po dozwolonej ścieżce
  (lista `from` w mapie); podwójnych powrotów będzie mało.

Otwarte:
- Telefon: „Graj”/„Ustawienia gry” nieaktywne z podpowiedzią czy całkiem ukryte?

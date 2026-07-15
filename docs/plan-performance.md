# Plan wdrożenia — wydajność i wizualne lagi

Status: 🔲 = do zrobienia | ✅ = zrobione | 🚧 = w trakcie

---

## Idea ogólna

**Problem:** JS po załadowaniu przebudowuje layout strony — pokazuje/chowa przyciski
zależnie od trybu (guest/zalogowany/niezalogowany), renderuje dynamiczną zawartość
(listy gier, sidebar, topbar), ustawia klasy. Efekt: widać przez chwilę "surowy" HTML,
potem JS go przebudowuje — wygląda to brzydko.

**Rozwiązanie:**
1. W `<head>` każdej strony — inline script chowający całą stronę:
   ```html
   <script>document.documentElement.style.visibility='hidden'</script>
   ```
2. W JS każdej strony — odkrycie PO ZAKOŃCZENIU PEŁNEGO SETUP (auth + render danych):
   ```javascript
   document.documentElement.style.visibility = '';
   ```
   **Ważne:** odkrycie NIE po `initI18n`, tylko po OSTATNIEJ operacji inicjalizacyjnej
   (po wyrenderowaniu danych, ustawieniu topbara, obsłużeniu trybów guest/auth).

---

## ETAP 1 — visibility:hidden na każdej stronie

Dla każdej strony: dwie zmiany — HTML (inline script) + JS (odkrycie po pełnym setup).

---

### 1.1 — builder.html + js/pages/builder.js
**Struktura JS:** `DOMContentLoaded` handler

- ✅ `builder.html` — dodać przed `</head>`:
  ```html
  <script>document.documentElement.style.visibility='hidden'</script>
  ```
- ✅ `js/pages/builder.js` — po linii **1766** (`startAutoRefresh()`), na końcu handlera DOMContentLoaded:
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* linia 1766 to ostatnia operacja po `initI18n` (1045) → `requireAuth` (1057) → `setTopbarAccount` (1068) → `refresh()` (1743, renduje grid gier). Po tym strona jest w pełni gotowa.

---

### 1.2 — bases.html + js/pages/bases.js
**Struktura JS:** IIFE `(async function init() {` od linii 1606

- ✅ `bases.html` — inline script w `<head>`
- ✅ `js/pages/bases.js` — po linii **1704** (`setButtonsState(...)`), tuż przed zamknięciem IIFE (linia 1705 `})();`):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `requireAuth` (1607) → `initTopbarAccountDropdown` (1615) → `refreshBases()` (1642) → `render()` (1643) → `setButtonsState` (1704). Strona wyrenderowana.

---

### 1.3 — polls.html + js/pages/polls.js
**Struktura JS:** `DOMContentLoaded` handler

- 🔲 `polls.html` — inline script w `<head>`
- 🔲 `js/pages/polls.js` — po linii **1421** (`await refresh()`), na końcu handlera:
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `requireAuth` (1151) → `initTopbarAccountDropdown` (1152) → `refresh()` (1421, ładuje dane i renduje). Strona gotowa.

---

### 1.4 — editor.html + js/pages/editor.js
**Struktura JS:** `boot()` async function, wywoływana z `DOMContentLoaded` (linia 1218)

- 🔲 `editor.html` — inline script w `<head>`
- 🔲 `js/pages/editor.js` — po linii **1203** (`renderEditor()`), przed końcem funkcji `boot()` (linia 1216):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `requireAuth` (495) → załadowanie pytań (1197-1200) → `renderQuestions()` + `renderEditor()` (1202-1203). Edytor wyrenderowany.

---

### 1.5 — game-settings.html + js/pages/game-settings.js
**Struktura JS:** `main()` async function, wywoływana na dole pliku (linia 1739)

- 🔲 `game-settings.html` — inline script w `<head>` (oprócz już istniejącego mobile guard)
- 🔲 `js/pages/game-settings.js` — po linii **1731** (`setActiveCat("teams")`), tuż przed końcem funkcji `main()` (linia 1737):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `requireAuth` (1521) → `setTopbarAccount` (1522) → `mergeSettings` (1596) → `initColorModal` (1678) → `setActiveCat("teams")` (1731, pierwszy render `#gsContentInner`). Sidebar + treść wyrenderowane.

---

### 1.6 — connect-device.html + js/pages/connect-device.js
**Struktura JS:** IIFE `(async () => {` od linii 340

- 🔲 `connect-device.html` — inline script w `<head>`
- 🔲 `js/pages/connect-device.js` — po linii **371** (`await renderSharedDevices()`), tuż przed `})();` (linia 373):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `initI18n` (341) → `getUser` (343) → `initTopbarAccountDropdown` (349) → aktualizacja tekstów (360-362) → `renderSharedDevices()` (371, warunkowy render listy urządzeń). Strona gotowa.

---

### 1.7 — marketplace.html + js/pages/marketplace.js
**Struktura JS:** `DOMContentLoaded` handler

- 🔲 `marketplace.html` — inline script w `<head>`
- 🔲 `js/pages/marketplace.js` — po linii **735** (`await loadBrowse({ reset: true })`), przed linią 739 (obsługa modali URL):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `initI18n` (702) → `getUser` (704) → `initTopbarAccountDropdown` (708) → `showView("browse")` (734) → `loadBrowse()` (735, ładuje i renduje gry). Marketplace wyrenderowany.

---

### 1.8 — settings.html + js/pages/settings.js
**Struktura JS:** różna — wymaga osobnej inspekcji

- 🔲 `settings.html` — inline script w `<head>`
- 🔲 `js/pages/settings.js` — znaleźć główny entry point (DOMContentLoaded lub IIFE), dodać odkrycie po pierwszym renderze panelu i sprawdzeniu auth

---

### 1.9 — index.html + js/pages/index.js
**Struktura JS:** `DOMContentLoaded` handler

- 🔲 `index.html` — inline script w `<head>`
- 🔲 `js/pages/index.js` — po linii **318** (`await loadRatingStats()`), przed linią 337 (teaser handlery):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `initI18n` (303) → `initPipeline` + `initImageViewer` (314-315) → `redirectIfSession` (317, może przenieść na login) → `loadRatingStats()` (318, wypełnia DOM). Strona gotowa.

---

### 1.10 — login.html + js/pages/login.js
**Struktura JS:** `DOMContentLoaded` handler

- 🔲 `login.html` — inline script w `<head>`
- 🔲 `js/pages/login.js` — po linii **807** (`await getUser()`) i warunkowej logice (linie 819-837), zanim zacznę bindować event listenery (linia 840):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Dlaczego tu:* po `initI18n` (782) → `applyMode()` (789, ustawia tryb login/register) → `getUser` (807) → logika redirect/render (819-837). Login gotowy do wyświetlenia.

---

### 1.11 — base-explorer.html + base-explorer/js/page.js
- 🔲 `base-explorer.html` — inline script w `<head>`
- 🔲 `base-explorer/js/page.js` — przeczytać plik, znaleźć koniec setup, dodać odkrycie

---

### 1.12 — manual.html
- 🔲 `manual.html` — ma już inline script (linie 19-30 — modal detection). Dodać FOUC script jako **pierwszy** w `<head>`, przed wszystkim
- 🔲 `js/pages/manual.js` — znaleźć koniec setup, dodać odkrycie

---

### 1.13 — reset.html + js/pages/reset.js
- 🔲 `reset.html` — inline script w `<head>`
- 🔲 `js/pages/reset.js` — znaleźć koniec setup, dodać odkrycie

---

### 1.14 — confirm.html + js/pages/confirm.js
- 🔲 `confirm.html` — inline script w `<head>`
- 🔲 `js/pages/confirm.js` — znaleźć koniec setup, dodać odkrycie

---

## ETAP 2 — iOS: touch-action + pointerdown w topbarze

**Problem:** `topbar-controller.js` używa `click` — na iOS 300ms opóźnienie na każde
kliknięcie hamburgera i dropdownu konta.

### 2.1 — css/base.css — touch-action:manipulation
- 🔲 Znaleźć definicje `.topbar-section button`, `.topbar-menu-toggle`, `.account-btn`
- 🔲 Dodać `touch-action: manipulation` do każdego z nich

### 2.2 — js/core/topbar-controller.js — zamknięcie overflow nav
- 🔲 **Linia 161-165:** zmienić `document.addEventListener('click', ...)` → `'pointerdown'`

### 2.3 — js/core/topbar-controller.js — zamknięcie dropdown konta
- 🔲 **Linia 323-325:** zmienić `document.addEventListener('click', ...)` → `'pointerdown'`

### 2.4 — js/core/topbar-controller.js — hamburger + close button
- 🔲 **Linia 507:** `toggleBtn.addEventListener('click', open)` → `'pointerdown'`
- 🔲 **Linia 508:** `closeBtn.addEventListener('click', close)` → `'pointerdown'`

---

## ETAP 3 — Ujednolicenie breakpointów → 980px wszędzie

**Problem:** 900px (topbar/hamburger) vs 980px (device guard) vs 1025px (btn-group).
Dead zone 901-979px: hamburger już aktywny, ale btn-group jeszcze widoczne.
**Nowy standard: 980px**

### 3.1 — js/core/topbar-controller.js
- 🔲 **Linia 379:** `'(max-width: 900px)'` → `'(max-width: 980px)'`

### 3.2 — css/base.css (wszystkie wystąpienia 900px)
- 🔲 Linia 77
- 🔲 Linia 157
- 🔲 Linia 671
- 🔲 Linia 835
- 🔲 Linia 848
- 🔲 Linia 958
- 🔲 Linia 1057
- 🔲 Linia 1123

### 3.3 — css/builder.css
- 🔲 Linia 48 — 900px → 980px
- 🔲 Linia 74 — 900px → 980px
- 🔲 Linia 94 — 900px → 980px
- 🔲 `@media (min-width: 1025px)` → `@media (min-width: 981px)`

### 3.4 — css/account.css
- 🔲 Linia 77 — 900px → 980px

### 3.5 — css/index.css
- 🔲 Linia 253 — sprawdzić kontekst, zmienić jeśli mobilny layout
- 🔲 Linia 417 — to samo

### 3.6 — css/marketplace.css
- 🔲 Linia 17 — 900px → 980px

### 3.7 — css/game-settings.css
- 🔲 Linia 695 — 900px → 980px

### 3.8 — css/settings.css
- 🔲 Linia 565
- 🔲 Linia 999
- 🔲 Linia 1196

### 3.9 — css/bases.css
- 🔲 Linia 192
- 🔲 Linia 399

### 3.10 — css/polls-hub.css
- 🔲 Linia 573
- 🔲 Linia 665
- 🔲 Linia 736

### 3.11 — css/manual.css
- 🔲 Linia 214

### 3.12 — js/pages/settings.js
- 🔲 Linia 3694
- 🔲 Linia 4111
- 🔲 Linia 4393
- 🔲 Linia 4431
- 🔲 Linia 4442

### 3.13 — js/pages/index.js
- 🔲 Linia 223

---

## ETAP 4 — Back buttons: withLangParam wszędzie

**Problem:** Część przycisków powrotu traci wybrany język.

### 4.1 — js/pages/game-settings.js
- 🔲 Okolice linii 1672-1688: `location.href = "builder"` → `location.href = withLangParam("builder")`
- 🔲 Sprawdzić czy `withLangParam` jest importowany

### 4.2 — js/pages/polls.js
- 🔲 Okolice linii 1162-1175: dodać `withLangParam()` do URL
- 🔲 Sprawdzić import

### 4.3 — js/pages/bases.js
- 🔲 Linia 1463-1465: sprawdzić co zwraca `getBackLink()`, owinąć `withLangParam()` jeśli nie ma

### 4.4 — js/pages/editor.js
- 🔲 Linia 500-506: `location.href = "builder"` → `withLangParam("builder")`
- 🔲 Sprawdzić import

### 4.5 — js/pages/connect-device.js
- 🔲 Linia 352-356: już ma `withLangParam` ✅ — tylko zweryfikować

### 4.6 — js/core/topbar-controller.js — dead selektory
- 🔲 **Linia 515:** usunąć `,[data-mobile-back],.btn-back,.btn.back`
  Zostaje: `section1.querySelector('#btnBack,#btnBackToBuilder')`

---

## ETAP 5 — Promise.all waterfall (szybsze ładowanie)

**Problem:** `initI18n` i `requireAuth` czekają jedno na drugie. Na wolnym łączu ~1s różnicy.

**Wzorzec przed:**
```javascript
await initI18n({ withSwitcher: true });
const user = await requireAuth();
```

**Wzorzec po:**
```javascript
const [, user] = await Promise.all([
  initI18n({ withSwitcher: true }),
  requireAuth(),
]);
```

Uwaga: fetch danych zależny od `user.id` nadal czeka na `user`. Tylko `initI18n` + `requireAuth` równolegle.

### 5.1 — js/pages/builder.js
- 🔲 Linia 1045 (`initI18n`) + 1057 (`requireAuth`) → `Promise.all`

### 5.2 — js/pages/bases.js
- 🔲 `initI18n` (linia 15, top-level bez await) + `requireAuth` (1607) → przenieść oba do `Promise.all` wewnątrz IIFE

### 5.3 — js/pages/polls.js
- 🔲 `initI18n` (linia 10) + `requireAuth` (1151) → `Promise.all`

### 5.4 — js/pages/editor.js
- 🔲 `initI18n` (linia 11) + `requireAuth` (495) → `Promise.all` w `boot()`

### 5.5 — js/pages/game-settings.js
- 🔲 `initI18n` jest w `<head>` inline, `requireAuth` linia 1521 — tu waterfall nie dotyczy initI18n. Sprawdzić czy inne operacje można zrównoleglić.

### 5.6 — js/pages/connect-device.js
- 🔲 `initI18n` (341) + `getUser` (343) → `Promise.all` (getUser nie wymaga auth, OK równolegle)

### 5.7 — js/pages/marketplace.js
- 🔲 `initI18n` (702) + `getUser` (704) → `Promise.all`

---

## ETAP 6 — Cleanup

### 6.1 — Zduplikowane definicje .hidden / [hidden]
Reguła istnieje w `css/base.css:791-793`. Sprawdzić które subaplikacje NIE używają base.css — jeśli używają, usunąć duplikaty:

- 🔲 `control/control.css:737-739` — sprawdzić czy control.html importuje base.css → jeśli tak, usunąć
- 🔲 `display/styles.css:49-51` — to samo dla display
- 🔲 `css/buzzer.css:136-138` — to samo dla buzzer
- 🔲 `logo-editor/logo-editor.css:27-28` — to samo
- 🔲 `base-explorer/base-explorer.css:20-22` — to samo

### 6.2 — Dead selektory (zrobione w 4.6)
- 🔲 Zweryfikować po etapie 4

### 6.3 — logo-editor JS breakpoint
- 🔲 `logo-editor/js/main.js:1312, 1505-1507` — już 980px → OK, potwierdzić

### 6.4 — initI18n bez await na top-levelu (bug ukryty jako cleanup)
Trzy pliki wywołują `initI18n(...)` synchronicznie na top-levelu modułu (bez await).
To znaczy że gdy reszta kodu synchronicznego się wykonuje, tłumaczenia mogą jeszcze nie być załadowane.

- 🔲 `js/pages/bases.js:15` — `initI18n({ withSwitcher: true });` bez await → przenieść do IIFE (etap 5 to naprawi przy Promise.all, ale jeśli etap 5 robi się po etapie 6 — naprawić tutaj)
- 🔲 `js/pages/polls.js:10` — to samo
- 🔲 `js/pages/editor.js:11` — to samo
- 🔲 Uwaga: etap 5 (Promise.all) rozwiązuje ten problem przy okazji — jeśli etap 5 już zrobiony, pominąć

### 6.5 — Topbar-controller: nadmiarowe listenery resize
Teraz: 3 osobne `resize` listenery + `ResizeObserver` bez debounce + `MutationObserver` na każdy badge button.
Przy intensywnym resizowaniu (np. obrót urządzenia) to dużo zbędnych wywołań.

- 🔲 `js/core/topbar-controller.js` — zidentyfikować wszystkie `resize` listenery i `ResizeObserver`
- 🔲 Połączyć w jeden listener z debounce (~16ms, jeden frame)
- 🔲 Sprawdzić czy `MutationObserver` na badge buttons można zastąpić prostą funkcją `updateBadge()`

### 6.6 — Mieszane sposoby ukrywania elementów w JS
Trzy różne wzorce w kodzie: `el.style.display = "none"`, `el.classList.add("hidden")`, `el.hidden = true`.
Grep po jednym nie pokazuje drugiego — utrudnia szukanie bugów.

- 🔲 `control/js/share-device.js` (linie 101, 108-109, 120, 138, 243) — `style.display` → `el.hidden`
- 🔲 `js/pages/settings.js` (linie 1041, 2201, 2206, 2231) — to samo
- 🔲 `logo-editor/js/main.js:1506` — to samo
- 🔲 Zostawić `classList.add("hidden")` tam gdzie nie da się łatwo zmienić bez ryzyka regresu

### 6.7 — Preconnect na wszystkich stronach (nie tylko control)
Każda strona ładuje Supabase CDN. `<link rel="preconnect">` skraca czas pierwszego połączenia o ~100-200ms.

- 🔲 Dodać do `<head>` każdego HTML (builder, bases, polls, editor, game-settings, marketplace, connect-device, settings, index, login, reset, confirm):
  ```html
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  ```
- 🔲 Sprawdzić jaki jest URL Supabase w projekcie i dodać też preconnect do niego

### 6.8 — security-warning.js: czy wszędzie potrzebny
- 🔲 Sprawdzić co robi `js/core/security-warning.js` — przeczytać plik
- 🔲 Zidentyfikować na których stronach jest załadowany (grep po `security-warning`)
- 🔲 Usunąć ze stron gdzie nie jest potrzebny (jeśli takie są)

### 6.9 — Wersje w importach: spójność
Cache-busting przez `?v=v2026-07-15T16532` w importach. Stara wersja = przeglądarka serwuje stary plik.

- 🔲 Grep po `?v=` w całym projekcie — znaleźć importy ze starą wersją
- 🔲 Sprawdzić czy proces aktualizacji wersji jest automatyczny (CI?) czy ręczny

---

## ETAP 7 — Control: szybsze ładowanie (osobny priorytet)

**Dlaczego najwolniejszy:** 3 sieciowe round-tripy przed pierwszym renderem, 16 modułów JS
do sparsowania, efekt dźwiękowy (sfx.js) ładuje się synchronicznie przy imporcie.

**Krytyczna ścieżka do pierwszego renderowania:**
```
CSS (blokuje) → initI18n (await) → import 16 modułów JS → guardDesktopOnly() →
requireAuth() [sieć #1] → loadGameOrThrow() [sieć #2] → renderFromState() [PIERWSZY RENDER]
```

### 7.1 — control.html: skeleton / loading state zamiast pustej strony

**Problem:** Strona jest biała (lub w 100% niewidoczna) przez cały czas ładowania.
Użytkownik nie wie czy coś się dzieje.

- 🔲 Dodać w `<body>` prosty "skeleton" loader widoczny od razu (czysty HTML+CSS, zero JS):
  ```html
  <div id="ctrlLoader" style="
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:#050914;color:rgba(255,255,255,.4);font-family:system-ui;font-size:14px;
    z-index:9999;
  ">Ładowanie panelu...</div>
  ```
- 🔲 W `app.js` po `renderFromState()` (linia 800) ukryć loader:
  ```javascript
  document.getElementById('ctrlLoader')?.remove();
  ```
- 🔲 Dodać tekst loadera do tłumaczeń jeśli potrzebne (lub zostawić jako stały tekst)

### 7.2 — control.html + app.js: visibility:hidden jak inne strony

- 🔲 `control.html` — sprawdzić czy już ma `visibility:hidden` (ma mobile guard ale nie FOUC fix)
- 🔲 Jeśli nie — inline script `document.documentElement.style.visibility='hidden'`
- 🔲 `control/js/app.js` — po linii **800** (`renderFromState(store.state)`):
  ```javascript
  document.documentElement.style.visibility = '';
  ```
  *Punkt odkrycia:* linia 800 to pierwszy render UI — topbar ustawiony, karta urządzeń widoczna, przyciski w prawidłowym stanie.

### 7.3 — Promise.all: initI18n + requireAuth + loadGame równolegle

**Problem:** Teraz sekwencyjnie: initI18n → requireAuth → loadGame = 3 operacje jedna po drugiej.

- 🔲 `control.html` (linie 24-27): aktualnie `await initI18n(...)` + `import("app.js")` sekwencyjnie
- 🔲 `control/js/app.js` linia 228-229: `await ensureAuthOrRedirect()` + `await loadGameOrThrow()` sekwencyjnie
- 🔲 Zmienić linii 228-229 w app.js:
  ```javascript
  // PRZED:
  const user = await ensureAuthOrRedirect();
  const game = await loadGameOrThrow();

  // PO:
  const [user, game] = await Promise.all([
    ensureAuthOrRedirect(),
    loadGameOrThrow(),
  ]);
  ```
  *Uwaga:* `loadGameOrThrow()` pobiera gameId z URL params — nie potrzebuje `user`. Można równolegle.
  *Ryzyko:* `ensureAuthOrRedirect` może zredirectować — `loadGameOrThrow` wywoła się bezużytecznie ale to tylko ~50ms straconego czasu.

### 7.4 — sfx.js: sprawdzić czy blokuje

- 🔲 Przeczytać `js/core/sfx.js` — sprawdzić czy robi coś ciężkiego przy imporcie (np. AudioContext, fetch)
- 🔲 Jeśli tak — lazy import (dynamiczny `import()` w momencie pierwszego użycia dźwięku zamiast na starcie)

### 7.5 — Supabase CDN: preconnect

- 🔲 `control.html` `<head>` — dodać przed stylesheetami:
  ```html
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link rel="preconnect" href="https://YOUR_SUPABASE_URL.supabase.co">
  ```
  To skróci czas pierwszego połączenia z Supabase o ~100-200ms.

---

## ETAP 8 — Refaktor: wspólny bootPage() (opcjonalny, po etapach 1-5)

**Problem:** Każda strona powtarza ten sam boilerplate inicjalizacyjny:
```javascript
// powtórzone 7+ razy, z drobnymi różnicami:
await initI18n({ withSwitcher: true });
const user = await requireAuth('login');
initTopbarAccountDropdown(user, { ... });
```

**Rozwiązanie:** Nowy plik `js/core/boot.js` z jedną funkcją `bootPage()`.

### 8.1 — Stworzyć js/core/boot.js

```javascript
// js/core/boot.js
import { initI18n } from '../../translation/translation.js';
import { requireAuth, getUser } from './auth.js';
import { initTopbarAccountDropdown } from './topbar-controller.js';

export async function bootPage({
  auth = 'require',            // 'require' | 'optional' | 'none'
  redirectTo = 'login',        // dokąd redirect jeśli niezalogowany
  withSwitcher = true,         // czy pokazać przełącznik języka
  withAccountSettings = false, // czy menu konta ma "Ustawienia konta"
  showAuthEntry = true,        // czy pokazać przycisk logowania dla niezalogowanych
} = {}) {
  const authFn = auth === 'require'
    ? () => requireAuth(redirectTo)
    : () => getUser();

  const [, user] = await Promise.all([
    initI18n({ withSwitcher }),
    authFn(),
  ]);

  initTopbarAccountDropdown(user, { withAccountSettings, showAuthEntry });

  return user;
}
```

- 🔲 Stworzyć plik `js/core/boot.js`
- 🔲 Dodać wersjonowanie (cache-bust) do importu tak jak inne pliki core

### 8.2 — js/pages/builder.js
- 🔲 Zastąpić initI18n + requireAuth + setTopbarAccount:
  ```javascript
  const user = await bootPage({ auth: 'require', withAccountSettings: true });
  ```

### 8.3 — js/pages/bases.js
- 🔲 Usunąć top-level `initI18n(...)` (linia 15, bez await)
- 🔲 W IIFE: `const user = await bootPage({ auth: 'require' });`

### 8.4 — js/pages/polls.js
- 🔲 Usunąć top-level `initI18n(...)` (linia 10)
- 🔲 `const user = await bootPage({ auth: 'require' });`

### 8.5 — js/pages/editor.js
- 🔲 Usunąć top-level `initI18n(...)` (linia 11)
- 🔲 W `boot()`: `const user = await bootPage({ auth: 'require' });`

### 8.6 — js/pages/marketplace.js
- 🔲 `const user = await bootPage({ auth: 'optional', showAuthEntry: false });`

### 8.7 — js/pages/connect-device.js
- 🔲 `const user = await bootPage({ auth: 'optional' });`

### 8.8 — js/pages/index.js
- 🔲 `const user = await bootPage({ auth: 'optional', showAuthEntry: true });`

### 8.9 — js/pages/login.js
- 🔲 Login nie ma topbara z dropdownem — sprawdzić czy bootPage pasuje, może tylko initI18n osobno

### 8.10 — game-settings.js — osobny przypadek
- 🔲 Używa `setTopbarAccount` zamiast `initTopbarAccountDropdown` (inna funkcja z innymi opcjami)
- 🔲 Rozważyć dodanie `topbarVariant` do bootPage albo zostawić poza refaktorem

### 8.11 — control/js/app.js — osobny przypadek
- 🔲 Ma `ensureAuthOrRedirect` zamiast `requireAuth` — nie pasuje do bootPage
- 🔲 Zostawić control poza bootPage

### Zależności etapu 8
```
WYMAGA ukończenia etapów 1, 2, 5
Punkt odkrycia visibility MUSI być POZA bootPage — każda strona odkrywa się po swoim własnym renderze
```

---

## Kolejność i zależności

```
ETAP 1  — niezależny, zaczynamy tutaj (największy efekt wizualny — wszystkie strony)
ETAP 7  — control (osobno, bo największy ból użytkownika)
ETAP 2  — iOS touch-action
ETAP 3  — breakpointy
ETAP 4  — back buttons
ETAP 5  — ZALEŻNY od etapu 1 (visibility reset w tym samym miejscu)
ETAP 6  — cleanup na końcu
ETAP 8  — ZALEŻNY od etapów 1, 2, 5 (refaktor bootPage)
```

## Postęp

- [ ] **Etap 1** — visibility:hidden + odkrycie po pełnym setup (14 stron)
- [ ] **Etap 2** — iOS touch-action + pointerdown (4 zmiany w 2 plikach)
- [ ] **Etap 3** — Breakpointy → 980px (22+ zmiany w 11 CSS + 2 JS)
- [ ] **Etap 4** — Back buttons + withLangParam + dead selektory (6 plików)
- [ ] **Etap 5** — Promise.all waterfall (7 plików)
- [ ] **Etap 6** — Cleanup: .hidden, initI18n bez await, resize listenery, mieszane hiding, preconnect, security-warning, wersje
- [ ] **Etap 7** — Control: skeleton + visibility + Promise.all + preconnect
- [ ] **Etap 8** — Refaktor bootPage() (opcjonalny — po 1, 2, 5)

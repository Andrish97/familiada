# Plan: Per-game Settings (game-settings)

## Zakres wdrożenia
Zmiany tylko w `builder-new.html` / `builder-new.js` i `control-new.html` / `control-new/js/app.js`.
Nowa strona: `game-settings.html` + `game-settings/`.

---

## Struktura plików

```
familiada/
├── game-settings.html                  # nowa strona
├── game-settings/
│   ├── settings.css                    # style sidebar + content + preview
│   └── js/
│       └── app.js                      # logika strony ustawień
├── js/core/
│   └── game-settings.js               # load/save/defaults — moduł współdzielony
└── supabase/migrations/
    └── 2026-06-05_NNN_game_settings.sql
```

Modyfikowane:
```
builder-new.js                          # przycisk ⚙ na kartach gier
control-new.html                        # uproszczony flow
control-new/js/app.js                   # ładuje settings na starcie
js/core/sfx-new.js                      # cloud-first upload + initSfx(gameId, soundSettings)
translation/pl.js, en.js, uk.js         # nowe klucze
```

---

## Migracja bazy

```sql
-- supabase/migrations/2026-06-05_NNN_game_settings.sql

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN games.settings IS
  'Per-game settings: teams, display, sound, questions';
```

Odczyt zawsze merguje z `getDefaults(locale)`, więc `{}` jest bezpieczne dla istniejących gier.

---

## Struktura danych settings

```jsonc
{
  "teams": {
    "nameA": "Drużyna A",   // locale-dependent default
    "nameB": "Drużyna B"
  },
  "display": {
    "logoId": null,          // null = domyślne; jeśli ID usunięte → fallback do domyślnego
    "theme": "classic",      // klucz motywu (lista z themes.json)
    "colors": {
      "teamA": null,         // null = kolor z motywu
      "teamB": null,
      "bg": null,
      "dot": null
    }
  },
  "sound": {
    "volumes": {             // 0–100 (int)
      "show_intro": 100,
      "round_transition": 100,
      "round_transition2": 100,
      "final_theme": 100,
      "buzzer_press": 100,
      "answer_correct": 100,
      "answer_wrong": 100,
      "answer_repeat": 100,
      "time_over": 100,
      "bells": 100
    },
    "variants": {},          // {} = wszystko "classic"; { "buzzer_press": "custom" }
    "customFiles": {}        // { "buzzer_press": "https://..." } — URL z Supabase Storage
  },
  "questions": {
    "finaleMode": "random",  // "random" | "pick"
    "finaleIds": [],         // wybrane pytania finału (gdy finaleMode="pick")
    "roundsMode": "random",  // "random" | "ordered"
    "orderedIds": []         // kolejność pytań rund (gdy roundsMode="ordered"); po wykluczeniu finałowych
  },
  "gameplay": {
    "hasFinal": true,             // gramy finał?
    "roundMultipliers": "1,1,1,2,3",  // mnożniki rund po przecinku
    "gameTarget": 0,              // cel rozgrywki (min. pkt do finału; 0 = brak)
    "finalTarget": 0,             // cel finału (0 = brak)
    "endMode": "logo",            // "logo" | "points" | "money"
    "prizeMultiplier": 1,         // mnożnik nagrody (tylko gdy endMode="money")
    "mainPrizeAmount": 0          // kwota nagrody głównej (tylko gdy endMode="money")
  }
}
```

---

## Moduł `js/core/game-settings.js`

```js
// API:
export async function loadSettings(gameId)
// Pobiera games.settings z Supabase, merguje z getDefaults(locale)
// Zwraca: pełny obiekt settings

export async function saveSettings(gameId, settings)
// Zapisuje settings do games.settings w Supabase
// Zwraca: { error } | { data }

export function getDefaults(locale)
// locale: "pl" | "en" | "uk"
// Zwraca domyślny obiekt settings z lokalnymi nazwami drużyn

export function mergeWithDefaults(partial, locale)
// Deep merge partial z getDefaults — używane przy odczycie

export async function resolveLogoUrl(logoId, userId)
// logoId null      → URL z domyślnego logo JSON
// logoId istnieje  → URL z user_logos
// logoId usunięte  → URL z domyślnego logo JSON (fallback)
```

---

## Strona `game-settings.html`

### Topbar
```
[← Builder]   Ustawienia: {nazwa gry}   [● Niezapisane]  [Zapisz wszystko]
```
- `← Builder` → `builder-new?` lub `history.back()`
- `● Niezapisane` badge: pojawia się gdy `isDirty === true`; klik scrolluje do paska dolnego
- `Zapisz wszystko` → jeden `saveSettings()` dla wszystkich kategorii

### Layout (desktop-only, jak control)
```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR                                                      │
├─────────────────┬───────────────────────────────────────────┤
│  SIDEBAR        │  CONTENT AREA (scroll wewnętrzny)         │
│  (fixed, 200px) │                                           │
│                 │  [aktywna kategoria]                       │
│  ┌───────────┐  │                                           │
│  │ Drużyny   │  │                                           │
│  └───────────┘  │                                           │
│  ┌───────────┐  │                                           │
│  │ Wygląd    │  │                                           │
│  └───────────┘  │                                           │
│  ┌───────────┐  │                                           │
│  │ Dźwięk    │  │                                           │
│  └───────────┘  │                                           │
│  ┌───────────┐  │                                           │
│  │ Pytania   │  │                                           │
│  │  · Finał  │  │                                           │
│  │  · Rundy  │  │                                           │
│  └───────────┘  │                                           │
│  ┌───────────┐  │                                           │
│  │ Rozgrywka │  │                                           │
│  └───────────┘  │                                           │
├─────────────────┴───────────────────────────────────────────┤
│  PASEK DOLNY: [● Masz niezapisane zmiany]    [Zapisz]       │
└─────────────────────────────────────────────────────────────┘
```

Bez wypustek. Sidebar: karty bez zaokrąglonych narożników kart-zakładek. Aktywna karta w sidebarze ma lewe obramowanie złotem (`border-left: 3px solid var(--gold)`).

### Ostrzeżenie o niezapisaniu
- `window.onbeforeunload` → przeglądarkowe ostrzeżenie
- `← Builder` → `confirmModal` z pytaniem o niezapisane zmiany

### Baner domyślnych ustawień

Jeśli `games.settings` w bazie to `{}` (gra nigdy nie miała zapisanych ustawień) — po załadowaniu strony pokazujemy baner informacyjny na górze obszaru treści:

```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ  Ta gra używa domyślnych ustawień. Możesz je teraz           │
│     dostosować — zostaną zapisane dopiero po kliknięciu         │
│     „Zapisz wszystko".                               [✕ Ukryj]  │
└─────────────────────────────────────────────────────────────────┘
```

- Wykrycie: `loadSettings` zwraca flagę `isDefault: true` gdy raw `settings === '{}'` lub `settings === null`
- Baner znika po: kliknięciu [✕ Ukryj] lub kliknięciu "Zapisz wszystko"
- Baner NIE pojawia się przy kolejnych wejściach (gdy użytkownik już coś zapisał)
- Kolor: informacyjny (niebieski/złoty info-banner), nie ostrzeżenie

```js
// w loadSettings:
const raw = data.settings;
const isDefault = !raw || Object.keys(raw).length === 0;
return { settings: mergeWithDefaults(raw, locale), isDefault };
```

---

## Kategoria: Drużyny

### UI
```
┌─────────────────────────────────────────┐
│  Drużyny                                │
│                                         │
│  Drużyna A:  [________________]         │
│  Drużyna B:  [________________]         │
│                                         │
│  [Przywróć domyślne]                    │
└─────────────────────────────────────────┘
```
- Input: `maxlength=30`
- "Przywróć domyślne" → wczytuje z `getDefaults(locale).teams`

---

## Kategoria: Wygląd

### UI — dwie kolumny
```
┌──────────────────────────┬──────────────────────┐
│  Ustawienia              │  Podgląd wyświetlacza │
│                          │  ┌────────────────┐   │
│  Motyw:                  │  │ ┌──┐  PYTANIE  │   │
│  [ui-select: motywy  ▾]  │  │ │🖼 │  ======== │   │
│                          │  │ └──┘  A: ████  │   │
│  Logo:                   │  │       B: ████  │   │
│  [ui-select: lista logo] │  │  [Drużyna A] 0 │   │
│  [Bez logo] [Domyślne]   │  │  [Drużyna B] 0 │   │
│                          │  └────────────────┘   │
│  Kolory:                 │  ~320×200px           │
│  Drużyna A  [🟦]         │                       │
│  Drużyna B  [🟥]         │                       │
│  Tło        [⬛]         │                       │
│  Kropki     [🟡]         │                       │
│  [Reset kolorów]         │                       │
└──────────────────────────┴──────────────────────┘
```

**Motyw:**
- Dropdown `ui-select` z listą dostępnych motywów (identyczny jak w control `setup_look`)
- Zmiana motywu → reset kolorów do wartości motywu (z potwierdzeniem)

**Logo:**
- Dropdown `ui-select` z miniaturami logo użytkownika
- Opcja "Domyślne" (wartość `null` → JSON default)
- Jeśli wybrany logoId zniknął z bazy → automatycznie pokazuje "Domyślne" z informacją

**Kolory:**
- Swatch button dla każdego koloru → otwiera color picker (identyczny jak w control)
- `null` = kolor z motywu; nadpisanie daje `"#RRGGBB"`

**Podgląd:**
- `<div class="display-preview">` — statyczny HTML stylizowany jak ekran gry
- Aktualizuje się live przy każdej zmianie (motyw, logo, kolory, nazwy drużyn)
- Zawiera: logo w rogu, planszę z odpowiedziami (placeholder), paski punktów z nazwami drużyn
- NIE jest iframe — tylko stylizowany div

**resolveLogoUrl:**
```
logoId === null           → defaultLogoJson.url
logoId w user_logos       → logo.url
logoId nie istnieje w DB  → defaultLogoJson.url + log warn
```

---

## Kategoria: Dźwięk

Pełna tabela 10 kategorii. Per-game, cloud-first — pliki własne w Supabase Storage.

### UI (grid 5 kolumn, identyczny układ jak sfx-advanced-section w control-new)
```
Opis        | Wariant (dropdown) | ▶ | Głośność    | Plik
───────────────────────────────────────────────────────────
Intro show  | [classic      ▾]  | ▶ | ────●──── 80% | [Dodaj plik]
Przejście   | [własny plik  ▾]  | ▶ | ──●────── 60% | [moj.mp3 ✕]
...
```

Przyciski na dole:
```
[Przywróć domyślne dźwięki]
```

Brak checkboxa "Zapisz w chmurze" — ustawienia (łącznie z dźwiękiem i URLami plików)
zapisywane do chmury automatycznie przy kliknięciu głównego "Zapisz wszystko".

### Pliki własne — cloud-first (bez IndexedDB)
- Upload pliku → natychmiast do Supabase Storage (`user-sounds/{userId}/{gameId}_{key}.mp3`)
- URL zwrócony z uploadu zapisuje się w `settings.sound.customFiles.{key}`
- `sfx-new.js` dostaje URL z settings i ładuje audio bezpośrednio z niego
- Brak IndexedDB dla per-game dźwięków

---

## Kategoria: Pytania

### Logika
Pula = wszystkie pytania gry. Jedna runda = jedno pytanie — brak osobnego "count per round".

1. Najpierw wybieramy pytania **finału** (losowo lub ręcznie).
2. Pytania **rund** = cała pula minus wybrane/wylosowane do finału.
3. Liczba rund = liczba pytań rund (auto).

### Podsekcja: Finał

Widoczna zawsze (opcja "Gramy finał?" jest w kategorii Rozgrywka — tu tylko wybieramy pytania).

```
┌─────────────────────────────────────────────────────┐
│  Pytania finałowe                                    │
│                                                      │
│  Tryb:  ○ Losowe    ○ Wybierz ręcznie                │
│                                                      │
│  [JEŚLI LOSOWE]                                      │
│  (pytania zostaną wylosowane przy starcie finału)    │
│                                                      │
│  [JEŚLI WYBIERZ RĘCZNIE]                             │
│  ┌──────────────────────────────────────────────┐    │
│  │ ☰  1. Pytanie finałowe A  [↑][↓][✕]         │    │
│  │ ☰  2. Pytanie finałowe B  [↑][↓][✕]         │    │
│  │ [+ Dodaj pytanie z puli]                     │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

| Klucz | UI | Domyślna |
|-------|-----|----------|
| `questions.finaleMode` | Radio: Losowe / Wybierz ręcznie | `"random"` |
| `questions.finaleIds` | Lista z reorder (drag & drop) | `[]` |

### Podsekcja: Rundy

Pytania rund = pula minus finałowe. Jeśli `finaleMode="random"` — pokazujemy info że pula rund zależy od losowania.

```
┌─────────────────────────────────────────────────────┐
│  Kolejność pytań rund                                │
│  Pula: wszystkie pytania gry minus finałowe          │
│                                                      │
│  Tryb:  ○ Losowe    ○ Ustalona kolejność             │
│                                                      │
│  [JEŚLI USTALONA KOLEJNOŚĆ]                          │
│  Lista pytań (drag & drop):                          │
│  ┌──────────────────────────────────────────────┐    │
│  │ ☰  1. Jak nazywa się...  [↑][↓][✕]          │    │
│  │ ☰  2. Wymień 5 rzeczy... [↑][↓][✕]          │    │
│  │ ☰  3. Co robi...         [↑][↓][✕]          │    │
│  │ [+ Dodaj pytanie z puli]                     │    │
│  └──────────────────────────────────────────────┘    │
│  Liczba rund = liczba wybranych pytań               │
└─────────────────────────────────────────────────────┘
```

| Klucz | UI | Domyślna |
|-------|-----|----------|
| `questions.roundsMode` | Radio: Losowe / Ustalona kolejność | `"random"` |
| `questions.orderedIds` | Lista z reorder (drag & drop) | `[]` |

---

## Kategoria: Rozgrywka

Odpowiada "Dodatkowym ustawieniom" z control — konfiguruje mechanikę i przepływ rozgrywki.

### UI
```
┌─────────────────────────────────────────────────────┐
│  Rozgrywka                                           │
│                                                      │
│  Gramy finał?       ○ Tak    ○ Nie                   │
│                                                      │
│  Mnożniki rund:     [1,1,1,2,3          ]            │
│  (podaj po przecinku; liczba wartości = l. rund)     │
│                                                      │
│  Cel rozgrywki:     [  0  ] pkt  (0 = brak limitu)   │
│                                                      │
│  [jeśli "Gramy finał?" = Tak]                        │
│  Cel finału:        [  0  ] pkt  (0 = brak limitu)   │
│                                                      │
│  Zakończenie gry:                                    │
│  ○ Pokaż logo                                        │
│  ○ Pokaż punkty                                      │
│  ○ Pokaż kwotę (po finale)                           │
│                                                      │
│  [jeśli "Pokaż kwotę"]                               │
│  Mnożnik nagrody:   [  1  ]                          │
│  Kwota nagrody:     [  0  ]  (maks. 99 999)          │
│                                                      │
│  [Przywróć domyślne]                                 │
└─────────────────────────────────────────────────────┘
```

| Klucz | UI | Domyślna |
|-------|-----|----------|
| `gameplay.hasFinal` | Radio: Tak / Nie | `true` |
| `gameplay.roundMultipliers` | Text input | `"1,1,1,2,3"` |
| `gameplay.gameTarget` | Number input | `0` |
| `gameplay.finalTarget` | Number input | `0` |
| `gameplay.endMode` | Radio: logo / points / money | `"logo"` |
| `gameplay.prizeMultiplier` | Number input | `1` |
| `gameplay.mainPrizeAmount` | Number input | `0` |

---

## Zmiany w builder-new.js

### Przycisk Ustawienia na karcie gry

Dodany bezpośrednio obok `[Graj]`:
```
[Podgląd] [Edytuj] [Graj] [⚙ Ustawienia] [Ankieta]
```

Logika widoczności / stanu: **identyczna jak `btnPlay`** — te same warunki (`validateGameReadyToPlay`),
ten sam moment aktywacji, ten sam disabled state. Żadnej osobnej logiki.

W kodzie `builder-new.js` — wszędzie gdzie ustawiany jest stan `btnPlay`, ustawiany jest też `btnSettings`:
```js
btnPlay.disabled = !canPlay;
btnSettings.disabled = !canPlay;   // zawsze razem z btnPlay
```

Klik: `location.href = \`game-settings?id=\${selectedId}\``

---

## Zmiany w control-new (uproszczenie)

### Usunięte kroki
- Nazwy drużyn (przeniesione do game-settings → Drużyny)
- Zaawansowane ustawienia dźwięku (przeniesione do game-settings → Dźwięk)
- Wybór pytań / podsumowanie (przeniesione do game-settings → Pytania)

### Pozostałe kroki
```
Krok 1: Urządzenia
  - QR kod wyświetlacza
  - QR kod prowadzącego
  - QR kod buzzera

Krok 2: Dźwięk
  - Przycisk "🔊 Odblokuj dźwięk"
  - Status

→ [Rozpocznij grę]
```

### Startup w control-new/js/app.js
```js
// Po requireAuth i pobraniu gameId:
const settings = await loadSettings(gameId);
applyTeamNames(settings.teams);
await initSfx(gameId);  // nowy podpis z gameId
applyDisplaySettings(settings.display);
// → gotowy do startu rundy 1
```

---

## Zmiany w sfx-new.js

Cloud-first: pliki własne nie trafiają do IndexedDB — są uploadowane do Supabase Storage,
a URL zapisywany w `settings.sound.customFiles`.

```js
// Stara sygnatura:
export async function initSfx()

// Nowa:
export async function initSfx(gameId, soundSettings)
// soundSettings = settings.sound (volumes, variants, customFiles)
// customFiles[key] to URL z Supabase Storage → AudioBuffer ładowany fetch()

// Upload pliku własnego (wywoływany ze strony game-settings):
export async function uploadSfxFile(key, file, gameId, userId)
// → upload do `user-sounds/{userId}/{gameId}_{key}.mp3`
// → zwraca url (string)
// Caller zapisuje: settings.sound.customFiles[key] = url

// Usunięcie pliku własnego:
export async function deleteSfxFile(key, gameId, userId)
// → usuwa z Supabase Storage
// Caller usuwa: delete settings.sound.customFiles[key]
```

---

## Tłumaczenia (nowe klucze)

```js
// translation/pl.js — sekcja "settings":
settings: {
  title: "Ustawienia gry",
  back: "← Builder",
  saveAll: "Zapisz wszystko",
  unsaved: "Niezapisane zmiany",
  unsavedConfirm: "Masz niezapisane zmiany. Czy chcesz opuścić stronę?",
  saved: "Zapisano",
  saveError: "Błąd zapisu",
  categories: {
    teams: "Drużyny",
    display: "Wygląd",
    sound: "Dźwięk",
    questions: "Pytania",
    finale: "Finał",
    rounds: "Rundy",
    gameplay: "Rozgrywka",
  },
  teams: {
    nameA: "Nazwa drużyny A",
    nameB: "Nazwa drużyny B",
    restoreDefaults: "Przywróć domyślne",
    defaultA: "Drużyna A",
    defaultB: "Drużyna B",
  },
  display: {
    logo: "Logo",
    logoDefault: "Domyślne",
    logoNone: "Bez logo",
    logoMissing: "Logo zostało usunięte — używamy domyślnego",
    theme: "Motyw wyświetlacza",
    colors: "Kolory",
    colorTeamA: "Kolor drużyny A",
    colorTeamB: "Kolor drużyny B",
    colorBg: "Kolor tła",
    colorDot: "Kolor kropek",
    resetColors: "Reset kolorów",
    preview: "Podgląd wyświetlacza",
  },
  questions: {
    finaleTitle: "Pytania finałowe",
    finaleModeRandom: "Losowe",
    finaleModeManual: "Wybierz ręcznie",
    addFinaleQuestion: "+ Dodaj pytanie z puli",
    roundsTitle: "Kolejność pytań rund",
    roundsModeRandom: "Losowe",
    roundsModeOrdered: "Ustalona kolejność",
    addRoundQuestion: "+ Dodaj pytanie z puli",
    roundsPoolInfo: "Pula: wszystkie pytania gry minus finałowe",
  },
  gameplay: {
    title: "Rozgrywka",
    hasFinal: "Gramy finał?",
    roundMultipliers: "Mnożniki rund",
    roundMultipliersHint: "Podaj po przecinku, np. 1,1,1,2,3",
    gameTarget: "Cel rozgrywki",
    gameTargetHint: "0 = brak limitu",
    finalTarget: "Cel finału",
    endMode: "Zakończenie gry",
    endModeLogo: "Pokaż logo",
    endModePoints: "Pokaż punkty",
    endModeMoney: "Pokaż kwotę (po finale)",
    prizeMultiplier: "Mnożnik nagrody",
    mainPrizeAmount: "Kwota nagrody głównej",
    mainPrizeAmountHint: "Maks. 5 cyfr (do 99 999)",
    restoreDefaults: "Przywróć domyślne",
  },
}
```

Analogiczne klucze w `en.js` i `uk.js` z odpowiednimi tłumaczeniami i domyślnymi nazwami drużyn (Team A/B, Команда А/Б).

---

## CSS (`game-settings/settings.css`)

```css
/* Główny layout */
.gs-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: 1fr auto;  /* content + footer bar */
  height: calc(100vh - topbar-height);
  overflow: hidden;
}

/* Sidebar */
.gs-sidebar {
  border-right: 1px solid rgba(255,255,255,.1);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.gs-sidebar-item {
  /* karta bez wypustek */
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
  font-size: .9rem;
  font-weight: 600;
}

.gs-sidebar-item.active {
  border-left: 3px solid var(--gold);
  background: rgba(255,234,166,.08);
  color: var(--gold);
}

.gs-sidebar-sub {
  padding-left: 24px;
  font-size: .82rem;
  font-weight: 500;
  opacity: .75;
}

/* Content */
.gs-content {
  overflow-y: auto;
  padding: 24px 28px;
}

/* Footer bar (niezapisane) */
.gs-footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-top: 1px solid rgba(255,255,255,.1);
  background: rgba(255,234,166,.06);
}

.gs-footer.hidden { display: none; }

/* Podgląd wyświetlacza */
.display-preview {
  width: 320px;
  height: 200px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.2);
  background: #050914;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
```

---

## Kolejność implementacji (proponowana)

1. **Migracja SQL** + moduł `game-settings.js` (load/save/defaults/resolveLogoUrl)
2. **game-settings.html** — szkielet HTML + CSS layout (sidebar + content)
3. **Kategoria Drużyny** — najprostsza, dobry smoke test
4. **Kategoria Wygląd** — logo + motyw + kolory + preview div
5. **Kategoria Dźwięk** — port z sfx-advanced-section + cloud upload w sfx-new.js
6. **Kategoria Pytania** — Finał + Rundy (drag & drop, pula minus finałowe)
7. **Kategoria Rozgrywka** — port "Dodatkowych ustawień" z control
8. **Zapis + dirty tracking** — `isDirty`, `beforeunload`, pasek dolny
9. **builder-new.js** — przycisk ⚙ na kartach
10. **control-new** — usunięcie kroków setup + `loadSettings` na starcie

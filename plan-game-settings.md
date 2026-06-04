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
js/core/sfx-new.js                      # klucz IndexedDB: gameId:key
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
    "logoId": null,          // null = domyślne logo z JSON; jeśli ID wskazuje usunięte → fallback do JSON
    "frameMode": "classic"   // "classic" | "minimal"
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
    "cloudSave": false
  },
  "questions": {
    "mode": "random",        // "random" | "ordered"
    "count": 3,              // ile pytań losowych per runda (tylko gdy random)
    "selectedIds": [],       // kolejność pytań (tylko gdy ordered); [] = wszystkie po kolei
    "roundsCount": 3,        // liczba rund (random: maks; ordered: = len(selectedIds))
    "finaleMode": "random",  // "random" | "selected"
    "finaleCount": 5,        // ile pytań finałowych z puli (tylko gdy finaleMode=random)
    "finaleIds": []          // konkretne pytania do finału (tylko gdy finaleMode=selected)
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
│  │  · Rundy  │  │                                           │
│  │  · Finał  │  │                                           │
│  └───────────┘  │                                           │
├─────────────────┴───────────────────────────────────────────┤
│  PASEK DOLNY: [● Masz niezapisane zmiany]    [Zapisz]       │
└─────────────────────────────────────────────────────────────┘
```

Bez wypustek. Sidebar: karty bez zaokrąglonych narożników kart-zakładek. Aktywna karta w sidebarze ma lewe obramowanie złotem (`border-left: 3px solid var(--gold)`).

### Ostrzeżenie o niezapisaniu
- `window.onbeforeunload` → przeglądarkowe ostrzeżenie
- `← Builder` → `confirmModal` z pytaniem o niezapisane zmiany

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
│  Logo:                   │  │ ┌──┐  PYTANIE  │   │
│  [ui-select: lista logo] │  │ │🖼 │  ======== │   │
│  [Bez logo] [Domyślne]   │  │ └──┘  A: ████  │   │
│                          │  │       B: ████  │   │
│  Tryb ramki:             │  │  [Drużyna A] 0 │   │
│  ○ Klasyczna             │  │  [Drużyna B] 0 │   │
│  ○ Minimalna             │  └────────────────┘   │
│                          │  ~320×200px           │
└──────────────────────────┴──────────────────────┘
```

**Logo:**
- Dropdown `ui-select` z miniaturami logo użytkownika
- Opcja "Domyślne" (wartość `null` → JSON default)
- Jeśli wybrany logoId zniknął z bazy → automatycznie pokazuje "Domyślne" z informacją

**Podgląd:**
- `<div class="display-preview">` — statyczny HTML stylizowany jak ekran gry
- Aktualizuje się live przy każdej zmianie (logo, ramka, nazwy drużyn)
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

Pełna tabela 10 kategorii. Per-game — IndexedDB klucz: `{gameId}:{sfxKey}`.

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
[Przywróć domyślne dźwięki]    □ Zapisz w chmurze    [Zapisz do chmury]
```

### Zmiana klucza IndexedDB
- Stara baza: `familiada-sfx` / store: `custom-files` / klucz: `sfxKey`
- Nowa baza: `familiada-sfx` / store: `custom-files` / klucz: `{gameId}:{sfxKey}`
- `sfx-new.js` dostaje `gameId` przez `initSfx(gameId)` — wszystkie operacje prefixują klucz

---

## Kategoria: Pytania

### Podsekcja: Rundy

```
┌─────────────────────────────────────────────────────┐
│  Pytania do rund                                     │
│                                                      │
│  Tryb:  ○ Losowe    ○ Ustalona kolejność             │
│                                                      │
│  [JEŚLI LOSOWE]                                      │
│  Liczba pytań per runda:  [3 ▾]  (1–10)             │
│  Maksymalna liczba rund:  [3 ▾]  (1–10)             │
│                                                      │
│  [JEŚLI USTALONA KOLEJNOŚĆ]                          │
│  Lista pytań (drag & drop lub numery):               │
│  ┌──────────────────────────────────────────────┐    │
│  │ ☰  1. Jak nazywa się...  [↑][↓][✕]          │    │
│  │ ☰  2. Wymień 5 rzeczy... [↑][↓][✕]          │    │
│  │ ☰  3. Co robi...         [↑][↓][✕]          │    │
│  │ [+ Dodaj pytanie z puli]                      │    │
│  └──────────────────────────────────────────────┘    │
│  Liczba rund = liczba wybranych pytań               │
└─────────────────────────────────────────────────────┘
```

| Klucz | UI | Domyślna |
|-------|-----|----------|
| `questions.mode` | Radio: Losowe / Ustalona kolejność | `"random"` |
| `questions.count` | Select 1–10 | `3` |
| `questions.roundsCount` | Select 1–10 | `3` |
| `questions.selectedIds` | Lista z reorder | `[]` |

### Podsekcja: Finał

Widoczna tylko gdy `game.type !== "prepared"` (gry preparowane nie mają finału ankietowego).

```
┌─────────────────────────────────────────────────────┐
│  Pytania finałowe                                    │
│                                                      │
│  Tryb:  ○ Losowe z puli    ○ Ustalone                │
│                                                      │
│  [JEŚLI LOSOWE]                                      │
│  Liczba pytań finałowych:  [5 ▾]  (1–10)            │
│                                                      │
│  [JEŚLI USTALONE]                                    │
│  ┌──────────────────────────────────────────────┐    │
│  │ ☰  1. Pytanie finałowe A  [↑][↓][✕]         │    │
│  │ [+ Dodaj pytanie finałowe]                    │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

| Klucz | UI | Domyślna |
|-------|-----|----------|
| `questions.finaleMode` | Radio: Losowe / Ustalone | `"random"` |
| `questions.finaleCount` | Select 1–10 | `5` |
| `questions.finaleIds` | Lista z reorder | `[]` |

---

## Zmiany w builder-new.js

### Przycisk Ustawienia na karcie gry

Dodany obok `[Graj]` i `[Ankieta]`:
```
[Podgląd] [Edytuj] [Graj] [Ankieta] [⚙ Ustawienia]
```

Logika widoczności / stanu:
- Widoczny: zawsze gdy widoczny `[Graj]`
- `disabled`: gdy gra nie jest grywalna (`canPlay === false`)
- Klik: `location.href = \`game-settings?id=\${selectedId}\``

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

```js
// Stara sygnatura:
export async function initSfx()

// Nowa:
export async function initSfx(gameId)
// gameId przekazywany do wszystkich operacji IndexedDB
// klucz: `${gameId}:${sfxKey}` zamiast `${sfxKey}`

// Inne funkcje dotknięte:
setSfxCustomBlob(key, blob, filename, gameId)
getSfxCustomFiles(gameId)
clearSfxCustomFile(key, gameId)
clearAllSfxCustomFiles(gameId)
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
    rounds: "Rundy",
    finale: "Finał",
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
    frameMode: "Tryb ramki",
    frameModeClassic: "Klasyczna",
    frameModeMinimal: "Minimalna",
    preview: "Podgląd wyświetlacza",
  },
  questions: {
    modeRandom: "Losowe",
    modeOrdered: "Ustalona kolejność",
    countPerRound: "Pytań per runda",
    roundsCount: "Liczba rund",
    addQuestion: "+ Dodaj pytanie z puli",
    finaleTitle: "Pytania finałowe",
    finaleModeRandom: "Losowe z puli",
    finaleModeSelected: "Ustalone",
    finaleCount: "Liczba pytań finałowych",
    addFinaleQuestion: "+ Dodaj pytanie finałowe",
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
4. **Kategoria Wygląd** — logo dropdown + preview div (bez iframe)
5. **Kategoria Dźwięk** — port z sfx-advanced-section + zmiana klucza IndexedDB w sfx-new.js
6. **Kategoria Pytania** — Rundy + Finał (najbardziej złożona)
7. **Zapis + dirty tracking** — `isDirty`, `beforeunload`, pasek dolny
8. **builder-new.js** — przycisk ⚙ na kartach
9. **control-new** — usunięcie kroków + `loadSettings` na starcie

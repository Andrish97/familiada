# Plan wdrożenia — Zaawansowane ustawienia dźwięku

## Cel

Dodanie sekcji "Zaawansowane" w zakładce Dźwięk panelu kontrolnego.
Umożliwia: wybór wariantu dźwięku z listy wbudowanych, podgląd, regulację
głośności (do wyłączenia), podmianę własnym plikiem, zapis w chmurze
(tylko zalogowani).

---

## Struktura plików audio

### Foldery zamiast pojedynczych plików

```
audio/
  sounds.json                   ← manifest wszystkich kategorii i wariantów
  buzzer_press/
    default.mp3
    soft.mp3
    ...
  answer_correct/
    default.mp3
    chime.mp3
    ...
  answer_wrong/
    default.mp3
    ...
  answer_repeat/
    default.mp3
    ...
  bells/
    default.mp3
    ...
  time_over/
    default.mp3
    ...
  round_transition/
    default.mp3
    ...
  round_transition2/
    default.mp3
    ...
  final_theme/
    default.mp3
    ...
  show_intro/
    default.mp3
    ...
```

### Format `audio/sounds.json`

```json
{
  "categories": [
    {
      "key": "buzzer_press",
      "folder": "buzzer_press",
      "limitSec": 5,
      "sounds": [
        {
          "file": "default.mp3",
          "label": { "pl": "Domyślny", "en": "Default", "uk": "Типовий" }
        },
        {
          "file": "soft.mp3",
          "label": { "pl": "Miękki", "en": "Soft", "uk": "М'який" }
        }
      ]
    },
    {
      "key": "answer_correct",
      "folder": "answer_correct",
      "limitSec": 5,
      "sounds": [
        {
          "file": "default.mp3",
          "label": { "pl": "Domyślny", "en": "Default", "uk": "Типовий" }
        }
      ]
    }
    // ... pozostałe kategorie analogicznie
  ]
}
```

`sfx.js` wczytuje manifest raz przy starcie i buduje ścieżki jako
`audio/{folder}/{file}`. Aktywny wariant per kategoria zapisywany w
localStorage `sfx_variant_{key}` (wartość: nazwa pliku, np. `"soft.mp3"`).

---

## Zasady przechowywania

| Stan | IndexedDB | Supabase bucket |
|---|---|---|
| Gość | ✓ (własne pliki) | ✗ (brak checkboxa) |
| Zalogowany, nie zapisał | ✓ | ✗ |
| Zalogowany, kliknął "Zapisz" | ✓ | ✓ (sync) |
| Przywróć domyślne | czyszczone | czyszczone |

- Głośności i wybrane warianty: zawsze localStorage, per urządzenie
- Przy starcie z `sfx_save_cloud=true`: ładuj z bucketu (ignoruj IndexedDB dla podmienionych)
- Odznaczenie checkboxa: usuwa z bucketu, zostaje lokalna kopia

---

## Limity czasu plików (walidacja uploadów użytkownika)

| Kategorie | Limit |
|---|---|
| `buzzer_press`, `answer_correct`, `answer_wrong`, `answer_repeat`, `bells`, `time_over` | **5s** |
| `round_transition`, `round_transition2`, `final_theme`, `show_intro` | **30s** |

Limity pochodzą z `sounds.json` (`limitSec`). Walidacja przez
`AudioContext.decodeAudioData`. Przekroczenie → `alertModal`.

---

## Pliki do zmiany / stworzenia

### 1. `audio/sounds.json` (nowy)

Manifest jak powyżej. Na start każda kategoria ma jeden wariant `default.mp3`.
Kolejne warianty dokładane jako nowe pliki w folderze + wpis w JSON.

---

### 2. `supabase/migrations/2026-05-31_205_user_sounds_bucket.sql` (nowy)

Bucket `user-sounds`:
- prywatny (`public: false`)
- limit pliku: 2MB
- dozwolone typy: `audio/mpeg`, `audio/wav`, `audio/ogg`
- ścieżka: `{user_id}/{sfx_key}.mp3`

RLS (wzór z `user-logos`):
- SELECT: tylko właściciel (`auth.uid() == folder[1]`)
- INSERT: tylko authenticated, folder musi być `{uid}/`
- UPDATE/DELETE: tylko właściciel

---

### 3. `js/core/sfx.js` — rozszerzenie

**Nowe funkcje eksportowane:**

- `loadSfxManifest()` → fetch `audio/sounds.json`, cache manifest, zwraca tablicę kategorii
- `getSfxCategories()` → zwraca załadowany manifest (po `loadSfxManifest`)
- `setSfxVariant(key, file)` → ustawia aktywny wariant, ładuje `Audio` z `audio/{folder}/{file}`, zapisuje do localStorage `sfx_variant_{key}`
- `getSfxVariant(key)` → czyta z localStorage, fallback `"default.mp3"`
- `setSfxVolume(key, v)` → ustawia `audio.volume`, zapisuje do localStorage `sfx_vol_{key}`
- `getSfxVolumes()` → `Map<key, number>` z localStorage
- `resetSfxVolumes()` → czyści `sfx_vol_*` z localStorage, wraca do 1.0
- `resetSfxVariants()` → czyści `sfx_variant_*` z localStorage, wczytuje `default.mp3`
- `setSfxCustomBlob(key, blob, filename)` → tworzy blob URL, podmienia cache dla klucza, zapisuje do IndexedDB; **nadpisuje wybrany wariant** (custom ma priorytet)
- `getSfxCustomFiles()` → `Map<key, {blob, filename}>` z IndexedDB
- `clearSfxCustomFile(key)` → revoke blob URL, usuwa z IndexedDB, wraca do aktywnego wariantu (`getSfxVariant`)
- `clearAllSfxCustomFiles()` → dla wszystkich kluczy `clearSfxCustomFile`
- `loadSfxFromCloud(urlMap)` → `Map<key, url>` → podmienia źródła na cloud URL (bez IndexedDB)
- `applySfxVolumes()` → odczytuje localStorage, aplikuje na wszystkie Audio

IndexedDB: baza `familiada-sfx`, store `custom-files`, klucz = `key`, wartość = `{blob, filename}`.

---

### 4. `js/core/sfx-cloud.js` (nowy)

```js
const BUCKET = "user-sounds";

export async function uploadSoundToCloud(userId, key, blob)
export async function deleteSoundFromCloud(userId, key)
export async function deleteAllSoundsFromCloud(userId)
export async function listCloudSounds(userId)   // → Map<key, url>
export function getSfxSaveFlag()                // localStorage "sfx_save_cloud" === "1"
export function setSfxSaveFlag(v)
```

---

### 5. `control-new.html` — sekcja Zaawansowane

Poniżej istniejącej karty z odblokowaniem:

```html
<div class="card sfx-advanced-card">
  <div class="cardBody">
    <button class="sfx-advanced-toggle" id="btnSfxAdvanced" type="button">
      <span class="sfx-toggle-arrow">▶</span>
      <span data-i18n="control.sfxAdvanced">Zaawansowane</span>
    </button>

    <div class="sfx-advanced-body hidden" id="sfxAdvancedBody">
      <div class="sfx-table" id="sfxTable">
        <!-- wiersze generowane dynamicznie przez JS -->
      </div>

      <div class="sfx-advanced-foot">
        <button class="btn" id="btnSfxReset" type="button"
          data-i18n="control.sfxResetAll">Przywróć domyślne</button>

        <!-- ukryte dla gościa -->
        <label class="sfx-save-check" id="sfxSaveWrap">
          <input type="checkbox" id="chkSfxSave"/>
          <span data-i18n="control.sfxSaveCloud">Zapisz w chmurze</span>
        </label>
        <button class="btn gold hidden" id="btnSfxSave" type="button"
          data-i18n="control.sfxSaveBtn">Zapisz</button>
      </div>
    </div>
  </div>
</div>
```

Struktura wiersza (generowana przez JS):

```html
<div class="sfx-row" data-key="answer_correct">
  <div class="sfx-row-desc">Poprawna odpowiedź</div>

  <!-- UI select: lista wbudowanych wariantów -->
  <div class="sfx-variant-wrap">
    <div class="ui-select" data-sfx-variant="answer_correct">
      <!-- opcje generowane z sounds.json -->
    </div>
  </div>

  <!-- Podgląd -->
  <button class="sfx-preview-btn" type="button" title="Podgląd">🔊</button>

  <!-- Głośność -->
  <div class="sfx-vol-wrap">
    <input type="range" class="sfx-vol" min="0" max="100" value="100"/>
    <span class="sfx-vol-label">100%</span>
  </div>

  <!-- Własny plik użytkownika -->
  <div class="sfx-file-wrap">
    <button class="btn sfx-add-btn" type="button"
      data-i18n="control.sfxAddFile">Własny plik</button>
    <input type="file" class="sfx-file-input hidden"
      accept="audio/mpeg,audio/wav,audio/ogg"/>
    <div class="sfx-file-tag hidden">
      <span class="sfx-file-name">nazwa.mp3</span>
      <button class="sfx-file-remove" type="button" title="Usuń">✕</button>
    </div>
  </div>
</div>
```

Kiedy użytkownik ma wczytany własny plik: `ui-select` jest wyszarzony
(`disabled`), a "Własny plik" pokazuje ramkę z nazwą pliku i przyciskiem ✕.
Usunięcie własnego pliku przywraca aktywność `ui-select` i wgrywa wybrany wariant.

---

### 6. `control-new/js/app.js` — logika

**Na starcie (`main()`):**
```
await loadSfxManifest()
applySfxVolumes()
for each category: setSfxVariant(key, getSfxVariant(key))   // wczytaj zapisany wariant
if (zalogowany && getSfxSaveFlag()):
    urls = await listCloudSounds(userId)
    loadSfxFromCloud(urls)
else:
    files = await getSfxCustomFiles()
    for each: setSfxCustomBlob(key, blob, filename)
buildSfxTable()
sfxSaveWrap.hidden = guestMode
```

**`buildSfxTable()`:**
Iteruje `getSfxCategories()`, dla każdej kategorii buduje wiersz z:
- opisem: `t("control.sfxDesc." + key)`
- `ui-select` z listą wariantów z `sounds.json` (zainicjowany na `getSfxVariant(key)`)
- suwakiem głośności z wartością z `getSfxVolumes()`
- stanem pliku na podstawie `getSfxCustomFiles()`

**Handlery:**

| Zdarzenie | Akcja |
|---|---|
| `ui-select` zmiana wariantu | `setSfxVariant(key, file)` |
| suwak `input` | `setSfxVolume(key, val/100)`, aktualizuj etykietę `${val}%` |
| 🔊 `click` | `playSfx(key)` |
| "Własny plik" `click` | trigger `sfxFileInput.click()` |
| `file input change` | decode → sprawdź `buf.duration > limitSec` → za długi: `alertModal` → else: `setSfxCustomBlob`, zablokuj `ui-select`, pokaż ramkę |
| ✕ `click` | `clearSfxCustomFile(key)`, odblokuj `ui-select`, pokaż "Własny plik" |
| toggle "Zaawansowane" | toggle `.hidden` na `sfxAdvancedBody`, obróć strzałkę |
| `chkSfxSave change` | odznaczono: `deleteAllSoundsFromCloud` + `setSfxSaveFlag(false)` + ukryj "Zapisz"; zaznaczono: pokaż "Zapisz" |
| "Zapisz" `click` | dla każdego z IndexedDB: `uploadSoundToCloud` → `setSfxSaveFlag(true)`, ukryj "Zapisz" |
| "Przywróć domyślne" `click` | `confirmModal` → `clearAllSfxCustomFiles()` + `deleteAllSoundsFromCloud()` + `resetSfxVolumes()` + `resetSfxVariants()` + `setSfxSaveFlag(false)` + rebuild tabeli |

---

### 7. `control-new/control.css`

```css
.sfx-advanced-toggle     /* flex, gap, cursor pointer */
.sfx-toggle-arrow        /* transition rotate 0→90deg gdy open */
.sfx-advanced-body       /* padding-top: 12px */
.sfx-table               /* flex-direction: column; gap: 6px */
.sfx-row                 /* grid: desc | variant-select | preview | vol | file;
                            align-items: center; gap: 10px; padding: 6px 0 */
.sfx-row-desc            /* font-size: .85rem */
.sfx-variant-wrap        /* flex; min-width: 120px */
.sfx-preview-btn         /* btn-icon, małe */
.sfx-vol-wrap            /* flex; align-items: center; gap: 6px */
.sfx-vol                 /* input range, szer. 90px */
.sfx-vol-label           /* font-size: .8rem; min-width: 36px; text-align: right */
.sfx-file-tag            /* flex; border, border-radius, padding, background */
.sfx-file-name           /* max-width: 110px; overflow: hidden; text-overflow: ellipsis */
.sfx-file-remove         /* btn-icon, małe, ✕ */
.sfx-advanced-foot       /* flex; gap: 12px; flex-wrap: wrap; margin-top: 14px;
                            padding-top: 12px; border-top */
.sfx-save-check          /* flex; align-items: center; gap: 6px; font-size: .85rem */
```

---

### 8. Tłumaczenia

Nowe klucze `control.*`:

| klucz | pl | en | uk |
|---|---|---|---|
| `sfxAdvanced` | Zaawansowane | Advanced | Розширені |
| `sfxAddFile` | Własny plik | Custom file | Власний файл |
| `sfxSaveCloud` | Zapisz w chmurze | Save to cloud | Зберегти в хмарі |
| `sfxSaveBtn` | Zapisz | Save | Зберегти |
| `sfxResetAll` | Przywróć domyślne | Restore defaults | Відновити типові |
| `sfxTooLongTitle` | Plik za długi | File too long | Файл занадто довгий |
| `sfxTooLong` | Maksymalna długość to {limit}s | Maximum length is {limit}s | Максимальна тривалість — {limit}с |

Nowe klucze `control.sfxDesc.*`:

| klucz | pl | en | uk |
|---|---|---|---|
| `show_intro` | Muzyka intro programu | Show intro music | Вступна музика програми |
| `round_transition` | Przejście między rundami | Round transition | Перехід між раундами |
| `round_transition2` | Przejście między rundami (wariant) | Round transition (variant) | Перехід між раундами (варіант) |
| `final_theme` | Muzyka finału | Final theme music | Музика фіналу |
| `buzzer_press` | Naciśnięcie buzzera | Buzzer press | Натискання кнопки |
| `answer_correct` | Poprawna odpowiedź | Correct answer | Правильна відповідь |
| `answer_wrong` | Błędna odpowiedź (X) | Wrong answer (X) | Неправильна відповідь (X) |
| `answer_repeat` | Powtórzenie odpowiedzi w finale | Repeat answer (final) | Повторення відповіді у фіналі |
| `time_over` | Koniec czasu w finale | Time's up (final) | Час вийшов (фінал) |
| `bells` | Przejście wyniku na tablicę drużyny | Score transfer to team board | Перенесення rахунку на табло |

---

## Kolejność implementacji

1. `audio/sounds.json` + foldery (na razie `default.mp3` per kategoria — same wpisy w JSON, pliki już istnieją w `audio/`)
2. `js/core/sfx.js` — rozszerzenie: manifest, warianty, głośności, blob URL, IndexedDB
3. `js/core/sfx-cloud.js` — nowy
4. `supabase/migrations/2026-05-31_205_user_sounds_bucket.sql`
5. Tłumaczenia (pl / en / uk)
6. `control-new.html` — sekcja Zaawansowane
7. `control-new/control.css` — style
8. `control-new/js/app.js` — `buildSfxTable()` + handlery

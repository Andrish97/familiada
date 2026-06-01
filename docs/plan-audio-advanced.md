# Plan wdrożenia — Zaawansowane ustawienia dźwięku

## Cel

Dodanie sekcji "Zaawansowane" w zakładce Dźwięk panelu kontrolnego.
Umożliwia: podgląd dźwięków, regulację głośności (do wyłączenia), podmianę
własnym plikiem, zapis ustawień w chmurze (tylko zalogowani).

---

## Zasady przechowywania

| Stan | IndexedDB | Supabase bucket |
|---|---|---|
| Gość | ✓ (własne pliki) | ✗ (brak checkboxa) |
| Zalogowany, nie zapisał | ✓ | ✗ |
| Zalogowany, kliknął "Zapisz" | ✓ | ✓ (sync) |
| Przywróć domyślne | czyszczone | czyszczone |

- Głośności: zawsze localStorage, per urządzenie
- Przy starcie z `sfx_save_cloud=true`: ładuj z bucketu (ignoruj IndexedDB dla podmienionch)
- Odznaczenie checkboxa: usuwa z bucketu, zostaje lokalna kopia

---

## Limity czasu plików

| Dźwięki | Limit |
|---|---|
| `buzzer_press`, `answer_correct`, `answer_wrong`, `answer_repeat`, `bells`, `time_over` | **5s** |
| `round_transition`, `round_transition2`, `final_theme`, `show_intro` | **30s** |

Walidacja przez `AudioContext.decodeAudioData`. Przekroczenie → `alertModal`.

---

## Pliki do zmiany / stworzenia

### 1. `supabase/migrations/2026-05-31_205_user_sounds_bucket.sql` (nowy)

Bucket `user-sounds`:
- prywatny (`public: false`)
- limit pliku: 2MB
- dozwolone typy: `audio/mpeg`, `audio/wav`, `audio/ogg`
- ścieżka: `{user_id}/{sfx_key}.mp3`

RLS (wzór z `user-logos`):
- SELECT: tylko właściciel (`auth.uid() == folder[1]`)
- INSERT: tylko authenticated, folder musi być `{uid}/`
- UPDATE/DELETE: tylko właściciel
- Indeks na `bucket_id + folder[1]`

---

### 2. `js/core/sfx.js` — rozszerzenie

Nowe stałe:
```js
const SFX_LIMITS = {
  buzzer_press: 5, answer_correct: 5, answer_wrong: 5,
  answer_repeat: 5, bells: 5, time_over: 5,
  round_transition: 30, round_transition2: 30,
  final_theme: 30, show_intro: 30,
};
```

Nowe funkcje eksportowane:
- `getSfxLimits()` → zwraca `SFX_LIMITS`
- `setSfxVolume(name, v)` → ustawia `audio.volume`, zapisuje do localStorage `sfx_vol_{name}`
- `getSfxVolumes()` → `Map<name, number>` z localStorage
- `resetSfxVolumes()` → czyści klucze `sfx_vol_*` z localStorage, wraca do 1.0 na wszystkich Audio
- `setSfxCustomBlob(name, blob, filename)` → tworzy blob URL, podmiena cache, zapisuje do IndexedDB
- `getSfxCustomFiles()` → `Map<name, {blob, filename}>` z IndexedDB
- `clearSfxCustomFile(name)` → revoke blob URL, usuwa z IndexedDB, przywraca domyślne źródło
- `clearAllSfxCustomFiles()` → dla wszystkich kluczy `clearSfxCustomFile`
- `loadSfxFromCloud(urlMap)` → `Map<name, url>` → podmiena źródła Audio na cloud URL (bez IndexedDB)
- `applySfxVolumes()` → odczytuje localStorage, aplikuje na wszystkie Audio

Modyfikacja `playSfx(name)`: respektuje aktualny `audio.volume` (już pośrednio działa przez `setSfxVolume`).

IndexedDB: baza `familiada-sfx`, store `custom-files`, klucz = `name`, wartość = `{blob, filename}`.

---

### 3. `js/core/sfx-cloud.js` (nowy)

Izolacja logiki Supabase Storage:

```js
const BUCKET = "user-sounds";

export async function uploadSoundToCloud(userId, key, blob)
// sb().storage.from(BUCKET).upload(`${userId}/${key}.mp3`, blob, { upsert: true })

export async function deleteSoundFromCloud(userId, key)
// sb().storage.from(BUCKET).remove([`${userId}/${key}.mp3`])

export async function deleteAllSoundsFromCloud(userId)
// sb().storage.from(BUCKET).list(userId + "/") → remove wszystkich

export async function listCloudSounds(userId)
// list + getPublicUrl/createSignedUrl → Map<key, url>

export function getSfxSaveFlag()   // localStorage "sfx_save_cloud" === "1"
export function setSfxSaveFlag(v)  // localStorage "sfx_save_cloud" = v ? "1" : "0"
```

---

### 4. `control.html` — sekcja Zaawansowane

Poniżej istniejącej karty z odblokowaniem — nowa karta:

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

Struktura wiersza tabeli (generowana przez JS):
```html
<div class="sfx-row" data-key="answer_correct">
  <div class="sfx-row-desc">Poprawna odpowiedź</div>
  <button class="sfx-preview-btn" type="button" title="Podgląd">🔊</button>
  <div class="sfx-vol-wrap">
    <input type="range" class="sfx-vol" min="0" max="100" value="100"/>
    <span class="sfx-vol-label">100%</span>
  </div>
  <div class="sfx-file-wrap">
    <!-- Stan A: brak własnego pliku -->
    <button class="btn sfx-add-btn" type="button"
      data-i18n="control.sfxAddFile">Dodaj</button>
    <input type="file" class="sfx-file-input hidden"
      accept="audio/mpeg,audio/wav,audio/ogg"/>
    <!-- Stan B: własny plik (toggle .hidden) -->
    <div class="sfx-file-tag hidden">
      <span class="sfx-file-name">nazwa.mp3</span>
      <button class="sfx-file-remove" type="button" title="Usuń">✕</button>
    </div>
  </div>
</div>
```

---

### 5. `control/js/app.js` — logika

**Na starcie (`main()`):**
```
applySfxVolumes()
if (zalogowany && getSfxSaveFlag()):
    urls = await listCloudSounds(userId)
    loadSfxFromCloud(urls)
else:
    files = await getSfxCustomFiles()
    for each: setSfxCustomBlob(name, blob, filename)
buildSfxTable()
sfxSaveWrap.style.display = guestMode ? "none" : ""
```

**`buildSfxTable()`:**
Iteruje `Object.keys(SFX_LIMITS)`, dla każdego tworzy wiersz z:
- opisem: `t("control.sfxDesc." + key)`
- suwakiem z wartością z `getSfxVolumes()`
- stanem pliku na podstawie `getSfxCustomFiles()`

**Handlery:**
| Zdarzenie | Akcja |
|---|---|
| suwak `input` | `setSfxVolume(name, val/100)`, aktualizuj etykietę `${val}%` |
| 🔊 `click` | `playSfx(name)` |
| "Dodaj" `click` | trigger `sfxFileInput.click()` |
| `file input change` | decode → sprawdź długość → za długi: `alertModal` → else: `setSfxCustomBlob`, pokaż ramkę, ukryj "Dodaj" |
| ✕ `click` | `clearSfxCustomFile(name)`, ukryj ramkę, pokaż "Dodaj" |
| toggle "Zaawansowane" | toggle `.hidden` na `sfxAdvancedBody`, obróć strzałkę |
| `chkSfxSave change` | jeśli odznaczono: `deleteAllSoundsFromCloud`, `setSfxSaveFlag(false)`, ukryj "Zapisz"; jeśli zaznaczono: pokaż "Zapisz" |
| "Zapisz" `click` | dla każdego z IndexedDB: `uploadSoundToCloud` → `setSfxSaveFlag(true)`, ukryj "Zapisz" |
| "Przywróć domyślne" `click` | `confirmModal` → `clearAllSfxCustomFiles()` + `deleteAllSoundsFromCloud()` + `resetSfxVolumes()` + `setSfxSaveFlag(false)` + rebuild tabeli |

**Walidacja pliku:**
```js
const ctx = new AudioContext();
const buf = await ctx.decodeAudioData(await file.arrayBuffer());
const limit = SFX_LIMITS[name];
if (buf.duration > limit) {
  alertModal({ title: t("control.sfxTooLongTitle"), text: t("control.sfxTooLong", { limit }) });
  return;
}
```

---

### 6. `control/control.css`

```css
.sfx-advanced-toggle          /* flex, gap, cursor pointer, styl jak nagłówek sekcji */
.sfx-toggle-arrow             /* transition rotate 0→90deg gdy open */
.sfx-advanced-body            /* padding-top: 12px */
.sfx-table                    /* display: flex; flex-direction: column; gap: 6px */
.sfx-row                      /* display: grid; grid-template-columns: 1fr auto auto auto;
                                  align-items: center; gap: 10px; padding: 6px 0 */
.sfx-row-desc                 /* font-size: .85rem */
.sfx-preview-btn              /* btn-icon, małe */
.sfx-vol-wrap                 /* display: flex; align-items: center; gap: 6px */
.sfx-vol                      /* input range, szer. 90px */
.sfx-vol-label                /* font-size: .8rem; min-width: 36px; text-align: right */
.sfx-file-tag                 /* flex; border: 1px solid rgba(255,255,255,.2);
                                  border-radius: 8px; padding: 3px 8px;
                                  background: rgba(0,0,0,.15); gap: 6px */
.sfx-file-name                /* max-width: 110px; overflow: hidden;
                                  text-overflow: ellipsis; white-space: nowrap;
                                  font-size: .8rem */
.sfx-file-remove              /* btn-icon, małe, ✕ */
.sfx-advanced-foot            /* display: flex; align-items: center; gap: 12px;
                                  flex-wrap: wrap; margin-top: 14px; padding-top: 12px;
                                  border-top: 1px solid rgba(255,255,255,.1) */
.sfx-save-check               /* flex; align-items: center; gap: 6px; font-size: .85rem */
```

---

### 7. Tłumaczenia

Nowe klucze `control.*` (pl / en / uk):

| klucz | pl | en | uk |
|---|---|---|---|
| `sfxAdvanced` | Zaawansowane | Advanced | Розширені |
| `sfxAddFile` | Dodaj | Add | Додати |
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
| `bells` | Przejście wyniku na tablicę drużyny | Score transfer to team board | Перенесення рахунку на табло |

---

## Kolejność implementacji

1. `supabase/migrations/2026-05-31_205_user_sounds_bucket.sql`
2. `js/core/sfx.js` — rozszerzenie (IndexedDB, głośności, blob URL)
3. `js/core/sfx-cloud.js` — nowy (Supabase Storage)
4. Tłumaczenia (pl / en / uk)
5. `control.html` — HTML sekcji Zaawansowane
6. `control/control.css` — style
7. `control/js/app.js` — `buildSfxTable()` + wszystkie handlery

# Plan wdrożenia dźwięku per-gra — aktualny

**Ostatnia aktualizacja:** 2026-07-13

---

## Stan obecny (co jest gotowe)

| Element | Status |
|---|---|
| `audio_new/` + `sounds.json` (10 kategorii, `classic.mp3`) | ✅ gotowe |
| `js/core/sfx-new.js` (manifest, warianty, głośności, IndexedDB per-game) | ✅ gotowe |
| `game-settings.html` — panel Dźwięk (ui-select wariantów, upload, preview, głośność) | ✅ gotowe |
| `css/game-settings.css` — style sfx | ✅ gotowe |
| `js/pages/game-settings.js` — `renderSound()` | ✅ gotowe |
| Bucket `user-sounds` w Supabase (migracja 205) | ✅ gotowe (ścieżka do zmiany) |
| `js/core/sfx-cloud.js` | ❌ nie istnieje |
| Zapis do DB przy "Zapisz wszystko" w game-settings | ❌ brak obsługi custom files (bucket) |
| X usuwa plik z bucketu | ❌ tylko IndexedDB |
| Przywróć domyślne usuwa z bucketu | ❌ tylko IndexedDB |
| `control-new/` używa `sfx-new.js` | ❌ używa starego `sfx.js` |
| `control-new/js/app.js` — init sfx-new przy starcie gry | ❌ |
| Streszczenie dźwięku w podsumowaniu (`control-new.html`) | ❌ |

---

## Cel końcowy — przepływ

```
[game-settings] użytkownik wybiera wariant / wgrywa plik → Zapisz →
  → custom files: IndexedDB + upload do bucket user-sounds/{uid}/{game_id}/{key}
  → variants + volumes: games.settings.sound → DB
  → X: delete z bucketu + update localSettings
  → Przywróć domyślne: delete all z bucketu + reset

[control-new] operator otwiera grę →
  → loadGame() → game.settings.sound z DB
  → applySfxGameSettings(sound) → localStorage warianty/głośności
  → initSfx() → cache /audio_new/{folder}/{variant}
  → dla kluczy z variant==="__custom__": signed URL z bucketu → loadSfxFromCloud()
  → playSfx("bells") → odtwarza właściwy plik z cache
```

---

## Co NIE jest zmieniane

- `control/` (stary panel) — bez żadnych zmian
- `sfx.js` — bez żadnych zmian
- `audio/` — bez żadnych zmian
- Interfejs publiczny `sfx-new.js` (`playSfx`, `createSfxMixer`, `getSfxDuration`, `unlockAudio`) — identyczny jak w `sfx.js`

---

## Krok 1 — Migracja SQL: ścieżka bucketu per-game

**Plik:** `supabase/migrations/2026-07-13_214_user_sounds_per_game.sql`

Bucket `user-sounds` już istnieje. Zmiana: RLS aktualizowane tak, żeby ścieżka wymagana to `{uid}/{game_id}/{sfx_key}` (zamiast starego `{uid}/{sfx_key}`).

```sql
-- Usuń stare polityki
DROP POLICY IF EXISTS "user-sounds-select" ON storage.objects;
DROP POLICY IF EXISTS "user-sounds-insert" ON storage.objects;
DROP POLICY IF EXISTS "user-sounds-update" ON storage.objects;
DROP POLICY IF EXISTS "user-sounds-delete" ON storage.objects;

-- Nowe polityki: (storage.foldername(name))[1] = uid, (foldername)[2] = game_id
CREATE POLICY "user-sounds-select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "user-sounds-insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "user-sounds-update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "user-sounds-delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Ścieżka pliku: `{uid}/{game_id}/{sfx_key}` (bez rozszerzenia — Supabase Storage przechowuje surowy blob, typ z MIME).

---

## Krok 2 — `js/core/sfx-cloud.js` (nowy)

```js
// js/core/sfx-cloud.js
const BUCKET = "user-sounds";

// path: {userId}/{gameId}/{key}
function path(userId, gameId, key) {
  return `${userId}/${gameId}/${key}`;
}

export async function uploadGameSound(sb, userId, gameId, key, blob) {
  const p = path(userId, gameId, key);
  // upsert = true — nadpisz jeśli istnieje
  const { error } = await sb.storage.from(BUCKET).upload(p, blob, { upsert: true, contentType: blob.type || "audio/mpeg" });
  if (error) throw error;
}

export async function deleteGameSound(sb, userId, gameId, key) {
  const { error } = await sb.storage.from(BUCKET).remove([path(userId, gameId, key)]);
  if (error) throw error;
}

export async function deleteAllGameSounds(sb, userId, gameId, keys) {
  // keys = tablica kluczy sfx, np. ["bells","answer_correct",...]
  const paths = keys.map(k => path(userId, gameId, k));
  const { error } = await sb.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

export async function getGameSoundSignedUrl(sb, userId, gameId, key, expiresIn = 3600) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path(userId, gameId, key), expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function listGameSounds(sb, userId, gameId, keys) {
  // Pobiera signed URLs tylko dla podanych kluczy (gdzie variant === "__custom__")
  // Zwraca Map<key, signedUrl>
  const result = new Map();
  await Promise.all(keys.map(async key => {
    try {
      const url = await getGameSoundSignedUrl(sb, userId, gameId, key);
      result.set(key, url);
    } catch {}
  }));
  return result;
}
```

---

## Krok 3 — `sfx-new.js` — poprawka `applySfxGameSettings`

Aktualnie ustawia `sfx_variant_{key} = "__custom__"` co powoduje że `initSfx()` próbuje załadować plik `__custom__.mp3`. Guard:

```js
export function applySfxGameSettings({ volumes = {}, variants = {} } = {}) {
  for (const [key, pct] of Object.entries(volumes)) {
    if (typeof pct === "number") setSfxVolume(key, pct / 100);
  }
  for (const [key, file] of Object.entries(variants)) {
    // __custom__ nie jest wariantem z dysku — pomijamy, plik ładowany z bucketu osobno
    if (file && file !== "__custom__") localStorage.setItem(`sfx_variant_${key}`, file);
  }
}
```

---

## Krok 4 — `game-settings.js` — zapis/usuwanie z bucketu

### 4a. Zapis przy "Zapisz wszystko"

`saveSettings()` już zapisuje `localSettings` do `games.settings` w DB.
Rozszerzenie o obsługę bucketu:

```js
// W saveSettings(), po sukcesie zapisu do DB:
const { data: { user } } = await sb().auth.getUser();
const userId = user?.id;
if (userId && gameId) {
  for (const [key, variant] of Object.entries(localSettings.sound.variants)) {
    if (variant === VARIANT_CUSTOM) {
      const custom = customFiles.get(key);  // z IndexedDB
      if (custom?.blob) {
        await uploadGameSound(sb(), userId, gameId, key, custom.blob);
      }
    } else {
      // Jeśli wcześniej był custom (sprawdź w DB przed zapisem) — usuń z bucketu
      // Wystarczy próba usunięcia (ignoruj błąd 404)
      try { await deleteGameSound(sb(), userId, gameId, key); } catch {}
    }
  }
}
```

### 4b. X (`[data-sfx-clear]`) — usuwa plik z bucketu

```js
btn.addEventListener("click", async () => {
  const key = btn.dataset.sfxClear;
  // IndexedDB
  try { await clearSfxCustomFile(key, gameId); } catch {}
  // Bucket
  const { data: { user } } = await sb().auth.getUser();
  if (user?.id) {
    try { await deleteGameSound(sb(), user.id, gameId, key); } catch {}
  }
  customFiles.delete(key);
  delete localSettings.sound.variants[key];
  markDirty();
  // ... in-place DOM update (bez re-renderu)
});
```

### 4c. Przywróć domyślne (`btnSoundReset`)

```js
btnSoundReset.addEventListener("click", async () => {
  if (!await confirmModal(...)) return;
  localSettings.sound = { volumes: {}, variants: {} };
  try { await clearAllSfxCustomFiles(gameId); } catch {}
  // Bucket: usuń wszystkie custom files tej gry
  const { data: { user } } = await sb().auth.getUser();
  if (user?.id) {
    const customKeys = [...customFiles.keys()];
    if (customKeys.length > 0) {
      try { await deleteAllGameSounds(sb(), user.id, gameId, customKeys); } catch {}
    }
  }
  markDirty();
  renderSound();
});
```

---

## Krok 5 — `control-new/` — zmiana importu sfx

**Pliki do zmiany:** `control-new/js/gameRounds.js`, `control-new/js/gameFinal.js`, `control-new/js/app.js`

Tylko zmiana importu — interfejs identyczny:

```js
// PRZED:
import { playSfx, createSfxMixer, getSfxDuration } from "../../js/core/sfx.js?v=...";
// PO:
import { playSfx, createSfxMixer, getSfxDuration } from "../../js/core/sfx-new.js?v=...";
```

Brak żadnych zmian w logice wywołań `playSfx(...)`.

---

## Krok 6 — `control-new/js/app.js` — inicjalizacja sfx-new przy starcie

Dodać import i blok inicjalizacji w `main()`, po `applyGameSettingsToStore()`:

```js
import { setCurrentGameId, loadSfxManifest, initSfx, applySfxGameSettings, loadSfxFromCloud } from "../../js/core/sfx-new.js?v=...";
import { listGameSounds } from "../../js/core/sfx-cloud.js?v=...";

// W main(), po applyGameSettingsToStore():
setCurrentGameId(game.id);
await loadSfxManifest();

const soundSettings = game.settings?.sound;
if (soundSettings) {
  applySfxGameSettings(soundSettings);  // ustawia localStorage warianty/głośności
}

await initSfx();  // ładuje warianty do cache z /audio_new/

// Załaduj custom files z bucketu
const customKeys = Object.entries(soundSettings?.variants ?? {})
  .filter(([, v]) => v === "__custom__")
  .map(([k]) => k);

if (customKeys.length > 0) {
  try {
    const urlMap = await listGameSounds(sb(), currentUser.id, game.id, customKeys);
    loadSfxFromCloud(urlMap);
  } catch {}
}
```

---

## Krok 7 — Streszczenie dźwięku w podsumowaniu

### 7a. `control-new.html` — nowa sekcja po sekcji Wygląd

```html
<div class="summarySection" id="summarySoundSection">
  <div class="summarySectionTitle" data-i18n="control.summarySound">Dźwięk</div>
  <div id="summarySoundList" class="summarySoundList"></div>
</div>
```

Ukryta gdy brak niestandardowych ustawień (`hidden` jeśli wszystko domyślne).

### 7b. CSS (`control-new/control.css`)

```css
.summarySoundList {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: .82rem;
}
.summarySoundRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.summarySoundKey {
  opacity: .55;
  min-width: 140px;
  flex-shrink: 0;
}
.summarySoundVariant {
  font-weight: 700;
}
.summarySoundVol {
  opacity: .6;
}
.summarySoundFile {
  font-style: italic;
  opacity: .7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}
```

### 7c. `control-new/js/app.js` — `renderSetupFinishSummary()`

Po załadowaniu manifestu i ustawień gry:

```js
const soundSection = document.getElementById("summarySoundSection");
const soundList = document.getElementById("summarySoundList");
if (soundList && soundSection) {
  const sound = game.settings?.sound || {};
  const cats = getSfxCategories();  // z sfx-new.js (manifest już załadowany)
  const lang = getUiLang() || "pl";

  // Pokaż tylko gdy jakiekolwiek ustawienie różni się od domyślnego
  const hasCustomSound = cats.some(cat => {
    const vol = sound.volumes?.[cat.key];
    const variant = sound.variants?.[cat.key];
    return (vol !== undefined && vol !== 100) || (variant && variant !== "classic.mp3");
  });

  if (!hasCustomSound) {
    soundSection.hidden = true;
  } else {
    soundSection.hidden = false;
    soundList.innerHTML = cats.map(cat => {
      const key = cat.key;
      const vol = sound.volumes?.[key] ?? 100;
      const variant = sound.variants?.[key] || "classic.mp3";
      const isCustom = variant === "__custom__";
      const desc = t("control.sfxDesc." + key) || key;

      // Etykieta wariantu: z manifestu lub "Własny"
      const variantLabel = isCustom
        ? (t("control.sfxCustom") || "Własny")
        : (cat.sounds.find(s => s.file.split("?")[0] === variant)?.label?.[lang] || variant);

      // Nazwa pliku — dostępna tylko po inicjalizacji (przez IndexedDB) w game-settings
      // W control-new nie mamy dostępu do IndexedDB — pokazujemy tylko fakt że to własny plik
      const volLabel = vol !== 100 ? `<span class="summarySoundVol">${vol}%</span>` : "";
      const fileLabel = isCustom ? `<span class="summarySoundFile">(własny plik)</span>` : "";

      return `
        <div class="summarySoundRow">
          <span class="summarySoundKey">${escapeHtml(desc)}</span>
          <span class="summarySoundVariant">${escapeHtml(String(variantLabel))}</span>
          ${volLabel}
          ${fileLabel}
        </div>`;
    }).join("");
  }
}
```

**Uwaga:** nazwy plików custom (`filename`) są przechowywane w IndexedDB (tylko w game-settings).
W `control-new` dostępna jest tylko informacja że wariant = `"__custom__"`. Jeśli potrzebna jest nazwa pliku w streszczeniu, należy ją dodać do `games.settings.sound` przy zapisie (np. `sound.filenames: { key: "moj-dzwiek.mp3" }`).

### 7d. Tłumaczenia

| klucz | pl | en | uk |
|---|---|---|---|
| `control.summarySound` | Dźwięk | Sound | Звук |

---

## Kolejność implementacji

1. `supabase/migrations/2026-07-13_214_user_sounds_per_game.sql`
2. `js/core/sfx-cloud.js`
3. Poprawka `applySfxGameSettings` w `sfx-new.js`
4. Import `sfx-cloud.js` + obsługa bucketu w `game-settings.js` (zapis, X, reset)
5. Zmiana importu sfx w `control-new/js/gameRounds.js`, `gameFinal.js`, `app.js`
6. Inicjalizacja sfx-new w `control-new/js/app.js` (`main()`)
7. Streszczenie dźwięku: HTML + CSS + JS w `renderSetupFinishSummary()`
8. Tłumaczenia (`control.summarySound`)

---

## Dane w `games.settings.sound`

```json
{
  "sound": {
    "volumes": {
      "bells": 80,
      "answer_correct": 100
    },
    "variants": {
      "bells": "classic.mp3",
      "answer_correct": "__custom__"
    },
    "filenames": {
      "answer_correct": "moj-dzwiek-poprawny.mp3"
    }
  }
}
```

- `volumes[key]` — 0–100 (int), brak = 100
- `variants[key]` — nazwa pliku z `audio_new/` albo `"__custom__"`, brak = `"classic.mp3"`
- `filenames[key]` — oryginalna nazwa wgranego pliku (do wyświetlenia w streszczeniu), opcjonalne

---

## Struktura bucketu

```
user-sounds/
  {owner_id}/
    {game_id}/
      bells
      answer_correct
      answer_wrong
      ...
```

Pliki bez rozszerzenia — typ określany przez MIME przy uploadzie.

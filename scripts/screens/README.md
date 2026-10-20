# Zrzuty stron na danych demo

Pełna instrukcja dla agentów: [`docs/zrzuty-system.md`](../../docs/zrzuty-system.md).

Jedno polecenie robi zrzuty **prawdziwych stron** z `web/` (kod z bieżącego
katalogu roboczego) z bogatymi danymi demo — bez logowania, kont testowych
i produkcyjnej bazy. Podmieniona jest wyłącznie biblioteka Supabase
(`fake-supabase.js`); HTML, CSS i cały JS stron działają bez zmian.

```bash
node scripts/screens/run.cjs --changed            # sceny stron zmienionych względem origin/main (+ niezacommitowane)
node scripts/screens/run.cjs --scenes=games,logos # wybrane sceny
node scripts/screens/run.cjs --all --lang=all     # wszystko w PL/EN/UK
node scripts/screens/run.cjs --list               # lista scen
```

Opcje: `--devices=desktop,phone,tablet,phone-landscape` (domyślnie
`desktop,phone` = 1400 i 390 px), `--lang=pl|en|uk|all`, `--base=<ref>`
dla `--changed`, `--out=<katalog>`, `--strict` (kod wyjścia ≠ 0 przy błędach).

Wynik: `scripts/screens/out/<scena>/<język>-<urządzenie>.png` oraz galeria
`out/index.html` i `out/README.md`. Problemy (błąd JS, niedoczekana gotowość,
zapytanie, którego dane nie znają) są wypisane w konsoli i zaznaczone w galerii.

Z telefonu: GitHub → Actions → **Zrzuty stron** → Run workflow (sceny
`changed`/`all`/lista). Galeria trafia do artefaktu i na gałąź
`screens-gallery` (link w podsumowaniu przebiegu).

Wymagania lokalne: Playwright (`cd tests && npm ci` albo globalny) i Chromium.
Biblioteki z CDN (Fabric, opentype…) runner pobiera raz przez `npm pack`
do `~/.cache/familiada-screens`, bo CDN bywa zablokowany w środowisku agenta.

## Pliki

| Plik | Rola |
|---|---|
| `run.cjs` | runner: wybór scen, zrzuty, galeria |
| `scenes.cjs` | sceny: adres, prefiksy plików (`sources` dla `--changed`), gotowość, kroki (klik zakładki, okno) |
| `fake-supabase.js` | atrapa klienta: tabele (`eq/in/order/…`, osadzenia `answers(...)`, ścieżki JSON `payload->w`), RPC, zapisy w pamięci |
| `data/panel.cjs` | dane kanoniczne ze starych zrzutów (panel admina) — mają pierwszeństwo |
| `data/content.cjs` | dopełnienie list PL/EN/UK: dodatkowe gry, pula pytań, Społeczność, osoby |
| `data/game-state.mjs` | wiersze `game_state` dla Control/Prowadzącego/Wyświetlacza |
| `data/demo.cjs` | `buildDb(lang)`: tabele i RPC z treści (14 gier we wszystkich stanach, 3 bazy z folderami i tagami, znajomi, ankiety z głosami…) |
| `data/logo-sources.cjs` | dodatkowe logo do wypalenia edytorem (TEXT; obsługiwane też DRAW/IMAGE) |
| `bake-logos.cjs` → `data/logos.baked.json` | logo wypalone **prawdziwymi edytorami** (autozapis przechwycony z `update_logo_checked`) |
| `lib.cjs` | wspólne: serwer `web/`, CDN, kontekst przeglądarki z atrapą |

## Przy zmianie strony (zasada dla agentów)

1. Zmieniasz stronę → popraw/dodaj scenę w `scenes.cjs` (nowy stan albo okno =
   nowa scena z `steps`, np. `clickTab("#tab…")`, `openModal("#btn…")`).
2. Runner pisze `brak danych: rpc:nazwa` / `table:nazwa` → dopisz dane w
   `data/demo.cjs` (RPC: wartość albo `"fn:(args, db) => …"` dla odpowiedzi
   zależnych od argumentów; kształt odpowiedzi jak w `supabase/schema.sql`).
3. `node scripts/screens/run.cjs --changed`, obejrzyj PNG, pokaż użytkownikowi.
4. Zmiana źródeł logo albo formatu zapisu edytorów logo →
   `node scripts/screens/bake-logos.cjs`.

Nie dodawać do kodu aplikacji gałęzi „tylko dla zrzutów” — strona ma działać
na atrapie tak samo jak na prawdziwej bazie.

# System zrzutów — instrukcja dla agentów

Zrzuty **prawdziwych stron** z `web/` na bogatych danych demo, w trzech
językach, bez kont, bez bazy i bez ręcznego klikania. Kod: `scripts/screens/`.
Zastępuje panel admina zrzutów (`/settings/` → homepage-screenshots), który
zostanie usunięty po przełączeniu strony głównej na nowe kadry.

## Zasada działania

- Runner (Playwright) serwuje pliki z `web/` z bieżącego katalogu roboczego —
  zrzut pokazuje **twoje niezacommitowane zmiany**.
- Podmieniana jest **wyłącznie biblioteka Supabase** (`fake-supabase.js`):
  tabele z filtrami, osadzeniami i ścieżkami JSON, RPC, zapisy w pamięci.
  HTML, CSS i cały JS stron działają bez zmian.
- **Nigdy** nie dodawaj do kodu aplikacji gałęzi „tylko dla zrzutów”. Jeśli
  strona nie chce się wyrenderować, brakuje danych w atrapie — dopisz je.
  Wyjątek: istniejące tryby aplikacji, z których korzysta też ona sama
  (np. `?preview=1` Wyświetlacza/Prowadzącego, używany przez Control).

## Polecenia

```bash
node scripts/screens/run.cjs --changed             # sceny stron zmienionych względem origin/main (+ niezacommitowane)
node scripts/screens/run.cjs --scenes=games,logos  # wybrane sceny
node scripts/screens/run.cjs --all --lang=all      # wszystko, PL/EN/UK
node scripts/screens/run.cjs --list                # lista scen
node scripts/screens/run.cjs --changed --dry       # tylko pokaż, które sceny by poszły
```

Opcje: `--lang=pl|en|uk|all` (domyślnie `pl`), `--devices=desktop,phone,tablet,phone-landscape`
(domyślnie `desktop,phone` = 1440×900 i 390×844), `--base=<ref>`, `--out=<katalog>`,
`--verbose` (ostrzeżenia i błędy konsoli strony), `--strict` (kod ≠ 0 przy problemach).

Wynik: `scripts/screens/out/<scena>/<język>-<urządzenie>.png` (sceny z własnym
rozmiarem: `<język>.png`), galeria `out/index.html` i `out/README.md`.

Wymagania: Playwright (`cd tests && npm ci` albo globalny) i Chromium. Biblioteki
z CDN (Fabric, opentype…) runner pobiera raz przez `npm pack` do
`~/.cache/familiada-screens`, bo CDN bywa zablokowany w środowisku agenta.

## Jak to jest automatyczne

1. **Agent przy każdej zmianie strony** (zasada w CLAUDE.md/AGENTS.md):
   poprawia scenę/dane, uruchamia `--changed`, ogląda PNG i pokazuje je
   użytkownikowi w odpowiedzi.
2. **GitHub po każdym pushu** zmieniającym `web/**` albo `scripts/screens/**`
   (workflow `screens.yml`): sceny zmienionych stron we wszystkich językach,
   galeria na gałęzi `screens-gallery` (link w podsumowaniu przebiegu) i
   artefakt. Commity CI z `[skip ci]` (wersje `?v=`) go nie uruchamiają.
3. **Ręcznie z telefonu**: Actions → „Zrzuty stron” → Run workflow
   (`changed`, `all` albo lista scen).

`--changed` wybiera sceny po prefiksach plików w `sources` sceny. Zmiana w
`web/shared/`, `web/assets/`, danych demo albo atrapie oznacza wszystkie sceny.

## Sceny (`scenes.cjs`)

| Pole | Znaczenie |
|---|---|
| `id`, `title`, `category` | nazwa katalogu i opis; `homepage: true` = kadr strony głównej |
| `path` | adres strony (`lang=` dopisuje runner) |
| `sources` | prefiksy plików dla `--changed` |
| `ready` | selektor CSS (widoczny) albo funkcja w stronie zwracająca `true` |
| `steps` | kroki przed zrzutem: `clickTab("#tab…")`, `openModal("#btn…")`, `selectTile(…)` albo własne `async (view, { lang, device, page }) => {}` |
| `devices` / `size` | tylko wybrane urządzenia / własny rozmiar `{ width, height, scale }` |
| `gameState` | wiersz `game_state` w atrapie (`round`, `finale`, `main`) — Control odtwarza z niego grę |
| `previewRow` (+ `frame`) | stan wysłany do trybu podglądu urządzenia (`?preview=1`); `frame` — przez ramkę rodzica (Prowadzący) |
| `settle` | dodatkowe ms przed zrzutem (animacje, płótna) |

Nowy stan strony (zakładka, okno, zaznaczenie) = nowa scena z `steps`.

## Dane

| Plik | Co zawiera |
|---|---|
| `data/panel.cjs` | **kanoniczne dane ze starych zrzutów** (panel admina, migracja 370): „Rodzinny pojedynek” z 10 pytaniami („Podaj coś, co można zjeść na szybko”: Kanapka 39, Owoc 24, Jogurt 16, Sałatka 9, Drożdżówka 7, Baton 5), drużyny Króliczki/Zajączki, ankieta „Weekendowy wyjazd” (8/5/3/2 głosy), bazy, foldery, znajomi, subskrybenci, finał, hasła Głównego Wyświetlacza. Mają pierwszeństwo. |
| `data/content.cjs` | dopełnienie list: dodatkowe gry we wszystkich stanach, pula pytań, Społeczność, kolejne osoby |
| `data/demo.cjs` | `buildDb(lang)`: tabele i RPC; `IDS` — stałe identyfikatory dla scen |
| `data/game-state.mjs` | wiersze `game_state` z `makeDefaultState()` aplikacji |
| `data/logo-sources.cjs` → `bake-logos.cjs` → `data/logos.baked.json` | dodatkowe logo wypalone prawdziwym edytorem (autozapis przechwycony z `update_logo_checked`) |

Logo: jedno w pełni zrobione logo rysunkowe (DEMO – Rysunek ze sceną Fabric,
`web/settings/data/screenshots/logo-draw.json`) dla edytora rysunku; pozostałe
(FAMILIADA, DEMO Tekst, DEMO Obraz, napisy) potrzebują tylko poprawnego układu
kropek/znaków.

Wszystko w PL/EN/UK. Nowe teksty dopisuj we wszystkich trzech językach.

## Gdy strona nie chce się wyrenderować

Runner pisze przy scenie:
- `brak danych: rpc:nazwa` / `table:nazwa` → dopisz RPC/tabelę w `data/demo.cjs`.
  Kształt odpowiedzi: `supabase/schema.sql` i miejsce wywołania w `web/`.
  RPC zależne od argumentów: `"fn:(args, db) => …"`.
- `NIEGOTOWA` → selektor `ready` się nie pojawił: uruchom z `--verbose`,
  obejrzyj PNG (zrzut powstaje mimo to) i sprawdź, na czym strona stanęła.
- `błędów JS` → błąd strony; najpierw sprawdź, czy to brak danych w atrapie.

## Kadry strony głównej

Sceny z `homepage: true` w kolejności z `docs/e13-zrzuty-strona-glowna.md`:
gry i bazy, znajomi/zadania/ankiety, wygląd i logo, rozgrywka. Główny
Wyświetlacz (1600×900) i `og-image` (1200×630 @2x = 2400×1260, podgląd linku
przy udostępnianiu) to ta sama plansza FAMILIADA · ONLINE, 999, 111:111,
hasła w wierszach 1/3/5 i X-y w pozycjach 1 i 3.

Kadry nie są jeszcze automatycznie publikowane na stronie głównej (obrazy w
`web/assets/img/<język>/landing-*.webp` i `web/assets/img/og/og-image.webp`
albo bucket `homepage-screenshots`) — to osobny krok po decyzji użytkownika.

## Uwagi

- Wyświetlacz liczy etykietę „SUMA” przy budowie sceny; zdarzyło się, że
  pokazał klucz tłumaczenia („DISP”). Runner czeka teraz na czcionki i 1,5 s
  przed wysłaniem stanu; jeśli wróci — to wyścig w aplikacji, nie w atrapie.

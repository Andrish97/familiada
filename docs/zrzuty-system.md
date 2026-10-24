# System zrzutów — instrukcja dla agentów

Zrzuty **prawdziwych stron** z `web/` na bogatych danych demo, w trzech
językach, bez kont, bez bazy i bez ręcznego klikania. Kod: `scripts/screens/`.
Zastąpił dawny panel zrzutów w panelu admina (usunięty 2026-10-20; zakładka
„Zrzuty strony” z samymi odnośnikami usunięta 2026-10-22 — decyzja użytkownika).
Uruchamianie: workflow „Zrzuty stron” w GitHub Actions; galeria: gałąź
`screens-gallery`. Użytkownik demo jest jeden: `user` w `data/panel.cjs`
(także zrzuty linków z e-maila w `scenes/people.cjs`).

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

Opcje: `--lang=pl|en|uk|all` (domyślnie `pl`), `--devices=desktop,phone,tablet,phone-landscape,tablet-landscape,tablet-landscape-short,desktop-short,desktop-1400,tablet-short-1400`
(niskie widoki guarda wysokości: tablet 1200×560 przy ekranie 1280×800, komputer 1400×550, dotykowy tablet 1400×550 dla Prowadzącego i Przycisku; `--viewport=1280x580` dodaje urządzenie `viewport` o dowolnym rozmiarze, `--force-devices` stosuje `--devices` także do scen z własną listą)
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
   (workflow `screens.yml`): sceny zmienionych stron po polsku (inne języki —
   uruchomienie ręczne), galeria na gałęzi `screens-gallery` (link
   w podsumowaniu przebiegu) i artefakt. Galeria ma limit 30 min i jej
   przekroczenie nie zatrzymuje kroków strony głównej i Wskazówek (zmiana
   tłumaczeń dotyczy wszystkich scen — wcześniej 3 języki zajmowały cały
   limit przebiegu i zrzuty Wskazówek się nie odświeżały). Commity CI z `[skip ci]` (wersje `?v=`) go nie uruchamiają.
   **Na `main`** dodatkowo: zmienione kadry strony głównej są odświeżane
   (`publish-homepage.cjs`), zapisywane commitem `Refresh homepage screenshots`
   i workflow wywołuje wdrożenie Pages — strona główna i og:image same się
   aktualizują. Tak samo zrzuty Wskazówek (`web/manual/img`, commit
   `Refresh help screenshots`).
3. **Ręcznie z telefonu**: Actions → „Zrzuty stron” → Run workflow
   (`changed`, `all` albo lista scen).

### Które sceny po zmianie (`changes.cjs`, decyzja użytkownika 2026-10-22)

Wspólne dla `run.cjs --changed` (galeria, kadry strony głównej) i
`publish-manual.cjs --list --base` (Wskazówki): przeliczane są tylko sceny,
na których wygląd zmiana może wpłynąć.

- Plik różniący się tylko znacznikami wersji (`?v=…`, meta `app-version`) — bez
  wpływu; wyniki zrzutów (`web/assets/img/*/shots`, `og`, `web/manual/img`) też.
- Wspólny kod (`web/shared/js`, `css`, `translation`) — sceny stron, które go
  wczytują, także pośrednio (graf z importów, `<script>`, `<link>`, ścieżek
  `.js/.css/.json` w kodzie). Np. `image-viewer.js` → Wskazówki i strona główna.
- Zmiana pliku scen (`scenes.cjs`, `scenes/<obszar>.cjs`) — sceny z tego pliku.
- Wszystkie sceny: dane demo (`data/`), atrapa (`fake-supabase.js`), `lib.cjs`,
  fonty i dane wyświetlacza (`web/shared/fonts|data`), `web/assets/`.
- Commit bez zmian w wyglądzie (wydajność, łącze, dokumentacja) — zero scen.

Na `main` punkt odniesienia to kod, z którego CI ostatnio renderowało zrzuty:
stopka `Rendered-From: <sha>` w ostatnim commicie odświeżenia (autor `github-actions`,
`web/manual/img` albo kadry strony głównej; ręczna publikacja części zrzutów go nie
przesuwa). Nie sam commit odświeżenia — ten trafia na `main` przez rebase, więc pod nim
leżą commity innych sesji, których CI nie renderowało (tak zgubiły się zmiany podpowiedzi
2026-10-23). Brak stopki — wszystkie zrzuty. Przebiegi pominięte przez kolejkę
(`concurrency` bez przerywania na `main`) nie gubią zmian.

Tłumaczenia: zmiana części słownika `web/shared/translation/<język>/<część>.js` dotyczy
tylko stron z tą częścią w `<meta name="i18n-parts">`; `common` — każdej strony
z tłumaczeniami, `server` — żadnej (np. zmiana `en/logos.js` — 40 scen Logo z 512). Test:
`tests/unit/screensChanges.test.js`.

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
| `guest` | odwiedzający bez konta i sesji (np. strona główna) |
| `safeArea` | emulacja strefy bezpiecznej `{ top, bottom, … }` — `env(safe-area-inset-*)` w CSS/HTML strony zamieniane na piksele |
| `deviceFrame` (+ `frameSize`) | `"iphone"`: ekran w ramce iPhone'a na czarnym tle (kadr głosowania na stronie głównej) |
| `fullPage` | zrzut całej strony (runner przewija, żeby wczytać obrazy `loading="lazy"`) |
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

Logo: jedno w pełni zrobione logo rysunkowe („Gwiazdy wieczoru”, scena Fabric,
`IDS.logoDraw`) dla edytora rysunku; pozostałe (klasyczne FAMILIADA, napisy,
rysunki, obrazy z `logo-sources.cjs`) potrzebują tylko poprawnego układu kropek.
Na zrzutach nie pojawiają się materiały DEMO.

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

Każdy kadr strony głównej ma **jedną wersję**: widok komputerowy 1440×900
(Główny Wyświetlacz 1600×900, og-image 2400×1260), ten sam na stronie głównej
w widoku telefonu i komputera. Jedyny wyjątek to głosowanie
(`poll-vote-mobile`): ekran telefonu w ramce iPhone'a na czarnym tle.

Sceny z `homepage: true` w kolejności z `docs/e13-zrzuty-strona-glowna.md`:
gry i bazy, znajomi/zadania/ankiety, wygląd i logo, rozgrywka. Główny
Wyświetlacz (1600×900) i `og-image` (1200×630 @2x = 2400×1260, podgląd linku
przy udostępnianiu) to ta sama plansza FAMILIADA · ONLINE, 999, 111:111,
hasła w wierszach 1/3/5, X-y w pozycjach 1 i 3 i zapalona lampka drużyny B.

Publikacja: `node scripts/screens/publish-homepage.cjs` (po
`run.cjs --scenes=<homepage> --lang=all`, albo `--changed --homepage`) zapisuje
`web/assets/img/<język>/shots/<scena>.webp` + `-preview.webp` i
`web/assets/img/og/og-image.webp`. Strona główna (`web/index.html`) ma cztery
kafle; każdy jest karuzelą kadrów swojej kategorii (`data-gallery`, tytuły
`home.shots.<scena>` w tłumaczeniach): przyciski po bokach podglądu, kropki na
dole pokazują bieżący kadr, a kliknięcie obrazu otwiera podgląd z
przybliżaniem bieżącego kadru (sceny `home-gallery` i `home-viewer`). Nowy kadr strony głównej = scena z
`homepage: true` + wpis w `data-gallery` właściwego kafla + tytuł w PL/EN/UK.

## Kontrola czcionek Control

`node scripts/screens/check-control-fit.cjs` otwiera rozgrywkę Control (runda,
pojedynek, finał gracza 1 i 2, mapowanie) z najgorszą treścią w limitach
(pytania 100 znaków, odpowiedzi 17) w 16 rozmiarach i proporcjach okna, PL i UK.
Błąd, gdy coś jest ucięte, wychodzi poza kartę, strona się przewija albo musiało
zadziałać zabezpieczenie `fit-text.js` (czcionka z okna za duża). Wypisuje
czcionkę bazową dla każdego okna; zrzuty w `out/control-fit/`. Uruchamiać przy
każdej zmianie wyglądu rozgrywki Control (decyzja: `docs/ujednolicenie-wygladu.md`).

## Czcionka

Strony używają czcionki systemowej (`system-ui`). W CI (`screens.yml`, krok
„Czcionka systemowa (Inter)”) i w środowisku agentów to Inter — na gołym Ubuntu
byłby DejaVu Sans i zrzuty różniłyby się od lokalnych. Lokalnie: `fc-match system-ui`
powinno pokazać Inter.

## Adres stron na zrzutach

Strony idą pod `https://www.familiada.online` (pliki z dysku przez
`context.route`, sieć nieużywana), więc linki i kody QR na kadrach prowadzą do
serwisu. Kod QR z kadru `poll-share` (ankieta demo) otwiera ukrytą grę w węża
(`/snake/`). `SCREENS_LOCAL=1` przywraca stary adres `http://127.0.0.1:…`.

## Uwagi

- Wyświetlacz pokazywał czasem „DISP” zamiast „SUMA”: wyścig w
  `translation.js` (pierwsze `pageshow` wyprzedzało `initI18n`). Naprawione
  w aplikacji 2026-10-20, test `tests/unit/translationRace.test.js`.
- Jedyne obrazy strony to kadry tego systemu: `web/assets/img/<język>/shots/`
  (+ `og/og-image.webp`). Mail marketingowy (`web/shared/js/core/marketing-mail.js`)
  też używa tych kadrów (wersje `-preview`); stare `landing-*.webp` usunięte 2026-10-20.

## Porównanie przed/po (E23)

Przy zmianach wspólnych stylów (silnik `web/shared/style/`) każdą stronę
porównuje się z wersją sprzed zmiany:

```bash
git worktree add /tmp/przed <commit-sprzed>           # kod sprzed zmiany
ln -s "$PWD/tests/node_modules" /tmp/przed/tests/node_modules
(cd /tmp/przed && node scripts/screens/run.cjs --scenes=… --devices=desktop,phone,tablet --force-devices --styles --out=/tmp/A)
node scripts/screens/run.cjs --scenes=… --devices=desktop,phone,tablet --force-devices --styles --out=/tmp/B
node scripts/screens/compare.cjs /tmp/A /tmp/B --out=/tmp/C --style-lines=20
```

- `--styles` zapisuje obok PNG obliczone style widocznych elementów
  (`*.styles.json`); `compare.cjs` wypisuje, które właściwości których
  elementów się zmieniły — to wskazuje przyczynę różnicy pikseli.
- Raport `/tmp/C/index.html`: przed / po / obraz różnic (czerwone piksele).
- Kod wyjścia 1, gdy różnica przekracza `--max` (domyślnie 0,05% pikseli).
- W środowisku agenta Chromium: `CHROMIUM_PATH=/opt/pw-browsers/chromium`.

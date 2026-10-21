# PROGRESS — E22: przebudowa menedżera bazy pytań

Plan (źródło prawdy): [`README.md`](README.md) §4 „Kolejność prac” + decyzje
w [`../menedzer-bazy-plan.md`](../menedzer-bazy-plan.md). Plik przeniesiony z katalogu
głównego 2026-10-21 (tam jest `PROGRESS.md` sesji od wyglądu — bez nadpisywania).
Branch: `ccr-ac709a92-0mcpyq`. Dziennik szczegółowy: `docs/wdrozenia.md`.

**Status: GOTOWE LOKALNIE** — plan 1–7 i etap 8 zrobione na lokalnej bazie (nie na produkcji). Wdrożenie (7d, migracje 427–431 + strony) czeka na decyzję użytkownika.

Zasada nadrzędna użytkownika (2026-10-20): wszystko tylko na lokalnej,
symulowanej bazie — **nic na produkcję**, dopóki użytkownik nie zdecyduje.

## Kroki planu

| # | Krok | Stan |
|---|------|------|
| 1 | Szkielet: rejestr akcji, pasek/menu/skróty z rejestru | ZROBIONE (commit `…krok 1`) |
| 2 | Stan i dane: `location` + `query`, `store`, `derived`, `listing` | ZROBIONE (`3a61e960`) |
| 3 | Rysowanie: zaznaczenie bez przebudowy, `LIST_COLUMNS`, sortowanie | ZROBIONE (`3a61e960`) |
| 4 | Wejścia: zaznaczanie, ramka, przeciąganie, gesty | ZROBIONE (`3a61e960`) |
| 5 | Kosz jako folder + cofanie/ponawianie przez rejestr | ZROBIONE (`3a61e960`, `48a2ea47`) |
| 6 | Wyszukiwanie, menu na telefonie (okno od dołu), dymki, nazwy, poprawki z raportów | ZROBIONE (`48a2ea47`, menu jak okna od dołu: ostatni commit) |
| 7 | Zrzuty, pełny lokalny e2e, zestawienie — potem decyzja o wdrożeniu | ZROBIONE lokalnie; wdrożenie czeka na decyzję |

### Krok 7 — podkroki

- [x] Zrzuty 390 px / 1440 px: `docs/menedzer-bazy/img/` (kosz, menu, filtr).
- [x] Pełny lokalny e2e `base-explorer`: 76/76 (+ test okna od dołu); unit 689/689.
- [x] Zestawienie dla użytkownika (w rozmowie 2026-10-20).
- [x] 7a. Scalono `origin/main` (na main w plikach menedżera tylko hashe wersji; `actions.js` zostaje usunięty; konflikt w Dzienniku połączony). Unit 690/690.
- [x] 7b. Kosz na telefonie: bez kolumny Typ, kolumna „Zniknie” (za N dni) zaraz za nazwą — widoczna bez przewijania (`render.js` `columnsFor`). Zrzut `docs/menedzer-bazy/img/kosz-telefon.png`.
- [x] 7c. Lokalny e2e `base-explorer` po scaleniu: 77/77; po poprawce kosza ponownie kosz + cofanie 6/6; unit 690/690.
- [ ] 7d. Wdrożenie (migracje 427–431 → e2e brancha na produkcji → Pages → testy kontrolne) — **poza zakresem agenta do czasu decyzji użytkownika** (zasada „nic na produkcję”). Przygotowanie gotowe: branch scalony z `main`, migracje tylko dodające.
  Lista kroków po „wdrażaj” (stan 2026-10-21: na `main` ostatnia migracja 426, numery 427–431 wolne):
  1. Scalić świeży `main` (`git -c merge.conflictstyle=diff3 merge`, `resolve-version-conflicts.py`, sprawdzić, czy nie wrócił `web/bases/explorer/js/actions.js`, `version-assets.js`, unit).
  2. Ocena przerwy technicznej: migracje 427–431 tylko dodają funkcje (stary kod działa dalej), ale 428 przenosi usuwanie do kosza dopiero z nowym kodem — przerwa niepotrzebna dla migracji; nowe strony zmieniają menedżer dla osób, które go mają otwartego (odświeżenie) — `maintenance-blockers.sql` przed Pages.
  3. Migracje 427–431 na `main` → `supabase/migration_logs/latest.log`.
  4. E2e brancha na produkcji (`serveBranchCode`, `REF=ccr-ac709a92-0mcpyq`), punktowo: `base-explorer.spec.js` w paczkach (`--grep`), konta z puli 1–8.
  5. Pages (merge na `main`) → te same spece kontrolnie na produkcji; `e20-gallery` (przełącza widok tagów) dopiero teraz.
  6. Wpis w Dzienniku z numerami przebiegów; 7d zamknięte.

## Co dalej

Po decyzji użytkownika: cykl z `CLAUDE.md` — migracje 427–429 na `main` i log zastosowania, e2e `base-explorer` z `serveBranchCode` na branchu (punktowo), Pages, testy kontrolne na produkcji.

## Etap 8 — dopracowanie (lokalnie, polecenie użytkownika 2026-10-20: „kontynuujesz pracę nad edytorem baz”)

- [x] 8a. Duża baza (`tests/e2e/base-explorer-perf.spec.js`, `LOCAL_PERF=1`): przy 20 000 pytań wczytanie 24,5 s → 2,9 s dzięki **migracji 430 `qb_base_content`** (cała baza jednym zapytaniem, RLS; test `tests/sql/qb-base-content-430.sql`). Wyszukiwanie: tekst znormalizowany raz na wersję danych (`computeListing` 8–28 ms przy 20 000). Naprawiony wyścig: klik w lewym panelu zatwierdza oczekujący tekst (wcześniej wyczyszczenie pola + szybki klik w tag dawało 0 wyników).
- [x] 8b. Menu z klawiatury: Shift+F10 / klawisz menu otwiera menu zaznaczenia z fokusem; strzałki (w kółko), Home/End, Enter, Tab zamyka; skróty strony nie przechwytują klawiszy w menu. Test e2e.
- [x] 8c. Cofanie/ponawianie z blokadami jak przy zwykłej akcji (tylko elementy istniejące); zajęty element → komunikat, krok zostaje w historii (`keepHistory`). Test jednostkowy + e2e.
- [x] 8d. Okna tagów / eksportu / pytania na dużych bazach:
  - migracja **431** `acquire_edit_locks` / `release_edit_locks` (blokady zbiorcze: wszystko albo nic, jedno zapytanie i jedno odnowienie co 8 s zamiast N); test `tests/sql/edit-locks-batch-431.sql`; `acquireResourceLocks` w `shared/js/core/resource-lock.js` na nich (używa go tylko menedżer).
  - 430: `qb_base_content` i `qb_question_tag_links` jako SECURITY DEFINER z jednym `base_can_access` (RLS na każdy wiersz kosztował ~1 s przy 20 000); test 430 (właściciel, czytelnik, obcy).
  - okno tagów: przypisania przez `qb_question_tag_links` (lista id w treści zapytania); okno „Utwórz grę”: lista porcjami, przerwanie przy zamknięciu; `repo.js` bez 9 martwych funkcji.
  - Pomiar 20 000 pytań (2026-10-21): okno tagów dużego folderu >30 s → 1,3 s; okno gry 5,7 s → 0,56 s.
- [x] 8e. Przegląd raportów (`docs/menedzer-bazy/1-4*.md`) wobec nowego kodu. Niemal wszystkie [BŁĄD]/[NIESP]/[MARTWE] usunięte przez nową budowę (jeden rejestr akcji, jedno zaznaczanie z panelem, brak blokad paneli, `actions.js` usunięty). Dopisane poprawki:
  - [x] R3: przytrzymanie dwoma palcami nie otwiera menu (ramka) — `mobile.js` liczy palce.
  - [x] R5: ramka przewija listę przy krawędzi — `ui/marquee.js`.
  - [x] menu na komputerze w niskim oknie: `max-height` + przewijanie.
  - [x] test e2e ramki myszą (raport: brak testu).
  - [x] polskie litery w nazwach tagów (decyzja użytkownika 6): `qb_save_tag` (427) i okno tagów; duplikat liczony bez wielkości liter i polskich znaków (`_qb_tag_key`, także `qb_restore_tags` 429); testy SQL 427 + e2e.
  - [x] blokady spójnie (raport 4 §5.2): tworzenie — folder nadrzędny, kopia — źródła i cel, przywrócenie z kosza — dawne miejsce; wszystkie we współdzieleniu (`withLocks(..., { mode: "shared" })`).
  - [x] „Przenieś do… / Kopiuj do…” — zrobione w kroku 9.
- [x] 8f. Pełny lokalny e2e `base-explorer` 81/81 (5 porażek pierwszego przebiegu = lokalna baza: ponowne zastosowanie samej 427 nadpisało `qb_delete_items` z 428; po 428–431 w kolejności zielone), testy SQL 427–431, unit 691/691, zrzuty `docs/menedzer-bazy/img/` odświeżone.

- [x] 9. Prośba użytkownika 2026-10-21: okno „Przenieś do / Kopiuj do” z drzewem i wyszukiwaniem (`ui/move-modal.js`, akcje `item.moveTo`/`item.copyTo`); na telefonie lewy panel = samo drzewo, filtry w oknie „Filtry” (`ui/filters.js`, `#btnFilters` z licznikiem); okna wg `main` (zmiana nazwy przez `promptModal`, listy bez ramek, kafle, stopki); tytuł okna gry „Utwórz grę”. Testy e2e (Przenieś do, filtry na telefonie), sceny zrzutów, makiety propozycji odgracenia lewego panelu na komputerze (A/B/C w planie, „Decyzje” 2026-10-21) — **czeka na wybór użytkownika**.

- [x] 9b. Uwagi użytkownika 2026-10-21: okno tagów — warstwy „Nowy tag” i „Kolor” w kartach jak sekcje z `main` (podpis „Nazwa”, kafel koloru jako wiersz, podgląd bez cienia), „Anuluj” obok „Zapisz” (kolor: przywraca poprzedni; tag: wraca do listy albo zamyka), podpowiedź warstwy pod tytułem w roletce; nagłówek bez ciemnego paska. „Przenieś/Kopiuj do”: drzewo w jednej karcie z liniami prowadzącymi, folder otwarty/zamknięty, liczba pytań, złoty wybór; demo z podfolderami. Safe area: wspólna roletka `base.css` (góra, dół, boki); telefon poziomo — strona pokazuje „Obróć urządzenie”. Menu: „Przenieś do / Kopiuj do” po schowku. E2e lokalne: 79/83 w pełnym przebiegu (3× `networkidle` — przechodzą przy powtórce; Shift+F10 naprawiony), punktowo tagi/Przenieś/Filtry 13/13 + nowy test „Anuluj” w warstwach.

- [x] 9c. Jeden wygląd drzewa (uwaga użytkownika 2026-10-21): lewy panel i okno „Przenieś do” rysują wiersze wspólnym `ui/tree-row.js` (klasy `.tree-row`, `.tree-guides`, `.tree-count`); stare style `#tree .row.tree-row` usunięte, `.row` z `base.css` wyzerowane (marginesy, zawijanie). Pełny lokalny e2e 83/84 + powtórka jedynej porażki (`networkidle`) zielona; unit 691/691.

- [x] 9d. Uwagi użytkownika 2026-10-21: widoki lewego panelu jak radio (`ui/left-view.js`, `state.leftView`): komputer — Tagi/Kategorie przy wyszukiwarce, telefon — drzewo/tagi/kategorie zamiast hamburgera (drzewo zachowuje `#btnDrawerToggle`); jeden widok na pełną wysokość; plakietki z liczbą filtrów. Okno „Filtry” usunięte (HTML, `ui/filters.js`, CSS, tłumaczenia, mapa nawigacji). Drzewo ciaśniej (30 px, na dotyku 36 px), zaznaczenie w drzewie, tagach, kategoriach i oknie „Przenieś do” jak na liście (niebieskie tło + obrys). Pole wyszukiwania w oknie „Przenieś do” na pełną szerokość. Testy: nowe „widoki lewego panelu” (telefon, komputer), helper `showLeftView`; `e20-gallery` i `base-explorer-perf` przełączają widok tagów. Pełny lokalny e2e 84/85 (porażka `networkidle` zielona przy powtórce), unit 691/691.

- [x] 9e. Uwagi użytkownika 2026-10-21: zaznaczenie w lewym panelu na całą szerokość (kontenery bez bocznego paddingu, wcięcie 10 px w wierszach i nagłówkach); linie drzewa ├/└/│ (`treeLines` w `ui/tree-row.js`) — gałąź kończy się na ostatnim dziecku; wyszukiwarka: na komputerze 520 px i jedna linia (tabletki przewijane w poziomie z wygaszeniem), na telefonie pole w pasku = podgląd, stuknięcie otwiera okno „Szukaj” (`#searchOverlay`, to samo pole przenoszone na czas edycji; nasłuch `ui/search.js` na dokumencie); nowa ikona kategorii `categories.svg` (trzy kółka jak kropki kategorii); plakietki w rogu przycisku. Test wyszukiwania na telefonie przez okno; pełny lokalny e2e 83/85 (porażki: test do nowego okna — poprawiony, `networkidle` — zielony przy powtórce).

- [x] 9f. Porządki: scalony `main`; zaznaczenie drzewa czyszczone przy zmianie widoku panelu; `data-action` w menu kontekstowym; komentarze po `actions.js`; diagnostyka wolnych żądań w lokalnym e2e. Pełny lokalny e2e 85/85, EN/UK sprawdzone zrzutami.

- [x] 9g. Poprawki po przeglądzie kodu: Enter w „Przenieś do” (Anuluj z fokusem anuluje, wybór spoza listy nie obowiązuje, jeden wynik — Enter go wybiera), `ui/sheet-guard.js` (okno z `?dialog=` w adresie lub z „Dalej” zamyka się zamiast wisieć puste), fokus po zamknięciu okien, lupa na telefonie, szuflada zamykana przy oknach (`explorer:close-drawer`), cykle w wynikach szukania. Strażnik także dla okien tagów, „Utwórz grę” i pytania (ten sam błąd był w nich przed E22: `?dialog=tagsOverlay` w adresie pokazywał puste okno bez działających przycisków; test sprawdzony — bez poprawki pada). Pełny lokalny e2e 86/86.

- [x] 9h. Tabletki tagów w wyszukiwarce całe w kolorze tagu i cieńsze (tekst: wyższy kontrast WCAG, `chipTextColor` w `render.js`). Komplet zrzutów komputer / tablet / telefon: `docs/menedzer-bazy/img/urzadzenia/` (sceny panelu i „Szukaj” także na tablecie).

- [x] 9i. Decyzja użytkownika 2026-10-21: wyszukiwanie i filtry razem, bez tagów w wyszukiwarce — pole tylko na tekst (`ui/search.js` przepisany: bez tabletek, `#tag` i podpowiedzi; `hashTokenBeforeCaret` / `textWithoutHashTokens` usunięte z `listing.js`), tagi i kategorie w lewym panelu, „X” czyści tekst i filtry, okno „Szukaj” na telefonie z samym polem. Testy e2e o `#tag` przepisane na „tekst + tag z panelu”; pełny lokalny e2e 86/86 (po ponownym uruchomieniu lokalnego Postgresa — kontener był zrestartowany), unit 690/690.

- [x] 9j. Zgłoszenia 2026-10-21 (błędy obecnej wersji na produkcji, sprawdzone w kodzie `main`): (1) „Utwórz grę” przy „Tylko podgląd” — na produkcji `if (!canWrite) return` po cichu; nowy kod pozwala czytelnikowi (gra to kopia w jego grach) — test e2e tworzy grę jako viewer. (2) Ctrl+Shift+N tworzył pytanie — stary kod sprawdzał Ctrl+N przed Ctrl+Shift+N; rejestr dopasowuje Shift ściśle — test. (3) Nazwy: „Nowy folder” / „Nowe pytanie” z tłumaczeń już w nowym kodzie; „(kopia)” dokładała funkcja SQL po polsku — migracja 427 (niewdrożona, poprawiona w miejscu): `p_copy_label` w `qb_copy_items` i `_qb_unique_folder_name` (domyślnie „kopia”), strona podaje `baseExplorer.defaults.copy` — test SQL 427 + e2e po angielsku. Lokalnie: stare sygnatury usunięte, 427–431 ponownie; SQL 427–431 OK; pełny e2e 88/88.

## Wznowienia

- 2026-10-21 04:45 CEST: wznowione z przypomnienia po limicie (kontener po restarcie: `setup.sh` — skrypt wisi na PostgREST po starcie, wystarczy go zamknąć; serwer działa).

## Znane problemy

- Lokalne e2e: sporadycznie (1–3 na 85) `page.waitForLoadState("networkidle")` przekracza 30 s; przy powtórce zielone. `preload.cjs` loguje teraz żądania > 5 s (`[lb] wolne >5s`) — przy następnym wystąpieniu sprawdzić, które.
- Lokalnie: stosując ponownie jedną z migracji 427–431, stosuj też wszystkie następne (427 i 428 definiują `qb_delete_items`).

- Gesty i arkusz menu sprawdzone tylko w emulacji, nie na prawdziwym telefonie.
- Historia cofania znika po odświeżeniu strony (w pamięci karty — świadomie).
- Strona ładuje całą bazę naraz (jedno zapytanie 430); przy 20 000 pytań ~3 s lokalnie.
- Wzorzec „okno od dołu” nie jest jeszcze na `main` (branch `claude/new-session-ay1h9t`);
  menu ma te same wartości w `base-explorer.css` — po scaleniu można przenieść do wspólnego CSS.

## Decyzje podjęte samodzielnie

- 2026-10-20: plikiem planu jest `docs/menedzer-bazy/README.md` §4 (w poleceniu był placeholder).
- 2026-10-21: nazwy tagów różniące się tylko wielkością liter / polskimi znakami („Łatwe” i „latwe”) to duplikat — wyszukiwarka (`#latwe`) i tak ich nie rozróżnia.
- 2026-10-21: tworzenie, kopia i przywracanie z kosza biorą blokady współdzielone (cel / źródła), nie wyłączne — wiele osób może tworzyć w tym samym folderze naraz.
- 2026-10-20: wdrożenie (7d) nie jest wykonywane bez wyraźnej decyzji użytkownika — zasada
  nadrzędna „nic na produkcję” z `docs/menedzer-bazy-plan.md`.

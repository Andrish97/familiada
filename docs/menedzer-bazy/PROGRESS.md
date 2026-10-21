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

## Wznowienia

- 2026-10-21 04:45 CEST: wznowione z przypomnienia po limicie (kontener po restarcie: `setup.sh` — skrypt wisi na PostgREST po starcie, wystarczy go zamknąć; serwer działa).

## Znane problemy

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

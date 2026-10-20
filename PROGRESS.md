# PROGRESS — E22: przebudowa menedżera bazy pytań

Plan (źródło prawdy): [`docs/menedzer-bazy/README.md`](docs/menedzer-bazy/README.md) §4
„Kolejność prac” + decyzje w [`docs/menedzer-bazy-plan.md`](docs/menedzer-bazy-plan.md).
Branch: `ccr-ac709a92-0mcpyq`. Dziennik szczegółowy: `docs/wdrozenia.md`.

**Status: W TOKU** — plan 1–7 gotowy lokalnie (nie na produkcji); trwa etap 8 (dopracowanie, lokalnie). Wdrożenie (7d, teraz z migracjami 427–431) czeka na decyzję użytkownika.

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
- [ ] 8d. Okna tagów / eksportu / pytania — W TOKU (zmiany w commicie „WIP 8d”, e2e jeszcze nie puszczone):
  - [x] migracja **431** `acquire_edit_locks` / `release_edit_locks` (blokady zbiorcze: wszystko albo nic, jedno zapytanie i jedno odnowienie co 8 s zamiast N); test `tests/sql/edit-locks-batch-431.sql` OK; `acquireResourceLocks` w `shared/js/core/resource-lock.js` na nich (używa go tylko menedżer).
  - [x] 430: `qb_base_content` i nowa `qb_question_tag_links` jako SECURITY DEFINER z jednym `base_can_access` (RLS na każdy wiersz kosztował ~1 s przy 20 000); test 430 rozszerzony (czytelnik, obcy) OK.
  - [x] okno tagów: przypisania przez `qb_question_tag_links` (lista id w treści zapytania, nie w adresie — duży folder przekraczał limity); `repo.js` bez 9 martwych funkcji.
  - [x] okno „Utwórz grę”: lista porcjami (300, potem po 1000 na klatkę), jedna obsługa kliknięć; usunięty martwy `state.questions`.
  - [ ] przerwanie dorysowywania przy zamknięciu okna gry (`renderToken += 1` w `close()` w `export-modal.js`) — nie zapisane (przerwane).
  - [ ] uruchomić: `LOCAL_PERF=1 PERF_QUESTIONS=20000 scripts/agent-tools/local-e2e/run.sh e2e/base-explorer-perf.spec.js` (ostatnio: okno tagów 2,3 s, okno gry 3,5–4 s przed porcjowaniem), potem pełny `e2e/base-explorer.spec.js` lokalnie i `tests/sql/*430*`, `*431*`.
- [ ] 8e. Przegląd pozostałych niespójności z raportów (`docs/menedzer-bazy/1-4*.md`) wobec nowego kodu.
- [ ] 8f. Pełny lokalny e2e + zrzuty + zestawienie.

## Stan przerwania (2026-10-21 01:45 CEST)

Limit użycia — odnowienie o **4:40 CEST** (wg użytkownika). Przypomnienie
`send_later` na 4:45 CEST (02:45 UTC, trigger `trig_01MhBRxTERut2NHm24mQ1vng`).
Kontynuować od 8d (lista wyżej). Lokalne zaplecze: Postgres :5499 z migracjami
427–431 zastosowanymi ręcznie; po restarcie kontenera `setup.sh` (stosuje
migracje brancha).

## Znane problemy

- Gesty i arkusz menu sprawdzone tylko w emulacji, nie na prawdziwym telefonie.
- Historia cofania znika po odświeżeniu strony (w pamięci karty — świadomie).
- Strona ładuje całą bazę naraz (jedno zapytanie 430); przy 20 000 pytań ~3 s lokalnie.
- Wzorzec „okno od dołu” nie jest jeszcze na `main` (branch `claude/new-session-ay1h9t`);
  menu ma te same wartości w `base-explorer.css` — po scaleniu można przenieść do wspólnego CSS.

## Decyzje podjęte samodzielnie

- 2026-10-20: plikiem planu jest `docs/menedzer-bazy/README.md` §4 (w poleceniu był placeholder).
- 2026-10-20: wdrożenie (7d) nie jest wykonywane bez wyraźnej decyzji użytkownika — zasada
  nadrzędna „nic na produkcję” z `docs/menedzer-bazy-plan.md`.

# PROGRESS — E22: przebudowa menedżera bazy pytań

Plan (źródło prawdy): [`docs/menedzer-bazy/README.md`](docs/menedzer-bazy/README.md) §4
„Kolejność prac” + decyzje w [`docs/menedzer-bazy-plan.md`](docs/menedzer-bazy-plan.md).
Branch: `ccr-ac709a92-0mcpyq`. Dziennik szczegółowy: `docs/wdrozenia.md`.

**Status: W TOKU** — plan 1–7 gotowy lokalnie (nie na produkcji); trwa etap 8 (dopracowanie, lokalnie). Wdrożenie (7d) czeka na decyzję użytkownika.

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
- [ ] 7d. Wdrożenie (migracje 427–429 → e2e brancha na produkcji → Pages → testy kontrolne) — **poza zakresem agenta do czasu decyzji użytkownika** (zasada „nic na produkcję”). Przygotowanie gotowe: branch scalony z `main`, migracje tylko dodające.

## Co dalej

Po decyzji użytkownika: cykl z `CLAUDE.md` — migracje 427–429 na `main` i log zastosowania, e2e `base-explorer` z `serveBranchCode` na branchu (punktowo), Pages, testy kontrolne na produkcji.

## Etap 8 — dopracowanie (lokalnie, polecenie użytkownika 2026-10-20: „kontynuujesz pracę nad edytorem baz”)

- [ ] 8a. Duża baza: lokalnie kilka tysięcy pytań i folderów — czas wczytania, rysowania, filtra; poprawić, jeśli wolno.
- [ ] 8b. Menu kontekstowe z klawiatury: strzałki, Home/End, Enter, Escape; fokus na pierwszej pozycji przy otwarciu z klawiatury (Shift+F10 / klawisz menu).
- [ ] 8c. Cofanie/ponawianie z blokadami (te same co przy zwykłej akcji), komunikat zamiast czyszczenia historii, gdy element jest zajęty.
- [ ] 8d. Okna tagów / eksportu / pytania: przegląd i uporządkowanie (stary kod), spójność z rejestrem akcji.
- [ ] 8e. Przegląd pozostałych niespójności z raportów (`docs/menedzer-bazy/1-4*.md`) wobec nowego kodu.
- [ ] 8f. Pełny lokalny e2e + zrzuty + zestawienie.

## Znane problemy

- Gesty i arkusz menu sprawdzone tylko w emulacji, nie na prawdziwym telefonie.
- Historia cofania znika po odświeżeniu strony (w pamięci karty — świadomie).
- Strona ładuje całą bazę naraz — wydajność na dużych bazach do sprawdzenia (8a).
- Wzorzec „okno od dołu” nie jest jeszcze na `main` (branch `claude/new-session-ay1h9t`);
  menu ma te same wartości w `base-explorer.css` — po scaleniu można przenieść do wspólnego CSS.

## Decyzje podjęte samodzielnie

- 2026-10-20: plikiem planu jest `docs/menedzer-bazy/README.md` §4 (w poleceniu był placeholder).
- 2026-10-20: wdrożenie (7d) nie jest wykonywane bez wyraźnej decyzji użytkownika — zasada
  nadrzędna „nic na produkcję” z `docs/menedzer-bazy-plan.md`.

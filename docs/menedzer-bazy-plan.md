# Menedżer bazy — porządkowanie, kosz, cofanie (E22)

Strona: `web/bases/explorer/` (menedżer bazy pytań). Branch roboczy:
`ccr-ac709a92-0mcpyq`.

## Decyzje

- **2026-10-20 (użytkownik):** uporządkować cały kod menedżera bazy na branchu
  (kod pisany przez przepisywanie podpowiedzi z czatu — niespójny, „działa
  niby”). Potem kosz i cofanie/przywracanie (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z).
- **Kosz (propozycja, czeka na potwierdzenie):** osobny dla każdej bazy;
  osobna tabela ze zrzutem usuniętego poddrzewa (odczyty `qb_*` bez zmian);
  automatyczne usuwanie po 30 dniach (cron), licznik dni na wierszu,
  przywróć / usuń trwale / opróżnij kosz. Otwarte: czy usuwanie całej bazy
  z listy baz też idzie do kosza.
- **Cofanie (plan):** historia w pamięci karty (do przeładowania), każda
  akcja przez `ops.js`, odwrotność z danych „przed” zwracanych przez bazę;
  przy konflikcie (element zmieniony/usunięty gdzie indziej) komunikat
  i wyczyszczenie historii.

## Etapy

1. **Porządek zapisów (w toku):**
   - migracja 427 `qb_*`: każda akcja = jedna funkcja SQL = jedna
     transakcja (SECURITY INVOKER — RLS i wyzwalacz treści jak dotąd);
     zwracają stan „przed” (pod cofanie). Test: `tests/sql/qb-atomic-ops-427.sql`.
   - `js/ops.js` — jedyne miejsce zapisu; mapuje błędy `qb:*` na komunikaty.
   - `js/repo.js` — wszystkie odczyty; `actions.js` bez `sb()`.
   - jedna ścieżka po zapisie: `afterMutation()` (unieważnienie pamięci
     podręcznej + odświeżenie widoku); jedna funkcja kopiowania
     (`copyItemsTo`) zamiast trzech; schowek trzyma same klucze.
   - usunięty martwy kod (`actions.js` 4866 → ~4100 linii, `state.js`).
   - Zmiany zachowania: zdjęcie tagu z folderu w widoku tagu zdejmuje go
     z całego poddrzewa (wcześniej tylko z bezpośredniego przypisania
     folderu, więc folder dalej był widoczny); nazwy „Nowy folder” /
     „Nowe pytanie” z tłumaczeń; wklejenie kopii, gdy źródło usunięto
     po skopiowaniu, kończy się komunikatem „element zniknął”.
2. **Kosz** — po potwierdzeniu decyzji wyżej.
3. **Cofanie / przywracanie** — na `ops.js`.
4. **Dalsze porządki** (`wireActions` ~2000 linii obsługi zdarzeń:
   podział na moduły drzewo/lista/klawiatura/przeciąganie).

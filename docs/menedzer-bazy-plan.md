# Menedżer bazy — porządkowanie, kosz, cofanie (E22)

Strona: `web/bases/explorer/` (menedżer bazy pytań). Branch roboczy:
`ccr-ac709a92-0mcpyq`.

## Decyzje

- **2026-10-20 22:35 (użytkownik) — NADRZĘDNE, zastępują wcześniejsze ustalenia niżej:**
  - Tylko symulowana (lokalna) baza: zmiany i testy na lokalnym Postgresie
    (`scripts/agent-tools/local-e2e/`), **nic na produkcję**, dopóki
    użytkownik nie zdecyduje — ludziom nie może nic przestać działać.
  - Menedżer przeanalizować **dogłębnie** (nie pobieżnie) i wyklarować.
  - Podział na mniejsze moduły.
  - **Jeden rodzaj akcji** odpalany z trzech miejsc (pasek narzędzi, menu
    kontekstowe, skrót klawiszowy); dostępność, blokady i komunikaty
    przycisków/akcji z **jednego miejsca**.
  - Agent ma też zaproponować inne ulepszenia i ujednolicenia.
  - **Kosz = folder w drzewie** w lewym górnym obszarze, pod wszystkimi
    folderami. Otwarty pokazuje usunięte foldery i pojedyncze pytania (jeśli
    usuwano je pojedynczo) — jak zwykły folder na liście.
  - W koszu zwykły przycisk „Usuń” z paska usuwa **trwale**. Przywracanie:
    po kliknięciu (zaznaczeniu) elementu pojawia się przycisk „Przywróć”;
    jeśli się zmieści — w pasku narzędzi.
  - Obecne okno kosza (`trash-modal.js`, wiersz na dole lewego panelu) jest
    do zastąpienia tym modelem.
  - **Zachować wszystkie dobre rzeczy**, ale uspójnić i ujednolicić:
    zaznaczanie (klik, Ctrl, Shift, Ctrl+A, zaznaczanie ramką /
    „marquee”), przeciąganie, menu kontekstowe, gesty na telefonie,
    skróty i podobne. Nic z działających funkcji nie może zniknąć.
  - **Telefon:** obecne gesty zostają (przytrzymanie = menu, podwójne
    stuknięcie itd.), a do przemyślenia są dodatkowe gesty dotykowe,
    np. dwoma palcami, jako odpowiedniki akcji z myszy i klawiatury
    (zaznaczanie wielu, ramka, cofanie). Gest = kolejne wejście do tego
    samego rejestru akcji.
  - **Renderowanie list do przebudowy:** dziś kilka nakładających się reguł
    w różnych miejscach (widoki, pamięci podręczne, liczniki, sortowanie,
    filtry). Cel: jedno źródło stanu i jedna prosta, niezawodna ścieżka
    „stan → co pokazać → render” dla drzewa, listy i lewego panelu.
  - **Pasek narzędzi zależny od widoku (do decyzji, propozycja agenta):**
    każda akcja w rejestrze ma dwa warunki: „ma sens w tym widoku”
    (nie → przycisk znika) i „można teraz” (nie → wyszarzony). Przycisk
    znika tylko przy zmianie widoku, nie przy każdym kliknięciu, więc pasek
    nie skacze. Np. kosz: Przywróć, Usuń trwale, Opróżnij kosz; wyszukiwanie
    i tagi: bez Nowy folder/pytanie i Wklej; foldery: jak dziś.
  - **Wygląd strony zostaje** (użytkownikowi się podoba) — bez zmian
    wizualnych poza tym, czego wymagają nowe funkcje (kosz w drzewie).
  - **Menu kontekstowe do poprawy:** prawy przycisk myszy i długie
    przytrzymanie na telefonie — ma się ładnie mieścić i być wygodnie
    dostępne w widoku mobilnym (dziś „nie do końca”). Pozycje menu z tego
    samego rejestru akcji.
  - **Przemyśleć wyszukiwanie i filtrowanie** (tekst, #tagi w polu
    wyszukiwania, filtr tagów i kategorii w lewym panelu, blokady akcji
    w widokach wyszukiwania/tagów), żeby działało dobrze i spójnie.

- **2026-10-20 (użytkownik):** uporządkować cały kod menedżera bazy na branchu
  (kod pisany przez przepisywanie podpowiedzi z czatu — niespójny, „działa
  niby”). Potem kosz i cofanie/przywracanie (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z).
- **Kosz (domyślny wariant agenta, bez sprzeciwu użytkownika):** osobny dla
  każdej bazy; osobna tabela `qb_trash` ze zrzutem usuniętego elementu
  najwyższego poziomu (pytanie albo folder z poddrzewem i tagami pytań) —
  odczyty `qb_*` bez zmian; automatyczne usuwanie po 30 dniach (cron
  `qb-trash-cleanup` 02:17 UTC), licznik dni na wierszu (≤ 3 dni ostrzegawczo),
  przywróć (te same id; brak folderu nadrzędnego → korzeń) / usuń trwale /
  opróżnij kosz. Widzą go właściciel i edytorzy. Wejście: wiersz „Kosz”
  z licznikiem na dole lewego panelu → okno (telefon: arkusz).
  Otwarte: czy usuwanie całej bazy z listy baz też idzie do kosza (na razie nie).
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
2. **Kosz (gotowe na branchu):** migracja 428 (`qb_trash`, `qb_delete_items`
   do kosza, `qb_trash_list/restore/purge`, `qb_trash_cleanup` + cron),
   test `tests/sql/qb-trash-428.sql`; `trash-modal.js`, wiersz w lewym
   panelu, tłumaczenia PL/EN/UK, scena zrzutów `base-explorer-trash`,
   e2e „base-explorer: kosz (E22)”. Przy okazji: jedna bramka skrótów
   klawiszowych (Delete w polu okna pytania usuwał zaznaczenie,
   Ctrl+Shift+N tworzył pytanie zamiast folderu), komunikaty potwierdzeń
   bez polskich wstawek w EN/UK.
3. **Cofanie / przywracanie** — na `ops.js`.
4. **Dalsze porządki** (`wireActions` ~2000 linii obsługi zdarzeń:
   podział na moduły drzewo/lista/klawiatura/przeciąganie).

**Testy lokalne bez produkcji:** e2e z kodem brancha na lokalnym Postgresie
+ PostgREST (atrapa `/auth/v1`, strony z dysku) — `scripts/agent-tools/local-e2e/README.md`;
spec `base-explorer` na kodzie z `main` i z brancha daje ten sam wynik
(15 błędów niezależnych od zmian: brak konfiguracji maili lokalnie i stare
asercje — m.in. limit 200 znaków pytania, tooltip kropki meta).

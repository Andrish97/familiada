# Wdrożenia — kolejka i stan

Jedna lista tego, co uzgodniliśmy do wdrożenia, w jakiej kolejności i w
jakim jest stanie. **Decyzje i szczegóły nie są tutaj**, tylko w plikach
tematycznych (niżej „Źródła”), a ten plik do nich odsyła. Dzięki temu po
utracie kontekstu wystarczy przeczytać ten plik i wskazaną sekcję źródła.

## Zasady

1. **Źródła prawdy** (decyzje, mapy, stan docelowy):
   - nawigacja, adresy, karty, strony modalne: [`nawigacja-mapa-plan.md`](nawigacja-mapa-plan.md)
     (sekcja 6 — kroki, sekcja 7 — decyzje, sekcja 8 — adresy),
   - blokady zasobów: [`blokady-zasobow.md`](blokady-zasobow.md)
     (sekcja 6 — mapa docelowa i kroki),
   - wygląd list, subskrypcji i edytorów:
     [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md),
   - ankiety (hub znika, strona ankiety, subskrypcje z zadaniami):
     [`ankiety-refaktor.md`](ankiety-refaktor.md),
   - usuwanie gry i konta: [`usuwanie-danych.md`](usuwanie-danych.md),
   - granice maili do innych osób: [`maile-granice.md`](maile-granice.md) (część E11).
2. **Decyzja użytkownika** → w tej samej turze dopisana do sekcji
   „Decyzje” właściwego źródła (z datą), commit. Nie w samej rozmowie.
3. **Tok pracy**: branch roboczy → testy jednostkowe
   (`cd tests && node --test unit/*.test.js`) → e2e na branchu
   (`e2e-tests.yml`, `spec_filter` nigdy pusty) → dopiero wtedy push na
   `main` → e2e na `main` dla tych samych speców.
4. **Bez fallbacków** (aliasy starych adresów, przekierowania, zgadywanie
   karty, `history.back()`/`referrer`) — patrz nawigacja, sekcja 2.
5. Po każdym etapie: status tutaj + commity + numer przebiegu e2e
   w „Dzienniku”. Etap jest **zrobiony**, gdy jest na `main` i e2e na
   `main` przeszło.
6. Statusy: `do zrobienia` · `w toku` · `na branchu (e2e ok)` · `zrobione` ·
   `czeka na decyzję`.

## Kolejka

| # | ID | Etap | Źródło | Status |
|---|---|---|---|---|
| 1 | E0 | Zielone e2e: `mobile-sheet-modals` (szerokość arkusza = szerokość treści, margines 15 px zostaje; tekst przycisku „Wstecz” z ikoną), przekroczenia czasu w eksploratorze bazy | — | zrobione |
| 2 | E3 | Drobne błędy logowania (`requireAuth` w control/account, domyślny argument, `withLangParam`) | nawigacja 6.1 | zrobione |
| 3 | E10 | Wygląd: listy (pasek, karty, kafle, dolny pasek), edytory (tytuł i nazwa w topbarze, jedno pole nazwy, logo bez wskaźnika zapisu), ankieta bez podpowiedzi pod tytułem | ujednolicenie-wygladu.md | zrobione |
| 4 | E11 | Ankiety: luka bezpieczeństwa, klucz na uruchomienie, Przerwij, zaproszenia (3 stany), limity maili, strona ankiety (karty Udostępnianie · Wyniki), hub znika, Subskrypcje + Zadania, podgląd Gra · Ankieta, blokady stanu na stronach gry | ankiety-refaktor.md, maile-granice.md, blokady „Blokady stanu” | na `main`, e2e main w toku (poprawki testów `e2efix`) |
| 5 | E12 | Usuwanie gry i konta | usuwanie-danych.md | na `main`, e2e main w toku |
| 5a | E12b | **Pliki w Storage usuwa baza** (atomowo, każde miejsce usuwania): kolejka `storage_cleanup_queue` + edge function `storage-cleanup` (migracja 313); przeglądarka nie kasuje plików przy usuwaniu | usuwanie-danych.md „Pliki w Storage” | baza na `main`; frontend z E2 |
| 6 | E2 | Blokady wg mapy docelowej (współdzielone, `logos`, `base:B`, odnowienie `locked`, TTL, DB `*_checked`) + blokady stanu i akcji wg kryteriów gier (tabela akcja → warunki) | blokady 6 | na branchu (migracja 316), czeka na zielony `main` |
| 6a | E15 | **Poprawki zgłoszone 2026-10-08:** a) nowa strona `/polls/` — układ przycisków się rozjeżdża (sprawdzić dokładnie desktop i telefon, wszystkie stany ankiety); c) zamknięcie i podliczenie jako osobne kroki, karty Udostępnianie · Wyniki (uniwersalne), plakietki na kaflach gier: liczba głosów / „do podliczenia” (ankiety-refaktor.md, decyzja 2026-10-09); d) tytuł strony w topbarze widoczny też na telefonie (dziś sekcja 2 ukryta) — ankieta, edytory, menedżer bazy, ustawienia gry; b) stopka w manualu przykleja się do tekstu, gdy treść jest krótsza niż ekran (regresja z E10/E11 — stopka ma być na dole strony) | ujednolicenie-wygladu.md | do zrobienia (pierwsze po wznowieniu) |
| 7 | E4 | `nav-map.js` (`PAGES`, `linkTo`, `backHref`), `ret`, gość na `/` → `/games/` | nawigacja 6.2–6.3 | na branchu `e4` (unit ok), e2e po E2 |
| 8 | E5 | Adresy a) `/go/` b) ankiety c) gry d) urządzenia + `/connect/` e) bazy, logo f) logowanie | nawigacja 8 | do zrobienia |
| 9 | E6 | `initPage()`, wspólny overlay gość/urządzenie | nawigacja 6.4 | do zrobienia |
| 10 | E7 | Bez stron modalnych: edytor `?q=`, ustawienia gry z autozapisem, manual/privacy bez `?modal=` | nawigacja 6.5 | do zrobienia |
| 11 | E8 | Jeden moduł kart `?tab=`, stan eksploratora | nawigacja 6.6 | do zrobienia |
| 12 | E9 | Przyciski i `locks` w `PAGES`, diagramy 6 map, e2e map | nawigacja 6.7 | do zrobienia |
| 12a | E14 | **Sprzątanie po potwierdzeniu** (migracje usuwające): martwe RPC ankiet i hubu (E11h); `cleanup-guest-storage` i jej wywołania w `guest_cleanup_expired` / `guest_discard_current`; kasowanie plików w `delete-account` (zastąpione przez E12b) | ankiety-refaktor.md, usuwanie-danych.md | czeka na potwierdzenie e2e na `main` |
| 13 | E13 | **Instrukcja (manual) zaktualizowana do nowych zasad** — ostatni etap | wszystkie | do zrobienia |
| — | E1 | Edytor logo: lista + 3 strony, autozapis | nawigacja 6.5a | zrobione |

**Kolejność = kolumna # — zatwierdzona 2026-10-07. Start pracy dopiero po osobnym „możesz zaczynać” od użytkownika.** Uzasadnienie: E0 daje wiarygodne testy; E3 to
drobiazg; E10 pierwszy z dużych (decyzja); E11 wcześnie, bo zamyka lukę
bezpieczeństwa na produkcji (korzysta z obecnej blokady `game:G`, nie
potrzebuje E2); E12 po E11 (te same tabele ankiet); E2 przed nawigacją,
bo `PAGES` deklaruje blokady; adresy po mapie stron; instrukcja na końcu.

## Zasady działania (decyzja 2026-10-07)

1. Praca w tle, bez pytania o zgodę na kolejne kroki; pytam tylko, gdy
   brakuje decyzji, której nie ma w dokumentach.
2. Kod: branch → testy (unit + e2e z filtrem) → `main` → e2e na `main`.
   **Migracje bezpieczne** (dodające, zgodne wstecz z działającym kodem)
   → od razu na `main`, potem testy. Migracje zmieniające zachowanie
   produkcji razem z kodem, który ich wymaga. **Migracje usuwające**
   (funkcje, kolumny, tabele) dopiero po potwierdzeniu testami, że nowa
   droga działa na produkcji.
6. **Nigdy dwa przebiegi e2e naraz** — dzielą konta testowe i bazę
   produkcyjną, wzajemnie sprzątają sobie dane (przebieg E10 z 2026-10-08:
   55 fałszywych błędów przez równoległy przebieg testów ankiet).
5. Dostępne narzędzia testowe: **lokalny Postgres** do wykonania migracji
   przed wypchnięciem (`docs/sql/local-db.md`); e2e z prawdziwą skrzynką mailową
   (`e2e_mailbox`) i kontami testowymi — używać ich do maili, kont,
   subskrypcji i ankiet.
3. Oszczędnie z kontekstem: czytać fragmenty plików, wyszukiwanie
   zlecać agentom, nie powtarzać analiz zapisanych w dokumentach.
   **Agenci na tańszym modelu** (Haiku do szukania, Sonnet do analizy),
   mocniejszy tylko gdy zadanie tego wymaga (decyzja 2026-10-07).
   Stan pracy zapisywany w „Dzienniku” po każdym kroku, tak żeby po
   kompaktowaniu kontekstu dało się kontynuować z samych dokumentów.
4. Przed wyczerpaniem limitu: zapisać stan w dzienniku, wypchnąć, ustawić
   przypomnienie (`send_later`) na wznowienie pracy. **Stały timer**
   `trig_017RW51bdVmysCgBE7q8fmq5` (co 2 h) wznawia pracę z dziennika;
   wyłączyć, gdy kolejka skończona albo czekamy na decyzję.
   **Limit (decyzja 2026-10-08):** w trakcie pracy zawsze uzbrojone jedno
   przypomnienie `send_later` na **teraz + 3 h 1 min**; przy każdym kroku
   (commit, przebieg e2e, odpowiedź) stare kasowane i ustawiane nowe. Gdy
   limit zatrzyma pracę, ostatnie przypomnienie wznawia ją 3 h 1 min po
   ostatniej aktywności. Na pauzie (prośba użytkownika) — bez przypomnień.

## Dziennik

| Data | Etap | Commity (`main`) | e2e |
|---|---|---|---|
| 2026-10-07 | E1 | `8b11046`, `be7226a`, `1f7f135` | branch 37667707570: logo w `cross-resource-locks` ok; `mobile-sheet-modals` logo — tylko szerokość arkusza (E0) |
| 2026-10-07 | E0 (w toku, wstrzymane) | branch `25b92b3` (testy: szerokość arkusza = treść, „Wstecz” z ikoną) | branch 37702991063: 9 ok, 8 źle — bazy (udostępnianie), eksplorator (tagi, eksport, pytanie), gry (eksport do bazy), hub (2, i tak znika w E11), logo import (`#btnLogoImportCancel` niewidoczny — prawdopodobnie zmiana „Modal: wspólny przewijany obszar” na `main`). Następny krok: przeczytać szczegóły błędów z logu przebiegu |
| 2026-10-08 | E0 | `25b92b3`, `2be0fe7` (arkusze zamykane „Wstecz” w topbarze — „✕” w nagłówku ukryty na telefonie) | branch 37745173288: `mobile-sheet-modals` zielone |
| 2026-10-08 | E3 | `b0df9fb` (requireAuth `/login/`, Konto bez `setup=username`, `withLangParam` w powrotach i nakładce blokady) | unit 300/300; na `main` w `4fea5a5` |
| 2026-10-08 | E10 (część) | `d00e083` stany kafli gier (OTWARTA/ZAMKNIĘTA, GOTOWA) — na `main` | unit 300/300 |
| 2026-10-08 | E10 (na branchu) | `47f1709` edytory: tytuł w topbarze, wspólne pole nazwy, logo bez informacji o zapisie, ankieta bez podpowiedzi; `e93e446` niższe karty i mniejsze odstępy list; `6b0024f` wyszukiwanie w listach | e2e branch (logo-editor, editor, games) w toku |
| 2026-10-08 | E11a | `ca71797` na `main`: migracja 309 — uruchom/zamknij ankietę tylko właściciel (nakładki na oryginały `_…_unchecked`) | po zastosowaniu: e2e `editor.spec.js` (woła `poll_open` jako właściciel) |
| 2026-10-08 | E11a/E11b | 309 sprawdzona też lokalnie (anon: brak dostępu, obcy: `not_owner`, właściciel: ok); szkic E11b `docs/sql/e11b_draft.sql` wykonuje się lokalnie (poll_abort, rotacja klucza ok) — czeka na frontend E11c–e | — |
| 2026-10-08 | E11b | `e5a014e` na `main`: migracja 310 (klucz na uruchomienie, `poll_abort`, `poll_share_remove`, `poll_share_remind`, zamknięcie bez czekania na zaproszenia, limity maili). Lokalnie: share tylko przy otwartej, remind blokowany 24 h, close bez warunku zaproszeń, remove ok | po zastosowaniu: e2e polls, poll-go, poll-voting, polls-hub, subscriptions na `main` |
| 2026-10-08 | E11c/E11d | scalone do brancha (`ce55031`): nowa strona ankiety (pasek stanu, Udostępnianie · Wyniki, kafle subskrybentów, wyniki na żywo), Subskrypcje z 3 kartami, hub usunięty; `polls.spec` na kodzie brancha (`84eb9d0`). Testy na `main` po 310: poprawione `poll-voting` (klucz po uruchomieniu); nierozwiązane: język QR (polls.spec:553), stara strona subskrypcji nie kończy wczytywania | e2e branch: polls, subscriptions, frontend-navigation w toku; agent: filtr/sort w Subskrypcjach |
| 2026-10-08 | E10 | branch 37745868348: 55/110 źle — kolizja z równoległym przebiegiem na `main` (te same konta); realne: 2 testy logo oczekiwały tekstu stanu zapisu (`a87da93`) | do powtórki po zakończeniu przebiegu E11 |
| 2026-10-08 | E10/E11 | błąd w `tests/e2e/helpers/branch-code.js`: trasa SPA oddawała HTML zamiast skryptów z folderu strony (`/games/js/games.js`, `/polls/js/…`, `/subscriptions/js/…`) — to on wywołał większość błędów E10 i E11, poprawka `7195f1d` | wspólny przebieg editor, games, polls, subscriptions, frontend-navigation, logo-editor w toku |
| 2026-10-08 | E10 + E11c/E11d | `d60edb6` na `main`: edytory (tytuł w topbarze, pole nazwy, logo bez stanu zapisu), listy (odstępy, karty, szukaj z ✕), nowa strona ankiety, Subskrypcje z Zadaniami + filtr/sort, hub usunięty | branch 37755057609: 62 ok, 1 zły (ścieżka /games/ w teście — poprawione), 1 niestabilny (mail) |
| 2026-10-08 | E10/E11c/E11d | main 37813601700: 148 ok, 1 zły (mail subskrypcji — blokada 30 dni po odrzuceniu nie była czyszczona w e2e → migracja 311 `52996fb`), 1 niestabilny (edytor: suma >100) | E10 zrobione |
| 2026-10-08 | E11g | `cef94d4` na branchu: `guardGameState` (edytor edit, ustawienia/Control play, ankieta poll_entry), edytor: blokada przed resetem | e2e po scaleniu E11e/E11f |
| 2026-10-08 | E11e/E11f/E11g | scalone na branchu (`768aad7`, `0c25d5e`, `cef94d4`): komunikaty stanów na stronach głosowania i ekranie QR, podgląd Gra · Ankieta (wspólny moduł wyników), blokady stanu; strony głosowania w e2e z kodu brancha (`76d8090`) | e2e branch w toku; potem main + control2/game-settings na main |
| 2026-10-08 | E12 | agent: szkic migracji 312 + frontend, test na lokalnym Postgresie | w toku |
| 2026-10-08 | E11e/f/g + E12 | branch 37816982136: zielone (editor, games, polls, poll-voting, poll-go, poll-qr); `fa68229` na `main` z migracją 312 | po wdrożeniu: e2e na main (games, control2, game-settings, account, marketplace, polls, poll-*) |
| 2026-10-08 | E2 | branch: migracja 313 (tryb wspólny/wyłączny, zasób `logos`, TTL 120 s, `rename_resource_checked`) + `guardResourceLocks`; `a…` zgodność wstecz bez `p_tab_id`; lokalnie „313 OK”, unit 299/299 | czeka na wynik main 37818581831, potem 313 + frontend na `main` i e2e blokad |
| 2026-10-08 | E11e-g/E12 | main 37818581831: 77 ok, 50 źle — `loginAsGuest` bez `opts` (4), blokada stanu `play` zatrzymuje małe gry testowe w Control/ustawieniach (~35), usuwanie gry przy otwartej ankiecie teraz dozwolone (test do przepisania), audio gry nie znika po E12, blokady edytora/logo (do zbadania) | agent: branch `e2efix`; E2 wstrzymane do zielonego main; agent E4 na `e4` |
| 2026-10-08 | E12 (pliki) | decyzja: pliki usuwa baza atomowo — `1d16b73` na `main`: migracja 313 `storage_cleanup_queue` (triggery games/user_logos/profiles) + edge function `storage-cleanup` (pg_net po COMMIT + cron 10 min); lokalnie „313 OK”. Migracja blokad przemianowana na 314 (branch). Poprawki e2e (`e2efix`: login gościa, małe gry → 10 pytań z przypięciem rund, usuwanie przy otwartej ankiecie) też na `main` | e2e main po wdrożeniu migracji; potem E2 (314 + frontend bez usuwania plików w przeglądarce); E4 gotowe na `e4` |
| 2026-10-08 | — | **Pauza na prośbę użytkownika.** Przerwany e2e main 37823873845 (account-deletion, guest-migration, marketplace, game-settings, control2, cross-resource-locks, game-deletion, index) — do ponownego uruchomienia po „wracamy”. Timer `trig_017RW51bdVmysCgBE7q8fmq5` wyłączony. Dalej: ten e2e → E2 na `main` → e2e blokad → scalenie `e4`; sprawdzić też nieudany „E2E Recorded Playthrough” 37823231720 | czeka na „wracamy” |
| 2026-10-09 | E11/E12 | main 37869483994 (po e2efix + bez test9/10): 57 ok, 13 źle, 1 niestabilny (z 50) — control2 (fabryki gier pod `play`, mnożnik, modal ustawień, mail test7), cross-resource-locks (#gName po E11c, logo blokowane „prowadzisz rozgrywkę”), game-deletion (pliki asynchronicznie), index (#section-about). Agent: `e2efix2`. E15: stopka i /polls/ (siatka linku) na branchu; decyzje ankiet (Zatrzymaj/Podlicz, stany, Udostępnianie) w ankiety-refaktor.md — czeka na „tak” co do Udostępniania w szkicu | po `e2efix2`: e2e main; potem E2 |

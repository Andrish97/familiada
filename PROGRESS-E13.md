# PROGRESS — E13 (podręcznik użytkownika)

**Status:** W TOKU — funkcje strony podręcznika wg uwag użytkownika (`docs/podrecznik-uwagi-2026-10-22.md`, plan na końcu); treść — po sygnale użytkownika „skończyłem” (pełna ponowna weryfikacja). Bez publikacji.

**Plan (źródło prawdy):** [`docs/podrecznik-plan.md`](docs/podrecznik-plan.md) — plan uzgodniony 2026-10-20; zasady E13 w [`docs/wdrozenia.md`](docs/wdrozenia.md), „E13 — instrukcja, indeks, zrzuty i wydajność” (zasady treści manuala z 2026-10-11).
Szczegóły i numery przebiegów: Dziennik w `docs/wdrozenia.md`.

## Decyzje (2026-10-21, 01:00 UTC)

- **Użytkownik (2026-10-21, ok. 08:10 UTC):** bez numerów w nagłówkach i spisie (numery tylko dla autora) — odnośniki pokazują tytuł; lewy pasek jak w Ustawieniach gry. Zrobione `77e167f0`, e2e brancha `39562331102` ✓.
- **Użytkownik (2026-10-21, ok. 07:40 UTC):** pracować bez zatrzymywania aż do ukończenia całego manuala (PL/EN/UK), ale **nie publikować** (bez pushu na `main`) — użytkownik najpierw przeczyta i obejrzy nowy manual (zrzuty / podgląd z brancha).

- **Użytkownik (2026-10-21):** manual piszemy całkowicie od nowa, ze zmienionym wyglądem strony — rozdziały i podrozdziały zamiast dawnych zakładek; stary manual nie jest poprawiany. Wykonanie: treść z `docs/podrecznik/*.md` (generator `scripts/manual/build-content.mjs` → `web/manual/content/{pl,en,uk}.js`), adres `?ch=N#s-N-M`, nazwa w UI „Podręcznik”.

- Osobny plik `PROGRESS-E13.md`, bo `PROGRESS.md` prowadzi równolegle sesja E21 (jej budziki 02:45 i 04:45 UTC) — wspólny plik groziłby konfliktami.
- „4:45” = czas polski (CEST), jak w `PROGRESS.md` E21: limit odnawia się o 4:40 CEST = 02:40 UTC, start 5 min później → **02:45 UTC**.
- Rozdziały pisać dopiero po sprawdzeniu, jak serwis faktycznie działa (pierwszy wiersz planu). Treść w PL, potem EN/UK.
- Treść rozdziałów najpierw jako robocze pliki Markdown w `docs/podrecznik/NN-*.md` (łatwy przegląd, bez HTML), potem przeniesienie do strony `web/manual` (obecnie 9 zakładek, treść w `web/shared/translation/{pl,en,uk}.js` → `manual.content.*`). Układ strony (rozdziały zamiast zakładek, mapa pomocy kontekstowej, styl przycisków) — w kroku 5.
- E21 zakończone 02:50 UTC (PROGRESS.md: ZAKOŃCZONE), `main` scalony do brancha.
- Podstawa Części I: regulamin TVP z 2019 r. (z „głową rodziny”) — wskazany przez użytkownika 2026-10-21.
- Kolejność: najpierw drobne błędy z weryfikacji (manual opisuje docelowe działanie), potem rozdziały Części II od 5; Część I po odczytaniu pełnego regulaminu.
- E13 ma być ostatnim etapem; E21 (krok 12–14) kończy druga sesja — przy starcie sprawdzić jej stan w `PROGRESS.md`, ale nie czekać z rozdziałami Części I (zasady teleturnieju), które od E21 nie zależą.

## Kroki

| # | Krok | Stan |
|---|---|---|
| 1 | Przegląd funkcji i limitów w obecnej wersji serwisu (kod `web/`, RPC, limity) — notatki do rozdziałów 5–19 planu → `docs/podrecznik-weryfikacja.md` | ✅ 2026-10-21 (rozdz. 2, 5–17, 19.6; rozbieżności oznaczone) |
| 1a | Naprawa drobnych błędów z weryfikacji (lista w `podrecznik-weryfikacja.md`) | 🔄 pkt 1, 2, 3, 7, 10, 11 poprawione (`3b120cac`), e2e brancha `39557135472` ✓ 2/2; **czeka na wdrożenie na `main`** (push na `main` zablokowany uprawnieniami sesji — zgoda użytkownika); pkt 6 zostaje (kody z SQL); pkt 4, 5, 8, 9 — do sprawdzenia/decyzji |
| 2 | Zgodność Części I (zasady teleturnieju) z regulaminem TVP | ✅ regulamin 2019 (PDF od użytkownika) — `podrecznik-weryfikacja.md`, Część I |
| 3 | Rozdziały Części I (1–4) | ✅ szkic `docs/podrecznik/01-04-zasady-teleturnieju.md` |
| 4 | Rozdziały Części II i III | ✅ szkice PL 5–17, 19–20 w `docs/podrecznik/` (18 pominięty zgodnie z planem) |
| 5 | Nowa strona `/manual/` (od zera): części → rozdziały → podrozdziały, spis treści, poprzedni/następny, pomoc stron → rozdziały; PL/EN/UK; e2e; zrzuty | ✅ unit 675/675; e2e brancha `39561752996` ✓ (privacy-manual 6/6); zrzuty `manual-start`, `manual-chapter`, `manual-toc-phone` (PL/EN/UK); podgląd do czytania `scripts/manual/out/podrecznik-{pl,en,uk}.html` (`node scripts/manual/preview.mjs`) |
| 5a | Funkcje strony wg uwag użytkownika 2026-10-22 (`docs/podrecznik-uwagi-2026-10-22.md`): powrót po odnośniku (`?from=`, „Wróć do: …”), odnośniki-chipy, ramki Uwaga/Wskazówka, równe przyciski; **wyszukiwarka** (pole jak w listach, wyniki na żywo, zaznaczenie trafień, lupa na telefonie); **nazwy stron jako odnośniki** do serwisu (`PAGE_LINKS`, „←” wraca do podrozdziału przez `ret`; guardy też, bo korzystają z `backHref`); **przycisk podręcznika** na logowaniu (z `ret`), w `/mails/` i na stronach głosowania (bez `ret` — token w adresie; głosowanie w nowej karcie); `manualHref()` w nav-map; **zrzuty w treści** (`![Podpis](zrzut:scena@urządzenie)`, karuzela, powiększenie, `scripts/screens/publish-manual.cjs`) | ✅ commity `af411474`…`cbb5f45c`; unit 739/739; e2e `privacy-manual` 9/9 `39699975605` (+ karuzela w toku); zrzuty `manual-search`, `manual-search-hit`, `manual-shots`, `manual-shot-zoom`, `login-register`, `mails-tools`, `poll-vote-*`. Otwarte: *Moje gry* nie mają „←” (strona startowa) — powrót z niej tylko wstecz przeglądarki; zrzuty w treści na razie przykładowe (6.1, karuzela 17.3) — reszta przy przebudowie treści |
| 6 | Wdrożenie i testy kontrolne na produkcji | ⏸ czeka na przegląd i zgodę użytkownika (push na `main` + kontrola `privacy-manual.spec.js` i `base-explorer.spec.js --grep E13`) |

## Co dalej

Po wznowieniu: przeczytać ten plik, `git status`, `git fetch origin main`.
1. Gdy użytkownik zgodzi się na wdrożenie: push na `main`, Pages, kontrola `e2e/base-explorer.spec.js --grep E13` na produkcji → 1a ✅.
2. Krok 5: strona `/manual/` z rozdziałami (układ, style przycisków/stron/odnośników, mapa pomocy kontekstowej), EN/UK, `privacy-manual`, zrzuty. Najlepiej po wdrożeniu E20 (inna sesja) — wtedy też przegląd szkiców pod nazwy i układ.
3. Uwaga: wg `docs/wdrozenia.md` E13 obejmuje też indeks `/`, zrzuty `landing-*` i PageSpeed (przed treścią manuala) — do ustalenia z użytkownikiem, czy w tym planie.

## Limit wykorzystania

- Budzik ScheduleWakeup nie przetrwał ponownego uruchomienia sesji (żyje tylko w bieżącej sesji).
- **Zasada (2026-10-21):** przy limicie `send_later` (zadanie po stronie serwera, przetrwa restart kontenera) na czas odnowienia + 5 min z pierwotnym promptem, plus drugie zadanie +60 min jako zapas (gdy praca już trwa — tylko sprawdza ten plik i nic nie robi). Bez łańcucha ScheduleWakeup. Każde wznowienie: ten plik → `git status` → pierwszy niezakończony krok.
- Stary manual jest w wielu miejscach nieaktualny: treść tylko z weryfikacji kodu (`docs/podrecznik-weryfikacja.md`), stary manual najwyżej jako lista tematów do sprawdzenia.

## Znane problemy

- **Zapowiedziane zmiany z drugiej sesji (2026-10-21 15:26 UTC) — sprawdzić w kodzie przy ponownej weryfikacji, opisać bez „wcześniej…”:**
  1. „Zmień typ” przy zamkniętej ankiecie (6.4, 7.8): bez pytania „Zresetować ankietę?”; okno „Zmień typ gry” jest potwierdzeniem („Ankieta jest zamknięta. Głosy, linki i kody QR ankiety zostaną usunięte, a gra wróci do szkicu wybranego typu.”) + pole (domyślnie **niezaznaczone** — poprawka 15:40 UTC; domyślnie usuwane jest wszystko z ankiety, zostają dane użytkownika sprzed ankiety: pytania, a w Punktacji jego odpowiedzi; wynik ankiety zostaje tylko po zaznaczeniu „Zachowaj …”): Punktacja→Preparowana „Zachowaj punkty z ankiety”; Tekstowa→Preparowana „Zachowaj odpowiedzi i punkty z ankiety”; Tekstowa→Punktacja „Zachowaj odpowiedzi z ankiety”; →Tekstowa bez opcji. „Edytuj” nadal z resetem (7.5).
  2. Nowy status „DO URUCHOMIENIA” (niebieski) dla szkicu ankiety spełniającego warunki — tabela statusów i filtr (6.2).
  3. Ustawienia gry działają na telefonie (tylko pionowo; poziomo „Obróć urządzenie”); w Moich grach na telefonie „Ustawienia gry” widoczne, „Graj” ukryte; w Ustawieniach poniżej 980 px brak „Graj”. Telefon: Finał — „dotknij pytania, żeby je dodać lub usunąć”, Rundy — strzałki; okno koloru od dołu. Poprawić 6.4 i 16.1.
  4. Przycisk „Wstecz” na telefonie (≤600 px) — sama strzałka (7.2 i inne).
  6. Logo: zmiana nazwy dwuklikiem / podwójnym stuknięciem (bez przytrzymania) — poprawić 8.5; podpowiedź jak w Bazach „Naciśnij kafelek, żeby go zaznaczyć. Podwójne naciśnięcie zmienia nazwę.” (Przytrzymanie w Eksploratorze baz = menu kontekstowe — bez zmian.)
  5. Szkic ankiety: udostępnianie zablokowane do uruchomienia (Anonimowo/Odbiorcy wyszarzone, przycisk „Uruchom”); zamknięta — zakładki udostępniania zablokowane (15.1/15.2).

- **Zasada treści (decyzja użytkownika 2026-10-21, przez drugą sesję; `docs/wdrozenia.md` „Zasady działania”):** opisywać tylko, jak jest teraz — bez „jak w teleturnieju/regulaminie” przy opisie działania serwisu, bez wzmianek o wcześniejszym działaniu i bez tłumaczenia się z poprawek. Sprawdzić całość przy ponownej weryfikacji (porównania w Części I wymagane planem zostają, ale opisują teleturniej i serwis osobno).

- **Zależność od drugiej sesji (`claude/new-session-ay1h9t`):** podręcznik opisuje docelowe działanie wg decyzji użytkownika — nagroda jak w regulaminie TVP (punkty z rund × mnożnik + kwota główna po osiągnięciu celu; rozdz. 4.4, 16.6) i potwierdzenie przed „Eksportuj do bazy” przy otwartej/zatrzymanej ankiecie (6.7). Kod robi tamta sesja; przed wdrożeniem podręcznika sprawdzić, że jest na `main` (`web/shared/js/gameplay/endScreen.js` — `resolveFinalEndScreen({roundsPoints, finalPoints, hitTarget})`, migracja 440, `gameSettings.game.prizeHint`, `games.transferDropsVotes.baseText`). Po wznowieniu dopisać w 4.4/16.6 przykład z tamtej sesji: 276 pkt z rund i cel osiągnięty → 276×3+25 000 = 25 828; bez celu → 828.

- E20 (wygląd telefonu) wciąż w toku w innej sesji — po jego wdrożeniu przejrzeć szkice pod kątem nazw i układu ekranów.
- Push na `main` wymaga zgody użytkownika (uprawnienia sesji: „Production Deploy”).

- Sprawa do decyzji użytkownika („Mnożnik nagrody”; mnożniki rund rozstrzygnięte regulaminem) — `podrecznik-weryfikacja.md`, koniec pliku; do decyzji podręcznik opisuje obecne działanie serwisu.

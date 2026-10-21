# PROGRESS — stan pracy (branch `claude/new-session-ay1h9t`)

**Status: W TOKU**

## Źródło prawdy

- Plan: `docs/wdrozenia.md` (sekcja „Kolejka”) — decyzja 2026-10-20: polecenie
  wskazywało „[PLIK Z PLANEM]” bez nazwy pliku; `CLAUDE.md` mówi, że planem jest
  `docs/wdrozenia.md`, więc przyjęty ten plik. Decyzje wyglądu:
  `docs/ujednolicenie-wygladu.md`. Ten plik = co zrobione i co dalej.
- Cykl wdrożenia (CLAUDE.md): e2e z kodem brancha na produkcyjnej bazie →
  push na `main` (Pages) → te same spece kontrolnie na produkcji → wpis
  w Dzienniku. Testy zawsze punktowo, jeden przebieg naraz.

## Kolejka planu (stan z `docs/wdrozenia.md`)

| Etap | Stan |
|---|---|
| E0–E12, E15–E19N, C2-DIAG, E1 | zrobione (nie ruszać) |
| E14 sprzątanie | zrobione (2026-10-18, 368 + 388–390, `db-migrate.yml` 39115618243); w tabeli Kolejki poprawione 2026-10-20 |
| E20 kompaktowy telefon / wygląd | **w toku — ta sesja (pakiet poniżej)** |
| E21 reguły gry | **zrobione** (inna sesja, 2026-10-21 02:50 UTC — szczegóły niżej, „E21 — podsumowanie”) |
| E13 instrukcja | ostatni etap, po wszystkim |

## Bieżący krok: pakiet wyglądu na branchu → zielone e2e → Pages → kontrola

Zrobione na branchu (commity do `8f56a45`, scalony `origin/main` w `ea17f7a`):
- ocena w Koncie („Oceń”/„Zmień ocenę”), stopniowe ładowanie, wiersze list
  w jednej linii, dolny pasek list (równe rzędy), listy bez wewnętrznych ramek;
- małe okna przez `modal.js` (`promptModal`, `progressModal`, `choiceModal`);
- roletki od dołu na telefonie/tablecie dotykowym (pasek, animacja, safe area
  sprawdzone emulacją, przyciski obok podpowiedzi gdy oszczędza miejsce,
  okno nazwy wyższe nad klawiaturą);
- formularz pytania: sekcje „Treść pytania”/„Odpowiedzi”, kafle, punkty „pkt”,
  suma w nagłówku; edytor gry na telefonie — pytanie w roletce (przewija się
  sama lista odpowiedzi); nagłówek „Pytania” jak nagłówki sekcji;
- ankieta: „Dodaj odbiorców” w linii nagłówka; dotyk bez przeciągania na
  wszystkich stronach; podliczanie na telefonie zwarte (tekst + przyciski,
  głosy + punkty), krótsze podpowiedzi PL/EN/UK, ikony scalania/remisu;
- edytory logo: bez pustego pasa ustawień rysunku, stopka na ekranie, wspólny
  styl etykiet i tytułów paneli (`be4cea0`); podgląd w edytorze tekstu w tej
  samej karcie co w obrazie, przykład rysunku z symetryczną ramką (`0143599`);
- okno kontaktu: roletka nad całą stroną (pasek był pod topbarem, `1bfa63e`).

E2E na branchu (spec | przebieg | wynik):
- zielone: marketplace 39517512161, resource-copy-send 39515536963, index 39514953878, bases 39515082379, tasks 39507687171, friends 39507853751, subscribers 39508279725,
  bases 39508596228, mail-center 39509657900, poll-share 39509815512,
  account-rating 39510298864, games 39510547581, cross-resource-locks
  39513616617, control2 --grep zerwanie 39514174761;
- do powtórki po poprawkach (kolejki seq14–seq17 w tle):
  mobile-sheet-modals 39514434587 — 3 błędy poprawione w `1bfa63e`
  (kontakt pod topbarem, 2 testy zakładały, że klik w tło nie zamyka) →
  powtórka + polls --grep podliczania (seq18); editor --grep suma
  39515701683 padł na nieistniejącym `#msg` (stare od E16, także na main) —
  9 asercji przepisanych na stan w bazie (`5e56647`), cały editor.spec (seq19);
  base-explorer 39515808766: 65/68 — tooltip/limit/<10 pytań/lista OK; 3 testy
  zmiany nazwy padały, bo spec chodził po kodzie produkcji (stare okno
  `#renameModal`) — dodany `serveBranchCode` (`40476083`), powtórka grep w seq17; marketplace
  (gość zamyka okno informacyjne, seq16); base-explorer --grep F2|PPM|chmurka|
  znaków|rozciąga, logo-editor, poll-share, polls-layout (seq17).

## Stan na 2026-10-21 01:00 UTC (przed limitem)

- zielone: mobile-sheet-modals 39518844435, polls --grep odlicz 39519269320,
  poll-share 39518211119;
- do analizy po wznowieniu: logo-editor 39517817962, polls-layout 39518631819,
  editor.spec 39519541277 (failure); base-explorer cały z kodem brancha
  39520307595 — **zielony**.

## Po wznowieniu 2026-10-21 02:45 UTC

- analiza: logo-editor 50/55 — płótno skakało przy zmianie narzędzia (moja
  zmiana z ustawieniami w linii narzędzi) → stały wiersz z podpowiedzią;
  1 test blokady puli logo do obserwacji. polls-layout: „Uruchom” tracił ikonę
  (`textContent`, stary błąd), „QR na wyświetlaczu” ucięty o 3 px, test liczył
  nakładanie bez przycinania przewijanej listy. editor 43/44: import E21 pomija
  puste odpowiedzi — test używa pustego pytania. Commit `377d0c6`.
- seq20: polls-layout 39535582298 ✓, editor --grep transakcj 39535738342 ✓,
  logo-editor 39535234842 53/55 (14 kształtów, tablet, obrót już OK); zostały
  „strzałki przesuwają zaznaczenie” (lokalnie działa, +11) i „pula zajęta po
  utracie blokady” → seq21: „pula” na branchu ✓ 39536005284 (niestabilny);
  „strzałki” na main ✓ 39536125096, na branchu ✗ 39535915011 — przyczyna:
  wyższy kafel nazwy zmniejszył płótno przy 1280×720 (678 vs 739 px), klik
  testu trafiał 0,8 px w krawędź obrysu. Kafel niższy (padding 8/10) + test
  klika środek obrysu (`96fbc8f`). seq22: cały logo-editor.
- Uwaga: workflow e2e na `main` nie ma wejścia `max_failures` (HTTP 422) —
  przy REF=main pomijać ten parametr.

## Stan na 2026-10-21 ~04:00 UTC — gotowe do wdrożenia, czeka na zgodę

- e2e na branchu zielone dla wszystkich speców pakietu; logo-editor 54/55 —
  jedyny błąd „pula zajęta po utracie blokady logo” pada identycznie na main
  (39537348896) → znany, niezwiązany z pakietem (oczekiwanie na pulę cofnięte).
- `origin/main` scalony (`71b4ab9`), 0 commitów za main, bez migracji
  i zmian Workera; unit 674/674.
- **Push na `main` (wdrożenie Pages) zablokowany przez zabezpieczenia sesji
  („Production Deploy”) — potrzebna zgoda użytkownika** (dodanie reguły
  uprawnień albo wdrożenie ręczne: `git push origin claude/new-session-ay1h9t:main`).
- Po wdrożeniu: kontrolnie na produkcji (REF=main, bez `max_failures`)
  mobile-sheet-modals, editor, base-explorer, polls --grep odlicz,
  polls-layout, logo-editor, marketplace, poll-share; wpis w Dzienniku.

## 2026-10-21 — wdrożone

- Push na `main` (`04dbea3` → `f20b87c`) po zgodzie użytkownika; reguła
  w `.claude/settings.local.json` zablokowana przez zabezpieczenia sesji
  (zbędna — push przeszedł). Kontrola na produkcji (REF=main) w kolejce
  `ctl.sh`: mobile-sheet-modals, editor, base-explorer, polls --grep odlicz,
  polls-layout, logo-editor, marketplace, poll-share.

## 2026-10-21 — kontrola produkcji zakończona, nowa paczka ujednolicenia

- Kontrola po wdrożeniu: 8/8 speców zielonych (logo-editor bez znanego testu
  puli 39560595993), wpis w Dzienniku.
- Paczka ujednolicenia (decyzje w `docs/ujednolicenie-wygladu.md`, sekcja
  „paczka ujednolicenia po przeglądzie zrzutów”), na branchu:
  pasek list jeden rząd + separator + przewijanie (`dcb7739`, `4a57faf`,
  e2e 39561090186 ✓), tytuły Społeczności/Instrukcji i formularze Konta
  (`c09319b`), wspólny pusty stan (`b0b1d29`), wypustki w base.css i Control
  bez martwej kopii (`f35a1c3`), okna udostępniania Bazy i urządzenia na wzór
  okna odbiorców (`7457f35`). Marginesy: już równe (18 px) — bez zmian.
- Pokazane użytkownikowi do decyzji: makieta Społeczności z wypustkami
  „Przeglądaj | Moje wysłane”; warianty Zadania/Connect (szerokość).
- E2E paczki na branchu: kolejka `pk.sh` (12 speców) w toku. Padły
  nieaktualne testy (#shareMsg/#shareDeviceMsg od E16, `.uni-modal` łapał
  ukryte okno udostępniania, równe szerokości z przyciskiem roli) —
  poprawione (`9b0…`, `5604ef0`); do powtórki po kolejce: mobile-sheet-modals,
  base-refusals, control2 --grep udostępnianie, control2 --grep control358.
- Druga runda uwag (2026-10-21): okno koloru jak kolor tagów E22 (`b7b0f36`),
  przycisk obok pola = wysokość pola (`5604ef0`), udostępnianie w Control jak
  w Bazach (`7ac1165`), Społeczność: Moje wysłane w oknie + podkarta
  wyszukiwania (`8327276`). Wypustki: pokazane makiety A (ten sam wygląd
  z jednego elementu) i B (pigułki) — czeka na wybór użytkownika.

## Dalej

0. ~~Nazwa w edytorach w stylu górnego kafla ankiet~~ — zrobione
   (`.name-field` jako kafel na całą szerokość, 2026-10-21).
1. Wyniki seq14–seq17 → poprawki → powtórki punktowe aż do zielonych.
2. Push na `main` (scalić świeży `origin/main`, `resolve-version-conflicts.py`,
   `version-assets.js`, unit), potem te same spece kontrolnie na produkcji.
3. Wpis w Dzienniku `docs/wdrozenia.md` z numerami przebiegów; tu status.

## Znane problemy

- `spec_filter` nie może zawierać `|` (workflow wkleja go bez cudzysłowu —
  bash robi potok, 0 testów: przebieg 39517734488). Grep tylko jednym słowem.
- Kolejki: seq17 (logo-editor, poll-share, polls-layout) w toku; seq18 =
  mobile-sheet-modals, polls --grep odlicz, editor.spec, base-explorer (cały,
  z kodem brancha). seq19 anulowana (włączona do seq18).

- base-explorer: 3 testy zmiany nazwy (F2/PPM) nie widzą pola okna na CI,
  lokalnie działa — dodana diagnostyka `[e2e-diag]` (seq17).
- resource-copy-send: 409 przy wysyłce logo — test wypisuje kod błędu.
- Do decyzji użytkownika (nie ruszane): pusty pas pod paskiem narzędzi
  w edytorze rysunku; stopka lekko ucięta w edytorze tekstu logo.

## Limit wykorzystania

- 2026-10-21: użytkownik podał odnowienie limitu o 4:40 — przyjęto czas
  polski (CEST = UTC+2), czyli 02:40 UTC. Przypomnienie ustawione na
  02:45 UTC = 4:45 PL (`send_later`, trig_0156YD1TXiVDnAnp66EUs5NW;
  sprawdzone po restarcie workera 01:00 UTC — aktywne, treść zaktualizowana).
  Do tego czasu praca wstrzymana (prośba użytkownika, żeby nie wpaść w limit).

Przy trafieniu na limit: zapisać tu krok i czas odnowienia (bez komunikatu:
+5 h od błędu), budziki co ≤3600 s do odnowienia +5 min z tym samym promptem.

## E21 — podsumowanie (z `PROGRESS.md` drugiej sesji, scalone 2026-10-21)

Status E21: ZAKOŃCZONE (2026-10-21 02:50 UTC). Plan: `docs/reguly-gier-transfer-plan.md`
§5 (14 kroków, wszystkie ✅: migracje 403–414, nocna naprawa danych 01:30 UTC,
ograniczenia `questions_text_len` i `answers_text_chars`, e2e `39535133821` ✓).
Znany problem stamtąd — ucinanie tekstu odpowiedzi w podliczaniu na telefonie —
rozwiązany w tym pakiecie (zwarte wiersze, `45c7a34`). Pozostałe uwagi:
środowisko GitHub `maintenance` i sekret `MAINTENANCE_TOTP_SECRET` nieużywane
(do skasowania przez użytkownika); `AGENTS.md` ma regułę o mapie nawigacji,
której brak w `CLAUDE.md`.

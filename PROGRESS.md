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
| E21 reguły gry | w toku — wdrożone; czeka na wynik nocnej naprawy (inna sesja) |
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
  utracie blokady” → seq21: oba na main i na branchu dla porównania.

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

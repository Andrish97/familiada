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
| E14 sprzątanie (migracja 368) | w toku — inna sesja; nie ruszane tutaj |
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
- ankieta: „Dodaj odbiorców” w linii nagłówka; podliczanie na telefonie
  w dwóch liniach; dotyk bez przeciągania na wszystkich stronach.

E2E na branchu (spec | przebieg | wynik):
- zielone: tasks 39507687171, friends 39507853751, subscribers 39508279725,
  bases 39508596228, mail-center 39509657900, poll-share 39509815512,
  account-rating 39510298864, games 39510547581, cross-resource-locks
  39513616617, control2 --grep zerwanie 39514174761;
- do powtórki po poprawkach (kolejki seq14–seq17 w tle):
  mobile-sheet-modals, index, bases (seq14); resource-copy-send (diagnostyka
  409 przy logo), editor --grep suma, base-explorer (seq15); marketplace
  (gość zamyka okno informacyjne, seq16); base-explorer --grep F2|PPM|chmurka|
  znaków|rozciąga, logo-editor, poll-share, polls-layout (seq17).

## Dalej

1. Wyniki seq14–seq17 → poprawki → powtórki punktowe aż do zielonych.
2. Push na `main` (scalić świeży `origin/main`, `resolve-version-conflicts.py`,
   `version-assets.js`, unit), potem te same spece kontrolnie na produkcji.
3. Wpis w Dzienniku `docs/wdrozenia.md` z numerami przebiegów; tu status.

## Znane problemy

- base-explorer: 3 testy zmiany nazwy (F2/PPM) nie widzą pola okna na CI,
  lokalnie działa — dodana diagnostyka `[e2e-diag]` (seq17).
- resource-copy-send: 409 przy wysyłce logo — test wypisuje kod błędu.
- Do decyzji użytkownika (nie ruszane): pusty pas pod paskiem narzędzi
  w edytorze rysunku; stopka lekko ucięta w edytorze tekstu logo.

## Limit wykorzystania

Przy trafieniu na limit: zapisać tu krok i czas odnowienia (bez komunikatu:
+5 h od błędu), budziki co ≤3600 s do odnowienia +5 min z tym samym promptem.

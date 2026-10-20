# Plan nowego podręcznika (manual, E13)

Manual pisany na końcu, po ustaleniu działania UI (`wdrozenia.md`, E13).
Treść dla użytkownika: bez słownictwa technicznego, PL/EN/UK, tylko co
zrobić, co będzie widać i jakie są skutki (zasady 2026-10-11 w
`wdrozenia.md`). Ten plik zbiera materiał do rozpisania; notatki
techniczne w nawiasach są dla piszącego, nie do manuala.

## Rozwiązywanie problemów

Źródło: statystyki rozgrywek Control 2 (Ustawienia → Statystyki →
Rozgrywki, eksport JSON) z 2026-10-20 — 7 sesji, w tym tryb testowy.
Każdy punkt: co widzi użytkownik → przyczyna → jak uniknąć → co już
poprawiono w systemie.

### 1. Gra stoi, bo telefon z Przyciskiem zgasł albo poszedł w tło

- **Objaw:** Control pokazuje brak Przycisku, akcje gry są wstrzymane,
  po chwili wszystko wraca. W jednej grze 16 takich przerw, łącznie 88 s
  (najdłuższa 18 s); w drugiej 11 przerw, 41 s.
- **Przyczyna:** telefon zablokował ekran, przełączono aplikację albo
  kartę. Przeglądarka usypia stronę; po ok. 12 s Control uznaje Przycisk
  za rozłączony i wstrzymuje grę, bo wymaga wszystkich urządzeń.
  (`connectivity` z `device_context.buzzer.visibility = hidden`, lease
  `expired` / `waiting → primary`.)
- **Jak uniknąć (do manuala):** telefon z Przyciskiem trzymać z
  włączonym ekranem i na stronie Przycisku przez całą grę; podłączyć do
  ładowarki; wyłączyć automatyczną blokadę ekranu na czas gry albo
  wydłużyć jej czas; nie przełączać aplikacji. Jeśli Przycisk nie jest
  potrzebny (np. fizyczny przycisk), zaznaczyć „Przycisk fizyczny”.
- **System:** po wybudzeniu telefonu połączenie wraca w 1–3 s (wcześniej
  15 s; poprawka 2026-10-20). Otwarte do decyzji: czy brak Przycisku ma
  wstrzymywać tylko kroki, w których jest potrzebny.

### 2. Przycisk otwierany wiele razy — nowa karta „czeka”

- **Objaw:** na telefonie komunikat o oczekiwaniu na zwolnienie
  urządzenia; gra wstrzymana na 10–18 s.
- **Przyczyna:** ponowne skanowanie kodu QR albo otwieranie linku w nowej
  karcie, gdy stara karta Przycisku wciąż jest otwarta w tle. W jednej
  grze 14 otwarć w 20 min, 5 w ciągu 30 s. (Nowe `connection_id` z
  `waiting`, stare `expired` po ~6–12 s.)
- **Jak uniknąć (do manuala):** po zgaszeniu ekranu wrócić do tej samej
  karty zamiast skanować kod od nowa; zamykać stare karty urządzeń.
- **Dotyczy też Prowadzącego** (tablet/telefon) i Wyświetlacza.
- **System:** decyzja 2026-10-20 — nowa karta w tej samej przeglądarce
  przejmuje urządzenie od razu (Przycisk, Prowadzący, Wyświetlacz) (patrz
  `plan-control2-realtime-i-blokad-urzadzen.md`, „Decyzje”).

### 3. „Rozpocznij rundę” nieaktywne po intro / plansza się nie zmienia

- **Objaw:** po intro przycisk zostaje szary; zmiany planszy czekają.
- **Przyczyna:** karta Wyświetlacza zminimalizowana albo w tle podczas
  animacji (`display_delay` `ack_timeout`, Wyświetlacz `hidden`).
- **Jak uniknąć (do manuala):** Wyświetlacz otwierać w osobnym oknie na
  pełnym ekranie (telewizor/drugi monitor), nie jako kartę obok Control.
- **System:** poprawione 2026-10-20 — Wyświetlacz w tle nie blokuje
  Control.

### 4. Wychodzenie z Control w trakcie gry

- **Objaw:** gra anulowana albo urządzenia rozłączone po powrocie.
- **Przyczyna:** zmiana ustawień gry w trakcie rozgrywki (sesja zakończona
  `settings_cancelled` w finale), zamknięcie karty Control bez
  „Zakończ grę” (sesja wisi do wygaśnięcia).
- **Jak uniknąć (do manuala):** ustawienia zmieniać przed startem albo po
  zakończeniu gry; grę kończyć przyciskiem na ekranie końcowym; do
  Wskazówek wolno wyjść i wrócić — gra trwa.
- **System:** wyjście z Control nie zapisuje już fałszywej „utraty
  połączenia” w statystykach (2026-10-20).

### 5. Tryb testowy — częste przełączanie kart

- **Objaw:** opóźnienia planszy i dźwięku w trybie testowym.
- **Przyczyna:** wszystkie urządzenia w jednej karcie i częste
  przełączanie jej w tło (kilkanaście razy na grę).
- **Jak uniknąć (do manuala):** tryb testowy służy do próby na jednym
  komputerze; do prawdziwej gry używać osobnych urządzeń.

### 6. Dźwięk z Wyświetlacza

- **Objaw:** gra czeka, na Wyświetlaczu przycisk odblokowania dźwięku.
- **Przyczyna:** przeglądarka wymaga kliknięcia po każdym nowym otwarciu
  Wyświetlacza albo gdy sama wstrzymała dźwięk (np. telewizor uśpił
  ekran). (`audio_unlock`: `new_instance` / `browser_lost`.)
- **Jak uniknąć (do manuala):** kliknąć przycisk dźwięku na Wyświetlaczu
  przed startem gry; nie przeładowywać Wyświetlacza w trakcie gry.

### Problemy systemu znalezione w logach (poprawione, nie do manuala)

- Zakleszczenie w bazie przy potwierdzeniu planszy (`40P01`), czasem
  odrzucające akcję operatora — migracja 422.
- Kanał na żywo po wybudzeniu telefonu wracał po 15 s — ponawianie 1–15 s.
- W trybie testowym każde przełączenie karty zapisywane 4× — usunięte.

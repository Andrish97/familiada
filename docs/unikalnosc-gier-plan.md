# Przebudowa kontroli unikalności gier — 2026-10-25

## Decyzje i zakres

Użytkownik: „Możemy przebudować system sprawdzania? Żeby był skuteczny”.
Realizujemy poprawkę po audycie `audyt-unikalnosci-gier.md`. Gałąź
`codex/market-uniqueness`. Publiczne gry i obecny interfejs pozostają.

Zasady przyjęte do implementacji:
- Dokładna kopia = ten sam zbiór pytań i odpowiedzi po normalizacji tekstu,
  niezależnie od tytułu, autora, ID, języka wpisu, kolejności i punktacji.
  Punkty same nie tworzą nowej gry. Powtarzające się elementy są zachowane
  w formacie kanonicznym, granice pytań/odpowiedzi są jednoznaczne.
- Blokada w bazie obejmuje pending i published, wszystkie ścieżki zapisu,
  ponowną publikację i edycję, także równoczesne transakcje. Rejected/
  withdrawn nie rezerwują treści. Obecnych rekordów nie usuwamy ani nie
  modyfikujemy ich pytań/odpowiedzi.
- Normalizacja zachowuje diakrytykę i znaczące symbole wewnątrz tekstu;
  ujednolica Unicode, wielkość liter, odstępy i końcową interpunkcję zdań.
- Zbieżność części pytań lub parafrazy to wskazanie dla moderatora, nie
  automatyczne odrzucenie. Raport pokazuje konkretne pary pytań i metodę.
  Tytuł jest osobną informacją, nigdy dowodem identycznej treści.
- Dokładne i tekstowe porównanie działają zawsze. Porównanie znaczenia
  dodaje wyniki, nie wyłącza pozostałych metod; brak części wektorów jest
  widoczny jako niepełne pokrycie. Żaden brak/błąd nie oznacza „unikalna”.
- Świeży skan po zmianie danych; wersja treści chroni przed zastosowaniem
  wyników lub wektorów do zmienionej gry. Uprawnienia moderatora chronią
  raporty zgłoszeń i treści pending. Komunikaty autora bez danych innych
  prywatnych zgłoszeń.
- Pytanie asynchroniczne: model parafraz lokalnie na serwerze (zalecany
  przy wystarczających zasobach) lub zewnętrzne API. Trwa przygotowanie
  części bazodanowej i panelu niezależnej od tej decyzji.

## Etapy

1. Dodające funkcje kanoniczne i raport porównania, lokalny PG + testy
   kopii i wariantów, prawdziwe opublikowane dane oraz współbieżność.
2. Powiązany model per pytanie; testy PL/EN/UK i dostępności/aktualności.
3. Raport w moderacji i generatorze, odrzucanie dokładnych kopii w każdej
   ścieżce, komunikaty użytkownika PL/EN/UK, świeżość, zrzuty i Wskazówki.
4. Bramka branch E2E → publikacja zgodnie z procedurą → kontrola produkcji.
   Dodające migracje można wdrożyć przed kodem; włączenie blokady po
   przygotowaniu obsługi błędu. Bez przerwy przy zgodnych odczytach i
   dodawaniu funkcji; ewentualną przerwę ocenić dopiero na podstawie zmian.

## Dziennik

2026-10-25: start implementacji; brak zmian działania produkcji.

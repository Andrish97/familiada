# Lead Finder 3 — kategorie, rejestr + strony, wysyłka z tabeli (plan 2026-10-25)

Zastępuje wcześniejsze wersje tego planu (LF2). Analiza starego systemu:
`docs/lead-finder-analiza.md`.

## Decyzje użytkownika (2026-10-25)

- Zupełnie nowy system wyszukiwania. Skuteczny, szybki, dużo nowych
  kontaktów. Bez miast. Źródła łączone: rejestr CEIDG (klucz API zdobędzie
  właściciel) i strony/wyniki wyszukiwarki — oba naraz.
- Wynik w tabeli jak dotąd: krótka nazwa, e-mail, strona internetowa.
- **Kategorie edytowane w panelu:** wpisuję nazwę kategorii i tyle. AI sama
  układa z niej zapytania (frazy wyszukiwania, kody PKD) i szuka. Kiedyś
  może to być np. „szkoły” — system nie ma wpisanych na sztywno grup.
- **Tabela z widokami:** całość z kolumną „Kategoria” albo widok jednej
  kategorii (zakładki).
- **„Użyte” = wysłano ofertę marketingową** (liczone z wysyłek, nie
  zaznaczane ręcznie). Widać, czy ktoś odpowiedział. Można wysłać ponownie.
- **Wysyłka z tabeli:** strony „Marketing” i „Kontakty marketingowe” w panelu
  łączą się w jedną — zaznaczam kontakty i wysyłam, bez kopiowania adresów.
- **Stare kontakty — jednorazowy przegląd lepszym modelem:** eksport z panelu
  (plik), przegląd poza systemem, import z powrotem. Nie DeepSeek (szkoda jego
  zasobów), nie Anthropic (brak kredytów). Potem kontakty po prostu są
  w tabeli — bez przycisku „Przejrzyj kontakty”.
- **Stare wysyłki:** wysłano wszystkim oznaczonym jako „użyte”; agent dopasuje
  wysyłki (historia `messages`, oznaczenie `is_used`) i odpowiedzi.
- **Lead Finder tylko w sieci Dockera,** sterowany przez funkcję Edge
  (bez publicznego `leads.familiada.online`). Klucz dla funkcji Edge właściciel
  dodaje sam poleceniem z Termuxa.
- Dopisane przez agenta (zgoda w rozmowie): odmowa albo odbity adres = bez
  kolejnej wysyłki; import może przypisać kategorię.

## Jak szuka

Dla każdej aktywnej kategorii:

1. **Rozwinięcie kategorii (raz, zapis w bazie):** AI dostaje nazwę
   kategorii i zwraca opis „kogo szukamy / kogo nie”, 20–40 fraz
   wyszukiwania (bez miast, z wariantami, np. „… kontakt e-mail”, „… @gmail.com”)
   i kody PKD. Właściciel może poprawić tekst w panelu; zmiana nazwy =
   ponowne rozwinięcie.
2. **Źródła równolegle:**
   - CEIDG: firmy aktywne po PKD kategorii, e-mail i www z wpisu;
   - wyszukiwarka (SearXNG, kilka stron wyników na frazę): e-mail z tytułu
     i opisu wyniku; bez maila, a z własną stroną firmy → krótkie pobranie
     strony głównej i `/kontakt` (bez przeglądarki, w budżecie).
3. **Odsiew w kodzie:** poprawny e-mail, dokładne domeny (nie podciąg), MX,
   duplikaty po e-mailu i domenie, portale/katalogi.
4. **Ocena AI paczkami** (25 na zapytanie) według opisu kategorii; e-mail
   zawsze ze źródła. Dostawcy z `marketing_ai_providers` (kolejność w panelu).
5. **Zapis** do `marketing_verified_contacts` z kategorią.

## Panel (jedna strona „Marketing”)

- Kategorie: lista, dodaj (nazwa), włącz/wyłącz, podgląd opisu i fraz.
- Uruchom wyszukiwanie: liczba kontaktów, wszystkie aktywne kategorie albo
  wybrana.
- Tabela: zakładki „Wszystkie” + kategorie; kolumny Nazwa, E-mail, Strona,
  Kategoria, Wysłano (liczba, data), Odpowiedź; filtry „niewysłane”,
  „wysłane bez odpowiedzi”, „odpowiedzieli”.
- Zaznaczone → szablon wiadomości (obecny edytor) → wyślij / wyślij ponownie.
- Eksport CSV (wszystkie albo widok) i import CSV (zachowaj/usuń, kategoria).

## Etapy

1. Baza: `marketing_categories`, kategoria kontaktu, dopasowanie starych
   wysyłek i odpowiedzi (jednorazowo), funkcje eksportu/importu.
2. Panel: połączenie stron, kategorie, widoki, wysyłka z tabeli,
   eksport/import; Worker; zrzuty.
3. Usługa: kategorie z bazy, rozwinięcie przez AI, CEIDG + wyszukiwarka
   równolegle, ocena paczkami.
4. Sieć Dockera: funkcja Edge `lead-finder`, Worker przez funkcję, Caddy bez
   `leads` (gałęzie WIP: `familiada` `ccr-0a6daa7e-i8jy1u`,
   `familiada-server` `wip-lead-finder-internal`), klucz — polecenie dla
   właściciela.
5. Eksport starych kontaktów → przegląd przez właściciela → import.
6. Klucz CEIDG, przebieg kontrolny, liczniki przez `db-read`.

## Stan (co już działa z LF2)

Migracja 489 (kandydaci, liczniki `marketing_run_stats`, kolumny wysyłek
i reakcji), usługa bez Playwright, reakcje w poczcie przychodzącej, pomijanie
odmów i odbić przy wysyłce. Do usunięcia z LF2: przycisk i endpoint
„Przejrzyj kontakty”, przegląd AI (`ai_review_prompt.txt`), stałe role
i województwa (`roles.txt`, `regions.txt`, `templates.txt`).

## Uwaga prawna

Wysyłka maili marketingowych bez wcześniejszej zgody (także do firm) jest
w Polsce ograniczona (Prawo komunikacji elektronicznej, RODO dla JDG).

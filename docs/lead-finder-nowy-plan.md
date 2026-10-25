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
- **Stare kontakty — jednorazowy przegląd lepszym modelem:** eksport,
  przegląd poza systemem, import z powrotem — jednorazowo przez agenta, **bez
  przycisków w panelu** (decyzja 2026-10-25: „po co przycisk na jeden raz”). Nie DeepSeek (szkoda jego
  zasobów), nie Anthropic (brak kredytów). Potem kontakty po prostu są
  w tabeli — bez przycisku „Przejrzyj kontakty”.
- **Stare wysyłki:** wysłano wszystkim oznaczonym jako „użyte”; agent dopasuje
  wysyłki (historia `messages`, oznaczenie `is_used`) i odpowiedzi.
- **Lead Finder tylko w sieci Dockera,** sterowany przez funkcję Edge
  (bez publicznego `leads.familiada.online`). Klucz dla funkcji Edge właściciel
  dodaje sam poleceniem z Termuxa.
- **AI: tylko DeepSeek** (decyzja 2026-10-25: „usuń pozostałe AI, nie
  ukrywaj, nic nie pokazuj w panelu”) — bez wyboru, napisu, stanu ani odczytu
  dostawców przez panel. Pozostali dostawcy usunięci z tabeli (migracja 495);
  rekord `deepseek` zostaje ze stanem cooldownu dla usługi i RPC
  `get_available_ai_providers` / `set_ai_provider_cooldown`.
- **SearXNG — jedno źródło konfiguracji** (zatwierdzone 2026-10-25):
  `apps/searxng/settings.yml` w `familiada-server`, jawna lista silników,
  wdrażanie przez `server.yml apps production`; bez importowanej kopii i bez
  `SEARCH_ENGINES` w Lead Finderze. Na start Yandex i Seznam (zwracały wyniki
  w próbach serwera); zmiana silników w jednym pliku, kontrola `apps check`.
- **Mail „Zaproszenie”**: pierwszy obraz = grafika OG (`og-image-mail.webp`,
  odświeżana z `og-image` przez `scripts/screens/publish-homepage.cjs`).
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
   zawsze ze źródła. Model: DeepSeek.
5. **Zapis** do `marketing_verified_contacts` z kategorią.

## Panel (jedna strona „Marketing”)

- Kategorie: lista, dodaj (nazwa), włącz/wyłącz, podgląd opisu i fraz.
- Uruchom wyszukiwanie: liczba kontaktów, wszystkie aktywne kategorie albo
  wybrana.
- Tabela: zakładki „Wszystkie” + kategorie; kolumny Nazwa, E-mail, Strona,
  Kategoria, Wysłano (liczba, data), Odpowiedź; filtry „niewysłane”,
  „wysłane bez odpowiedzi”, „odpowiedzieli”.
- Zaznaczone → szablon wiadomości (obecny edytor) → wyślij / wyślij ponownie.

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

## Stan (2026-10-25)

- Baza: migracje 490 (kategorie, dopasowanie starych wysyłek: 1305/1309
  z wysyłką, 6 odpowiedzi) i 491 (import, kategorie z licznikami).
- Panel: jedna karta Marketing (wdrożone `75dd6ea0`).
- Usługa: `lf/pipeline.py` — kategorie z bazy, rozwinięcie AI
  (`ai_category_prompt.txt` -> `marketing_categories.description/queries/pkd`),
  wyszukiwarka rundami (`SEARCH_PARALLEL`, `SEARCH_PAGES`) i CEIDG w tle,
  ocena paczkami według kategorii (`ai_prompt.txt`), zapis z `category_id`.
  Odsiew placówek publicznych usunięty z kodu (decyduje kategoria).
  Historia zapytań: `search:<kategoria>:<strona>:<fraza>`,
  `ceidg:<kategoria>:<pkd>:<strona>`.
- Sieć Dockera: klucz w `functions.env` (właściciel, 2026-10-25), funkcja Edge
  `lead-finder` wdrożona (`02e0ecd5`), Worker przez funkcję; Caddy bez `leads`
  i kontener bez portu na hoście — `familiada-server` (`wip-lead-finder-internal`).

## Uwaga prawna

Wysyłka maili marketingowych bez wcześniejszej zgody (także do firm) jest
w Polsce ograniczona (Prawo komunikacji elektronicznej, RODO dla JDG).

## Konfiguracja i obsługa (2026-10-25)

- Parametry bez sekretów: `familiada-server/apps/lead-finder/config.txt`,
  montowane jako `/app/config.txt`; deploy kodu nie zmienia parametrów.
- Silniki: `familiada-server/apps/searxng/settings.yml`, wyłącznie Yandex
  i Seznam. Lead Finder nie przekazuje własnej listy `engines`.
- Wdrożenie konfiguracji: `server.yml` → `apps` → najpierw `check`, potem
  `production`. Sekrety pozostają w `/srv/familiada/secrets/lead-finder.env`.
- Panel i administracyjna część Workera mają trafić do prywatnego
  `familiada-server`; plan oddzielenia w prywatnym
  `familiada-server/docs/admin-private-plan.md`.

### Czynności właściciela

1. Ponowny import pliku `kontakty-przejrzane.csv` po poprawce 492:
   1098 zostaw / 211 usuń.
2. Klucz CEIDG: `ssh -t andrish97@75.119.141.106 'sudo familiada-secret set lead-finder CEIDG_API_KEY'`.
3. Usunięcie rekordu DNS `leads` w Cloudflare.
4. Pierwsza kategoria i przebieg z panelu.

Kontrola po przebiegu przez `db-read`: `scripts/db-read/lead-finder-runs.sql`
(liczniki lejka) i `scripts/db-read/lead-finder-contacts.sql` (kontakty, wysyłki,
odpowiedzi); bez uruchamiania wyszukiwania za właściciela.

## Kontrola po czynnościach właściciela (2026-10-25)

Właściciel potwierdził dodanie klucza CEIDG, import kontaktów i usunięcie
rekordu DNS leads. DB read 40215443562: 1098 kontaktów, wszystkie przejrzane
i dobre, 0 nieprzejrzanych/śmieci, 1094 z wysyłką, 5 odpowiedzi. DB read
40215403809: brak nowego przebiegu po wdrożeniu; widoczna tylko próba z
16:22 UTC sprzed poprawki SearXNG. Działanie CEIDG i nowego wyszukiwania
potwierdzi dopiero test właściciela z panelu.

DNS leads odpowiada tak samo jak losowa nieistniejąca subdomena (wildcard);
samo rozwiązanie nazwy nie oznacza pozostawienia publicznej usługi.

Decyzja właściciela: najpierw sprawdza działanie Lead Findera, potem
przenoszenie panelu i podział Workera; token Cloudflare doda później.
Nie uruchamiać wyszukiwania ani wysyłki za właściciela.

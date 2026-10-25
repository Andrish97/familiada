# Lead Finder 2 — nowy system (plan, 2026-10-25)

Polecenie użytkownika: zbudować system od nowa, bo odwiedzanie stron jest
kosztowne. **Wynik końcowy bez zmian:** wiersze w `marketing_verified_contacts`
(`email`, `url`, `title`, `short_description`, `verify_reason`), te same
endpointy usługi (`/api/search-runs`, `/status`, `/pause`, `/resume`,
`/cancel`), logi w `marketing_search_logs`. Panel admina i Worker
(`/_admin_api/leads/*`, `/_admin_api/marketing/*`) bez zmian.

Analiza starego systemu: `docs/lead-finder-analiza.md`.

## Zasada

Stary: wyszukiwarka → **pobranie każdej strony (httpx + Chromium)** → e-mail
z HTML → jedno zapytanie AI na stronę (prompt ~3 tys. tokenów).

Nowy: **kontakty z gotowych danych, bez odwiedzania stron** → reguły w kodzie
→ AI ocenia **paczkami** po krótkich opisach. Strona odwiedzana tylko
wyjątkowo, w małym budżecie.

## Źródła (bez odwiedzania stron)

1. **CEIDG — rejestr jednoosobowych firm (główne źródło).** Oficjalne API
   Hurtowni Danych `dane.biznes.gov.pl/api/ceidg/v3` (bezpłatny klucz JWT,
   rejestracja na biznes.gov.pl). Wyszukiwanie po kodzie PKD i miejscu,
   szczegóły wpisu z e-mailem, stroną www i telefonem, jeśli przedsiębiorca je
   podał. DJ-e, wodzireje, animatorzy to w większości JDG. Limit zapytań
   o szczegóły (wg poradników ~50 na 3 min, ~1000/h) — przy kilkudziesięciu
   kontaktach na przebieg wystarczy. Do potwierdzenia na kluczu: nazwy pól
   i filtrów, które kody PKD (2007/2025) dają najwięcej trafień. Kandydaci:
   93.29.Z (pozostała działalność rozrywkowa — DJ, animatorzy), 90.01.Z
   (działalność artystyczna — wodzireje, konferansjerzy), 82.30.Z (organizacja
   wydarzeń — agencje).
2. **Opisy z wyników SearXNG** — zapytania z adresem w treści (np.
   `wodzirej Kraków "@gmail.com"`, `DJ wesele Kraków kontakt e-mail`). E-mail
   wycinany z tytułu i opisu wyniku, bez wchodzenia na stronę. Uzupełnia
   spółki (KRS nie podaje e-maili) i firmy bez maila w CEIDG.
3. **(opcja) Jedno pobranie bez Chromium** — tylko dla kandydata, którego AI
   oceniło jako dobrego, ma stronę www, a nie ma maila: strona główna
   i `/kontakt`, sam httpx, budżet np. 20 na przebieg. Bez Playwright
   w obrazie.

## Przepływ

1. **Zbieranie** → nowa tabela `marketing_candidates` (źródło, id w źródle,
   nazwa, miasto, kody PKD, e-mail, domena www, krótki opis ≤ 300 znaków,
   stan). Pula zapytań: (PKD lub rola) × miasto z `marketing_cities`, jak dziś.
2. **Odsiew w kodzie:** poprawny e-mail, domena maila porównywana **dokładnie**
   z listą (nie podciąg — błąd `mail.com`/`gmail.com` ze starego systemu),
   rekord MX domeny (DNS, tanio), duplikaty po e-mailu i domenie z
   `marketing_verified_contacts` i wcześniejszych kandydatów, słowa
   wykluczające w nazwie/opisie.
3. **AI paczkami:** 20–30 kandydatów w jednym zapytaniu (JSON: id, nazwa,
   PKD słownie, domena, opis), odpowiedź na każdy id: `ok`, `title`,
   `short_description`, `reason`. **AI nie podaje e-maila** — e-mail zawsze
   ze źródła. Krótki prompt (kryteria typów A–D bez list domen i bez „HARD
   OVERRIDE”). Koszt na kontakt ~20× mniejszy niż dziś. Dostawcy jak dziś
   (`marketing_ai_providers`, cooldowny).
4. **Zapis** zaakceptowanych do `marketing_verified_contacts`; `url` = strona
   www, a bez niej link do wpisu CEIDG / wyniku wyszukiwania.
5. **Liczniki lejka** na przebieg (zebrane, odsiane wg przyczyny, do AI,
   zaakceptowane) w logach i w tabeli z GRANT dla `agent_reader` (same liczby)
   — kontrola przez `db-read`.

## Usługa

- `services/lead-finder/` zastąpiony nowym kodem (FastAPI, te same endpointy
  i klucz `LEAD_FINDER_API_KEY`), moduły: `sources/ceidg.py`,
  `sources/searx.py`, `filters.py`, `classify.py`, `store.py`; testy unit
  w Pythonie (filtry, parsowanie odpowiedzi AI, paczki) w CI.
- Obraz `python:slim` zamiast obrazu Playwright (~2 GB → ~150 MB), mniej RAM
  na serwerze z bazą. Wdrożenie jak dziś (`deploy-lead-finder.yml`,
  `familiada-deploy-lead-finder`, powrót do poprzedniego obrazu).
- Nowy sekret `CEIDG_API_KEY` — właściciel: `sudo familiada-secret set
  lead-finder CEIDG_API_KEY`.
- Model na serwerze — nie (uzasadnienie: `lead-finder-analiza.md` §3).

## Baza

- Migracja dodająca: `marketing_candidates` (service only, jak inne
  `marketing_*`), funkcja pobierania paczki do oceny, GRANT liczników.
- Po tygodniu działania: usunięcie `marketing_raw_contacts`,
  `marketing_search_queries_log` i ich funkcji (osobna migracja).

## Etapy

1. Migracja `marketing_candidates` + liczniki (lokalny Postgres, test SQL).
2. Nowa usługa ze źródłem SearXNG-opisy (działa bez klucza CEIDG) + AI
   paczkami; testy unit; wdrożenie; przebieg z panelu na celu 10, liczniki.
3. Źródło CEIDG po otrzymaniu klucza; próba kodów PKD; przebieg kontrolny.
4. (opcja) pobranie strony w budżecie.
5. Sprzątanie starych tabel.

## Uwaga prawna (do wiadomości właściciela)

Wysyłka maili marketingowych bez wcześniejszej zgody (także do firm) jest
w Polsce ograniczona (Prawo komunikacji elektronicznej, RODO dla JDG). Dotyczy
tak samo starego systemu; źródło danych tego nie zmienia.

## Decyzje

- 2026-10-25 (użytkownik): nowy system od zera, odwiedzanie stron jest
  kosztowne, wynik końcowy jak wcześniej.
- (czeka) CEIDG jako główne źródło — klucz zakłada właściciel.
- (czeka) Pobranie strony w budżecie (źródło 3): tak / nie.

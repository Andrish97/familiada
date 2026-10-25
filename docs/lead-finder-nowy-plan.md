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
3. **Jedno pobranie bez Chromium (budżet)** — tylko dla kandydata, którego AI
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

- Migracja dodająca (zgodna wstecz ze starym Lead Finderem):
  `marketing_candidates` (service only), `marketing_run_stats` (liczniki
  przebiegu, GRANT SELECT dla `agent_reader` — same liczby), w
  `marketing_verified_contacts` kolumny `source`, `quality`, `quality_reason`,
  `reviewed_at`, `sent_count`, `last_sent_at`, `reaction`, `reaction_at`;
  funkcje `marketing_mark_sent(emails)` i `marketing_mark_reaction(email,
  reaction)` (service only).
- Po tygodniu działania: usunięcie `marketing_raw_contacts`,
  `marketing_search_queries_log`, `marketing_cities` i ich funkcji (osobna
  migracja).

## Etapy

1. Migracja (lokalny Postgres, test SQL) → `main`.
2. Nowa usługa: źródło wyszukiwarki + CEIDG (gdy jest klucz), odsiew, AI
   paczkami, budżet pobrań, przegląd starych kontaktów (`POST
   /api/contacts-review`); testy unit Pythona; wdrożenie; przebieg z panelu
   na celu 10, liczniki przez `db-read`.
3. Reakcje: Worker (wysyłka, poczta przychodząca) + panel (kolumny, filtry,
   przycisk przeglądu); unit, zrzut `admin-leads`, e2e punktowo.
4. Klucz CEIDG (właściciel), próba kodów PKD, przebieg kontrolny.
5. Sprzątanie starych tabel.

## Uwaga prawna (do wiadomości właściciela)

Wysyłka maili marketingowych bez wcześniejszej zgody (także do firm) jest
w Polsce ograniczona (Prawo komunikacji elektronicznej, RODO dla JDG). Dotyczy
tak samo starego systemu; źródło danych tego nie zmienia.

## Grupy docelowe (decyzja 2026-10-25)

Liczy się skutek: osoby i firmy, które mogą używać Familiady. Miasta nie są
wymagane (pula zapytań: rola × województwo/ogólnie, CEIDG: PKD × województwo).

- **A — prowadzący:** DJ, wodzirej, konferansjer, animator imprez, prezenter.
- **B — organizatorzy:** agencje eventowe, team building, organizatorzy wesel
  i imprez firmowych.
- **C — lokale i rozrywka:** puby i kawiarnie z wieczorami quizowymi,
  organizatorzy quizów i teleturniejów.
- **D — szkolenia i integracje firm:** firmy szkoleniowe, trenerzy z grami.

**Wykluczone (odsiew w kodzie przed AI i w AI):** placówki publiczne —
szkoły, przedszkola, żłobki, uczelnie, urzędy, gminy, domy i ośrodki kultury,
biblioteki, jednostki z domeną `gov.pl`, `edu.pl`, `bip.` i podobne; sam
wynajem sali/sprzętu; portale, katalogi, media.

## Przegląd obecnych kontaktów (decyzja 2026-10-25)

Wszystkie wiersze `marketing_verified_contacts` przechodzą przez nowy odsiew
(reguły + AI paczkami, po zapisanych `title`/`short_description`/`url`/`email`,
bez odwiedzania stron). Wynik w nowych kolumnach `quality` (`good`/`junk`),
`quality_reason`, `reviewed_at` — **nic nie jest kasowane automatycznie**.
Panel pokazuje filtr „Śmieci” i pozwala usunąć zaznaczone jak dziś. Kontakty
z reakcją (odpowiedź) nie są oznaczane jako śmieci.

## Reakcje odbiorców (decyzja 2026-10-25)

Dziś odpowiedź na maila marketingowego rozpoznawana jest po podobnym temacie,
bez powiązania z kontaktem. Nowe:

- wysyłka z panelu (`/_admin_api/marketing/send`) zapisuje na kontakcie
  `sent_count`, `last_sent_at`;
- poczta przychodząca: nadawca porównany z e-mailami kontaktów i adresatami
  wysłanych maili marketingowych → `reaction` = `replied` (domyślnie),
  `declined` (rezygnacja, „nie jestem zainteresowany”, „proszę nie pisać” —
  słowa w treści), `bounced` (zwrotka serwera pocztowego z adresem kontaktu),
  `reaction_at`;
- `declined`/`bounced` → kontakt pomijany przy kolejnych wysyłkach (Worker
  zwraca je w `skipped`);
- panel: kolumna reakcji i filtr („Odpowiedzieli”, „Bez odpowiedzi”,
  „Odmówili”, „Odbite”), liczniki skuteczności (wysłane / odpowiedzi).

## Decyzje

- 2026-10-25 (użytkownik): nowy system od zera, odwiedzanie stron jest
  kosztowne, wynik końcowy jak wcześniej.
- 2026-10-25 (użytkownik): oba źródła (CEIDG i wyszukiwarka); miasta
  niewymagane, liczy się skutek; odbiorcy Familiady bez placówek publicznych
  (szkoły itd.); przegląd obecnej tabeli na śmieci; lepsze śledzenie
  odpowiedzi i reakcji; pobieranie stron — tak, w małym budżecie.
- Klucz CEIDG zakłada właściciel (`sudo familiada-secret set lead-finder
  CEIDG_API_KEY`); bez klucza działa samo źródło z wyszukiwarki.

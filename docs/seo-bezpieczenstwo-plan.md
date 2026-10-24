# SEO i zabezpieczenia warstwy WWW — 2026-10-24

## Decyzje użytkownika

- Rozważyć statyczny katalog i poprawki pozostałych publicznych stron.
  Wskazówki są dla wszystkich, mają działać i pomagać w wyszukiwaniu —
  publiczny HTML oraz indeksowanie są celem, a nie opcją zależną od konta.
  Propozycja architektury i etapów: [seo-katalog-statyczny-plan.md](seo-katalog-statyczny-plan.md).

- 2026-10-24: wypchnąć przetestowane zmiany bezpośrednio na main i pokazać
  instrukcję Cloudflare w rozmowie; bez oczekiwania na scalenie PR.

- Poprawić wyszukiwalność familiada.online i indeksowanie Gier Społeczności.
- Zakres obejmuje też stronę główną i ogólną poprawę bezpieczeństwa.
- Mapa została zgłoszona w Search Console i Google wykrywa wiele stron.
- Przykład: `/marketplace/game/dzieci-i-rodzice`. Zrzuty Search Console:
  zapisany raport „Adres URL jest Google nieznany”, brak ostatniego
  skanowania; test na żywo z 24.10 udany, indeksowanie dozwolone,
  canonical wskazuje grę. To nie potwierdza odrzucenia po indeksowaniu.

## Potwierdzony stan publicznej strony przed zmianą

- Strona główna ma treść HTML, poprawny canonical PL, opis i JSON-LD.
  Tytuł HTML różni się od tytułu ustawianego przez tłumaczenia.
- `/?lang=en` i `/?lang=uk` zwracają ten sam polski HTML co `/`,
  w tym polskie metadane, JSON-LD i canonical `/`.
- `http://www.familiada.online/` zwraca 200 zamiast przekierowania HTTPS.
  HTTPS bez HSTS. Apex przekierowuje na HTTPS z www.
- Worker dodaje CSP, lecz reguła strefy Cloudflare nadpisuje końcowy
  nagłówek. Publiczna CSP zawiera `unsafe-inline`, `unsafe-eval`, nie
  zawiera `frame-ancestors`, `object-src`, `base-uri`, `form-action`.
  Pełna lista źródeł w repo jest tylko Report-Only.
- Mapa zawiera 90 gier. SSR katalogu linkuje do wszystkich 90.
  Gry pobrane z UA Googlebot/Google-InspectionTool zwracają treść i
  prawidłowy canonical. Przeglądarka dostaje szablon katalogu z canonicalem
  `/marketplace`. Karty JS są przyciskami. Ta rozbieżność pozostaje osobnym
  zakresem — nie należy przedstawiać jej jako dowiedzionej przyczyny
  statusu „Google nieznany”.

## Paczka: strona główna i transport

- HTMLRewriter tłumaczy istniejący HTML strony głównej w PL/EN/UK dla
  ludzi i botów, bez dostępu do Supabase. Wykorzystuje słowniki aplikacji,
  te same metadane i JSON-LD co przełącznik języka w przeglądarce.
- Tytuł i opis zgodne z funkcją darmowej gry, pytaniami i odpowiedziami.
  Canonicale lokalnych wersji wskazują odpowiednio `/`, `/?lang=en`,
  `/?lang=uk`; hreflang istniejących wersji zostaje. Wersje EN/UK w mapie.
- Daty ostatniej zmiany strony głównej odpowiadają tej zmianie; stare,
  nieweryfikowalne daty statycznego katalogu i prywatności usunięte.
  Daty gier pozostają z `updated_at`/`created_at` bazy.
- HTTP na www/apex/admin przekierowuje 308 do HTTPS przed API i sesjami;
  zachowuje metodę, ścieżkę i parametry. Usługi API/panel/Supabase/leads
  nie są objęte tą zmianą.
- HSTS na sprawdzonych hostach aplikacji, tydzień, bez includeSubDomains
  i preload. Silniejsza istniejąca polityka zachowana. Nagłówek też na
  przekierowaniach, błędach i zasobach HTTPS.
- Bazowa CSP Workera blokuje obiekty, ogranicza base/formularze i ramki.
  Zachowuje aktualne ograniczenia źródeł skryptów/połączeń/ramek ze strefy,
  aby wyłączenie nadpisującej akcji nie osłabiło dotychczasowej ochrony.
  Istniejące, bardziej restrykcyjne dyrektywy i default-src zachowane.
  Szersza docelowa polityka nadal obserwowana przez Report-Only; usunięcie
  unsafe-inline/eval wymaga osobnej migracji (nonce/hash) i testów bibliotek.
- Zmiana nie dodaje tras: PAGES.home i pageIdForPath nadal obejmują `/`
  i `/index.html`; `lang` to wspólny parametr aplikacji. Uprawnienia,
  sesje i nawigacja do gier pozostają zgodne z centralną mapą.

## Cloudflare: wymagana zmiana poza repo

W strefie familiada.online otworzyć reguły modyfikacji nagłówków odpowiedzi.
Wyłączyć wyłącznie akcję ustawiającą `Content-Security-Policy`, która
nadpisuje CSP zwracaną przez Worker. Pozostawić pozostałe akcje reguły.
Po wdrożeniu sprawdzić końcową odpowiedź www: ma zachować dyrektywy Workera
`frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`.
Nie usuwać tej akcji przed wdrożeniem poprawionego Workera.

Nie promować całej polityki Report-Only do egzekwowania bez testu logowania
(Turnstile), edytorów logo, urządzeń i narzędzi panelu. Nowa paczka nie
stanowi ponownego audytu wszystkich RLS/RPC/Storage — stan wcześniejszego
audytu i niezakończone sprawy są w `bezpieczenstwo-audyt.md`.

## Weryfikacja i wdrożenie

- Punktowe unity: `homeSeo`, `securityP1`, `originMaintenance`,
  `serverTranslations`, `workerServiceHosts`, nawigacja i tłumaczenia.
- `cd cloudflare/maintenance-worker && npm test`: prawdziwy silnik
  Cloudflare/HTMLRewriter, trzy języki, oba UA, HEAD, HTTP POST, JSON-LD.
- Zrzuty istniejącej sceny `home`, PL/EN/UK, telefon i komputer.
- Przed wdrożeniem test strony głównej kodem brancha; po wdrożeniu
  odczyt końcowych nagłówków, test strony głównej i zabezpieczeń.
- Worker obsługuje również wcześniejszy szablon Pages, więc niezależne
  wdrożenia nie wymagają jednoczesnej publikacji. Test na żywo i prośba o
  indeksowanie głównej strony dopiero po publikacji. Brak gwarancji
  terminu indeksowania. Nie zmieniać dat gier bez zmiany ich treści.

Wyniki: lokalne punktowe unity i kontrola i18n przeszły. Silnik
Cloudflare: 4/4; po końcowym doprecyzowaniu CSP ponownie 19/19 związanych
unitów i 4/4 workerd, lint no-undef. Obejrzano 6 zrzutów sceny home.
E2E kodu brancha (1005ac59):
[40124931948](https://github.com/Andrish97/familiada/actions/runs/40124931948)
— render anonimowy, PL/EN/UK z canonicalami/JSON-LD i nagłówki obecnej
produkcji. Ostatnia zmiana CSP nie zmieniła frontu; objęta ponownymi
lokalnymi testami Workera. Nie jest to kontrola nowych nagłówków produkcji.

Stan: opublikowane bezpośrednio na main (57589bd, wersje zasobów 0b3fac1).
[Pages 40131019304](https://github.com/Andrish97/familiada/actions/runs/40131019304)
i [Worker 40131019369](https://github.com/Andrish97/familiada/actions/runs/40131019369)
— sukces. Kontrola main po publikacji:
[40131129663](https://github.com/Andrish97/familiada/actions/runs/40131129663)
— sukces (strona główna, języki/metadane, spec zabezpieczeń).

Odczyt rzeczywistej produkcji: PL/EN/UK 200, Content-Language i canonical
zgodne z językiem, po 3 poprawne JSON-LD, HSTS max-age=604800; HTTP www
przekierowuje 308, HTTPS apex 301 z HSTS. Mapa zawiera 95 adresów, w tym
wersje językowe i grę dzieci-i-rodzice. Ta gra z UA Googlebot nadal zwraca
200 i swój canonical. PR #123 automatycznie oznaczony jako scalony.

Pozostaje konfiguracja właściciela w Cloudflare: końcowy CSP nadal
nadpisany przez regułę strefy, więc nowe cztery dyrektywy nie są jeszcze
aktywne w nagłówku produkcji. Instrukcję przekazano w rozmowie.
Nie wybierać operacji Remove dla CSP — usunąć akcję nadpisującą ten
nagłówek lub wyłączyć regułę, jeśli zawiera tylko tę akcję.

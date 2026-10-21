# Audyt bezpieczeństwa E24 (2026-10-21)

Zakres: baza (tabele/RLS, funkcje SECURITY DEFINER, widoki, Storage),
Worker Cloudflare, funkcje Edge, sekrety w repo, wybrane XSS we froncie.
Odczyty produkcji wyłącznie przez `db-read.yml` (same liczby/bool), pliki
zapytań w `scripts/db-read/` (`table-acl-audit`, `definer-acl-audit` +
`.names`, `storage-policy-audit`, `storage-open-policies`).

Skala ważności: **KRYTYCZNE** (dane/operacje dowolnych kont bez logowania),
**WYSOKIE** (wyciek danych osobowych, nadużycia), **ŚREDNIE**, **NISKIE**.

## Wyniki — baza

| # | Ważność | Problem (stan produkcji przed poprawką) | Poprawka | Stan |
|---|---|---|---|---|
| B1 | KRYTYCZNE | `example_table`, `konta_do_stworzenia` (kolumna z hasłami), `schema_migrations`, `stats_excluded_users` — bez RLS, pełne SELECT/INSERT/UPDATE/DELETE dla anon i authenticated | 446: RLS, odebrane prawa, tylko service_role; 454: `example_table` (0 wierszy) i `konta_do_stworzenia` (10 wierszy) usunięte | wdrożone 17:41 / 454: 21:45. **Zamknięte z oceną ryzyka (decyzja właściciela 2026-10-21):** `konta_do_stworzenia` to pozostałość po błędnie uruchomionym skrypcie zakładania kont (najpewniej konta testowe); hasła jako skróty bcrypt — ryzyko niskie. Działanie: zmiana `TEST_PASSWORD` i haseł kont testowych po paczce P2 |
| B2 | KRYTYCZNE | `email_providers` (konfiguracja i limity dostawców poczty), `public_kv`, `marketing_cities`, `marketing_raw_contacts` (e-maile z wyszukiwania), `marketing_search_queries_log` — polityki `USING (true)` dla wszystkich, pełne prawa anon | 446 | wdrożone 17:41 |
| B3 | KRYTYCZNE | `marketing_verified_contacts` (e-maile kontaktów), `marketing_search_logs`, `marketing_ai_providers` — j.w.; panel admina czytał je wprost kluczem publicznym | Panel → Worker `/_admin_api/marketing/*`; 447 zamyka tabele | wdrożone 19:32 (447–449) |
| B4 | KRYTYCZNE | 25 funkcji SECURITY DEFINER bez sprawdzania użytkownika wykonywalnych przez anon, m.in. `delete_user_everything(uuid)` (usunięcie danych dowolnego konta), `auth_clear_email_change`, `storage_list_objects` (lista plików dowolnego bucketu), `mail_cron_set`, `reset_email_limits`, `save_attachment`, `seed_demo_for_user`, kolejka leadów i limity AI | 448: tylko service_role; e2e resetuje limity przez `/_e2e_api/mail-limits/reset` | wdrożone 19:32 (447–449) |
| B5 | ŚREDNIE | Storage: ręczne polityki dla authenticated bez warunku na bucket (INSERT/UPDATE/DELETE własnych plików w dowolnym buckecie, w tym publicznym `homepage-screenshots`) oraz zakładanie bucketów przez zalogowanych | 449: usunięte; zostają polityki per bucket | wdrożone 19:32 (447–449) |
| B6 | NISKIE | Widok `stats_exclusions_effective` (prawa właściciela, omija RLS) dostępny dla anon — lista UUID wykluczonych kont | 446: tylko service_role | wdrożone |
| B7 | WYSOKIE | `profile_login_to_email(login)` (anon): każdy pozna e-mail dowolnej nazwy użytkownika. Potrzebne do logowania nazwą (Supabase loguje e-mailem) i do udostępniania baz po nazwie | Do decyzji: logowanie nazwą przez Worker (zwraca sesję, nie e-mail) + udostępnianie po nazwie bez ujawniania e-maila | otwarte |
| B8 | ŚREDNIE | `email_get_status`, `get_email_intent_status`, `email_resend_prepare` (anon): sprawdzenie, czy e-mail ma konto (enumeracja kont) | Do decyzji (część przepływu rejestracji) | otwarte |
| B9 | NISKIE | `user-logos`: publiczny SELECT obejmuje listowanie — widać foldery (UUID kont) i nazwy plików logo | 453: SELECT tylko właściciel folderu (`user-logos-select-own`), bucket publiczny (obrazy publicznym URL-em); wgrywanie/usuwanie i kopie logo sprawdzone e2e | wdrożone 2026-10-21 (`84820b2`, P1) |

Sprawdzone bez uwag: pozostałe tabele `public` mają RLS (po 446 żadna tabela
bez RLS nie ma praw anon/authenticated); widok `game_sessions_effective`
ma `security_invoker`; polityki „wszystko” w Storage dotyczą tylko
service_role; funkcje panelu admina — 443/444; publiczne odczyty
profili/kodów urządzeń/ocen/kolejki — 445.

Pozostałe funkcje SECURITY DEFINER wykonywalne przez anon (ok. 70) są wołane
z przeglądarki zgodnie z projektem (głosowanie, wyświetlacz, urządzenia,
ankiety po tokenie, cooldowny) albo w politykach RLS (`base_can_*`,
`can_edit_locked_resource`, `control_device_realtime_claim_valid`) lub
z wyzwalaczy SECURITY INVOKER (`gen_share_key`, `_game_control_active`).

## Wyniki — Worker, funkcje Edge, sekrety, XSS

Poprawki z brancha `claude/new-session-ay1h9t` (commity „E24 K1…N7”), wdrożone
2026-10-21 jako `72622e710f` (szczegóły i przebiegi: „Wdrożenie 2026-10-21” niżej).
Funkcje Edge wdraża `deploy-edge.yml`, Worker `deploy-worker.yml`,
lead-finder `deploy-lead-finder.yml` — wszystkie po pushu na `main`.

| # | Ważność | Problem | Poprawka | Stan |
|---|---|---|---|---|
| K1 | KRYTYCZNE | Panel admina, poczta: `extractHtmlPreviewText` wstawiał HTML maila przez `innerHTML` do odpiętego `div` — `<img onerror>` z dowolnego przychodzącego maila wykonywał się w panelu (z ciasteczkiem Access). Generator gier: tytuły, opisy, pytania i odpowiedzi gier wstawiane bez escapowania | `DOMParser` (dokument nieaktywny); `escHtml` w `generator.js` (tytuł, opis, pytania, odpowiedzi, podobne gry, raport jakości). Treść maili zostaje w `iframe sandbox` bez `allow-same-origin` | wdrożone 2026-10-21 (`72622e7`) |
| K2 | KRYTYCZNE | Funkcja Edge `generate-game` (klucz serwisowy) bez uwierzytelnienia, CORS `*`: publikacja/zmiana/usuwanie gier producenta w katalogu, generowanie AI na koszt projektu, `embed-missing`, `check-uniqueness` dla każdego | Funkcja wymaga `X-Internal-Secret` = `GENERATE_GAME_SECRET` (porównanie stałoczasowe; brak sekretu = 503), bez CORS, tylko POST. Panel → Worker `/_admin_api/generator/<akcja>` (lista dozwolonych akcji, Access + sekret po stronie Workera). Cron: migracja 450 — `invoke_embed_missing_market_games` i `cron_embed_missing_market_games` wysyłają nagłówek z Vault (`generate_game_secret`), tylko `service_role` | wdrożone 2026-10-21 (`72622e7`) |
| W1 | WYSOKIE | Usługa `services/lead-finder` (`leads.familiada.online`): API zleceń wyszukiwania (start/status/pauza/wznowienie/anulowanie) bez uwierzytelnienia, CORS `*` | Zależność FastAPI: `Authorization: Bearer <LEAD_FINDER_API_KEY>` (`hmac.compare_digest`, brak klucza = 503); CORS tylko `https://settings.familiada.online`; `/health` publiczne. Panel już wysyła ten klucz (Worker `/_admin_api/config/lead-finder-token` czyta tę samą nazwę `LEAD_FINDER_API_KEY`) | wdrożone 2026-10-21 (`72622e7`) |
| W2 | WYSOKIE | `isAdminAuthorized` sprawdzał tylko obecność nagłówka `Cf-Access-Jwt-Assertion` lub `Cf-Access-Authenticated-User-Email` — żądanie omijające Access (np. `*.workers.dev`) z dopisanym nagłówkiem miało pełne API admina | Weryfikacja tokenu Access (WebCrypto RS256, JWKS `https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` z pamięcią podręczną, `aud` = `CF_ACCESS_AUD`, `iss`, `exp`/`nbf`); bez zmiennych = 401. `workers_dev = false`, `preview_urls = false`. Testy: `tests/unit/adminAccessJwt.test.js` (prawdziwy klucz RSA) | wdrożone 2026-10-21 (`72622e7`) |
| W3 | WYSOKIE | Eksplorator baz, okno tagów: `tag.name` i `tag.color` wstawiane bez escapowania (XSS u współdzielących bazę) | `esc()` jak w `render.js` | wdrożone 2026-10-21 (`72622e7`) |
| Ś1 | ŚREDNIE | `/_admin_api/*` bez ochrony CSRF (ciasteczko Access idzie z żądaniem z innej strony) | Nie-GET tylko z `Origin: https://settings.familiada.online` i `Content-Type: application/json` (wyjątek: `/attachments/upload` multipart); `adminFetch` w panelu dokłada typ JSON | wdrożone 2026-10-21 (`72622e7`) |
| Ś2 | ŚREDNIE | `/_admin_api/config/lead-finder-token` oddaje długoterminowy klucz lead-findera do przeglądarki panelu | Punkt `/config/lead-finder-token` usunięty; pośrednik `/_admin_api/leads/*` (lista dozwolonych: status, start, pauza/wznowienie/anulowanie po UUID), klucz dokłada Worker | wdrożone 2026-10-21 (`84820b2`, P1) |
| Ś3 | ŚREDNIE | `/_api/contact/append`: zapis wiadomości także dla nieistniejącego zgłoszenia, dopisywanie do cudzego zgłoszenia po samym numerze, bez limitu | Zapis tylko gdy zgłoszenie istnieje i adres = adres zgłoszenia (pierwsza wiadomość: nadawca formularza / odbiorca wiadomości admina); ta sama odpowiedź 404 w obu przypadkach; limit KV: 5/h na adres, 20/h na IP (skróty SHA-256) | wdrożone 2026-10-21 (`72622e7`) |
| Ś4 | ŚREDNIE | `/_api/notify-submission` (publiczne) przekazywał dowolny tekst klienta do Telegrama z `parse_mode: HTML` | Stały komunikat + opcjonalny, sprawdzony UUID gry | wdrożone 2026-10-21 (`72622e7`) |
| Ś5 | ŚREDNIE | Funkcja Edge `lead-finder` (klucz serwisowy, CORS `*`) bez uwierzytelnienia: statystyki i zapis `last_search_log`; brak wywołań w repo | Usunięta z repo | wdrożone 2026-10-21 (`72622e7`) |
| Ś6 | ŚREDNIE | Podgląd maili w panelu: `iframe sandbox="allow-scripts allow-popups"` — skrypty z przychodzących maili wykonują się (izolowany origin, ale mogą otwierać okna, śledzić otwarcie) | `sandbox="allow-popups allow-popups-to-escape-sandbox"` we wszystkich 6 podglądach (szablony bez JS; zrzuty `admin-mail-html`, `admin-mail-preview`) | wdrożone 2026-10-21 (`84820b2`, P1) |
| Ś7 | ŚREDNIE | Ciasteczko obejścia przerwy (`ADMIN_BYPASS_TOKEN`) to stały sekret dla całej domeny na 30 dni, bez rotacji — wyciek = trwałe obejście przerwy technicznej | Ciasteczko = `v1.<ważność>.<HMAC-SHA256>` (klucz `ADMIN_BYPASS_TOKEN`), ważne 12 h, weryfikacja `crypto.subtle.verify`; stare ciasteczka przestały działać — właściciel włącza obejście ponownie | wdrożone 2026-10-21 (`84820b2`, P1) |
| N1 | NISKIE | SSR gry: JSON-LD w `<script>` bez zamiany `<` — `</script>` w treści gry zamykał skrypt | `JSON.stringify(...).replace(/</g, "\\u003c")`; punkty odpowiedzi też escapowane | wdrożone 2026-10-21 (`72622e7`) |
| N2 | NISKIE | `mail-worker`: przy pustym `MAIL_WORKER_SECRET` otwarty dla wszystkich; sekret także z `Bearer`/`?secret=`, porównanie zwykłe, pełny URL w logu | Tylko nagłówek `x-mail-worker-secret` (tak wysyła `invoke_mail_worker*` z Vault — bez zmiany bazy), stałoczasowo, brak sekretu = 403, w logu sama ścieżka | wdrożone 2026-10-21 (`72622e7`) |
| N3 | NISKIE | Brak nagłówków bezpieczeństwa stron (CSP, `X-Content-Type-Options`, `Referrer-Policy`) z Workera | Worker (`security-headers.js`) dla HTML www/apex/settings/nieznanych subdomen: `nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, CSP `frame-ancestors 'self'` + `Content-Security-Policy-Report-Only` (źródła z `web/`). Uwaga: reguła nagłówków strefy Cloudflare (poza repo) nadpisuje egzekwowaną CSP własną wartością (bez `frame-ancestors`, z niepotrzebnym już `leads.familiada.online`) — osadzanie blokuje `X-Frame-Options` | wdrożone 2026-10-21 (`84820b2`, P1) |
| N4 | NISKIE | Funkcja Edge `storage-cleanup` bez uwierzytelnienia (każdy może uruchomić przetwarzanie kolejki usuwania; usuwa tylko pozycje z kolejki) | Nagłówek `X-Internal-Secret` = hex(HMAC-SHA256(`MAIL_WORKER_SECRET`, "storage-cleanup")) — bez nowego sekretu (baza liczy z Vault `mail_worker_secret`, migracja 452), bez CORS; wartość pochodna nie otwiera mail-worker | wdrożone 2026-10-21 (`84820b2`, P1) |
| N5 | NISKIE | Funkcja Edge `auth-email-status`: sprawdzenie, czy e-mail ma konto (enumeracja; razem z B8) | Do decyzji razem z B8 | otwarte – decyzja |
| N6 | NISKIE | Poczta przychodząca (`inbound-email.js`): mail z `[TICKET-…]` w temacie dopina się do zgłoszenia bez sprawdzenia nadawcy (odpowiednik Ś3 dla kanału e-mail) | `ticketForSender`: dopięcie tylko, gdy nadawca (koperta) = adres zgłoszenia (ta sama reguła co `contact/append`), inaczej skrzynka bez zgłoszenia | wdrożone 2026-10-21 (`84820b2`, P1) |
| N7 | NISKIE | Formularz kontaktu: nazwa wybranego pliku wstawiana przez `innerHTML` (self-XSS) | Elementy DOM z `textContent` | wdrożone 2026-10-21 (`72622e7`) |

Uwaga do numeracji Ś2, Ś6, Ś7, N3–N6: opisy spisane przy wdrażaniu
poprawek (2026-10-21) na podstawie przeglądu kodu.

Zostają otwarte B7, B8 i N5 (sekcja „Wyniki — baza”).

## Wymagane przed wdrożeniem

**Stan 2026-10-21: ustawione** (zgoda właściciela, jednorazowy workflow
`rotate-secrets.yml` na `main`, potem usunięty; wartości wygenerowane
w przebiegu, maskowane, nikt ich nie widział):
- rozpoznanie (tylko nazwy/wartości logiczne): przebieg 39655023969 —
  env funkcji Edge = `supabase/docker/.env` (przez `environment:` w
  `docker-compose.override.yml`), lead-finder = `docker run --env-file` tego
  samego `.env`; `MAIL_WORKER_SECRET` niepusty i równy Vault;
- rotacja: przebieg 39655412768 (success) — `GENERATE_GAME_SECRET`
  (Worker, `.env` + wpis w `override.yml`, Vault `generate_game_secret`),
  nowy `LEAD_FINDER_API_KEY` (Worker i `.env` — lead-finder i funkcje Edge),
  odtworzone kontenery `supabase-edge-functions` (`compose up -d --no-deps
  functions`) i `familiada-lead-finder` (skrypt `deploy-lead-finder.sh`,
  health OK); weryfikacja skrótów: wszystko `true`;
- `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`: `[vars]` w `wrangler.toml`
  (wartości jawne), wejdą z wdrożeniem Workera;
- na serwerze kopie `.env.bak-rotate-20261021184453` i
  `docker-compose.override.yml.bak-rotate-20261021184453` (uprawnienia
  zachowane; zawierają stare wartości — właściciel może je usunąć).

Poprawki działają „bez fallbacku”: bez poniższych ustawień panel admina
(W2), generator gier (K2), lead-finder (W1) i wysyłka poczty (N2) odmawiają.
Najpierw ustawić sekrety, potem push na `main`.

| Nazwa | Gdzie | Wartość |
|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Worker (zmienna lub sekret) | `<zespół>.cloudflareaccess.com` (Zero Trust → Settings → Custom pages / team domain) |
| `CF_ACCESS_AUD` | Worker (zmienna lub sekret) | Tag „Application Audience (AUD)” aplikacji Access chroniącej `settings.familiada.online` |
| `GENERATE_GAME_SECRET` | Worker (sekret) **i** env funkcji Edge (self-host: plik env funkcji / `docker compose` usługi `functions`) | Losowy, ≥ 32 znaki, ta sama wartość |
| `generate_game_secret` | Vault (`select vault.create_secret('<wartość>', 'generate_game_secret')`) | Ta sama wartość co `GENERATE_GAME_SECRET` |
| `LEAD_FINDER_API_KEY` | env usługi lead-finder (kontener na serwerze, skrypt `deploy-lead-finder.sh`) **i** matcher `@valid_key` w `/etc/caddy/Caddyfile` (blok `leads.familiada.online`) | Ta sama wartość co istniejący sekret Workera `LEAD_FINDER_API_KEY` |
| `MAIL_WORKER_SECRET` | env funkcji Edge | Musi być niepusty i równy `mail_worker_secret` w Vault (sprawdzić, że oba są ustawione) |

Kolejność wdrożenia:

1. Ustawić `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `GENERATE_GAME_SECRET`
   w Workerze; `GENERATE_GAME_SECRET` i sprawdzić `MAIL_WORKER_SECRET`
   w env funkcji Edge; `generate_game_secret` w Vault;
   `LEAD_FINDER_API_KEY` w env lead-findera.
2. Push na `main`: migracja 450 (zgodna wstecz — obecna funkcja ignoruje
   nagłówek), Worker (W2, Ś1, Ś3, Ś4, N1, proxy K2), funkcje Edge (K2, N2,
   usunięcie `lead-finder`), lead-finder (W1), Pages (K1, K2 front, W3,
   N7). Między wdrożeniem Workera a Pages panel przez chwilę woła stare
   ścieżki — generator gier działa dopiero z nową wersją panelu.
3. Usunąć funkcję `lead-finder` z serwera, jeśli `deploy-edge.sh` nie
   usuwa katalogów nieobecnych w repo.
4. Sprawdzenie: panel admina się ładuje (Access), `curl` do
   `https://familiada.<konto>.workers.dev` nie odpowiada, `generate-game`
   bez nagłówka = 401, lead-finder `/api/search-runs/status` bez klucza =
   401, kolejka poczty schodzi (log `mail-worker` bez
   `request_forbidden_*`), cron `embed-missing` bez błędów.

## Wdrożenie 2026-10-21

- Na `main` wypchnięty dokładnie przetestowany SHA `72622e710f`. Przebiegi: db-migrate
  39662314767 (447–450 OK), Worker 39662314445, Edge 39662314784,
  lead-finder 39662314716, Pages 39662314559 — wszystkie success.
- Kontrola: `tests/e2e/security-endpoints.spec.js` (przebieg 39669187044 ✓):
  `/_admin_api/*` bez tokenu Access = 401 (także z podrobionymi nagłówkami
  `Cf-Access-*`), `generate-game` bez nagłówka = 401, funkcja Edge
  `lead-finder` nie odpowiada, `leads.familiada.online` bez klucza / ze
  złym kluczem = 404 (Caddy). `*.workers.dev` wyłączone w `wrangler.toml`
  (`workers_dev = false`); adresu nie sprawdzono z zewnątrz (nieznana
  subdomena konta).
- **Rotacja pominęła Caddy.** Na serwerze `leads.familiada.online` stoi za
  Caddy (`/etc/caddy/Caddyfile`, blok `leads.familiada.online`): matcher
  `@valid_key header Authorization "Bearer <klucz>"` przepuszcza do
  `127.0.0.1:8001`, reszta `respond 404`. Rotacja (39655412768) zmieniła
  klucz w Workerze i `.env`, ale nie w Caddyfile, więc panel („Kontakty
  marketingowe” → „Uruchom”) dostawał 404 bez CORS („Failed to fetch”).
  Diagnoza: jednorazowy workflow tylko do odczytu (39665741685,
  39665904699, potem usunięty). Właściciel poprawił Caddyfile ręcznie
  (wartość z `.env`, bez wyświetlania). Na serwerze zostaje kopia
  `/etc/caddy/Caddyfile.bak-20261021195900` ze starym kluczem — usunąć
  razem z kopiami `.bak-rotate-20261021184453`.
- **Przy każdej przyszłej rotacji `LEAD_FINDER_API_KEY`** zmienić w tym samym
  kroku: sekret Workera, `supabase/docker/.env` (kontener lead-findera
  i funkcje Edge) **oraz** linię `@valid_key` w `/etc/caddy/Caddyfile`
  (`sudo caddy validate --config /etc/caddy/Caddyfile`, `sudo systemctl
  reload caddy`).

## Paczka P1 (2026-10-21)

- Ś2, Ś6, Ś7, N3, N4, N6, B9 oraz usunięcie `example_table` (0 wierszy)
  i `konta_do_stworzenia` (10 wierszy; liczby z `latest.log`, migracja 454).
- Na `main` scalony przetestowany SHA `221afa5dc6` (merge `84820b258d`).
  Przebiegi: db-migrate 39681146639 (452–454 OK), Worker 39681146662,
  Edge 39681146531, Pages 39681146553 — success.
- E2E brancha (`p1-sec-221afa5dc6`): friends 39678900105, subscribers
  39679425338, logo-editor 39680582256 (bez znanego „pula zajęta…”;
  39679797150 padł tylko na nim), resource-copy-send 39680110017,
  mail-center 39680341894 — ✓.
- Kontrola produkcji: security-endpoints 39685309540, game-deletion
  39681649695 (sprzątanie Storage z nowym nagłówkiem), logo-storage-copy
  39681809028, logo-editor 39681972082, friends 39682595266, subscribers
  39683136741, resource-copy-send 39683571180, mail-center 39683868230,
  account-deletion 39684091817, maintenance-404 39685466156,
  static-assets-routing 39684407263, game-settings 39684567694 — ✓.
  Poprawione nieaktualne asercje testów: CSP strefy (wyżej, N3) i link 404
  `/marketplace/`.
- Do zrobienia przez właściciela: włączyć ponownie obejście przerwy w panelu
  (stare ciasteczko nieważne; nowe ważne 12 h); opcjonalnie poprawić regułę
  nagłówków CSP w Cloudflare (dodać `frame-ancestors 'self'`, usunąć
  `leads.familiada.online` z `connect-src`) albo ją usunąć.

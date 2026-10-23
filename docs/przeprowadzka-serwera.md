# Przeprowadzka serwera (plan na osobną rozmowę)

Stary serwer: Oracle Cloud (płatny), prawdopodobnie ARM (`uname -m` → `aarch64`).
Nowy serwer: x86_64, tańszy. Sekrety nigdy nie idą przez czat ani to repo
(repo jest publiczne).

## Przygotowanie przez właściciela (przed nową rozmową)

1. Na nowym serwerze użytkownik dla automatów (bez sudo bez hasła):
   ```
   sudo adduser --disabled-password --gecos "" deploy
   ```
2. Klucz SSH tylko dla nowego serwera (na nowym serwerze):
   ```
   sudo -u deploy ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/gha_key
   sudo -u deploy sh -c 'cat /home/deploy/.ssh/gha_key.pub >> /home/deploy/.ssh/authorized_keys'
   sudo cat /home/deploy/.ssh/gha_key
   ```
   Klucz prywatny wkleić do GitHuba (punkt 3), potem `sudo rm /home/deploy/.ssh/gha_key`.
3. GitHub → Settings → Secrets and variables → Actions — nowe sekrety (stare zostają):
   `NEW_SERVER_HOST` (IP), `NEW_SERVER_USER` (`deploy`), `NEW_SSH_PRIVATE_KEY`.
4. 2FA na GitHubie.
5. `uname -m` na starym serwerze — wynik do promptu.

## Prompt do nowej rozmowy

```
Przeprowadzka Familiady na nowy serwer — bezpiecznie, bez utraty danych i bez wycieku sekretów.

Stan obecny (stary serwer, Oracle Cloud, architektura: [wpisz wynik uname -m, prawdopodobnie aarch64]):
- Supabase self-hosted w Dockerze: ~/supabase-selfhost/supabase/docker (.env z sekretami, docker-compose.override.yml), skrypty wdrożeń w ~/supabase-selfhost/supabase/scripts/ (deploy-edge.sh, deploy-lead-finder.sh, migracje).
- Lead Finder: kontener familiada-lead-finder (port 8001), budowany z services/lead-finder/Dockerfile, ładuje .env przez --env-file.
- Caddy: /etc/caddy/Caddyfile — m.in. blok leads.familiada.online z kluczem LEAD_FINDER_API_KEY wpisanym na sztywno (do zmiany: ma brać klucz z jednego źródła).
- GitHub Actions łączą się przez sekrety SERVER_HOST / SERVER_USER / SSH_PRIVATE_KEY (konto na starym serwerze ma dostęp do Dockera — za szeroki).
- Sekrety: .env na serwerze, Vault w bazie, sekrety Workera w Cloudflare (zostają), sekrety w GitHubie.
- Poza serwerem i bez przeprowadzki: Cloudflare (Worker, DNS, Access), GitHub Pages.

Nowy serwer: x86_64, tańszy. W GitHubie dodałem sekrety NEW_SERVER_HOST, NEW_SERVER_USER (deploy, bez sudo bez hasła), NEW_SSH_PRIVATE_KEY. 2FA na GitHubie: [tak/nie].

Zasady:
- Sekrety nigdy nie idą przez czat ani repo (repo familiada jest publiczne). W logach automatów tylko nazwy i wartości tak/nie. .env i zrzut bazy przenosimy serwer → serwer.
- Baza tylko przez zrzut (pg_dumpall/pg_dump), nie przez kopię plików — zmiana architektury ARM → x86. Te same wersje obrazów Supabase/Postgresa co na starym serwerze.
- Obrazy Dockera pobierane/budowane od nowa na nowym serwerze.
- Najpierw tylko odczyt: spis wszystkiego na starym serwerze (kontenery, wersje obrazów, wolumeny, cron, Caddy, pliki konfiguracji, nazwy zmiennych bez wartości, rozmiar bazy i Storage).
- Konfigurację serwera (bez sekretów) zapisać w osobnym PRYWATNYM repo, żeby serwer dało się odtworzyć skryptem.
- Konto automatów na nowym serwerze z minimalnymi uprawnieniami; czynności administracyjne (instalacja Dockera, Caddy, sudo) — podaj mi polecenia do wykonania ręcznie albo zaproponuj bezpieczny sposób.
- Przełączenie dopiero po próbie generalnej na nowym serwerze pod tymczasowym adresem. Przerwę techniczną włączam ja w panelu admina. Stary serwer zostaje włączony kilka dni jako zapas.
- Sprawdzić u dostawców poczty/AI, czy nie mają listy dozwolonych IP.
- Po przeprowadzce: zmiana najważniejszych haseł, wyłączenie starego serwera, usunięcie starych sekretów GitHuba.

Zacznij od planu etapów i spisu ze starego serwera (tylko odczyt). Pisz po polsku, prowadź mnie krok po kroku, jestem laikiem.
```

## Decyzje właściciela (2026-10-21)

- Nowy serwer: Contabo, Ubuntu 24.04, x86_64, 7,8 GB RAM, 96 GB dysku. Utworzone już: konto `andrish97` (sudo), swap 4 GB (do potwierdzenia).
- **Czysto i powtarzalnie:** cała konfiguracja serwera (Docker, Caddy, Supabase z przypiętymi wersjami, Lead Finder, zapora, swap, użytkownicy) w osobnym PRYWATNYM repo (np. `familiada-server`) jako skrypt idempotentny „postaw serwer od zera”. Właściciel nie przepisuje poleceń — skrypt uruchamia automat GitHuba; poprawki tylko w skrypcie, nie ręcznie na serwerze.
- **Tymczasowy dostęp root dla automatu** tylko na czas instalacji (osobny sekret w GitHubie), potem usunięty; zostaje konto `deploy` z minimalnymi uprawnieniami. Na końcu: logowanie SSH tylko kluczem, bez logowania na root, zapora (22/80/443).
- **Nowszy Supabase:** aktualna stabilna wersja self-hosted (przypięte wersje obrazów). Baza przez zrzut wczytany do nowszego Postgresa; sprawdzić rozszerzenia (vector, pg_net, Vault/pgsodium), GoTrue i Edge Runtime.
- **Próba generalna na adresach testowych:** `supabase2.`, `leads2.`, `www2.`, `settings2.familiada.online` (DNS w Cloudflare na nowy serwer, testowy wariant Workera z adresem supabase2, Cloudflare Access także dla settings2, przekierowania logowania w GoTrue). E2E na tych adresach. Na kopii testowej WYŁĄCZONA wysyłka poczty i crony (prawdziwe adresy użytkowników!). Po przełączeniu adresy `*2` i testowy Worker usunąć.
- Klucz Lead Findera w Caddy ma pochodzić z jednego źródła (np. zmienna z .env), nie z osobnej kopii w Caddyfile.

## Wnioski z 2026-10-21 (rotacja kluczy)

- Klucz `LEAD_FINDER_API_KEY` jest też w `/etc/caddy/Caddyfile` (blok `leads.familiada.online`) — przy zmianie klucza zmienić także tam.
- Przeładowanie Caddy zrywa konsolę właściciela, która idzie przez Caddy — zmiany Caddy robić automatem albo poleceniem odpornym na rozłączenie.
- Na starym serwerze kopie `Caddyfile.bak-20261021195900` i `.bak-rotate-*` zawierają stary klucz — do usunięcia.

## Etapy (uzgodnione 2026-10-21, sesja przeprowadzki)

Stan (stary serwer: `aarch64`, Termux ma dostęp `andrish97@`). P0 zrobione 2026-10-21 (repo `Andrish97/familiada-server`, szkielet: `bootstrap/bootstrap.sh`, `inventory/old-server.sh`, workflow `bootstrap.yml` i `inventory-old.yml`). P1 zrobione 2026-10-21 (klucz właściciela z Termuxa; sekrety `INSTALL_SSH_KEY`, `NEW_SERVER_HOST`, `NEW_SERVER_KNOWN_HOSTS` w familiada-server). P3 warstwa systemowa zrobiona (`bootstrap.yml` apply: Docker, Caddy, swap 4 GB, ufw, fail2ban, konta `andrish97` i `deploy`, `/srv/familiada`, SSH tylko kluczem bez root). P2 spis zrobiony (szczegóły tylko w prywatnym repo: `docs/spis-stary-serwer.md`). P3b zrobione 2026-10-21: Supabase z wzorca `397cc79` (Postgres 17.6.1.136, GoTrue 2.197, Envoy 1.39.1, Storage 1.81 z poprawką bezpieczeństwa w standardzie) działa na testowym `.env`, wszystkie usługi zdrowe, porty tylko na 127.0.0.1 (przebieg familiada-server 39696346398). P4 (kopia do próby) zrobione 2026-10-22: `transfer.yml` (stary → nowy bezpośrednio, jednorazowy klucz tylko z IP starego; .env, zrzut 24 MB, Storage, klucz Vault/pgsodium, Edge Functions, SearXNG) + `server.yml restore rehearsal` (przebieg 39699079799): 92 tabele, 178 kont, 77 obiektów, Vault 4/4, crony 0/13, wszystkie usługi zdrowe. Wnioski: po zrzucie trzeba oddać obiekty auth/storage rolom usług (`fix-owners.sql`), inaczej nowsze GoTrue/Storage nie migrują; certyfikat origin nie przeszedł (stary serwer: sudo z hasłem). P5 w toku: aplikacje na nowym serwerze (`server.yml apps rehearsal`, przebieg 39699611178) — SearXNG (digest ze starego), Lead Finder (compose, kod z familiada/main), Portainer 2.45.3, Cockpit 314 (127.0.0.1), Caddy z szablonu z adresami `api2/supabase2/leads2/panel2/docker2`. Czeka: certyfikat origin (kopia przez właściciela), DNS + Access w Cloudflare, e2e z `api_origin=https://api2.familiada.online`.

| Etap | Co | Kto |
|---|---|---|
| P0 | Prywatne repo `familiada-server` (puste, z README), podłączone do sesji agenta | właściciel zakłada (agent nie ma uprawnień do tworzenia repo — 403) |
| P1 | Klucze z Termuxa: własny klucz właściciela → `andrish97`; tymczasowy klucz instalacyjny root → sekrety repo `familiada-server` przez `gh secret set` (klucz prywatny nie przechodzi przez czat ani schowek) | właściciel (polecenia od agenta) |
| P2 | Spis starego serwera (tylko odczyt: nazwy, wersje, rozmiary, nazwy zmiennych bez wartości) — workflow w repo prywatnym | agent |
| P3 | `bootstrap.sh` idempotentny: pakiety, Docker, Caddy, zapora, swap, konto `deploy`, katalogi; Supabase z przypiętymi wersjami (bez danych) | agent, uruchamia workflow |
| P4 | Przeniesienie `.env` i zrzutu bazy (`pg_dumpall` → wczytanie na x86) serwer → serwer; Storage; Edge Functions; Lead Finder | agent |
| P5 | Próba generalna: `supabase2/leads2/www2/settings2` (DNS, testowy Worker, Access), poczta i crony WYŁĄCZONE; e2e punktowo | agent + właściciel (Cloudflare) |
| P6 | Przełączenie: przerwa techniczna (właściciel), świeży zrzut, DNS, sekrety `SERVER_*` w familiada → nowy serwer; testy kontrolne | razem |
| P7 | Sprzątanie: wąskie `deploy`, usunięcie klucza root, SSH tylko kluczem, `PermitRootLogin no`, usunięcie adresów `*2`, starych sekretów, zmiana haseł; po kilku dniach wyłączenie starego serwera | agent + właściciel |

Zasada przekazywania sekretów: tylko `gh secret set NAZWA < plik` z Termuxa
lub serwer → serwer (`scp`/`ssh` między serwerami). Nigdy wklejanie do czatu.
Logi workflow w repo prywatnym też tylko nazwy i tak/nie.

## Decyzje właściciela (2026-10-21, sesja przeprowadzki)

- Konto `andrish97` na nowym serwerze zakłada skrypt (wcześniej było tylko root); logowanie właściciela kluczem z Termuxa, `sudo` bez hasła (konto bez hasła, SSH tylko kluczem).
- SSH: logowanie na root wyłączone, hasła wyłączone. Automat do P7 wchodzi przez `andrish97` swoim tymczasowym kluczem.
- Cała Familiada w `/srv/familiada/` (`supabase/`, `lead-finder/`, `backups/`) zamiast `~/supabase-selfhost/supabase/docker`. Docker w miejscach systemowych.
- Strefa czasu serwera: Europe/Warsaw.
- **Panel serwera (propozycja agenta, 2026-10-21):** Portainer CE (Docker: kontenery, logi, restart) + Cockpit (system: terminal, usługi, aktualizacje, dyski). Oba tylko na `127.0.0.1`, z zewnątrz przez Caddy **za Cloudflare Access** (jak `settings`), nigdy otwarte porty. Adresy do ustalenia po spisie starego serwera (stara „konsola właściciela” idzie przez Caddy). Wersje przypięte w skrypcie.
- **Lepsze wdrożenia (Edge, migracje, Lead Finder) na nowym serwerze:**
  - konto `deploy` bez Dockera i bez sudo ogólnego; tylko `sudo` na 3 skrypty root w `/usr/local/sbin/` (`familiada-deploy-edge`, `familiada-migrate`, `familiada-deploy-lead-finder`), wersjonowane w `familiada-server`;
  - automat wysyła pliki tylko do `/home/deploy/staging/<sha>`; skrypt root sprawdza, kopiuje i uruchamia;
  - Edge: wydania w `/srv/familiada/supabase/functions/releases/<sha>` + przełączenie dowiązania `current` (szybki powrót do poprzedniej wersji), restart tylko kontenera `functions`, test zdrowia;
  - Lead Finder: obraz z tagiem `<sha>`, zarządzany przez compose (nie `docker run`), poprzedni obraz zostaje do powrotu, test `/health`;
  - migracje: blokada przed równoległym uruchomieniem, zrzut bazy przed migracją do `/srv/familiada/backups/`, log jak dziś (`supabase/migration_logs/latest.log`);
  - workflow w repo familiada zmieniamy dopiero przy przełączeniu (P6), z sekretami `SERVER_*` wskazującymi nowy serwer i konto `deploy`.
- **Adresy (decyzja właściciela 2026-10-21):** `api.familiada.online` — API Supabase (jak dziś); `supabase.familiada.online` — Supabase Studio; `panel.familiada.online` — już za Cloudflare Access (zostaje); Cockpit i Portainer — **każdy pod osobnym adresem** za Access (propozycja: `panel.` = Cockpit, `docker.` = Portainer). Próba generalna na odpowiednikach z `2` (`api2.`, `supabase2.`, `leads2.`, `www2.`, …) — zamiast wcześniejszego `supabase2.` jako API.
- **`settings.` → `admin.familiada.online`** (potwierdzone przez właściciela 2026-10-21; to już panel administracyjny, nie tylko ustawienia). Osobny etap po przełączeniu serwera, żeby nie mieszać dwóch zmian naraz.

## Wnioski ze spisu (P2, 2026-10-21)

- Baza aplikacji ~0,3 GB, Storage ~14 MB — przeniesienie szybkie. Baza logów `_supabase` (~15 GB) — nie przenosimy.
- Na starym serwerze usługi wystawione na świat poza Caddy (baza przez pooler, bramka API, Lead Finder, SearXNG, Cockpit) — na nowym tylko 80/443 przez Caddy.
- Brak automatycznych kopii bazy — na nowym dodać (codzienny zrzut do `/srv/familiada/backups/` + kopia poza serwerem, do ustalenia gdzie).
- Wzorzec Supabase zastąpił Kong bramką Envoy, a logi (Logflare/Vector) są opcjonalne. Decyzja agenta: aktualny wzorzec z przypiętymi wersjami, **bez modułu logów** (oszczędza ~15 GB i RAM; w Studio nie będzie zakładki logów). Własne trasy Konga (blokada `/mcp`) przenieść do Envoy.
- Ręczna łatka Storage (poprawka bezpieczeństwa) — w nowszej wersji prawdopodobnie zbędna, sprawdzić.
- SearXNG przypiąć do konkretnej wersji.
- Na próbie generalnej: crony wyłączone, Vault `project_url` → adres testowy, klucze poczty puste.

## Decyzje agenta (2026-10-22, P5)

- Próba generalna bez stron `www2`/`settings2`/`admin2` i bez testowego Workera: e2e używają `serveBranchCode` z nowym wejściem `api_origin` (`E2E_API_ORIGIN` podmienia `https://api.familiada.online` w kodzie z brancha). W Cloudflare tylko `api2`, `supabase2`, `leads2`, `panel2`, `docker2`.
- Klucz Lead Findera sprawdza tylko sama usługa (`Authorization: Bearer`, `LEAD_FINDER_API_KEY` z `.env`); Caddy bez kopii klucza.
- Cockpit słucha tylko na 127.0.0.1:9090; logowanie wymaga hasła konta systemowego (`andrish97` nie ma hasła — ustawić przy pierwszym użyciu panelu).

## Pauza i zasady wersji (2026-10-22)

- **Pauza na prośbę właściciela** (inne przebiegi w toku). Wznowienie od kroku 1 P5 (certyfikat origin), potem DNS + Access. Nic nie działa w tle.
- **Supabase bez samoczynnych aktualizacji:** wersja przypięta w `familiada-server/supabase/UPSTREAM_REF` (`397cc79`, obrazy z 2026-10-16). Aktualizacja = świadoma zmiana tego pliku → `check` → próba (restore na kopii) → dopiero potem produkcja. Ewentualnie później automat, który tylko *zgłasza* nowszą wersję.
- **Zamrożenie schematu bazy** (potwierdzone przez właściciela 2026-10-22: w czasie przenoszenia nie wprowadza zmian): od ostatniej próby generalnej z e2e do testów kontrolnych po przełączeniu — bez nowych migracji na `main`. Dane mogą się zmieniać (świeży zrzut przy przełączeniu).
- **Wyjątek od zamrożenia (zgoda właściciela 2026-10-23):** migracja 472 (przejmowanie urządzeń Control 2, stan `replaced`). Przy przełączeniu wziąć zrzut bazy po 472.

- **Naruszenie zamrożenia (2026-10-23, sesja E26 — sprzątanie bazy):** migracje
  473–477 (`docs/audyt-sprzatania-bazy.md`) weszły na `main` o 17:17 UTC bez
  sprawdzenia tej sekcji — agent nie znał zamrożenia. Wszystkie OK w
  `latest.log`. Skutek dla przeprowadzki: zrzut przy przełączeniu musi być
  **po 477** (jak dla 472), a próba generalna na `api2` była na schemacie
  sprzed 473 — przed P6 sprawdzić, że kopia po 477 wczytuje się na nowym
  serwerze. Do decyzji właściciela, czy uznać 473–477 za wyjątek.

## E2E na nowym serwerze — odłożone (2026-10-23)

- Otwarte: `api_origin` przestawia tylko spece z `serveBranchCode`, a wypożyczanie kont (E25), ich czyszczenie i skrzynka idą przez produkcyjny Worker do starej bazy. Do rozwiązania przed e2e w P5.
- Decyzja właściciela: na razie zostawić — nowy serwer jeszcze nie działa. Wrócić przy P5.

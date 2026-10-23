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
  `latest.log`. Na prośbę właściciela doszła 478 (nieużywane funkcje Lead
  Findera). Skutek dla przeprowadzki: zrzut przy przełączeniu musi być
  **po 478** (jak dla 472), a próba generalna na `api2` była na schemacie
  sprzed 473 — przed P6 sprawdzić, że kopia po 477 wczytuje się na nowym
  serwerze. Do decyzji właściciela, czy uznać 473–477 za wyjątek.

## E2E na nowym serwerze — odłożone (2026-10-23)

- Otwarte: `api_origin` przestawia tylko spece z `serveBranchCode`, a wypożyczanie kont (E25), ich czyszczenie i skrzynka idą przez produkcyjny Worker do starej bazy. Do rozwiązania przed e2e w P5.
- Decyzja właściciela: na razie zostawić — nowy serwer jeszcze nie działa. Wrócić przy P5.
- Stan 2026-10-23 (sesja przeprowadzki): w praktyce działa — kopia bazy ma te same konta `e2e.*`, więc lease przez produkcyjny Worker wypożycza konta, którymi spece logują się do `api2`; ponad 230 testów na `api2` (dziennik niżej). Poza próbą zostają tylko funkcje Workera z bazą (sprawdzane po przełączeniu).

## Próba generalna — dziennik (2026-10-22)

- Certyfikat origin przeniesiony (kopia właściciela → `transfer.yml` 39802659907), Caddy z certyfikatem, dane odświeżone (`restore rehearsal` 39802874616: 188 kont, crony 0/13).
- DNS `api2/supabase2/leads2/panel2/docker2` (proxied) + Access dla `supabase2/panel2/docker2` — właściciel.
- Worker zwracał 404 dla nieznanych hostów → Worker przepuszcza `docker.` i adresy `*2` (commit 26062421, wdrożony, test `workerServiceHosts.test.js`). Z internetu: api2 401 (bez klucza — poprawnie), leads2 200, supabase2/panel2/docker2 302/307 (Access).
- e2e na `api_origin=https://api2.familiada.online`:
  - na `main` spece z `serveBranchCode` biegną na produkcji (warunek `GITHUB_REF_NAME!=='main'`) — przebieg 39824301942 nie dotknął nowej bazy (licznik `activity`: 0 zmian). Próby e2e puszczać **z brancha**.
  - CSP z Workera (E24) blokował `api2` w przeglądarce → pomocnik testów podmienia adres także w CSP stron z produkcji.
  - przebieg 39827319635 (branch): ruch do `api2` potwierdzony; `poll-go` zielony na nowym serwerze; `resource-duplicate` 401 z `/_api/resource-duplicate` (Worker rozmawia ze starym serwerem); `logo-storage-copy` — w sprzątaniu `remove([])` odrzucane przez Storage 1.81 (poprawione w specu; kod aplikacji ma już strażniki pustej listy).
- **Wniosek:** od E24 logowanie i część funkcji (`/_api/auth`, `/_api/resource-duplicate`, `/_api/resource-send`, poczta, panel admina) idą przez Workera do `api.familiada.online`. Pełna próba wymaga testowego wariantu Workera z `SUPABASE_URL=https://api2.familiada.online` (pierwotny plan właściciela) — do decyzji.
- **Portainer od razu pod `docker.familiada.online`** (decyzja właściciela 2026-10-22: nowy adres, bez etapu `docker2`). Caddy na nowym serwerze obsługuje `docker.` także w trybie próby.
- e2e (branch, `api2`) przebieg 39829329491: zielone `logo-draw-delete`, `rating-system`, `account-rating`, `game-transfer-format`; `logo-storage-copy` czerwony — Storage 1.81 odrzuca klucze przy pustym `GLOBAL_S3_BUCKET` („must be a relative path”). Naprawa w familiada-server: `env-adapt.py` ustawia `GLOBAL_S3_BUCKET=familiada`, `restore.sh` przenosi `storage-single-tenant/` do `familiada/`. Po ponownym wczytaniu (39830375178): `logo-storage-copy` zielony (39830781551), stare pliki ze wszystkich 3 bucketów czytelne (HTTP 200, `storage-layout` 39831358460).
- **Decyzja (2026-10-22): bez testowego Workera** — funkcje Workera z bazą (`/_api/auth`, powielanie/wysyłanie zasobów, poczta, panel admina, kontakt) testowane w przerwie technicznej zaraz po przełączeniu; w razie błędu powrót DNS na stary serwer. Worker bez zmian (logowanie przez Workera chroni adresy użytkowników — E24).

## Sekrety po przeprowadzce — podział (decyzja właściciela 2026-10-23, do zrobienia po P6)

- Podzielić `.env` według tego, kto używa, w `/srv/familiada/secrets/` (każdy plik 600, root):
  - `supabase/docker/.env` — tylko rdzeń Supabase (hasło bazy, JWT, klucze anon/service, Studio);
  - `functions.env` — wszystko, czego używają funkcje Edge (poczta, AI, Telegram, GitHub, klucz Lead Findera…), podpięte `env_file` tylko do kontenera funkcji;
  - `lead-finder.env` — Lead Finder; wspólny klucz Lead Findera w obu plikach albo w małym wspólnym.
- Nowy sekret funkcji = jedna linijka w `functions.env`, bez zmiany compose.
- Polecenie `sudo familiada-secret set NAZWA` (wartość ukryta, wybór pliku po nazwie, restart tylko tej usługi, wynik „zapisano: tak”) i `familiada-secret list` (same nazwy). Z Termuxa albo terminala Cockpit.
- Portainer tylko do podglądu (stos z naszych skryptów).

## Wdrożenia przed, w trakcie i po przełączeniu (2026-10-23)

- **Do przełączenia:** wszystko jak dotąd — push na `main` → `db-migrate` / `deploy-edge` / `deploy-lead-finder` idą na **stary** serwer. Zrzut przy przełączeniu bierze je ze sobą. Strony (Cloudflare Pages) i Worker nie zależą od serwera.
- **W czasie przerwy:** bez pushy na `main` dotykających `supabase/migrations`, `supabase/functions`, `services/lead-finder` (poszłyby na stary serwer po zrzucie i zginęły). Inne sesje agentów — wstrzymane.
- **Kolejność w P6 (ważna):** najpierw sekrety `SERVER_HOST`, `SERVER_USER=deploy`, `SSH_PRIVATE_KEY` (klucz konta `deploy`), `SERVER_KNOWN_HOSTS` → nowy serwer; **dopiero potem** scalić `przeprowadzka-p6` do `main` (scalenie zmienia pliki workflow, więc samo uruchomi `db-migrate` i `deploy-edge` — muszą trafić w nowy serwer; na nowym nic nie zmienią, bo stan = zrzut). `przeprowadzka-p6` koliduje z `main` tylko w tym dokumencie.
- **Po przełączeniu:** push na `main` jak dotąd, ale automaty łączą się z nowym serwerem jako `deploy` (tylko `sudo familiada-*`: psql, zrzut schematu, wdrożenie funkcji Edge z powrotem, Lead Finder z powrotem). `db-read`/`maintenance` też przez `deploy` (rola `reader`). Stary serwer: bez wdrożeń, zostaje kilka dni jako zapas, potem P7.

## Lista kontrolna przełączenia (P6) — obowiązkowe w dniu migracji

Właściciel 2026-10-22: „to trzeba zrobić podczas finalnej migracji — zapamiętaj”.

1. Właściciel włącza przerwę techniczną; `maintenance.yml` potwierdza.
2. `transfer.yml` — świeży zrzut (przy włączonej przerwie, żeby nic się nie zmieniało).
3. `server.yml restore production` — automatycznie robi to, co wyszło w próbie:
   - `.env` przez `env-adapt.py`: **`GLOBAL_S3_BUCKET=familiada`** (pusty psuje Storage 1.81), `COMPOSE_FILE` z override, `IMGPROXY_AUTO_WEBP`;
   - **pliki Storage przeniesione z `storage-single-tenant/` do `familiada/`**;
   - **`fix-owners.sql`** (właściciele obiektów auth/storage), inaczej GoTrue/Storage nie migrują;
   - klucz Vault (pgsodium) ze starego serwera;
   - crony **zostają włączone** (tryb production), adresy bez `2`.
   - Sprawdzić: `storage-layout` (3× HTTP 200), `restore check` (Vault 4/4, crony 13/13 aktywne).
4. `server.yml apps production` — Caddy z adresami bez `2` (+ `docker.`).
5. DNS w Cloudflare: `api`, `supabase`, `leads`, `panel` → nowy serwer (właściciel lub automat).
6. **Testy funkcji Workera z bazą** (nie dało się w próbie): logowanie przez `/_api/auth`, powielanie i wysyłanie zasobów, poczta (skrzynki testowe), panel admina, kontakt + punktowe e2e z próby.
7. Sekrety `SERVER_*` w repo familiada → nowy serwer, konto `deploy`; workflow wdrożeń na nowe skrypty.
8. Przy błędzie: DNS z powrotem na stary serwer (dane na starym nietknięte do końca przerwy).
- e2e (branch, `api2`) 39831651404 — `base-explorer` + `editor` + `games` + `game-settings`: 48 zielonych, 6 czerwonych, reszta niewykonana (limit błędów). 5 z 6: testy „dwóch użytkowników” — drugi kontekst (`browser.newContext()`) bez podmiany API szedł na stary serwer (`base_share_accept` do `api.familiada.online`). Poprawka pomocnika: `ensureApiOriginRouting` w `loginAsTestUser` (tylko gdy `E2E_API_ORIGIN`). 1 z 6: jednorazowe „Failed to fetch” przy zapisie pytania — do powtórki.
- Uwaga: `spec_filter` trafia do powłoki bez cudzysłowów — w `--grep` nie używać `|` ani spacji.
- 2026-10-22 wieczór: **pauza** — właściciel przerabia system testów. Przebieg 39842105166 (konta 9,10) anulowany po ~1 min (sprzeczność: CLAUDE.md „test9/10 nie używać” vs commit d08b338c „znów dostępne”). Po powrocie: powtórzyć paczkę `base-explorer editor games game-settings` na `api2` (na koncie/puli wskazanej przez właściciela), potem Control/wyświetlacz, potem skrypt przełączenia P6. Nic nie działa w tle.
- 2026-10-22 22:00 — wznowienie po E25: `main` scalony do gałęzi (bez konfliktów, unit 742/742), kopia odświeżona (`transfer` + `restore rehearsal` 39861440643): 94 tabele (migracje 460–465), 199 kont, 53 obiekty Storage, Vault 4/4, crony 0/13, usługi zdrowe.
- Po E25 tylko spece na `helpers/e2e-test` (lease) mają konta; dziś przepisany jest tylko wzorcowy `e2e-lease.spec.js` (poczta, bez `serveBranchCode`). Pozostałe 44 spece ze starymi kontami nie przejdą nigdzie. Próba e2e na `api2` czeka na przepisane spece albo na zgodę właściciela na przepisanie wybranych.
- 2026-10-23 rano: spece przepisane na lease (E25). `main` scalony (unit 766/766). Kopia odświeżona (migracje 466–470; restore 39905285974). Konto `deploy` na nowym serwerze: sudo tylko na `familiada-psql` (admin/reader), `familiada-schema-dump`, `familiada-deploy-edge` (wydania + powrót), `familiada-deploy-lead-finder` (obraz z tagiem sha, powrót) — `server.yml deploy apply` 39906683118; klucz SSH dla `deploy` przy przełączeniu.
- e2e na `api2` (39905593630): base-explorer, editor, games, game-settings, marketplace, go, go-states, polls, poll-voting — **213 zielonych**, 3 czerwone: gość (oznaczanie przez Workera = stary serwer), 2× konteksty bez logowania (głosujący, ekran QR) bez podmiany API. Poprawka: fixture `context`/`browser` w `helpers/e2e-test.js` kieruje każdy kontekst na `E2E_API_ORIGIN`.
- 2026-10-23: e2e na `api2` 39908117944 — **zielone** `polls`, `control-release`, `poll-qr`, `poll-anonymous` (po poprawce kontekstów). Kopia odświeżona po migracji 471 (`activity`: ostatnia `471_e2e_mail_resources`, 510 migracji).
- **Pomiar stary ↔ nowy** (`familiada-server` `compare.yml`): przez internet z GitHuba (USA) — RPC 114 vs 116 ms, realtime w obie strony 100 vs 100 ms (dominuje sieć). Na samym serwerze — RPC mediana 3,9 vs 4,5 ms, p95 10,5 vs 8,8 ms, max 13,8 vs 10,0 ms; stary 2×ARM / 2,4 GB wolne, nowy 4×x86 / 5,7 GB wolne. Pomiar pod obciążeniem (25 naraz) dodany.
- **P6 przygotowane:** `scripts/apply-migrations.sh` z `PSQL`/`SCHEMA_DUMP` (domyślnie jak dotąd); gałąź **`przeprowadzka-p6`** — automaty `db-migrate`, `db-read`, `maintenance`, `deploy-edge`, `deploy-lead-finder` przez konto `deploy` (`sudo familiada-*`) i sekret `SERVER_KNOWN_HOSTS`. **Nie scalać przed przełączeniem.** Próba uprawnień `deploy` (39910510883): odczyt/admin działają, Docker, inne sudo i niedozwolone flagi zablokowane.
- 2026-10-23 — **Control na `api2` vs produkcja** (te same 6 testów `control2`, ten sam kod brancha): produkcja 39913005579 — czerwone 473, 2857, 3563; `api2` 39913008593 — czerwone 100, 473, 2265, 2857. Wniosek: 473 (Buzzer przed czasem: `forbidden` zamiast `locked` — wywołanie bez lease) i 2857 (`game_content_locked:control_active`) padają **także na produkcji** — rozjazd speca z kodem, nie serwer. 3563 i 144 (outro) niestabilne na obu.
- `postgres_changes` (spec `game-state-realtime-spike.spec.js:197`): kanał SUBSCRIBED, ale zmiana `game_state` nie dociera w 15 s — **tak samo na produkcji** (39917036457) i na `api2` (39917039497, 39915049987). Nie skutek przeprowadzki; urządzenia działają na transporcie zapasowym (RPC + odpytywanie) na obu serwerach. Do osobnego zgłoszenia (poza przeprowadzką). `realtime-check` (familiada-server, tylko odczyt): na nowym serwerze sloty replikacji aktywne (zaległość 0), najemca Realtime założony świeżo z `.env`, `REPLICA IDENTITY FULL`, publikacja z `game_state` — konfiguracja zgodna ze starym.
- 2265 (mnożnik, 4 rundy) na `api2`: 2× przekroczony limit 240 s, potem zielony w 3,9 min (39915049987) — test na granicy limitu na obu serwerach, nie różnica serwera.
- Test TV (100) na `api2`: pomocnik testów pobierał „/” przez `route.fetch`, który sam szedł za przekierowaniem Workera dla TV (302 → `/connect/?tv=1`), więc adres zostawał „/” — poprawione (`maxRedirects: 0`). Po poprawce kod podłączenia „nieprawidłowy” na `api2` — pułapka routingu próby (strona TV z Workera), do sprawdzenia na produkcji po przełączeniu.
- Uwaga (stary serwer): slot replikacji Realtime ma **zaległość 1,4 GB WAL** — po przeprowadzce problem znika (nowy slot); do tego czasu obserwować miejsce na dysku.
- **Pomiar Control stary ↔ nowy (2026-10-23):**
  - pod obciążeniem na samym serwerze (25 zapytań naraz, `compare.yml` 39917657836): mediana 18,0 → **10,4 ms**, p95 50,9 → **22,8 ms**; pojedynczo 3,9 vs 3,8 ms; przez internet z GitHuba RPC 125 vs 127 ms, realtime 99 vs 102 ms (sieć dominuje);
  - czas funkcji Control **w bazie** (`db-perf`, `pg_stat_statements`, średnio): `game_state_write` 5,8 → **3,9 ms**, `game_state_get` 3,1 → **1,6 ms**, `game_state_set_lock` 1,8 → **1,1 ms**, `game_state_display_complete` 2,9 → **2,1 ms**, `control_devices_snapshot` 0,76 vs 0,79 ms; ustawienia Postgresa identyczne (17.6, jit on, shared_buffers 128 MB);
  - w e2e z runnera w USA zapis stanu gry (z siecią) na produkcji ~120 ms, na `api2` ~190 ms — różnica w drodze sieciowej (Cloudflare → serwer), nie w bazie; do ponownego pomiaru z Polski po przełączeniu (`compare.yml`).
- Narzędzia (familiada-server, tylko odczyt, stary i nowy): `realtime-check`, `db-perf` (`server.yml` / `inventory-old.yml`).
- 2026-10-23 wieczór — kopia odświeżona po migracjach 472–478 (`transfer` 40027858535, `restore rehearsal` 40027862591): 88 tabel, 262 konta, 65 obiektów Storage, Vault 4/4, crony 0/14, usługi zdrowe — schemat po sprzątaniu E26 wczytuje się na nowym serwerze bez błędów. `main` scalony do gałęzi (konflikt tylko w tym dokumencie; unit 789/789).
- e2e na `api2` po odświeżeniu: `polls`, `poll-qr`, `poll-anonymous`, `control-release`, `games`, `base-explorer`, `go` — **144/144 zielone** (40028705513); Control `control2:1176` (przejmowanie urządzenia, migracja 472), `:2265`, `:3563` — **zielone** (40028708992).

## Przełączenie P6 — dziennik (2026-10-23/24, noc)

- 22:23 przerwa włączona przez właściciela (`maintenance.yml`: enabled, aktywność 0). Świeży zrzut (`transfer` 40033429049), crony na starym **wyłączone** (`old-crons.yml off`: 0/14 — nowe zadanie, żeby crony nie działały na dwóch bazach; powrót = `on`), `restore production` 40033517780 (88 tabel, 262 konta, 65 plików, crony 14/14, Vault 4/4, migracja 479), `apps production` 40033923264 (Caddy: api, supabase, leads, panel, docker).
- DNS `api/supabase/leads/panel` → 75.119.141.106 (właściciel). Ruch e2e potwierdzony na nowej bazie (`activity`). Sekrety repo `familiada`: `SERVER_HOST`, `SERVER_USER=deploy`, `SSH_PRIVATE_KEY` (klucz `gha-deploy`, wygenerowany w Termuxie), `SERVER_KNOWN_HOSTS` — właściciel.
- **Znalezione i naprawione na nowym serwerze:**
  1. **Uprawnienia (bezpieczeństwo):** po `pg_restore` domyślne uprawnienia nowej bazy dały `anon`/`authenticated` EXECUTE na wszystkich 672 funkcjach public (stary: 321/430) i SELECT na 90 tabelach (stary: 46) — zrzut odbiera tylko różnice względem standardu Postgresa. Naprawa: `acl-sync.yml apply` (40036981048) — dokładne ACL każdej funkcji/tabeli/sekwencji ze starej bazy w jednej transakcji (764 REVOKE, 4626 GRANT), skróty uprawnień identyczne. Na stałe: `transfer` zapisuje `acl.sql`, `restore.sh` stosuje go po `fix-owners.sql`; podsumowanie restore pokazuje liczbę funkcji dla anon. Test „RPC nazwa→e-mail niedostępne anonimowo” zielony.
  2. **Hook wysyłki maili GoTrue (`send-email`) — 401:** wzorcowy router funkcji Edge (upstream `main`) sprawdza JWT dla każdej funkcji i nie zna `FUNCTIONS_VERIFY_JWT_EXCEPT` (`send-email,auth-email-status`). Naprawa: `supabase/install.sh` dopisuje obsługę wyjątków do `main/index.ts` (z asercją wzorca) i restartuje funkcje (`supabase apply`).
  3. **Lead Finder bez klucza odpowiadał 200 (/health):** stary Caddy wpuszczał tylko z kluczem. Naprawa: Caddy `leads` — `Authorization: Bearer <LEAD_FINDER_API_KEY>` albo 404; Caddyfile 640 (`apps production`).
- Testy TV i `/_api/auth`/kontakt (503) padają przez przerwę (Worker kieruje na stronę przerwy) — do sprawdzenia po jej wyłączeniu.
- Czerwone testy przy włączonej przerwie (blokady, lista gier, edytor, reset hasła — strona, znajomi): **strona przerwy (503)** dla przejść po zalogowaniu — token testów `X-E2E-Token` ustawiany raz przy logowaniu wygasa. Diagnostyka (40040151087): na nowym serwerze `acquire_edit_locks` → `ok`, blokada widoczna w `edit_locks`. Wniosek: nie serwer.
- 2026-10-24 ~00:45 właściciel wyłączył przerwę (`maintenance.yml`: off, aktywność 0). Testy kontrolne na `main`:
  - poczta + znajomi (40040927026): `account-password-email`, `e2e-lease`, `mail-queue-flags`, `friends` — **zielone** (hook `send-email` działa);
  - blokady/zasoby/bezpieczeństwo (40040924628): `cross-resource-locks`, `guest-duplicate`, `polls`, `resource-copy-send`, `security-endpoints`, `support-modal` — **37 zielonych**; 2 czerwone `tv.spec.js:4` i `:33` — fokus `#tvCode` w przeglądarce (bez bazy i serwera), do osobnego sprawdzenia;
  - wcześniej: Control (`control2:1176/3563`, `control-release`) zielone; automaty `db-migrate`, `deploy-edge` (40039544425, 40039544081) i `maintenance.yml` działają przez konto `deploy`.
- **Przełączenie zakończone.** Stary serwer: crony wyłączone, dane zostają na kilka dni (powrót: DNS + `old-crons.yml on`). Dalej P7 (klucze gha-install/gha-old, adresy `*2`, stare sekrety, hasła, kopia poza serwerem, podział sekretów, `settings`→`admin`). Lista kontrolna: próba generalna musi obejmować `security-endpoints`, pocztę i porównanie uprawnień (`acl-sync check`).

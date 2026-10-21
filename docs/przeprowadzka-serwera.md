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

Stan: P0 zrobione 2026-10-21 (repo `Andrish97/familiada-server`, szkielet: `bootstrap/bootstrap.sh`, `inventory/old-server.sh`, workflow `bootstrap.yml` i `inventory-old.yml`). **P1 — w toku** (właściciel: klucze z Termuxa, sekrety).

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

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

## Wnioski z 2026-10-21 (rotacja kluczy)

- Klucz `LEAD_FINDER_API_KEY` jest też w `/etc/caddy/Caddyfile` (blok `leads.familiada.online`) — przy zmianie klucza zmienić także tam.
- Przeładowanie Caddy zrywa konsolę właściciela, która idzie przez Caddy — zmiany Caddy robić automatem albo poleceniem odpornym na rozłączenie.
- Na starym serwerze kopie `Caddyfile.bak-20261021195900` i `.bak-rotate-*` zawierają stary klucz — do usunięcia.

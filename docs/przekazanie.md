# Przekazanie pracy — stan na 2026-10-10

Dla kolejnego agenta (Codex). Zasady pracy: `AGENTS.md` (identyczne z
`CLAUDE.md`). Plan i kolejka: [`wdrozenia.md`](wdrozenia.md) — **to jest
plan; rozmowa nim nie jest**. Decyzje użytkownika zapisuj od razu w sekcji
„Decyzje” właściwego dokumentu.

## 1. Co zostało zrobione (2026-10-07 … 10-10)

| Etap | Co | Gdzie opisane |
|---|---|---|
| E0, E3, E10 | zielone e2e arkuszy, błędy logowania, wygląd list i edytorów | `ujednolicenie-wygladu.md` |
| E11 | ankiety: klucz na uruchomienie, Zatrzymaj/Wznów/Podlicz, strona ankiety (Udostępnianie · Wyniki), hub usunięty | `ankiety-refaktor.md` |
| E12, E12b | usuwanie gry i konta; pliki w Storage usuwa baza (`storage_cleanup_queue`, migracje 313, 317, 318) | `usuwanie-danych.md` |
| E2 | blokady wg mapy docelowej (`logos`, `base:B`, keepalive przy zamknięciu karty) | `blokady-zasobow.md` |
| E4 | `nav-map.js` (`PAGES`, `linkTo`, `backHref`, łańcuch `ret`) | `nawigacja-mapa-plan.md` |
| E5 | nowe adresy (`/go/`, `/polls/vote/*`, `/games/{editor,settings}/`, `/control/{display,host,buzzer}/`, `/connect/`, `/logo/editor/*`, `/login/{reset,confirm}/`), migracja 319 | `nawigacja-mapa-plan.md` sekcja 8 |
| E6 | `initPage()` (`page-init.js`), wspólna nakładka gość/urządzenie (`page-overlay.js`) | j.w. 6.4 |
| E7 | bez stron modalnych: edytor `?q=`, ustawienia gry z autozapisem, Control → ustawienia/instrukcja zwykłym przejściem, bez `?modal=` | j.w. 6.5 |
| E8 | jeden moduł kart `tabs.js` (`?tab=`), stan eksploratora w `localStorage` | j.w. 6.6 |
| E9 | `buttons`/`locks` w `PAGES`, `scripts/nav-maps.mjs` (6 diagramów), e2e map | j.w. 6.7 |
| E15–E17c | poprawki ankiety, tytuł w topbarze na telefonie, dymek `toast()`, filtry/sort list, wspólny kafel | `ujednolicenie-wygladu.md` |
| E18 (część) | wzorce UI (`wzorce-ui.md`), przyciski `.btn.gold`/`.btn.danger` (obrys), paski akcji bez skrótów, okno QR na `.uni-modal`, sekcja „Link do głosowania” z dużym QR | `wzorce-ui.md`, decyzje w `ujednolicenie-wygladu.md` |
| E19 kroki 1–2 | migracja 320 (znajomi, zadania, plakietki), komponent wierszy, strona `/tasks/` | `e19-znajomi-plan.md` |

Poprawki błędów po drodze (warte zapamiętania):
- `updateChecked` (`db-guard.js`) dopasowuje `NULL` przez `is null` — wcześniej
  pierwszy autozapis ustawień nowej gry nie trafiał w wiersz.
- Regresja 2026-10-09: zatwierdzone znaczniki konfliktu → test
  `noConflictMarkers`; niezdefiniowane `ret` → lint `no-undef`
  (`scripts/agent-tools/eslint-undef.config.mjs`).

## 2. Następny krok: E7b (krótki), potem E19 krok 3

Plan: [`e19-znajomi-plan.md`](e19-znajomi-plan.md) — sekcje 1–4 (model, RPC,
strony, kroki) i **sekcja 6 (wszystkie decyzje użytkownika)**. Krok 3:
- migracja 321 (przełączenie; razem z kodem): `subscribers_invite`
  (konto → `has_account` + komunikat z pkt 2), `subscribers_list`,
  `poll_share_send`, `poll_claim_email_records` bez przepinania subskrypcji +
  `friend_invites_from_subscriptions()`, `poll_go_resolve` szuka też w
  `friendships`, `delete_user_everything` (+znajomości, urządzenia po e-mailu;
  bazuj na definicji z `schema.sql`), przyjęcie znajomości usuwa wpis
  subskrybenta (decyzja 8);
- strony `/friends/` i `/subscribers/` na `renderRowSections`, `PAGES`,
  `PAGE_ROUTES` (Worker), przyciski na liście gier, usunięcie
  `web/subscriptions/` i `PAGES.subscriptions` (bez aliasów), `/go/?f=`;
- spece: `friends.spec.js`, `subscribers.spec.js` (zamiast
  `subscriptions.spec.js`), `go.spec.js`, `frontend-navigation.spec.js`,
  `account-deletion.spec.js`.

Potem kroki 4–7, następnie **E14** (migracje usuwające — lista w kolejce i w
planie E19 sekcja 2) i na końcu **E13** (instrukcja).

## 3. Otwarte sprawy

- **E7b — do zrobienia przed E19 krok 3 (decyzja 2026-10-10)**: ustawienia
  gry w stanie niepoprawnym — przy wyjściu **ostrzeżenie** jak przy
  niezapisanych zmianach; przy zapisie niepoprawne wartości **resetować do
  poprawnych** (np. finał „wybierz” przy < 5 pytaniach → tryb losowania;
  własny dźwięk bez pliku → domyślny), tak żeby autozapis zawsze coś zapisał.
  `web/games/settings/js/game-settings.js`, spec `game-settings.spec.js`.
- **E18 — reszta wstrzymana** (decyzja „bez dopieszczania wyglądu”): #2 kafle
  logo, #3, #4, #7 marginesy + tokeny, #10, #12 reszta okien, #13 pusty stan.
  Społeczność (marketplace) — bez zmian do czasu pomysłu użytkownika.
- **Control** (`web/control/`, `control2.spec.js`) — obszar drugiej sesji.
  Ostatnie przebiegi e2e (10.10) są zielone, także control2 drugiej sesji.
  Krok 6 E19 (linki urządzeń z sesją) dotyka Control — koordynować.
- `host-logo-settings.spec.js`, `host-logo-draw.spec.js`,
  `host-logo-svg-fabric-audit.spec.js` używają test9/test10 — testy drugiej
  sesji, **nie uruchamiać**.

## 4. Jak pracować (skrót)

- Branch roboczy `ccr-4a2edd31-ekjnn8` (Claude) — Codex: własny branch od
  `main`. **Cykl wdrożenia** (`AGENTS.md`): baza najpierw → e2e kodu z
  brancha na produkcyjnej bazie (`serveBranchCode`, `REF=<branch>`) → push
  na `main` → punktowe testy kontrolne na produkcji. Unit przed każdym
  commitem (`cd tests && node --test unit/*.test.js`).
- e2e: `scripts/agent-tools/e2e-seq.sh "e2e/a.spec.js e2e/b.spec.js"` —
  nigdy cały zestaw; domyślnie jeden przebieg naraz. Lżejsze przebiegi mogą
  iść równolegle z rozłącznymi kontami: `ACCOUNTS=1,2,3 PARALLEL=1
  scripts/agent-tools/e2e-seq.sh …` (zasady: `tests/README.md`, „Pula kont”).
  Konta: pula test1–test8; **test9, test10 — nie używać**. **test14@** —
  skrzynka bez konta do scenariuszy „odbiorca bez konta” (nie zakładać konta).
- Migracje: dodające od razu na `main` (najpierw lokalny Postgres —
  `docs/sql/local-db.md`, test SQL w `docs/sql/`), usuwające dopiero po
  potwierdzeniu e2e (E14). Log zastosowania: `supabase/migration_logs/latest.log`
  (workflow „Apply DB migrations”).
- Scalanie `main`: `git -c merge.conflictstyle=diff3 merge origin/main` →
  `python3 scripts/resolve-version-conflicts.py` → `node scripts/version-assets.js`
  → unit. Nigdy `git checkout --ours -- web`.
- Podgląd stron bez bazy: `scripts/agent-tools/` (atrapa Supabase, README).
- Wynik każdego kroku w „Dzienniku” w `wdrozenia.md`.

# Przekazanie pracy — pauza 2026-10-11 (Codex)

**Praca zatrzymana na prośbę użytkownika. Nie uruchamiać testów ani dalszych
wdrożeń bez wyraźnego wznowienia w nowej sesji.** Wszystkie zmiany kodu
zapisane i wypchnięte na **`codex/e19-3`** w repo `Andrish97/familiada`.
Ostatni commit kodu przed tym przekazaniem: **`6761989e5`**.

## Bieżący stan — przeczytaj przed historycznym przekazaniem poniżej

- **E7b zrobione na produkcji**: zmiany `b9cc476ac`, testy brancha
  38089479328 (14 testów ok, dwie asercje naprawione), powtórka
  38091455118 ✓ (2/2 + unit 401/401), Pages 38091648065 ✓,
  kontrola produkcji **38091756034 ✓ (5/5 + unit 401/401)**.
- **Reguła obciążenia lokalnego** (decyzja 2026-10-11) w AGENTS.md,
  CLAUDE.md, nawigacja sekcja 7 i Dzienniku: ograniczać ciężkie zadania
  i symulacje tutaj; e2e na GitHub Actions; wymagane sprawdzenia pojedynczo
  z ograniczoną współbieżnością lub na odizolowanym runnerze.
- **E19 krok 3 — kod na branchu, NIE wdrożony**. Migracja
  `2026-10-11_321_friends_subscribers.sql` także **NIE na produkcji**.
  Nie traktować kroku jako skończonego. Strony `/friends/` i `/subscribers/`,
  wspólny moduł list `contacts-page.js`, `invite-mail.js`, mapy i Worker,
  usunięcie `/subscriptions/`, przekierowania z logowania i głosowania,
  migracja claim/udostępniania ankiet/usuwania danych są przygotowane.
- Commity E19: `2c225d5da`, `bbf28ee61` (merge main i wersje CI),
  `c919ce131` (fixture unit), `43604a54d` (zachowanie własnego dźwięku
  ze Storage + plakietka znajomych na Bazach), `6761989e5` (walidacja
  e-maila + regresja dźwięku). Dokumentacyjny `72b2356cf` potwierdza E7b.
- Unit na runnerze **401/401 ✓** w 38092186340 i 38092310787.
- SQL 38092094724: brak polityk maili w fixture; poprawione.
  SQL 38092186340: brak walidacji e-maila (`_norm_email` tylko normalizuje);
  poprawione. **SQL 38092310787 nadal czerwony**:
  `docs/sql/test-friends-subscribers-321.sql:66: permission denied for table friendships`.
  To zapytanie fixture pod rolą authenticated czyta `friendships` ze zrzutu
  schematu; następna sesja ma ustalić i poprawić przyczynę uprawnień w
  odizolowanym odtworzeniu (nie osłabiać produkcyjnego RLS).
- **E2E dźwięku 38092315064 anulowane na prośbę użytkownika**.
  Scenariusze `game-settings.spec.js --grep 'własny.dźwięk.z.chmury|bez.pliku'`
  wymagają ponownego testu brancha i kontroli produkcji po wdrożeniu.
- Nie uruchomiono jeszcze e2e nowych `friends.spec.js` / `subscribers.spec.js`.
  Zawierają scenariusze mailowe, więc uruchamiać pojedynczo (konta 7/8
  dla Znajomych; domyślne konto puli dla Subskrybentów; odbiorca test14
  jest wyłącznie skrzynką bez konta).

## Wznowienie w nowej sesji Codexa (również w aplikacji ChatGPT)

1. Pobierz repo i przejdź na **`codex/e19-3`**, nie zaczynaj od nowego
   brancha z main. Przeczytaj AGENTS.md, ten plik, wdrozenia.md,
   e19-znajomi-plan.md (sekcje 5–6).
2. Po wyraźnym wznowieniu: popraw test SQL 321 / odtworzenie schematu.
   Workflow `agent-checks.yml` na branchu z wejściem
   `verify_e19_321=true` uruchamia unit pojedynczo i odizolowany Postgres 16.
   Zrzut schematu odtwarzany ze stubami Supabase (jak local-db.md),
   diagnostyka restore jest artefaktem `e19-sql-restore`.
3. Punktowy e2e brancha: test zachowania własnego dźwięku wskazany wyżej,
   przez `REF=codex/e19-3 bash scripts/agent-tools/e2e-seq.sh ...`.
   Skrypt nie ma prawa wykonywania w tym środowisku — wywoływać przez bash.
4. Po zielonych SQL/unit: migracja 321 **razem z wymagającym jej frontem**
   (wyjątek cyklu dla migracji zmieniających zachowanie). Sprawdzić
   zastosowanie w `supabase/migration_logs/latest.log`, Pages i Worker.
   Od razu punktowe testy kontrolne: friends, subscribers, go,
   frontend-navigation, account-deletion i regresja własnego dźwięku.
5. Dopiero po zielonej produkcji zamknąć krok 3; dalej E19 kroki 4–7,
   potem E14 i E13. Control i control2 należą do drugiej sesji:
   przed krokiem 6 skoordynować zakres. E18 pozostaje wstrzymane.

Uwaga przy merge: resolver wersji przy konflikcie modify/delete przywrócił
usuwane `web/subscriptions/index.html` i JS. Sprawdzono, że main zmieniał
tylko wersje CI, po czym oba pliki usunięto ręcznie. Nie przywracać starej
strony i nie dodawać aliasów. `version-assets.js` wykonano po merge.

---

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
- **Wygląd**: symetria, równowaga, spójność podobnych elementów; zmiany
  konsultować z użytkownikiem **hurtowo** (paczka wg wzorca ze zrzutami
  przed/po) — zasada w `AGENTS.md`, wzorce w `wzorce-ui.md`.
- **E18 — reszta wstrzymana** (decyzja „bez dopieszczania wyglądu”): #2 kafle
  logo, #3, #4, #7 marginesy + tokeny, #10, #12 reszta okien, #13 pusty stan.
  Społeczność (marketplace) — bez zmian do czasu pomysłu użytkownika.
- **Control**: poprawki obecności/statystyk i opis Logo prowadzącego wdrożone
  2026-10-10; produkcja: rozłączenie 38088340380 ✓, renderer i manual
  PL/EN/UK 38088655683 ✓. Szczegóły: `control2-statystyki-plan.md`.
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

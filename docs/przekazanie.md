# Wznowienie pracy — 2026-10-11

## Najnowszy stan: E19 krok 7 w realizacji

Decyzja użytkownika 2026-10-11: **kontynuować zawsze bez pytania**, również po zamknięciu kolejnej paczki. Cykl testów i kontroli produkcji pozostaje obowiązkowy; zrzuty po wykonaniu, manual na końcu.

E19 kroki 1–6 zamknięte produkcyjnie. Poprawiony wygląd Urządzeń i modal
Control: `44063a604`, Pages 38133157139 ✓, kontrola 38133215588 ✓
(2/2 + unit 401/401). Układ kontaktów (dwie karty, formularz po lewej,
bez dolnego paska, wspólne sekcje i wiersze): `4bddca4af`, `e85be48d3`,
Pages 38134388964 ✓; produkcja 38134439124 ✓ (4/4).

Test14 podłączony do prywatnego API skrzynki: migracja 326, DB
38134943769 ✓, Worker 38135085016 ✓. Test Subskrybentów odbiera teraz
rzeczywistego maila i używa jego linku zamiast tokenu z bazy. Poprawiono
stany go po ponownym otwarciu aktywnej/odrzuconej subskrypcji; po cofnięciu
link nie staje się formularzem nowej subskrypcji. Pages 38135350253 ✓;
branch 38135140865 ✓, produkcja 38135404218 ✓ (4/4 + unit 404/404),
mail test14 odebrany produkcyjnie po 65 s. **Test14 nadal bez konta.**

Branch `codex/e19-3` kontynuuje krok 7. Następne: zachowanie odmów w
kontraktach kontaktów (328 zachowuje rekord odmowy; nowa decyzja wyłącza
ponowienia odrzuconych i wymaga korekty RPC/UI) i wspólne
sekcje Baz/Ankiet. Metadata flagi mailowej i cooldownów (327), liczniki
oraz ikony/skróty kontaktów wdrożone: kontrola 38138576962 ✓. Lista w
`e19-znajomi-plan.md` §5. Przegląd treści i wyglądu wszystkich maili jest
osobnym punktem w `maile-granice.md`. Dla zmian rozpisywać pełne pokrycie
stanów/uprawnień i przypadków krzyżowych, bez zastępowania testu odbioru
maila odczytem tokenu. Wskazywać rzeczywisty zakres sprawdzeń.

Starsze informacje o pauzie/drugiej sesji i otwartym kroku 6 niżej są
historyczne. Użytkownik wznowił pracę, zezwolił na cięższe lokalne zadania
i push na main po wymaganych kontrolach. Zmiany wizualne dokumentować
zrzutami po wykonaniu, bez czekania na decyzję; Control na telefonie
zachowuje guard. Manual zawsze na końcu.

## Zadania — poprawka odstępów i przegląd kafelków

Odstępy, ikony pochodzenia i lekkie kolory rodzajów wdrożone. Kompaktowy
mobile `c9c25f2ef`: Pages 38140156595 ✓, kontrola 38140200630 ✓ (3/3
bez retry, unit 408/408). Na telefonie opis bez dat, do dwóch linii tytułu
i opisu, mała ikona; E20 rozszerzy zasadę na resztę systemu.
Branch 38139084807 ✓: 3/3 bez retry (rzeczywista baza oraz kontrolowany
przegląd wszystkich 10 wariantów, filtry, zwijanie, pusty stan, odstępy
na 1400/390 px), unit 408/408. Kontrole produkcyjne 38139233191, 38139841640 i 38140200630 ✓;
na main spec używa opublikowanych plików Pages, nie podmiany kodu.
Sześć zrzutów w `docs/img/e19-tasks/`, tabela stanów i linki w planie E19.
Ankiety z głosem: Zrobione 5 dni; bazy po decyzji znikają; urządzenia
podłączone pozostają do cofnięcia/wygaśnięcia. Nie zmieniano tych zasad.

## Odmowy i duplikaty — najnowsze doprecyzowanie

Użytkownik potwierdził: brak przypomnień po odmowie. Odrzucone znikają
z list i sama odmowa wygasa po czasie, umożliwiając nowe dodanie osoby
(Znajomi/Subskrybenci/Bazy). Założenie realizacji: 30 dni od odmowy;
znikanie z list nadawcy po 5 dniach. Użytkownik zatwierdził rozpisane
propozycje i terminy; 5/30 dni nie są już otwartymi parametrami. Stary token unieważniony,
nowe zaproszenie wymaga ponownej akceptacji; bez automatycznej wysyłki.
Nie mylić odmowy zaproszenia z wypisaniem się z aktywnej subskrypcji.
Najnowsze doprecyzowanie: odbiorca ma zachować własne odmowy do wygaśnięcia,
w zwiniętej sekcji „Odrzucone przeze mnie”. „Cofnij odmowę” przywraca
oczekujące; osobne Akceptuj dopiero tworzy relację/dostęp. Bez nowego
maila/tokenu i resetowania limitów. Znajomi przy Propozycjach, bazy
w Bazy → Udostępnione, subskrypcje konta poza Zadaniami (model/lokalizacja
jeszcze do rozstrzygnięcia). Subskrypcja
bez konta: brak undo aż do wygaśnięcia 30 dni, potem nowe zaproszenie. Ukrywanie po
5 dniach dotyczy tylko nadawcy. Akceptacja bazy obecnie istnieje zarówno
w Bazach, jak i Zadaniach (ten sam rekord/RPC); poprzedni opis tylko
Zadań był niepełny. Pełna tabela obu stron wszystkich odmów w E19 §7. Cofnięty/wygasły/usunięty zasób blokuje akcję.
Paczka Znajomi 329 zakończona produkcyjnie: DB 38144511047 ✓, Pages
38144511009 ✓, main 38144971546 ✓ 8/8 bez retry + unit 408/408. Wdrożone
undo → pending, osobna akceptacja, terminy 5/30, bez przypominania odmów,
osobne komunikaty duplikatów i brak automatycznej akceptacji krzyżowej.
Dwa rzeczywiste maile odebrane test8. Stary token po 30 dniach nie działa;
rekord fizycznie usuwany przy nowym invite, okresowy cleanup jeszcze w grafie.
Zrzuty zwiniętej/rozwiniętej sekcji desktop/mobile docs/img/e19-friends/refusal-*.
Menu zamyka się przed nawigacją, dotykowe hover/active bez filter/transform;
test tabletowy ✓, fizyczny kolorowy szum Lenovo wymaga obserwacji użytkownika.

## Najnowsza decyzja: Zadania tylko dla ankiet

Zadania i ich plakietka mają obsługiwać wyłącznie ankiety. Bez zbiorczej
skrzynki i sumowania liczników innych ikon. Znajomości obsługuje Friends,
bazy Bases → Udostępnione, urządzenia Connect → Udostępnione dla mnie;
subskrypcje na konto poza Tasks, właściwą lokalizację dopiąć bez starego
/subscriptions/. Nowa sekcja undo subskrypcji nie powstaje w Zadaniach.
Istniejące bazy/urządzenia w Tasks oraz Go prowadzące bazę do Tasks są
starszym wykonanym etapem; teraz zmienić RPC, plakietki, UI, routing i testy
spójnie. Rozpiska w końcowej sekcji E19. To decyzja, jeszcze nie wdrożenie.

## E20 — kompaktowe informacje na telefonie

Nowa decyzja użytkownika: ukrywać na telefonie nieobowiązkowe informacje
zabierające miejsce, konsekwentnie na wszystkich stronach/komponentach.
Zakres w `ujednolicenie-wygladu.md` §E20, etap w kolejce przed manualem.
Zadania są pierwszym wzorcem; cały przegląd E20 nadal do wykonania.

## Tymczasowa blokada skrótu Control (2026-10-11)

Przycisk „Znajomi” w Control ma być widoczny z ikoną `people`, ale zablokowany.
Zależność jest w PAGES: `blockedUntil=modalPagesReview`, centralnie
`completed=false`; initPage i generowane diagramy korzystają z tej samej
blokady. Odblokować dopiero po przeglądzie E19N (stare funkcje, mapa, zapis,
blokady i wznowienie Control), zgodnie z tabelą w nawigacja-mapa-plan.md.
Historyczne E7 nie zamyka nowej zależności. Pozostałe skróty kontaktów działają normalnie. Nie zdejmować tej
blokady przy kolejnych zmianach wyglądu/kontraktów; mobilny guard też pozostaje.

## Doprecyzowanie E19: hierarchia i routing linków

Wspólne drzewo rodziców/potomków, wpływ na blokady oraz propagację usuwania
opisują teraz `docs/blokady-zasobow.md` §7 i `docs/e19-znajomi-plan.md` §7.
Wymaga ono jeszcze implementacji; nie traktować planu jako wdrożonej kaskady.
Przegląd linków potwierdził, że tokenowe zaproszenia (`t/s/f/b`) używają
resolvera `/go/`, linki urządzeń mają prefiks `/go/`, ale obecnie są tam tylko
przekierowywane, a anonimowe głosowanie/QR idą wprost do `/polls/vote/...`.
Wymaganie użytkownika: konsekwentnie wprowadzić każdy udostępniany link przez
`/go/` i spójnie pokazywać tam wszystkie stany przed przejściem dalej; także
anonimowy link ankiety trzeba objąć walidacją w `/go/`, zachowując anonimowość.
Rezygnacja z maili już używa `/go/?u=` lub `/go/?s=…&action=unsub`; podglądy
Control są wewnętrzne i mogą omijać `/go/`. Szczegóły w
`docs/e19-znajomi-plan.md` sekcja „Routing linków”.

Anonimowe głosy mają dziś losowy `voter_token` w `localStorage` per gra i
uruchomienie, bez limitu IP; wyczyszczenie storage pozwala uzyskać nowy token.
Łagodny limit 30 s między pełnymi wysłaniami z jednego pseudolosowego tokenu
przeglądarki jest propozycją w planie, nie wdrożonym wymogiem.

Aktualne doprecyzowanie UI ankiety (źródło: `docs/ankiety-refaktor.md`, nowa
podsekcja E19; tabela w `docs/ujednolicenie-wygladu.md`): dwie karty to
„Udostępnianie” i „Głosy” (starsza nazwa w planie: „Wyniki”). Karta
Udostępnianie ma sekcje „Anonimowo” i „Odbiorcy” (znajomi/subskrybenci).
Wspólne sekcje mają ten sam komponent i CSS. Płynne przejścia stanów karty
Głosy pozostają jak w dotychczasowym planie. Nowa poprawka wizualna obejmuje
wyłącznie globalne akcje nad kartami: styl zbliżony do przycisków Gier,
rozmiar `.btn.sm`, kompaktowe na telefonie. Hierarchia zostaje jak w planie
ankiet (główna akcja `.btn.gold`, „Przerwij” — czerwony obrys `.pollAbort`).
Nie obejmuje przycisków wewnątrz kart ani zamykania dialogów/nawigacji; nie
cofa wykonanych zmian. Wcześniejsze pytania otwarte/tabele w
`ankiety-refaktor.md` §2–3 są historyczne, jeśli rozwiązano je w §1 i
aktualizacji E19.

Użytkownik wznowił pracę i zezwolił uruchamiać cięższe zadania lokalnie na serwerze Codexa. Repo po scaleniu E19 kroku 3 jest na `main` (`f280941fd`); branch `codex/e19-3` ma ten sam stan. Poprawiono test SQL 321
(commit `6a8753616`): fixture pobiera token jako administrator ze względu na
`FORCE ROW LEVEL SECURITY`, po czym resolver jest nadal wywoływany w roli
`authenticated`. Walidacja runnera 38096872246: unit i SQL ✓. Punktowe e2e
brancha 38096917201: dźwięk własny bez pliku i dźwięk Storage ✓ (2/2).

Migracja 321 została wdrożona razem z frontem na `main`; log migracji, Pages,
Worker i wszystkie kontrole produkcyjne są zielone. E19 krok 3 zamknięty.
Wyniki produkcyjne: `friends` 38099344264 (2/2), `subscribers` 38099196468
(2/2), `go --grep 'subscription invite'` 38099459575 (2/2),
`frontend-navigation` 38099534030 (11/11), `account-deletion` 38099771245
(1/1), regresja dźwięku 38099849073 (2/2); unit 401/401 w każdym przebiegu.
E19 krok 4 jest zamknięty: branch po synchronizacji 38100967351 ✓; Pages
38101052370 ✓; kontrola produkcyjna `poll-share.spec.js` 38101089865 ✓, unit
401/401. Scenariusz sprawdza obie grupy, mail test8 i ukrywanie zaproszonych.
Pierwsza próba testu przekroczyła limit oczekiwania na mail (pozostawał pending
w kolejce); retry przeszedł. Rozpoczęty E19 krok 5: migracja 322 (`go?b=`)
wdrożona na produkcji w runie 38101647703; izolowany Postgres/SQL runner
38101686798 ✓. Branch ma commit migracji `e732e616c` i implementacji
`bdbd03568`: znajomi jako skrót w jednym oknie udostępniania, konto po
nazwie/e-mailu, link `/go/?b=`, prowadzenie do `/tasks/` (zachowuje `b`
przez logowanie). Punktowe E2E brancha `bases.spec.js` run 38102116117
wykryło pozostawione zaproszenie znajomości `pending` z poprzedniego runu;
run 38102345561 potwierdził obsługę tego stanu, ale wskazał względny
`mail_link` (naprawiono w teście; run brancha 38102541764 ✓). Front wypchnięto
na `main`, Pages 38102630814 ✓. Produkcyjne E2E 38102671588: flow znajomego,
link `/go/?b=` i akceptacja w `/tasks/` ✓; test maila do test8 nie dostał
wiadomości także po retry. Diagnostyka obu wpisów: `status=pending`,
`attempts=0`, `last_attempt_at=null`, `last_error=null` — wygląda na nieuruchomiony
run 38103011217 potwierdził aktywny cron `*/2 * * * *`; test maila oczekiwał
90 s, czyli mniej niż okres crona. Po zwiększeniu limitu oczekiwania do 150 s
produkcyjne E2E `bases.spec.js` run 38103300067 przeszło 2/2, unit 401/401;
mail dotarł po 33 s. Krok 5 zamknięty. Przed krokiem 6 skoordynować obszar
Control z drugą sesją.

Produkcyjne e2e
Znajomych 38097255431 zaliczyło główny przepływ maila/przyjęcia/usunięcia (po
retry), ale test e-maila bez konta ujawnił, że `alertModal` odrzuca opcję `body`
i przez to nie renderuje linku do Subskrybentów. Poprawiono `alertModal`, aby przekazywał `body` do wspólnego okna (commit
`9e94f2258`). Branch e2e `friends.spec.js --grep 'e-mail bez konta'`
38097620398 ✓ (1/1), unit 401/401 ✓. Pages z poprawką wdrożono w 38097702888; e2e produkcyjne `friends`
38097736761 przechodzi test brakującego linku. Test `subscribers.spec.js`
dostosowano do kontraktu E2E skrzynki test14 (worker mailbox API obsługuje
test1–test13); branch `subscribers.spec.js` 38098985469 ✓ (2/2, unit
401/401). W dalszej kolejności testy kontrolne produkcji: pełne friends,
subscribers, punktowe go, frontend-navigation, account-deletion i regresja
dźwięku. Krok 3 nadal otwarty do zielonych kontroli produkcyjnych.

---

# Przekazanie pracy — pauza 2026-10-11 (Codex)

## Aktualizacja po wznowieniu — 2026-10-11

Użytkownik potwierdził, że poprzednia sesja nie pracuje już nad Control, i
doprecyzował docelowe zachowanie udostępnień. E19 kroki 1–5 pozostają
zamknięte; następny jest krok 6. Szczegółowe wymagania zapisano w
[`e19-znajomi-plan.md`](e19-znajomi-plan.md), sekcja 7, z tabelą ekranów w
[`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md) i regułą kolejki w
[`maile-granice.md`](maile-granice.md). Aktualizacja dotyczy planu; nie
rozpoczyna jeszcze implementacji.

Ważne uzgodnienia: powiadomienie to e-mail; przed zakolejkowaniem sprawdzana
jest flaga `user_flags.email_notifications`; ponowienie wysyła wyłącznie
przypominający mail. Udostępnienia ankiety są przypięte do pojedynczego
uruchomienia. Sesja Control ma wygasać po godzinie bezczynności, czyścić
powiązane rekordy Storage i unieważniać udostępnienia urządzeń.

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

## Trwająca paczka 330 i pytanie o model subskrypcji

SQL 330 na main: DB 38144761004 ✓, log OK 330 13:52:06 UTC; runner
38144647258 ✓. Front na branchu a41f447ee, unit 409/409 ✓, zrzuty
poll-only-* w docs/img/e19-tasks. Branch punktowy Tasks/Bases uruchomiony
po zakończeniu kontroli 329. Dopiero po zielonym promować front i kontrola main.

Pytanie kluczowe o subskrypcje wysłano asynchronicznie: obecny model
subscribers_invite odmawia kontom i kieruje do Friends, a nowe tabele
odmów rozważają subskrypcję na konto. Czy ma być niezależna subskrypcja
konta, czy zostaje model konto→znajomy / subskrypcja tylko bez konta?
Nie zmieniać tego modelu bez odpowiedzi; kontynuować niezależnie Tasks/Bases.

330 branch 38145406627 ✓ 7/7, gotowy do promocji frontu. Nowe decyzje
telefon/puste listy zapisane na końcu E19 i ujednolicenie-wygladu: dwie
przełączane karty z plakietką, wspólny pusty stan. Nowy wygląd udostępniania
Baz nadal do wykonania; SQL odmów 331 to tylko lokalny draft /tmp, nie etap
wdrożony.

Promocja 330: commit 63a2a4481 na main, Pages 38146034897 ✓, kontrola
main 38146083458 w toku. Po zakończeniu wpisać wynik; nie ponawiać
przebiegu równolegle. Lokalny /tmp/base331-draft.sql zawiera także
warunkową rezerwację maila i uczciwy wynik cancel; nadal wymaga pełnych
testów SQL/wyścigów i frontu. Nie generować go ponownie starym build331.py.

**330 zakończona:** main 38146083458 ✓ 7/7 bez retry + unit 409/409,
rzeczywisty mail test8 67 s. Pages 38146034897 ✓; SQL 330 OK. Następna
paczka: odmowy Baz i wspólny wygląd udostępniania; potem przełączane
karty mobilne kontaktów/plakietki/puste listy. Nie powtarzać zakończonej
kontroli 330. Brak odpowiedzi o modelu subskrypcji nie blokuje Baz/UI.

Bieżąca korekta Zadań (po decyzji o zbędnym wyszukiwaniu/typie zasobu):
cc4d4953a usuwa initListSearch/dolny pasek/etykiety typu, zachowuje
poll_type do routingu głosowania. Unit 410/410; nowe zrzuty simple-*.
Branch UI 38147051449 w toku (dwa kontrolowane widoki 1400/390).
Doprecyzowanie kontaktów: na telefonie zakładki **z wypustkami jak w Grach**,
nie pionowe panele; zapisane w E19/UI, jeszcze do wdrożenia.

Korekta Zadań: branch 38147051449 ✓ 2/2, Pages 38147149505 ✓,
kontrola main 38147198385 w toku. Następnie zapisać wynik; nie uruchamiać
równolegle drugiej kontroli. Pozostałe otwarte paczki zachowane.

Uproszczenie Zadań zamknięte: main 38147198385 ✓ 2/2, unit 410/410;
Pages 38147149505 ✓. Bieżąca kolejna korekta: usunięcie Zaakceptowano
z aktywnych kafelków znajomych/subskrybentów, bez zmian pending/declined.
Zakładki z wypustkami nadal otwarte, nie zrealizowane przy tej korekcie.

**Pytanie o model Subskrybentów rozstrzygnięte:** tylko adresy bez konta,
konto→Znajomi, zgodnie z obecnym subscribers_invite. Nie pytać ponownie,
nie tworzyć osobnej obsługi subskrypcji kont ani jej plakietki. Otwarte
kontrakty E19/UI skorygowane; historia wcześniejszego pytania zachowana.

Statusy active: Pages 38147497547 ✓, kontrola main 38147553964 w toku.
Branch 38147347570 ✓, lokalne cztery zrzuty active-* bez overflow.
Plan subskrypcji bez konta i braku akceptacji w panelu zapisany; nie
wracać do pytania o subskrypcje kont. Wypustki mobilne jeszcze do wdrożenia.

**Korekta active zakończona:** main 38147553964 ✓ (oba panele, 1400/390),
unit 410/410, Pages 38147497547 ✓. Nie powtarzać zakończonych kontroli.
Następne otwarte zakresy: zakładki z wypustkami/plakietki/puste listy
kontaktów, odmowy Baz i wspólny wygląd udostępniania, odmowy anonimowych
Subskrybentów 5/30 dni bez undo/akceptacji w panelu; model kont rozstrzygnięty.
Manual ostatni. Lokalny draft 331 nadal wymaga testów i frontu.

**Aktualna kolejność po poleceniu użytkownika „wróć do planu”:** E19 §5
pkt 2 domknąć zakładki mobilne; potem pkt 3 odmowy/cooldowny Subskrybentów
(Znajomi 329 gotowi), pkt 4 Bazy, pkt 5 Ankiety, pkt 6 maile, pkt 7 graf.
Nie przestawiać kolejki na podstawie samego ostatniego doprecyzowania.
Zakładki teraz na branchu: unit 411/411, zrzuty tabs-*; brak kontroli
branch/main przed oznaczeniem wykonania. Draft Baz /tmp/base331-draft.sql
nie wyprzedza pkt 3 i przed użyciem musi dostać właściwy kolejny numer.

**Pkt 2 kontaktów zamknięty produkcyjnie:** branch 38148641622 ✓,
Pages 38148810039 ✓, main 38148894724 ✓ 3/3 bez retry, unit 411/411.
Obejmuje wypustki 36 px, pełną wysokość kart, wewnętrzne niezależne
przewijanie, stan zakładek/URL/Go/keyboard oraz regresje active/odmowy.
Następny krok §5 pkt 3: Subskrybenci — audyt kontraktów zapisany na końcu
E19. Nie powtarzać zakończonej kontroli kontaktów.

Mobile landscape: zakres doprecyzowany w ujednolicenie-wygladu.md —
PAGES plus wszystkie strony HTML, w tym Go/głosowanie/urządzenia i strony
techniczne. Przegląd UI/E20 przed manualem; manual sprawdzić w jego
ostatnim etapie. Nie oznaczać landscape jako wdrożonego: guard nadal
blokuje telefon po obrocie. Kryteria/testy i macierz grup stron zapisane.

**W toku pkt 3 / 331:** pierwsza paczka zabezpiecza zamknięte tokeny
Subskrybentów (legacy RPC tworzył aktywny wpis po odmowie/cofnięciu).
Migracja i rollback SQL/wyścigi lokalnie ✓, unit 411/411. Runner 331
do uruchomienia; następnie SQL main/log i punktowe Subscribers z dwoma
rzeczywistymi mailami na test14. Kontrakt odmów 5/30 i flag/claim pozostaje
następną paczką 332; nie oznaczać pkt 3 zakończonego.

331: runner 38150342363 ✓, SQL main ca1a635ab1; czeka na log zastosowania
i punktowe branch/main Subscribers. E2E po reload czeka na komunikat Go,
żeby asercja braku Akceptuj nie przeszła przed inicjalizacją strony.

# Wznowienie pracy — 2026-10-11

## Bieżąca kontynuacja: kolejka §5 pkt7 Graf zależności

Pkt4 Bazy337–339 i pkt5 Ankiety340–344 zamknięte produkcyjnie.
Pkt6 Maile też zamknięty: pierwsza paczka13 green38170191574 + świeże
wypisanie38171488172 ✓. Druga: Worker38172431062 / Edge38172431290 /
Pages38172431095 ✓; main38172503834 ✓2/2 bez retry/unit447,15 realnych
maili kontakt/ręczny/marketing do test14, HTTP200 czterech ilustracji,
moduły przeglądarki zapisanych podglądów. Branch SMTP38172035648,
preview38172320249, isolated38172318043 ✓. Zrzuty docs/img/e19-mails.
Szczegółowe granice pokrycia w maile-granice.md; nie nazywać samych
szablonów pełnym testem publicznego kontaktu/admina/signup/guest migration.

Teraz pkt7: graf/locks/kaskady/Go/anon, zgodnie z E19 §7 i blokady-zasobow.md.
Wypisanie=odmowa wszędzie zapisane. Audyt sprzed346 wykazał DELETE aktywnej
relacji i jednostronny cooldown po cancel;346 zachowuje odmowę, aktora,
budżet oraz zegary w obu kierunkach. _friend_drop_pair_tasks usuwa
pending/opened taski pary; częściowe głosy i oczekujące maile to dalsza
krawędź grafu.347 zamknięty produkcyjnie, z testami rzeczywistych maili.
Kaskada345 wdrożona: FK base_share_tasks→question_bases ON DELETE CASCADE,
DB38173636101/log OK20:48:43 UTC i rollbackowy smoke ✓; punktowy rzeczywisty
Base mail/Go/odmowy/role main38173864796 ✓ bez retry. Wypisanie Znajomych346
isolated38174631322 ✓ i DB38174746414 ✓/log21:04:59 UTC.
Branch38174928575 ✓3/3,38175511620 ✓1/1 (artefakt screenshotów),
main38175836595 ✓3/3 bez retry/unit447: trzy realne maile, oba aktory,
Go/undo/badge/cancel i ukrycie pustej sekcji.346 zamknięte produkcyjnie.
Lokalne podglądy z przykładowymi danymi: docs/img/e19-friends/withdraw-*.
347 zamknięte produkcyjnie: finalny isolated38177985246 success,
SQL DB38178919162/log OK22:05:58 UTC/schema368f847bcc. Poprawiony
branch38179382545 success2/2, main38179873750 success2/2 bez retry,
unit447/447, sześć realnych maili8/14 w56/96–101/84–87s.
Oba typy i oba kontakty: częściowy batch przez RPC po mailu/Go,
wypisanie usuwa partial, stary token bez dostępu; regresja pełnego
tekstu w UI też success. Pierwszy38179100034 failure dotyczył tylko
błędnej nazwy RPC w teście; poprawiono na poll_task_opened.

348 SQL zastosowany22:34:52 UTC. Pierwszy DB38180862825 zatrzymał
się na fixture: auth trigger tworzy powitalną grę. Seed/pętlę/asercję
zawężono do dwóch własnych ID; lokalnie również z dodatkową grą powitalną
success. DB38181241843 success, rollbackowy smoke wszystkich stanów/typów,
schema d2ab891270. Finalny isolated38180667222 success przed SQL.
Branch38181499992 failure PRZED usuwaniem konta8: stary klucz ankiety
sprzed poll_open i nieobsługiwany restore8. Konta7/8 nie usunięte.
Poprawiono pobranie bieżącego klucza, cleanup/log pierwotnego błędu.
Konta11/12 przywrócone: Worker38183104197 success, branch38183147636
oraz main38183277062 success1/1, oba logowania potwierdzone. Oba istniały.
Nowa decyzja:15 dedykowane usuwaniu,11 hasło,12 profil/mail i adres13.
Test kasowania12 NIE URUCHOMIONY; przeniesiony na15.349 DB38183364423
success.350 rozszerza skrzynkę/helpery o15, Worker restore15 weryfikuje
automatyczny wyjątek admina. Użytkownik dodaje routing15 w Cloudflare.
350 isolated38183690135 success/unit455, DB38183762947 success/log23:19:59,
schema a817702091, Worker38183764142 success. Routing15 potwierdzony mailem.
Pierwszy branch38183939578: restore11/12/15 success, maile15 w7.4/61.7s,
klik przed gotowością Account, BEZ kasowania. Oczekiwanie skel-step-ready
oraz odpowiedź Edge poprawione. Świeży branch38184283428 success2/2,
main38184602498 success2/2 bez retry/unit455. Mail15 w43.6/93.8s na branchu,
92.3/107.1s na main. Kasowanie przez UI rzeczywiście wykonane, nowy ID
po odtworzeniu, ukończony tekst zachowany/partial punkty usunięte,
stare linki/RPC niedostępne nowemu kontu i anonimowo. Finally odtwarza15
i sprawdza logowanie w świeżym kontekście; oba konta11/12 też logują się.
Automatyczny wyjątek admina15 sprawdzony również po odtworzeniu.
**348–350 zamknięte produkcyjnie; graf pkt7 nadal otwarty.**

351 przygotowywane na osobnym branchu codex/e19-351. Wykryty problem:
legacy task pozostaje e-mailowy po otwarciu; po zmianie adresu znika
wymóg zalogowania. Poprawka wiąże task z kanonicznym ID konta przy
rejestracji, zmianie adresu, konwersji gościa i przed skasowaniem konta;
nowe taski oraz backfill obejmują wszystkie stany obu typów. Sama zmiana
adresu profilu nie pozwala przejąć cudzych tasków. Prywatne blokady
adresów i referencje kont porządkują równoczesną rejestrację/udostępnienie.
Lokalnie351: kontrakt all-state, backfill, siedem regresji SQL,16 wyścigów
głosowania oraz4 wyścigi tworzenia tasków success. DDL vs stary child-first
cleanup success; unit455/455. 351 zastosowane00:46:56 UTC w38189206623; dalszy smoke zatrzymał się
na nazwie testowego profilu po ponownym użyciu adresu. Metadata nowego
konta poprawione; lokalnie z prawdziwym handle_new_user kontrakt success.
Finalny isolated38189424237 success. DB38189563784 success,
schema e1ba174d98/log351 already applied; oba rollbackowe smoke success.
Branch38189625221 success1/1 bez retry: dwa realne maile, anon partial
przed rejestracją, przypisanie obu typów do nowego ID, anon odmowa i Go
logowanie, full tekst/partial punkty, drugie kasowanie i odtworzenie,
stare tokeny niedostępne; finally świeże logowanie15.
Main38190032466 success2/2 bez retry/unit455: restore11/12/15 i
świeże logowania potwierdzone, oba maile15 oraz cały scenariusz rejestracji,
przypisania, Go, full/partial, kasowania i odtworzenia również success.
**351 zamknięte produkcyjnie w zakresie tożsamości tasków Ankiet.**
Następne352: źródło kontaktu. Lokalne rollbacki /tmp/e19-352
odtwarzają dwie luki: nowy właściciel starego adresu dostaje propozycję
znajomości z dawnej subskrypcji; cofnięcie dawnej subskrypcji po
przypisaniu taska do UID pozostawia task/partial i opened=ok.
Trwała referencja źródła, konwersja relacji bez utraty ważnego dostępu,
karencja30 dni bez obejścia i backfill bez zgadywania — zapisane w E19
oraz blokady-zasobow.md.352 jeszcze bez migracji. To dotyczy tasków Ankiet, nie całego grafu ani konwersji
legacy Subskrypcji. Pending kolejka/proweniencja maili, Go/anon i dalsze
krawędzie pozostają otwarte.

UI/E20: dopisany audyt stopniowego ładowania (body→topbar→sekcje).
Kontakty/Zadania odsłaniają zbiorczo; Ankiety nie mają etapów kart;
Gry też wymagają przeglądu. Szczegóły i bramki w planie wyglądu, nie wdrożone.

Dalej UI/E20 i landscape każdej strony; manual ostatni, bez technicznego
słownictwa, z jednolitymi nazwami i tylko informacjami potrzebnymi użytkownikowi. Kontynuować bez
kończenia tury po paczce, screeny po wykonaniu bez czekania na ocenę.

Puste listy UI/E20: wspólny kafelek z przerywaną obwódką i tekstem
na środku, jak brak gier, także dla „Nie masz jeszcze …”. Dopisane do
planu wyglądu; nie wdrożone. Puste sekcje własnych odmów nadal ukryte.


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
Aktualna decyzja: wypisanie z aktywnej subskrypcji = odmowa (ten sam cykl 5/30). Globalna flaga wyłączenia maili jest osobna i trwała.
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

331 branch 38150591218 ✓ 3/3 bez retry, unit 411/411; dwa rzeczywiste
maile test14 w 48/104 s. SQL OK 15:15:33 UTC, DB 38150405080 ✓.
Do domknięcia ta sama kontrola main; frontend/CSS w 331 nie zmieniony.

**331 main nie jest czystą kontrolą:** 38150902827 success, lecz 1 flaky
(429 baseline:recipient przy drugim scenariuszu); retry przechodzi.
Powód: helper E2E nie czyścił dodatkowej podłogi kolejki. 332 ograniczona
do helpera własnej pary test1–8→test14; nie zmienia cooldownów użytkowników
ani wyjątków kolejki. Lokalny rollback zakresu/ACL ✓, unit 412/412.
Runner 332 → SQL main/log → świeże branch/main Subscribers bez retry.
Następna właściwa paczka odmów/flag/claim otrzymuje 333 (332 zajęta).

332 runner 38151596399 ✓ (SQL zakres/ACL + unit 412/412), SQL main
41b0313828. Czeka log DB; potem trzy Subscribers branch/main jeszcze raz,
bez retry, z rzeczywistymi mailami. 331 nie jest zamknięta do tej kontroli.

332 SQL OK 15:33:35 UTC, DB 38151652553 ✓, schema 714682fa74;
unit 412/412 po merge. Branch 38151820876 trwa; czekać, nie uruchamiać
równolegle kolejnych maili. Po czystym wyniku ta sama kontrola main.

331–332 branch 38151820876 ✓ 3/3 bez retry, unit 412/412, dostarczone
maile 57/107 s. Następnie main ten sam spec, --retries=0; nie zamykać
przed jego wynikiem. Pozostały pkt 3 odmów/flag/claim to paczka 333.

**Aktualny stan — 331/332 zakończone:** main 38152153539 ✓ 3/3,
--retries=0, unit 412/412. Dwa rzeczywiste maile test14 w 22/102 s,
akceptacja/usunięcie i odmowa Go, oba RPC blokują zamknięte tokeny,
active wymaga właściwego adresu; konto→Znajomi. Branch 38151820876 ✓,
SQL/runner 331 i 332 ✓. Nie ponawiać tych kontroli. Front/CSS bez zmian.

**Następna praca:** E19 §5 pkt 3, paczka 333 — pełny kontrakt odmów
Subskrybentów: wypisanie = odmowa, niezależny trwały globalny mail-off,
5 dni widoczności / 30 dni karencji, zachowanie karencji po cofnięciu,
stare tokeny/nowe jawne zaproszenie, flagi przed licznikiem/kolejką,
resend pending z blokadą/metadata, konto→Znajomi we wszystkich starych
RPC i rejestracji/claim. Audyt na końcu E19. Dopiero potem pkt 4 Bazy
(draft /tmp wymaga kolejnego numeru i pełnych testów), pkt 5 Ankiety itd.

**333 lokalnie:** wypisanie = odmowa w każdym miejscu (czasy właściwe dla
zasobu), dla Subskrybentów wspólne 5/30 także stare RPC; globalny mail-off
trwały. SQL/wyścigi lokalne ✓, unit 412/412. Front pokazuje odmowy nadawcy
bez ponowienia; Go konta→Znajomi. Runner/produkcja jeszcze do sprawdzenia;
nie oznaczać pkt 3 zamkniętego. Zrzuty refusal-* w e19-subscribers.

Bieżąca druga bramka: Agent38172033341 ✓ unit444/Deno/kopie/Worker build;
branch38172035648 ✓15 SMTP i4 HTTP200 ilustracje. Zapisane podglądy Settings
dopięte przez stored-mail; potrzebne unit447/isolated i punktowy browser
preview, potem Worker/Pages oraz main15mail+preview. Producentów maili
na branchu nie zmieniono po zielonym SMTP.

Pkt7 bieżący draft345: base_share_tasks FK→question_bases CASCADE + indeks,
cleanup orphanów, rollback SQL i nowe wyścigi. Lokalne klony fam345graph/
fam345orphan PG16 ✓, regresje337 ✓. Agent input verify_e19_345 oraz
produkcyjny rollbackowy smoke w db-migrate przygotowane. Najpierw isolated,
SQL/main/log/smoke, potem punktowy istniejący E2E Baz. Front bez zmiany;
queue, wypisanie Znajomych i pozostały graf nadal otwarte.

**Aktualnie pkt7 /352:** lokalnie odtworzono publiczne legacy RPC
konwersji gościa z niepotwierdzonym cudzym adresem; zaproszenie Znajomych
mogło trafić do jego ID. Migracja352 wymaga potwierdzonego własnego adresu
Auth, kontrakt SQL z rolą authenticated i regresja351 success. Do wykonania
isolated, SQL/main/log i punktowy guest-conversion-identity.spec.js na
branch/main. Draft źródeł /tmp/e19-352 to przyszły353, nadal niewdrożony.
Audyt38192919036: task bez kontaktu jest testowy/current, odmowa znanego
konta poza30 dniami. Nie zgadywać historycznych powiązań.

**352 zakończone:** DB38202329118/log04:06:38/schema b212860fcd,
isolated38202222524/unit455, branch38202524806 i main38202658311
success3/3 bez retry. Dawne RPC konwersji wymaga potwierdzonego własnego
adresu; Account/Login pending/cancel pozostają poprawne, goście posprzątani.
Nie powtarzać tej paczki. **Dalej353:** /tmp/e19-353/source-draft.sql,
fam353draft; public share/macierz dwóch typów/pięciu stanów i sześć
regresji SQL success. Nadal lokalne, bez353 w repo/produkcji. Dalsze
wejścia i wyścigi oraz rzeczywiste maile wymagane. Manual na końcu.

**353 przygotowane w osobnym checkout:** /tmp/familiada-353-isolated,
branch codex/e19-353. Migracja źródeł/markerów/karencji; pięć rollbackowych
kontraktów, seed historii bez zgadywania,24 wyścigi i DDL. Lokalnie wszystkie
przeszły na fam353draft/fam353final. W macierzy rejestracji powtórna kontrola
właściciela po locku jest konieczna — stara kontrola negatywna cofała źródło
anonimowo już po przypisaniu konta. Nazwy procesów testowych są krótkie, bo
application_name w PostgreSQL obcina dłuższe nazwy. Reset shape353 wyłącznie
na izolowanej bazie przed powtórnym testem historycznych migracji; nigdy
produkcja. Najpierw unit/isolated353, potem SQL/log/smokes, real-mail branch
oraz main.352 zakończone; nie oznaczać353 wdrożonym przed tymi bramkami.

**353 zakończone produkcyjnie:** finalny isolated38209090723/unit455;
main ab837febf0, DB38209426059/log05:48:30/schema8110af1b70; branch38210607530
oraz main38211143647 success1/1 bez retry z rzeczywistymi mailami15. Wybrane
źródło, signup, cofnięcie, partial0/full10, oba Go expired i odbudowa15
potwierdzone. Nie powtarzać paczki.

**Następna praca354:** prototyp /tmp/e19-354, DBfam354draft. Actual anonymous
z metadata guest=false tworzy obecnie profil regular bez expiry. Root
klasyfikacja musi pochodzić z Auth/potwierdzonej konwersji. Prototyp Ctor,
regular classifier i normalizer success;351/352 pozytywnej konwersji także.
Jeszcze bez354 w repo/produkcji. Do audytu historii i pełnych testów.
Pozostałe źródła pochodnych propozycji/Baz i mailowe budżety/tokeny/kolejka
w E19; UI/E20 dalej, manual na końcu.

**Decyzja 2026-10-12 — ciągłość:** nie zatrzymywać pracy po raportach,
pytaniach o postęp ani zamknięciu paczki. Kontynuować kolejkę bez nowego
polecenia; zasada nadrzędna w AGENTS.md/CLAUDE.md. Pięć aktywnych etapów
głównej kolejki: E19, E19N, E14, E20, E13 (manual ostatni); część E18 nadal
historycznie wstrzymana. Numery migracji nie są liczbą punktów planu.

**354 zakończone produkcyjnie:** isolated38231809411/unit455, DB38232023390
OK09:48:17/schema d05bb70973. Po naprawie2 profili readonly38232398434
wykazuje0 błędów przy51 guests. Branch38232792528 success2/2, main
ce7e399097/38233127443 success4/4 --retries=0. Auth.updateUser odpowiedź
może zawierać metadata z input; niezależny getUser potwierdza zapis true.
Nie powtarzać354. Zasada ciągłości nadrzędna; raport nie zatrzymuje pracy.

**Następne355 lokalnie:** /tmp/e19-355/derived-proposal-prototype.sql,
DBfam355draft. FK friendships.source_subscription_id, jawne źródło tylko
dla nowych auto-proposals, parent przed child w _friend_locked. Source close
anuluje derived pending/declined bez kasowania count/cooldown; hard-delete
BEFORE trigger przed FK SET NULL. Accepted/manual pozostają niezależne.
Manual friends_invite już DELETE+INSERT, nowy ID i sourceNULL, zachowuje
still-valid email counter; nie dodawać zbędnego token-detach triggera.
7 kontraktów/8 wyścigów lokalnie success, w tym odmowa/source close.
Brak355 w repo/produkcji. Potem Bazy/pozostałe mail budgets/tokeny/kolejka,
Go/anon, E19N/E14/E20; manual ostatni. E20 tytuł/podpowiedź po prawej,
akcje po lewej (nowa decyzja12.10), kompaktowe mobilne filtry.

**355 przygotowane na branchu:** migracja/testy/CI w repo, przed isolated.
Lokalnie7 kontraktów/8 wyścigów/DDL i14 rollbackowych regresji success,
unit455. Produkcyjny test355 rozszerza poll-contact-source.spec.js:
recipient Friends tworzy derived proposal, owner source revoke usuwa
listę/accept/token/Go, actual SMTP obu poll typów i recovery15 pozostają.
Reset355 przed reset353, tylko izolowana DB; restore _friend_locked legacy
potrzebny po przyszłym schema355. Nie oznaczać355 wdrożonym przed bramkami.

**Nowa decyzja12.10:** E19C kopie Gier/Logo tylko znajomym; spec
udostepnianie-kopii-plan.md, kolejka po E19 i przed E19N/E14/E20/manual.
Samodzielny snapshot odbiorcy, bez cofania/ról; od X po akceptacji,
propozycje w zakładce typu, opcjonalna zwijana historia nadawcy. E20 nowe
ikony akcji telefonu, modal wyszukiwania/OK i listy filtra/sortowania.
6 aktywnych etapów głównych; manual nadal ostatni.

**355 zakończone:** isolated38234773357/unit455; DB38235155267 OK10:17:07,
main9c528ebd4e. Branch38235717751 i main38236412958 success1/1 bez retry,
rzeczywiste maile15 i Friends/proposal/Go/partial/full/recovery15. Nie
powtarzać355.

**356 lokalny prototyp:** /tmp/e19-356/build-prototype.py oraz
base-source-prototype.sql, DBfam356draft. Jawne base_share_to_friend
(required active relation), stare UUID/text API pozostają nadaniem ręcznym.
FK/typ pochodzenia taska, source guard/lock przed parą bazy/taskiem,
cofanie zachowuje manual pending i accepted role oraz count/refusal.
5 scenariuszy Source i6 regresji lokalnie success. Publiczny audit wykazał
GuestOwner mógł stworzyć ręczny share mimo ukrytego UI; proto sprawdza
regular Auth w create/lookup. Do pełnych kontraktów, wyścigów, DDL,
wiring frontu i mail branch/main. Nie ma356 w repo ani na produkcji.
Inna sesja rozwija Control2 diagnostics i pchnęła main4579b2ac54 —
przy scalaniu zachować jej zmiany, sprawdzić następny numer migracji.

**E19C doprecyzowanie:** „Wyślij” w sekcji importu/eksportu Gier/Logo. Standardowy modal: wybór znajomych i Wyślij, bez Udostępnionych; poniżej zwijana Historia wysyłek tej gry/logo (komu/kiedy), wpisy żyją30 dni. Usunięcie historii nie unieważnia wysłanej kopii. Aktualne źródło: udostepnianie-kopii-plan.md.

**Numeracja kolejnej paczki:**356 zajęte przez Control2 diagnostics drugiej sesji na main; lokalny prototyp Baz /tmp/e19-356/fam356draft otrzyma357 (sprawdzić wolny numer przed migracją). Historyczne wpisy prototypu356 pozostają historią, bez wdrożenia Baz pod tym numerem.

**357 przygotowane do isolated:** migracja i cztery pliki testów/resetu w repo; workflow verify_e19_348 rozszerzony po355, reset357 przed355/353. Lokalnie5 source scenarios + Auth/ACL,24 wyścigi (friend/manual/accept × friend cancel/delete, base delete, recipient account delete × obie kolejności), DDL i reset future schema success. Mig357 nie na produkcji. LocalDB fam356draft/fam357ddl/fam357reset, logi /tmp/e19-357. Front selectedfriends nadal stare RPC: zmienić dopiero w branch-code po SQL gate i potwierdzić real SMTP/Go.

**357 SQL wdrożone:** isolated38242911572/unit459 success; main83b8f5d93c, DB38243208054/logOK11:33:28/schema9f3b8a420b success wraz z rollback kontraktem. Branch frontend wybiera nowe RPC tylko dla checkboxów, zachowuje manual mail/name i pokazuje not_friend PL/EN/UK. Test base-refusals rozszerzony: accepted survives friend remove,2 actualSMTP/source split, stale checkbox denied/no task, Go closed/direct acceptable. Dalej branch4 tests --retries=0, dopiero frontendmain i te same4 tests. Nie zamykać357 przed kontrolą main. Wyglądu nie zmieniono, zrzuty z nowego UI niepotrzebne.

**357 zakończone produkcyjnie:** main38245594773 success4/4 --retries=0/unit459,3 real SMTP (62.7/106.3/121.7s), Pages38245434962 success. Branch38244399918, DB38243208054 i isolated38242911572 green. Nie powtarzać357. Zachowano aktualne zmiany Logo z mainbb8b2e52e3.

**Dalej pkt7 / kolejka:** /tmp/e19-358, fam357ddl. Rollbackowy lokalny audit: zamknięty task, usunięta baza lub recipientAuth nadal są wybierane przez stock mail_queue_pick_selected (1). Prywatny helper _mail_base_source_live_prototype: zamknięte0/żywe1; jeszcze NIE pełna implementacja/migracja. Dopiąć jawne powiązania źródła i wszystkie typy, tworzenie/claim/delivery, kanoniczny Auth i budżety/wyścigi. Nie zgadywać historii. Numer358 sprawdzić przed użyciem (inne sesje). Oczekujące kopie E19C należą do odbiorcy, sender delete nie zamyka pakietu.

**Bieżący lokalny358 / Control przy kolejce:** dwa konkretne błędy authenticated potwierdzone na kodzie main: global mail-off adresu bez konta nadal mail_allowed=true/budżet; anonymous sender omija ukryty UI. /tmp/e19-358/control-create-prototype.sql, control-preflight-prototype.sql, control-lookup-prototype.sql i queue-preference-prototype.sql. SQL w fam357ddl (klon miał niepełny Control: przywrócono current create z main oraz revoked_at). Regular Auth, sorted FOR SHARE auth roots przed Game/Session, kanoniczny lookup/mail_to, new by_lookup/preflight_by_lookup/to_friend, stale checkbox denied; istniejący aktywny grant niezależny po friend removal. Global mail-off sprawdzany przed budget i queue rodzin zasobów.

Kontrole lokalne: control-contract-draft.sql (7wariantów + guest/foreign/self/expired + lookup/ACL), control-create-concurrency-draft.py z CONTROL358_PSQL (32bariery locks; recipient/game/expire/email/owner, oba order, friend revoke), queue-preference-contract.sql (0queue/0clock). Logi /tmp/e19-358. **Nic358 w repo ani na produkcji**. Potrzebny świeży faithful clone aktualnego schema (obecny fam357ddl poprawiony wybiórczo tylko dla próby), DDL/all producer regressions i pełna macierz. Front Control resolveToUserId nadal profiles.email + profile_login_to_email: zastąpić by_lookup i canonical mail_to po SQL gate; dla zaznaczonych friend nowy to_friend. Znormalizować błędy PL/EN/UK i opis mail-off bez fałszywego „widoczne na koncie” dla osoby bez konta. Bez zmiany wyglądu urządzeń.

Następnie właściwe bound source FK/ingestion/claim/delivery wszystkich rodzajów maili, bo stock pick nadal wysyła zamknięte źródła. Private _mail_base_source_live_prototype na razie tylko local validation0/1, nie podłączony do kolejki. Sprawdzić wolny numer migracji; nie ogłaszać całego grafu gotowym. Manual ostatni, praca ciągła bez pytań.

**358 świeży faithful restore ukończony:** fam358faithful od aktualnego schema (bez błędów restore), auth stubs + rzeczywiste hooki initializer/metadata/identity. Proto create/preflight/lookup i queue flags, kontrakty oraz32 wyścigi success po odtworzeniu brakującej polityki friend:invite_after_reject. fam358ddl: draft NOWAIT locks przeciw dawnemu Game-first insert success. fam358regress: aktualny test-runtime324 success (initializer wyłączony tylko w tym klonie, ponieważ stary fixture sam wstawia profile/flags). Wszystko w /tmp/e19-358, nadal bez358 w repo/produkcji.

Gotowy lokalny plik control-identity-preferences-draft.sql; przed przeniesieniem do repo ponownie sprawdzić numer i odtworzyć go z ostatnich core/preflight plików (po drobnych dopięciach rodzica/owner recheck). Nowy izolowany job powinien zachować current schema, dodać rzeczywiste Auth hooki, przywrócić tylko brakujące ACL/policy data; nie replay starych337/324 nad nowszymi metodami. Potem SQL gate, branch UI by_lookup/to_friend/mail_to i prawdziwe maile, main i kontrola. Po tym nadal bound source/claim/delivery całej kolejki oraz reszta pkt7. Nie podłączać lokalnego base-live-prototype jako kompletnego rozwiązania źródeł.

**358 w repo i backend na produkcji:** isolated38256954899 success (faithful schema/Auth,32 races,DDL,runtime324), SQL main09fa3041a0/DB38257393434 OK13:42:37Z/schema2adf7d98cf, unit459. Front aa25dc6ac6 by_lookup/to_friend/mail_to/errors PL/EN/UK, no CSS. Branch38257851591:1passed (SMTPkonto/username/Go/duplicate),1failed po SMTPtest14 na nieistniejącej stopce globalUnsub. Naprawa fixture0c40fde042: token globalnej flagi pochodzi ze subscribers_invite, aktualny mail Control nie posiada anonimowej stopki (dopisana luka w maile-granice.md). Powtarzany punktowybranch2tests/1worker/pula1,2,7/retries0. Root fe1289f48b scalony z produkcyjnym schema. Nie push frontmain przedgreen; potem Pages/main te same2 tests.358 nie zamyka pkt7 ani bound source kolejki.

**358 branch green:**38260515251 success1/1 control358/retries0/unit459; konto/nazwa/SMTP/Go green w38258380406. Wszystkie błędy nowych przebiegów były w fixture/selektorze/importach testu; no-undef po poprawkach green. Aktualny frontend374a4c00b3; promować całą gałąź FF z2adf7d98cf na helper main, aktualizować assets/unit459, Pages i main2 tests tym samym grepem z pulą1,2,7/workers1/retries0. Po maingreen zamknąć358 i kontynuować359.

**359 lokalne:**fam359draft (klon faithful358), /tmp/e19-359. Base bound FK/binder/eligibility daje0 po cancel/base delete/recipient delete; jeszcze bez claim/delivery/root-locks i reszty rodzin. global-preference-prototype.sql + test: autoryzowany właściciel konta przywraca tylko canonicalAuthmail, nie profilealias; global root/token + userflag synchronizowane, guest/anon denial; guard każdej kolejki. Brak359 w repo/produkcji. User wymaga stopki globalnego wypisania zawsze (teżkontomail), global/nadrzędnie, informować nadawcę o rezygnacji. Go obecnie nie opisuje przywracania, account toggles nie czyszczą root suppressed_at. Brak ustaleń anonymousundo; nie wprowadzać samodzielnie.

**358 zakończone:** main38261432758 success2/2 --retries=0/unit459,2 real SMTP, Pages38260925626, branch38260515251 (test14) i38258380406 (konto), SQL38257393434 OK13:42:37Z/isolated38256954899. Root scala mainfed93b0a91; code Control canonical/flags completed. Nie powtarzać358.

**Nowy zakres /mail/ — ostateczna korekta:** maile-granice.md ostatnie sekcje + navmap. Subskrypcje oraz Zadania (ankiety+urządzenia) w jednej karcie z wypustkami Ankiet, globalny stan nad kartą; Go→centrum, dane/mutacje po potwierdzeniu, konto→login/account. Mail-only global-off zamyka wszystkie anonimowe źródła, ukrywa listy i nie odtwarza ich po przywróceniu. Starszy lokalny wariant /tmp/e19-359 zachowujący subskrypcje jest zastąpiony — nie wdrażać. Dotychczasowy sender-visible token u daje tylko wypisanie, nie odczyt centrum. Pełna stopka ma osobny prywatnie wydany token.360 jeszcze poza produkcją;359 to już zakończona naprawa skrzynki, nie numer centrum. Zakres konta pozostaje mail-only do odpowiedzi na jedyne pytanie architektoniczne o cofanie dostępów.

### 2026-10-12 — pilna skrzynka admina

Użytkownik zgłosił techniczne kopie własnych zaproszeń w skrzynce admina
(zrzut: nadawca `bounce+…@bounce-zem.familiada.online`). Paczka359 dodaje
pomijanie w Workerze, ochronę RPC i selektywne czyszczenie; testowe skrzynki
pozostają dostępne. Stan wdrożenia i przebiegi w dzienniku wdrożeń.
Zamknięte na produkcji: **13** kopii usuniętych; Worker38267398689 i
baza38267398627 zielone. SMTP38267524680: zaproszenie odebrane przez test7,
po nim SQL potwierdził brak technicznych kopii w skrzynce. Unit463/463.
Następny krok: wrócić do grafu/centrum `/mail/`; nie powtarzać naprawy359.

### 2026-10-12 — centrum360 na branchu, dalsza kontynuacja

Ostatnie pushe4074de9dc0 i1fc15f574b: prywatna weryfikacja/peek/sesja,
globalna rezygnacja/listy/źródła i kontrola delivery przed każdą próbą
dostawcy. Izolacje38281983338 oraz38283742852 success;481 unit przed
ostatnim pushem. Podglądy są danymi przykładowymi, nie produkcją360.
Kontakt także anonimowo na wszystkich niezależnych stronach. Telefon:
Wstecz w wspólnym topbarze, język dostępny bez utraty wpisów, stopka na
dole. Ostatnia korekta: standardowa linia/podpis/Kontakt, zachęta w treści,
wyśrodkowana ikona+napis Wstecz. Nowe zrzuty trzeba wypchnąć na branch.

Teraz lokalne preferencje360 i cleanup: retained root przy rejestracji,
getter Auth+global-off, explicit restore własnego potwierdzonego adresu,
historyczne u zamyka też anonimowe urządzenia; testy SQL success.
TTL cleanup zachowuje działającą sesję po15min wygaśnięcia proof i nie
rusza root/cooldownów. Unit483 aktualnie green; kolejne zmiany przed
commitem ponownie sprawdzić. Szkice w docs/sql, brak finalnej migracji.
Wyjątek Kontakt ma queue→inbound message→report/recipient match;
świadome zgłoszenie, jego potwierdzenie/odpowiedź i zamówiona weryfikacja
nie są blokowane flagą automatycznych powiadomień. Nie wysyłać rzeczywistego
zgłoszenia w testach (Telegram) — UI i transport Contact są zastępowane.

**Ostateczna korekta Auth:** użytkownik wyłączył korespondencję rejestracji,
resetu/zmiany adresu/konwersji gościa ze stopki centrum i rezygnacji.
Osobna funkcja/direct send pozostaje bez zmian. Dodaną stopkę wycofano;
draft account-footer usunięty, nie odtwarzać go ani nie naprawiać Auth
fallback w360. To był oddzielny audyt poza grafem powiadomień.
Treści podstawia Edge. Wiadomości Auth w ogóle nie są powiadomieniami;
nie podlegają fladze konta, globalnej rezygnacji ani odmowom zasobów.

Otwarte: pięć trwałych źródeł zaproszeń queue/claim/requeue/fresh delivery;
DDL/nowe wyścigi, finalna migracja360, rzeczywiste SMTP+UI branch/main.
Nie ogłaszać zamkniętego grafu ani produkcji `/mail/`. Sześć etapów głównych
w kolejce wdrożeń, manual ostatni. Aktualizacje około30–60s, po statusie
pracować dalej bez następnego „kontynuuj”. Konta9/10 nie używać,14 bez
konta,15 tylko bezpieczne usuwanie z odtworzeniem,11/12 nie kasować.

**361 lokalny prototyp:** trwałe źródła pięciu rodzin + jednorazowa zgoda
na kolejkowanie z istniejących budżetujących RPC. Audyt bezpośredniego INSERT
odtworzył obejście limitu relacji; kontrakt alokacji zamyka replay, również
po skasowaniu kolejki. Szkice docs/sql/*mail-notification*361.sql; DB
fam360clean. Nie wdrożono. Dalsze: unieważnianie po zamknięciu/flagach,
claim/requeue/fresh delivery, pięć rodzin i wyścigi, isolated i produkcyjne
bramki. Auth/send-email nie zmieniać: bez kolejki, flag i stopki centrum.

**Aktualny graf361:** pliki sources/allocations/rpc/bind/revocation/delivery
w docs/sql, wszystkie kontrakty na świeżym fam361proof success;60
wyścigów source close/delete/flag × enqueue/delivery ×5rodzin ×obie
kolejności success, z odzyskaniem Auth przez legacy child-first writer.
Root/source closure nie ożywa po undo; queue deletion nie resetuje
pozwolenia/budżetu. Hard-delete cascade sprawdzony, lease/delay zachowane.
Powtórny confirmation/Contact po361 success. Nowy HMAC test14 template
endpoint zwykły service marketing, nie udaje rzeczywistego zgłoszenia.
Dalej commit/isolated, DDL, finalna migracja i bramki SMTP branch/main.
**Auth już zamknięte:** fcdea7a889/cf1955779d, Edge38298008652, branch
38297713527/main38298190111 success1/1, mainunit467. Nie powtarzać.

**Auth niezależne od powiadomień — zamknięte 2026-10-12:** main
fcdea7a889, Edge38298008652, branch38297713527 i main38298190111
success1/1 bez retry, unit467/467. Rzeczywisty reset test11 dostarczony
przy email_notifications=false; wcześniejsza flaga przywrócona. Usunięta
dawna awaryjna ścieżka send-email→mail_queue po wyczerpaniu dostawców.
Auth nie ma kolejki/blokad powiadomień/stopki centrum; przy awarii zwraca
błąd. Treści Edge bez zmian. Nie powtarzać tego zamkniętego pakietu.
Nadal sześć głównych etapów planu; dalej E19 pkt7, manual ostatni.

**Końcowy360:** draft-mail-center-final-360.sql łączy8 modułów centrum
i6 modułów źródeł361, usuwa sufiks_prototype i nakłada wszystko atomowo.
Nowa migracja nie opublikowana. Lokalne fam360migration10 kontraktów
i fam360ddl pełne DDL przy legacy Game-first success. Workflow dodaje
świeży fam_final +DDL+te same kontrakty. E2E mail-center.spec.js gotowy
na2 punktowe scenariusze branch/main po backendzie; prawdziwe test14
footer/proof, global-off i źródła, UI/cookies/CSRF/cleanup/screeny.
HMAC helpery tylkotest14 do private caps/preference rollback, bez resetu
budżetów. Potrzebny final isolated, SQL+Edge+Worker, branch, Pages/main.

**Final gate38303218296 success.** Migracja360 wygenerowana w
supabase/migrations/2026-10-12_360_mail_center_and_sources.sql.
Publikacja sprzężona SQL+Edge+Worker+Pages (wyjątek w AGENTS dla zmiany
zachowania wymagającej nowego kodu; nowa stopka wymaga nowej strony).
Main ce81a3a9af/test-mode zachowany przez merge, wersje rozwiązane wyłącznie
resolverem. Następne: log360/wdrożenia, punktowe rzeczywiste SMTP i
mail-center2scenariusze branch/main, galerie screenshotów, dopiero closure.
Nie nazywać grafu całego systemu zakończonym: dalsze Go/anon/pozostałe
krawędzie i sześć etapów głównych, manual ostatni. Auth już zamknięte.

### 2026-10-12 —360/361 oraz wyjątki Kontakt zakończone

Centrum `/mail/` i graf źródło→kolejka→dostarczenie są na produkcji.
Main38308851386 success7/7 bez retry/unit510:2 scenariusze centrum i5
rodzin maili, rzeczywiste SMTP, Go, akceptacja/cofnięcie i partial,
prywatne cookie/CSRF, preview/one-use/global-off i przywrócenie bez
odtworzenia źródeł. Migracja360: DB38305424636 success; poprawka kanonicznego
linku urządzenia361: DB38306068075 success. Prywatny testowy mail-trigger
wywołuje tę samą kolejkę z istniejącym invoke_mail_worker_ids; żadnych
resetów budżetów/flag/delay/lease. Czekanie skrócone z120s do4–8s;
helper powtarza selekcję tylko dopóki UI nie wstawi maila. Domyślne
trigger:true; trigger:false do kontroli crona. Skrzynki9/10 wykluczone.
Syntetyczne szablony SMTP pozostają odrębne od Auth i rzeczywistego
kontaktu. Auth/inbox/358/360/361 nie powtarzać.

Rzeczywiste8 screenów: docs/img/mail-center/live/README.md, mainb148376779.
Workflow e2e ma jawne publish_mail_screenshots; po udanym specu centrum
zapisuje tylko shot-mail360-*.png do docs (zwykłe linki GitHub), ponieważ
pobieranie Azure artefaktów w środowisku jest niedostępne.

Korekta użytkownika: **Host/Display/Buzzer bez kontaktu**. Importy usunięte,
data-device-screen blokuje również wstawienie/otwarcie w module. Branch
38309604079 i main38310091221 success1/1,510/510, Pages38309965230 success.
Wszystkie3 urządzenia są online i Podsumowanie działa. Zwykłe strony
nadal mają Kontakt. Aktualny main zawiera również równoległe poprawki Control
oraz domyślnej głośności; zachować je przy scaleniach.

Dalej E19/pkt7: Go/łagodny anonimowy limit/końcowy audyt grafu. Lokalny
szkic362 w docs/sql/draft-poll-anonymous-362.sql i DBfam362draft, nie
migracja/produkcja. Pełny formularz atomowo,30s/przeglądarka/gra/klucz,
bez IP, osobny token głosu i idempotentny retry; legacy anonymous RPC
wymaga prywatnej autoryzacji transakcji, zadania i właściciel zachowują
swój dotychczasowy kontrakt. Pierwsze kontrakty tekst/punkty success;
dołożyć błędne payloady, duże formularze, zadania/właściciela, wyścigi,
frontend oraz bramki. Cały E19 pozostaje otwarty, manual ostatni.

**362 lokalnie gotowe do CI:**514 unit, oba typy SQL (40-pytaniowe pełne
formularze, serwerowa normalizacja, niepoprawne payloady, taski i rzeczywiste
owner batch),8 wyścigów oraz końcowe DDL na fam362final success. Szkic
finalny draft-poll-anonymous-final-362.sql nakładany atomowo z NOWAIT retry
wszystkich istniejących rodziców/dzieci. Front: poll-anonymous.js+
poll-submit-retry.js,30s/przeglądarka/gra/klucz, zachowane odpowiedzi,
idempotentne retry po straconej odpowiedzi, stara done ignorowana.
UI390/1400 z30-pytaniową atrapą sprawdzone,4 lokalne screeny i README.
Nowy workflow poll-anonymous-checks.yml i e2e/poll-anonymous.spec.js
(oba typy, faktyczne zapisy, strata odpowiedzi, naturalne30s, osobna
przeglądarka w tej samej sieci, legacy gate, stop/nowy klucz/cleanup).
Nowy publisher tylko po jawnym publish_anonymous_screenshots i zielonym
wybranym specu. SQL362/migracja jeszcze nie opublikowane. Po isolated
wymagają publikacji sprzężonej z frontendem (zmiana zachowania starego
anonimowego RPC). Mainf3a5bbd00f z równoległą poprawką Control zachować;
38314420248 to przebieg drugiej sesji, nie używać jej kont9/10.

**362 final isolated38314641449 success** na e7ec6d3c7d. Wygenerowana
2026-10-12_362_poll_anonymous_browser_interval.sql, identyczna z finalnym
szkicem przetestowanym wCI. Publikacja sprzężona SQL+Pages, potem E2E
obu typów w e2e/poll-anonymous.spec.js. Na main spec NIE podmienia Pages
branch-code, żeby potwierdzić faktycznie opublikowany front. Manual dalej
ostatni. Merge zachował nowe sekwencje Control/audio; stary unit renderu
zaktualizowany do już opublikowanego setText→setPts+bank,514 green.

**362 kontrola main:**38315259508 failure z powodu uiLang drugiej
przeglądarki (zapisy/idempotencja/cooldown/drugi niezależny głos działały).
Poprawka3070ea5120 ustawia jej polski język i retries:0 w specu. Main
kontrola38315815400 właśnie ruszyła,2 scenariusze z naturalnym30s,
rzetelne Pages (bez branch interception), jawne publikowanie screenów.
Nie zamykać362 przed wynikiem.

Następna paczka Go lokalnie: poll-links.js+4 unit, karta Anonimowo i
rzeczywisty ekran QR generują `/go/?p=anon&id=...&key=...&lang=...`.
Go sprawdza istniejący poll_state, prowadzi tylko open do właściwego
formularza, pokazuje closed/stopped/ended/expired/not_found, odrzuca
braki/mieszane/duplikaty, ma powtórne sprawdzenie po błędzie sieci.
Otwórz ekran QR przestał zagnieżdżać URL ekranu jako treść kodu.
Punktowy poll-go.spec.js i pomocniczy poll-game.js przygotowane (rzeczywista
finalizacja obu typów po trzech pełnych głosach). Jeszcze bez bramki
branch/produkcji. Publisher rozdziela galerę cooldown/live i go-live,
żeby nie nadpisywać poprzednich screenów. Nie uruchamiać na koncie1
równolegle z38315815400.

**362 zamknięte:** main38315815400 success2/2, bez retry,514 unit.
Oba typy potwierdzone na faktycznych Pages: naturalne30s, zachowane
odpowiedzi, idempotencja po utracie odpowiedzi serwera, niezależna
przeglądarka z tej samej sieci, legacy gate, stop/nowy klucz/cleanup.
Screeny main13d5be4759:docs/img/poll-anonymous/live. Nie powtarzać362.

**Go branch38315943894 success1/1**, bez retry/518 unit,28s. Generator
karty/QR/Otwórz rzeczywistego ekranu działa; realne open/stopped/draft/
expired/ended po finalizacji obydwu typów/deleted, błędne parametry i
błąd sieci+powtórzenie.10 screenów branch2ecd9206ba go-live. Teraz
publikacja Go na main→Pages→ten sam pojedynczy spec na produkcji (bez
branch substitution). Main1 i branch2 korzystały z rozłącznych kont;
bez maili/kontaktów/resetowania zegara. Cały E19/pkt7 nadal otwarty.

**Korekta „po co3 liczniki”:** użytkownik wskazał trzykrotne sekundy na
screenie. Usunięte odliczanie w opisie i dodatkowy toast. Wspólny helper
pokazuje jeden licznik na przycisku oraz „Odpowiedzi są zachowane.”.
Backend362 bez zmiany.2 nowe unit/PLENUK/timer/manual retry, lokalny
Chromium obu typów390/1400 success i4 obrazy odświeżone. Następny branch
E2E poll-anonymous.spec.js z asercją zapisanego opisu i braku app-toast;
Go już ma zielony branch38315943894. Potem razem Pages→main oba spece3
scenariusze, publisher dzieli cooldown/live oraz go-live (14 screenów).
Nie powtarzać SQL/wyścigów362 ani zamkniętych maili. Go reszty rodzin i
finalny audyt grafu dalej otwarte.

**Bieżące sterowanie użytkownika:** sesja Termux przestała działać;
użytkownik chce tutaj naprawić błąd statystyk i przebiegu rundy. Prośba
o opis wysłana async, jeszcze bez odpowiedzi. Przeczytany failed38314754916
z branchControl drugiej sesji: po END_ROUND widok runda2/Alfa90, stats
rounds_played0/rounds_score_a0. Log pokazuje optymistyczny render przed
commitNow write-ok (257ms), więc możliwy odczyt przed transakcją. Lokalny
rollback z faktycznym ustawieniami z logu, r_play PLAY→r_roundStart READY,
90 punktami daje1/90. Nie wdrażać naprawy DB na podstawie samego 0/0;
sprawdzić moment odczytu i zaczekać na doprecyzowanie zgłoszenia.

Użytkownik dopisał też odblokowanie Znajomych w Control i poprawę mapy:
nowa konkretna podsekcja E19N w nawigacja-mapa-plan.md. Na razie decyzja/
plan, bez zmiany przycisku; kontrola source modalPagesReview false i
blockedUntil. Po zamknięciu obecnej publikacji priorytet statystyki,
potem standardowa kolejka. Go + jeden licznik opublikowane main9d533fa094,
Pages38316775614 success; main38316869123 jest w toku3 scenariusze/14 screenów.
Branch pojedynczego licznika38316440463 success2/2,520 unit, screenyff3532d235.
Nie wracać do zamkniętych SQL/SMTP362/360/361/Contact3.

**Statystyki Control: diagnoza potwierdzona i branch zielony**38317373527
success1/1 bez retry/521 unit. Pełna runda90 + zapisany roundNo2/Alfa90,
statystyki1/90 oraz ta sama sesja/1 runda po odświeżeniu. Problem był
w czytaniu przed potwierdzeniem transakcji optymistycznej akcji w teście;
zapis backendu z poprawnym stanem działa. Bez zmiany SQL/engine ani
osłabienia asercji statystyk. Użytkownik zlecił naprawę i powrót do planu.
Dalej publikacja testu i dokładnie ten sam main Control, po nim kolejka.

Go branch38317376700 success1/1 (521unit),10 screenów ae24a08c7d;
setView usuwa data-i18n, żeby późniejszy init nie przywracał loadingTitle
po błędnym linku. Następna main kontrola Go. Jeden licznik już przeszedł
oba pełne main formularze w38316869123 (przebieg miał failure wyłącznie
Go). Krótki poll-anonymous-layout.spec.js daje4 aktualne screeny native
cooldown bez powtarzania30-sekundowych backendowych kontraktów. Zwykły
pierwszy pełny głos i druga próba z tej samej przeglądarki, bez resetu
zegara; przyjazna nazwa Rodzinna ankieta — wakacje. Publisher dzieli2galerie.

**Control statystyki zamknięte produkcyjnie**main38317992983 success1/1
bez retry,521 unit; faktyczne Pages, pełna runda90/cztery urządzenia,
DBrunda2/Alfa90, statystyki1/90 oraz ta sama sesja i1 runda po odświeżeniu.
Bez zmiany SQL/engine, poprawiona synchronizacja testu. Użytkownik
polecił potem wrócić do planu i potwierdził dalszą pracę nad Go.

**Go main**38317995881 scenariusz Go success (cały job failure dwóch
krótkich wizualnych speców: helper poll-game.js nie importował expect).
Import poprawiony i dodatkowy unit wykonuje obie ścieżki helpera, żeby
błąd nie wymagał kolejnego CI do wykrycia. Dalej dwa krótkie spece do
aktualnych screenów; nie powtarzać Go/Control/pełnego362/SMTP.

Nowy audit-resource-graph-e19.sql: 11 agregatowych kontroli w READ ONLY,
bez ujawniania tożsamości/adresów/tokenów/głosów. Lokalne0; izolowany
negative test wykrywa nieprawidłowy licznik i grant kolumny, potwierdza
brak zapisu przez audyt. Nowe graph_only w resource-audit.yml uruchomi
wyłącznie ten audyt zamiast ponawiać zamknięte guest354. Jeszcze bez
wyniku produkcji. Później wspólna macierz rodzaj linku×stan×komunikat×akcje
w Go dla wszystkich rodzin, zgodnie z ostatnią odpowiedzią użytkownikowi.
E19C/E19N/E14/E20/E13 dalej kolejka; manual ostatni.

**Aktualizacja Go/audytu:** produkcyjny graf38318723049 success,11 kontroli0;
krótkie dwa wizualne formularze main38318725914 success,4 aktualne screeny
b1eb9d1e45 (jeden licznik). Nie powtarzać zamkniętych kontraktów.
Macierz docs/go-stany.md wszystkich rodzin ujawniła brak registered_user_id
w Go subskrypcji. Dodająca363 i rollback wszystkich stanów/zmiany maila/
nowego właściciela dawnego adresu/usunięcia: lokalnie success; izolowany
branch38320404401/main38320540803 success, main9b0099a902. DB38320540716
w toku, poczekać na finalny wynik i log363 przed bramką frontendu.
Frontend wspólny parser, kanoniczny UID, osobne terminalne Bazy, revoked,
obce konto, ponowne sprawdzenie po sieci, historyczny s/unsub→Friends,
sprawdzenie QR:529 unit success. Nowy go-states.spec.js testuje konkretną
macierz interfejsu na jawnych atrapach biznesowych i rzeczywistym logowaniu;
nie deklarować tym ponownego SQL/SMTP. Osobna galeria go-states. Branch→Pages→
main punktowo jeszcze wymagane. Reszta kolejki E19C/E19N/E14/E20/E13 bez zmian.

**Bieżący E19 zamknięty produkcyjnie:** main Go38322222772 success1/1
bez retry/530 unit. Pierwszy main38321380849 i diagnostyczny38321800038
ujawniły Worker m→mail przed parserem; naprawa współdzieli parseGoLink
z frontendem, unit14 błędnych GET/HEAD i ważny m bez backendu, wrangler
dry-run success. Worker38322130197 success, Pages38321253667 success,
DB36338320540716/log363 OK. Galeria22 screenów po wdrożeniu1ec6ffe8bc.
Nie powtarzać domkniętych Go/Control/362/SMTP ani audytu11/0.

**Następny E19C.** Inwentaryzacja w udostepnianie-kopii-plan.md:
Gra pakiet: definicja+pytania+odpowiedzi, bez settings/logo/dźwięków;
zamknięta ankieta→Prepared. Logo pakietGLYPH/PIX, obraz ma być osadzony,
nie może zostać URL nadawcy po nieudanym pobraniu. Obecny importer gry
nie jest jedną transakcją, logo IMAGE uploaduje osobny własny plik.
Wysyłka wymaga kompletnego, niezależnego snapshotu i dokładnie jednego
importu u stałego ID odbiorcy także przy race/lost response. Historia30dni
nie usuwa oferty ani przyjętej kopii; po wysłaniu brak cofania nadawcy.
Następnie E19N (Control→Znajomi i mapa), E14, E20; manualE13 ostatni.

**E19C format Logo zamknięty:** mainfff35699ff, Pages38325603741,
main38325798279 success1/1 bez retry/539 unit. Branch38324179700 też
success. Nie powtarzać zamkniętych formatów/Go/SMTP/anon/grafu.
Następna364: wspólny atomowy game_import_package deleguje istniejącemu
importerowi zawartości edytora, prywatne kwity i idempotencja bez
wskrzeszania po usunięciu gry. Lokalny rollback i3 kontrolowane wyścigi
success (równoległy import, usunięcie gry/konta). Izolowany workflow
na rzeczywistym niezmiennym schemacie363 przygotowany. Jeszcze bez
wdrożenia DB ani zmiany frontendu; sama wysyłka kopii niewdrożona.
Kontynuować: izolowany CI→DB/log→frontend ze stałym ID próby i testem
utraconej odpowiedzi→branch→Pages→main, potem oferty/mail/Go/plakietki.
Użytkownik ponownie wymaga konkretnego raportu co30–60s i szybszych
małych paczek; status nie kończy pracy.

**2026-10-13 / aktualny E19C:** wspólny atomowy importer364 zamknięty:
DB38326189425/log OK00:15:34 UTC, branch38326785797 success2/2,
main38327057895 success2/2 bez retry/545 unit. Import trzech typów,
urwana odpowiedź po zapisie w rzeczywistym modalu, ta sama próba/jeden
wynik, cudzy owner i brak wskrzeszenia po usunięciu. Nowe zakończenie
UI po zgłoszeniu mrugania: sukces zostaje do Gotowe, jedna linia,
bez ponownego importu. Branch38327689667 i main38328021470 success1/1,
547 unit, Pages38327838431. Galeria main3fd92bb406 w docs/img/transfer/game-import.

**Kluczowa zmiana modelu użytkownika:** Wyślij tworzy od razu zwykłą
własną grę/logo odbiorcy oznaczoną jako oczekującą; Akceptuj zmienia
stan istniejącego zasobu, nie otwiera importu, Odrzuć usuwa kopię i
pliki.5 dni bez decyzji również usuwa oczekującą kopię. Niezależność
od oryginału/znajomości/nadawcy pozostaje. Plan skorygowany w
udostepnianie-kopii-plan.md, końcowa sekcja korekty momentu tworzenia.
Pytanie o cofnięcie rozstrzygnięte: odrzucenie usuwa kopię/pliki/pakiet
i nie daje możliwości powrotu. Brak sekcji odrzuconych i undo dla kopii;
minimalny zapis odmowy blokuje nową wysyłkę tego samego źródła tej
osobie30 dni. Po okresie możliwa nowa świadoma wysyłka. Lokalny fam365draft i dwa
SQL365 to wcześniejszy model importu przy akceptacji, oznaczone jako
historyczny prototyp, niewdrożony; nie zamieniać ich w migrację.
Następna praca: własna oczekująca kopia podczas Send, blokady wszystkich
starych ścieżek przed akceptacją, pełny graf własnych plików Logo oraz
kolejka/mail/Go/badges; maile kopii nadal niezrealizowane.

E20 dopisane: wspólne zakończenie importów/eksportów Gier/Logo/Baz,
pobieranie od razu po przygotowaniu bez czekania na Gotowe. Edytor gry
ma import TXT/wklejanie, nie eksport TXT. Propozycja zachowania TXT z
żywym podglądem i wskazaniem wielu błędów po liniach, jeden parser/
normalizacja z finalnym zapisem, świadome Importuj i bez cichego gubienia
treści, zapisana w ujednolicenie-wygladu.md. Nie usuwać TXT teraz.
Przegląd Do bazy: już batch200; odrębne folder/name/ord i sprzątanie
wymagają późniejszego przeglądu. Manual nadal ostatni.

**Aktualizacja2026-10-13:** parser Logo domknięty main38330805999 success1/1. E19C rozszerzone decyzją użytkownika: jeden mechanizm Powiel dla Gry/Bazy/Logo i Wyślij Gry/Logo. Dopisek „kopia” w nazwie, nie plakietka; ikona duplikowania przy importach/eksportach. Własne obrazy bucketowe kopiować Storage-native, base64 tylko format pliku/osadzone źródła. Zakaz wysyłania demo z ochroną przed obejściem przez zmianę nazwy/Powiel. Decyzje w udostepnianie-kopii-plan.md. Prywatny upload helper jeszcze nie podłączony; wymaga wspólnego planu plików i kontroli rodziców.

**Wspólne formaty2026-10-13:** branch38332055225 i main38332631478 success2/2 bez retry; Pages38332485633 success. Game/Base/Logo przygotowują definicje wspólnie, eksport Bazy korzysta ze wspólnego snapshotu. Dalej E19C: lokalne draft-resource-clone-source/write365 + rollback/races (wspólny writer także Bazy), wykrywanie nieoznaczonego demo, staging plików i właściwe API/maile/Go/UI. Bez publicznego Powiel/Wyślij, nie oznaczać prototypów jako migracji.

**E19C aktualnie:** Native bucket copy branch38334343855 green, main445e0de1dd/Pages38334737339/Worker38334737206 opublikowane; czeka kontrola main. HEAD brakującego pliku ma400, helper po nim nadal obowiązkowo sprawdza źródło. Katalog wspólny obu ścieżek obrazów receiver/copies/job/asset.ext. Lokalne staging365 + demo-origin i rollback green, bez migracji/API/UI. Dalej orkiestrator/wybór nazw/GC, potem rzeczywiste Powiel Gier/Baz/Logo. Wyślij i mail/Go/plakietki nadal niewdrożone.

**Aktualny następny krok:** native file helper zamknięty main38335421387 success1/1. API i wspólny duplicateResource przygotowane, **nieroutowane**; staging ma atomowe wybieranie nazwy pod blokadą UID właściciela i GC niedokończonych/późnych plików. Dalej izolowana bramka ostatnich kontraktów→dodająca365→log DB→Worker/front branch→Pages/main. Żaden przycisk Powiel ani Wyślij jeszcze nie wdrożony. Manual dalej ostatni.

**365 przygotowane:** supabase/migrations/2026-10-13_365_resource_clone_common.sql ze sprawdzonych helperów. Fresh fam365release (364→365) wszystkie rollback/races green;590 unit. Czeka osobna izolowana bramka workflow resource-clone-contract-checks. Backend jeszcze nie wdrożony, API/resource-duplicate nieroutowane. Potem DB/log→Worker→native branch wszystkich3 rodzajów→UI/screeny→main.

**Powiel UI — aktualny stan2026-10-13:** branch38343598152 success1/1,593 unit;9 zrzutów w docs/img/transfer/duplicate, botec3a2efae5. Trzy strony mają wspólny przycisk, kopia tylko w nazwie. API i DB365 wdrożone; UI przechodzi publikację→Pages→kontrolę tych samych dwóch speców na main. Bazy również objęte: nowe ID i pełna definicja bez współdzielenia. Wyślij/mail/Go/plakietki nadal następne, nie nazywać ich wykonanymi. Landscape wysokość/przewijanie list pozostaje E20.

# Control v2 — poprawki zgłoszone po przeglądzie nagrań (2026-10-03/04)

Ten dokument to trwały zapis pełnej listy zgłoszonej przez właściciela po
obejrzeniu nagrań Control v2, ze stanem realizacji każdego punktu. Istnieje
po to, żeby praca nie zależała od pamięci jednej sesji Claude — każdy
kolejny agent/sesja ma tu kompletny, aktualny obraz: co zrobione (z
dokładnym miejscem w kodzie), co sprawdzone i uznane za już poprawne, co w
toku, i co wciąż czeka, bez zgadywania od nowa.

**Zasada aktualizacji**: każda sesja kontynuująca tę pracę ma obowiązek
zaktualizować ten plik (status + notatka) od razu po ukończeniu/zbadaniu
kolejnego punktu — nie na końcu, nie "później". Commit z poprawką kodu i
commit aktualizujący ten plik mogą (i zwykle powinny) być tym samym
commitem.

## Legenda statusów

- ✅ **ZROBIONE** — poprawka w kodzie, zmergowana do `main`.
- ✅🔍 **SPRAWDZONE, JUŻ POPRAWNE** — zbadane (kodem i/lub wizualnie), problem
  nie reprodukuje się w aktualnym stanie kodu. Jeśli nadal widoczne na
  żywo — to albo stare nagranie, albo inne miejsce niż zbadane (dopisać
  konkret).
- 🔧 **W TOKU** — aktywnie naprawiane, zobacz notatkę.
- ⬜ **NIE ZACZĘTE** — zero kodu, czeka.

---

## 1. Przycisk pojedynku ma się zapalać po kliknięciu, nie po zatwierdzeniu

⬜ **NIE ZACZĘTE**

> "Przycisk ma się zapalać po naciśnięciu... zatwierdzanie to tylko akcja
> operatora. Przycisk ma gasnąć dopiero po tym jak się rozpocznie
> rozgrywka, a w pojedynku ma się świecić kolor drużyny która została
> zawieszona."

Dotyczy `renderDuelAccept()` w `control2/js/ui.js` (~linia 661-700). Przy
pierwszym czytaniu kodu wygląda, jakby już działało poprawnie (tile'e A/B
reagują na `selectedTeam` natychmiast po kliknięciu, nie dopiero po
`ACCEPT_BUZZ`) — ale to NIE zostało zweryfikowane na żywej grze ani w
nagraniu, więc nie oznaczać jako gotowe bez realnej obserwacji. Priorytet:
obejrzeć dokładnie na nagraniu/żywo, co faktycznie się dzieje.

## 2. Przyciski "dalej" migają

✅ **ZROBIONE** — commit `4788577` na `main`.

Przyczyna: `navButton()` w `control2/js/ui.js` dodawał pulsującą klasę
`c2-btn-busy` dla KAŻDEGO `disabled`, nie tylko dla realnego oczekiwania na
sieć (`boardBusy()`). Np. "Dalej" na wpisywaniu finału pulsowało przez całe
15-20s odliczania gracza (`disabled: boardBusy() || timerRunningNow`).
Naprawa: rozdzielone na `busy` (pulsuje) / `disabled` (zwykła, statyczna
blokada) we wszystkich 11 wywołaniach `navButton()`.

## 3. Modal ustawień wisi, nie widać wpisywania z klawiatury/suwaka

⬜ **NIE ZACZĘTE, POTWIERDZONY REALNY PROBLEM** (nie tylko artefakt nagrania)

> "6. Wcześniej tak mówiłeś [że to może być artefakt Playwrighta], a w
> video jest problem, trzeba to zbadać."

Modal otwiera `game-settings2.html` w iframe (`control2/js/app.js`'s
`gsOverlay`/`gsFrame`). Do zbadania: czy to realny bug w
`game-settings2.js` (np. input events gubione, focus trap, re-render
kasujący wpisaną wartość) czy coś w komunikacji iframe'u z rodzicem. Zacząć
od `js/pages/game-settings.js` i jego kopii dla modala — sprawdzić, która
dokładnie się ładuje i czy ma znane różnice.

## 4. Logo bez animacji wejścia na starcie rundy + timing dźwięku

⬜ **NIE ZACZĘTE**

> "Przy rozpoczęciu rundy logo jest od razu na wyświetlaczu, nie ma
> animacji wejścia. Animacja ma być wtedy jak gra dźwięk przejść
> ekranowych. A ten dźwięk ma grać pod koniec intro."

Dotyczy `display2/js/render.js` (sekwencja logo→plansza na starcie rundy)
i `control2/js/soundReactor.js` (timing `round_transition`/`reveal`).
Wymaga realnej obserwacji na żywo lub w nagraniu — czysto timingowy/
animacyjny problem, nie da się ocenić z samego czytania kodu.

## 5. Dźwięk przycisku ma grać na kliknięciu, nie tylko na potwierdzeniu

🚫 **ZABLOKOWANE — brak zasobu dźwiękowego**

Zbadane: `armableTile()` w `control2/js/ui.js` (wzorzec zaznacz→potwierdź)
faktycznie NIE odtwarza żadnego dźwięku przy pierwszym kliknięciu
(zaznaczeniu) — dźwięki w tym systemie pochodzą wyłącznie z
`sound_cue_key`/`sound_cue_seq` w `game_state`, ustawianych przez silnik
PO potwierdzonym zapisie (`control2/js/soundReactor.js`), nie z
bezpośrednich wywołań `playSfx()` w warstwie UI przy samym kliknięciu.

Żeby to zrobić, potrzebny jest NOWY, krótki dźwięk "kliknięcia"/"tyknięcia"
UI — takiej kategorii nie ma w `audio/sounds.json` (ani odpowiadającego
pliku mp3 w `audio/`), i nie da się go wygenerować bez realnego zasobu
audio. Do odblokowania: właściciel dostarcza plik dźwiękowy (krótki klik,
podobny do `buzzer_press`), wtedy dodanie kategorii do `sounds.json` +
wywołania `playSfx()` w `armableTile()`'s pierwszym kliknięciu to
mechanicznie proste zadanie.

## 6. Animacja odkrycia: najpierw tekst, potem suma

⬜ **NIE ZACZĘTE**

> "Jeśli chodzi o animacje ekranu to najpierw ma się odsłonić odpowiedź a
> dopiero wtedy zmienić się suma, a nie na odwrót."

Dotyczy `display2/js/render.js` — kolejność wywołań `scene.api` dla
`R <ord> TXT...`/`RSUMA`/`TOP` (rundy) i `FL`/`FR`/`FA`/`FB`/`FSUMA`
(finał). Do sprawdzenia: `shared/deriveEvents.js` i konkretna kolejność w
`render.js`'s event handlerach.

## 7. Host ma się odsłaniać gestem — mechanizm był realnie zepsuty

✅ **ZROBIONE** — commit na `main` (gałąź `claude/control-shared-state-refactor-f4yiwa`,
łączony `render.js`+`main.js`+`control2.spec.js`).

Pierwotnie źle zinterpretowane jako "dodać nową logikę auto-reveal w
panelu" — właściciel skorygował: **to TEST ma demonstrować/asercjonować
gest "peek", nie panel ma dostać nową logikę.** Zasłona Hosta zostaje
architektonicznie jednokierunkowa (silnik nigdy jej sam nie zdejmuje) —
jedyne odsłonięcie to lokalny gest przesunięcia na samym urządzeniu Hosta.

Przy implementowaniu testu (`hostPeekSwipe()` w `tests/e2e/control2.spec.js`)
wykryto, że **gest faktycznie nigdy nie działał w praktyce** (punkt 8
poniżej) — znaleziony i naprawiony przy okazji.

## 8. Host pokazuje "-" zamiast podpowiedzi + mechanizm odsłaniania faktycznie zepsuty

✅ **ZROBIONE** — ten sam commit co punkt 7.

> "Odsłanianie może nie działać ponieważ mamy '-' zamiast przesuń w prawo/
> w dół żeby odsłonić, jakby cały mechanizm może być zjebany."

Trafna intuicja — potwierdzone DWOMA niezależnymi, realnymi bugami w
`host2/`:

1. **`host2.html`**: `#cover2Swipe` i `#p2Hint` miały zaszyty na sztywno,
   statyczny tekst `—` zamiast prawdziwej podpowiedzi. Klucze tłumaczeń
   (`host.swipeRevealDown/Up/Right/Left`) istniały od dawna w
   `translation/{pl,en,uk}.js`, ale nic w `host2/js/` ich nie używało —
   martwy, nigdy niepodłączony mechanizm. Stary `js/pages/host.js` (host.html,
   NIE host2) miał poprawną implementację (`updateSwipeHint()`) — 1:1
   odtworzona teraz w `host2/js/render.js`.
2. **`host2/js/main.js`'s `setupPeekSwipe()`**: wołało
   `renderer.setPeek(!renderer.isCovered())`. Ponieważ
   `isCovered() = authoritativeCovered && !peeked`, na starcie gestu
   (zasłonięte, `peeked=false`) `isCovered()` już zwracał `true`, więc
   `!isCovered()=false` → `setPeek(false)` → **żadnej zmiany**. Gest nigdy
   nie mógł zadziałać za pierwszym razem w dokładnie tej sytuacji, w której
   operator go używa. **To jest prawdziwy powód, dla którego user nigdy nie
   widział działającego odsłonięcia — nie tylko brak podpowiedzi tekstowej.**
   Naprawione: dodano `isPeeked()` do renderera, wywołanie zmienione na
   `setPeek(!isPeeked())` (przełącza własny stan, nie wypadkową dwóch
   zmiennych).
3. Przy okazji naprawiono też brakujące `html.p2Open` (sterowało
   widocznością `#p2Hint` w `css/host.css`, nigdy nie było ustawiane w
   host2 — `#p2Hint` był więc NA STAŁE niewidoczny niezależnie od stanu).

Zdiagnozowane metodą: tymczasowa instrumentacja w `control2.spec.js`
(monkeypatch `classList.toggle` nagrywający historię zmian klasy `#cover2`
w czasie) pokazała JEDNOZNACZNIE, że `peeked` nigdy nie przechodziło na
`true` — nie był to problem timingu/race, tylko zła logika warunku.
Instrumentacja usunięta po znalezieniu przyczyny, zostały tylko docelowe
asercje w teście.

**Potwierdzone w CI (run #318, 2026-10-04)**: gest peek faktycznie działa —
`hostPeekSwipe()` → `#cover2` dostaje `coverOff`, a po kolejnej zmianie
stanu (start rundy 2 finału) wraca samo do `coverOn`, **obie asercje
przeszły**. Ten sam przebieg wykrył NIEZWIĄZANY bug w samym teście
(nie w produkcji): pętla mapowania gracza 2 dla wiersza "powtórzenie"
(i=0, kind=SKIP) klikała też "Pokaż punkty", a ten kafel po C2-14 jest
dla kind≠MATCH trwale wyszarzony (REVEAL_ANSWER_ONLY dogrywa
REVEAL_POINTS w tym samym kliknięciu) — test czekał w kółko na przycisk,
który nigdy się nie odblokuje, aż do timeoutu 240s. Naprawione w
`control2.spec.js` (klikamy "Pokaż punkty" tylko dla i>0). Peek-mechanizm
(punkty 7-8) uznany za w pełni zweryfikowany.

## 9. Koniec gry nie czeka na dźwięk + alert "Błąd: locked"

✅🔧 **CZĘŚCIOWO ZROBIONE** (przyczyna "Błąd: locked" naprawiona; "nie czeka
na dźwięk" to osobna, wciąż otwarta sprawa — patrz punkt 20)

> "Przebieg nie czeka na koniec gry (dźwięk) i klika rozpocznij na nowo, i
> też widzę przy tym okienko błędu dziwnie systemówe `familiada.online
> says Błąd: locked`."

Znaleziona przyczyna: przycisk "Zacznij od nowa" **w topbarze**
(`#btnStartOver`) był jedynym dużym przejściem w całym Control v2, które
NIE było objęte systemem blokady `busy()`/`navButton()` — zawsze klikalny,
nawet gdy serwer wciąż trzyma `locked_until` z poprzedniej akcji (np.
dźwięk końca gry). Kliknięcie w tym oknie kończyło się realnym
`LockedError('locked')` z `control2/js/persist.js`, złapanym jedynie
gołym `alert(\`Błąd: ${e.message}\`)` w `app.js`'s `handle()`. Ten sam
przycisk na ekranach końca gry (`renderGameEnd`/`renderFinalEnd` w
`ui.js`) już poprawnie używał `navButton()`'s `busy`/`disabled` — problem
dotyczył wyłącznie wersji w topbarze, dostępnej przez cały czas gry.

Naprawione w `control2/js/app.js`: `btnStartOver.disabled` jest teraz
synchronizowane z `busy()` przy każdym `renderCurrent()`, plus dodatkowy
guard w samym handlerze kliknięcia.

Druga połowa zgłoszenia ("nie czeka na dźwięk") to osobny temat — pełna
sekwencja dźwięków koniec rundy→koniec gry, patrz punkt 20.

## 10. Koniec rundy: logo ma wejść dopiero na dźwięku outro (ciągła animacja)

⬜ **NIE ZACZĘTE**

> "Logo na końcu rund jakoś dziwnie długo się nie wyświetla. Ma być tak:
> plansza zostaje i się nie chowa, dopiero jak przy dźwięku outro ma się
> pojawić logo, to wtedy plansza znika i pojawia się logo (tak jakby
> ciągła animacja) i zmiany na planszy zawsze z dźwiękiem zmiany."

Dotyczy `display2/js/render.js` + `control2/js/soundReactor.js` — timing
zdarzenia końca rundy/gry względem dźwięku "outro". Wymaga obserwacji na
żywo.

## 11. Czy lag Display to RAM Playwrighta?

⬜ **NIE ZBADANE**

Pytanie otwarte — nie ustalono jeszcze, czy to artefakt środowiska CI
(ograniczony RAM kontenera uruchamiającego nagranie) czy realny problem
wydajności animacji w `display2/js/scene.js`.

## 12-13. Wyjaśnienie mechanizmu "peek" (nie bug, wyjaśnienie)

Wyjaśnione właścicielowi w rozmowie: zasłona pasma 2 Hosta jest
jednokierunkowa w silniku (nigdy się sama nie zdejmuje), jedyny sposób
odsłonięcia to lokalny gest na urządzeniu Hosta, który nie jest zapisywany
do `game_state` i wraca sam przy następnej zmianie stanu gry. Fragmenty
"Prowadzący demonstruje gest podejrzenia" w opisach scenariuszy
nagraniowych odnoszą się właśnie do tego gestu. **Mechanizm ten był
faktycznie zepsuty — patrz punkt 8 wyżej, teraz naprawiony.**

## 14. Kafelek "Wpisano" w mapowaniu — tekst wychodzi z kafelka

✅🔍 **SPRAWDZONE, JUŻ POPRAWNE**

Zbudowany offline'owy harness (lokalny serwer + Playwright, ładuje
prawdziwy `control2/js/ui.js` z syntetycznym stanem, bez Supabase) i
wyrenderowany dokładnie przy rozdzielczości nagrań (1280×720, zgodnie z
`tests/e2e/record-playthrough.js`'s `QUAD_W/QUAD_H`). Nie udało się
odtworzyć przelewania tekstu — input mieści się poprawnie w obrysie
kafelka, zarówno w rundzie 1 (pełna szerokość) jak i rundzie 2 (2/3
szerokości obok kafelka "Gracz 1"). Jeśli nadal widoczne na żywo — podać
dokładny krok/rundę, żeby zweryfikować ponownie (może zależeć od długości
konkretnej odpowiedzi).

## 15. Suma finału na pasku z "Dalej"

✅ **ZROBIONE** — commit `15e41c4` na `main`.

Scalone w jeden pasek (`c2-statusbar` z `c2-statusbar-end` dla przycisku
"Dalej"), dokładnie jak "Zakończ rundę" w Rundach. Wcześniej był osobny
pasek sumy POD paskiem nawigacji (`c2-gameplay-nav`), z pustym miejscem
między nimi.

## 16. Brak odpowiedzi: dźwięk błędu od razu + auto-odsłonięcie punktów

✅ **ZROBIONE** — commit `15e41c4` na `main`, z 2 nowymi testami
jednostkowymi w `tests/unit/final.engine.test.js`.

`REDUCERS.REVEAL_ANSWER_ONLY` w `control2/js/engine.js`: dla MISS/SKIP
(`row.kind !== "MATCH"`) od razu woła `REDUCERS.REVEAL_POINTS` w tym samym
kroku — punkty (zawsze 0) i dźwięk `answer_wrong` natychmiast, bez
czekania na osobny klik "Pokaż punkty". MATCH zostaje dwuetapowe
(prawdziwe punkty, prawdziwa suspensja).

## 17. Odpowiedzi gracza 1 nie mieszczą się w drugiej linijce (Host)

⬜ **NIE ZACZĘTE**

Dotyczy `host2/js/render.js` lub `css/host.css` — overflow tekstu w
`#paperText1`/`#paperText2` przy dłuższych odpowiedziach. Nie zbadane.

## 18. Przyciski "powtórzenie" migają podczas odliczania

⬜ **NIE POTWIERDZONE PO NAPRAWIE #2** — do zweryfikowania na żywo

`c2-btn-repeat` (w `renderFinalEntry`, `control2/js/ui.js`) NIE używa
`navButton()`/`c2-btn-busy`, więc naprawa z punktu 2 go bezpośrednio nie
dotyczy. Możliwe, że user widział wizualny efekt sąsiedztwa z mrugającym
wtedy "Dalej" (już naprawionym) — ale to nie zweryfikowane, tylko
hipoteza. Sprawdzić osobno na żywo po deployu punktu 2.

## 19. Kafelek "Gracz 1" w mapowaniu gracza 2 — napis zamiast odpowiedzi

✅ **ZROBIONE** — commit `15e41c4` na `main`.

`.c2-map-p1tile .c2-entrytile-p1ans` dziedziczyło `overflow:hidden`/
`text-overflow:ellipsis`/`white-space:nowrap` z bazowej reguły myślanej
pod INNY kontekst (szerszy kafelek bez etykiety nad wartością) — w wąskim
(1/3) kafelku z etykietą NAD wartością w kolumnie obcinało odpowiedź
praktycznie do zera wysokości, widać było tylko etykietę "Gracz 1".
Naprawione jawnym nadpisaniem `overflow`/`text-overflow` w `control2.html`.

## 20. Sekwencja dźwięków + alternatywne zakończenia gry

⬜ **NIE ZACZĘTE**

> "Po osiągnięciu ma być dźwięk zakończenia rundy, a potem dopiero przy
> zakończeniu gry dźwięk zakończenia gry... Pytanie czemu ani jedna
> rozgrywka nie kończy się alternatywnym zamiast logo punktami lub
> wygraną — trzeba to poprawić: pierwszy finał ma się zakończyć nagrodą
> ale niższą (nie osiągamy punktów), a drugi nagrodą główną. Jedno z
> zakończeń gry bez finału ma pokazać punkty."

Dwuczęściowe: (a) timing dźwięków końca rundy/gry względem przycisków —
`control2/js/soundReactor.js`/`engine.js`; (b) scenariusze testowe
(`tests/e2e/record-playthrough.js` i/lub `control2.spec.js`) nie pokrywają
żadnego alternatywnego ekranu końcowego (`endScreenMode="points"/"money"`)
— trzeba dodać/poprawić scenariusze tak, żeby faktycznie to demonstrowały
(`shared/endScreen.js`'s `resolveRoundsEndScreen`/`resolveFinalEndScreen`
już obsługują te warianty w silniku, testy po prostu nigdy ich nie
wywołują).

## 21. Blokada/powrót przy zerwaniu połączenia urządzenia

⬜ **NIE ZACZĘTE**

> "Czy mamy jakąś blokadę dalszych akcji (cofnięcie stanu), jeśli w
> trakcie gry któreś urządzenie zerwało połączenie? Albo żeby ono
> poprawnie wracało. Operator jest teraz wróżką — zatrzymuje się i czeka,
> aż mu się kontrolki zaktualizują, nic nie klikając."

Wymaga zbadania `device_presence`/`js/core/game-state-subscribe.js` i
`control2/js/app.js` — czy jest jakikolwiek mechanizm ostrzegania
operatora lub blokady akcji przy wykrytym rozłączeniu urządzenia
odbiorczego. Prawdopodobnie brak — do zaprojektowania.

## 22. Komunikat blokady "dalej" (logo) — liczba mnoga, bez "tej gry"

✅ **ZROBIONE** — poprawiony tekst w `translation/{pl,en,uk}.js`
(`resourceLock.logoInUseMessage`).

> "7. Ma tam być liczba mnoga i bez 'tej gry'."

Poprzedni tekst PL: "Logo tej gry jest właśnie edytowane w innej karcie
lub przez inne urządzenie." → nowy: "Loga są właśnie edytowane lub zajęte
w innym miejscu." (analogicznie EN/UK). Wcześniejsza wersja (pojedyncza,
"tej gry") była już raz poprawiana 30 września w innym kierunku — ale
dalej nie spełniała dokładnej treści, jakiej chciał właściciel.

## 23. Modal udostępniania urządzenia — kafelki za duże, zły layout

✅ **ZROBIONE** — commit `4788577` na `main`.

Prawdziwa przyczyna: `.btn.xsm` (przycisk usuwania/"Dodaj" w
`shareRow`) był stylowany WYŁĄCZNIE w `css/bases.css` — ale
`control.html`/`control2.html` (gdzie ten modal żyje) w ogóle nie ładują
tego pliku, więc przycisk spadał do pełnowymiarowego `.btn`. Przeniesione
do `css/base.css` (ładowane wszędzie). Dołożona też brakująca przerwa
między etykietą "Aktualnie udostępnione dla:" a wierszem poniżej
(`.shareCurrent` nie miało `gap`).

## 24. Audyt wszystkich badge'y powiadomień

✅🔍 **SPRAWDZONE, JUŻ POPRAWNE**

> "Jedynka może być badgem na przycisku — sprawdź wszystkie badge
> powiadomień na przyciskach, na hamburgerze itd. w każdym miejscu gdzie
> są, i mają się pojawiać konsekwentnie na bazach, hubie ankiet, podłącz
> urządzenie, subskrypcjach."

Zbadane: `css/base.css`'s `.badge`/`.has-badge` to jeden, wspólny,
prawidłowo zaprojektowany komponent (pastylka z tłem/obramowaniem, nie
goła cyfra) — i jest spójnie podłączony wszędzie, gdzie sprawdziłem:

- `games.html`/`js/pages/games.js`: "Podłącz urządzenie"
  (`connectDeviceBadge`), "Ankiety" (`pollsHubBadge`), "Subskrypcje"
  (`subscriptionsHubBadge`), "Bazy pytań" (`basesBadge`, przez
  `refreshBasesBadge()`) — wszystkie cztery mają markup w HTML i są
  aktywnie sterowane w JS.
- `bases.html`/`polls-hub.html`: `#btnGoAlt`/`#altBadge` (link do
  Subskrypcji z poziomu Baz/Hubu ankiet).
- `control2/js/ui.js` (modal udostępniania urządzenia, D0/D1): przycisk
  "Udostępnij" dostaje `has-badge` + `<span class="badge">1</span>`
  spójnie z resztą systemu.
- `control/js/share-device.js`: ten sam wzorzec (`has-badge` toggle).
- `js/core/topbar-controller.js`: hamburger (mobile, <980px) ma WŁASNY,
  zagregowany badge (`.topbar-menu-toggle .badge`), aktualizowany przez
  `MutationObserver` obserwujący wszystkie badge'e w zwiniętym menu —
  pokazuje się, gdy COKOLWIEK wewnątrz ma powiadomienie.

Nie znalazłem miejsca z gołą cyfrą zamiast stylu pastylki. Jeśli nadal to
widać na żywo — prawdopodobnie przed naprawą modala udostępniania
(punkt 23 wyżej, ten sam obszar) w tej samej sesji; podać dokładną
stronę/krok, jeśli problem się powtórzy.

---

## Podsumowanie liczbowe (na dzień zapisu)

- ✅ Zrobione: 9 (punkty 2, 7, 8, 15, 16, 19, 22, 23 + częściowo 9)
- ✅🔍 Sprawdzone, już poprawne: 2 (punkty 14, 24)
- 🚫 Zablokowane (brak zasobu — nowy plik dźwiękowy): 1 (punkt 5)
- ⬜ Nie zaczęte: reszta (punkty 1, 3, 4, 6, 10, 11, 17, 18, 20, 21)

## Jak kontynuować w nowej sesji

1. Przeczytaj ten plik od góry — każdy punkt ma status i konkretne miejsce
   w kodzie.
2. Branch roboczy: `claude/control-shared-state-refactor-f4yiwa`, merge do
   `main` po każdej samodzielnej poprawce (ten projekt wymaga pushowania
   na `main`, żeby cokolwiek się wdrożyło — zobacz `supabase/migrations/
   README.md` dla migracji, reszta to zwykły deploy GitHub Pages/Cloudflare
   Worker z `main`).
3. Testy jednostkowe: `cd tests && node --test unit/*.test.js` (czysty
   Node, zero zależności od sieci).
4. Testy e2e: tylko na produkcji, ręczny `workflow_dispatch` na
   `e2e-tests.yml` z `spec_filter` (np. `e2e/control2.spec.js --grep
   "fragment nazwy testu"`) — nie da się ich odpalić lokalnie bez dostępu
   do `api.familiada.online`.
5. Do weryfikacji wizualnej CSS/layoutu bez dostępu do produkcji: zbuduj
   lokalny harness (statyczny plik HTML importujący `createUI`/`createUI`-
   podobny moduł z syntetycznym stanem, serwowany przez `python3 -m
   http.server` z katalogu repo, renderowany przez `@playwright/test`
   zainstalowane w `tests/`) — dokładny wzorzec użyty dla punktów 14/19
   wyżej, nieopisany osobno, ale odtwarzalny: patrz historia commitów tej
   sesji dla `control2.html`/`control2/js/ui.js` zmian.
6. **Zaktualizuj ten plik** po każdym ukończonym/zbadanym punkcie.

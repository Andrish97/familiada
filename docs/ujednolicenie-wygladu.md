# Ujednolicenie wyglądu — listy, hub, subskrypcje, edytory

Decyzje 2026-10-07. Etap **E10** w [`wdrozenia.md`](wdrozenia.md) —
pierwszy do wdrożenia. Ten plik jest źródłem prawdy dla tego etapu.

---

## Decyzje — poprawka ikon AI w Ustawieniach (2026-10-12)

Użytkownik zgłosił znany na Androidzie problem przezroczystości przy ikonach
zmiany kolejności providerów AI. Zastosować istniejący wzorzec kryjącego
podłoża i przycisków oraz wyłączenia filter/transform dla dotyku.
Dla tej punktowej poprawki użytkownik zezwolił na bezpośrednie wdrożenie
na `main` bez uruchamiania testów. Zrzuty z przykładowymi danymi: 390/1400 px.

## 1. Strony list — wspólny układ

Dotyczy: `/games/`, `/bases/`, `/logo/`, `/polls-hub/`, `/subscriptions/`.
Wzór: gry i bazy (pasek `.bar`, karty `.tabs-card`, `.card.games-card`,
siatka `.grid` kafli `.card`, dolny pasek `.games-bottom`).

Od góry:

1. **Pasek strony** — po lewej tytuł strony i pod nim podpowiedź akcji
   (`.title` + `.hint`); po prawej przyciski akcji **zaznaczonego kafla**.
   Mniejsze odstępy: topbar → pasek i pasek → linia kart.
2. **Karty kategorii** — niższe wypustki (trzeba przeliczyć kąciki
   `.tab-corner` i zaokrąglenia, żeby łączenie z linią zostało gładkie)
   i mniejszy odstęp między linią a wypustką. Jeden zestaw wymiarów dla
   wszystkich stron (zmienne CSS w jednym miejscu).
3. **Kafle** — wszędzie ten sam wzór: kafel `.card` jak w grach (kosz /
   odrzucenie w prawym górnym rogu `.x`, nazwa, linia meta), oznaczenia
   (tagi `.tag`) w linii meta jak w bazach; kafel „+” (`.addCard`) jak
   w grach, gdy na stronie się coś tworzy.
4. **Dolny pasek** (`.games-bottom`) — po prawej eksport / import (gdzie
   są); po lewej wyszukiwanie i filtrowanie (gdzie mają sens).

| Strona | Karty | Przyciski zaznaczonego kafla (prawa strona paska) | Dół po lewej | Dół po prawej |
|---|---|---|---|---|
| Gry | jak dziś | jak dziś | wyszukiwanie po nazwie *(propozycja)* | eksport do pliku / do bazy, import |
| Bazy | jak dziś | jak dziś | wyszukiwanie po nazwie *(propozycja)* | eksport, import |
| Logo | jak dziś | jak dziś | wyszukiwanie po nazwie *(propozycja)* | eksport, import |
| Hub ankiet | **Ankiety · Zadania** | karta Ankiety: **Szczegóły, Udostępnij**; karta Zadania: nic | aktualne / archiwalne, sortowanie, wyszukiwanie | nic |
| Subskrypcje | **Moi subskrybenci · Moje subskrypcje** | jak w hubie (do ustalenia przy wdrożeniu, co jest akcją kafla) | aktualne / archiwalne, sortowanie, wyszukiwanie | nic |

## 2. Hub ankiet — NIEAKTUALNE

> 2026-10-07: hub znika całkiem — patrz [`ankiety-refaktor.md`](ankiety-refaktor.md) (E11).
> Subskrypcje dostają trzecią kartę **Zadania**. Opis niżej zostaje tylko
> jako wzór układu dla subskrypcji.

Dziś: na komputerze dwie kolumny obok siebie (Moje ankiety | Zadania),
każda z własnym nagłówkiem, sortowaniem i przełącznikiem aktualne /
archiwalne; na telefonie karty; kafle to poziome wiersze `.hub-item`.

Docelowo:
- pasek strony jak na listach: tytuł i podpowiedź po lewej, przyciski
  akcji po prawej (Szczegóły, Udostępnij — tylko na karcie Ankiety);
- **karty Ankiety · Zadania zamiast kolumn**, na każdym urządzeniu (decyzja 2026-10-07);
- kafle w układzie jak gry / bazy (siatka), **kolory stanu zostają**;
  usunięcie / odrzucenie w tym samym miejscu co kosz w grach (`.x`);
  oznaczenia (głosy, anonimowe itp.) jako tagi jak w bazach;
- dół po lewej: aktualne / archiwalne + sortowanie + wyszukiwanie;
  po prawej nic.

## 3. Subskrypcje

Identycznie jak hub (karty, kafle, pasek, dół), z jedną różnicą: na
karcie **Moi subskrybenci** kafel **„+”** jak w grach zamiast pola
z e-mailem; „+” otwiera okno dodawania, w którym podaje się e-mail /
nazwę użytkownika.

## 4. Edytory — nazwa strony i informacja w topbarze

Dotyczy: edytor pytań `/editor/`, ankieta gry `/polls/`, ustawienia gry
`/game-settings/`, edytory logo `/logo/editor-*/`, eksplorator bazy
`/base-explorer/`. W edytorach liczy się miejsce, więc nazwa strony
i informacja nie mogą stać pod topbarem — idą **do topbaru**, tak jak dziś
w eksploratorze bazy.

Jeden układ topbaru:
- sekcja 1: `FAMILIADA` + „Wstecz” (edytor logo dziś ma tytuł w miejscu
  `FAMILIADA` — wraca do wzoru);
- sekcja 2: `.topbar-title` — **tytuł**: jaki to edytor, **wielkimi
  literami**; **podtytuł**: nazwa zasobu tylko tam, gdzie strona nie ma
  pola nazwy (decyzja 2026-10-07);
- pod topbarem nic poza polem nazwy (niżej) i samą pracą.

| Strona | Tytuł (wielkie litery) | Podtytuł | Nazwa zasobu | Skąd dziś |
|---|---|---|---|---|
| Edytor pytań | EDYTOR GRY | typ gry (szary, jak w menedżerze baz — decyzja 2026-10-08) | niżej, w polu nazwy | `#pageTitle` + `#hintTop` pod topbarem |
| Edytor logo | EDYTOR LOGO | tryb: Tekst / Rysunek / Obraz (szary) | niżej, w polu nazwy | `#brandTitle` w sekcji 1 |
| Ankieta gry | ANKIETA | nazwa gry | w podtytule | `.title` + `#hintTop` pod topbarem |
| Menedżer bazy | MENEDŻER BAZY PYTAŃ | nazwa bazy | w podtytule | sekcja 2 (wzór) |
| Ustawienia gry | USTAWIENIA GRY | nazwa gry | w podtytule | `#gsTitle` w sekcji 2 (sama nazwa) |

Wymagania edytora pytań („Minimum 10 pytań…”, dziś `#hintTop` pod
tytułem) — nie idą do topbaru; miejsce do ustalenia przy wdrożeniu.

Na telefonie sekcja 2 musi się zmieścić (skrócenie / ukrycie podtytułu —
sprawdzić przy wdrożeniu).

### Pole nazwy — jeden komponent

Edytor pytań (`#gameName` w `.namebar`) i edytory logo (`#logoName`
w `.editorLine` z etykietą „Nazwa”) dostają ten sam element: ta sama
etykieta, szerokość, styl i zachowanie (zapis bez przycisku).

### Edytor logo bez informacji o zapisie

Żadnego wskaźnika zapisu — ani wprost, ani pośrednio: znika `#saveStatus`
i stany „zapisywanie / zapisano / niezapisane / ponawiam”. Autozapis
działa w tle i ponawia sam. Zostaje tylko blokada (zasób zajęty →
pełnoekranowy komunikat), bo to nie jest informacja o zapisie.

### Gry — teksty stanu na kaflach (decyzja 2026-10-08)

Kafel gry pokazuje „TYP • STAN” (`games.js:684` `statusLabel`, klucze
`games.status.*` w pl / en / uk).
- **Rodzaj żeński**: dziś `OTWARTY` / `ZAMKNIĘTY` (stary rodzaj męski,
  z czasów „sondażu punktowego / tekstowego”) → **`OTWARTA` /
  `ZAMKNIĘTA`** (ankieta, gra). Sprawdzić też inne miejsca z tymi
  słowami (podgląd, instrukcja, en / uk — odpowiednik gramatyczny).
- **Preparowane gotowe do gry**: dziś `SZKIC` (gra preparowana ma zawsze
  stan `draft`) — mylące. Gdy gra preparowana spełnia warunki rozgrywki
  (`rules.play.ok`) → **`GOTOWA`**; `SZKIC` tylko, gdy jeszcze nie spełnia.
- **Zmiana 2026-10-09 (ankiety-refaktor.md, „Zatrzymaj” i „Podlicz głosy”):**
  `ZAMKNIĘTA` znika. Jeden zestaw stanów dla wszystkich gier:

  | Stan | Gra ankietowa | Gra preparowana |
  |---|---|---|
  | `SZKIC` | ankieta nieuruchomiona | nie spełnia warunków gry |
  | `OTWARTA` | trwa głosowanie (+ plakietka „N głosów”) | — |
  | `ZATRZYMANA` | głosowanie zatrzymane, niepodliczone (+ plakietka „do podliczenia”) | — |
  | `GOTOWA` | podliczona — można grać | spełnia warunki gry |

  W bazie: nowy stan `poll_stopped` w `game_status` (migracja dodająca);
  „Podlicz głosy” przechodzi do `ready`. en / uk — odpowiedniki.

## 5. Teksty do poprawy

- **Podpowiedź pod tytułem ankiety znika** (decyzja 2026-10-07). Dziś
  `#hintTop` na `/polls/` pokazuje podpowiedź do przycisku akcji
  („Gotowe do uruchomienia.”, „Możesz zamknąć ankietę.”, „Otworzy nową
  sesję i usunie poprzednie dane ankietowe.”). Tytuł idzie do topbaru,
  podtytuł to nazwa gry, a podpowiedzi „gotowe / możesz” są zbędne —
  usuwamy je (klucze `openReady`, `closeReady`, `reopenHint`). Ponowne
  uruchomienie i tak ma okno potwierdzenia (`polls.modals.reopen`) — to
  ono ma jasno mówić, że dotychczasowe głosy zostaną usunięte. Zostaje
  tylko powód, dla którego przycisku nie da się użyć (`chk.reason`),
  pokazany przy przycisku.

## 6. Kolejność wdrożenia (każdy punkt: branch → e2e → `main`)

1. Wspólne wymiary paska i kart (odstępy, wysokość wypustek, kąciki) —
   `base.css` / `games.css`, wszystkie listy naraz.
2. Edytory: tytuł i nazwa w topbarze, jedno pole nazwy, edytor logo
   bez wskaźnika zapisu; ankieta bez podpowiedzi pod tytułem.
3. Hub ankiet: karty, kafle, pasek, dolny pasek.
4. Subskrypcje: jak hub + kafel „+” i okno dodawania.
5. Wyszukiwanie / filtr na listach gier, baz, logo (jeśli potwierdzone).

Testy: `frontend-layout.spec.js`, `mobile-sheet-modals.spec.js`,
`logo-editor.spec.js`, spece hubu i subskrypcji — selektory kafli i pól
do aktualizacji razem ze zmianą.

## Komunikaty po akcji — jeden dymek (decyzja 2026-10-09)

Pola komunikatu na stronach (np. `#status` w Koncie) użytkownik usunął — nie
podobał mu się ich wygląd. Zamiast nich **jeden wspólny dymek** `toast()`
(`shared/js/core/toast.js`): na dole ekranu (nad dolnym paskiem), ~3 s,
zwykły albo błąd (czerwony obrys, do kliknięcia). **Tylko tam, gdzie efekt nie
jest oczywisty**: wysłany mail/link, zapis formularza bez widocznej zmiany
(nazwa w Koncie, hasło), skopiowany link, błąd sieci/zapisu. Bez dymka, gdy
zmiana jest widoczna sama (autozapis w edytorach, kafel znika/pojawia się,
zmiana stanu ankiety na pasku). Dwie lokalne kopie `showToast` (Społeczność,
panel admina) przechodzą na wspólny moduł. Strony logowania (`/login/`,
`/login/reset/`, `/login/confirm/`) zostają przy swoim polu stanu — tam to
jest treść strony („Sprawdź skrzynkę”), nie komunikat po akcji.

### Inwentarz komunikatów po akcji (stan na 2026-10-09)

Przegląd wszystkich stron w `web/` (poza `settings/` i `tools/`). Skrypt
porównujący identyfikatory z JS z `id="…"` w HTML wykazał **jeden** brakujący
element: `#status` w Koncie (usunięty w e13a95272 „Polish account and sharing
tiles”). Pozostałe pola komunikatów istnieją. Implementacja: `shared/js/core/toast.js`
(kontener `#appToast`, styl `.app-toast` w `base.css`).

| strona | komunikat (klucz) | kiedy | element istnieje? | decyzja |
|---|---|---|---|---|
| Konto | `account.statusUsernameSaved` | zapis nazwy | nie (`#status`) | dymek |
| Konto | `statusEmailSaved`, `statusEmailResent` | wysłane linki zmiany e-maila | nie | dymek |
| Konto | `statusEmailCancelled` | anulowanie zmiany e-maila | nie | dymek |
| Konto | `statusPasswordSaved` | zmiana hasła | nie | dymek |
| Konto | `statusMigrateSent`, `statusMigrateResent`, `statusMigrateCancelled` | migracja gościa | nie | dymek |
| Konto | błąd usuwania konta (`niceAuthError`) | usuwanie konta | `#err` tak | zostaje w `#err` + dymek błędu (przycisk na dole strony) |
| Konto | pozostałe błędy formularzy (`setErr`) | zapisy, migracja | `#err` tak | zostaje |
| Konto | `statusLoaded`, `statusEmailPending`, `statusMigrating`, `statusMigrateResending`, `statusMigrateCancelling`, `statusSavingEmail`, `statusEmailResending`, `statusEmailCancelling`, `statusDeleting`, `statusError` | ładowanie / „w toku” / błąd (dublował `#err`) | nie | bez (klucze usunięte z pl/en/uk) |
| Społeczność | `showToast` (dodano do biblioteki, wycofano, wysłano, ocena) | po akcji | lokalny `#toast` | dymek wspólny (lokalna kopia usunięta) |
| Panel admina (`settings`) | `showToast` | po akcji | lokalny `#toast` | dymek wspólny (lokalna kopia usunięta) |
| Ankieta | `polls.copy.success/failed`, `polls.qrModal.copied` | kopiowanie linku / kodu | lokalny `.pollToast` | dymek (błąd: czerwony) |
| Ankieta | `polls.share.invitesSent`, `reminded`, `invitesBlocked` | wysłane zaproszenia / przypomnienia | lokalny `.pollToast` | dymek |
| Ankieta | `polls.status.opened/stopped/resumed/aborted/reopened/tallied`, `polls.share.removed` | zmiana stanu | lokalny `.pollToast` | bez (stan widać na pasku, wiersz znika) |
| Ankieta | `polls.missingId`, walidacja otwarcia (`poll_open.reason`), `common.genericError` | błędy | lokalny `.pollToast` | dymek błędu |
| Ankieta | `onNotice` z liczenia głosów | uwagi edytora wyników | lokalny `.pollToast` | dymek |
| Panel sterowania | kopiowanie kodu połączenia (modal QR i kafel urządzenia) | dotąd cicho | brak | dymek (`control.copyOk` / `copyFail`) |
| Panel sterowania | udostępnienie urządzenia e-mailem (`control.shareDeviceModal.mailSent`, nowy) | mail poszedł | `#shareDeviceMsg` tak (błędy) | dymek dla sukcesu, błędy zostają w modalu |
| Subskrypcje | `statusMsg.inviteSaved` | zaproszenie wysłane | brak (był `alertModal`) | dymek zamiast modala |
| Subskrypcje | `statusMsg.mailSent` | ponowna wysyłka zaproszenia | brak (cicho) | dymek |
| Subskrypcje | błędy zaproszeń/mail (`alertModal`) | błędy | modal | zostaje |
| Bazy | `bases.share.*` (`#shareMsg`), `importMsg`, `nameMsg`, `hint` | udostępnianie, import, nazwa | tak | zostaje w treści modala |
| Gry | `importMsg`, `exportBaseMsg`, `exportJsonMsg`, `nameMsg`, `hint` | import / eksport / nazwa | tak | zostaje (pobranie pliku jest widoczne) |
| Logo | `logoEditor.status.deleting/deleted/imported` (`#msg`) | lista logo | tak | zostaje (kafel znika/pojawia się) |
| Edytor gry | `#msg` („Zapisano.”, „Import zakończony.”) | autozapis, import | tak | zostaje (autozapis) |
| Podłącz urządzenie (`connect`, `connect/tv`) | `connectDevice.*` (`#msg`, `connectCodeMsg`) | błędy kodu, kamery | tak | zostaje w treści strony |
| Idź do gry (`go`) | `#message`, `#hint` | stan wejścia | tak | zostaje w treści strony |
| Logowanie (`/login/`, `/reset/`, `/confirm/`) | `#status`, `#err` | instrukcje i wyniki | tak | zostaje (treść strony) |
| Dom, Instrukcja, Prywatność, 404, Przerwa | — | brak komunikatów | — | — |

## Poprawki zgłoszone 2026-10-09 (E17)

1. **Przycisk powrotu bez „Wróć do:”** — strzałka już to mówi. Etykieta =
   sama nazwa strony docelowej (`← Moje gry`, `← Ankieta`), klucz `nav.backTo`
   → `{page}` (pl/en/uk).
2. **Strona ankiety na telefonie:**
   - przyciski akcji w dolnym pasku mniejsze (wysokość jak `.btn.sm`, nie
     42 px), pasek niższy;
   - równe marginesy lewo/prawo (15 px po obu stronach, bez przesunięcia
     treści względem paska stanu i kart);
   - sekcja Link i QR — ładniejsza: kod QR duży (na telefonie prawie
     szerokość treści, na komputerze ok. 240–280 px), wyśrodkowany na
     białym tle z marginesem, pole linku i przyciski pod nim w jednej
     linii; bez „Pokaż QR” chowającego kod, jeśli mieści się czytelnie.
3. **Filtrowanie na listach przy wyszukiwaniu** (w dolnym pasku obok
   pola szukania, ten sam wygląd co filtr w Subskrypcjach):
   - Gry: typ (Preparowana / Tekstowa / Punktowa) i stan (Szkic / Otwarta /
     Zatrzymana / Gotowa), łączone z wyszukiwaniem po nazwie;
   - Logo: typ (Tekst / Rysunek / Obraz);
   - Bazy: moje / udostępnione (jeśli to nie karta) i rola;
   - filtr pamiętany w adresie (`?type=&status=`), jak karta.
   - Wdrożone (E17b): wspólny filtr w `list-search.js` (opcja `filter`) +
     czysta logika w `list-filter.js`. Gry: tylko stan (`?status=`) — typ to
     zakładki. Bazy: rola własna/edycja/odczyt (`?role=`), moje/udostępnione
     to zakładki. Logo: bez filtra — typ (Tekst/Rysunek/Obraz) to zakładki.

## Poprawki zgłoszone 2026-10-09, cz. 2 (E17c)

1. **Przyciski akcji przeskakują do drugiego rzędu, choć jest miejsce** —
   sprawdzić paski akcji (pasek stanu ankiety, dolne paski list, paski
   edytorów) i usunąć przedwczesne zawijanie (sztywne szerokości, `flex-basis`,
   `min-width`, `gap`/padding liczone podwójnie).
2. **Filtry:** logo bez filtra (zostaje). Gry i bazy — dodać sensowne filtry
   poza już zrobionymi (gry: stan; bazy: rola).
3. **Wspólny styl kafli** gier, baz (i subskrybentów): nazwa, linia opisu,
   rząd oznaczeń (`.tag`) przy dole kafla, akcje jako małe ikony w rogu;
   jedna klasa/komponent w `base.css`.
4. **Kafle subskrybentów** — użytkownik nie wie, jak lepiej; propozycja:
   ten sam wspólny kafel: inicjał w kółku + nazwa/e-mail, rząd oznaczeń
   ze stanem zaproszenia, dzwonek i kosz jako ikony w rogu (jak kosz na
   kaflu gry). Do oceny po wdrożeniu.
5. **Jeden podział na sekcje wszędzie, gdzie udostępniamy zasób (2026-10-09,
   doprecyzowanie użytkownika).** Wzorem jest okno udostępniania bazy
   (Subskrybenci · Oczekujące · Aktywni). Ten sam zestaw i kolejność sekcji,
   te same nagłówki z podpisem, ten sam kafel — wspólny komponent. Sekcje
   odpowiadające sobie na różnych stronach mają używać dokładnie tych samych
   komponentów i reguł CSS, bez lokalnych kopii klas ani odchyleń per strona:
   wspólne są nagłówki i podpisy, odstępy, listy, wiersze osób, stany, etykiety
   kanału, akcje i puste stany. Zmienia się tylko zawartość i akcje właściwe
   zasobowi; breakpointy również definiuje współdzielony CSS.
   - **Subskrybenci** (do zaproszenia — jeszcze bez zaproszenia),
   - **Oczekujące** (zaproszenie wysłane, bez odpowiedzi),
   - **Aktywni** (przyjęte; w ankiecie: zagłosowali),
   - **Odrzucone** (odmowa; tylko gdzie taki stan istnieje).
   Dotyczy: udostępniania bazy, udostępniania ankiety (karta Udostępnianie),
   Subskrypcji (moi subskrybenci / moje subskrypcje), udostępniania urządzeń
   w Control, jeśli ma listę osób. Puste sekcje ukryte.
   Wcześniejszy opis poniżej — zastąpiony tym punktem:
   **Podział na sekcje zamiast kolorów (2026-10-09)** — jak w bazach
   (oczekujący / aktywni …): w Subskrypcjach i w karcie Udostępnianie
   ankiety kafle grupowane w sekcje wg stanu (np. Oczekujące · Aktywni ·
   Odrzucone; dla ankiety: Zaproszeni · Zagłosowali · Odrzucili). Miejsce
   mówi o stanie; kolor co najwyżej pomocniczo. Puste sekcje ukryte.
6. **Ankieta bez dolnego paska (2026-10-09)** — także na telefonie akcje
   zostają w pasku stanu u góry (stan w pierwszym wierszu, przyciski pod
   nim). Zmienia wcześniejszą decyzję o dolnym pasku na telefonie
   (ankiety-refaktor.md).

- Wdrożone (E17c): sekcje udostępniania — jeden komponent
  `shared/js/core/share-sections.js` (+ `.shareSection`/`.shareRow` w base.css) w
  oknie udostępniania bazy, karcie Udostępnianie ankiety, Subskrypcjach
  (subskrybenci / subskrypcje) i udostępnianiu urządzeń w Control; wspólny kafel
  `.tile` (base.css) dla gier, baz i rynku; sortowanie list gier i baz
  (`?sort=created|name`, domyślnie ostatnio zmienione); ankieta bez dolnego paska.
  Liczba pytań w bazie: brak w danych listy — bez sortowania po niej.

## Ujednolicenie E19 — układ i zachowanie (decyzje 2026-10-11)

### Doprecyzowanie: kompaktowe akcje i liczniki

**Wspólny zakres wszystkich poniższych reguł:** modal udostępniania
Control, modal udostępniania Baz oraz sekcje udostępniania Ankiet.
Używać tego samego komponentu wiersza, grupy akcji, licznika i dymka
oraz wspólnego CSS; nie traktować ostatnich doprecyzowań jako wariantu
wyłącznie dla Control. Te same wzorce stosować do odpowiadających im
sekcji Znajomych/Subskrybentów zgodnie z macierzą E19.

- Przywrócić dotychczasowy wygląd karty Urządzeń Control. Control nadal
  korzysta z guard overlay na telefonie; zrzuty jego wnętrza wykonywać
  na obsługiwanym ekranie komputera/tabletu.
- Wiersze udostępniania: po lewej nazwa lub mail i krótkie etykiety
  typu/statusu. Jeśli mieszczą się razem, pozostają w jednej linii;
  przy braku miejsca statusy zawijają się do drugiego rzędu.
  Nie dodawać zdań opisujących cooldown przy każdej osobie.
  Etykieta odbiorcy będącego kontem: „ma konto” (zamiast „konto”).
- Każda lista odbiorców ma osobne przewijanie, niezależne od sąsiednich
  list. Nagłówek sekcji i przycisk pod listą pozostają poza jej przewijaniem.
- Komunikat nad polem mail/nazwa jest wariantem wspólnego dymka systemowego
  (`app-toast--inline`): ten sam wygląd i domyślny czas 3 s, następnie znika.
  Nowy komunikat zastępuje poprzedni; brak osobnego stylu tylko dla Control.
- Po prawej grupa akcji rozciąga się na całą wysokość wiersza. Przycisk
  z okrężną strzałką i kosz/X stoją obok siebie i mają identyczne wymiary.
  Mały licznik znajduje się pod ikoną ponowienia. W Bazach przełącznik
  Edytor/Przeglądający jest w tej samej grupie obok X/kosza, o podobnej
  wielkości i tej samej wysokości; nie umieszczać go przy nazwie/statusach.
- Ponowienie: przycisk z ikoną okrężnej strzałki (`refresh`), a pod nim mały
  licznik czasu do kolejnej dozwolonej wysyłki. Opis akcji w tooltipie i nazwie
  dostępności; po zakończeniu odliczania przycisk staje się dostępny.
- Dostępność: ten sam kompaktowy układ z odliczaniem do zera, bez zdania
  „dostępne za …”. Skala licznika odpowiada długości okresu: sekundy/minuty,
  godziny/minuty lub dni/godziny. Źródłem czasu pozostaje backend.
- Wiersz z licznikiem ograniczającym dostępność jest wyszarzony przez czas
  odliczania; po upływie czasu automatycznie odzyskuje zwykły wygląd.
  Przycisk „Udostępnij zaznaczonym” jest pod listą przy jej prawej krawędzi.
  Sam wygląd nie zmienia polityki: cooldown maila nadal ogranicza mail,
  zgodnie z zasadami dostępu opisanymi w E19.
- Zasada obejmuje całe ujednolicenie: Znajomych, Subskrybentów, Bazy,
  Ankiety i Control. Control zachowuje brak ponowienia; pokazuje wyłącznie
  licznik dostępności kolejnej wysyłki, cofnięcie i nową wysyłkę.
- Zrzuty z przykładowymi danymi dołączać po wykonaniu zmian wyglądu.
  Kontynuować bez oczekiwania na akceptację wyglądu; pytanie jest potrzebne
  wyłącznie przy brakującej kluczowej decyzji architektonicznej.

Ta tabela doprecyzowuje i w przypadkach różnic zastępuje wcześniejszy ogólny
wzorzec „Subskrybenci · Oczekujące · Aktywni”. To samo udostępnienie może mieć
inne stany i akcje w zależności od zasobu; wspólne pozostają czytelne wiersze,
etykieta kanału, miejsce akcji, widoczny cooldown oraz reguła maila z
[`maile-granice.md`](maile-granice.md). Szczegóły cyklu życia i zależności:
[`e19-znajomi-plan.md`](e19-znajomi-plan.md), sekcja 7.

| Ekran/sekcja | Układ i wybór odbiorców | Wiersz udostępniony | Akcje i odliczanie |
|---|---|---|---|
| Control — urządzenie | „Mail lub nazwa użytkownika” z polem i przyciskiem; nad polem znika komunikat o cooldownie lub wcześniejszym udostępnieniu w bieżącej sesji. Osobna lista znajomych z checkboxami i jednym przyciskiem na dole. | Sekcja „Udostępnione”: odbiorcy dla konkretnego urządzenia i sesji gry. Pokazać nazwę i typ: znajomy, konto albo mail. Udostępniony znajomy znika z listy wyboru. | Cooldown widoczny przy polu i znajomym. Cofnięcie przez X/kosz natychmiast unieważnia link. Ponowienie nie występuje; wysyłka ponowna wymaga cofnięcia i nowego udostępnienia. |
| Baza | Dwie drogi: mail/nazwa konta albo znajomi. Obie mają wybór Edytor/Przeglądający; znajomi używają checkboxów i wspólnego przycisku. | Jedna lista ze statusem (oczekuje, zaakceptowano, odrzucono), etykietą kanału i aktualną rolą. | Rola zmieniana bezpośrednio w wierszu. Cofnięcie unieważnia dostęp. Ponów tylko dla oczekujących; po odmowie brak przycisku i maila. Odmowy znikają z list po czasie według E19 §7. |
| Ankieta — karta „Głosy” (starsza nazwa planu: „Wyniki”) | Osobna karta. Widok zmienia się zależnie od stanu ankiety: wyniki na żywo, surowe po zatrzymaniu, tryb podliczania i wyniki końcowe. | Na żywo aktualizują się liczby i paski bez przeskakiwania listy; przejście do podliczania jest płynne/animowane. Szczegóły: `ankiety-refaktor.md` §1 i §6.1–6.2. | Zachować dotychczasowy projekt tej karty. |
| Ankieta — karta „Udostępnianie” | Dwie sekcje: „Anonimowo” (link anonimowy i QR) oraz „Odbiorcy” (znajomi i subskrybenci, wybór checkboxami, bez ręcznego pola e-mail). | Sekcja anonimowa opisuje otwarty link; sekcja Odbiorcy pokazuje oczekuje/otworzył, zagłosował albo odrzucił, tylko dla bieżącego uruchomienia. | Układ i przyciski wewnątrz karty pozostają zgodne z jej opisem. Oczekującym bez głosu, którzy nie odrzucili, można wysłać przypominający e-mail z cooldownem (przycisk ukryty przy wyłączonych powiadomieniach). |
| Ankieta — globalny pasek akcji | Poza kartami; akcje zależą od stanu ankiety (np. Uruchom, Zamknij, Przerwij, Podlicz głosy, Uruchom ponownie). | Stan i akcje pozostają zgodne z `ankiety-refaktor.md` §1 i §6.1–6.2. | To te globalne przyciski wymagają poprawy wyglądu według podsekcji poniżej. Nie zmieniać przycisków wewnątrz kart ani przycisku „Zamknij” nawigacji/okna. |
| Znajomi | Komputer: lewa kolumna dodawania (e-mail/nazwa, zaproszenia wychodzące); prawa: znajomi i zaproszenia przychodzące. Telefon: cztery sekcje albo dwie karty. | Wiersze z etykietą stanu: oczekuje, odrzucono, znajomy, zaproszenie przychodzące. | X cofa oczekujące zaproszenie; usuń kasuje relację znajomości. Tylko oczekujące zaproszenie można przypomnieć mailem po cooldownie; przy wyłączonych powiadomieniach brak przycisku. |
| Subskrybenci | Analogiczna lista jednostronna bez zaproszeń przychodzących/propozycji. | Wiersze oczekujące i aktywne, z etykietą e-mail. | Ponów = przypominający e-mail do istniejącego zaproszenia; cooldown i ukrywanie przycisku takie jak wyżej. Usunięcie kończy subskrypcję. |

**Doprecyzowanie odmów (2026-10-11):** odbiorca zachowuje własne odmowy
przez cały okres ich ważności w kompaktowej, zwiniętej sekcji
„Odrzucone przeze mnie”. Wspólne wiersze/CSS i akcja „Cofnij odmowę”
przywracają oczekujące, bez automatycznej akceptacji lub maila. Znajomi:
przy Propozycjach; bazy: Bazy → Udostępnione pod listą. Subskrypcje
dotyczą tylko osób bez konta: brak cofnięcia aż do
wygaśnięcia 30 dni, także w /go/. Ukrywanie wpisu wcześniej dotyczy tylko
nadawcy. To nowy zakres do realizacji, nie zmiana historii wykonanej
listy Zrobione. Szczegółowy kontrakt w E19 §7.

**CSS sekcji:** wszystkie odpowiadające sobie sekcje udostępniania na tych
stronach mają wyglądać identycznie i korzystać z tego samego markup/componentu
oraz tych samych reguł CSS. Wspólne są nagłówek, podpis, odstępy, lista, wiersz,
etykiety kanału i stanu, puste stany, akcje oraz zachowanie responsywne. Per
strona zmienia się tylko zawartość i zestaw dozwolonych akcji; nie dodajemy
lokalnych wariantów CSS, które rozjeżdżają wygląd sekcji.

**Globalne przyciski akcji Ankiet:** poprawa dotyczy przycisków na pasku akcji
nad kartami (np. Uruchom, Zamknij, Przerwij, Podlicz głosy, Uruchom ponownie),
których dostępność zależy od stanu ankiety. Poprawić ich hierarchię, rozmiar,
odstępy, wyrównanie oraz stany hover/disabled, zachowując wygląd zbliżony do
przycisków na stronie Gier. Na telefonie mają być kompaktowe, nie duże.
Nie zmieniać przycisków
wewnątrz kart „Wyniki” ani „Udostępnianie” i nie obejmować globalnych akcji
nawigacji lub zamykania okien/dialogów. Zachować opisane płynne przejścia
stanów karty wyników i istniejący układ karty udostępniania.

### Aktualne decyzje UI Ankiet (2026-10-11) — nadrzędne dla starszych opisów

Aktualny układ to dwie karty: **Udostępnianie** i **Głosy** (w starszej
`ankiety-refaktor.md` karta ta jest nazwana „Wyniki”). Karta Udostępnianie ma
sekcje **Anonimowo** oraz **Odbiorcy** (znajomi i subskrybenci). Odpowiadające
sobie sekcje w całym systemie mają używać tych samych komponentów i dokładnie
tych samych reguł CSS, bez lokalnych wariantów.

Poprawiamy wyłącznie **globalny pasek akcji nad kartami**. Jego przyciski
zależne od stanu ankiety (np. Uruchom, Zamknij, Przerwij, Podlicz głosy,
Uruchom ponownie) mają wyglądać podobnie do przycisków na stronie Gier:
używać istniejącego rozmiaru `.btn.sm` dla paska akcji, zgodnie z
`wzorce-ui.md` A11, oraz istniejącej hierarchii akcji z `ankiety-refaktor.md`
(główna `.btn.gold`, „Przerwij” jako
stonowany czerwony obrys `.pollAbort`; `.btn.danger` pozostaje zarezerwowane
wg `wzorce-ui.md` A11). Na telefonie mają być kompaktowe, nie duże. Nie
dodajemy nowej rodziny klas ani nie zmieniamy
przycisków wewnątrz kart, nawigacji czy zamykania okien/dialogów. Zachowujemy
płynne przejścia stanów karty Głosy oraz już wykonane zmiany; ten zapis
zastępuje wcześniejsze sprzeczne opisy zakresu, nie cofa wdrożonych prac.

### Doprecyzowanie układu stron (2026-10-11)

To uzupełnienie wcześniejszych ustaleń o konkretny podział przestrzeni na
tych stronach. Pozostałe decyzje i już wdrożone komponenty pozostają w mocy.

- **Gry — dwie niewidoczne kolumny także na mobile.** W górnym wierszu nazwa/
  tytuł jest po lewej, akcje po prawej. W dolnym wierszu filtrowanie i
  wyszukiwanie są po lewej, eksport i import po prawej. Podział nie ma
  widocznej kreski. Każda kolumna zawija swoje elementy we własnym obrębie,
  więc zawartość jednej strony nie spycha ani nie miesza się z drugą.
- **Ankiety — układ edytora.** Tytuł ankiety znajduje się w topbarze. Treść
  ma dwie karty: Udostępnianie i Głosy. Stan, podsumowanie całości i akcje
  zależne od stanu tworzą odrębną, estetyczną sekcję nad kartami; nie są
  wkładane do kart ani przenoszone do dolnego paska. Istniejąca decyzja o
  kompaktowych `.btn.sm` dla globalnych akcji na mobile pozostaje w mocy.
- **Znajomi i Subskrybenci — własny typ stron.** Stosować układ sekcji
  rozpisany dla każdej strony w `e19-znajomi-plan.md`: bez wyszukiwarki i bez
  dolnego paska narzędziowego. Sekcje odpowiadające sobie mają identyczny
  CSS; różnice wynikają wyłącznie z przepływu (Znajomi są dwustronni,
  Subskrybenci jednostronni) i właściwych im akcji.

Wspólne dla wszystkich ekranów: przypomnienie nie tworzy rekordu dostępu ani
nowego tokenu. Flaga `user_flags.email_notifications` jest sprawdzana przed
dodaniem maila do kolejki. Samo udostępnienie kontu pozostaje dostępne w
Zadaniach przy wyłączonych powiadomieniach. Cofnięcie i usunięcie zasobu
nadrzędnego unieważnia zależne uprawnienia zgodnie z cyklem życia w planie E19.

## Decyzje do raportu wzorców (E18, 2026-10-09)

- **2026-10-12 — edytor logo Rysunek:** w pasku opcji zaznaczenia przycisk × usuwa tylko zaznaczone elementy, odróżniony od Wyczyść (cała scena). Skrót Delete, na Macu Fn+Backspace. Usunięcie podlega Cofnij/Ponów oraz Ctrl+Z/⌘Z; sprawdzić istniejącą historię. Użytkownik polecił od razu uzupełnić ten opis w manualu PL/EN/UK, niezależnie od późniejszego pełnego przeglądu E13.

Odpowiedzi na sekcję D w [`wzorce-ui.md`](wzorce-ui.md):

1. **Konto** — tytuł `USTAWIENIA KONTA` w topbarze, bez `.bar`. Tak.
2. **Społeczność** — obecny wygląd się nie podoba, ale nie ma jeszcze pomysłu
   na lepszy. **Nie ruszamy** (poprawki C2/C4/C10 bez Społeczności) do czasu
   nowego pomysłu.
3. **Przyciski na telefonie** — bez skrótów: pełne słowa albo sama ikona,
   jeśli jest jednoznaczna (bez podpisu).
4. **`.btn.danger`** — czerwony obrys w całej aplikacji. Na telefonie
   przyciski niebezpieczne **nie mogą być w dolnym pasku** (zostają w pasku
   stanu u góry / przy elemencie).
5. **Control** — po refaktorze ma własny, dobry styl; zostaje poza wzorcem
   (kroki, sekcja 2, przyciski `.c2-btn`). Wyjątek: okno QR (pkt 6).
6. **Okno QR** — `.uni-modal`, także w Control. Osobno: **wygląd samej sekcji
   „Link” (QR) w ankiecie** do poprawy.
7. **Instrukcja** — pigułki zostają, tylko adres `?tab=`. Tak.
8. **Tokeny odstępów** w `base.css`. Tak.

## Udostępnianie — wiersze, role, sekcje wg stanu (decyzja 2026-10-09, E19)

Zaakceptowane przez użytkownika („bardzo dobry wzór … Akceptuję. Podział na
role ma być we wszystkich udostępnianiach”). Wzór obowiązuje **wszędzie, gdzie
coś udostępniamy**: Subskrypcje, subskrybenci w ankiecie, udostępnianie bazy,
urządzenia.

1. **Podział na role** (karty): to, co **ja udostępniam / moi odbiorcy**
   oddzielnie od tego, co **udostępniono mnie**. Subskrypcje: Moi subskrybenci ·
   Moje subskrypcje · Zadania (z licznikami). Bazy: analogicznie (udostępnione
   przeze mnie · udostępnione mnie).
2. **Wiersze zamiast kafli** (osoby to nie zasoby): inicjał w kółku, nazwa /
   e-mail, szara linijka stanu („zaproszony 3 dni temu”, „od 12.09”), akcje po
   prawej **w wierszu** (bez zaznaczania i górnego paska akcji). Komputer:
   pełne słowa; telefon: ikony. Usuwanie zawsze ikoną w wierszu, nigdy w dolnym
   pasku (decyzja 4 z E18).
3. **Sekcje wg stanu miejscem, nie kolorem**:
   - Moi subskrybenci: „+ Zaproś” na górze; Oczekujące (Ponów, Usuń) · Aktywni (Usuń),
   - Moje subskrypcje: Zaproszenia do mnie (Akceptuj, Odrzuć) · Subskrybuję (Anuluj),
   - Zadania: Do zrobienia (ankieta, od kogo, Głosuj) · Zrobione (zwinięte).
4. Komputer: jedna kolumna ok. 760 px, wyśrodkowana. Wyszukiwanie (nazwa /
   e-mail) dopiero przy dłuższej liście; „Pokaż zakończone” zamiast osobnego
   przełącznika archiwum.
5. Jeden wspólny komponent (rozwinięcie `share-sections.js`) dla wszystkich
   miejsc udostępniania. Ma renderować te sekcje przez ten sam CSS, nie tylko
   podobny markup. Realizacja po etapach nawigacji (E6–E9).
6. **Kanały udostępniania** (uzupełnienie 2026-10-09): bazy i urządzenia
   udostępnia się na dwa sposoby — **mailem / nazwą użytkownika bez
   subskrypcji** (`base_share_by_email`, `base_share_by_user`,
   `share_device`) oraz **subskrybentom**. Z listy subskrybentów do wyboru są
   **tylko zarejestrowani** (z kontem — `subscriber_user_id`); subskrybent
   bez konta (sam e-mail) dostaje tylko zaproszenia do ankiet. Komponent ma
   więc w roli „udostępniam” pole „Udostępnij mailem / nazwą” obok listy
   subskrybentów, a wiersze odbiorców z obu kanałów w tych samych sekcjach
   wg stanu (np. Oczekujące · Aktywni), z oznaczeniem kanału (mail /
   subskrybent) w szarej linijce.
**Cel subskrypcji (wyjaśnienie użytkownika 2026-10-09):** subskrypcje są po
to, żeby mieć **stałą pulę ludzi do głosowania w ankietach** — wysyłasz
zaproszenie, oni akceptują (zgodzili się, więc chętnie zagłosują, to kilka
minut), potem masz ich pod ręką i udostępniasz im ankiety. **Dodatkowo**
subskrypcje zarejestrowanych użytkowników działają jak **znajomości**: gdy
razem organizujecie grę, możesz takiej osobie szybko wysłać bazę albo
urządzenie (szybkie podłączenie). Stąd kanały z pkt 6 zostają: ankiety —
wszyscy subskrybenci (także bez konta); bazy i urządzenia — mail / nazwa
**oraz** szybki wybór z subskrybentów z kontem.

7. **Konto odbiorcy przy udostępnianiu mailem** (decyzja 2026-10-09):
   - **bazy** — e-mail / nazwa **musi należeć do konta** (tak jest dziś:
     `base_share_by_email` szuka w `profiles`, bez konta błąd),
   - **urządzenia (Control)** — **konto niekonieczne**: na dowolny e-mail
     idzie link urządzenia (`/go/?d=…`). Dziś `shareDevice.js` wymaga konta
     („Nie znaleziono użytkownika”, `share_device(p_recipient_user_id)`) —
     **zmiana do zrobienia w E19**: odbiorca bez konta zapisany po e-mailu
     (nowa kolumna / RPC, migracja dodająca), widoczny w wierszach z kanałem
     „mail”, z możliwością cofnięcia; odbiorca z kontem jak dziś.

### Znajomi i subskrybenci — propozycja użytkownika 2026-10-09 (czeka na 2 odpowiedzi)

- **Znajomi** = relacja **dwustronna między kontami**: zaproszenie → akceptacja
  → obie strony mogą sobie nawzajem wysyłać ankiety, bazy i urządzenia.
- **Subskrybenci** = **tylko osoby bez konta** (sam e-mail), którym wysyłasz
  ankiety (jednostronnie).
- Jedno pole „+ Zaproś”: e-mail/nazwa z kontem → zaproszenie do znajomych;
  e-mail bez konta → zaproszenie subskrybenta.
- Karty Subskrypcji: **Znajomi** (Zaproszenia do mnie · Wysłane · Znajomi) ·
  **Subskrybenci** (Oczekujący · Aktywni) · **Zadania**.
- Udostępnianie: ankiety → znajomi + subskrybenci; bazy → znajomi + e-mail
  konta; urządzenia → znajomi + dowolny e-mail.
- Baza: dziś `poll_subscriptions` (jednostronne, `subscriber_user_id` albo
  `subscriber_email`). Znajomi jako osobna relacja (migracja dodająca), stare
  aktywne subskrypcje kont → znajomi (pyt. 1).

Pytania: (1) istniejące aktywne subskrypcje między kontami — zamienić
automatycznie na znajomych? (2) subskrybent bez konta, który założy konto na
ten sam e-mail — zostaje subskrybentem czy automatycznie staje się znajomym?

**Uzupełnienie użytkownika 2026-10-09:** znajomi i subskrybenci to **osobne
funkcjonalności, nawet osobne strony**. Propozycja układu (do potwierdzenia):

- `/friends/` — **Znajomi** (konta, dwustronnie): karty **Znajomi** ·
  **Zaproszenia** (do mnie · wysłane) · **Od znajomych** (ankiety do
  głosowania, bazy, urządzenia — dzisiejsze „Zadania”).
- `/subscribers/` — **Subskrybenci** (tylko e-mail, jednostronnie, tylko
  ankiety): bez kart ról (zawsze „ja wysyłam”), sekcje Oczekujący · Aktywni,
  „+ Zaproś” na górze.
- `/subscriptions/` znika (bez aliasu — linki z maili idą przez `/go/`,
  zmieniana tylko tabela w `/go/`); w menu gier dwa wejścia.

**Wariant użytkownika 2026-10-09: trzy osobne strony** (propozycja układu):

> **Aktualizacja 2026-10-11:** układ Znajomych/Subskrybentów doprecyzowano
> do dwóch kart, bez wyszukiwania/dolnego paska; aktualna tabela w E19 §7.
> Zadania zachowują Do zrobienia / zwijane Zrobione i filtr. Nowe zmiany:
> ikony pochodzenia, lekkie kolory rodzajów, odstępy i krótsze kafelki mobile
> (bez dat, limit dwóch linii). Zrzuty i macierz stanów w planie E19,
> „Zadania — odstępy i pełny przegląd kafelków”. Przegląd nieobowiązkowych
> informacji na wszystkich stronach telefonu jest osobnym **E20** poniżej.
> Starsze opisy układu tutaj pozostają zapisem wykonanych/proponowanych etapów.

- `/friends/` — **Znajomi**: bez kart, sekcje wg stanu: Zaproszenia do mnie
  (Akceptuj, Odrzuć) · Wysłane (Ponów, Cofnij) · Znajomi (Usuń); „+ Zaproś”.
- `/subscribers/` — **Subskrybenci** (tylko e-mail): sekcje Oczekujący ·
  Aktywni; „+ Zaproś”.
- `/tasks/` — **Zadania** (skrzynka: co mi przysłano): sekcje Do zrobienia ·
  Zrobione (zwinięte); filtr rodzaju: ankiety · bazy · urządzenia. Plakietka
  z liczbą w menu; linki z maili przez `/go/`.

**Decyzje 2026-10-09 (odpowiedź „Tak”):** trzy strony jak wyżej. Zadania
(`/tasks/`) pokazują **tylko**: ankiety do głosowania, **bazy do
zaakceptowania** oraz **aktywne udostępnienia urządzeń** z przejściem do
podłączenia urządzenia (świadomie trochę powiela `/connect/`). Pytania 1 i 2
przyjęte wg rekomendacji (do korekty przez użytkownika): aktywne subskrypcje
między kontami → znajomi; subskrybent bez konta, który założy konto, zostaje
subskrybentem i dostaje zaproszenie do znajomych.

**Usunięcie konta i ponowna rejestracja** (zgodnie z `usuwanie-danych.md`,
decyzja 2026-10-07 „wszystko, co powiązane z e-mailem, usuwane — ponowna
rejestracja zaczyna od zera”):
- usunięcie konta usuwa jego **znajomości** (u obu stron), wysłane i
  otrzymane zaproszenia do znajomych, **wpisy subskrybenta na jego e-mail**
  na listach innych, udostępnienia baz i urządzeń, zadania;
- u znajomych osoba po prostu znika z listy (bez maila);
- nowe konto na ten sam e-mail **nie odzyskuje** niczego — znajomości
  i subskrypcje trzeba zaprosić od nowa (zgoda dotyczyła starego konta).

## E20 — mniej nieobowiązkowych informacji na telefonie (2026-10-11)

**Decyzja użytkownika:** dane nieobowiązkowe, które zabierają miejsce
na telefonie, mają znikać. Przejrzeć wszystkie strony i wspólne
komponenty; stosować zasadę konsekwentnie, nie tylko w Zadaniach.

- Na telefonie ukrywać zbędne daty, rozbudowane opisy pomocnicze,
  powtarzające się etykiety i metadane, jeśli nie pomagają wykonać akcji.
- Zachować nazwę zasobu/nadawcy, potrzebny stan, rolę/uprawnienie,
  komunikaty błędów, blokad i wymagane liczniki oraz przyciski akcji.
  Dokładny zestaw zależy od funkcji danego kafelka/sekcji.
- Kompaktowy wariant telefonu i pełny wariant komputera korzystają
  ze wspólnego komponentu/CSS; bez osobnego przepisywania każdej strony.
- Długie teksty mają kontrolowaną liczbę linii; kafelki nie rosną
  nadmiernie przez dodatkowe informacje. Ikony pozostają czytelne.
- Przegląd desktop/mobile dokumentować zrzutami z przykładowymi danymi
  po wykonaniu; sprawdzić także długie nazwy i poszczególne stany.

**Stan:** do wykonania jako przegląd całego systemu. Zadania są pierwszym
wdrożeniem tej zasady, nie oznaczają zamknięcia E20. **Manual nadal ostatni.**

### Aktualizacja zakresu Zadań — decyzja 2026-10-11

Zadania tylko dla ankiet, także ich plakietka. Znajomi/Bazy/Podłącz
urządzenie obsługują własne zaproszenia i liczniki; subskrypcje poza
Zadaniami, lokalizacja do dopięcia. Wykonany wygląd kafelków wszystkich
rodzajów pozostaje historią; kompaktowe kafelki ankiet i Zrobione zachować.
Nie dodawać do Tasks sekcji undo baz/znajomości/subskrypcji.

### Doprecyzowanie telefonu i pustych list — decyzja 2026-10-11

Znajomi i Subskrybenci: na komputerze dwie kolumny, na telefonie **dwie
przełączane karty**, ze wspólnego wzorca kart systemu (nie dwie długie
kolumny ustawione jedna pod drugą). Zachować sekcje i formularz dodawania.

| Strona | Karta 1 | Karta 2 | Plakietka wymagająca działania |
|---|---|---|---|
| Znajomi | Dodaj znajomego + Wysłane | Znajomi + Propozycje + Odrzucone przeze mnie | Na karcie 2: przychodzące pending; nie liczyć znajomych, wysłanych i odmów |
| Subskrybenci | Dodaj subskrybenta + Oczekujące | Subskrybenci | Zwykłe liczniki sekcji; bez przychodzących propozycji kont i ich plakietki |

Plakietka na karcie korzysta z tego samego źródła i klasy `.badge` co
skrót strony; nie sumować jej ponownie w Zadaniach. Zero ukrywa plakietkę.
Go wskazujące zaproszenie wybiera właściwą kartę; stan karty w mapie
nawigacji i adresie zgodnie z istniejącym modułem tabs.js. Przejście do
komputera pokazuje obie kolumny bez utraty stanu formularza/sekcji.

**Puste listy (doprecyzowanie 2026-10-11):** wspólny komponent i CSS:
kafelek z przerywaną obwódką i krótkim tekstem wyśrodkowanym w środku,
jak przy braku gier. Dotyczy także komunikatów „Nie masz jeszcze …”.
Treść dopasowana do listy; bez przypadkowych dodatkowych ikon/przycisków
i różnych ramek. Rozróżniać
pustą listę od ładowania, błędu oraz braku wyników filtrowania. Opcjonalne
puste sekcje odmów nadal ukryte. Przegląd obejmuje Znajomych,
Subskrybentów, udostępnianie Control/Baz/Ankiet i Zadania; języki PL/EN/UK.

To wspólny wygląd pustych list w całym systemie, na komputerze i telefonie.
Nie zmienia zasady ukrywania pustych sekcji „Odrzucone przeze mnie”.
Wdrożyć w przeglądzie UI/E20 i pokazać zrzuty 390/1400 px po wykonaniu;
sam zapis w planie nie oznacza wdrożenia.

**Bazy:** nowy wygląd udostępniania jest nadal wymagany, nie kończy się
na przeniesieniu akceptacji z Zadań. Te same shareSection/shareRow, listy
z checkboxami, odstępy, osobne przewijanie, wyszarzenie i zegary cooldownu,
krótkie statusy, przyciski po prawej. Zmiana roli obok cofnięcia, podobna
wielkość; powiadomienia/ponowienie zgodnie z aktualnym kontraktem odmów.
Zrzuty po wdrożeniu: 1400/390, dane przykładowe i odmowy zwinięte/rozwinięte.

To aktualizacja otwartego zakresu; wykonana wcześniej wersja mobilna
z dwiema kartami ułożonymi pionowo nie realizuje przełączanych kart.

### Zadania — uproszczenie po zawężeniu do ankiet (2026-10-11)

Decyzja użytkownika: wyszukiwanie i tekstowe oznaczenie typu zasobu na
liście Zadań są niepotrzebne. Usunąć wyszukiwarkę, jej pusty dolny pasek
i etykiety Ankieta tekstowa/Punktacja z opisów wierszy. Pozostają nazwa,
nadawca, istotny stan i akcje, wspólna ikona ankiety oraz Do zrobienia /
Zrobione. Typ ankiety nadal określa właściwą stronę głosowania wewnętrznie.
Zastępuje zapis paczki 330 o zachowaniu wyszukiwarki; historyczne wyniki
330 pozostają bez zmian. Nowe zrzuty i punktowe testy po implementacji.

**Doprecyzowanie użytkownika:** dwie karty na telefonie oznaczają dokładnie
**dwie zakładki z wypustkami, jak w Grach**, przełączające zawartość.
Użyć tego samego wzorca wyglądu wypustek i wspólnego tabs.js; plakietka
na wypustce właściwej zakładki. Na komputerze dwie kolumny.

**Kontakty — decyzja 2026-10-11:** na listach istniejących Znajomych i
aktywnych Subskrybentów nie pokazywać etykiety „Zaakceptowano” (stan
wynika z listy). Nadal pokazywać Oczekuje/Odrzucono przy zaproszeniach.
Wspólna reguła renderera; brak pustego rzędu/odstępu po usuniętej etykiecie.

### Model Subskrybentów — rozstrzygnięcie 2026-10-11

Użytkownik potwierdził: **subskrybent wyłącznie bez konta; konto → Znajomi**.
Obecne subscribers_invite zwraca has_account dla istniejącego konta.
Nie dodawać niezależnej subskrypcji konta, jego listy przychodzących
propozycji/odmów ani plakietki. Zadania pozostają wyłącznie ankietowe.
Wcześniejsze otwarte propozycje subskrypcji konta są zastąpione tą decyzją.

Założenie konta przez subskrybenta: istniejąca ścieżka może utworzyć
oczekującą propozycję znajomości; nie tworzy aktywnej znajomości ani
subskrypcji konta. Dopiero akceptacja znajomości usuwa stary wpis
subskrybenta. Odmowa anonimowej subskrypcji i karencja 30 dni nie mogą
zostać ominięte rejestracją/claim; zweryfikować ten przypadek w paczce
odmów Subskrybentów. Brak undo tej odmowy zachowany.

**Subskrybenci — panel nadawcy (doprecyzowanie użytkownika):** bez
mechanizmu akceptacji, przychodzących propozycji i cofania odmowy w panelu.
Dwie zakładki telefonu: Dodaj + Oczekujące oraz Subskrybenci. Panel
pozwala zaprosić, przypomnieć oczekującym według flagi/limitu i usunąć/cofnąć.
Odbiorca bez konta akceptuje/odrzuca przez dostarczony link Go z maila.
Przy odmowie przypomnienia zabronione; po 30 dniach dopiero nowe
zaproszenie. Liczba sekcji/zakładki nie jest plakietką przychodzących spraw.

**Korekta wypustek kontaktów:** wysokość 36 px, jak zmniejszony bazowy
wzorzec Gier; nie dziedziczyć starego mobilnego nadpisania games.css
do 56 px. Kontakty używają tych samych kącików i CSS wypustek, z lokalnym
ustawieniem wspólnego wymiaru 36/1 px. E2E sprawdza wysokość 36 px.

**Kontakty — wysokość kart (doprecyzowanie):** karty wypełniają całą
dostępną wysokość obszaru pracy; na telefonie pod wypustkami, na komputerze
obie kolumny równej wysokości. Nagłówki/formularz zostają widoczne,
przewijają się niezależnie listy wewnątrz. Strona nie rośnie z liczbą
kafelków; footer poza obszarem przewijania.

### Wysokość obszaru pracy i przewijanie — wspólna zasada (2026-10-11)

Decyzja użytkownika: także na pozostałych stronach ma obowiązywać
w przybliżeniu układ wdrażany dla kontaktów. Karty/listy wykorzystują
dostępną wysokość pod nagłówkiem/akcjami/wypustkami, a długa zawartość
przewija się wewnątrz obszaru pracy. Kafelki/wiersze nie rozciągają się
proporcjonalnie do wysokości karty. Nagłówki, zakładki i istotne akcje
zostają widoczne, oddzielne listy zachowują osobne przewijanie.

Weryfikować przy odpowiednich etapach planu: Gry/Bazy/Logo/Zadania,
Znajomi/Subskrybenci, karty Ankiet i edytory; dostosować do funkcji strony.
Nie zmieniać kolejności E19 przez osobne doraźne przebudowy. Zachować
potrzebne wyjątki małej wysokości/landscape i czytelność formularzy;
sprawdzić telefon, komputer, przełączenie zakładki, rozwiniętą sekcję,
pustą/długą listę, brak uciętych akcji i niezamierzonego scrolla strony.
Zrzuty po wykonaniu; przegląd reszty w E20/UI, manual zawsze ostatni.

### Dopracowanie wyglądu — mobilne paski akcji i narzędzi (2026-10-11)

Zgłoszenie użytkownika: obecny układ przycisków akcji, eksportu,
wyszukiwania i pozostałych narzędzi na telefonie wygląda niespójnie.
Uwzględnić w etapie dopracowania/UI/E20, zachowując kolejność wdrożeń.

Zakres przeglądu:
- przyciski akcji zaznaczonego kafla i globalne akcje: jednakowe rozmiary,
  kompaktowość mobilna, wyrównanie ikon/tekstów i grupowanie;
- eksport/import, wyszukiwanie, filtry i kategorie: sensowne szerokości,
  odstępy i zawijanie w obrębie swoich grup, bez przypadkowego mieszania;
- zachować ustalony niewidoczny podział lewo/prawo pasków na stronach
  typu Gry (nazwa/akcje oraz filtrowanie-wyszukiwanie/eksport-import);
- stany disabled, wybrany kafel, długie nazwy/tłumaczenia, widoczność
  i przewijanie przy małej wysokości ekranu; bez uciętych akcji/overflow;
- wspólne CSS/wzorce zamiast osobnych doraźnych poprawek na każdej stronie.

Przegląd 390 px i mniejszych szerokości oraz landscape; zrzuty po
wykonaniu z przykładowymi danymi i punktowe testy. Nie dodawać usuniętych
wyszukiwarek do Zadań/Znajomych/Subskrybentów. Manual zawsze ostatni.

### Mobile landscape — wszystkie strony (2026-10-11)

Użytkownik wymaga zbadania i dopuszczenia telefonu w poziomie na każdej
stronie. Osobny przegląd całej mapy PAGES przed manualem, w etapie UI/E20.
Obejmuje także strony dotychczas ograniczone guardem małego ekranu
(Control/edytory); sam obrót nie może pozostawić nieuzasadnionej blokady.

Dla każdej strony sprawdzić dostęp do funkcji, niewielką wysokość
viewportu, topbar/wypustki/akcje/narzędzia, formularze i klawiaturę,
modale/overlays, dotyk oraz scroll i osiągalność wszystkich przycisków.
Zweryfikować portrait→landscape→portrait bez utraty wpisanych danych,
wyboru zakładki, zaznaczenia i obowiązującej blokady zasobu. Dopasować
regułę pełnej wysokości/scrolla do małej wysokości; żadnych uciętych
akcji ani powierzchni bez możliwości przewinięcia.

Testy punktowe i przykładowe zrzuty dla każdej zmienionej strony;
przejrzeć mapę dostępności i guardy razem z CSS, nie tylko szerokość
układu. Nie odblokowywać całej mapy przed tym przeglądem. Ta decyzja
wyznacza docelową dostępność landscape i rozszerza wcześniejszy zakres
ujednolicenia; bieżąca kolejność E19 pozostaje zachowana.

#### Zakres i kryteria zakończenia przeglądu landscape

Lista kontrolna obejmuje PAGES **oraz wszystkie rzeczywiste strony HTML**
w `web/` (także podstrony i strony techniczne poza mapą). Na początku
wdrożenia porównać obie listy ponownie, żeby uwzględnić nowe strony.

| Grupa stron | Szczególna kontrola w poziomie |
| --- | --- |
| Gry, Bazy, Logo, Zadania, Znajomi, Subskrybenci, Marketplace | Wypustki, paski narzędzi, krótkie karty, puste/długie listy, rozwinięte odmowy i niezależne przewijanie. |
| Ankiety, edytor gry, przeglądarka bazy | Dostępne akcje nad kartami, formularze/klawiatura, wyniki, edycja i zachowanie blokady zasobu po obrocie. |
| Control, ustawienia gry, trzy edytory logo | Dopuszczenie telefonu w poziomie: guard strony, wczesny guard w HTML i przyciski wejścia muszą stosować tę samą regułę. Sprawdzić obsługę dotykiem i dostęp do wszystkich narzędzi. |
| Connect, Connect TV, Host, Buzzer, Display | Łączenie, ponowne połączenie, nakładki, podział ekranu i gesty po zmianie orientacji; obrót nie rozpoczyna nowej sesji. |
| Go, trzy strony głosowania, logowanie/confirm/reset, konto | Wszystkie komunikaty tokenów i stanów, formularze, klawiatura, powroty i przyciski potwierdzenia. |
| Strona główna, prywatność, 404, maintenance, settings i narzędzia settings (również pliki HTML bez index.html) | Czytelność, nawigacja, komunikaty i osiągalne akcje również przy małej wysokości. |
| Manual | Układ poziomy sprawdzić podczas ostatniego etapu aktualizacji manuala, po zakończeniu zmian produktu. |

Stan zastany: `device-guard.js` rozpoznaje telefon po krótszym boku
ekranu <700 px; `deviceGuardState()` zwraca phone przed sprawdzeniem
szerokości. Dlatego obrót obecnie nie odblokowuje Control/ustawień gry,
a `blockPhone()` blokuje edytory logo w obu orientacjach. Przegląd musi
objąć również `buttonVisible()` i reguły device w mapie, żeby dostępna
strona nie miała ukrytego przycisku wejścia. Nie oznaczać tych stron jako
obsługujących landscape na podstawie samej istniejącej reguły CSS.

Minimum pomiarów: dotykowe 844×390 i 667×375 px, pary pionowe
390×844 i 375×667 px oraz obrót w obu kierunkach. Rozmiar screen
w emulacji musi odpowiadać telefonowi, żeby test rzeczywiście obejmował
guard; samo poszerzenie okna desktopowego nie wystarcza. Sprawdzić też
klawiaturę i zmniejszony obszar widoczny, safe-area oraz długie teksty
PL/EN/UK. Zrzuty po wykonaniu z przykładowymi danymi, także przy otwartym
modalu/rozwiniętej sekcji, jeżeli występują na danej stronie.

Dla każdej strony zapisać wynik, przebieg punktowego testu i pozostałe
ograniczenia. Bramka zakończenia: dostęp w poziomie bez blokady urządzenia,
wszystkie istotne akcje osiągalne, brak uciętej zawartości bez scrolla,
brak utraty danych/sesji/blokady po obrocie. Uprawnienia konta i zasobów
obowiązują również w tej orientacji.

### Sekcje własnych odmów — doprecyzowanie 2026-10-11

Pusta sekcja „Odrzucone przeze mnie” jest całkowicie ukryta na każdej stronie.
W Bazach sekcja kończy zakładkę Udostępnione (nad paskiem narzędzi),
a rozwinięte odmowy mają własne przewijanie niezależne od kafelków baz.
Utrzymać tę zasadę również w landscape; obecny wyjątek CSS z przewijaniem
całej strony jest do poprawy w zaplanowanym przeglądzie.

### E20 — stopniowe ładowanie stron (decyzja i audyt 2026-10-11)

Utrzymać wspólny sposób stopniowego odsłaniania strony ze starszych ekranów:
układ po tłumaczeniach → elementy topbara po ustaleniu dostępu → sekcje po
pobraniu ich danych i podpięciu obsługi. Stałe miejsce sekcji zapobiega
przesuwaniu zawartości. Korzystać ze wspólnego CSS, bez osobnych animacji
na każdej stronie i bez sztucznych opóźnień pobierania danych.

Audyt kodu (nie jest to jeszcze wdrożenie ani pomiar wizualny):

| Strona | Obecne podpięcie | Zakres ujednolicenia |
|---|---|---|
| Konto, Bazy, edytor gry, ustawienia gry | Wspólne `skel-body`, topbar i `data-skel-step`; odsłonięcie po danych. | Zachować wzorzec i sprawdzić gotowość akcji; Konto podpina kliknięcia dopiero po `loadProfile`. |
| Znajomi i Subskrybenci | Topbar ma wspólny wzorzec; cały `contactsHost` odsłaniany jednocześnie po odczytach. | Osobno odsłaniać gotowe sekcje/karty, zgodnie z ich zależnościami, także zakładki telefonu. |
| Zadania | Topbar i zbiorcze odsłonięcie `tasks-scroll` po `refresh`; reszta karty nie ma własnych etapów. | Spójnie odsłonić stan, kartę i listę; nie pokazywać pustego stanu przed wynikiem odczytu. |
| Ankiety | `skel-body` i topbar; w głównym HTML brak etapów `data-skel-step` dla kart. | Etapy dla nazwy/statusu/akcji oraz kart Udostępnianie i Głosy; karty zależne od faktycznego stanu ankiety. |
| Gry | Wspólne odsłonięcie body/topbara; główna lista bez `data-skel-step`. | Przejrzeć także ten ekran; nie traktować częściowego podpięcia jako wzorca kompletnej gotowości. |

Źródło: `shared/css/base.css` (body, topbar, etapy sekcji),
`shared/js/core/page-init.js` (`topbar-ready`), bootstrapping poszczególnych
stron. Stary mechanizm ma etapy wynikające z gotowości; nie ma wspólnej
kolejki wymuszającej opóźnienie każdej karty.

Przy wdrożeniu:
- Przejrzeć całą mapę stron, a także wspólne modale i sekcje udostępniania.
- Każda sekcja ma widoczny stan ładowania, wyniku lub błędu; błąd nie może
  pozostawić na stałe niewidocznej zawartości. Pusty kafelek dopiero po odczycie.
- Widoczne akcje odblokować po podpięciu obsługi i ustaleniu uprawnień;
  dotyczy także szybkiego kliknięcia podczas startu strony.
- Zmiana zakładki, odświeżenie listy i powrót do strony nie odtwarzają
  całego startu ani nie powodują migania i skoków układu.
- Sprawdzić wolną sieć, błąd odczytu, brak danych i długie listy na komputerze,
  telefonie oraz w landscape. Po zmianach zrzuty z przykładowymi danymi;
  przejście między etapami również udokumentować.

Realizacja w UI/E20 po bieżącym grafie zależności; manual nadal ostatni.

### E20 — wspólne typy stron i nagłówek list zasobów (2026-10-12)

Każdy typ strony ma wspólny układ i wspólne style na wszystkich stronach
tego typu. Listy zasobów **Gry, Bazy i Logo** zachowują obecny charakter
wyglądu. E20 dopracowuje je razem według jednego wzorca.

| Element | Docelowa zasada dla Gier, Baz i Logo |
|---|---|
| Górna część strony | Dwie niewidoczne kolumny: **akcje po lewej**, **tytuł i podpowiedź po prawej**. Tytuł i podpowiedź tworzą jedną grupę. |
| Zawijanie | Elementy zawijają się w obrębie swojej kolumny; nie tworzą jednej mieszanej kolejki tytułu, podpowiedzi i przycisków. |
| Wyszukiwanie i filtrowanie na telefonie | Przemyśleć wspólny, bardziej kompaktowy układ, żeby zajmował mniej miejsca i zostawiał więcej wysokości na listę; funkcje pozostają dostępne. Szczegółowy układ dopracować podczas wdrożenia E20. |
| Pozostałe typy stron | Ujednolicać w ramach ich własnego typu (np. edytory oraz strony kontaktów), zgodnie z ustalonym dla nich podziałem. |
| Weryfikacja | Te same reguły na trzech stronach; telefon pionowo i poziomo oraz komputer, krótkie/długie tytuły i podpowiedzi, PL/EN/UK. Zrzuty z przykładowymi danymi po wykonaniu. |

Ta decyzja zmienia docelowe strony nagłówka list zasobów względem
wcześniejszego opisu „tytuł po lewej, akcje po prawej”. Wykonanych etapów
nie otwiera ponownie; zmianę wdrożyć w E20. Manual pozostaje ostatni.

### E20 — ikony akcji i kompaktowe narzędzia telefonu (2026-10-12)

Na telefonie przyciski pasków akcji i narzędzi mają **same ikony**; na komputerze ikona może
stać obok tekstu. Korzystać ze wspólnego katalogu ikon i tych samych
rozmiarów/przerw, zachowując nazwy dostępności i podpowiedzi. Nie powiększać
mobilnych przycisków względem uzgodnionego wzorca Gier. Formularze i
potwierdzenia zachowują zrozumiałe etykiety (np. OK). Przejrzeć również
inne miejsca, gdzie zastąpienie tekstu ikoną oszczędza miejsce.

| Akcja | Ikona / obsługa |
|---|---|
| Graj | Gamepad |
| Ustawienia | Zębatka |
| Ankiety | Słupki — zachować istniejącą ikonę |
| Edycja | Kartka z ołówkiem |
| Podgląd | Oko |
| Udostępnij (istniejące współdzielenie) | Koperta |
| Wyślij (kopie Gier/Logo) | Koperta, w sekcji importu/eksportu |
| Eksport | Pobieranie — strzałka w dół |
| Import | Wysyłanie pliku do aplikacji — strzałka w górę |
| Do bazy | Baza ze strzałką |
| Filtr | Ikona filtra; po kliknięciu czytelna, większa lista opcji |
| Sortowanie | Ikona sortowania; po kliknięciu czytelna, większa lista opcji |
| Wyszukiwanie | Lupa otwiera wspólny modal z polem i OK. Nie zajmuje stale wysokości paskiem tekstowym. |

Wyszukiwanie telefonu: zatwierdzenie OK stosuje wpisany tekst; aktywny
filtr wyróżnia przycisk kolorem. Ikona może zmienić się w X do wyczyszczenia
wyszukiwania; po wyczyszczeniu wraca lupa. Dokładne zachowanie dopracować
wspólnie podczas wdrożenia, zachowując jednoznaczne otwieranie/edycję oraz
kasowanie filtra. Anulowanie modala nie zmienia bieżącego wyszukiwania.
Filtr i sortowanie również pokazują aktywny wybór; listy są wygodne do
dotknięcia i przewijają się w dostępnej wysokości.

**Kopie Gier/Logo:** nazwa akcji to „Wyślij”. Umieścić ją w grupie
importu/eksportu, w dolnym pasku narzędzi; górna grupa akcji zasobu
zachowuje swój dotychczasowy zakres. Źródło: `udostepnianie-kopii-plan.md`.

To doprecyzowanie wcześniejszego kompaktowego wyszukiwania/filtrowania.
Zachować dwie kolumny nagłówka list zasobów (akcje po lewej, tytuł/podpowiedź
po prawej), wysokość kart i przewijanie wewnątrz. Sprawdzić telefon w obu
orientacjach, tablet i komputer, PL/EN/UK, stan bez zaznaczenia i wszystkie
stany dostępności akcji. Po wykonaniu zrzuty z przykładowymi danymi.

### E20 — tablet w pionie i pomiary rzeczywistego urządzenia (2026-10-12)

Tablet w pionie jest osobnym przypadkiem układu. Nie stosować automatycznie
wariantu telefonu, hamburgera ani wszystkich uproszczeń mobilnych tylko
z powodu pionowej orientacji, obsługi dotyku lub wspólnego szerokiego progu
CSS. Wykorzystywać dostępną przestrzeń; nawigację zwijać dopiero, gdy jej
elementy rzeczywiście przestają się mieścić. Ta sama zasada dotyczy pasków
akcji, filtrów i podziału kart na wszystkich typach stron.

| Zakres | Weryfikacja w E20 |
|---|---|
| Rzeczywisty tablet | Sprawdzić Lenovo z Androidem w pionie i poziomie; obecny hamburger w pionie jest zgłoszoną niespójnością do zbadania. Nie zamykać kontroli na podstawie samej emulacji. |
| Dostępne miejsce | Zebrać na urządzeniu szerokość/wysokość obszaru strony w pikselach CSS, `document.documentElement.clientWidth/clientHeight`, `window.innerWidth/innerHeight` oraz dostępny `visualViewport` (wymiary i skala). |
| Ekran i skala | Zapisać `screen.width/height`, `screen.availWidth/availHeight`, `devicePixelRatio` i orientację jako kontekst pomiaru. Parametry przeglądarki nie gwarantują fizycznych rozmiarów ekranu w calach ani pełnej rozdzielczości panelu. |
| Różne warunki | Sprawdzić obrót, paski przeglądarki, klawiaturę, powiększenie i podział ekranu; dostępny obszar może różnić się od wymiarów ekranu. |
| Progi układu | Dobrać do miejsca potrzebnego treści i nawigacji, nie do nazwy urządzenia, user-agenta, orientacji czy samego dotyku. Tablet może zachować pełniejszy układ, a w małym oknie przejść w kompaktowy. |
| Dowody | Zrzuty po wykonaniu z przykładowymi danymi oraz wartościami pomiaru; odróżnić rzeczywisty tablet od symulacji. Nie przedstawiać emulacji jako sprawdzenia fizycznego urządzenia. |

Pomiary wdrożyć jako narzędzie diagnostyczne przy weryfikacji E20, bez
dodawania technicznych informacji do zwykłych ekranów ani manuala.

**E20 / dialogi mobilne i historia (2026-10-12):** pełnoekranowy modal ma zachowywać się jak ekran również dla Wstecz przeglądarki/Androida: najpierw zamknięcie dialogu, potem normalna nawigacja. Wstecz w modalu i X korzystają z tego samego mechanizmu, bez pustych wpisów. Wdrożenie polityki/mapy w E19N (`nawigacja-mapa-plan.md`, końcowa podsekcja); w E20 sprawdzić spójność wszystkich dialogów, obrót i tablet.

**Doprecyzowanie E19N/E20:** dialogi będące ekranami otrzymują stan w URL strony (np. dialog=share i wymagany zasób). Dalej odtwarza okno, tak samo odświeżenie/bezpośredni link, po kontroli dostępu. Nie powtarzać operacji przy odtwarzaniu. Źródło parametrów i stosu dialogów: mapa nawigacji.

### E20 — filtrowanie zależne od zakładki (2026-10-12)

Filtry pokazują wyłącznie opcje mające zastosowanie do aktywnej zakładki
i jej typu zasobu. Dotyczy wspólnego wzorca list i nowych kompaktowych
narzędzi telefonu, także menu filtra otwieranego ikoną.

| Przypadek | Docelowe zachowanie |
|---|---|
| Gry → Preparowane | Bez opcji stanów ankiety, np. „Otwarta ankieta”; uwzględnić rzeczywiste stany preparowanej gry i jej gotowość do gry. Dostępne „Otrzymane” dla kopii od znajomych. |
| Gry → ankiety tekstowe/punktowe | Opcje zgodne z cyklem życia właściwego typu ankiety. Dostępne „Otrzymane” dla kopii od znajomych. Gry społeczności bez narzędzia filtra. |
| Zmiana zakładki | Opcje filtra przeliczyć dla nowej zakładki; zachować pasujący wybór, wyczyścić niepasujący do „Wszystkie”. Niewidoczny, niepasujący filtr nie może nadal ograniczać listy. |
| URL / zapamiętany stan / powrót | Walidować filtr względem zakładki, także przy odświeżeniu i powrocie. Wyczyszczenie niepasującego filtra odzwierciedlić w przycisku, liście i zapisie stanu; bez dodatkowego kroku historii. |
| Pozostałe listy | Bazy/Logo i inne strony z zakładkami sprawdzić według tej samej zasady; nie dodawać filtra, jeśli zakładka nie ma sensownych opcji. |
| Testy | Każda zakładka i przejście między nimi: poprawny zakres opcji, niepasujący/pasujący wybór, URL, powrót, puste wyniki oraz telefon/tablet/komputer. Dane przykładowe obejmują różne stany zasobów. |

Nie ograniczać opcji tylko dlatego, że chwilowo nie ma rekordów danego
stanu: zakres wynika z typu zakładki. Prawidłowo zastosowany filtr może
zwrócić pusty wynik zgodnie ze wspólnym wyglądem pustych list.

**Doprecyzowanie filtrów (2026-10-12):**

| Zakładka | Filtr |
|---|---|
| Gry → Preparowane | „Otrzymane” oraz właściwe opcje stanu tego typu; bez stanów ankiety. |
| Gry → ankiety tekstowe | „Otrzymane” oraz właściwe opcje stanu ankiety. |
| Gry → ankiety punktowe | „Otrzymane” oraz właściwe opcje stanu ankiety. |
| Gry → Gry społeczności | Filtr ukryty w całości, także ikona. |
| Bazy → Moje | Filtr ukryty w całości, także ikona. |
| Pozostałe zakładki | Pokazać narzędzie tylko, gdy filtrowanie ma zastosowanie do tego typu listy; sprawdzić w przeglądzie E20. |

„Otrzymane” dotyczy kopii przekazanych przez znajomych w E19C, z ich
zapisanym pochodzeniem (propozycja lub przyjęta własna kopia). Nie oznaczać
tak zwykłego importu z pliku ani pobrania gry społeczności. Stan ankiety
i pochodzenie są różnymi kryteriami: odbierana gra zachowuje właściwy
stan swojego typu. Dopiąć ten filtr razem z danymi E19C, a wspólny wygląd
i kompaktowe menu w E20. Ukrycie filtra usuwa także jego aktywny warunek
z listy i zapisu stanu; wyszukiwanie/sortowanie mają własną dostępność.
Wcześniejszą ogólną sugestię filtra rynku zastępuje jawna decyzja
„Gry społeczności bez filtra”; wykonanych etapów nie otwierać ponownie.

### E19C/E20 — plakietki wysłanych kopii Gier i Logo (2026-10-12)

Doprecyzowanie użytkownika: nowy zakres to **Gry i Logo**, oczekujące na
akceptację u odbiorcy. **Bazy już to mają** i są wzorcem, bez nowego
zadania dodawania im plakietek.

| Miejsce | Co zlicza plakietka przed akceptacją |
|---|---|
| Gry → wypustki typów | Oczekujące kopie danego typu gry (Preparowane, tekstowe, punktowe). |
| Logo → wypustki typów | Oczekujące kopie danego typu logo. |
| Przyciski stron Gry i Logo | Suma oczekujących propozycji właściwego zasobu, w miejscach gdzie skrót występuje. |

Wspólna `.badge`, te same rozmiary i zasady co istniejące plakietki Baz.
Otwarcie propozycji bez decyzji nie usuwa plakietki. Akceptacja/odrzucenie,
usunięcie albo wygaśnięcie propozycji aktualizują liczniki; cofnięcie
własnej odmowy przywraca licznik, jeśli propozycja znów oczekuje. Zero
ukrywa plakietkę. Przyjęty własny zasób i odmowy nie są zliczane. Flaga
maili nie wpływa na te liczniki. Wypustki i przycisk korzystają z jednego
źródła; nie powielać w Zadaniach (tylko ankiety). Nadawca zachowuje tylko
uzgodnioną historię wysyłek, bez plakietek śledzących decyzje odbiorcy.
Zweryfikować telefon, tablet i powrót na stronę; istniejące Bazy objąć
regresją wspólnego mechanizmu, bez ponownego wdrażania go.

### `/mail/` — lekki wzorzec Go (2026-10-12)

Centrum maili: lekki topbar jak Go i jedna karta obejmująca nadrzędną
sekcję globalnej rezygnacji oraz listy Subskrypcji i Zadań/udostępnień.
Kolumny na większym ekranie i zakładki mobilne są podziałem wewnątrz
karty. Opcjonalna krótka zachęta do obejrzenia systemu i rejestracji,
bez rozbudowanego nagłówka zasobów. Zrzuty po wykonaniu z danymi.
Źródło zakresu i zachowania: maile-granice.md.

### Ostatnia korekta wyglądu `/mail/` — 2026-10-12

Sekcja globalnej rezygnacji **nad** kartą list. Karta ma rzeczywiste
wypustki jak Ankiety: ten sam HTML/CSS, dwie zakładki Subskrypcje oraz
Zadania, również na komputerze. Zastępuje wcześniejsze dwie równoczesne
kolumny i prostokątne mobilne przyciski. Tytuł „Moje powiadomienia”
w stylu nagłówka Gier, złote logo, lekki topbar; stopka stale przy dolnej
krawędzi przez pełną wysokość układu. Globalna rezygnacja ukrywa kartę
list, zachowuje nadrzędną sekcję przywrócenia.

Ostateczne doprecyzowanie ikon wszystkich udostępnień: X dla odmowy,
rezygnacji, opuszczenia dostępu przez odbiorcę; śmietnik dla usunięcia
zasobu, relacji lub cofnięcia/anulowania własnego udostępnienia przez
nadawcę. Samo zamknięcie okna nadal X. Wspólny sharingActionIcon oraz
renderery udostępnień pilnują tej semantyki; podpis opisuje akcję.
Zastępuje przejściową interpretację „śmietnik przy każdej rezygnacji”.

### Kontakt w stopce — decyzja użytkownika 2026-10-12

Formularz Kontakt jest dostępny na każdej stronie, również bez logowania.
W `/mail/` wspólny przycisk data-contact-modal i istniejący formularz,
bez drugiej implementacji. „Poznaj system” prowadzi do `/` (strona główna),
„Logowanie i rejestracja” do `/login/`. Audyt pozostałych stron obejmuje
obecność przycisku, otwarcie anonimowe i zachowanie pełnego ekranu/landscape.
Nie wysyłać prawdziwego zgłoszenia podczas podglądu/testów — wywołuje
powiadomienie admina; transport zastąpić kontrolowanym testowym odbiorem.

Korekta podglądu Kontakt: na pełnym ekranie telefonu Wstecz w topbarze zamiast X,
także na stronach bez przycisku Wstecz w topbarze (np. `/mail/`). Nagłówek
ma tło zgodne z treścią modala, bez jaśniejszego prostokąta. Na stronach
z istniejącym wspólnym trybem sheet nadal przejmowany jest przycisk
topbara. Zwykłe okno na komputerze zachowuje zamknięcie X.
Gdy strona nie ma przejmowanego przycisku, pełnoekranowy Kontakt ma
dedykowany przycisk we wspólnym topbarze. W `/mail/` wspólny sheet mieści
się w mail-wrap; topbar ze zmianą języka i stopka strony pozostają widoczne.
Wstecz nie ląduje w nagłówku formularza. Własny topbar pełnoekranowy
dotyczy wyłącznie stron, na których nie istnieje wspólna struktura strony.

Stopka `/mail/`: wspólna `.footer`, linia oddzielająca, podpis Familiada
i Kontakt; bez dodatkowych zachęt w stopce. „Poznaj system” oraz logowanie
pozostają małą sekcją treści centrum, niewidoczną podczas Kontakt.
Wspólne Wstecz topbara: ikona i napis wyśrodkowane pionowo, jawny odstęp6px,
równy padding boków i wysokość zgodna z przyciskiem języka.

### Kontakt — wyjątki ekranów urządzeń (korekta użytkownika 2026-10-12)

„Kontakt na każdej stronie” dotyczy zwykłych stron systemu, również
niezalogowanych. **Host, Display i Buzzer nie mają kontaktu ani jego
stopki/pływającego przycisku.** Nie wczytują modułu kontaktu; oznaczenie
ekranu urządzenia blokuje jego automatyczne dodanie lub otwarcie przez
wspólny moduł. Ta korekta zastępuje wcześniejszą interpretację obejmującą
te trzy ekrany. Control jako panel zarządzania pozostaje zwykłą stroną.

### E20 — starsze importy i eksporty w Grach/Logo (2026-10-13)

Użytkownik wskazał wiek Importu/Eksportu/Do bazy i zaproponował
uproszczenie obsługi. Wspólny pasek importu/eksportu ma jasno rozdzielać
pobranie pliku, wczytanie pliku, wysłanie kopii znajomym oraz zapis pytań
do bazy. Wyślij pozostaje w tej sekcji. Telefon: wspólne małe ikony;
desktop: ikona i krótka nazwa, zgodnie z wcześniejszą decyzją.

Sprawdzić liczbę kroków, wybór pliku/bazy/znajomych, podgląd,
postęp, błędy i ponowienie po zerwanym połączeniu. Wspólne elementy
mają używać tego samego CSS. Zakres przenoszonych danych i mechanizm
snapshot/importu w udostepnianie-kopii-plan.md; nie dublować formatów.
Zrzuty po wykonaniu z przykładowymi danymi390/1400 i landscape.

**Korekta zakończenia operacji2026-10-13:** użytkownik zgłosił migające
okno importu. Dla Gier/Logo/Baz operacja rusza natychmiast; pobieranie
pliku zaczyna się zaraz po przygotowaniu, bez oczekiwania na Gotowe.
Jeśli operacja ma okno postępu, po sukcesie zostaje potwierdzenie
i przycisk Gotowe (tylko zamknięcie, bez ponowienia zapisu/pobrania).
Bez sztucznego opóźnienia. Wybór innego pliku resetuje stan sukcesu.
Pierwsze wdrożenie: import gry; pozostałe ścieżki w tym samym przeglądzie.

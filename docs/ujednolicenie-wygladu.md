# Ujednolicenie wyglądu — listy, hub, subskrypcje, edytory

Decyzje 2026-10-07. Etap **E10** w [`wdrozenia.md`](wdrozenia.md) —
pierwszy do wdrożenia. Ten plik jest źródłem prawdy dla tego etapu.

---

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

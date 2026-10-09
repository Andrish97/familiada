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
   te same nagłówki z podpisem, ten sam kafel — wspólny komponent:
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

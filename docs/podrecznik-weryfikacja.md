# Podręcznik (E13) — weryfikacja przed pisaniem rozdziałów

Fakty sprawdzone w obecnej wersji serwisu i w regulaminie TVP, na podstawie
których powstają rozdziały [`podrecznik-plan.md`](podrecznik-plan.md).
Rozbieżności z planem oznaczone **ROZBIEŻNOŚĆ**; decyzje — w PROGRESS-E13.md.

## Część I — regulamin TVP (stan: WSTĘPNY, 2026-10-21)

Pełnego tekstu nie odczytano: sieć środowiska blokuje `s.tvp.pl` (403).
Poniżej ustalenia z fragmentów regulaminów pokazanych przez wyszukiwarkę —
**bez numerów paragrafów, do potwierdzenia w PDF** przed napisaniem rozdz. 1–4.

- Regulamin (prawdopodobnie najnowszy, nadawca „Telewizja Polska S.A. w likwidacji”,
  producent FremantleMedia Polska): https://s.tvp.pl/repository/attachment/3/5/4/354f69c09c8b430588d3c079410afb3d.pdf
  Strona TVP: https://www.tvp.pl/83918733/program-familiada-jak-sie-zglosic-casting-regulamin
- Ankieta: 100-osobowa próba; punkty = liczba wskazań — zgodne z planem.
- Rzadkie odpowiedzi „uznawane są za błędne i nie wchodzą do końcowego
  opracowania” — przykład „1, 2 i 3 razy” z planu **niepotwierdzony**.
- Rundy I–III, dogrywka, gdy żadna drużyna nie ma łącznie 300 pkt; dogrywka
  trwa do osiągnięcia 300 — zgodne.
- **ROZBIEŻNOŚĆ / uzupełnienie:** mnożniki: runda I ×1, II ×2, III ×3,
  dogrywka ×3, finał ×1 (starsze regulaminy: 3 rundy ×1, czwarta ×2, od piątej ×3).
- Pojedynek: po jednej osobie z drużyny (najpierw kapitanowie), odpowiada
  szybszy przycisk; gdy odpowiedź nie jest najwyżej punktowana, odpowiada
  przeciwnik; lepsza odpowiedź daje drużynie wybór: grać albo oddać pytanie.
  Obie spoza tablicy → kolejni uczestnicy; po czterech osobach bez trafienia
  pytanie wycofane.
- 3 sekundy na odpowiedź, po przekroczeniu brzęczek i X — zgodne; moment
  startu („od zakończenia odczytywania pytania”) niepotwierdzony.
- Trzy błędy → drużyna przeciwna ma jedną odpowiedź; trafiona — przejmuje bank.
- Finał: dwóch finalistów wskazanych przez kapitana, 5 tych samych pytań,
  15 s i 20 s, drugi ze słuchawkami z muzyką, powtórzenie → brzęczek i inna
  odpowiedź; finał bez mnożnika, cel 200 pkt — zgodne.
- **ROZBIEŻNOŚĆ:** nagroda za rundy = punkty × 3 zł zawsze (to wycena punktów,
  nie kara za nieosiągnięcie 200); 25 000 zł dochodzi tylko przy ≥200 pkt
  w finale (od 22.09.2019; wcześniej 15 000 zł).
- Uzupełnienie: drużyna 4-osobowa (od 2025; wcześniej 5), uczestnicy pełnoletni.

## Część II — obecna wersja serwisu

(w toku)

### Rozdz. 6 — Moje gry (sprawdzone 2026-10-21)

Źródła: `web/games/js/games.js`, `web/games/index.html`, `web/shared/js/core/game-rules.js`
(`QN_MIN 10`, `AN_MIN 3`, `AN_MAX 6`, `PTS_MIN 4`, `SUM_PREPARED 100`; to samo w bazie: `game_rules_compute`).

- Tytuł „Moje gry”; podpowiedź „Zaznacz grę, aby włączyć akcje i eksport. Podwójne naciśnięcie zmienia nazwę.” Lista odświeża się co 20 s.
- Zakładki: „Ankieta tekstowa”, „Punktacja”, „Preparowana”, „Gry Społeczności” (telefon: „Tekst”, „Punkty”, „Prepar.”, „Społeczność”); domyślnie Preparowana. Filtr: SZKIC, OTWARTA, ZATRZYMANA, GOTOWA, „Otrzymano”.
- Statusy: „SZKIC” (szary), „OTWARTA” (niebieski) + plakietka liczby głosów, „ZATRZYMANA” (złoty), „GOTOWA” (zielony). Preparowana: GOTOWA, gdy da się grać, inaczej SZKIC. **ROZBIEŻNOŚĆ:** „zatrzymana do podliczenia” to dwie plakietki: „ZATRZYMANA” + „do podliczenia”.
- Kopia otrzymana: „Od: {nazwa}”. Pod nazwą — czego brakuje do następnego kroku (np. „Gra musi mieć co najmniej 10 pytań (masz: n).”). Kafelek nie pokazuje typu.
- Nowa gra: kafelek „+ Nowa gra” → okno „Nowa gra” (nazwa wymagana, do 80 znaków), typ = aktywna zakładka, edytor się nie otwiera.
- Górny pasek: „Graj” (**ROZBIEŻNOŚĆ:** to wejście do panelu sterowania), „Ustawienia gry”, „Edytuj”, „Podgląd”, „Ankieta”. Dolny: „Powiel”, „Zmień typ”, „Eksportuj do pliku”, „Eksportuj do bazy”, „Importuj”, „Wyślij” (telefon: ikony). Wyłączony przycisk pokazuje powód w podpowiedzi.
  - Edytuj/Zmień typ: zablokowane przy ankiecie otwartej/zatrzymanej i dla Gier Społeczności.
  - Graj: ankieta tylko po zamknięciu („Gra będzie dostępna dopiero po zamknięciu ankiety.”), preparowana — gdy gotowa.
  - Ankieta: brak dla preparowanej; w szkicu wymaga 10 pytań (Punktacja: też 3–6 odpowiedzi).
  - Gry Społeczności: Graj (pierwsze kliknięcie dodaje do biblioteki), Podgląd, Ustawienia; kosz = „Usuń z biblioteki”; „ARCHIWALNA — usunięta ze Społeczności”.
- Zmiana nazwy: podwójne kliknięcie/stuknięcie → „Zmień nazwę”; gdy gra otwarta gdzie indziej — „Ta gra jest otwarta gdzie indziej.”
- Usuwanie: „Usuń grę” + przy otwartej/zatrzymanej ankiecie „Ankieta zostanie przerwana.”; blokada, gdy gra otwarta w innej karcie.
- Powiel: każdy typ i stan; przy otwartej/zatrzymanej ankiecie okno „Bez bieżących głosów” (kopia = szkic: tekstowa bez odpowiedzi, Punktacja z zerowymi punktami); zamknięta → kopia zamknięta z wynikiem, jeśli wynik poprawny, inaczej szkic. Nazwa „{nazwa} kopia”, „kopia 2”… Ukryte dla gości.
- Wyślij: ankieta tylko w szkicu („Wysłać można tylko szkic gry (bez wyników ankiety).”), preparowana zawsze; tylko do aktywnego znajomego; demo nie.
- Plik `.famgame` (import przyjmuje też `.json`); eksport otwartej/zatrzymanej ankiety — okno „Bez bieżących głosów” (nie blokada). Import zawsze tworzy nową grę, podgląd: Nazwa, Typ („· zamknięta ankieta (z wynikiem)”), Pytania + notki (niepełny wynik → szkic ankiety). Skracanie: nazwa 80, pytanie 100, odpowiedź 17; >6 odpowiedzi → 6 najwyżej punktowanych.
- Eksport do bazy: okno „Eksport do bazy”, bazy własne i udostępnione z edycją; folder w głównym katalogu nazwany jak gra („(2)” przy kolizji).

### Rozdz. 7 — Tworzenie i edycja gry (sprawdzone 2026-10-21)

- Typy: „Ankieta tekstowa”, „Punktacja”, „Preparowana”.
- Edytor: pole „Nazwa”; lewy panel „Pytania”, nagłówek warunków („Ankietę uruchomisz, gdy:” / „Gra będzie gotowa, gdy:”) z listą na żywo (zielone/czerwone, „— pytania: 2, 5”), kafelek „Dodaj pytanie” („Wymagane minimum: 10 (masz N)”), kafelki pytań („Tylko pytania”, „n/6 odpowiedzi • suma X/100”), „Importuj”. Prawy: „Treść pytania”, „Odpowiedź”/„Pkt”, „Dodaj odpowiedź n/6”, „SUMA x/100”. Do 1100 px — lista albo pytanie z „Wstecz”.
- **ROZBIEŻNOŚĆ:** pytanie do **100** znaków (nie 200); odpowiedź do 17; znaki spoza czcionki Wyświetlacza — odpowiedź się nie zapisze; w finale Wyświetlacz mieści 11 znaków odpowiedzi.
- Punkty 0–100 (całkowite). Preparowana: min. 4 pkt, suma ≤100 — to warunki gotowości, zapis niższych wartości możliwy (oznaczenie na czerwono).
- Autozapis: treść 350 ms po przerwie i przy wyjściu z pola; punkty i nazwa — przy wyjściu z pola; Enter kończy edycję. Puste → „Pytanie n” / „ODP n”.
- Ankieta otwarta/zatrzymana: edytor zablokowany („Niedostępne w tym stanie gry”). Zamknięta: okno „Zresetować ankietę?” (usuwa głosy, odpowiedzi ankietowanych, linki i QR; pytania i odpowiedzi zostają, punkty zerowane, gra wraca do szkicu). Gra w panelu sterowania: „Edycja zablokowana”.
- Gotowość: ≥10 pytań (bez górnego limitu); Punktacja i Preparowana 3–6 odpowiedzi; Preparowana ≥4 pkt i suma ≤100. Zamknięcie ankiety wymaga ≥10 pełnych ankiet (głosów).
- Import TXT: `@Nazwa` (przed pierwszym pytaniem), `#pytanie`, odpowiedzi w wierszach (numery „1”, „1.”, „2)”, „3 -”, „4:” usuwane; uwaga: „100 lat” traci liczbę), punkty po ostatnim `/` (tylko Preparowana). Podgląd na żywo, plik `.txt`. ZASTĘPUJE zawartość (potwierdzenie), błąd nie zmienia gry. >6 odpowiedzi → pierwsze 6.
- Zmień typ: dostępność jak Edytuj; okno „Zmień typ gry” — karty typów ze skutkiem: tekstowa „Pytania zostaną. Odpowiedzi i punkty zostaną usunięte.”; Punktacja „Pytania i odpowiedzi zostaną. Punkty zostaną usunięte.”; Preparowana „Pytania i odpowiedzi zostaną.” (+ „Punkty zostaną usunięte.” po resecie). Zawsze szkic.

### Rozdz. 5 — Konto (sprawdzone 2026-10-21)

- Logowanie `/login/`: pole „E-mail lub nazwa użytkownika”, „Hasło” (+ „Powtórz hasło” przy rejestracji); przyciski „Zaloguj”, „Załóż konto”, „Wejdź jako gość”, „Przypomnij hasło”. Menu konta: „Ustawienia konta”, „Wyloguj”.
- Gość nie ma: Znajomi, Subskrybenci, Zadania (nakładka „Niedostępne w koncie gościa”), Powiel/Wyślij/Otrzymane kopie (gry i logo), Udostępnij bazę, wysyłki ankiet do odbiorców, udostępniania urządzenia, zgłaszania i oceniania Gier Społeczności, oceny serwisu. Limitów ilościowych brak.
- Rejestracja: e-mail + hasło ×2 (bez nazwy), niewidoczna weryfikacja antybotowa. „Sprawdź e-mail (link aktywacyjny)…” → `/login/confirm/` „Gotowe! Konto potwierdzone.” Ponowna wysyłka raz na godzinę („Rejestracja w toku”). Zajęty adres: „Konto już istnieje. Przełączam na logowanie.”
- **Uwaga (możliwy błąd, poza podręcznikiem):** nazwa konta tworzona automatycznie z części adresu przed „@”; gdy zajęta lub zarezerwowana (np. `kontakt@`), rejestracja prawdopodobnie się nie powiedzie — do sprawdzenia testem.
- Logowanie e-mailem albo nazwą (bez względu na wielkość liter) — zgodne. Sesja trwa do wylogowania (bez „zapamiętaj mnie”). Po zalogowaniu zawsze „Moje gry”, wyjątki tylko z linków w mailach (Zadania, Znajomi, Bazy, Wąż). **ROZBIEŻNOŚĆ:** brak ogólnego powrotu do dowolnej strony — w rozdz. 5.3 opisać tylko linki z wiadomości.
- Logowanie przy aktywnym gościu: „Aktywna sesja gościa” → „Zaloguj i usuń konto gościa” (dane gościa przepadają).
- Gość: konto usuwane po 5 dniach od ostatniej aktywności (każde wejście przedłuża), dane tylko w tej przeglądarce, przypomnienie z „Migruj teraz”. Przejście na konto: „Ustawienia konta” → „Zapisz swoje dane” (e-mail, hasło ×2, nazwa opcjonalnie, „Migruj konto”) albo „Załóż konto” → „Przenieść konto gościa?” → „Tak, przenieś dane”. Po kliknięciu linku z maila: „Twoje gry, bazy pytań i pliki zostaną zachowane.”
- Nazwa: 3–20 znaków, litery/cyfry/`_ . -`, unikalna, zarezerwowane prefiksy (guest_, admin, kontakt, familiada…). Ekran „Pierwsze logowanie” tylko, gdy nazwy brak/tymczasowa. Zmiana: „Ustawienia konta” → „Nazwa użytkownika”, raz na godzinę. Widoczna dla subskrybentów, znajomych i w prawym górnym rogu.
- E-mail: „Zmień e-mail” — linki na obecny i nowy adres (zgodne), do potwierdzenia logowanie starym; raz na godzinę; „Wyślij ponownie” / „Anuluj zmianę”.
- Hasło: min. 8 znaków, mała i duża litera, cyfra, znak specjalny; inne niż poprzednie; raz na godzinę; nie pyta o obecne hasło.
- Reset: „Przypomnij hasło” (e-mail lub nazwa), raz na godzinę dla adresu (zgodne); `/login/reset/` „Ustaw nowe hasło”.
- **ROZBIEŻNOŚĆ (antybot):** niewidoczna weryfikacja przy każdym logowaniu/rejestracji/resecie/gościu; widoczne okno „Potwierdź, że jesteś człowiekiem” po 3 nieudanych próbach (przy 4.) albo gdy niewidoczna zawiedzie. W podręczniku: „po kilku nieudanych próbach może pojawić się dodatkowe potwierdzenie”.
- Ustawienia: „Wiadomości e-mail” (przełącznik, wyłączenie z potwierdzeniem), „Twoja ocena systemu” (tylko podgląd), „Materiały Demo” → „Przywróć pliki demo”. **Uwaga (poza podręcznikiem):** przywrócenie najpierw usuwa obecne gry/bazy/logo demo, także zmienione — okno tego nie mówi.
- Usunięcie: „Usuń konto” → hasło → „Usuń konto i dane” (gość: okno „Usunąć konto gościa?”). Usuwane: gry, bazy (i dostępy innych), dostępy do cudzych baz, logo, znajomości, subskrypcje, zadania, zaproszenia, otrzymane kopie, oceny, biblioteka Gier Społeczności, pliki. Zostają: kopie wysłane innym, głosy w cudzych ankietach (bez powiązania), gry w Grach Społeczności (bez autora).

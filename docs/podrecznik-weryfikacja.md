# Podręcznik (E13) — weryfikacja przed pisaniem rozdziałów

Fakty sprawdzone w obecnej wersji serwisu i w regulaminie TVP, na podstawie
których powstają rozdziały [`podrecznik-plan.md`](podrecznik-plan.md).
Rozbieżności z planem oznaczone **ROZBIEŻNOŚĆ**; decyzje — w PROGRESS-E13.md.

## Część I — regulamin TVP (sprawdzone 2026-10-21)

Podstawa (wskazana przez użytkownika): **Regulamin teleturnieju „FAMILIADA”** — Producent
Telewizja Polska S.A., Wykonawca ASTRO S.A., wersja z „głową rodziny” (2019):
https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf
(PDF przeczytany w całości; numery poniżej — dział i punkt).

- **IV.4** Każde pytanie analizowane pod kątem odpowiedzi 100 osób; przykład „wymień coś koloru
  żółtego”: banan 29, cytryna 19, żonkil 15 (= 75 odpowiedzi); pozostałe, np. czapka 3, pasy na
  drodze 1, wełna 2 — „uważane za niewłaściwe i nie SA wprowadzane do końcowego opracowania”. Zgodne z planem.
- **IV.5** Właściwe pytania — te, na które uzyskano 3–8 takich samych odpowiedzi; bardzo
  podzielone i niejasne są wycofywane.
- **V.1–2** Dwie drużyny (rodziny) z „głową rodziny”; punkty = liczba osób z taką odpowiedzią;
  punkty gromadzone w „banku” na tablicy.
- **V.3–4** Pojedynek: „głowy” przy pulpicie z przyciskami; odpowiada szybsza; jeśli odpowiedź
  nie jest najwyżej punktowana — szansa dla drugiej „głowy”; wyżej na tablicy = prawo dalszych
  odpowiedzi; drużyna może zrezygnować i przekazać pytanie przeciwnikom; obie spoza tablicy →
  kolejni członkowie rodzin. Dalej odpowiadają kolejni członkowie drużyny.
- **V.4** Zła odpowiedź = X i brzęczek, utrata „szansy”; **limit 3 sekund** — po przekroczeniu
  brzęczek i utrata szansy (regulamin nie określa, od kiedy liczony).
- **V.5–7** Trzy stracone szanse przed odkryciem wszystkich odpowiedzi → pytanie przechodzi do
  przeciwnej drużyny; przeciwnicy mogą się naradzać od utraty drugiej szansy grających;
  „głowa” przeciwnej drużyny ma jedną odpowiedź — trafiona: punkty do jej banku, inaczej
  zostają u grających.
- **V.8–9** Zwykle trzy rundy; **czwarta runda — podwójna wartość, od piątej — potrójna**;
  gra trwa do zdobycia przez jedną rodzinę łącznie **300 punktów**.
  **ROZBIEŻNOŚĆ z planem (3.):** regulamin nie przewiduje „trzech zaplanowanych rund i dogrywki”
  — to sformułowanie nowszych regulaminów. Domyślne mnożniki serwisu 1, 1, 1, 2, 3 są z nim zgodne.
- **V.10–13** Pokonana drużyna zabiera zgromadzone pieniądze; „głowa” zwycięzców wskazuje dwóch
  finalistów; drugi schodzi ze sceny i dostaje słuchawki z muzyką; finał: 5 pytań, cel 200 pkt.
- **V.14–16** Pierwszy gracz: 5 pytań w **15 s**; może pominąć pytanie i wrócić, jeśli zostanie
  czas; odpowiedź spoza tablicy = 0 pkt; potem odpowiedzi znikają z tablicy.
- **V.17–20** Drugi gracz: prowadzący podaje mu wynik partnera, te same pytania, **20 s**;
  powtórzenie odpowiedzi pierwszego → brzęczek i inna odpowiedź; odsłanianie razem
  z odpowiedziami pierwszego.
- **V.21–22** ≥200 pkt → nagroda główna **25 tys. zł** dodana do pieniędzy wygranych wcześniej;
  <200 → pieniądze zebrane w grze (**liczba punktów mnożona przez 3**). Finał bez mnożnika.
- Uczestnicy: pełnoletni (II.1). Liczby członków drużyny ta wersja nie podaje.
- Nowsza wersja regulaminu (fragmenty z wyszukiwarki, nie podstawa podręcznika): rundy I–III
  ×1/×2/×3 i dogrywka ×3, drużyny 4-osobowe.

## Część II — obecna wersja serwisu

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

### Rozdz. 8 — Logo (sprawdzone 2026-10-21)

- **ROZBIEŻNOŚĆ:** 3 tryby, nie 4: „Tekst” („Napis czcionką jak w klasycznym logo Familiady”), „Rysunek” („Rysuj, dodawaj kształty i napisy”), „Obraz” („Twój obraz zamieniony na kropki wyświetlacza”). Tekstu pikselowego nie ma (napis — narzędziem „Tekst” w Rysunku).
- Nowe logo: „+” → „Nowe logo” (nazwa do 80 znaków, przy kolizji „(2)”) → od razu edytor. Liczba logo bez limitu.
- Tekst: pole „Np. FAMILIADA”, „Dozwolone znaki”, licznik „Szerokość: n/30”; błędny napis nie zapisuje się.
- Rysunek: Wskaźnik (V), Rączka (H/Spacja), Powiększ/Pomniejsz, Tło sceny, Pędzel (B), Gumka (E), Kształty (S; 15 kształtów), Tekst (T, 45 czcionek), Cofnij/Ponów, Duplikuj, Wyczyść, Podgląd; kolory tylko czarny/biały; wynik 150×70 kropek. Skróty wyłączone w polach tekstowych.
- Obraz: „Wybierz obraz” (JPG/PNG/GIF/WEBP, do 5 MB), kadr „Obszar wyświetlacza”, obrót 90°, prostowanie ±30°, Jasność, Kontrast, Gamma, Czerń, Biel, Dither, „Odwróć”, „Przywróć”.
- Zapis automatyczny (bez przycisku i bez komunikatu), natychmiast przy „Wstecz”.
- Lista „Moje loga”: Edytuj, Podgląd, Powiel, Eksport (`.famlogo`), Import, Wyślij, kosz; zmiana nazwy dwuklikiem/przytrzymaniem. Telefon: edytor „Niedostępne na telefonie”, lista bez Edytuj/Nowe logo (<700 px).
- Logo wybiera się w Ustawieniach gry → „Logo” („Domyślne” = logo Familiady albo własne); globalnego aktywnego logo nie ma.
- Blokady: w trakcie rozgrywki lub otwartych ustawień gry logo nie da się edytować ani usunąć; edycja logo blokuje wejście do gry i ustawień.
- Wyświetlacz zawsze kropki. Prowadzący: „Piksele” / „Źródło” (domyślnie Źródło). Źródło: Tekst — napis w stylu logo Familiady; Obraz — oryginał z kadrem; **ROZBIEŻNOŚĆ:** Rysunek — kształt wektorowy jednobarwny w kolorze kropek (nie „oryginał”). Logo w edycji → prowadzący widzi domyślne.

### Rozdz. 9 — Bazy pytań (sprawdzone 2026-10-21)

- Lista: zakładki „Moje bazy” / „Udostępnione”; „Nowa baza” (do 80 znaków); „Przeglądaj”, „Udostępnij” (właściciel), „Powiel” (właściciel, nie gość), „Eksport” (`.fambase`), „Import”; filtr ról Moja/Edycja/Odczyt.
- Eksplorator („Menedżer bazy pytań”): drzewo „Foldery” od „Folder główny” (nieusuwalny), panel „Tagi” i „Pasujące kategorie” (automatyczne: preparowane/punktowane/typowe). Głębokość folderów bez limitu, drzewo pokazuje 8 poziomów.
- Pasek: Nowy folder, Nowe pytanie, Edytuj pytanie, Tagi, Zmień nazwę, Usuń, Kopiuj, Wytnij, Wklej, Duplikuj, Utwórz grę, Odśwież widok. Menu kontekstowe (dotyk: przytrzymanie) — te same + „Otwórz folder”, „Nowy folder/pytanie w tym folderze”; w panelu tagów: Pokaż, Dodaj/Edytuj/Usuń tag.
- Skróty (Mac: ⌘): Ctrl+Shift+N folder*, Ctrl+N pytanie, Ctrl+E edycja, Ctrl+T tagi, F2 nazwa, Delete usuń, Ctrl+C/X/V/D, Ctrl+A, Ctrl+G utwórz grę, Ctrl+Alt+R odśwież, Enter otwórz folder, Backspace folder wyżej, Esc odznacz. *zob. błędy.
- Zaznaczanie: Ctrl/⌘, Shift (zakres), ramka. Przeciąganie na folder przenosi (z Ctrl/Option kopiuje); na puste tło → do „Folderu głównego”; na tag — przypisuje.
- Tagi: do 40 znaków, litery/cyfry/_, kolor; przypisanie do całego zaznaczenia (stan „częściowo”); filtr: kilka tagów = wszystkie naraz (AND); zaznaczone tagi blokują wyszukiwarkę i drzewo.
- Wyszukiwanie „Szukaj...”: treść pytań i nazwy folderów (nie odpowiedzi), chipy `#tag`.
- Okno „Pytanie”: treść do 100, do 6 odpowiedzi po 17 znaków, punkty opcjonalne 0–100 (suma do 100); tagi osobno.
- „Utwórz grę” → okno „Eksport gry”: nazwa (folder albo „gra”), drzewo całej bazy z zaznaczeniem, typ (domyślnie Preparowana), znacznik braków przy pytaniu, podsumowanie „Gotowa po utworzeniu.” / „Utworzy się szkic. Do gotowości brakuje: …”. Bez minimum, nic nie dobiera (zgodne z planem); potem lista gier.

### Rozdz. 12 — Współdzielenie baz (sprawdzone 2026-10-21)

- Tylko właściciel z kontem. Okno „Udostępnij bazę”: „E-mail lub nazwa użytkownika” (**odbiorca nie musi być znajomym**), lista „Znajomi” (wielu naraz), sekcja „Udostępnione” (oczekujące/aktywne/odrzucone). Rola: „Może edytować” (domyślnie) / „Tylko podgląd”.
- Role: Moja / EDYCJA / ODCZYT. Edytor: pełna edycja zawartości, eksport gier do bazy; nie udostępnia, nie zmienia nazwy, nie usuwa. Odczyt: przegląda i eksportuje do pliku; **nie tworzy gier** (zob. błędy).
- Odbiorca: e-mail z linkiem; kafelek „Proponowana”, „Od: …”, „Przyjmij”/„Odrzuć”; licznik na zakładce; zaproszenie wygasa po 5 dniach.
- Właściciel: zmiana roli (także oczekującej), przypomnienie, odebranie dostępu; odbiorca: „Usuń z listy”; odebranie w trakcie → „Odebrano Ci dostęp”.
- Blokady: „Ten element bazy jest właśnie edytowany w innej karcie lub przez innego użytkownika.”; otwarta baza blokuje zmianę nazwy i usunięcie.

### Rozdz. 2 i 15.6 — algorytm wyników ankiety (sprawdzone 2026-10-21)

Jeden moduł `web/shared/js/core/poll-tally-math.js` = SQL migracji 405.

- N = liczba **pełnych ankiet** (osoby, które odpowiedziały na każde pytanie). Udział = ⌊100 · głosy / N⌋ (zawsze w dół; dodatni poniżej 1% → 1%). **ROZBIEŻNOŚĆ:** to nie „przeliczenie proporcjonalne” z zaokrągleniem — w podręczniku: „procent pełnych ankiet, zaokrąglony w dół”.
- Kwalifikacja: ≥4% po zaokrągleniu (3,9% → 3% → odpada). Punkty = udział; równe głosy = równe punkty; suma ≤100.
- Bez górnego limitu głosów; podliczyć można od **10 pełnych ankiet**.
- Tekstowa — kolejność: usunięcie znaków spoza Wyświetlacza → łączenie identycznych (bez wielkości liter) → scalenia/poprawki użytkownika → udział → ≥4% → ranking (głosy, przy remisie kolejność) → do 6 → przy zatwierdzeniu ≥3.
- Punktowa: odpowiedzi stałe; <4% → 0 pkt; zatwierdzenie wymaga ≥3 odpowiedzi z ≥4 pkt w każdym pytaniu.
- Remis na granicy szóstki: „Zmień wybór w remisie”; komunikat „Remis na granicy szóstki. Do gry: … Pominięte: …”.

### Rozdz. 15 — Ankiety (sprawdzone 2026-10-21)

- Stany: szkic → otwarta ⇄ zatrzymana → gotowa. Przyciski: „Uruchom” / „Uruchom i wyślij zaproszenia (n)”, „Zatrzymaj”, „Wznów głosowanie”, „Podlicz głosy” (tylko zatrzymana), „Wyjdź z podliczania”, „Zatwierdź”, „Uruchom ponownie” (gotowa, usuwa głosy), „Przerwij” (do szkicu, głosy przepadają).
- Uruchomienie: ≥10 pytań (punktowa: 3–6 odpowiedzi).
- Karty „Udostępnianie” („Anonimowo” / „Odbiorcy”) i „Głosy”. Anonimowo: „Link do głosowania”, „Kopiuj link”, QR, „Powiększ kod QR”; „QR na wyświetlaczu” = podłączenie osobnego ekranu z kodem. Jeden głos na przeglądarkę („Już oddałeś głos w tej ankiecie”).
- Odbiorcy: „Dodaj odbiorców” (znajomi i subskrybenci), „Wyślij zaproszenia (n)”, „Przypomnij” (maks. 2), „Usuń udostępnienie”; statusy czeka/Otwarto/zagłosował/odrzucił; podsumowanie „Zaproszeni · Zagłosowali · Odrzucili”. Anonimowo — tylko licznik.
- Głosowanie: jedno pytanie na ekran „Pytanie i/n”, odpowiedź tekstowa do 17 znaków, wysłanie po ostatnim pytaniu (wyjście wcześniej — nieuznane), „Dziękujemy za udział!”.
- **ROZBIEŻNOŚĆ:** Zadania mają sekcje „Do zrobienia” i „Zrobione” (zwinięte, 5 dni), nie „aktualne/archiwalne”; akcje „Głosuj”, „Odrzuć” („Ankieta zniknie z Twojej listy.”).
- Podliczanie (osobny krok, potem „Zatwierdź”): tekstowa — przeciąganie łączy odpowiedzi („Połącz z…” na dotyku), poprawka literówki, „Usuń”, „Scal identyczne”, „Zmień wybór w remisie”, „Cofnij”/„Ponów”, liczniki „Odpowiedzi: n (wymagane 3–6)”, „Pełne ankiety: n”; poprawki zapisywane. Punktowa — podgląd (poniżej 4% szare). Koniec: „Głosy podliczone. Gra gotowa.”

### Rozdz. 16 — Ustawienia gry (sprawdzone 2026-10-21)

Strona `web/games/settings/`. Sekcje: „Drużyny”, „Wygląd”, „Dźwięk”, „Pytania — Ustawienia”, „Pytania — Finał”, „Pytania — Rundy”, „Ustawienia gry”.

- Drużyny: „Nazwa drużyny A/B” (domyślnie „Drużyna A/B”, długość wg Wyświetlacza).
- Wygląd: „Kolory” (drużyna A, B, Tło, Kolor kropki; HEX + R/G/B), „Motyw” Klasyczny/Nowoczesny, „Logo”, „Logo prowadzącego” Piksele/Źródło; „Podgląd wyświetlacza”, „Podgląd prowadzącego”.
- Dźwięk: 10 dźwięków, wariant „Klasyczny”/„Własny” (mp3/wav/ogg; outro do 120 s, intro/przejście/finał 30 s, reszta 5 s), ▶, głośność 0–100%.
- Pytania — Ustawienia: „Czy gra zawiera finał?” Tak/Nie (domyślnie nie); „Tryb wyboru pytań finału” Losowe/Ręcznie (dokładnie 5); **„Tryb kolejności pytań rund” Losowe/„Kolejność”** (przeciąganie/strzałki).
- Ustawienia gry: „Mnożniki rund” domyślnie **1, 1, 1, 2, 3** (ostatni powtarza się); „Próg punktów do finału” 300; „Cel finału (pkt)” 200; „Tryb ekranu po zakończeniu” Logo/Punkty/Kwota nagrody; „Kwota główna nagrody” 25 000; „Mnożnik nagrody (po finale)” 3.
- **ROZBIEŻNOŚĆ:** brak „mnożnika finału” (finał zawsze ×1). „Mnożnik nagrody”: kwota = (punkty z rund + punkty finału) × mnożnik, + kwota główna po osiągnięciu celu (TVP: tylko punkty z rund × 3 zł).
- Zapis tylko przyciskiem „Zapisz” („Niezapisane zmiany”); „Przywróć domyślne” globalnie i w sekcjach Wygląd/Dźwięk/Ustawienia gry.

### Rozdz. 17 — Panel sterowania i urządzenia (sprawdzone 2026-10-21)

- Kroki: Urządzenia → Podsumowanie ustawień → „Rozpoczęcie gry” → Runda N (pojedynek / rozgrywka / kradzież) → finał → „Koniec gry”.
- Urządzenia: „Wyświetlacz”, „Prowadzący”, „Przycisk do pojedynku”, „Dźwięk”, „Tryb testowy”. Kod 6-cyfrowy, „Kopiuj”, „Udostępnij”; Wyświetlacz „Otwórz”; Prowadzący/Przycisk „Kod QR”, „QR na wyświetlaczu”. Łączenie: „Podłącz urządzenie” → „Podłącz kodem” / „Skanuj QR”. Opcje „Nie używaj tabletu prowadzącego”, „Przycisk fizyczny”. Wyświetlacz wymagany zawsze.
- Udostępnienie urządzenia: e-mail/nazwa/znajomi → mail z linkiem; odbiorca: „Podłącz urządzenie → Urządzenia udostępnione dla mnie” (bez konta — przez maile).
- Tryb testowy: wszystkie urządzenia w jednym oknie (duże okno).
- Dźwięk: źródło „Panel sterowania” (odblokowuje się przy pierwszym kliknięciu) albo „Wyświetlacz” („Odblokuj dźwięk” na Wyświetlaczu, inaczej Dalej zablokowane).
- Podsumowanie: podgląd ustawień, głośności, „Losuj ponownie”, „Zmień ustawienia”, „Gotowe — przejdź do rozgrywki”.
- „Rozpocznij grę” (intro) → „Rozpocznij rundę”. Pojedynek: „Zatwierdź: {drużyna}” / „Ponów naciśnięcie” (przycisk fizyczny: wybór A/B); najwyżej punktowana od razu wygrywa, inaczej odpowiada druga drużyna, wyższa wygrywa, remis — pierwsza; dwa pudła → kolejna para.
- Rozgrywka: kafle, „X” (n/3), „Oddaj kontrolę” (raz, przed pierwszym trafieniem); akcje dwuetapowe (zaznacz → potwierdź). „Rozpocznij odliczanie 3s” — upływ = X, inna akcja kasuje.
- **ROZBIEŻNOŚĆ (nazwa):** przejęcie = „Kradzież” (jedna próba).
- „Zakończ rundę” (bank × mnożnik) → odsłanianie reszty → „Przejdź do następnej rundy / do finału / do zakończenia gry”. Próg po rundzie; do finału drużyna z wyższym wynikiem (remis — A).
- Finał: „Rozpocznij finał” → gracz 1, 5 pól, „Rozpocznij odliczanie (15s)” → przypisanie (z listy / „Nie ma na liście (0 pkt)” / „Brak odpowiedzi”) → „Pokaż odpowiedź”, „Pokaż punkty” → „Rozpocznij 2 rundę” → gracz 2 „(20s)”, „Powtórzenie” (dźwięk, 0 pkt). Timer jednorazowy, obowiązkowy. Po osiągnięciu celu „Zakończ finał”.
- „Koniec gry” → „Zakończ grę” (outro + logo/punkty/kwota) → „Zacznij od nowa” / „Wróć do moich gier”.
- Zmiana ustawień w trakcie: przy otwartym panelu — zablokowane; po jego zamknięciu nakładka „Gra w toku”: „Wróć” / „Zakończ rozgrywkę i otwórz ustawienia” (kończy grę, urządzenia trzeba podłączyć od nowa); blokada wygasa po 1 h bezczynności.

### Rozdz. 19.6 — Kontakt (sprawdzone 2026-10-21)

- „Kontakt” w stopce każdej strony → „Napisz do nas”: „Twój e-mail”, „Numer zgłoszenia (opcjonalnie)” (dopisuje do zgłoszenia), „Temat”, „Wiadomość” (min. 5 znaków), „Załączniki” (do 5 plików po 5 MB). Wynik: „Numer zgłoszenia: …”.

### Rozdz. 10 — Znajomi (sprawdzone 2026-10-21)

- Tylko konta zarejestrowane z potwierdzonym adresem. Pole „E-mail lub nazwa użytkownika” + „Zaproś” — trzeba podać **pełny** adres lub nazwę (bez podpowiedzi). Adres bez konta → podpowiedź „…możesz dodać tę osobę jako subskrybenta.” („Przejdź →”).
- **ROZBIEŻNOŚĆ (nazwy):** zakładki „Zaproszenia” („Dodaj znajomego”, „Oczekujące i odrzucone” — wysłane) i „Znajomi” („Znajomi”, „Propozycje” — otrzymane, „Odrzucone przeze mnie”); na komputerze oba panele obok siebie.
- Akcje: „Przyjmij”/„Odrzuć”; „Cofnij odmowę” (30 dni); wysłane: „Wyślij ponownie”, „Cofnij”; znajomy: „Usuń”. Po odmowie 30 dni bez ponownych zaproszeń w tej parze. Maile z zaproszeniem: co najmniej 5 dni odstępu, najwyżej 2 na 30 dni, tylko przy włączonych powiadomieniach.
- Usunięcie znajomego: znika z listy (30 dni „Cofnij odmowę”), oczekujące zadania ankietowe i zaproszenia do baz anulowane; przyjęte bazy i urządzenia zostają („…można je cofnąć osobno.”); kopie zostają.
- Znajomość daje: zaproszenia do ankiet, udostępnianie baz i urządzeń (urządzenia i bazy także bez znajomości — po adresie/nazwie), wysyłanie kopii gier i logo (tylko znajomym).

### Rozdz. 11 — Wysyłanie kopii (sprawdzone 2026-10-21)

- „Wyślij” w Moich grach i w Logo (nie dla gości) → „Wyślij znajomym” → „Wybierz znajomych” → „Wyślij”; „Wysłano do znajomych: n.”
- **ROZBIEŻNOŚĆ:** „tylko szkice” dotyczy gier ankietowych; preparowana i logo — w każdym stanie. Nie wolno: gier ze Społeczności, demo, oczekujących kopii, zasobu otwartego w edycji; baz pytań nie wysyła się.
- Odbiorca: mail „{nadawca} wysłał Ci kopię” („Zobacz kopię”), sekcja „Otrzymane kopie” (Akceptuj/Odrzuć) z „Od: …”; liczniki przy kartach. Kopia oczekująca wygasa po 5 dniach; po odrzuceniu ten sam zasób od tej osoby — dopiero po 30 dniach; oczekującej nie da się edytować.
- „Historia wysyłek” w oknie: 30 dni, odbiorca i data; bez akcji i bez statusu przyjęcia. Cofnięcia brak (zgodne).

### Rozdz. 13 — Gry Społeczności (sprawdzone 2026-10-21)

- „Szukaj gry…” (tytuł i opis), „Język” (Wszystkie/Polski/English/Українська), „Sortowanie”: Polecane, Najlepiej oceniane, Najczęściej dodawane, Najnowsze, Tytuł A–Z; „Pokaż więcej”.
- Karta: język, „W Twoich grach”, tytuł, „od: autor” albo złote „Familiada”, opis, „n dodano”, gwiazdki / „Brak ocen”. Szczegóły: pytania z odpowiedziami i punktami.
- Ocena 1–5 („Oceń tę grę:”), zmienialna, tylko zalogowani i nie własne; średnia liczona od 3 ocen.
- „Dodaj do moich gier” → karta „Gry Społeczności” w Moich grach (bez edycji/eksportu/powielania/wysyłania). „Usuń z moich gier” — tylko własna kopia (zgodne).
- Zgłoszenie: „Moje wysłane” → „Dodaj nową do Gier Społeczności”: „Wybierz grę” (gotowa preparowana albo zamknięta ankieta, ≥10 pytań, własna, nie demo), „Tytuł” (do 120), „Opis” (do 500), „Język gry”, zgoda „Rozumiem, że po wysłaniu zapis gry jest nieedytowalny.”. Zamknięta ankieta trafia jako preparowana (tylko odpowiedzi z punktami). Jedno aktywne zgłoszenie na grę.
- Statusy: „Oczekuje na weryfikację”, „Opublikowana”, „Odrzucona” („Powód: …”, znika po 5 dniach, można zgłosić ponownie), „Wycofana”. „Wycofaj” tylko przy opublikowanej; kopie u innych zostają („W Twoich grach · Wycofana”) — zgodne.

### Rozdz. 14 — Subskrybenci i maile (sprawdzone 2026-10-21)

- Subskrybent = osoba **bez konta**, tylko adres e-mail („Osoby bez konta, które chcą otrzymywać Twoje ankiety.”); adresu z kontem nie da się dodać. Dostaje ankiety i urządzenia.
- „Adres e-mail” + „Zaproś” → mail „Zaproszenie do subskrypcji od użytkownika …” („Zobacz zaproszenie”). Limity jak u znajomych (5 dni, 2 na 30 dni, 30 dni po odmowie).
- Zakładki „Zaproszenia” („Oczekuje”/„Odrzucono”, 5 dni) i „Subskrybenci”; „Ma konto — przejdź do Znajomych.” (wtedy automatyczna propozycja znajomości). Akcje „Wyślij ponownie”, „Usuń” (kasuje oczekujące zadania ankietowe).
- Maile subskrybenta: zaproszenie/przypomnienie, zaproszenia do ankiet, udostępnione urządzenia; w każdym stopka z „Moje powiadomienia” (link 30 dni) i „Wypisz się ze wszystkich maili Familiada”.
- `/mails/` bez linku: „Twoje maile w Familiadzie” → adres → „Wyślij link” (ważny 15 min, jednorazowy) → „Otwórz moje powiadomienia”. Adres z kontem → „Zaloguj się”. Sesja do 24 h (1 h bezczynności).
- Centrum: „Moje powiadomienia”, „Powiadomienia są włączone” + „Zrezygnuj”; „Subskrypcje” („Czeka na akceptację” Akceptuj/Odrzuć; aktywne „Wypisz się” — nowe zaproszenie po 30 dniach); „Zadania” (ankiety „Zagłosuj”/„Odrzuć”, urządzenia „Podłącz urządzenie”).
- „Zrezygnuj”: wyłącza wszystkie maile, anuluje subskrypcje, ankiety i urządzenia; „Przywróć powiadomienia” nie przywraca dawnych zaproszeń.

## Błędy znalezione przy weryfikacji (do naprawy przed opisem)

1. Eksplorator: `Delete` (i `Esc`) obsługiwane przed blokadą pól tekstowych — `Delete` w wyszukiwarce/oknie pytania przy zaznaczeniu otwiera „Usunąć …?” (`web/bases/explorer/js/actions.js` ~4639–4690).
2. Eksplorator: `Ctrl/⌘+Shift+N` tworzy pytanie zamiast folderu — gałąź Ctrl+N sprawdzana wcześniej (`actions.js` ~4759/4774).
3. Eksplorator: „Utwórz grę” na pasku aktywne dla roli Odczyt, kliknięcie nic nie robi (`render.js` ~407–418).
4. Rejestracja: nazwa z części adresu przed „@” zajęta/zarezerwowana → profil się nie tworzy (do potwierdzenia testem).
5. „Przywróć pliki demo”: usuwa zmienione materiały demo bez ostrzeżenia w oknie.
6. Martwe komunikaty „Nie można eksportować gry z otwartą ankietą” (`pl.js` ~2596/2599).
7. Podliczanie: okna potwierdzenia mówią o progu 3%, algorytm liczy od 4% (`pl.js` ~979/984 i EN/UK).
8. Ankieta punktowa: odpowiedź <4% dostaje 0 pkt i prawdopodobnie pojawia się na planszy jako kafel z 0 pkt (`game-validate.js` `loadAnswers`) — do sprawdzenia.
9. Oczekująca kopia gry/logo da się przyjąć po usunięciu znajomego (`_copy_decide` nie sprawdza znajomości) — do decyzji.
10. Usunięcie subskrybenta pokazuje tekst znajomych o bazach i urządzeniach (`pl.js` ~5152).
11. Literówka w finale: „Dźwiek powtórzenia”.

## Do decyzji użytkownika (nie blokuje pisania)

- ~~Domyślne mnożniki rund~~ — rozstrzygnięte: zgodne z regulaminem 2019 (V.9), bez zmian.
- „Mnożnik nagrody (po finale)” mnoży także punkty z finału; w regulaminie (V.21–22) ×3 dotyczy punktów zdobytych w grze przed finałem — zostawić czy dopasować? Do decyzji podręcznik opisuje działanie serwisu.

<!-- Plan uzgodniony z użytkownikiem 2026-10-20 (E13). Struktura i zakres rozdziałów manuala; treść rozdziałów pisać dopiero po sprawdzeniu działania serwisu. -->

# Plan podręcznika użytkownika Familiady

**Proponowana struktura rozdziałów i zakres tematów**  
Wersja robocza do wspólnego dopracowywania

## Cel i zasady redakcyjne

Podręcznik ma uczyć zarówno zasad teleturnieju Familiada, jak i korzystania z serwisu Familiada. Poniższy plan porządkuje uzgodnione tematy przed rozpoczęciem pisania rozdziałów.

- Wyraźnie rozdzielamy zasady teleturnieju, sposób ich odwzorowania w serwisie oraz opcje konfigurowane przez użytkownika.
- Różnice między teleturniejem a serwisem wyjaśniamy przy każdym właściwym zagadnieniu; nie tworzymy osobnego porównania w rozdziale wprowadzającym.
- Zakres podręcznika uwzględnia uzgodnione zmiany dotyczące tworzenia, kopiowania i przenoszenia gier. Instrukcje mają opisywać docelowy sposób działania serwisu po ich wdrożeniu.
- Szczegóły, limity i walidacje sprawdzamy przed napisaniem danego rozdziału.
- Unikamy powtórzeń; powiązane tematy odsyłają do siebie.
- Podręcznik ma być dostępny wszystkim użytkownikom. Po jego udostępnieniu FAQ ze strony głównej można zastąpić odnośnikiem do manuala; rozdział FAQ w podręczniku pozostaje tylko wtedy, gdy pojawią się rzeczywiście powtarzające się pytania.

## Część I — Zasady teleturnieju

### 1. Czym jest Familiada?

> **Adnotacja do zakresu rozdziału:** Krótki wstęp — około trzech akapitów — przedstawiający, na czym polega Familiada i jak ogólnie przebiega teleturniej. Zasygnalizować rundy i finał, bez szczegółowego omawiania zasad. Nie porównywać tu teleturnieju z serwisem; różnice opisywać przy odpowiednich zagadnieniach w kolejnych rozdziałach. Wstęp oprzeć na opublikowanym regulaminie TVP i zamieścić do niego odnośnik.

### 2. Pytania ankietowe i odpowiedzi

- **Skąd biorą się odpowiedzi** — ankietowani odpowiadają na pytanie, a teleturniej wykorzystuje ich najczęstsze odpowiedzi. To nie jest quiz z jedną obiektywnie poprawną odpowiedzią.
- **Jak czytać tablicę** — w teleturnieju odpowiedzi są uporządkowane według popularności, a punkty pokazują liczbę wskazań wśród 100 ankietowanych. Oficjalny regulamin TVP opisuje pomijanie rzadko wskazywanych odpowiedzi: w przykładzie odpowiedzi wskazane 1, 2 i 3 razy nie trafiają do końcowego opracowania.

> **Adnotacja do podrozdziału „Jak czytać tablicę”:** Opisać wyłącznie teleturniej: ankieta obejmuje 100 osób, a punkty przy odpowiedziach odpowiadają liczbie ankietowanych, którzy wskazali daną odpowiedź. Wyjaśnić, że odpowiedzi są uporządkowane według popularności oraz że regulaminowy przykład pokazuje pomijanie rzadko wskazanych odpowiedzi — odpowiedzi wskazane 1, 2 i 3 razy nie trafiają do końcowego opracowania.

- **Co oznacza odpowiedź pasująca do tablicy** — wyjaśnienie, że drużyna próbuje odgadnąć odpowiedzi z zestawienia; szczegóły rozstrzygania odpowiedzi będą w rozdziale o przebiegu rundy.
- **Jak serwis wykorzystuje wyniki ankiety** — krótkie wprowadzenie do tego, jak zebrane odpowiedzi stają się zestawem odpowiedzi i punktów w grze; sam proces zbierania i podliczania opisze rozdział 15.

> **Adnotacja do podrozdziału „Jak serwis wykorzystuje wyniki ankiety”:** Opisać wyłącznie sposób przetwarzania wyników przez serwis. Serwis nie wymaga dokładnie 100 głosujących: może ich być mniej lub więcej, także kilkaset, np. 500; nie ma ustalonego górnego limitu liczby głosów. Wyniki są przeliczane proporcjonalnie na skalę 0–100. Odpowiedź kwalifikuje się od 4% włącznie po zaokrągleniu, a do zamknięcia ankiety potrzeba co najmniej trzech kwalifikujących się odpowiedzi na pytanie. W ankiecie tekstowej lista końcowa może zawierać mniej niż sześć odpowiedzi; jeśli kwalifikuje się ich więcej, zostaje ograniczona do sześciu, ponieważ tyle pozycji mieści tablica Wyświetlacza. To ograniczenie wynika z możliwości wyświetlacza, a nie z regulaminu teleturnieju. Nie narzucać osobnej liczby odpowiedzi dla poszczególnych rund. Opisać kolejność scalania, zaokrąglania, kwalifikacji i ograniczenia listy zgodnie ze wspólnym algorytmem. Szczegółowy przebieg głosowania i podliczania opisać w rozdziale 15.

### 3. Przebieg rundy i pojedynek

> **Adnotacja do zakresu rozdziału:** Opisać przebieg rundy krok po kroku zgodnie z regulaminem Familiady. Zaznaczyć, że podstawowa kolejność i mechanika rund w serwisie są wzorowane na regulaminie; różnice dotyczące konfiguracji i przebiegu serwisu wyjaśnić osobno przy właściwych punktach.

- **Układ rund i dogrywka** — w teleturnieju po trzech zaplanowanych rundach może nastąpić dogrywka, rozgrywana według zasad rundy, jeśli żadna drużyna nie osiągnęła 300 punktów. W serwisie dodatkowe pytania nie tworzą osobnego etapu dogrywki: są kolejnymi zwykłymi rundami, a próg rozstrzyga, kiedy drużyna przechodzi do finału.
- **Punktacja i mnożnik rundy** — krótkie objaśnienie mnożnika, a następnie pokazanie, jak mnożniki kolejnych rund wpływają na zdobyte punkty. Zaznaczenie, że w regulaminie teleturnieju mnożniki są przypisane do etapów, a w serwisie użytkownik może ustawić własną sekwencję.
- **Pojedynek na początku rundy** — przedstawiciele obu drużyn odpowiadają na to samo pytanie; ich odpowiedzi pomagają ustalić, która drużyna przejmie prowadzenie w rundzie.
- **Odpowiadanie przez drużynę** — po pojedynku członkowie drużyny próbują odkryć pozostałe odpowiedzi z tablicy.
- **Błędy i przejęcie punktów** — co oznacza błąd, jak działają trzy błędy i kiedy drużyna przeciwna może przejąć bank.

> **Adnotacja do podrozdziału „Błędy i przejęcie punktów”:** Wyjaśnić rolę limitu trzech sekund w teleturnieju: utrzymuje tempo gry, a brak odpowiedzi w czasie jest traktowany jak błąd. Regulamin TVP określa, że uczestnik ma odpowiedzieć w ciągu trzech sekund od zakończenia odczytywania pytania; po upływie czasu na tablicy pojawia się X. Opisać też praktyczny sygnał upływu czasu: operator może uruchomić odliczanie, gdy odpowiedź się przeciąga, a prowadzący sygnalizuje koniec czasu (np. „Czas!”). Przy pisaniu treści sprawdzić dokładny sposób uruchamiania timera i używaną kwestię prowadzącego na nagraniu, ponieważ sam regulamin tych szczegółów nie podaje.
- **Zakończenie rundy i sprawdzenie progu** — kiedy runda dobiega końca, której drużynie przypada bank oraz kiedy wynik uruchamia dogrywkę lub kwalifikuje drużynę do finału. Wyjaśnienie, że próg rund/drogi do finału dotyczy łącznego wyniku drużyny, a nie mnożnika ani liczby odpowiedzi.
- **Odwzorowanie w serwisie** — próg ustawiony w serwisie jest sprawdzany po rozliczeniu rundy. Po jego osiągnięciu gra przechodzi do finału, jeśli finał jest włączony i gotowy, albo do zakończenia gry; jeśli pula pytań się skończy wcześniej, gra kończy się bez finału. Serwis nie narzuca limitu trzech rund ani nie oznacza kolejnych rund jako dogrywki; ich liczba zależy od dostępnych pytań.

> **Adnotacja do podrozdziału „Odwzorowanie w serwisie”:** Wyjaśnić dwa sposoby zakończenia bez finału. Jeśli zabraknie pytań, zanim drużyna osiągnie ustawiony próg, rozgrywka kończy się bez finału. Użytkownik może też wyłączyć finał w ustawieniach; wtedy gra kończy się po rundach, a ekran końcowy pokazuje wynik uzyskany w rundach.
- Sposób, w jaki panel sterowania prowadzi operatora przez te etapy, opisze rozdział 17; tutaj wyjaśniamy samą mechanikę teleturnieju.

### 4. Finał teleturnieju

- **Przebieg finału** — rola dwóch finalistów i kolejność udzielania odpowiedzi.

> **Adnotacja do podrozdziału „Przebieg finału”:** Rozpisać przebieg finału zgodnie z regulaminem, zwracając szczególną uwagę na dwie części i różne limity czasu: pierwszy uczestnik odpowiada na pięć pytań w 15 sekund, a drugi na te same pytania w 20 sekund. Wyjaśnić, że podczas odpowiedzi pierwszego uczestnika drugi czeka z dala od niego, tak aby nie słyszeć ani nie widzieć odpowiedzi, i ma założone słuchawki z muzyką. Następnie drugi uczestnik odpowiada, znając wynik pierwszego; nie może powtórzyć jego odpowiedzi — przy powtórzeniu rozlega się sygnał i musi podać inną. Opisać kolejność ujawniania odpowiedzi i sumowania punktów.
- **Punktowanie i mnożnik finału** — jak łączone są wyniki finalistów; w teleturnieju punkty finałowe liczą się w mnożniku ×1. Oddzielenie mnożnika punktów finałowych od mnożnika używanego do wyliczenia nagrody pocieszenia.
- **Cel punktowy finału i przerwanie gry** — w teleturnieju celem jest co najmniej 200 punktów z odpowiedzi dwóch finalistów. Osiągnięcie celu oznacza zdobycie nagrody głównej; w serwisie finał może zakończyć się wcześniej po osiągnięciu ustawionego celu albo po rozegraniu wszystkich pytań finałowych.
- **Nagroda główna i rozliczenie wyniku** — w regulaminie nagroda 25 000 zł jest dodawana do kwoty zdobytej wcześniej po osiągnięciu celu finału; przy nieosiągnięciu celu wygrana z rund jest mnożona przez 3. W serwisie kwota głównej nagrody, cel finału i mnożnik rozliczenia mogą być konfigurowane.
- Różnice między zasadami teleturnieju a ustawieniami finału w serwisie będą zaznaczone; szczegóły konfiguracji opisze rozdział 16.

## Część II — Obsługa serwisu

### 5. Konto użytkownika

#### 5.1 Sposoby korzystania z serwisu

Krótko wyjaśnić różnicę między kontem zarejestrowanym a wejściem jako gość oraz wskazać, do czego konto jest potrzebne. Przedstawić dostępne opcje już na stronie logowania.

#### 5.2 Rejestracja i potwierdzenie adresu e-mail

Opisać założenie konta przez podanie adresu e-mail i hasła, wymóg potwierdzenia adresu, ponowne wysłanie wiadomości oraz komunikaty pojawiające się przy typowych problemach, takich jak użyty już adres lub brak wiadomości.

#### 5.3 Logowanie i wylogowanie

Wyjaśnić logowanie adresem e-mail albo nazwą użytkownika, utrzymanie sesji i wylogowanie. Opisać też powrót do strony lub czynności, do której użytkownik próbował przejść przed zalogowaniem.

#### 5.4 Konto gościa i zapisanie danych

Przedstawić rozpoczęcie pracy jako gość oraz jego ograniczenia. Opisać przejście z konta gościa na zarejestrowane przez podanie danych logowania i potwierdzenie adresu e-mail, a także zachowanie utworzonych wcześniej gier, baz pytań i plików.

#### 5.5 Nazwa użytkownika i profil

Opisać ustawienie nazwy przy pierwszym logowaniu, wymagania dotyczące jej dostępności i zmianę w ustawieniach konta. Wyjaśnić, gdzie nazwa jest widoczna, między innymi w panelu oraz przy zaproszeniach i kontaktach z innymi użytkownikami.

#### 5.6 Zmiana adresu e-mail i hasła

Pokazać, jak zmienić adres logowania i dlaczego trzeba potwierdzić zmianę w wiadomościach wysłanych na dotychczasowy i nowy adres. Opisać zmianę hasła oraz wymagania dotyczące jego długości i składu.

#### 5.7 Odzyskiwanie dostępu i zabezpieczenia

Wyjaśnić wysłanie linku do resetowania hasła, ustawienie nowego hasła oraz godzinne ograniczenie częstotliwości ponawiania prośby o reset. Wspomnieć o dodatkowej weryfikacji antybotowej, która może być wymagana po trzech nieudanych próbach logowania.

#### 5.8 Pozostałe ustawienia konta

Opisać dostępne preferencje dotyczące wiadomości e-mail, podgląd wcześniej wystawionej oceny serwisu oraz przywracanie materiałów demo obejmujących gry, bazy pytań i logo.

#### 5.9 Usunięcie konta

Wyjaśnić, jak uruchomić usunięcie konta, jakie potwierdzenie jest wymagane oraz jakie skutki ma ta nieodwracalna czynność dla profilu i powiązanych danych. Zakres usuwanych zasobów opisać po sprawdzeniu aktualnego działania serwisu.

### 6. Moje gry

#### 6.1 Do czego służy strona „Moje gry”

> **Adnotacja do podrozdziału:** Opisać „Moje gry” jako stronę główną serwisu dla użytkownika zalogowanego na konto lub korzystającego jako gość. To główne miejsce, z którego użytkownik przechodzi do kolejnych czynności: strona zawiera przyciski i odnośniki prowadzące do poszczególnych sekcji systemu. Przedstawić ją także jako bibliotekę własnych gier i kopii gier wysłanych przez innych użytkowników. Omówić zakładki gier ankietowych według rodzaju, gier preparowanych i Gier Społeczności; szczegółowe korzystanie z katalogu społeczności opisuje rozdział 13.

#### 6.2 Lista gier i ich statusy

Opisać kafelki gier, wybór gry oraz widoczne oznaczenia stanu: szkic, otwarta ankieta, ankieta zatrzymana do podliczenia i gra gotowa. Wyjaśnić, że przy ankiecie może być widoczna liczba oddanych głosów albo informacja, że ankieta czeka na podliczenie. Wskazać, że serwis pokazuje też, od kogo otrzymano kopię, oraz komunikat, gdy następny krok gry jest zablokowany przez brakujące wymagania.

> **Adnotacja:** Opisać komunikaty o gotowości i powodach blokady tak, aby użytkownik wiedział, czego brakuje w całej grze lub konkretnym pytaniu i co może zrobić dalej.

#### 6.3 Utworzenie i wybór gry

Pokazać, jak rozpocząć tworzenie gry z właściwej zakładki i nadać jej nazwę. Krótko objaśnić wybór odpowiedniego rodzaju gry; szczegółowe różnice typów, tworzenie pytań i warunki gotowości opisać w rozdziale 7. Uwzględnić wybór kafelka jako punkt wyjścia do dalszych działań.

#### 6.4 Działania na wybranej grze

Omówić dostępne akcje z górnego paska: podgląd gry, edycję, zmianę typu, ustawienia rozgrywki, uruchomienie panelu sterowania oraz przejście do ankiety, jeśli gra używa głosowania. Wyjaśnić, że „Zmień typ” modyfikuje tę samą grę, a nie tworzy kopii. Opisać zależność dostępności akcji od rodzaju i stanu gry; szczegółowe zasady zmiany typu i jej skutki umieścić w rozdziale 7. Szczegółowe instrukcje pozostałych akcji odsyłają do rozdziałów 7, 15, 16 i 17.

#### 6.5 Zmiana nazwy i usuwanie gry

Opisać zmianę nazwy gry z poziomu kafelka oraz usuwanie gry po potwierdzeniu. Wspomnieć, że gry używane w innym otwartym interfejsie mogą być chwilowo zablokowane przed zmianą lub usunięciem. Przy usuwaniu gry z aktywną ankietą wyjaśnić, że ankieta zostaje przerwana.

#### 6.6 Powielanie i wysyłanie kopii gier

Wyjaśnić różnicę między powieleniem gry do własnej biblioteki a wysłaniem kopii znajomemu. Każda kopia jest niezależna, więc zmiany w niej nie zmieniają oryginału. Kopia gry z otwartą lub wstrzymaną ankietą zaczyna jako szkic i nie zawiera zebranych głosów; kopia zamkniętej ankiety zachowuje jej wynik. Znajomemu można wysłać szkic, ale nie zamkniętą ankietę. Szczegóły wysyłania gier i logo opisuje rozdział 11. Odróżnić tę funkcję od dodania gry z katalogu Gier Społeczności.

#### 6.7 Importowanie i eksportowanie

Opisać import gry z pliku `.famgame` lub `.json`, podgląd pliku, komunikaty o błędach i przebieg importu. Wyjaśnić, że można przenosić szkice oraz zamknięte ankiety. Eksport otwartej lub wstrzymanej ankiety wymaga potwierdzenia, ponieważ zebrane głosy nie przechodzą do pliku; po imporcie taka gra będzie szkicem. Zamknięta ankieta zachowuje wynik przy eksporcie i imporcie w tym samym trybie gry. Import może dodać do biblioteki także grę, która wymaga dalszego uzupełnienia — serwis powinien wskazać braki. Jeśli plik jest nieobsługiwany albo zawiera dane, których nie można przenieść, użytkownik powinien otrzymać czytelny komunikat lub zobaczyć zakres zmian przed zatwierdzeniem. Zaznaczyć, że możliwość eksportu lub powielenia nie oznacza gotowości do rozgrywki. Uwzględnić także eksport pytań i odpowiedzi do wybranej bazy pytań, gdzie powstaje folder nazwany jak gra; można wskazać bazę własną lub udostępnioną z prawem edycji. Szczegóły organizacji bazy opisuje rozdział 9.

> **Granica zakresu:** Rozdział opisuje stronę biblioteki i działania dostępne z jej poziomu. Szczegóły tworzenia i edycji zawartości gry, głosowania, ustawień rozgrywki, współdzielenia i prowadzenia gry pozostają w rozdziałach poświęconych tym funkcjom.

### 7. Tworzenie i edycja gry

#### 7.1 Wybór rodzaju gry

Wyjaśnić różnice między trzema typami dostępnymi przy tworzeniu gry: ankietą tekstową, punktacją i grą preparowaną. W ankiecie tekstowej autor wpisuje same pytania, a odpowiedzi zbierane są później od głosujących. W grze typu „Punktacja” autor przygotowuje pytanie i listę odpowiedzi, zaś punkty wynikają z ankiety tych odpowiedzi. W grze preparowanej autor wpisuje pytania, odpowiedzi i ich punktację ręcznie. Zaznaczyć, że szczegóły zbierania i podliczania głosów opisuje rozdział 15.

#### 7.2 Edytor gry

Przedstawić układ edytora: nazwa gry, lista pytań, edycja wybranego pytania oraz lista jego odpowiedzi, jeśli dany typ gry je przewiduje. Wyjaśnić dodawanie i usuwanie pytań oraz odpowiedzi, przechodzenie między pytaniami i zapis zmian. Nazwę gry można zmienić bez opuszczania edytora.

#### 7.3 Pytania i odpowiedzi

Opisać wpisywanie oraz poprawianie treści pytań i odpowiedzi. Wyjaśnić, że pytanie może mieć do 100 znaków (E21), a odpowiedź do 17 znaków. W ankiecie tekstowej edytuje się tylko pytania; w dwóch pozostałych typach gry edytuje się również listę odpowiedzi. Szczegółowe omówienie odpowiedzi pochodzących z bazy pytań pozostawić rozdziałowi 9.

#### 7.4 Punktacja odpowiedzi

Wyjaśnić, że w typie „Punktacja” punkty przy odpowiedziach nie są wpisywane ręcznie — wynikają z późniejszego głosowania. W grze preparowanej prowadzący przypisuje odpowiedziom punkty ręcznie. Każda odpowiedź musi mieć co najmniej 4 punkty, a suma punktów odpowiedzi w jednym pytaniu może wynosić najwyżej 100; nie ma wymogu uzyskania dokładnie 100 punktów. Zasady naliczania punktów w rozgrywce opisuje rozdział 3.

#### 7.5 Zapisywanie i edycja gry po rozpoczęciu ankiety

Opisać automatyczny zapis zmian: tekst zapisuje się po krótkiej przerwie w pisaniu lub po opuszczeniu pola, a punkty po opuszczeniu pola punktacji. Wyjaśnić, że ankiety otwartej lub zatrzymanej do podliczenia nie można edytować. Po zakończonej ankiecie edycja wymaga potwierdzenia resetu: głosy i wyniki ankiety oraz przypisana z nich punktacja są usuwane, a gra wraca do szkicu. Przy zablokowanej edycji lub zmianie trybu użytkownik otrzymuje jasny powód.

#### 7.6 Warunki gotowości gry

Przedstawić, jak serwis informuje o gotowości gry i brakach, które należy uzupełnić przed rozpoczęciem. Każda gra wymaga co najmniej 10 pytań, bez górnego limitu. W grach „Punktacja” i preparowanych każde pytanie wymaga od 3 do 6 niepustych odpowiedzi. W grze preparowanej każda odpowiedź wymaga co najmniej 4 punktów, a suma punktów w jednym pytaniu nie może przekroczyć 100. W ankiecie tekstowej odpowiedzi zbiera się później, więc nie trzeba wpisywać ich podczas tworzenia. Utworzenie gry z bazy pytań może zapisać szkic, który wymaga uzupełnienia — szczegóły opisuje rozdział 9. Warunki podliczania ankiety omawia rozdział 15.

#### 7.7 Import pytań z pliku tekstowego

Opisać wczytanie pliku TXT lub wklejenie treści, podgląd importu, obsługiwany zapis (`@Nazwa gry`, pytanie rozpoczynające się od `#`, odpowiedzi w kolejnych wierszach) i zatwierdzenie importu. Numery odpowiedzi i zapis punktów po ukośniku są opcjonalne; punkty są wykorzystywane tylko w grze preparowanej. Wyjaśnić, że import zastępuje dotychczasową zawartość gry, a odpowiedź dłuższa niż 17 znaków zostaje skrócona. Jeśli plik zawiera `@Nazwa gry`, może też ustawić nazwę gry.

#### 7.8 Zmiana typu istniejącej gry

Opisać akcję „Zmień typ” dostępną obok powielania: zmienia ona istniejącą grę, nie tworzy kopii. Gier z otwartą lub zatrzymaną ankietą nie można w tym momencie zmienić. Przy zamkniętej ankiecie serwis prosi o potwierdzenie resetu; po nim wyniki ankiety i przypisana z nich punktacja są usuwane, a gra staje się szkicem wybranego trybu. Przed zatwierdzeniem użytkownik widzi, które pytania, odpowiedzi i punkty zostaną zachowane, usunięte lub będą wymagać uzupełnienia. Gier z Gier Społeczności nie można zmienić tą akcją.

| Zmiana sposobu gry | Co stanie się z zawartością |
|---|---|
| Preparowana → punktowa | Zachować pytania i odpowiedzi, usunąć stałe punkty; punkty wynikną z nowej ankiety |
| Preparowana lub punktowa → tekstowa | Zachować pytania, usunąć odpowiedzi i punkty |
| Tekstowa → punktowa | Zachować pytania; odpowiedzi trzeba uzupełnić |
| Tekstowa lub punktowa → preparowana | Zachować pytania i dostępne odpowiedzi; brakujące punkty oznaczyć do uzupełnienia, bez automatycznego przydziału |
| Ten sam typ | Nie konwertować treści; gra po operacji ma stan szkicu |

Przy zmianie typu z zamkniętej ankiety wyjaśnić reset wyników i przekazanie do szkicu; dokładny zakres zachowanych odpowiedzi pokazać w podsumowaniu przed zatwierdzeniem.

> **Granica zakresu:** Ten rozdział opisuje przygotowanie i zmianę sposobu działania gry. Import gry z pliku, eksport oraz działania dostępne z biblioteki omawia rozdział 6; zbieranie głosów, ustawienia i prowadzenie rozgrywki opisują rozdziały 15, 16 i 17.

### 8. Logo gry: tworzenie i używanie

#### 8.1 Czym jest logo gry

Wyjaśnić, że logo gry jest przygotowanym przez użytkownika elementem rozgrywki, wyświetlanym między innymi na początku i na końcu gry. Odróżnić je od graficznego logo serwisu.

#### 8.2 Tworzenie logo tekstowego

Opisać wpisywanie tekstu oraz różnicę między zwykłym tekstem stylizowanym na logo Familiady a tekstem pikselowym. Wyjaśnić, jakie możliwości edycji ma użytkownik.

#### 8.3 Rysowanie logo

Opisać tworzenie logo przez rysowanie oraz narzędzia i ustawienia dostępne w tym trybie. Uwzględnić możliwość pokazania narysowanego logo w jego oryginalnej formie na zasłonie prowadzącego.

#### 8.4 Tworzenie logo z obrazu

Opisać wybór i użycie obrazu jako źródła logo oraz dostępne dopasowanie go w edytorze. Wyjaśnić, że obraz źródłowy może być pokazany na zasłonie prowadzącego.

#### 8.5 Zapisywanie, wybór i wyświetlanie logo

Opisać zapisywanie przygotowanego logo i używanie go w grze. Wyjaśnić, że Wyświetlacz uczestników zawsze pokazuje logo w postaci pikselowej, natomiast ekran prowadzącego może pokazywać zwykły tekst stylizowany na logo Familiady, oryginalny rysunek lub obraz — zależnie od sposobu utworzenia i wybranej opcji. Krótko wspomnieć, kiedy logo pojawia się w rozgrywce; szczegółowe sterowanie jego wyświetlaniem omówić w rozdziale 17.

### 9. Bazy pytań

#### 9.1 Do czego służy baza pytań

Wyjaśnić, że baza jest biblioteką pytań do wielokrotnego wykorzystania i nie jest gotową grą. Opisać utworzenie nowej bazy oraz przejście z listy baz do jej zawartości. Zasygnalizować różnicę między bazą własną a udostępnioną; szczegóły zapraszania i uprawnień opisać w rozdziale 12.

#### 9.2 Eksplorator bazy

Przedstawić bazę jako narzędzie działające podobnie do eksploratora plików: foldery porządkują pytania, a pytanie jest elementem, który można otworzyć i edytować. Opisać nawigację między folderami, listę zawartości, zaznaczanie jednego lub wielu elementów oraz pasek narzędzi i menu kontekstowe.

#### 9.3 Narzędzia do pracy z pytaniami i folderami

Opisać dostępne czynności z paska narzędzi lub menu: tworzenie pytania i folderu, edycję pytania i tagów, zmianę nazwy, przenoszenie, kopiowanie, wycinanie, wklejanie, duplikowanie, usuwanie oraz odświeżanie widoku. Wyjaśnić przeciąganie elementów do innego folderu i skutki najważniejszych czynności.

#### 9.4 Foldery i tagi

Wyjaśnić, jak tworzyć foldery zagnieżdżone i grupować w nich pytania oraz jak tagi pozwalają oznaczać pytania według tematu lub innego klucza. Opisać tworzenie i przypisywanie tagów, także do wielu zaznaczonych elementów, oraz używanie ich do filtrowania. Nie powtarzać tu zasad współdzielenia bazy.

#### 9.5 Wyszukiwanie i przeglądanie pytań

Opisać wyszukiwanie po treści pytania i przeglądanie zawartości według folderu lub tagu. Wyjaśnić, jak wrócić do pełnej listy i jak rozpoznać, z jakiego widoku użytkownik korzysta.

#### 9.6 Skróty klawiszowe

Zamieścić krótką tabelę najważniejszych skrótów w wersjach dla Windows/Linux i macOS, pogrupowaną według tworzenia, edycji, schowka, nawigacji i tworzenia gry. Uwzględnić, że skróty nie działają podczas wpisywania tekstu w polach edycyjnych. Przed opracowaniem tabeli sprawdzić skróty dostępne w aktualnej wersji serwisu.

#### 9.7 Edycja pytania

Opisać otwieranie pytania, poprawianie treści, odpowiedzi i punktów oraz przypisywanie tagów. Limity i zasady przygotowania treści powiązać z rozdziałem 7, aby nie powtarzać pełnego opisu edytora gry.

#### 9.8 Tworzenie gry z wybranych pytań

Wyjaśnić zaznaczanie pytań i rozpoczęcie tworzenia z nich gry. Gra powstaje z dokładnie wybranych pytań; serwis nie dobiera brakujących automatycznie. Można utworzyć nawet pusty lub niekompletny szkic — samo tworzenie nie wymaga minimum 10 pytań ani uzupełnienia wszystkich odpowiedzi i punktów. Wybrany sposób gry nie ogranicza listy pytań. Przed zatwierdzeniem użytkownik widzi, które elementy przejdą do gry i co może wymagać dalszej pracy: na przykład gra tekstowa zachowa pytania, ale nie listy odpowiedzi, a przy punktacji punkty wynikną z późniejszej ankiety. Szczegóły edycji utworzonej gry opisuje rozdział 7.

### 10. Znajomi i zarządzanie znajomościami

#### 10.1 Kim jest znajomy w serwisie

Wyjaśnić, że znajomość dotyczy użytkowników z kontami i powstaje po zaakceptowaniu zaproszenia. Krótko odróżnić znajomego od subskrybenta; szczegóły subskrypcji opisać w rozdziale 14.

#### 10.2 Wysyłanie zaproszeń

Opisać, jak znaleźć użytkownika po nazwie lub adresie e-mail i wysłać mu zaproszenie. Wyjaśnić, jak serwis podpowiada właściwy sposób zaproszenia, jeśli podany adres należy do użytkownika z kontem.

#### 10.3 Obsługa zaproszeń i ich statusów

Opisać, gdzie znaleźć otrzymane i wysłane zaproszenia oraz jak je przyjąć, odrzucić lub wycofać. Uwzględnić dostępne działania dla zaproszeń oczekujących i odrzuconych.

#### 10.4 Zarządzanie listą znajomych

Opisać przeglądanie aktywnych znajomości i usuwanie osoby z listy. Wyjaśnić, co wtedy dzieje się z oczekującymi zaproszeniami i zadaniami oraz które wcześniej przyjęte udostępnienia trzeba cofnąć osobno. Zaznaczyć, że wcześniejszej wysyłki kopii gry lub logo nie można cofnąć; szczegóły wysyłania i korzystania z otrzymanej kopii opisuje rozdział 11.

#### 10.5 Co umożliwia znajomość

Krótko wymienić możliwości wynikające ze znajomości: zapraszanie do ankiet, wysyłanie kopii gier i logo oraz udostępnianie baz. Szczegółowe instrukcje pozostawić rozdziałom 11, 12 i 15.

### 11. Wysyłanie gier i logo znajomym

#### 11.1 Co oznacza wysłanie kopii

Wyjaśnić, że odbiorca otrzymuje własną kopię gry lub logo i nie uzyskuje dostępu do oryginału. Zaznaczyć, że wysłanej kopii nie można cofnąć. Krótko odróżnić wysyłkę od powielenia zasobu dla siebie, eksportu pliku i dodania gry z Gier Społeczności; szczegóły tych funkcji opisać w rozdziałach 6 i 13.

#### 11.2 Wysyłanie gry

Opisać wybór szkicu gry i znajomych, do których ma trafić kopia. Wyjaśnić, że wysyłana gra zachowuje przygotowany sposób rozgrywki i treść, a wysyłać można szkice, nie zamknięte ankiety z wynikami. Szczegóły przygotowania gry opisuje rozdział 7.

#### 11.3 Wysyłanie logo

Opisać wybór logo i odbiorców oraz wyjaśnić, że otrzymaną kopię można wykorzystać we własnych grach. Odesłać do rozdziału 8 po opis tworzenia i używania logo.

#### 11.4 Odbieranie kopii

Opisać powiadomienie o otrzymanej kopii, jej przyjęcie lub odrzucenie oraz miejsce, w którym odbiorca znajdzie przyjętą grę lub logo.

#### 11.5 Historia wysyłek

Opisać historię dostępną w okienku wysyłania: jak ją otworzyć, jakie informacje o wcześniejszych wysyłkach można w niej sprawdzić i jakie działania są dostępne. Wyjaśnić, że historia pozwala sprawdzić przebieg wysyłki, ale nie cofnąć przekazania kopii.

### 12. Współdzielenie i wspólna edycja baz pytań

#### 12.1 Na czym polega współdzielenie bazy

Wyjaśnić, że kilka osób może korzystać z tej samej bazy, a wprowadzone w niej zmiany są widoczne dla osób mających do niej dostęp. Odróżnić ten sposób pracy od wysłania kopii gry lub logo, opisanego w rozdziale 11.

#### 12.2 Zapraszanie znajomego do bazy

Opisać wybór bazy i znajomego, określenie poziomu dostępu oraz wysłanie zaproszenia.

#### 12.3 Przyjmowanie zaproszenia i otwieranie bazy

Wyjaśnić, jak zaakceptować lub odrzucić zaproszenie oraz gdzie znaleźć bazę po przyjęciu zaproszenia.

#### 12.4 Poziomy dostępu

Opisać uprawnienia właściciela, osoby mogącej edytować bazę oraz osoby z dostępem do odczytu. Wyjaśnić, co każda z tych osób może robić, w tym korzystanie z pytań przy tworzeniu gry. Szczegóły pracy z pytaniami opisać w rozdziale 9.

#### 12.5 Wspólna praca i zarządzanie dostępem

Wyjaśnić, jak zmiany w bazie są widoczne dla współpracowników i co oznaczają komunikaty, gdy edycja elementu jest chwilowo zajęta. Opisać zmianę lub odebranie dostępu przez właściciela oraz to, co dzieje się z dostępem do bazy po odebraniu uprawnień.

### 13. Gry społeczności

#### 13.1 Czym są Gry społeczności

Opisać je jako publiczny katalog gotowych gier. Wyjaśnić, że dodanie gry do własnej biblioteki tworzy kopię do rozgrywania, a nie wspólny dostęp do gry autora. Krótko odróżnić tę funkcję od wysyłki kopii znajomemu, opisanej w rozdziale 11.

#### 13.2 Przeglądanie i wyszukiwanie gier

Opisać wyszukiwanie po tytule, filtrowanie według języka i dostępne sposoby sortowania, na przykład według ocen, popularności, daty dodania lub tytułu. Wyjaśnić informacje widoczne na karcie gry.

#### 13.3 Szczegóły i oceny gry

Opisać podgląd pytań i odpowiedzi przed dodaniem gry oraz możliwość wystawienia oceny. Wyjaśnić widoczne oznaczenia autora, w tym gry przygotowanej przez Familiadę.

#### 13.4 Dodawanie gry do biblioteki i rozgrywanie

Opisać dodanie wybranej gry do własnej biblioteki, uruchomienie jej z „Moich gier” i usunięcie z biblioteki. Wyjaśnić, że usunięcie własnej kopii nie odbiera gry innym osobom, które już ją dodały.

#### 13.5 Zgłaszanie własnej gry

Opisać wybór gry, wpisanie tytułu i opisu oraz wskazanie języka. Wyjaśnić wymagania dotyczące gotowości gry, a szczegółowe limity powiązać z rozdziałem 7. Zaznaczyć, że zgłoszenie jest zapisem gry z chwili wysłania i nie zmienia się wraz z późniejszą edycją oryginału. Zamknięta ankieta może zostać przedstawiona w katalogu jako gotowa gra z pytaniami, odpowiedziami i punktacją.

#### 13.6 Status zgłoszenia i wycofanie gry

Opisać listę własnych zgłoszeń, statusy weryfikacji, podgląd i miejsce, w którym można sprawdzić powód odrzucenia. Wyjaśnić, że wycofanie usuwa grę z katalogu dla kolejnych użytkowników, ale nie usuwa kopii z bibliotek osób, które wcześniej ją dodały.

### 14. Subskrybenci i powiadomienia e-mail

#### 14.1 Kim jest subskrybent?

Wyjaśnić, że subskrypcja jest odrębna od znajomości w serwisie. Znajomy ma konto i może korzystać z funkcji dostępnych dla znajomych, a subskrybent może otrzymywać wiadomości e-mail o ankietach. Szczegóły zapraszania do konkretnego głosowania opisać w rozdziale 15.

#### 14.2 Zapraszanie subskrybentów

Opisać, jak zaprosić osobę do subskrypcji, jakie dane trzeba podać i co dzieje się po wysłaniu zaproszenia.

#### 14.3 Lista i status subskrybentów

Wyjaśnić, gdzie właściciel konta sprawdza zaproszonych i zapisanych subskrybentów, jak rozumieć widoczne statusy oraz jak zarządzać listą.

#### 14.4 Powiadomienia o ankietach

Opisać, jakie wiadomości e-mail może otrzymać subskrybent i jak prowadzący wykorzystuje listę subskrybentów przy ankiecie. Szczegóły oddawania głosu i śledzenia zaproszeń pozostawić rozdziałowi 15.

#### 14.5 Strona „mails” i zarządzanie własnymi subskrypcjami

Opisać stronę „mails” z perspektywy odbiorcy, w tym osoby niezarejestrowanej: przeglądanie wszystkich swoich subskrypcji oraz rezygnowanie z wybranych subskrypcji. Wyjaśnić, jak rezygnacja wpływa na otrzymywanie kolejnych powiadomień e-mail.

### 15. Ankiety i zbieranie odpowiedzi

#### 15.1 Przygotowanie i uruchomienie ankiety

Perspektywa ankietującego: wyjaśnić, jak ankieta wiąże się z grą, co trzeba przygotować przed rozpoczęciem zbierania odpowiedzi i jak uruchomić ankietę.

#### 15.2 Wybór sposobu głosowania

Perspektywa ankietującego: opisać udostępnienie anonimowego linku lub kodu QR oraz zaproszenie osób do ankiety. Wyjaśnić, czym różnią się te sposoby i jakie informacje o głosujących można zobaczyć. Przy zaproszeniach subskrybentów dodać odnośnik do rozdziału 14.5: strona „mails” pozwala odbiorcy, także niezarejestrowanemu, przejrzeć swoje subskrypcje i z nich zrezygnować.

#### 15.3 Oddawanie głosu

Perspektywa odbiorcy: opisać otwarcie ankiety, udzielenie odpowiedzi i ich przesłanie. Wyjaśnić, jak wygląda głosowanie anonimowe, a jak głosowanie otrzymane w zaproszeniu. Uwzględnić, że odbiorca bez konta może przejść do zaproszonej ankiety przez stronę „mails”.

#### 15.4 Zadania i zaproszenia do głosowania

Perspektywa odbiorcy zaproszenia: wyjaśnić, czym jest zadanie i gdzie je znaleźć; opisać przeglądanie zaproszeń, przełączanie między aktualnymi i archiwalnymi, otwieranie ankiety, odmowę udziału oraz znaczenie statusów zadania. Uwzględnić różnicę między zadaniami w serwisie dla osób z kontem a dostępem przez stronę „mails” dla osób niezarejestrowanych. Szczegóły oddawania głosu pozostawić podrozdziałowi 15.3.

#### 15.5 Prowadzenie głosowania

Perspektywa ankietującego: opisać sprawdzanie postępu, zatrzymywanie i wznawianie zbierania odpowiedzi oraz zamknięcie ankiety. Wyjaśnić widoczne informacje o odpowiedziach i zaproszeniach, bez powtarzania instrukcji zarządzania listą subskrybentów z rozdziału 14.

#### 15.6 Podliczanie i opracowywanie odpowiedzi

Opisać podliczanie głosów i przekształcanie ich w punktowane odpowiedzi. Przy ankiecie tekstowej wyjaśnić łączenie lub poprawianie odpowiedzi oraz ponowne przeliczanie wyników.

> **Adnotacja:** Przejście do podliczania i zamknięcie ankiety to osobne kroki: użytkownik może rozpocząć podliczanie, nawet jeśli wyniki nie spełniają jeszcze warunków zamknięcia. Odpowiedzi kwalifikują się od 4% włącznie po zaokrągleniu; do zamknięcia potrzeba co najmniej trzech kwalifikujących odpowiedzi na każde pytanie. Wyjaśnić limit sześciu odpowiedzi oraz to, że zmiany mogą wpłynąć na kolejność i możliwość zamknięcia ankiety.

#### 15.7 Wyniki i wykorzystanie ich w grze

Wyjaśnić, jak sprawdzić opracowane wyniki i wykorzystać odpowiedzi w grze. Powiązać gotowość ankiety z wymaganiami rozpoczęcia gry opisanymi w rozdziale 7.

### 16. Ustawienia rozgrywki

#### 16.1 Przygotowanie ustawień

Wyjaśnić, kiedy i gdzie przygotowuje się ustawienia rozgrywki, że dotyczą konkretnej gry oraz jak wrócić do nich przed rozpoczęciem rozgrywki.

#### 16.2 Drużyny

Opisać wpisywanie nazw drużyn i wyjaśnić, gdzie ich nazwy pojawią się podczas rozgrywki.

#### 16.3 Wygląd

Omówić wybór kolorów, motywu planszy i logo gry. Wyjaśnić, że można też wybrać sposób prezentowania logo na ekranie prowadzącego.

> **Adnotacja:** Szczegółowo opisać różnicę między trybami „Piksele” i „Źródło” dla logo prowadzącego. W trybie „Piksele” ekran prowadzącego pokazuje logo w tej samej pikselowej postaci co Wyświetlacz. W trybie „Źródło” może pokazać materiał źródłowy użyty do stworzenia logo: obraz w oryginalnej postaci, grafikę wektorową narysowanego logo z przypisanym kolorem albo zwykły tekst ułożony w charakterystyczny, wygięty napis Familiady. Wyświetlacz zawsze pokazuje logo pikselowe, ponieważ jest ekranem kropkowym. Odesłać do rozdziału 8 po instrukcję tworzenia logo.

#### 16.4 Dźwięk

Opisać wybór wariantów dostępnych dźwięków, ustawianie ich głośności i odsłuchiwanie podglądu.

#### 16.5 Pytania

Wyjaśnić, jak ustawienia pytań wpływają na dobór i kolejność pytań w rozgrywce.

##### 16.5.1 Ustawienia pytań

Opisać ogólne ustawienia wyboru pytań, w tym wybór, czy rozgrywka zawiera finał oraz ustawienia trybu wyboru pytań.

##### 16.5.2 Pytania finałowe

Wyjaśnić ręczny i losowy wybór pytań finałowych, podgląd wybranego zestawu oraz zmianę losowania, jeśli jest dostępna.

##### 16.5.3 Pytania do rund

Opisać ustalanie kolejności pytań rund albo skorzystanie z losowego wyboru oraz podgląd przygotowanego zestawu.

#### 16.6 Dodatkowe ustawienia

Omówić mnożniki rund, próg punktowy przejścia do finału, cel punktowy finału, mnożnik finału, kwotę nagrody głównej oraz sposób prezentacji zakończenia gry. Wyjaśnić praktyczny wpływ tych opcji, a zasady rund i finału pozostawić rozdziałom 3 i 4.

#### 16.7 Zapis i użycie ustawień

Opisać podgląd ustawień, ręczny zapis zmian, przywracanie wartości domyślnych i przejście do gry. Powiązać uruchomienie gry z warunkami gotowości opisanymi w rozdziale 7.

### 17. Prowadzenie rozgrywki i podłączanie urządzeń

> **Adnotacja do rozdziału:** Połączyć obsługę Panelu sterowania z zachowaniem Wyświetlacza, ekranu prowadzącego i przycisków. Opisywać je razem, według etapów rozgrywki: co robi operator i co równolegle widzą lub robią uczestnicy na pozostałych urządzeniach. Dzięki temu rozdział pokaże przebieg jednej wspólnej czynności bez powtarzania osobno instrukcji dla każdego interfejsu. Przy szczegółach pracy operatora korzystać ze starego manuala, a kolejność rund i finału uzgodnić z zasadami z rozdziałów 3 i 4.

#### 17.1 Interfejsy i podłączanie urządzeń

Wyjaśnić role Panelu sterowania, Wyświetlacza, ekranu prowadzącego i przycisków. Opisać łączenie kodem lub QR oraz udostępnianie urządzenia. Wyjaśnić, gdzie znaleźć udostępnione urządzenie: użytkownik z kontem może otworzyć je w serwisie, a osoba niezarejestrowana — przez stronę „mails” i link z wiadomości. Wskazać, że Panel sterowania służy operatorowi do prowadzenia całej gry, a pozostałe interfejsy wspierają jej prezentację i udział uczestników.

#### 17.2 Przygotowanie i rozpoczęcie gry

Opisać kontrolę gotowości rozgrywki, podsumowanie ustawień i rozpoczęcie gry. Równolegle przedstawić zachowanie podłączonych urządzeń: uruchomienie Wyświetlacza na telewizorze lub projektorze, tryb pełnoekranowy, odblokowanie dźwięku oraz możliwość gry bez osobnego ekranu prowadzącego. Szczegóły konfiguracji odesłać do rozdziału 16.

#### 17.3 Prowadzenie rund

Przedstawić kolejność działań operatora i równoległe zachowanie urządzeń: rozpoczęcie rundy i pojedynku, sygnały z przycisków lub ręczne wskazanie drużyny przy przycisku fizycznym, wybór i ujawnianie odpowiedzi, przekazanie pytania, błędy i trzysekundowy timer, próbę przejęcia punktów oraz zakończenie pytania i rundy. Wyjaśnić, jakie informacje w poszczególnych momentach widzą uczestnicy na Wyświetlaczu i prowadzący na swoim ekranie. Opisać rozliczenie banku z mnożnikiem oraz przejście do kolejnej rundy, finału albo końca gry; zasady i progi wyjaśnić w rozdziałach 3 i 4, a ustawienia w rozdziale 16.

#### 17.4 Prowadzenie finału

Opisać w kolejności czynności operatora oraz to, co dzieje się na urządzeniach podczas obu części finału: przygotowanie uczestników, odliczanie czasu, wpisywanie i ocenianie odpowiedzi, oznaczanie powtórzeń oraz ujawnianie punktów. Uwzględnić czasy obu części, słuchawki i oddalenie drugiego uczestnika, aby nie słyszał ani nie widział odpowiedzi pierwszego.

#### 17.5 Zakończenie gry

Opisać działania prowadzące do zakończenia rozgrywki i ekran wyniku, a także zachowanie interfejsów po finale lub po grze bez finału. Wybór logo pokazywanego na ekranie prowadzącego powiązać z rozdziałem 16, a problemy z połączeniem urządzeń — z rozdziałem 19.

## Część III — Informacje dodatkowe

### 18. Najczęstsze pytania

> **Adnotacja do zakresu rozdziału:** Po udostępnieniu podręcznika wszystkim użytkownikom można usunąć FAQ ze strony głównej i zastąpić je odnośnikiem do manuala. Nie przenosić automatycznie obecnych odpowiedzi do podręcznika. Ten rozdział zachować tylko wtedy, gdy pojawi się zestaw pytań rzeczywiście i regularnie powtarzających się wśród użytkowników; odpowiedzi mają być krótkie i odsyłać do właściwych instrukcji. Jeśli takich pytań nie będzie, pominąć rozdział w końcowej wersji podręcznika.

### 19. Rozwiązywanie problemów

Instrukcje prowadzące od objawu do możliwego rozwiązania, bez powtarzania pełnych opisów funkcji z pozostałych rozdziałów.

#### 19.1 Problemy z kontem i dostępem

Opisać typowe trudności z logowaniem, potwierdzeniem adresu e-mail i odzyskiwaniem hasła oraz wskazać możliwe kroki naprawcze.

#### 19.2 Problemy z grami i zasobami

Uwzględnić trudności z otwarciem, edycją, importem lub wykorzystaniem gry, bazy pytań albo logo. W razie potrzeby odesłać do instrukcji zarządzania tym zasobem.

#### 19.3 Problemy z ankietami i głosowaniem

Opisać możliwe problemy z otrzymaniem zaproszenia, oddaniem głosu i wyświetleniem wyników, z odnośnikami do rozdziału o ankietach.

#### 19.4 Problemy podczas rozgrywki

Omówić trudności z rozpoczęciem gry, przejściem do kolejnego etapu lub działaniem ustawień, wskazując odpowiednie instrukcje.

> **Do rozpisania (źródło: obserwacje rzeczywistych rozgrywek; w treści podręcznika bez wzmianek o tym źródle):**
> - **Przycisk przejścia dalej długo nieaktywny** (np. „Rozpocznij rundę” po intro) → Wyświetlacz zminimalizowany albo otwarty jako karta obok panelu sterowania → otworzyć Wyświetlacz w osobnym oknie na pełnym ekranie (telewizor, drugi monitor).
> - **Gra wstrzymana z komunikatem o braku urządzenia** → patrz 19.5.
> - **Gra zakończyła się po zmianie ustawień** → zmiana ustawień w trakcie rozgrywki kończy bieżącą grę → ustawienia zmieniać przed startem albo po zakończeniu; przejście do instrukcji i powrót nie przerywa gry.
> - **Gra nie została zakończona** → zamknięto panel sterowania bez zakończenia gry → kończyć grę przyciskiem na ekranie końcowym.
> - **Opóźnienia planszy lub dźwięku w trybie testowym** → wszystkie ekrany w jednej karcie i częste przełączanie kart → tryb testowy służy do próby; do prawdziwej gry używać osobnych urządzeń.
> - **Gra czeka na dźwięk z Wyświetlacza** → na Wyświetlaczu trzeba kliknąć przycisk dźwięku po każdym jego otwarciu i gdy przeglądarka sama wyciszy stronę (np. uśpiony telewizor) → kliknąć przycisk dźwięku przed startem, nie przeładowywać Wyświetlacza w trakcie gry.

#### 19.5 Problemy z urządzeniami

Opisać diagnostykę braku połączenia, obrazu lub dźwięku na Wyświetlaczu, ekranie prowadzącego i przyciskach.

> **Do rozpisania (źródło: obserwacje rzeczywistych rozgrywek; w treści podręcznika bez wzmianek o tym źródle):**
> - **Gra wstrzymuje się co jakiś czas, urządzenie pokazuje się jako rozłączone** → telefon z przyciskami albo tablet prowadzącego zgasł lub przełączono na inną aplikację → ekran włączony przez całą grę, urządzenie na ładowarce, dłuższy czas automatycznej blokady ekranu, bez przełączania aplikacji; gdy używane są przyciski fizyczne albo nie ma tabletu prowadzącego — zaznaczyć odpowiednią opcję w panelu. Po powrocie do strony urządzenie łączy się samo w kilka sekund.
> - **Kod QR zeskanowany kilka razy** → na tym samym telefonie najnowsza karta działa od razu, a starsze pokazują komunikat oczekiwania → wracać do tej samej karty zamiast skanować ponownie; zbędne karty zamknąć.
> - **Komunikat o oczekiwaniu na zwolnienie urządzenia** → to samo urządzenie (przyciski, ekran prowadzącego lub Wyświetlacz) jest otwarte na innym telefonie albo w innej przeglądarce → zamknąć tamtą kartę albo poczekać kilkanaście sekund, aż się rozłączy.

#### 19.6 Kontakt z pomocą

Wyjaśnić, gdzie znaleźć formularz kontaktowy oraz jakie informacje podać, by ułatwić rozpoznanie problemu, na przykład opis czynności, oczekiwany i uzyskany rezultat oraz komunikat błędu.

### 20. Słownik pojęć

Krótkie objaśnienia nazw używanych w serwisie i teleturnieju. Hasła układać alfabetycznie w grupach i dodawać odnośniki do rozdziałów z pełniejszym opisem. Słownik ma pomagać szybko znaleźć znaczenie terminu, bez powtarzania instrukcji.

#### 20.1 Pojęcia teleturniejowe

Wyjaśnić między innymi pojęcia takie jak bank punktów, mnożnik, próg i przejęcie punktów.

#### 20.2 Pojęcia związane z ankietami i współpracą

Wyjaśnić między innymi pojęcia takie jak znajomy, subskrybent, zaproszenie i zadanie.

#### 20.3 Pojęcia związane z grą i urządzeniami

Wyjaśnić między innymi pojęcia takie jak baza pytań, logo, Wyświetlacz, ekran prowadzącego i przyciski.

## Założenia wdrożenia podręcznika

### Mapa pomocy kontekstowej

Przygotować mapę powiązań między stronami i widokami serwisu a konkretnymi rozdziałami lub podrozdziałami manuala. Z odpowiednich stron i widoków użytkownik ma móc przejść bezpośrednio do instrukcji dotyczącej wykonywanej czynności, najlepiej do właściwego punktu, a nie tylko na początek podręcznika. Mapę utrzymywać razem ze strukturą manuala, aby można ją było aktualizować po zmianie stron, widoków lub numeracji rozdziałów.

### Oznaczenia elementów interfejsu w treści

- Nazwy przycisków przytaczane w instrukcjach przedstawiać w formie stylizowanej na przyciski serwisu, z odpowiadającą im etykietą i ikoną, jeśli dany przycisk ma ikonę.
- Nazwy stron i widoków wyróżniać odrębnym, konsekwentnym stylem; tam, gdzie pomaga to w nawigacji, łączyć je z odnośnikiem do właściwego miejsca w podręczniku lub serwisie.
- Odnośniki do rozdziałów i podrozdziałów oznaczać własnym, spójnym stylem, odróżniającym je od nazw przycisków i widoków.

### Dostępność podręcznika

Udostępnić podręcznik publicznie wszystkim użytkownikom. Po uruchomieniu manuala można zastąpić FAQ na stronie głównej odnośnikiem do podręcznika; sam rozdział FAQ pozostawić tylko wtedy, gdy pojawią się powtarzające się pytania użytkowników.

## Decyzje wdrożeniowe (2026-10-21, E13.4)

- **Karty podręcznika** (`?tab=`): `rules` (rozdz. 1–4), `account` (5), `games` (6–7), `logo` (8),
  `bases` (9, 12), `people` (10, 11, 14), `community` (13), `polls` (15), `settings` (16),
  `control` (17), `help` (19–20). Rozdział 18 (FAQ) pominięty — warunkowy.
- **Kotwice**: rozdział `#r<N>`, podrozdział `#r<N>-<M>` (np. `#r7-6`); `#hash` to tylko kotwica
  w karcie — kartę wybiera `?tab=`, a odnośnik wewnątrz podręcznika sam przełącza kartę.
- **Pomoc kontekstowa**: `manual` w `nav-map.js` ma postać `karta#kotwica` (np. `games#r6`);
  przycisk „?” prowadzi do `/manual/?tab=games#r6`.
- **Spis treści** każdej karty budowany z nagłówków rozdziałów i podrozdziałów.
- **Oznaczenia**: przycisk `span.m-btn` (z ikoną aplikacji, jeśli ją ma), strona/widok `span.m-page`,
  odnośnik do rozdziału `a.m-ref`, wartość/plik `span.m-code`, klawisz `kbd.m-kbd`.
  Zgadywanie przycisków po liście etykiet (`controls.js`) usunięte.

## Następny etap pracy

Zakres rozdziałów został omówiony. Przed rozpoczęciem pisania treści należy jeszcze sprawdzić funkcje i ograniczenia w aktualnej wersji serwisu oraz potwierdzić zgodność zasad teleturnieju z regulaminem. Następnie można opracowywać rozdziały po kolei. Rozdział 18 jest warunkowy i może zostać pominięty, jeśli nie pojawią się powtarzające się pytania użytkowników.

## Do sprawdzenia przez użytkownika (E13.4, 2026-10-21)

- **Nagroda w finale:** regulamin TVP (wg planu) mnoży wygraną ×3 tylko przy nieosiągniętym celu;
  serwis (`endScreen.js`) zawsze mnoży sumę rund i finału, a po osiągnięciu celu dodaje kwotę główną.
  Podręcznik opisuje oba sposoby osobno (rozdz. 4.4) — czy serwis ma pozostać tak, jak jest?
- Regulamin TVP nie był dostępny przez sieć agenta (PDF z s.tvp.pl zablokowany) — rozdz. 1–4 oparte
  na faktach z planu; szczegóły pojedynku (kto pierwszy naciska) opisane ogólnie.
- **Zmiana typu (7.8):** okno pokazuje jednozdaniowy skutek dla typu, bez podsumowania, które
  pytania/odpowiedzi/punkty zostaną; bieżącego typu nie da się wybrać. Podręcznik opisuje stan kodu.
- **Wysyłanie gry znajomemu:** kod pozwala wysłać tylko szkic (blokuje też otwartą/zatrzymaną ankietę).
- **„Eksportuj do bazy”** przy otwartej/zatrzymanej ankiecie nie pyta o potwierdzenie (eksport do pliku
  i powielanie pytają) — do decyzji, czy ujednolicić.
- **Eksplorator baz (dla sesji ujednolicającej Eksplorator):** osoba „Tylko podgląd” nie utworzy gry
  z bazy (przycisk „Utwórz grę” aktywny, ale nic nie robi); Ctrl+Shift+N tworzy pytanie zamiast folderu
  (warunek Ctrl+N przed Ctrl+Shift+N w `actions.js`); Delete w polu wyszukiwania może usuwać
  zaznaczenie; „Utwórz grę…” w menu wyłączone w wynikach wyszukiwania/tagu, a na pasku i Ctrl+G działa.
  Podręcznik pomija te skróty i opisuje obecne działanie.

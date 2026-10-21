// Wygenerowane przez scripts/manual/build-content.mjs z docs/podrecznik — nie edytować ręcznie.
const manual = {
 "parts": [
  {
   "title": "Część I — Zasady teleturnieju",
   "chapters": [
    "1",
    "2",
    "3",
    "4"
   ],
   "intro": "<p class=\"m-p\">Opis na podstawie <a href=\"https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf\" target=\"_blank\" rel=\"noopener\">Regulaminu teleturnieju „FAMILIADA”</a> (Telewizja Polska S.A.).</p>"
  },
  {
   "title": "Część II — Obsługa serwisu",
   "chapters": [
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17"
   ],
   "intro": ""
  },
  {
   "title": "Część III — Informacje dodatkowe",
   "chapters": [
    "19",
    "20"
   ],
   "intro": ""
  }
 ],
 "chapters": [
  {
   "id": "1",
   "title": "Czym jest Familiada?",
   "sections": [],
   "html": "<p class=\"m-p\">Familiada to teleturniej, w którym dwie rodziny zgadują najpopularniejsze odpowiedzi na pytania zadane wcześniej w ankiecie. Nie chodzi o wiedzę, lecz o wyczucie, co odpowiedziałaby większość ludzi: na pytanie „Wymień coś koloru żółtego” najlepiej punktowany jest banan, bo tak odpowiedziało najwięcej ankietowanych.</p>\n<p class=\"m-p\">Rodziny stoją naprzeciwko siebie, a między nimi — prowadzący. Każda rodzina ma swoją „głowę”, która zaczyna rozgrywkę. W kolejnych rundach drużyny odkrywają odpowiedzi ukryte na tablicy i zbierają punkty. Pomyłki oznaczają się na tablicy znakiem X, a po trzech pomyłkach szansę dostaje przeciwnik. W kolejnych rundach punkty mają większą wartość.</p>\n<p class=\"m-p\">Gra trwa, dopóki jedna z rodzin nie zdobędzie łącznie 300 punktów. Zwycięska rodzina wybiera dwóch finalistów, którzy w krótkim czasie odpowiadają na pięć pytań. Jeśli razem zdobędą co najmniej 200 punktów, rodzina wygrywa nagrodę główną.</p>"
  },
  {
   "id": "2",
   "title": "Pytania ankietowe i odpowiedzi",
   "sections": [
    {
     "id": "2.1",
     "title": "Skąd biorą się odpowiedzi",
     "level": 2
    },
    {
     "id": "2.2",
     "title": "Jak czytać tablicę",
     "level": 2
    },
    {
     "id": "2.3",
     "title": "Co oznacza odpowiedź pasująca do tablicy",
     "level": 2
    },
    {
     "id": "2.4",
     "title": "Jak serwis wykorzystuje wyniki ankiety",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-2-1\"><span class=\"m-num\">2.1</span> Skąd biorą się odpowiedzi</h2>\n<p class=\"m-p\">Pytania zadaje się wcześniej ankietowanym — osobom w różnym wieku i z różnych środowisk, tak aby wyniki nie zależały od jednej grupy. W teleturnieju zgaduje się więc nie „prawidłową” odpowiedź, lecz to, co ludzie odpowiadali najczęściej. Familiada nie jest quizem z jedną obiektywnie poprawną odpowiedzią.</p>\n<h2 class=\"m-h2\" id=\"s-2-2\"><span class=\"m-num\">2.2</span> Jak czytać tablicę</h2>\n<p class=\"m-p\">W teleturnieju każde pytanie zadaje się <strong>100 ankietowanym</strong>. Punkty przy odpowiedzi to <strong>liczba osób</strong>, które jej udzieliły, a odpowiedzi są ułożone od najpopularniejszej.</p>\n<p class=\"m-p\">Rzadkie odpowiedzi nie trafiają na tablicę. Przykład z regulaminu — „Wymień coś koloru żółtego”: banan 29 osób, cytryna 19, żonkil 15. Odpowiedzi takie jak czapka (3 osoby), wełna (2) czy pasy na drodze (1) zostały pominięte. Dlatego suma punktów na tablicy zwykle jest mniejsza niż 100.</p>\n<p class=\"m-p\">Do teleturnieju wybiera się pytania, na które powtarzało się od 3 do 8 odpowiedzi; pytania z bardzo rozproszonymi odpowiedziami odpadają.</p>\n<h2 class=\"m-h2\" id=\"s-2-3\"><span class=\"m-num\">2.3</span> Co oznacza odpowiedź pasująca do tablicy</h2>\n<p class=\"m-p\">Drużyna próbuje odgadnąć odpowiedzi z tablicy. Odpowiedź, która jest na tablicy, zostaje odkryta, a jej punkty trafiają do puli rundy. Odpowiedź spoza tablicy jest pomyłką. Jak przebiega to w rundzie → <a class=\"m-ref\" href=\"?ch=3\">3</a>.</p>\n<h2 class=\"m-h2\" id=\"s-2-4\"><span class=\"m-num\">2.4</span> Jak serwis wykorzystuje wyniki ankiety</h2>\n<p class=\"m-p\">Serwis może zebrać odpowiedzi w Twojej własnej ankiecie (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>) i zamienić je na tablicę w taki sam sposób:</p>\n<ul class=\"m-ul\"><li><strong>Liczba głosujących jest dowolna</strong> — może być mniej niż 100 osób albo kilkaset. Do podliczenia potrzeba co najmniej 10 osób, które odpowiedziały na wszystkie pytania (pełnych ankiet).</li><li><strong>Punkty to procent pełnych ankiet</strong>, zaokrąglony w dół. Jeśli na 50 osób 20 podało tę samą odpowiedź, dostaje ona 40 punktów — tak jakby ankietowanych było 100.</li><li><strong>Odpowiedź trafia na tablicę od 4 punktów.</strong> Rzadsze odpowiedzi są pomijane, podobnie jak w teleturnieju.</li><li><strong>Na tablicy mieści się najwyżej 6 odpowiedzi</strong> — tyle wierszy ma Wyświetlacz. Jeśli kwalifikuje się więcej, zostaje sześć najpopularniejszych. To ograniczenie ekranu, nie zasada teleturnieju.</li><li>Aby zamknąć ankietę, każde pytanie musi mieć <strong>co najmniej 3</strong> takie odpowiedzi.</li></ul>\n<p class=\"m-p\">W ankiecie tekstowej serwis najpierw łączy identyczne odpowiedzi, a Ty możesz scalić podobne (np. „banan” i „banany”) i poprawić literówki. Dopiero potem liczy punkty, odrzuca odpowiedzi poniżej 4 punktów i wybiera sześć najlepszych (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</p>"
  },
  {
   "id": "3",
   "title": "Przebieg rundy i pojedynek",
   "sections": [
    {
     "id": "3.1",
     "title": "Układ rund",
     "level": 2
    },
    {
     "id": "3.2",
     "title": "Punktacja i mnożnik rundy",
     "level": 2
    },
    {
     "id": "3.3",
     "title": "Pojedynek na początku rundy",
     "level": 2
    },
    {
     "id": "3.4",
     "title": "Odpowiadanie przez drużynę",
     "level": 2
    },
    {
     "id": "3.5",
     "title": "Błędy i przejęcie punktów",
     "level": 2
    },
    {
     "id": "3.6",
     "title": "Zakończenie rundy i sprawdzenie progu",
     "level": 2
    },
    {
     "id": "3.7",
     "title": "Odwzorowanie w serwisie",
     "level": 2
    }
   ],
   "html": "<p class=\"m-p\">Serwis odwzorowuje kolejność i mechanikę rund z teleturnieju. Różnice opisano przy właściwych punktach.</p>\n<h2 class=\"m-h2\" id=\"s-3-1\"><span class=\"m-num\">3.1</span> Układ rund</h2>\n<p class=\"m-p\">Rundy rozgrywa się jedna po drugiej, aż któraś rodzina zdobędzie łącznie <strong>300 punktów</strong>. Zwykle wystarczają trzy rundy, ale gra trwa dalej, jeśli nikt nie osiągnął progu.</p>\n<p class=\"m-p\"><strong>W serwisie:</strong> próg ustawiasz sam (domyślnie 300 → <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). Liczba rund nie jest stała — zależy od tego, kiedy któraś drużyna osiągnie próg, i od liczby przygotowanych pytań.</p>\n<h2 class=\"m-h2\" id=\"s-3-2\"><span class=\"m-num\">3.2</span> Punktacja i mnożnik rundy</h2>\n<p class=\"m-p\">Mnożnik rundy mówi, ile razy liczą się punkty zdobyte w danej rundzie. W teleturnieju pierwsze trzy rundy są zwykłe, w czwartej punkty są podwojone, a od piątej — potrojone.</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Runda</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5 i dalej</th></tr></thead><tbody><tr><td>Mnożnik</td><td>×1</td><td>×1</td><td>×1</td><td>×2</td><td>×3</td></tr><tr><td>Pula 60 pkt daje</td><td>60</td><td>60</td><td>60</td><td>120</td><td>180</td></tr></tbody></table></div>\n<p class=\"m-p\"><strong>W serwisie:</strong> to są ustawienia domyślne. Możesz ustawić własne mnożniki kolejnych rund; ostatni mnożnik obowiązuje we wszystkich dalszych rundach (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>).</p>\n<h2 class=\"m-h2\" id=\"s-3-3\"><span class=\"m-num\">3.3</span> Pojedynek na początku rundy</h2>\n<ol class=\"m-ol\"><li>Do pulpitu podchodzi po jednej osobie z każdej drużyny (w pierwszej rundzie — „głowy” rodzin, potem kolejni członkowie).</li><li>Prowadzący czyta pytanie. Kto pierwszy naciśnie przycisk, odpowiada pierwszy.</li><li>Jeśli to najwyżej punktowana odpowiedź — jego drużyna wygrywa pojedynek.</li><li>W przeciwnym razie odpowiada druga osoba. Wygrywa ta, której odpowiedź jest wyżej na tablicy.</li><li>Jeśli obie odpowiedzi są spoza tablicy, odpowiadają kolejne osoby z obu drużyn.</li></ol>\n<p class=\"m-p\">Drużyna, która wygrała pojedynek, gra dalej pytanie. Według regulaminu może też zrezygnować i oddać pytanie przeciwnikom.</p>\n<p class=\"m-p\"><strong>W serwisie:</strong> sygnał z przycisku pokazuje, kto był pierwszy; operator zatwierdza wynik pojedynku (→ <a class=\"m-ref\" href=\"?ch=17#s-17-3\">17.3</a>). Oddanie pytania jest możliwe raz w rundzie, przed pierwszą odkrytą odpowiedzią.</p>\n<h2 class=\"m-h2\" id=\"s-3-4\"><span class=\"m-num\">3.4</span> Odpowiadanie przez drużynę</h2>\n<p class=\"m-p\">Po pojedynku odpowiadają po kolei członkowie grającej drużyny. Każda trafiona odpowiedź zostaje odkryta, a jej punkty trafiają do puli rundy (na tablicy — „bank”). Grająca drużyna nie może się naradzać.</p>\n<h2 class=\"m-h2\" id=\"s-3-5\"><span class=\"m-num\">3.5</span> Błędy i przejęcie punktów</h2>\n<ul class=\"m-ul\"><li>Odpowiedź spoza tablicy to <strong>błąd</strong> — na tablicy pojawia się X i słychać brzęczek.</li><li>Na odpowiedź są <strong>3 sekundy</strong>. Limit utrzymuje tempo gry: brak odpowiedzi w czasie też jest błędem. Prowadzący sygnalizuje koniec czasu, a na tablicy pojawia się X.</li><li>Po <strong>trzech błędach</strong>, zanim odkryto wszystkie odpowiedzi, pytanie przechodzi do przeciwników. Mogą się oni naradzać już od drugiego błędu grających.</li><li>„Głowa” drużyny przeciwnej udziela <strong>jednej</strong> odpowiedzi. Jeśli jest na tablicy, cała pula rundy przechodzi do jej drużyny. Jeśli nie — pula zostaje u drużyny grającej.</li></ul>\n<p class=\"m-p\"><strong>W serwisie:</strong> przejęcie punktów nazywa się <strong>kradzieżą</strong>. Trzysekundowe odliczanie operator włącza wtedy, gdy odpowiedź się przeciąga; po upływie czasu serwis sam dodaje X (→ <a class=\"m-ref\" href=\"?ch=17#s-17-3\">17.3</a>).</p>\n<h2 class=\"m-h2\" id=\"s-3-6\"><span class=\"m-num\">3.6</span> Zakończenie rundy i sprawdzenie progu</h2>\n<p class=\"m-p\">Runda kończy się, gdy drużyna odkryje wszystkie odpowiedzi albo po próbie przejęcia. Pula rundy, pomnożona przez mnożnik rundy, trafia do drużyny, która ją wygrała. Następnie sprawdza się próg: jeśli któraś drużyna ma łącznie 300 punktów lub więcej, przechodzi do finału. Próg dotyczy łącznego wyniku drużyny, a nie liczby odpowiedzi ani mnożnika.</p>\n<h2 class=\"m-h2\" id=\"s-3-7\"><span class=\"m-num\">3.7</span> Odwzorowanie w serwisie</h2>\n<p class=\"m-p\">Serwis sprawdza próg po rozliczeniu każdej rundy. Gdy któraś drużyna go osiągnie:</p>\n<ul class=\"m-ul\"><li>przechodzi do <strong>finału</strong>, jeśli finał jest włączony (→ <a class=\"m-ref\" href=\"?ch=16#s-16-5-1\">16.5.1</a>),</li><li>albo gra się <strong>kończy</strong>, jeśli finał jest wyłączony — ekran końcowy pokazuje wynik z rund.</li></ul>\n<p class=\"m-p\">Gra kończy się bez finału także wtedy, gdy <strong>zabraknie pytań</strong>, zanim któraś drużyna osiągnie próg.</p>\n<p class=\"m-p\">Jak panel sterowania prowadzi operatora przez te etapy → <a class=\"m-ref\" href=\"?ch=17\">17</a>.</p>"
  },
  {
   "id": "4",
   "title": "Finał teleturnieju",
   "sections": [
    {
     "id": "4.1",
     "title": "Przebieg finału",
     "level": 2
    },
    {
     "id": "4.2",
     "title": "Punktowanie",
     "level": 2
    },
    {
     "id": "4.3",
     "title": "Cel punktowy finału",
     "level": 2
    },
    {
     "id": "4.4",
     "title": "Nagroda główna i rozliczenie wyniku",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-4-1\"><span class=\"m-num\">4.1</span> Przebieg finału</h2>\n<ol class=\"m-ol\"><li>„Głowa” zwycięskiej rodziny wskazuje <strong>dwóch finalistów</strong>.</li><li>Drugi finalista schodzi ze sceny i dostaje słuchawki z muzyką, aby nie słyszeć ani nie widzieć odpowiedzi pierwszego.</li><li><strong>Pierwszy finalista</strong> odpowiada na <strong>5 pytań</strong> w <strong>15 sekund</strong>. Może pominąć pytanie i wrócić do niego, jeśli zostanie czas.</li><li>Odpowiedzi pojawiają się na tablicy z punktami z ankiety; odpowiedź spoza tablicy daje 0 punktów. Potem odpowiedzi pierwszego finalisty znikają z tablicy.</li><li><strong>Drugi finalista</strong> wraca, prowadzący mówi mu, ile punktów zdobył partner, i czyta te same pięć pytań. Ma <strong>20 sekund</strong>, bo ta część jest trudniejsza.</li><li>Drugi finalista <strong>nie może powtórzyć</strong> odpowiedzi pierwszego — przy powtórzeniu słychać brzęczek i musi podać inną.</li><li>Odpowiedzi i punkty drugiego finalisty odsłania się obok odpowiedzi pierwszego.</li></ol>\n<h2 class=\"m-h2\" id=\"s-4-2\"><span class=\"m-num\">4.2</span> Punktowanie</h2>\n<p class=\"m-p\">Punkty obu finalistów się sumują. W finale <strong>nie ma mnożnika</strong> — liczą się punkty z ankiety.</p>\n<p class=\"m-p\"><strong>W serwisie:</strong> tak samo — punkty finałowe zawsze liczą się pojedynczo.</p>\n<h2 class=\"m-h2\" id=\"s-4-3\"><span class=\"m-num\">4.3</span> Cel punktowy finału</h2>\n<p class=\"m-p\">Celem finalistów jest razem <strong>co najmniej 200 punktów</strong>.</p>\n<p class=\"m-p\"><strong>W serwisie:</strong> cel ustawiasz sam (domyślnie 200 → <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). Gdy finaliści go osiągną, operator może zakończyć finał od razu, bez odsłaniania pozostałych pytań (→ <a class=\"m-ref\" href=\"?ch=17#s-17-4\">17.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-4-4\"><span class=\"m-num\">4.4</span> Nagroda główna i rozliczenie wyniku</h2>\n<ul class=\"m-ul\"><li>Jeśli finaliści zdobędą 200 punktów lub więcej, rodzina wygrywa <strong>nagrodę główną — 25 000 zł</strong>, dodaną do pieniędzy wygranych wcześniej.</li><li>Jeśli nie — rodzina dostaje pieniądze zebrane w grze: <strong>liczbę punktów mnożoną przez 3</strong>.</li></ul>\n<p class=\"m-p\"><strong>W serwisie:</strong> ekran końcowy może pokazać logo, punkty albo kwotę nagrody (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). Kwotę nagrody głównej i mnożnik ustawiasz sam (domyślnie 25 000 i ×3). Serwis mnoży przez ten mnożnik punkty z rund razem z punktami z finału, a po osiągnięciu celu dodaje nagrodę główną.</p>"
  },
  {
   "id": "5",
   "title": "Konto użytkownika",
   "sections": [
    {
     "id": "5.1",
     "title": "Sposoby korzystania z serwisu",
     "level": 2
    },
    {
     "id": "5.2",
     "title": "Rejestracja i potwierdzenie adresu e-mail",
     "level": 2
    },
    {
     "id": "5.3",
     "title": "Logowanie i wylogowanie",
     "level": 2
    },
    {
     "id": "5.4",
     "title": "Konto gościa i zapisanie danych",
     "level": 2
    },
    {
     "id": "5.5",
     "title": "Nazwa użytkownika i profil",
     "level": 2
    },
    {
     "id": "5.6",
     "title": "Zmiana adresu e-mail i hasła",
     "level": 2
    },
    {
     "id": "5.7",
     "title": "Odzyskiwanie dostępu i zabezpieczenia",
     "level": 2
    },
    {
     "id": "5.8",
     "title": "Pozostałe ustawienia konta",
     "level": 2
    },
    {
     "id": "5.9",
     "title": "Usunięcie konta",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-5-1\"><span class=\"m-num\">5.1</span> Sposoby korzystania z serwisu</h2>\n<p class=\"m-p\">Z serwisu można korzystać na dwa sposoby:</p>\n<ul class=\"m-ul\"><li><strong>z kontem</strong> — zakładasz je adresem e-mail i hasłem. Masz dostęp do wszystkich funkcji i możesz zalogować się na dowolnym urządzeniu;</li><li><strong>jako gość</strong> — bez rejestracji, jednym kliknięciem. Możesz tworzyć gry, ankiety, bazy pytań i logo oraz prowadzić rozgrywkę, ale dane są dostępne tylko w tej przeglądarce (→ <a class=\"m-ref\" href=\"?ch=5#s-5-4\">5.4</a>).</li></ul>\n<p class=\"m-p\">Na stronie <span class=\"m-page\">Logowanie</span> są przyciski <span class=\"m-control\"><i data-icon=\"arrow-right\"></i>Zaloguj</span>, <span class=\"m-control\"><i data-icon=\"plus\"></i>Załóż konto</span>, <span class=\"m-control\"><i data-icon=\"person\"></i>Wejdź jako gość</span> i <span class=\"m-control\"><i data-icon=\"envelope\"></i>Przypomnij hasło</span>.</p>\n<p class=\"m-p\">Konto jest potrzebne do współpracy z innymi osobami. Tylko z kontem możesz:</p>\n<ul class=\"m-ul\"><li>mieć znajomych i subskrybentów oraz otrzymywać zadania (→ <a class=\"m-ref\" href=\"?ch=10\">10</a>, <a class=\"m-ref\" href=\"?ch=14\">14</a>, <a class=\"m-ref\" href=\"?ch=15#s-15-4\">15.4</a>),</li><li>powielać gry i logo oraz wysyłać ich kopie znajomym (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>, <a class=\"m-ref\" href=\"?ch=11\">11</a>),</li><li>udostępniać bazy pytań (→ <a class=\"m-ref\" href=\"?ch=12\">12</a>),</li><li>wysyłać zaproszenia do ankiety (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>),</li><li>udostępniać urządzenia do rozgrywki (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>),</li><li>zgłaszać i oceniać Gry Społeczności (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li></ul>\n<p class=\"m-p\">Gdy jako gość otworzysz stronę dostępną tylko dla kont, zobaczysz komunikat „Niedostępne w koncie gościa”.</p>\n<h2 class=\"m-h2\" id=\"s-5-2\"><span class=\"m-num\">5.2</span> Rejestracja i potwierdzenie adresu e-mail</h2>\n<ol class=\"m-ol\"><li>Na stronie <span class=\"m-page\">Logowanie</span> wybierz <span class=\"m-control\"><i data-icon=\"plus\"></i>Załóż konto</span>.</li><li>Wpisz adres e-mail, hasło i powtórz hasło (wymagania hasła → <a class=\"m-ref\" href=\"?ch=5#s-5-6\">5.6</a>).</li><li>Zatwierdź. Na podany adres przyjdzie wiadomość „FAMILIADA — Potwierdzenie konta”.</li><li>Kliknij w niej <span class=\"m-control\">POTWIERDŹ KONTO</span>. Zobaczysz „Gotowe! Konto potwierdzone.” i przejdziesz do <span class=\"m-page\">Moich gier</span>.</li></ol>\n<p class=\"m-p\">Dopóki nie potwierdzisz adresu, nie zalogujesz się — serwis przypomni: „Potwierdź e-mail (link w skrzynce)”.</p>\n<p class=\"m-p\">Nazwa użytkownika powstaje automatycznie z adresu e-mail; możesz ją zmienić później (→ <a class=\"m-ref\" href=\"?ch=5#s-5-5\">5.5</a>).</p>\n<p class=\"m-p\"><strong>Typowe sytuacje:</strong></p>\n<ul class=\"m-ul\"><li><span class=\"m-page\">Nie ma wiadomości</span> — zajrzyj do folderu spam. Jeśli spróbujesz założyć konto ponownie, serwis zaproponuje <span class=\"m-control\"><i data-icon=\"refresh\"></i>Wyślij ponownie</span>. Ponowna wysyłka jest możliwa raz na godzinę.</li><li><span class=\"m-page\">Adres jest już zarejestrowany</span> — serwis wyświetli „Konto już istnieje. Przełączam na logowanie.” Zaloguj się albo odzyskaj hasło (→ <a class=\"m-ref\" href=\"?ch=5#s-5-7\">5.7</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-5-3\"><span class=\"m-num\">5.3</span> Logowanie i wylogowanie</h2>\n<p class=\"m-p\">Na stronie <span class=\"m-page\">Logowanie</span> wpisz <strong>adres e-mail albo nazwę użytkownika</strong> (wielkość liter nie ma znaczenia) oraz hasło i wybierz <span class=\"m-control\"><i data-icon=\"arrow-right\"></i>Zaloguj</span>. Po zalogowaniu przejdziesz do <span class=\"m-page\">Moich gier</span>.</p>\n<p class=\"m-p\">Pozostajesz zalogowany w tej przeglądarce, dopóki się nie wylogujesz. Aby się wylogować, kliknij swoją nazwę w prawym górnym rogu i wybierz <span class=\"m-control\"><i data-icon=\"close\"></i>Wyloguj</span>.</p>\n<p class=\"m-p\">Jeśli otworzysz link z wiadomości (na przykład do zadania, zaproszenia do znajomych albo udostępnionej bazy), a nie jesteś zalogowany, po zalogowaniu wrócisz do tego miejsca.</p>\n<div class=\"m-note\"><p class=\"m-p\">Uwaga: jeśli w tej przeglądarce korzystasz z konta gościa, zalogowanie na inne konto usunie dane gościa. Serwis zapyta o to w oknie „Aktywna sesja gościa”. Aby zachować dane, najpierw zapisz konto gościa jako zwykłe konto (→ <a class=\"m-ref\" href=\"?ch=5#s-5-4\">5.4</a>).</p></div>\n<h2 class=\"m-h2\" id=\"s-5-4\"><span class=\"m-num\">5.4</span> Konto gościa i zapisanie danych</h2>\n<p class=\"m-p\">Wybierz <span class=\"m-control\"><i data-icon=\"person\"></i>Wejdź jako gość</span> na stronie <span class=\"m-page\">Logowanie</span>. Konto gościa:</p>\n<ul class=\"m-ul\"><li>działa tylko w tej przeglądarce — na innym urządzeniu go nie otworzysz,</li><li>jest usuwane po <strong>5 dniach bez korzystania z serwisu</strong>; każda wizyta liczy czas od nowa,</li><li>nie ma funkcji współpracy wymienionych w 5.1.</li></ul>\n<p class=\"m-p\">Serwis co jakiś czas przypomina, że konto gościa zostanie usunięte, i proponuje <span class=\"m-control\">Migruj teraz</span>.</p>\n<p class=\"m-p\"><strong>Jak zachować dane gościa</strong> — zamień konto gościa na zwykłe konto. Gry, bazy pytań, logo i inne pliki zostaną zachowane.</p>\n<ol class=\"m-ol\"><li>Otwórz <span class=\"m-page\">Ustawienia konta</span> (kliknij swoją nazwę w prawym górnym rogu) i znajdź sekcję „Zapisz swoje dane”. Możesz też wybrać <span class=\"m-control\"><i data-icon=\"plus\"></i>Załóż konto</span> na stronie <span class=\"m-page\">Logowanie</span> i potwierdzić <span class=\"m-control\">Tak, przenieś dane</span>.</li><li>Wpisz adres e-mail, hasło i — opcjonalnie — nazwę użytkownika, a następnie wybierz <span class=\"m-control\"><i data-icon=\"restore\"></i>Migruj konto</span>.</li><li>Kliknij link w wiadomości „FAMILIADA — Potwierdź migrację”. Od tej chwili korzystasz ze zwykłego konta.</li></ol>\n<p class=\"m-p\">Do czasu kliknięcia linku nadal korzystasz z konta gościa. Wiadomość można wysłać ponownie raz na godzinę.</p>\n<h2 class=\"m-h2\" id=\"s-5-5\"><span class=\"m-num\">5.5</span> Nazwa użytkownika i profil</h2>\n<p class=\"m-p\">Nazwa użytkownika jest widoczna w prawym górnym rogu, a także dla znajomych i subskrybentów — na przykład w zaproszeniach i przy wysłanych kopiach. Możesz jej też używać do logowania.</p>\n<p class=\"m-p\">Wymagania:</p>\n<ul class=\"m-ul\"><li>od 3 do 20 znaków,</li><li>tylko litery, cyfry oraz znaki <code class=\"m-code\">_</code> <code class=\"m-code\">.</code> <code class=\"m-code\">-</code>,</li><li>nazwa nie może być zajęta przez inną osobę; niektóre nazwy są zarezerwowane (na przykład zaczynające się od „admin” lub „familiada”).</li></ul>\n<p class=\"m-p\">Aby zmienić nazwę, otwórz <span class=\"m-page\">Ustawienia konta</span>, w sekcji „Nazwa użytkownika” wpisz nową i wybierz <span class=\"m-control\"><i data-icon=\"save\"></i>Zapisz nazwę</span>. Nazwę można zmieniać raz na godzinę.</p>\n<p class=\"m-p\">Jeśli Twoje konto nie ma jeszcze stałej nazwy (na przykład po zapisaniu konta gościa bez nazwy), przy logowaniu zobaczysz ekran „Pierwsze logowanie” z prośbą o jej ustawienie.</p>\n<h2 class=\"m-h2\" id=\"s-5-6\"><span class=\"m-num\">5.6</span> Zmiana adresu e-mail i hasła</h2>\n<p class=\"m-p\"><strong>Adres e-mail.</strong> W <span class=\"m-page\">Ustawieniach konta</span>, w sekcji „E-mail”, wpisz nowy adres i wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Zmień e-mail</span>. Wiadomości z linkiem przyjdą <strong>na obecny i na nowy adres</strong> — potwierdź oba. Dzięki temu nikt nie przejmie konta, znając tylko jeden z adresów. Do czasu potwierdzenia logujesz się dotychczasowym adresem. Możesz też <span class=\"m-control\"><i data-icon=\"refresh\"></i>Wyślij ponownie</span> albo <span class=\"m-control\"><i data-icon=\"close\"></i>Anuluj zmianę</span>. Zmianę można rozpocząć raz na godzinę.</p>\n<p class=\"m-p\">Jeśli nie masz już dostępu do starego adresu, zmiana nie zostanie potwierdzona. Możesz wtedy wyeksportować gry, bazy i logo do plików, usunąć konto, założyć nowe i zaimportować pliki (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>).</p>\n<p class=\"m-p\"><strong>Hasło.</strong> W sekcji „Hasło” wpisz nowe hasło i wybierz <span class=\"m-control\"><i data-icon=\"save\"></i>Zmień hasło</span>. Hasło musi mieć:</p>\n<ul class=\"m-ul\"><li>co najmniej 8 znaków,</li><li>małą i wielką literę,</li><li>cyfrę,</li><li>znak specjalny (na przykład <code class=\"m-code\">!</code> lub <code class=\"m-code\">#</code>).</li></ul>\n<p class=\"m-p\">Nowe hasło musi różnić się od poprzedniego. Hasło można zmieniać raz na godzinę.</p>\n<h2 class=\"m-h2\" id=\"s-5-7\"><span class=\"m-num\">5.7</span> Odzyskiwanie dostępu i zabezpieczenia</h2>\n<p class=\"m-p\">Jeśli nie pamiętasz hasła:</p>\n<ol class=\"m-ol\"><li>Na stronie <span class=\"m-page\">Logowanie</span> wpisz adres e-mail albo nazwę użytkownika i wybierz <span class=\"m-control\"><i data-icon=\"envelope\"></i>Przypomnij hasło</span>.</li><li>Kliknij <span class=\"m-control\">USTAW NOWE HASŁO</span> w wiadomości „FAMILIADA — Reset hasła”.</li><li>Wpisz nowe hasło dwukrotnie i wybierz <span class=\"m-control\"><i data-icon=\"save\"></i>Zapisz hasło</span>. Wrócisz do logowania.</li></ol>\n<p class=\"m-p\">Kolejną wiadomość z linkiem możesz zamówić dopiero po godzinie — serwis pokaże, ile czasu zostało.</p>\n<p class=\"m-p\">Po kilku nieudanych próbach logowania serwis może poprosić o dodatkowe potwierdzenie „Potwierdź, że jesteś człowiekiem” — wybierz <span class=\"m-control\">Kontynuuj</span> i zaloguj się ponownie.</p>\n<h2 class=\"m-h2\" id=\"s-5-8\"><span class=\"m-num\">5.8</span> Pozostałe ustawienia konta</h2>\n<p class=\"m-p\">W <span class=\"m-page\">Ustawieniach konta</span> znajdziesz także:</p>\n<ul class=\"m-ul\"><li><strong>Wiadomości e-mail</strong> — przełącznik „Włącz powiadomienia e-mail”. Gdy jest wyłączony, nie dostaniesz wiadomości o zaproszeniach do znajomych, zadaniach, udostępnionych bazach i kopiach. Same zaproszenia i kopie nadal zobaczysz w serwisie.</li><li><strong>Twoja ocena systemu</strong> — podgląd oceny i komentarza, które wystawiłeś serwisowi.</li><li><strong>Materiały Demo</strong> — <span class=\"m-control\"><i data-icon=\"refresh\"></i>Przywróć pliki demo</span> dodaje przykładowe gry, bazy pytań i logo.</li></ul>\n<div class=\"m-note\"><p class=\"m-p\">Uwaga: przywrócenie zastępuje dotychczasowe materiały demo, także te, które zmieniłeś. Jeśli chcesz zachować zmiany, najpierw powiel taką grę, bazę lub logo.</p></div>\n<h2 class=\"m-h2\" id=\"s-5-9\"><span class=\"m-num\">5.9</span> Usunięcie konta</h2>\n<p class=\"m-p\">W <span class=\"m-page\">Ustawieniach konta</span>, w sekcji „Usuń konto”, wpisz swoje hasło i wybierz <span class=\"m-control\"><i data-icon=\"trash\"></i>Usuń konto i dane</span>. Konto gościa usuwa się bez hasła, po potwierdzeniu w oknie.</p>\n<div class=\"m-note\"><p class=\"m-p\">Uwaga: usunięcia nie da się cofnąć.</p></div>\n<p class=\"m-p\">Usuwane są:</p>\n<ul class=\"m-ul\"><li>Twoje gry (wraz z ankietami), bazy pytań i logo — także dostęp innych osób do Twoich baz,</li><li>Twój dostęp do baz udostępnionych przez innych,</li><li>znajomości, subskrypcje, zadania, zaproszenia i otrzymane kopie,</li><li>gry dodane z Gier Społeczności i Twoje oceny.</li></ul>\n<p class=\"m-p\">Zostają:</p>\n<ul class=\"m-ul\"><li>kopie gier i logo, które wcześniej wysłałeś innym — należą już do odbiorców,</li><li>Twoje odpowiedzi w cudzych ankietach — bez powiązania z Tobą,</li><li>gry, które opublikowałeś w Grach Społeczności — bez Twojej nazwy jako autora.</li></ul>\n<p class=\"m-p\">Jeśli chcesz zachować swoje materiały, przed usunięciem wyeksportuj je do plików (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>, <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>, <a class=\"m-ref\" href=\"?ch=9#s-9-1\">9.1</a>).</p>"
  },
  {
   "id": "6",
   "title": "Moje gry",
   "sections": [
    {
     "id": "6.1",
     "title": "Do czego służy strona „Moje gry”",
     "level": 2
    },
    {
     "id": "6.2",
     "title": "Lista gier i ich statusy",
     "level": 2
    },
    {
     "id": "6.3",
     "title": "Utworzenie i wybór gry",
     "level": 2
    },
    {
     "id": "6.4",
     "title": "Działania na wybranej grze",
     "level": 2
    },
    {
     "id": "6.5",
     "title": "Zmiana nazwy i usuwanie gry",
     "level": 2
    },
    {
     "id": "6.6",
     "title": "Powielanie i wysyłanie kopii gier",
     "level": 2
    },
    {
     "id": "6.7",
     "title": "Importowanie i eksportowanie",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-6-1\"><span class=\"m-num\">6.1</span> Do czego służy strona „Moje gry”</h2>\n<p class=\"m-p\"><span class=\"m-page\">Moje gry</span> to strona, na którą trafiasz po zalogowaniu i od której zaczyna się większość pracy. Z górnego paska przejdziesz stąd do pozostałych części serwisu: baz pytań, logo, znajomych, subskrybentów, zadań i podłączania urządzeń.</p>\n<p class=\"m-p\">Strona jest biblioteką Twoich gier, także kopii otrzymanych od znajomych. Gry są podzielone na zakładki:</p>\n<ul class=\"m-ul\"><li><strong>Ankieta tekstowa</strong>, <strong>Punktacja</strong>, <strong>Preparowana</strong> — gry danego rodzaju (→ <a class=\"m-ref\" href=\"?ch=7#s-7-1\">7.1</a>),</li><li><strong>Gry Społeczności</strong> — gry dodane z publicznego katalogu (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li></ul>\n<p class=\"m-p\">Na telefonie zakładki mają krótsze nazwy: „Tekst”, „Punkty”, „Prepar.” i „Społeczność”.</p>\n<h2 class=\"m-h2\" id=\"s-6-2\"><span class=\"m-num\">6.2</span> Lista gier i ich statusy</h2>\n<p class=\"m-p\">Każda gra to kafelek z nazwą i statusem:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Status</th><th>Co oznacza</th></tr></thead><tbody><tr><td>SZKIC</td><td>Gra w przygotowaniu. Możesz ją edytować.</td></tr><tr><td>OTWARTA</td><td>Trwa ankieta — głosujący mogą odpowiadać. Obok widać liczbę oddanych głosów.</td></tr><tr><td>ZATRZYMANA</td><td>Zbieranie odpowiedzi jest wstrzymane. Plakietka „do podliczenia” przypomina, że możesz podliczyć głosy (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</td></tr><tr><td>GOTOWA</td><td>Gra jest gotowa do rozegrania.</td></tr></tbody></table></div>\n<p class=\"m-p\">Gra preparowana nie ma ankiety, więc ma tylko status SZKIC albo GOTOWA — GOTOWA, gdy spełnia wszystkie warunki (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</p>\n<p class=\"m-p\">Pod nazwą gry serwis pokazuje, czego brakuje do następnego kroku, na przykład: „Gra musi mieć co najmniej 10 pytań (masz: 7).” albo „Pytanie #3: musi mieć 3–6 odpowiedzi (masz: 2).” Dzięki temu wiesz, co uzupełnić w edytorze.</p>\n<p class=\"m-p\">Kopia otrzymana od znajomego ma oznaczenie „Od: {nazwa}”.</p>\n<p class=\"m-p\">Nad listą możesz wybrać filtr: SZKIC, OTWARTA, ZATRZYMANA, GOTOWA albo „Otrzymano” (tylko kopie od znajomych). Lista odświeża się sama.</p>\n<h2 class=\"m-h2\" id=\"s-6-3\"><span class=\"m-num\">6.3</span> Utworzenie i wybór gry</h2>\n<ol class=\"m-ol\"><li>Wybierz zakładkę z rodzajem gry, który chcesz utworzyć (różnice → <a class=\"m-ref\" href=\"?ch=7#s-7-1\">7.1</a>).</li><li>Kliknij kafelek <span class=\"m-control\">+ Nowa gra</span>.</li><li>Wpisz nazwę (do 80 znaków) i wybierz <span class=\"m-control\"><i data-icon=\"save\"></i>Zapisz</span>.</li></ol>\n<p class=\"m-p\">Nowa gra pojawi się na liście jako szkic i zostanie od razu zaznaczona. Aby dodać pytania, wybierz <span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edytuj</span> (→ <a class=\"m-ref\" href=\"?ch=7#s-7-2\">7.2</a>).</p>\n<p class=\"m-p\">Kliknięcie kafelka zaznacza grę — dopiero wtedy włączają się przyciski działań.</p>\n<h2 class=\"m-h2\" id=\"s-6-4\"><span class=\"m-num\">6.4</span> Działania na wybranej grze</h2>\n<p class=\"m-p\">Po zaznaczeniu gry na górnym pasku są dostępne:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Przycisk</th><th>Co robi</th></tr></thead><tbody><tr><td><span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span></td><td>Otwiera <span class=\"m-page\">Panel sterowania</span> i rozpoczyna przygotowanie rozgrywki (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>).</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"settings\"></i>Ustawienia gry</span></td><td>Drużyny, wygląd, dźwięki, pytania i zasady rozgrywki (→ <a class=\"m-ref\" href=\"?ch=16\">16</a>).</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edytuj</span></td><td>Otwiera edytor pytań i odpowiedzi (→ <a class=\"m-ref\" href=\"?ch=7#s-7-2\">7.2</a>).</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"eye\"></i>Podgląd</span></td><td>Pokazuje pytania i odpowiedzi bez edycji. Przy grze z ankietą możesz przełączyć widok na wyniki ankiety.</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"polls\"></i>Ankieta</span></td><td>Otwiera ankietę tej gry (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>). Gra preparowana nie ma ankiety.</td></tr></tbody></table></div>\n<p class=\"m-p\">Na dolnym pasku: <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span>, <span class=\"m-control\"><i data-icon=\"change-type\"></i>Zmień typ</span>, <span class=\"m-control\"><i data-icon=\"download\"></i>Eksportuj do pliku</span>, <span class=\"m-control\"><i data-icon=\"drawer-export\"></i>Eksportuj do bazy</span>, <span class=\"m-control\"><i data-icon=\"upload\"></i>Importuj</span> i <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span>. Na telefonie te przyciski mają postać samych ikon.</p>\n<p class=\"m-p\">Dostępność przycisków zależy od rodzaju i stanu gry. Najedź na nieaktywny przycisk (albo przytrzymaj go na telefonie), aby zobaczyć powód. Najważniejsze zasady:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span> — gra preparowana musi być gotowa (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>), a gra z ankietą musi mieć zamkniętą ankietę.</li><li><span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edytuj</span> i <span class=\"m-control\"><i data-icon=\"change-type\"></i>Zmień typ</span> — niedostępne, gdy ankieta jest otwarta lub zatrzymana. Przy zamkniętej ankiecie serwis najpierw zapyta o jej wyzerowanie (→ <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>).</li><li><span class=\"m-control\"><i data-icon=\"polls\"></i>Ankieta</span> — aby ją uruchomić, gra musi mieć co najmniej 10 pytań; w grze „Punktacja” także od 3 do 6 odpowiedzi w każdym pytaniu.</li></ul>\n<p class=\"m-p\"><span class=\"m-control\"><i data-icon=\"change-type\"></i>Zmień typ</span> zmienia tę samą grę — nie tworzy kopii. Szczegóły → <a class=\"m-ref\" href=\"?ch=7#s-7-8\">7.8</a>.</p>\n<p class=\"m-p\">W zakładce <strong>Gry Społeczności</strong> dostępne są tylko <span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span>, <span class=\"m-control\"><i data-icon=\"eye\"></i>Podgląd</span> i <span class=\"m-control\"><i data-icon=\"settings\"></i>Ustawienia gry</span>. Takich gier nie można edytować, powielać, eksportować ani wysyłać (→ <a class=\"m-ref\" href=\"?ch=13#s-13-4\">13.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-6-5\"><span class=\"m-num\">6.5</span> Zmiana nazwy i usuwanie gry</h2>\n<p class=\"m-p\"><strong>Zmiana nazwy</strong> — kliknij dwukrotnie kafelek gry (na telefonie stuknij dwa razy), wpisz nową nazwę i zatwierdź.</p>\n<p class=\"m-p\"><strong>Usuwanie</strong> — kliknij ikonę kosza na kafelku i potwierdź. Jeśli gra ma otwartą lub zatrzymaną ankietę, serwis uprzedzi: „Ankieta zostanie przerwana.” — zebrane głosy przepadną.</p>\n<p class=\"m-p\">Gry otwartej w innym miejscu (w edytorze, ustawieniach, ankiecie albo w innej karcie przeglądarki) nie można w tej chwili usunąć ani zmienić jej nazwy. Serwis pokaże wtedy „Ta gra jest otwarta gdzie indziej.” Zamknij tamto okno i spróbuj ponownie.</p>\n<p class=\"m-p\">W zakładce Gry Społeczności kosz oznacza <span class=\"m-control\">Usuń z biblioteki</span> (→ <a class=\"m-ref\" href=\"?ch=13#s-13-4\">13.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-6-6\"><span class=\"m-num\">6.6</span> Powielanie i wysyłanie kopii gier</h2>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span> tworzy kopię gry w Twojej bibliotece, z nazwą „{nazwa} kopia”.</li><li><span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span> przekazuje kopię gry znajomemu (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</li></ul>\n<p class=\"m-p\">Każda kopia jest niezależna: zmiany w kopii nie zmieniają oryginału i odwrotnie.</p>\n<p class=\"m-p\">Co trafia do kopii:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Stan gry</th><th>Kopia</th></tr></thead><tbody><tr><td>Szkic</td><td>Szkic z tą samą treścią.</td></tr><tr><td>Ankieta otwarta lub zatrzymana</td><td>Szkic bez zebranych głosów (serwis uprzedzi o tym w oknie „Bez bieżących głosów”).</td></tr><tr><td>Ankieta zamknięta</td><td>Gra gotowa, z wynikiem ankiety.</td></tr></tbody></table></div>\n<p class=\"m-p\">Znajomemu możesz wysłać szkic ankiety oraz grę preparowaną; ankiety otwartej, zatrzymanej ani zamkniętej wysłać się nie da.</p>\n<p class=\"m-p\">Powielanie i wysyłanie wymaga konta (→ <a class=\"m-ref\" href=\"?ch=5#s-5-1\">5.1</a>). To co innego niż dodanie gry z Gier Społeczności (→ <a class=\"m-ref\" href=\"?ch=13#s-13-4\">13.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-6-7\"><span class=\"m-num\">6.7</span> Importowanie i eksportowanie</h2>\n<p class=\"m-p\"><strong>Eksport do pliku.</strong> Zaznacz grę i wybierz <span class=\"m-control\"><i data-icon=\"download\"></i>Eksportuj do pliku</span>. Serwis zapisze plik z rozszerzeniem <code class=\"m-code\">.famgame</code>, który możesz przechować albo przenieść na inne konto.</p>\n<ul class=\"m-ul\"><li>Szkic i gra preparowana trafiają do pliku w całości.</li><li>Zamknięta ankieta zachowuje wynik.</li><li>Przy ankiecie otwartej lub zatrzymanej serwis uprzedzi, że zebrane głosy nie trafią do pliku — po imporcie będzie to szkic.</li></ul>\n<p class=\"m-p\"><strong>Import z pliku.</strong> Wybierz <span class=\"m-control\"><i data-icon=\"upload\"></i>Importuj</span> i wskaż plik <code class=\"m-code\">.famgame</code> (albo <code class=\"m-code\">.json</code>). Przed zatwierdzeniem zobaczysz nazwę, rodzaj gry i liczbę pytań oraz uwagi, na przykład gdy wynik ankiety w pliku jest niepełny i gra trafi do biblioteki jako szkic. Import zawsze tworzy nową grę — nie zmienia istniejących.</p>\n<p class=\"m-p\">Podczas importu zbyt długie teksty są skracane (pytanie do 100 znaków, odpowiedź do 17), a przy więcej niż 6 odpowiedziach zostaje 6 najwyżej punktowanych. Zaimportowana gra może wymagać uzupełnienia — braki zobaczysz pod jej nazwą (→ <a class=\"m-ref\" href=\"?ch=6#s-6-2\">6.2</a>).</p>\n<div class=\"m-note\"><p class=\"m-p\">Uwaga: to, że grę da się wyeksportować lub powielić, nie oznacza, że jest gotowa do rozgrywki.</p></div>\n<p class=\"m-p\"><strong>Eksport do bazy pytań.</strong> <span class=\"m-control\"><i data-icon=\"drawer-export\"></i>Eksportuj do bazy</span> kopiuje pytania i odpowiedzi gry do wybranej bazy pytań (→ <a class=\"m-ref\" href=\"?ch=9\">9</a>). W głównym folderze bazy powstaje folder nazwany jak gra. Możesz wybrać swoją bazę albo bazę udostępnioną Ci z prawem edycji (→ <a class=\"m-ref\" href=\"?ch=12#s-12-4\">12.4</a>).</p>"
  },
  {
   "id": "7",
   "title": "Tworzenie i edycja gry",
   "sections": [
    {
     "id": "7.1",
     "title": "Wybór rodzaju gry",
     "level": 2
    },
    {
     "id": "7.2",
     "title": "Edytor gry",
     "level": 2
    },
    {
     "id": "7.3",
     "title": "Pytania i odpowiedzi",
     "level": 2
    },
    {
     "id": "7.4",
     "title": "Punktacja odpowiedzi",
     "level": 2
    },
    {
     "id": "7.5",
     "title": "Zapisywanie i edycja gry po rozpoczęciu ankiety",
     "level": 2
    },
    {
     "id": "7.6",
     "title": "Warunki gotowości gry",
     "level": 2
    },
    {
     "id": "7.7",
     "title": "Import pytań z pliku tekstowego",
     "level": 2
    },
    {
     "id": "7.8",
     "title": "Zmiana typu istniejącej gry",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-7-1\"><span class=\"m-num\">7.1</span> Wybór rodzaju gry</h2>\n<p class=\"m-p\">Grę tworzysz w zakładce jej rodzaju na stronie <span class=\"m-page\">Moje gry</span> (→ <a class=\"m-ref\" href=\"?ch=6#s-6-3\">6.3</a>). Są trzy rodzaje:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Rodzaj</th><th>Co przygotowujesz</th><th>Skąd biorą się odpowiedzi i punkty</th></tr></thead><tbody><tr><td><strong>Ankieta tekstowa</strong></td><td>tylko pytania</td><td>Głosujący wpisują własne odpowiedzi; serwis zlicza je i zamienia na punkty (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>).</td></tr><tr><td><strong>Punktacja</strong></td><td>pytania i listę odpowiedzi</td><td>Głosujący wybierają jedną z Twoich odpowiedzi; punkty wynikają z ich wyborów (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>).</td></tr><tr><td><strong>Preparowana</strong></td><td>pytania, odpowiedzi i punkty</td><td>Wszystko wpisujesz sam — gra nie potrzebuje ankiety.</td></tr></tbody></table></div>\n<p class=\"m-p\">Rodzaj gry możesz później zmienić (→ <a class=\"m-ref\" href=\"?ch=7#s-7-8\">7.8</a>).</p>\n<h2 class=\"m-h2\" id=\"s-7-2\"><span class=\"m-num\">7.2</span> Edytor gry</h2>\n<p class=\"m-p\">Zaznacz grę na liście i wybierz <span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edytuj</span>. Edytor składa się z:</p>\n<ul class=\"m-ul\"><li>pola <strong>Nazwa</strong> na górze — tu zmienisz nazwę gry bez wychodzenia z edytora,</li><li><strong>listy pytań</strong> po lewej — z kafelkiem <span class=\"m-control\">Dodaj pytanie</span> i listą warunków, które gra musi spełnić (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>),</li><li><strong>wybranego pytania</strong> po prawej — z polem „Treść pytania” i listą odpowiedzi (w ankiecie tekstowej odpowiedzi nie ma).</li></ul>\n<p class=\"m-p\">Kliknij pytanie na liście, aby je otworzyć. Aby je usunąć, kliknij ikonę kosza na jego kafelku i potwierdź — usuniesz pytanie razem z odpowiedziami.</p>\n<p class=\"m-p\">Na węższym ekranie edytor pokazuje na zmianę listę pytań albo wybrane pytanie; do listy wracasz przyciskiem <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Wstecz</span>.</p>\n<h2 class=\"m-h2\" id=\"s-7-3\"><span class=\"m-num\">7.3</span> Pytania i odpowiedzi</h2>\n<ul class=\"m-ul\"><li><strong>Pytanie</strong> może mieć do <strong>100 znaków</strong>.</li><li><strong>Odpowiedź</strong> może mieć do <strong>17 znaków</strong> — tyle mieści jeden wiersz tablicy na Wyświetlaczu. W pytaniach finałowych Wyświetlacz pokazuje do 11 znaków odpowiedzi.</li><li>Pytanie może mieć do <strong>6 odpowiedzi</strong> — kafelek <span class=\"m-control\">Dodaj odpowiedź</span> pokazuje, ile już jest.</li></ul>\n<p class=\"m-p\">Odpowiedzi nie mogą zawierać znaków, których nie pokaże Wyświetlacz (na przykład emotek). Serwis nie zapisze takiej odpowiedzi i pokaże komunikat.</p>\n<p class=\"m-p\">W ankiecie tekstowej wpisujesz tylko pytania. W grach „Punktacja” i preparowanych — także odpowiedzi.</p>\n<p class=\"m-p\">Pytania i odpowiedzi możesz też przygotować w bazie pytań i utworzyć z nich grę (→ <a class=\"m-ref\" href=\"?ch=9#s-9-8\">9.8</a>).</p>\n<h2 class=\"m-h2\" id=\"s-7-4\"><span class=\"m-num\">7.4</span> Punktacja odpowiedzi</h2>\n<ul class=\"m-ul\"><li><strong>Punktacja</strong> — kolumny punktów nie ma. Punkty wynikną z ankiety (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li><li><strong>Preparowana</strong> — przy każdej odpowiedzi wpisujesz punkty (liczbę od 0 do 100). Pasek „SUMA” pokazuje sumę punktów w pytaniu.</li></ul>\n<p class=\"m-p\">Aby gra preparowana była gotowa:</p>\n<ul class=\"m-ul\"><li>każda odpowiedź musi mieć <strong>co najmniej 4 punkty</strong>,</li><li>suma punktów w pytaniu może wynosić <strong>najwyżej 100</strong> — nie musi być równa 100.</li></ul>\n<p class=\"m-p\">Wartości niespełniające tych warunków serwis zapisze, ale oznaczy na czerwono, a gra nie będzie gotowa. Jak punkty liczą się w rozgrywce → <a class=\"m-ref\" href=\"?ch=3\">3</a>.</p>\n<h2 class=\"m-h2\" id=\"s-7-5\"><span class=\"m-num\">7.5</span> Zapisywanie i edycja gry po rozpoczęciu ankiety</h2>\n<p class=\"m-p\">Edytor zapisuje zmiany sam — nie ma przycisku „Zapisz”:</p>\n<ul class=\"m-ul\"><li>treść pytań i odpowiedzi zapisuje się chwilę po tym, jak przestaniesz pisać, oraz po opuszczeniu pola,</li><li>punkty i nazwa gry zapisują się po opuszczeniu pola (lub po naciśnięciu Enter).</li></ul>\n<p class=\"m-p\">Puste pytanie lub odpowiedź zapisze się jako „Pytanie 1”, „ODP 1” itd.</p>\n<p class=\"m-p\"><strong>Gra z ankietą:</strong></p>\n<ul class=\"m-ul\"><li>Gdy ankieta jest <strong>otwarta</strong> albo <strong>zatrzymana</strong>, edycja jest zablokowana. Aby edytować, przerwij ankietę (zebrane głosy przepadną → <a class=\"m-ref\" href=\"?ch=15#s-15-5\">15.5</a>).</li><li>Gdy ankieta jest <strong>zamknięta</strong>, przy próbie edycji serwis zapyta: „Zresetować ankietę?”. Po wybraniu <span class=\"m-control\">Resetuj</span> usunięte zostaną głosy, odpowiedzi ankietowanych oraz linki i kody QR do ankiety; pytania i odpowiedzi zostaną, punkty zostaną wyzerowane, a gra wróci do szkicu.</li></ul>\n<p class=\"m-p\">Gry nie można edytować także wtedy, gdy jest otwarta w innym miejscu albo trwa jej rozgrywka — serwis pokaże powód.</p>\n<h2 class=\"m-h2\" id=\"s-7-6\"><span class=\"m-num\">7.6</span> Warunki gotowości gry</h2>\n<p class=\"m-p\">Lista warunków w edytorze („Ankietę uruchomisz, gdy:” albo „Gra będzie gotowa, gdy:”) pokazuje na bieżąco, co jest spełnione (zielony znak), a czego brakuje (czerwony znak, z numerami pytań, których to dotyczy).</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Rodzaj</th><th>Warunki</th></tr></thead><tbody><tr><td>Wszystkie</td><td>co najmniej <strong>10 pytań</strong> (bez górnego limitu)</td></tr><tr><td>Punktacja</td><td>każde pytanie ma od <strong>3 do 6</strong> odpowiedzi</td></tr><tr><td>Preparowana</td><td>każde pytanie ma od <strong>3 do 6</strong> odpowiedzi, każda ma co najmniej <strong>4 punkty</strong>, suma w pytaniu najwyżej <strong>100</strong></td></tr><tr><td>Ankieta tekstowa</td><td>wystarczą pytania — odpowiedzi zbierze ankieta</td></tr></tbody></table></div>\n<p class=\"m-p\">W grach z ankietą spełnienie warunków pozwala uruchomić ankietę. Grę rozegrasz dopiero po jej podliczeniu i zamknięciu (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>, <a class=\"m-ref\" href=\"?ch=15#s-15-7\">15.7</a>).</p>\n<h2 class=\"m-h2\" id=\"s-7-7\"><span class=\"m-num\">7.7</span> Import pytań z pliku tekstowego</h2>\n<p class=\"m-p\">W edytorze wybierz <span class=\"m-control\"><i data-icon=\"upload\"></i>Importuj</span>. Możesz wkleić tekst albo wczytać plik <code class=\"m-code\">.txt</code>. Zapis:</p>\n<pre class=\"m-pre\">@Nazwa gry\n# Pierwsze pytanie\nodpowiedź pierwsza / 40\nodpowiedź druga / 30\nodpowiedź trzecia / 20\n# Drugie pytanie\n1. odpowiedź\n2. odpowiedź\n3. odpowiedź</pre>\n<ul class=\"m-ul\"><li>Wiersz zaczynający się od <code class=\"m-code\">#</code> to pytanie, kolejne wiersze to jego odpowiedzi.</li><li><code class=\"m-code\">@Nazwa gry</code> (opcjonalnie, przed pierwszym pytaniem) ustawia nazwę gry.</li><li>Numery odpowiedzi (<code class=\"m-code\">1</code>, <code class=\"m-code\">1.</code>, <code class=\"m-code\">2)</code>, <code class=\"m-code\">3 -</code>, <code class=\"m-code\">4:</code>) są opcjonalne i zostaną pominięte — dlatego odpowiedź zaczynająca się od liczby (np. „100 lat”) straci tę liczbę.</li><li>Punkty po ukośniku <code class=\"m-code\">/</code> są opcjonalne i działają tylko w grze preparowanej.</li></ul>\n<p class=\"m-p\">W oknie widać podgląd: liczbę pytań i odpowiedzi oraz pierwsze pytania.</p>\n<div class=\"m-note\"><p class=\"m-p\">Uwaga: import <strong>zastępuje</strong> całą dotychczasową zawartość gry. Serwis poprosi o potwierdzenie.</p></div>\n<p class=\"m-p\">Zbyt długie teksty zostaną skrócone (pytanie do 100, odpowiedź do 17 znaków), a z więcej niż 6 odpowiedzi zostanie pierwszych 6. W ankiecie tekstowej odpowiedzi z pliku nie są wczytywane. Jeśli plik zawiera znaki, których nie pokaże Wyświetlacz, albo odpowiedź przed pierwszym pytaniem, serwis wskaże miejsce błędu i nic nie zmieni.</p>\n<h2 class=\"m-h2\" id=\"s-7-8\"><span class=\"m-num\">7.8</span> Zmiana typu istniejącej gry</h2>\n<p class=\"m-p\">Zaznacz grę w <span class=\"m-page\">Moich grach</span> i wybierz <span class=\"m-control\"><i data-icon=\"change-type\"></i>Zmień typ</span>. Zmienia się <strong>ta sama gra</strong> — to nie kopia. Jeśli chcesz zachować obecną wersję, najpierw użyj <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span> (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>).</p>\n<ul class=\"m-ul\"><li>Gry z ankietą <strong>otwartą lub zatrzymaną</strong> nie można w tej chwili zmienić.</li><li>Przy ankiecie <strong>zamkniętej</strong> serwis najpierw zapyta o jej wyzerowanie (→ <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>).</li><li>Gier ze Społeczności nie można zmieniać.</li></ul>\n<p class=\"m-p\">W oknie „Zmień typ gry” każdy rodzaj ma opis skutków — sprawdź go przed wyborem <span class=\"m-control\">Zmień</span>:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Nowy rodzaj</th><th>Co się stanie z zawartością</th></tr></thead><tbody><tr><td>Ankieta tekstowa</td><td>Pytania zostaną. Odpowiedzi i punkty zostaną usunięte.</td></tr><tr><td>Punktacja</td><td>Pytania i odpowiedzi zostaną. Punkty zostaną usunięte — wynikną z nowej ankiety.</td></tr><tr><td>Preparowana</td><td>Pytania i odpowiedzi zostaną. Punkty trzeba będzie uzupełnić, jeśli ich nie było.</td></tr></tbody></table></div>\n<p class=\"m-p\">Z ankiety tekstowej przechodzą tylko pytania — odpowiedzi trzeba wpisać. Po zmianie gra jest zawsze szkicem.</p>"
  },
  {
   "id": "8",
   "title": "Logo gry: tworzenie i używanie",
   "sections": [
    {
     "id": "8.1",
     "title": "Czym jest logo gry",
     "level": 2
    },
    {
     "id": "8.2",
     "title": "Tworzenie logo tekstowego",
     "level": 2
    },
    {
     "id": "8.3",
     "title": "Rysowanie logo",
     "level": 2
    },
    {
     "id": "8.4",
     "title": "Tworzenie logo z obrazu",
     "level": 2
    },
    {
     "id": "8.5",
     "title": "Zapisywanie, wybór i wyświetlanie logo",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-8-1\"><span class=\"m-num\">8.1</span> Czym jest logo gry</h2>\n<p class=\"m-p\">Logo gry to napis lub obrazek, który przygotowujesz sam i który pojawia się podczas rozgrywki — między innymi na początku i na końcu gry. Nie jest to logo serwisu Familiada: jeśli nie wybierzesz własnego, gra pokaże logo domyślne.</p>\n<p class=\"m-p\">Logo tworzysz i przechowujesz na stronie <span class=\"m-page\">Moje loga</span>. Każdej grze możesz przypisać inne logo (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>).</p>\n<div class=\"m-note\"><p class=\"m-p\">Uwaga: logo tworzy się na komputerze lub tablecie. Na telefonie listę logo można przeglądać, ale edytor jest niedostępny.</p></div>\n<h2 class=\"m-h2\" id=\"s-8-2\"><span class=\"m-num\">8.2</span> Tworzenie logo tekstowego</h2>\n<ol class=\"m-ol\"><li>Na stronie <span class=\"m-page\">Moje loga</span> kliknij kafelek „Nowe logo tekstowe”, wpisz nazwę logo i zatwierdź.</li><li>Wpisz napis (na przykład „FAMILIADA”).</li></ol>\n<p class=\"m-p\">Napis jest wyświetlany czcionką jak w klasycznym logo Familiady. Licznik „Szerokość: …/30” pokazuje, czy napis mieści się na Wyświetlaczu. Przycisk <span class=\"m-control\"><i data-icon=\"text\"></i>Dozwolone znaki</span> pokazuje znaki, których można użyć. Napis za szeroki albo z niedozwolonymi znakami nie zostanie zapisany — serwis wskaże problem.</p>\n<p class=\"m-p\">Jeśli chcesz napis innym krojem pisma albo z dodatkami, użyj logo rysunkowego (→ <a class=\"m-ref\" href=\"?ch=8#s-8-3\">8.3</a>).</p>\n<h2 class=\"m-h2\" id=\"s-8-3\"><span class=\"m-num\">8.3</span> Rysowanie logo</h2>\n<p class=\"m-p\">Kliknij kafelek „Nowe logo rysunkowe”. Rysujesz na scenie w dwóch kolorach — czarnym i białym; białe elementy zaświecą się na Wyświetlaczu.</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Narzędzie</th><th>Skrót</th><th>Do czego służy</th></tr></thead><tbody><tr><td>Wskaźnik</td><td>V</td><td>zaznaczanie i przesuwanie elementów</td></tr><tr><td>Rączka</td><td>H (lub przytrzymana spacja)</td><td>przesuwanie widoku</td></tr><tr><td>Pędzel</td><td>B</td><td>rysowanie odręczne</td></tr><tr><td>Gumka</td><td>E</td><td>usuwa elementy, których dotknie</td></tr><tr><td>Kształty</td><td>S</td><td>linia, prostokąt, elipsa, wielokąt, gwiazda, strzałki, serce i inne</td></tr><tr><td>Tekst</td><td>T</td><td>napisy — do wyboru wiele krojów pisma</td></tr></tbody></table></div>\n<p class=\"m-p\">Do dyspozycji są też: powiększanie i pomniejszanie widoku, tło sceny (czarne lub białe), grubość i styl linii, wypełnienie, <span class=\"m-control\">Cofnij</span>, <span class=\"m-control\"><i data-icon=\"refresh\"></i>Ponów</span>, <span class=\"m-control\">Duplikuj</span>, <span class=\"m-control\">Wyczyść</span> oraz <span class=\"m-control\"><i data-icon=\"eye\"></i>Podgląd</span> — pokazuje, jak logo będzie wyglądać na Wyświetlaczu.</p>\n<p class=\"m-p\">Skróty klawiszowe nie działają podczas wpisywania tekstu.</p>\n<h2 class=\"m-h2\" id=\"s-8-4\"><span class=\"m-num\">8.4</span> Tworzenie logo z obrazu</h2>\n<ol class=\"m-ol\"><li>Kliknij kafelek „Nowe logo z obrazu” i wybierz <span class=\"m-control\"><i data-icon=\"folder\"></i>Wybierz obraz</span> — plik JPG, PNG, GIF lub WEBP, do 5 MB.</li><li>Ustaw kadr: ramka „Obszar wyświetlacza” pokazuje część obrazu, która trafi na ekran. Możesz obrócić obraz o 90° i wyprostować go.</li><li>Dopasuj wygląd suwakami: jasność, kontrast, gamma, czerń, biel i dither (ziarnistość przejść tonalnych). <span class=\"m-control\">Odwróć</span> zamienia jasne miejsca z ciemnymi, <span class=\"m-control\"><i data-icon=\"restore\"></i>Przywróć</span> cofa ustawienia.</li></ol>\n<p class=\"m-p\">Obraz zostanie zamieniony na kropki Wyświetlacza. Na ekranie prowadzącego może się pojawić w oryginalnej postaci (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>).</p>\n<h2 class=\"m-h2\" id=\"s-8-5\"><span class=\"m-num\">8.5</span> Zapisywanie, wybór i wyświetlanie logo</h2>\n<p class=\"m-p\"><strong>Zapis.</strong> Logo zapisuje się samo podczas pracy — nie ma przycisku „Zapisz”. Zmiany są zapisywane także przy wyjściu przyciskiem <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Wstecz</span>.</p>\n<p class=\"m-p\"><strong>Lista „Moje loga”.</strong> Dla zaznaczonego logo dostępne są <span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edytuj</span>, <span class=\"m-control\"><i data-icon=\"eye\"></i>Podgląd</span>, <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span>, eksport do pliku <code class=\"m-code\">.famlogo</code>, <span class=\"m-control\"><i data-icon=\"upload\"></i>Importuj</span> oraz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span> — kopia dla znajomego (→ <a class=\"m-ref\" href=\"?ch=11#s-11-3\">11.3</a>). Nazwę zmienisz dwuklikiem (na dotyku — przytrzymaniem), a logo usuniesz ikoną kosza.</p>\n<p class=\"m-p\"><strong>Wybór logo w grze.</strong> Logo wybierasz w <span class=\"m-page\">Ustawieniach gry</span>, w sekcji „Logo” — „Domyślne” albo jedno z Twoich (→ <a class=\"m-ref\" href=\"?ch=16#s-16-3\">16.3</a>).</p>\n<p class=\"m-p\"><strong>Jak logo wygląda podczas gry:</strong></p>\n<ul class=\"m-ul\"><li><strong>Wyświetlacz</strong> zawsze pokazuje logo z kropek, bo jest ekranem kropkowym.</li><li><strong>Ekran prowadzącego</strong> — zależnie od ustawienia „Logo prowadzącego” (→ <a class=\"m-ref\" href=\"?ch=16#s-16-3\">16.3</a>):<ul class=\"m-ul\"><li>„Piksele” — tak samo jak Wyświetlacz,</li><li>„Źródło” — logo tekstowe jako napis w stylu logo Familiady, logo z obrazu jako oryginalny obraz, logo rysunkowe jako gładki rysunek w kolorze kropek.</li></ul></li></ul>\n<p class=\"m-p\">Logo pojawia się na początku gry i na końcu, jeśli tak ustawisz ekran końcowy (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>, <a class=\"m-ref\" href=\"?ch=17#s-17-5\">17.5</a>).</p>\n<p class=\"m-p\"><strong>Blokady.</strong> Edycja logo i rozgrywka się wykluczają: gdy edytujesz logo, nie otworzysz panelu sterowania ani ustawień gry, a podczas rozgrywki lub przy otwartych ustawieniach gry nie edytujesz ani nie usuniesz logo. Serwis wskaże powód — zakończ jedną czynność i wróć do drugiej.</p>"
  },
  {
   "id": "9",
   "title": "Bazy pytań",
   "sections": [
    {
     "id": "9.1",
     "title": "Do czego służy baza pytań",
     "level": 2
    },
    {
     "id": "9.2",
     "title": "Eksplorator bazy",
     "level": 2
    },
    {
     "id": "9.3",
     "title": "Narzędzia do pracy z pytaniami i folderami",
     "level": 2
    },
    {
     "id": "9.4",
     "title": "Foldery i tagi",
     "level": 2
    },
    {
     "id": "9.5",
     "title": "Wyszukiwanie i przeglądanie pytań",
     "level": 2
    },
    {
     "id": "9.6",
     "title": "Skróty klawiszowe",
     "level": 2
    },
    {
     "id": "9.7",
     "title": "Edycja pytania",
     "level": 2
    },
    {
     "id": "9.8",
     "title": "Tworzenie gry z wybranych pytań",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-9-1\"><span class=\"m-num\">9.1</span> Do czego służy baza pytań</h2>\n<p class=\"m-p\">Baza pytań to Twoja biblioteka pytań do wielokrotnego wykorzystania. Nie jest gotową grą: z wybranych pytań bazy w każdej chwili utworzysz grę (→ <a class=\"m-ref\" href=\"?ch=9#s-9-8\">9.8</a>).</p>\n<p class=\"m-p\">Na stronie <span class=\"m-page\">Bazy pytań</span> są zakładki „Moje bazy” i „Udostępnione” — bazy, do których zaprosili Cię inni (→ <a class=\"m-ref\" href=\"?ch=12\">12</a>). Filtr nad listą pokaże bazy według roli: Moja, Edycja albo Odczyt.</p>\n<ul class=\"m-ul\"><li>Aby utworzyć bazę, kliknij kafelek „Nowa baza” i wpisz nazwę (do 80 znaków).</li><li>Aby otworzyć bazę, zaznacz ją i wybierz <span class=\"m-control\"><i data-icon=\"folder\"></i>Przeglądaj</span>.</li><li>Dla zaznaczonej bazy dostępne są też <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Udostępnij</span> (→ <a class=\"m-ref\" href=\"?ch=12#s-12-2\">12.2</a>), <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span>, <span class=\"m-control\"><i data-icon=\"download\"></i>Eksport</span> do pliku <code class=\"m-code\">.fambase</code> i <span class=\"m-control\"><i data-icon=\"upload\"></i>Import</span> z pliku.</li><li>Nazwę bazy zmienisz dwuklikiem, a bazę usuniesz ikoną kosza — tylko w swoich bazach.</li></ul>\n<p class=\"m-p\">Pytania z gry przeniesiesz do bazy przyciskiem <span class=\"m-control\"><i data-icon=\"drawer-export\"></i>Eksportuj do bazy</span> w <span class=\"m-page\">Moich grach</span> (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>).</p>\n<h2 class=\"m-h2\" id=\"s-9-2\"><span class=\"m-num\">9.2</span> Eksplorator bazy</h2>\n<p class=\"m-p\">Otwarta baza działa podobnie do eksploratora plików na komputerze:</p>\n<ul class=\"m-ul\"><li><strong>po lewej</strong> — drzewo „Foldery”, zaczynające się od „Folderu głównego”, a pod nim panel „Tagi” i „Pasujące kategorie”,</li><li><strong>pośrodku</strong> — zawartość bieżącego folderu: foldery i pytania,</li><li><strong>na górze</strong> — pasek narzędzi i pole wyszukiwania.</li></ul>\n<p class=\"m-p\">Kliknij element, aby go zaznaczyć. Aby zaznaczyć kilka, przytrzymaj Ctrl (na Macu ⌘); Shift zaznacza zakres. Możesz też zaznaczyć elementy ramką, przeciągając od pustego miejsca. Prawy przycisk myszy (na dotyku — przytrzymanie) otwiera menu z czynnościami dla zaznaczenia.</p>\n<p class=\"m-p\">Folder otwierasz dwuklikiem lub klawiszem Enter, a wracasz o poziom wyżej klawiszem Backspace albo w drzewie folderów.</p>\n<h2 class=\"m-h2\" id=\"s-9-3\"><span class=\"m-num\">9.3</span> Narzędzia do pracy z pytaniami i folderami</h2>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Czynność</th><th>Co robi</th></tr></thead><tbody><tr><td><span class=\"m-control\">Nowy folder</span>, <span class=\"m-control\">Nowe pytanie</span></td><td>tworzy element w bieżącym folderze</td></tr><tr><td><span class=\"m-control\">Edytuj pytanie</span></td><td>otwiera okno pytania (→ <a class=\"m-ref\" href=\"?ch=9#s-9-7\">9.7</a>)</td></tr><tr><td><span class=\"m-control\">Tagi</span></td><td>przypisuje tagi do zaznaczenia (→ <a class=\"m-ref\" href=\"?ch=9#s-9-4\">9.4</a>)</td></tr><tr><td><span class=\"m-control\">Zmień nazwę</span></td><td>zmienia nazwę folderu albo treść pytania</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"copy\"></i>Kopiuj</span>, <span class=\"m-control\">Wytnij</span>, <span class=\"m-control\">Wklej</span></td><td>przenosi lub kopiuje zaznaczenie do innego folderu</td></tr><tr><td><span class=\"m-control\">Duplikuj</span></td><td>tworzy kopię obok oryginału</td></tr><tr><td><span class=\"m-control\">Usuń</span></td><td>usuwa zaznaczenie — po potwierdzeniu, bez możliwości cofnięcia</td></tr><tr><td><span class=\"m-control\">Utwórz grę</span></td><td>tworzy grę z zaznaczonych pytań (→ <a class=\"m-ref\" href=\"?ch=9#s-9-8\">9.8</a>)</td></tr><tr><td><span class=\"m-control\">Odśwież widok</span></td><td>pokazuje najnowszy stan bazy</td></tr></tbody></table></div>\n<p class=\"m-p\"><strong>Przeciąganie.</strong> Przeciągnij zaznaczenie na folder, aby je przenieść. Z wciśniętym Ctrl (na Macu Option) elementy zostaną skopiowane — folder razem z zawartością. Upuszczenie na pustym tle przenosi elementy do „Folderu głównego”. Przeciągnięcie na tag w lewym panelu przypisuje ten tag.</p>\n<p class=\"m-p\">Usunięcie folderu usuwa także wszystko, co jest w środku.</p>\n<h2 class=\"m-h2\" id=\"s-9-4\"><span class=\"m-num\">9.4</span> Foldery i tagi</h2>\n<p class=\"m-p\"><strong>Foldery</strong> możesz zagnieżdżać dowolnie głęboko i porządkować w nich pytania według tematów, rund czy wydarzeń.</p>\n<p class=\"m-p\"><strong>Tagi</strong> to etykiety niezależne od folderów — jedno pytanie może mieć kilka tagów, na przykład „sport” i „łatwe”.</p>\n<ul class=\"m-ul\"><li>W oknie <span class=\"m-control\">Tagi</span> wybierz <span class=\"m-control\"><i data-icon=\"plus\"></i>Dodaj tag</span>, wpisz nazwę (do 40 znaków: litery, cyfry i <code class=\"m-code\">_</code>, bez spacji) i wybierz kolor.</li><li>Zaznacz pytania lub foldery i w oknie <span class=\"m-control\">Tagi</span> zaznacz tagi, które chcesz im przypisać. Tag oznaczony jako „częściowo” ma tylko część zaznaczonych elementów.</li><li>Kliknij tag w lewym panelu, aby zobaczyć tylko pytania z tym tagiem. Kilka zaznaczonych tagów pokazuje pytania, które mają je wszystkie.</li></ul>\n<p class=\"m-p\">„Pasujące kategorie” pod tagami serwis tworzy sam — pokazują pytania, które już spełniają warunki danego rodzaju gry (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>):</p>\n<ul class=\"m-ul\"><li><strong>typowe</strong> — nadają się do ankiety tekstowej,</li><li><strong>punktowane</strong> — mają od 3 do 6 odpowiedzi, więc nadają się do gry „Punktacja”,</li><li><strong>preparowane</strong> — mają od 3 do 6 odpowiedzi z punktami (każda co najmniej 4, suma najwyżej 100), więc nadają się do gry preparowanej.</li></ul>\n<h2 class=\"m-h2\" id=\"s-9-5\"><span class=\"m-num\">9.5</span> Wyszukiwanie i przeglądanie pytań</h2>\n<p class=\"m-p\">Wpisz tekst w pole „Szukaj...”. Serwis znajdzie pytania i foldery, których treść lub nazwa zawiera ten tekst (wielkość liter nie ma znaczenia; odpowiedzi nie są przeszukiwane). Wpisz <code class=\"m-code\">#nazwa_tagu</code>, aby dodać do wyszukiwania tag.</p>\n<p class=\"m-p\">Gdy wyszukujesz albo filtrujesz po tagu, lista pokazuje wyniki z całej bazy, a nie zawartość folderu — w tym widoku nie można wklejać ani wycinać. Aby wrócić do folderów, wyczyść pole wyszukiwania albo odznacz tagi.</p>\n<h2 class=\"m-h2\" id=\"s-9-6\"><span class=\"m-num\">9.6</span> Skróty klawiszowe</h2>\n<p class=\"m-p\">Skróty nie działają podczas wpisywania tekstu w polach.</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Czynność</th><th>Windows / Linux</th><th>macOS</th></tr></thead><tbody><tr><td>Nowe pytanie</td><td>Ctrl+N</td><td>⌘N</td></tr><tr><td>Nowy folder</td><td>Ctrl+Shift+N</td><td>⌘⇧N</td></tr><tr><td>Edytuj pytanie</td><td>Ctrl+E</td><td>⌘E</td></tr><tr><td>Tagi</td><td>Ctrl+T</td><td>⌘T</td></tr><tr><td>Zmień nazwę</td><td>F2</td><td>F2</td></tr><tr><td>Usuń</td><td>Delete</td><td>Fn+⌫</td></tr><tr><td>Kopiuj / Wytnij / Wklej</td><td>Ctrl+C / Ctrl+X / Ctrl+V</td><td>⌘C / ⌘X / ⌘V</td></tr><tr><td>Duplikuj</td><td>Ctrl+D</td><td>⌘D</td></tr><tr><td>Zaznacz wszystko</td><td>Ctrl+A</td><td>⌘A</td></tr><tr><td>Otwórz folder</td><td>Enter</td><td>Enter</td></tr><tr><td>Folder wyżej</td><td>Backspace</td><td>⌫</td></tr><tr><td>Odznacz</td><td>Esc</td><td>Esc</td></tr><tr><td>Odśwież widok</td><td>Ctrl+Alt+R</td><td>⌘⌥R</td></tr><tr><td>Utwórz grę</td><td>Ctrl+G</td><td>⌘G</td></tr></tbody></table></div>\n<p class=\"m-p\">Niektóre przeglądarki zajmują część tych skrótów (na przykład Ctrl+N otwiera nowe okno). Wtedy użyj przycisku na pasku narzędzi.</p>\n<h2 class=\"m-h2\" id=\"s-9-7\"><span class=\"m-num\">9.7</span> Edycja pytania</h2>\n<p class=\"m-p\">Kliknij dwukrotnie pytanie albo wybierz <span class=\"m-control\">Edytuj pytanie</span>. W oknie „Pytanie”:</p>\n<ul class=\"m-ul\"><li>„Treść pytania” — do 100 znaków,</li><li><span class=\"m-control\">+ Odpowiedź</span> — do 6 odpowiedzi, każda do 17 znaków,</li><li>„Punkty” — opcjonalnie, od 0 do 100 przy każdej odpowiedzi; suma najwyżej 100.</li></ul>\n<p class=\"m-p\">W bazie punkty nie są wymagane — przydadzą się, jeśli z pytania powstanie gra preparowana. Te same limity i znaki obowiązują w edytorze gry (→ <a class=\"m-ref\" href=\"?ch=7#s-7-3\">7.3</a>, <a class=\"m-ref\" href=\"?ch=7#s-7-4\">7.4</a>). Tagi przypisujesz osobno (→ <a class=\"m-ref\" href=\"?ch=9#s-9-4\">9.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-9-8\"><span class=\"m-num\">9.8</span> Tworzenie gry z wybranych pytań</h2>\n<ol class=\"m-ol\"><li>Zaznacz pytania lub foldery i wybierz <span class=\"m-control\">Utwórz grę</span>.</li><li>W oknie „Eksport gry” wpisz nazwę gry i wybierz rodzaj: ankieta tekstowa, punktacja albo preparowana.</li><li>Sprawdź listę: zaznaczone pytania (także z zaznaczonych folderów) są już wybrane. Możesz dodać lub odznaczyć pytania z całej bazy.</li><li>Przy każdym pytaniu i w podsumowaniu widać, czego brakuje do gotowości — na przykład „Gotowa po utworzeniu.” albo „Utworzy się szkic. Do gotowości brakuje: …”.</li><li>Zatwierdź. Gra pojawi się w <span class=\"m-page\">Moich grach</span>.</li></ol>\n<p class=\"m-p\">Gra powstaje dokładnie z wybranych pytań — serwis nie dobiera brakujących. Nie musi spełniać warunków gotowości: możesz utworzyć niekompletny szkic i uzupełnić go w edytorze (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</p>\n<p class=\"m-p\">Wybrany rodzaj gry decyduje, co zostanie przeniesione: ankieta tekstowa zachowa same pytania, punktacja — pytania i odpowiedzi bez punktów (punkty wynikną z ankiety), a gra preparowana — pytania, odpowiedzi i punkty.</p>\n<p class=\"m-p\">Gry nie utworzysz z bazy, do której masz dostęp tylko do odczytu (→ <a class=\"m-ref\" href=\"?ch=12#s-12-4\">12.4</a>).</p>"
  },
  {
   "id": "10",
   "title": "Znajomi i zarządzanie znajomościami",
   "sections": [
    {
     "id": "10.1",
     "title": "Kim jest znajomy w serwisie",
     "level": 2
    },
    {
     "id": "10.2",
     "title": "Wysyłanie zaproszeń",
     "level": 2
    },
    {
     "id": "10.3",
     "title": "Obsługa zaproszeń i ich statusów",
     "level": 2
    },
    {
     "id": "10.4",
     "title": "Zarządzanie listą znajomych",
     "level": 2
    },
    {
     "id": "10.5",
     "title": "Co umożliwia znajomość",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-10-1\"><span class=\"m-num\">10.1</span> Kim jest znajomy w serwisie</h2>\n<p class=\"m-p\">Znajomy to inna osoba z kontem w serwisie, z którą połączyliście się zaproszeniem: jedna osoba je wysłała, druga przyjęła. Obie muszą mieć zwykłe konto z potwierdzonym adresem e-mail — gość nie może mieć znajomych.</p>\n<p class=\"m-p\">Znajomy to co innego niż subskrybent. Subskrybent nie ma konta i dostaje od Ciebie tylko wiadomości e-mail o ankietach i udostępnionych urządzeniach (→ <a class=\"m-ref\" href=\"?ch=14#s-14-1\">14.1</a>).</p>\n<h2 class=\"m-h2\" id=\"s-10-2\"><span class=\"m-num\">10.2</span> Wysyłanie zaproszeń</h2>\n<ol class=\"m-ol\"><li>Otwórz stronę <span class=\"m-page\">Znajomi</span> i zakładkę „Zaproszenia”.</li><li>W sekcji „Dodaj znajomego” wpisz <strong>pełny</strong> adres e-mail albo <strong>pełną</strong> nazwę użytkownika tej osoby — serwis nie podpowiada nazw.</li><li>Wybierz <span class=\"m-control\"><i data-icon=\"plus\"></i>Zaproś</span>.</li></ol>\n<p class=\"m-p\">Zaproszenie pojawi się w sekcji „Oczekujące i odrzucone”. Jeśli zapraszana osoba ma włączone powiadomienia, dostanie wiadomość e-mail z przyciskiem „Otwórz zaproszenie”.</p>\n<p class=\"m-p\">Jeśli pod podanym adresem nie ma konta, serwis to podpowie i zaproponuje dodanie tej osoby jako subskrybenta (→ <a class=\"m-ref\" href=\"?ch=14#s-14-2\">14.2</a>). Działa to też w drugą stronę: gdy na stronie <span class=\"m-page\">Subskrybenci</span> wpiszesz adres osoby z kontem, serwis zaproponuje zaproszenie do znajomych.</p>\n<h2 class=\"m-h2\" id=\"s-10-3\"><span class=\"m-num\">10.3</span> Obsługa zaproszeń i ich statusów</h2>\n<p class=\"m-p\"><strong>Otrzymane zaproszenia</strong> są w zakładce „Znajomi”, w sekcji „Propozycje”:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\">Przyjmij</span> — osoba trafia na listę znajomych,</li><li><span class=\"m-control\"><i data-icon=\"close\"></i>Odrzuć</span> — zaproszenie przechodzi do zwiniętej sekcji „Odrzucone przeze mnie”. Przez 30 dni możesz je przywrócić przyciskiem <span class=\"m-control\">Cofnij odmowę</span>, a potem przyjąć.</li></ul>\n<p class=\"m-p\"><strong>Wysłane zaproszenia</strong> są w zakładce „Zaproszenia”, w sekcji „Oczekujące i odrzucone”:</p>\n<ul class=\"m-ul\"><li>oczekujące — możesz je <span class=\"m-control\"><i data-icon=\"refresh\"></i>Wyślij ponownie</span> (gdy minie wymagany odstęp) albo <span class=\"m-control\">Cofnij</span>,</li><li>odrzucone — możesz je tylko <span class=\"m-control\">Cofnij</span>.</li></ul>\n<p class=\"m-p\">Po odrzuceniu zaproszenia żadna z dwóch osób nie może zaprosić drugiej przez 30 dni. Wiadomości z zaproszeniem wysyłane są nie częściej niż co 5 dni i najwyżej dwa razy na 30 dni.</p>\n<p class=\"m-p\">Na komputerze obie zakładki są widoczne obok siebie; na telefonie przełączasz je u góry. Liczniki przy zakładkach pokazują oczekujące zaproszenia.</p>\n<h2 class=\"m-h2\" id=\"s-10-4\"><span class=\"m-num\">10.4</span> Zarządzanie listą znajomych</h2>\n<p class=\"m-p\">Lista znajomych jest w zakładce „Znajomi”. Przy każdej osobie widać nazwę i adres e-mail.</p>\n<p class=\"m-p\">Aby usunąć znajomego, wybierz <span class=\"m-control\">Usuń</span> i potwierdź. Wtedy:</p>\n<ul class=\"m-ul\"><li>osoba znika z listy i trafia do „Odrzuconych przeze mnie” — przez 30 dni możesz to cofnąć <span class=\"m-control\">Cofnij odmowę</span>,</li><li>oczekujące zaproszenia do ankiet i do baz pytań między wami zostają anulowane,</li><li><strong>bazy i urządzenia, które już udostępniłeś, zostają</strong> — dostęp do nich cofnij osobno (→ <a class=\"m-ref\" href=\"?ch=12#s-12-5\">12.5</a>, <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>),</li><li>kopie gier i logo, które już wysłałeś, zostają u tej osoby — wysyłki nie da się cofnąć (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-10-5\"><span class=\"m-num\">10.5</span> Co umożliwia znajomość</h2>\n<p class=\"m-p\">Ze znajomymi możesz:</p>\n<ul class=\"m-ul\"><li>zapraszać ich do ankiet (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>),</li><li>wysyłać im kopie gier i logo (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>) — tylko znajomym,</li><li>szybko wybierać ich z listy przy udostępnianiu baz (→ <a class=\"m-ref\" href=\"?ch=12#s-12-2\">12.2</a>) i urządzeń (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li></ul>\n<p class=\"m-p\">Bazę i urządzenie możesz udostępnić także osobie spoza znajomych, wpisując jej adres e-mail albo nazwę użytkownika.</p>"
  },
  {
   "id": "11",
   "title": "Wysyłanie gier i logo znajomym",
   "sections": [
    {
     "id": "11.1",
     "title": "Co oznacza wysłanie kopii",
     "level": 2
    },
    {
     "id": "11.2",
     "title": "Wysyłanie gry",
     "level": 2
    },
    {
     "id": "11.3",
     "title": "Wysyłanie logo",
     "level": 2
    },
    {
     "id": "11.4",
     "title": "Odbieranie kopii",
     "level": 2
    },
    {
     "id": "11.5",
     "title": "Historia wysyłek",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-11-1\"><span class=\"m-num\">11.1</span> Co oznacza wysłanie kopii</h2>\n<p class=\"m-p\">Znajomy dostaje <strong>własną kopię</strong> gry lub logo. Nie ma dostępu do Twojego oryginału: jego zmiany nie zmienią Twojej gry, a Twoje — jego kopii. Wysłanej kopii <strong>nie można cofnąć</strong>.</p>\n<p class=\"m-p\">Czym wysyłka różni się od innych sposobów przekazania:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span> tworzy kopię dla Ciebie (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>),</li><li>eksport do pliku daje plik, który możesz przekazać komukolwiek (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>),</li><li>Gry Społeczności to publiczny katalog dla wszystkich (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li></ul>\n<p class=\"m-p\">Wysyłanie wymaga konta i co najmniej jednego znajomego.</p>\n<h2 class=\"m-h2\" id=\"s-11-2\"><span class=\"m-num\">11.2</span> Wysyłanie gry</h2>\n<ol class=\"m-ol\"><li>W <span class=\"m-page\">Moich grach</span> zaznacz grę i wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span>.</li><li>W oknie „Wyślij znajomym” zaznacz znajomych.</li><li>Wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span>. Serwis potwierdzi: „Wysłano do znajomych: …”.</li></ol>\n<p class=\"m-p\">Kopia zachowuje rodzaj gry i całą treść. Wysłać można:</p>\n<ul class=\"m-ul\"><li>grę preparowaną — w każdym stanie,</li><li>grę z ankietą — tylko jako <strong>szkic</strong>, bez wyników ankiety; ankiety otwartej, zatrzymanej ani zamkniętej wysłać się nie da.</li></ul>\n<p class=\"m-p\">Nie można wysłać gier dodanych z Gier Społeczności, materiałów demo ani gry, która jest właśnie otwarta w edytorze lub ustawieniach.</p>\n<h2 class=\"m-h2\" id=\"s-11-3\"><span class=\"m-num\">11.3</span> Wysyłanie logo</h2>\n<p class=\"m-p\">Na stronie <span class=\"m-page\">Moje loga</span> zaznacz logo, wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span> i postępuj jak przy grze. Znajomy może użyć otrzymanego logo we własnych grach (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>). Logo demo nie można wysłać.</p>\n<h2 class=\"m-h2\" id=\"s-11-4\"><span class=\"m-num\">11.4</span> Odbieranie kopii</h2>\n<p class=\"m-p\">Gdy ktoś wyśle Ci kopię, dostaniesz wiadomość e-mail „… wysłał Ci kopię” (jeśli masz włączone powiadomienia), a przy zakładce <span class=\"m-page\">Moich gier</span> lub <span class=\"m-page\">Moich log</span> pojawi się licznik.</p>\n<p class=\"m-p\">Kopia czeka w sekcji „Otrzymane kopie” — z nazwą i oznaczeniem „Od: …”:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"check\"></i>Akceptuj</span> — kopia trafia do Twojej biblioteki: gra do zakładki swojego rodzaju, logo do <span class=\"m-page\">Moich log</span>. Zostaje przy niej oznaczenie „Od: …”, a w <span class=\"m-page\">Moich grach</span> znajdziesz ją też filtrem „Otrzymano”.</li><li><span class=\"m-control\"><i data-icon=\"close\"></i>Odrzuć</span> — kopia znika. Ta sama osoba nie wyśle Ci jej ponownie przez 30 dni.</li></ul>\n<p class=\"m-p\">Kopia, której nie przyjmiesz w ciągu <strong>5 dni</strong>, znika. Dopóki czeka na decyzję, nie można jej edytować, powielać ani usuwać.</p>\n<h2 class=\"m-h2\" id=\"s-11-5\"><span class=\"m-num\">11.5</span> Historia wysyłek</h2>\n<p class=\"m-p\">W oknie „Wyślij znajomym” rozwiń sekcję „Historia wysyłek”. Zobaczysz, komu i kiedy wysłałeś kopie w ciągu ostatnich 30 dni. Historia służy tylko do podglądu — nie pokazuje, czy kopia została przyjęta, i nie pozwala cofnąć wysyłki.</p>"
  },
  {
   "id": "12",
   "title": "Współdzielenie i wspólna edycja baz pytań",
   "sections": [
    {
     "id": "12.1",
     "title": "Na czym polega współdzielenie bazy",
     "level": 2
    },
    {
     "id": "12.2",
     "title": "Zapraszanie do bazy",
     "level": 2
    },
    {
     "id": "12.3",
     "title": "Przyjmowanie zaproszenia i otwieranie bazy",
     "level": 2
    },
    {
     "id": "12.4",
     "title": "Poziomy dostępu",
     "level": 2
    },
    {
     "id": "12.5",
     "title": "Wspólna praca i zarządzanie dostępem",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-12-1\"><span class=\"m-num\">12.1</span> Na czym polega współdzielenie bazy</h2>\n<p class=\"m-p\">Udostępniona baza jest <strong>jedna dla wszystkich</strong>, którzy mają do niej dostęp: zmiany wprowadzone przez jedną osobę widzą pozostałe. To inaczej niż przy wysyłce kopii gry lub logo, gdzie każdy dostaje własny, niezależny egzemplarz (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</p>\n<p class=\"m-p\">Bazę udostępnia jej właściciel; potrzebne jest do tego konto (→ <a class=\"m-ref\" href=\"?ch=5#s-5-1\">5.1</a>).</p>\n<h2 class=\"m-h2\" id=\"s-12-2\"><span class=\"m-num\">12.2</span> Zapraszanie do bazy</h2>\n<ol class=\"m-ol\"><li>Na stronie <span class=\"m-page\">Bazy pytań</span> zaznacz swoją bazę i wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Udostępnij</span>.</li><li>Wybierz poziom dostępu: „Może edytować” (domyślnie) albo „Tylko podgląd”.</li><li>Wpisz adres e-mail lub nazwę użytkownika i wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Udostępnij</span> — albo zaznacz osoby na liście „Znajomi” i wybierz <span class=\"m-control\"><i data-icon=\"people\"></i>Udostępnij zaznaczonym</span>.</li></ol>\n<p class=\"m-p\">Zaproszona osoba nie musi być Twoim znajomym, ale musi mieć konto. Jeśli ma włączone powiadomienia, dostanie wiadomość e-mail z odnośnikiem.</p>\n<h2 class=\"m-h2\" id=\"s-12-3\"><span class=\"m-num\">12.3</span> Przyjmowanie zaproszenia i otwieranie bazy</h2>\n<p class=\"m-p\">Zaproszenie zobaczysz na stronie <span class=\"m-page\">Bazy pytań</span>, w zakładce „Udostępnione” — jako kafelek „Proponowana” z oznaczeniem „Od: …”. Licznik przy zakładce pokazuje liczbę zaproszeń.</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\">Przyjmij</span> — baza zostaje w zakładce „Udostępnione”; otworzysz ją przyciskiem <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Przeglądaj</span>.</li><li><span class=\"m-control\"><i data-icon=\"close\"></i>Odrzuć</span> — zaproszenie znika. Odrzucenie możesz cofnąć w sekcji odrzuconych.</li></ul>\n<p class=\"m-p\">Nieprzyjęte zaproszenie wygasa po <strong>5 dniach</strong>.</p>\n<h2 class=\"m-h2\" id=\"s-12-4\"><span class=\"m-num\">12.4</span> Poziomy dostępu</h2>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Kto</th><th>Oznaczenie</th><th>Co może</th></tr></thead><tbody><tr><td>Właściciel</td><td>„Moja”</td><td>wszystko: edycja, udostępnianie, zmiana nazwy, <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Powiel</span> i usunięcie bazy</td></tr><tr><td>Edycja</td><td>„EDYCJA”</td><td>dodawać, zmieniać, przenosić i usuwać pytania, foldery i tagi; tworzyć z nich gry; eksportować do tej bazy pytania z gier (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>)</td></tr><tr><td>Odczyt</td><td>„ODCZYT”</td><td>przeglądać bazę i eksportować ją do pliku</td></tr></tbody></table></div>\n<p class=\"m-p\">Osoba z dostępem do odczytu nie utworzy gry bezpośrednio z bazy. Może wyeksportować bazę do pliku, zaimportować ją jako własną (→ <a class=\"m-ref\" href=\"?ch=9#s-9-1\">9.1</a>) i tam utworzyć grę.</p>\n<p class=\"m-p\">Jak pracować z pytaniami → <a class=\"m-ref\" href=\"?ch=9\">9</a>.</p>\n<h2 class=\"m-h2\" id=\"s-12-5\"><span class=\"m-num\">12.5</span> Wspólna praca i zarządzanie dostępem</h2>\n<p class=\"m-p\"><strong>Wspólna edycja.</strong> Gdy ktoś edytuje pytanie, folder albo tag, ten element jest na chwilę zajęty. Jeśli spróbujesz zmienić go w tym samym czasie, zobaczysz komunikat „Ten element bazy jest właśnie edytowany w innej karcie lub przez innego użytkownika.” Poczekaj chwilę i spróbuj ponownie. Gdy ktoś ma bazę otwartą, właściciel nie zmieni jej nazwy ani jej nie usunie.</p>\n<p class=\"m-p\"><strong>Zarządzanie dostępem (właściciel).</strong> W oknie <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Udostępnij</span>, w sekcji „Udostępnione”, widać zaproszenia oczekujące, przyjęte i odrzucone. Możesz:</p>\n<ul class=\"m-ul\"><li>zmienić poziom dostępu, także przed przyjęciem zaproszenia,</li><li>przypomnieć o oczekującym zaproszeniu,</li><li>odebrać dostęp albo anulować zaproszenie.</li></ul>\n<p class=\"m-p\">Osoba, której odebrano dostęp, traci go od razu — jeśli ma bazę otwartą, zobaczy komunikat „Odebrano Ci dostęp”. Sama możesz też zrezygnować z udostępnionej bazy przyciskiem <span class=\"m-control\">Usuń z listy</span>.</p>\n<p class=\"m-p\">Usunięcie kogoś ze znajomych nie odbiera mu dostępu do baz — zrób to osobno (→ <a class=\"m-ref\" href=\"?ch=10#s-10-4\">10.4</a>).</p>"
  },
  {
   "id": "13",
   "title": "Gry Społeczności",
   "sections": [
    {
     "id": "13.1",
     "title": "Czym są Gry Społeczności",
     "level": 2
    },
    {
     "id": "13.2",
     "title": "Przeglądanie i wyszukiwanie gier",
     "level": 2
    },
    {
     "id": "13.3",
     "title": "Szczegóły i oceny gry",
     "level": 2
    },
    {
     "id": "13.4",
     "title": "Dodawanie gry do biblioteki i rozgrywanie",
     "level": 2
    },
    {
     "id": "13.5",
     "title": "Zgłaszanie własnej gry",
     "level": 2
    },
    {
     "id": "13.6",
     "title": "Status zgłoszenia i wycofanie gry",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-13-1\"><span class=\"m-num\">13.1</span> Czym są Gry Społeczności</h2>\n<p class=\"m-p\">Gry Społeczności to publiczny katalog gotowych gier, przygotowanych przez użytkowników i przez Familiadę. Dodając grę do swojej biblioteki, dostajesz <strong>własną kopię do rozgrywania</strong> — nie wspólny dostęp do gry autora. To inaczej niż przy wysyłce kopii znajomemu (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</p>\n<h2 class=\"m-h2\" id=\"s-13-2\"><span class=\"m-num\">13.2</span> Przeglądanie i wyszukiwanie gier</h2>\n<p class=\"m-p\">Na stronie <span class=\"m-page\">Gry Społeczności</span>:</p>\n<ul class=\"m-ul\"><li>„Szukaj gry…” — szuka w tytułach i opisach,</li><li>„Język” — Wszystkie, polski, angielski albo ukraiński,</li><li>„Sortowanie” — Polecane, Najlepiej oceniane, Najczęściej dodawane, Najnowsze, Tytuł A–Z.</li></ul>\n<p class=\"m-p\">Kolejne gry wyświetli <span class=\"m-control\"><i data-icon=\"arrow-down\"></i>Pokaż więcej</span>.</p>\n<p class=\"m-p\">Karta gry pokazuje język, tytuł, autora („od: …”) albo złote oznaczenie „Familiada” dla gier przygotowanych przez serwis, opis, liczbę dodań i średnią ocen (albo „Brak ocen”). Oznaczenie „W Twoich grach” mówi, że gra jest już w Twojej bibliotece.</p>\n<h2 class=\"m-h2\" id=\"s-13-3\"><span class=\"m-num\">13.3</span> Szczegóły i oceny gry</h2>\n<p class=\"m-p\">Kliknij kartę, aby otworzyć szczegóły: opis i wszystkie pytania z odpowiedziami i punktami. Możesz je przejrzeć przed dodaniem gry.</p>\n<p class=\"m-p\">Zalogowany użytkownik może ocenić grę w skali od 1 do 5 gwiazdek („Oceń tę grę:”) i później zmienić ocenę. Nie można ocenić własnej gry. W polecanych serwis bierze pod uwagę średnią dopiero od trzech ocen.</p>\n<h2 class=\"m-h2\" id=\"s-13-4\"><span class=\"m-num\">13.4</span> Dodawanie gry do biblioteki i rozgrywanie</h2>\n<ol class=\"m-ol\"><li>W szczegółach gry wybierz <span class=\"m-control\"><i data-icon=\"plus\"></i>Dodaj do moich gier</span>.</li><li>Gra pojawi się w <span class=\"m-page\">Moich grach</span>, w zakładce „Gry Społeczności”.</li><li>Zaznacz ją i wybierz <span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span> (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>). Możesz też zmienić jej <span class=\"m-control\"><i data-icon=\"settings\"></i>Ustawienia gry</span> (→ <a class=\"m-ref\" href=\"?ch=16\">16</a>).</li></ol>\n<p class=\"m-p\">Gry ze Społeczności nie można edytować, zmieniać jej rodzaju, powielać, eksportować ani wysyłać.</p>\n<p class=\"m-p\">Aby usunąć grę z biblioteki, wybierz <span class=\"m-control\"><i data-icon=\"trash\"></i>Usuń z moich gier</span> w szczegółach albo ikonę kosza na kafelku („Usuń z biblioteki”). Usuwasz tylko swoją kopię — inni, którzy dodali tę grę, nadal ją mają.</p>\n<h2 class=\"m-h2\" id=\"s-13-5\"><span class=\"m-num\">13.5</span> Zgłaszanie własnej gry</h2>\n<ol class=\"m-ol\"><li>Na stronie <span class=\"m-page\">Gry Społeczności</span> otwórz „Moje wysłane” i wybierz <span class=\"m-control\"><i data-icon=\"plus\"></i>Dodaj nową do Gier Społeczności</span>.</li><li>Wybierz grę, wpisz tytuł (do 120 znaków) i opis (do 500 znaków) oraz wskaż język gry.</li><li>Zaznacz „Rozumiem, że po wysłaniu zapis gry jest nieedytowalny.” i wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij do Gier Społeczności</span>.</li></ol>\n<p class=\"m-p\">Zgłosić możesz swoją grę, która jest <strong>gotowa do rozegrania</strong> (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>): grę preparowaną albo grę z zamkniętą ankietą. Gier demo i gier ze Społeczności zgłosić się nie da. Jedna gra może mieć jedno zgłoszenie naraz.</p>\n<p class=\"m-p\">Zgłoszenie to <strong>zapis gry z chwili wysłania</strong> — późniejsze zmiany w Twojej grze go nie zmienią. Gra z zamkniętej ankiety trafia do katalogu jako gra z gotowymi odpowiedziami i punktami.</p>\n<h2 class=\"m-h2\" id=\"s-13-6\"><span class=\"m-num\">13.6</span> Status zgłoszenia i wycofanie gry</h2>\n<p class=\"m-p\">W „Moich wysłanych” widać status zgłoszenia:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Status</th><th>Co oznacza</th></tr></thead><tbody><tr><td>Oczekuje na weryfikację</td><td>Zgłoszenie czeka na sprawdzenie.</td></tr><tr><td>Opublikowana</td><td>Gra jest w katalogu.</td></tr><tr><td>Odrzucona</td><td>Gra nie została przyjęta; powód widać przy zgłoszeniu („Powód: …”). Odrzucone zgłoszenie znika po 5 dniach; grę możesz poprawić i zgłosić ponownie.</td></tr></tbody></table></div>\n<p class=\"m-p\">Opublikowaną grę możesz <span class=\"m-control\">Wycofaj</span>. Zniknie z katalogu dla kolejnych osób, ale ci, którzy już ją dodali, nadal ją mają — z oznaczeniem „Wycofana”.</p>"
  },
  {
   "id": "14",
   "title": "Subskrybenci i powiadomienia e-mail",
   "sections": [
    {
     "id": "14.1",
     "title": "Kim jest subskrybent?",
     "level": 2
    },
    {
     "id": "14.2",
     "title": "Zapraszanie subskrybentów",
     "level": 2
    },
    {
     "id": "14.3",
     "title": "Lista i status subskrybentów",
     "level": 2
    },
    {
     "id": "14.4",
     "title": "Powiadomienia o ankietach",
     "level": 2
    },
    {
     "id": "14.5",
     "title": "Strona „Moje powiadomienia” i zarządzanie własnymi subskrypcjami",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-14-1\"><span class=\"m-num\">14.1</span> Kim jest subskrybent?</h2>\n<p class=\"m-p\">Subskrybent to osoba <strong>bez konta</strong> w serwisie, którą dodajesz po adresie e-mail, aby zapraszać ją do ankiet. Subskrybent:</p>\n<ul class=\"m-ul\"><li>dostaje od Ciebie wiadomości e-mail o ankietach i udostępnionych urządzeniach,</li><li>odpowiada w ankietach i podłącza urządzenia bez logowania,</li><li>zarządza swoimi wiadomościami na stronie <span class=\"m-page\">Moje powiadomienia</span> (→ <a class=\"m-ref\" href=\"?ch=14#s-14-5\">14.5</a>).</li></ul>\n<p class=\"m-p\">Osoby z kontem dodajesz jako znajomych (→ <a class=\"m-ref\" href=\"?ch=10\">10</a>). Gdy subskrybent założy konto, przy jego adresie pojawi się „Ma konto — przejdź do Znajomych.”, a Ty dostaniesz od niego propozycję znajomości.</p>\n<h2 class=\"m-h2\" id=\"s-14-2\"><span class=\"m-num\">14.2</span> Zapraszanie subskrybentów</h2>\n<ol class=\"m-ol\"><li>Otwórz stronę <span class=\"m-page\">Subskrybenci</span> i zakładkę „Zaproszenia”.</li><li>Wpisz adres e-mail i wybierz <span class=\"m-control\"><i data-icon=\"plus\"></i>Zaproś</span>.</li></ol>\n<p class=\"m-p\">Na podany adres przyjdzie wiadomość „Zaproszenie do subskrypcji od użytkownika …” z przyciskiem „Zobacz zaproszenie”. Odbiorca przyjmuje albo odrzuca zaproszenie na stronie, na którą prowadzi wiadomość.</p>\n<p class=\"m-p\">Nie zaprosisz adresu, który należy do konta (serwis zaproponuje znajomość), ani adresu, którego właściciel zrezygnował ze wszystkich wiadomości. Wiadomości z zaproszeniem wysyłane są nie częściej niż co 5 dni i najwyżej dwa razy na 30 dni; po odrzuceniu możesz zaprosić ponownie dopiero po 30 dniach.</p>\n<h2 class=\"m-h2\" id=\"s-14-3\"><span class=\"m-num\">14.3</span> Lista i status subskrybentów</h2>\n<ul class=\"m-ul\"><li>Zakładka „Zaproszenia”, sekcja „Oczekujące i odrzucone”: „Oczekuje” — zaproszenie czeka na odpowiedź; „Odrzucono” — odbiorca odmówił (widoczne przez 5 dni).</li><li>Zakładka „Subskrybenci”: osoby, które przyjęły zaproszenie.</li></ul>\n<p class=\"m-p\">Przy oczekującym zaproszeniu możesz <span class=\"m-control\"><i data-icon=\"refresh\"></i>Wyślij ponownie</span>. <span class=\"m-control\">Usuń</span> kończy subskrypcję i usuwa oczekujące zaproszenia tej osoby do Twoich ankiet.</p>\n<h2 class=\"m-h2\" id=\"s-14-4\"><span class=\"m-num\">14.4</span> Powiadomienia o ankietach</h2>\n<p class=\"m-p\">Subskrybentów wybierasz jako odbiorców ankiety razem ze znajomymi (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>). Każdy dostanie wiadomość „Zaproszenie do ankiety — …” z odnośnikiem do głosowania, a Ty możesz wysłać przypomnienie. W ten sam sposób subskrybent dostaje wiadomość o udostępnionym urządzeniu (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</p>\n<p class=\"m-p\">Każda wiadomość ma na dole odnośnik „Moje powiadomienia” i możliwość wypisania się ze wszystkich wiadomości Familiady.</p>\n<h2 class=\"m-h2\" id=\"s-14-5\"><span class=\"m-num\">14.5</span> Strona „Moje powiadomienia” i zarządzanie własnymi subskrypcjami</h2>\n<p class=\"m-p\">To strona dla odbiorcy wiadomości, także bez konta.</p>\n<p class=\"m-p\"><strong>Jak wejść:</strong></p>\n<ul class=\"m-ul\"><li>kliknij „Moje powiadomienia” na dole dowolnej wiadomości od Familiady (odnośnik działa przez 30 dni), albo</li><li>otwórz stronę <span class=\"m-page\">Twoje maile w Familiadzie</span>, wpisz swój adres i wybierz <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij link</span>. Przyjdzie wiadomość z jednorazowym odnośnikiem ważnym 15 minut; po kliknięciu wybierz <span class=\"m-control\">Otwórz moje powiadomienia</span>.</li></ul>\n<p class=\"m-p\">Jeśli adres należy do konta, serwis poprosi o zalogowanie — powiadomienia ustawisz wtedy w <span class=\"m-page\">Ustawieniach konta</span> (→ <a class=\"m-ref\" href=\"?ch=5#s-5-8\">5.8</a>).</p>\n<p class=\"m-p\"><strong>Co tu znajdziesz:</strong></p>\n<ul class=\"m-ul\"><li><strong>Subskrypcje</strong> — od kogo możesz dostawać ankiety. Oczekujące przyjmiesz <span class=\"m-control\"><i data-icon=\"check\"></i>Akceptuj</span> lub odrzucisz <span class=\"m-control\"><i data-icon=\"close\"></i>Odrzuć</span>; z aktywnej zrezygnujesz <span class=\"m-control\">Wypisz się</span> — ta osoba będzie mogła zaprosić Cię ponownie dopiero po 30 dniach.</li><li><strong>Zadania</strong> — ankiety, na które czekają na Twój głos (<span class=\"m-control\">Zagłosuj</span>, <span class=\"m-control\"><i data-icon=\"close\"></i>Odrzuć</span> → <a class=\"m-ref\" href=\"?ch=15#s-15-3\">15.3</a>), i udostępnione Ci urządzenia (<span class=\"m-control\"><i data-icon=\"phone\"></i>Podłącz urządzenie</span> → <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>„Powiadomienia są włączone”</strong> — <span class=\"m-control\">Zrezygnuj</span> wyłącza wszystkie wiadomości: anuluje subskrypcje, oczekujące ankiety i udostępnione urządzenia, a nikt nie będzie mógł Cię zaprosić. Gdy przywrócisz powiadomienia, dawne zaproszenia nie wrócą.</li></ul>\n<p class=\"m-p\">Odwiedziny strony wygasają po godzinie bezczynności — potem wejdź ponownie przez odnośnik.</p>"
  },
  {
   "id": "15",
   "title": "Ankiety i zbieranie odpowiedzi",
   "sections": [
    {
     "id": "15.1",
     "title": "Przygotowanie i uruchomienie ankiety",
     "level": 2
    },
    {
     "id": "15.2",
     "title": "Wybór sposobu głosowania",
     "level": 2
    },
    {
     "id": "15.3",
     "title": "Oddawanie głosu",
     "level": 2
    },
    {
     "id": "15.4",
     "title": "Zadania i zaproszenia do głosowania",
     "level": 2
    },
    {
     "id": "15.5",
     "title": "Prowadzenie głosowania",
     "level": 2
    },
    {
     "id": "15.6",
     "title": "Podliczanie i opracowywanie odpowiedzi",
     "level": 2
    },
    {
     "id": "15.7",
     "title": "Wyniki i wykorzystanie ich w grze",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-15-1\"><span class=\"m-num\">15.1</span> Przygotowanie i uruchomienie ankiety</h2>\n<p class=\"m-p\">Ankieta należy do gry rodzaju <strong>Ankieta tekstowa</strong> albo <strong>Punktacja</strong> (→ <a class=\"m-ref\" href=\"?ch=7#s-7-1\">7.1</a>). Z jej wyników powstaje tablica odpowiedzi z punktami (→ <a class=\"m-ref\" href=\"?ch=2#s-2-4\">2.4</a>).</p>\n<p class=\"m-p\">Zanim uruchomisz ankietę, gra musi mieć <strong>co najmniej 10 pytań</strong>, a w grze „Punktacja” — od 3 do 6 odpowiedzi w każdym pytaniu (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</p>\n<ol class=\"m-ol\"><li>W <span class=\"m-page\">Moich grach</span> zaznacz grę i wybierz <span class=\"m-control\"><i data-icon=\"polls\"></i>Ankieta</span>.</li><li>Wybierz <span class=\"m-control\"><i data-icon=\"play\"></i>Uruchom</span> — albo <span class=\"m-control\">Uruchom i wyślij zaproszenia</span>, jeśli dodałeś już odbiorców (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>).</li></ol>\n<p class=\"m-p\">Od tej chwili ankieta jest <strong>otwarta</strong>: głosujący mogą odpowiadać, a gry nie można edytować (→ <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>).</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Stan ankiety</th><th>Co się dzieje</th></tr></thead><tbody><tr><td>Szkic</td><td>Ankieta nie jest uruchomiona.</td></tr><tr><td>Otwarta</td><td>Trwa zbieranie odpowiedzi.</td></tr><tr><td>Zatrzymana</td><td>Zbieranie jest wstrzymane; możesz je wznowić albo podliczyć głosy.</td></tr><tr><td>Gotowa</td><td>Ankieta jest zamknięta, a gra gotowa do rozegrania.</td></tr></tbody></table></div>\n<h2 class=\"m-h2\" id=\"s-15-2\"><span class=\"m-num\">15.2</span> Wybór sposobu głosowania</h2>\n<p class=\"m-p\">Na karcie „Udostępnianie” są dwa sposoby:</p>\n<p class=\"m-p\"><strong>Anonimowo</strong> — dla każdego, kto dostanie odnośnik:</p>\n<ul class=\"m-ul\"><li>„Link do głosowania” z przyciskiem <span class=\"m-control\"><i data-icon=\"copy\"></i>Kopiuj link</span>,</li><li>kod QR do zeskanowania telefonem; <span class=\"m-control\">Powiększ kod QR</span> pokazuje go na cały ekran.</li></ul>\n<p class=\"m-p\">Głosujący są anonimowi — widzisz tylko liczbę głosów. W jednej przeglądarce można zagłosować raz.</p>\n<p class=\"m-p\"><strong>Odbiorcy</strong> — imienne zaproszenia dla znajomych (→ <a class=\"m-ref\" href=\"?ch=10\">10</a>) i subskrybentów (→ <a class=\"m-ref\" href=\"?ch=14\">14</a>):</p>\n<ol class=\"m-ol\"><li>Wybierz <span class=\"m-control\"><i data-icon=\"people\"></i>Dodaj odbiorców</span> i zaznacz osoby.</li><li>Wybierz <span class=\"m-control\">Wyślij zaproszenia</span>. Każda osoba dostanie zadanie w serwisie (→ <a class=\"m-ref\" href=\"?ch=15#s-15-4\">15.4</a>) lub wiadomość e-mail z odnośnikiem.</li></ol>\n<p class=\"m-p\">Przy każdym odbiorcy widać status: czeka, otwarto, zagłosował albo odrzucił, a nad listą podsumowanie „Zaproszeni · Zagłosowali · Odrzucili”. Osobom, które jeszcze nie odpowiedziały, możesz wysłać <span class=\"m-control\">Przypomnij</span> — najwyżej dwa razy. <span class=\"m-control\">Usuń udostępnienie</span> wycofuje zaproszenie.</p>\n<p class=\"m-p\">Oba sposoby możesz łączyć — głosy liczą się razem.</p>\n<p class=\"m-p\">Subskrybent bez konta może przejrzeć swoje zaproszenia i z nich zrezygnować na stronie <span class=\"m-page\">Moje powiadomienia</span> (→ <a class=\"m-ref\" href=\"?ch=14#s-14-5\">14.5</a>).</p>\n<h2 class=\"m-h2\" id=\"s-15-3\"><span class=\"m-num\">15.3</span> Oddawanie głosu</h2>\n<p class=\"m-p\">Głosujący otwiera ankietę z odnośnika, kodu QR, wiadomości e-mail albo zadania.</p>\n<ul class=\"m-ul\"><li>Pytania wyświetlają się po jednym („Pytanie 3/10”).</li><li>W ankiecie tekstowej wpisuje się własną odpowiedź — do 17 znaków. Emotki i znaki, których nie pokaże Wyświetlacz, zostaną pominięte.</li><li>W ankiecie „Punktacja” wybiera się jedną z podanych odpowiedzi.</li><li>Odpowiedzi są wysyłane razem <strong>po ostatnim pytaniu</strong>. Kto wyjdzie wcześniej, nie zostanie policzony.</li><li>Na końcu pojawia się „Dziękujemy za udział!”.</li></ul>\n<p class=\"m-p\">Osoba zaproszona imiennie głosuje tak samo; jej status u ankietującego zmieni się na „zagłosował”. Osoba bez konta może otworzyć ankietę z wiadomości albo ze strony <span class=\"m-page\">Moje powiadomienia</span> (→ <a class=\"m-ref\" href=\"?ch=14#s-14-5\">14.5</a>).</p>\n<h2 class=\"m-h2\" id=\"s-15-4\"><span class=\"m-num\">15.4</span> Zadania i zaproszenia do głosowania</h2>\n<p class=\"m-p\">Zadanie to zaproszenie do ankiety, które dostałeś od znajomego. Znajdziesz je na stronie <span class=\"m-page\">Zadania</span>:</p>\n<ul class=\"m-ul\"><li>„Do zrobienia” — ankiety, które czekają na Twój głos: <span class=\"m-control\">Głosuj</span> otwiera ankietę, <span class=\"m-control\"><i data-icon=\"close\"></i>Odrzuć</span> rezygnuje z udziału (ankieta zniknie z listy),</li><li>„Zrobione” — ankiety, w których już głosowałeś (zwinięte, widoczne przez 5 dni).</li></ul>\n<p class=\"m-p\">Osoby bez konta mają swoje zadania na stronie <span class=\"m-page\">Moje powiadomienia</span> (→ <a class=\"m-ref\" href=\"?ch=14#s-14-5\">14.5</a>).</p>\n<h2 class=\"m-h2\" id=\"s-15-5\"><span class=\"m-num\">15.5</span> Prowadzenie głosowania</h2>\n<p class=\"m-p\">Na karcie „Głosy” widać postęp: liczbę oddanych głosów i — przy zaproszeniach — statusy odbiorców.</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"stop\"></i>Zatrzymaj</span> — wstrzymuje zbieranie odpowiedzi. Odnośnik nadal działa, ale głosujący zobaczy „Ankieta jest zatrzymana”.</li><li><span class=\"m-control\"><i data-icon=\"play\"></i>Wznów głosowanie</span> — ponownie otwiera zbieranie.</li><li><span class=\"m-control\"><i data-icon=\"polls\"></i>Podlicz głosy</span> — dostępne, gdy ankieta jest zatrzymana (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li><li><span class=\"m-control\"><i data-icon=\"cancel\"></i>Przerwij</span> — kończy ankietę i przywraca szkic. <strong>Wszystkie głosy przepadną.</strong></li></ul>\n<h2 class=\"m-h2\" id=\"s-15-6\"><span class=\"m-num\">15.6</span> Podliczanie i opracowywanie odpowiedzi</h2>\n<p class=\"m-p\">Podliczanie i zamknięcie ankiety to osobne kroki. Najpierw zatrzymaj ankietę i wybierz <span class=\"m-control\"><i data-icon=\"polls\"></i>Podlicz głosy</span>. Możesz to zrobić od <strong>10 pełnych ankiet</strong> (osób, które odpowiedziały na wszystkie pytania), nawet jeśli wynik nie spełnia jeszcze warunków zamknięcia.</p>\n<p class=\"m-p\"><strong>Jak serwis liczy punkty:</strong></p>\n<ol class=\"m-ol\"><li>Punkty odpowiedzi to procent pełnych ankiet, w których się pojawiła, zaokrąglony w dół.</li><li>Odpowiedzi poniżej <strong>4 punktów</strong> są pomijane.</li><li>Na tablicę trafia najwyżej <strong>6</strong> najpopularniejszych odpowiedzi.</li><li>Aby zamknąć ankietę, każde pytanie potrzebuje <strong>co najmniej 3</strong> odpowiedzi z co najmniej 4 punktami.</li></ol>\n<p class=\"m-p\"><strong>Ankieta tekstowa</strong> — przed zatwierdzeniem uporządkuj odpowiedzi:</p>\n<ul class=\"m-ul\"><li>identyczne wpisy serwis łączy sam (bez względu na wielkość liter); <span class=\"m-control\">Scal identyczne</span> zrobi to ponownie po Twoich poprawkach,</li><li>przeciągnij odpowiedź na inną, aby je <strong>połączyć</strong> (na przykład „banan” i „banany”) — na telefonie użyj przycisku „Połącz z…”,</li><li>kliknij tekst odpowiedzi, aby poprawić literówkę (do 17 znaków),</li><li><span class=\"m-control\">Usuń</span> usuwa odpowiedź z wyników,</li><li><span class=\"m-control\">Cofnij</span> i <span class=\"m-control\"><i data-icon=\"refresh\"></i>Ponów</span> cofają i przywracają zmiany.</li></ul>\n<p class=\"m-p\">Po każdej zmianie serwis przelicza punkty i kolejność. Licznik „Odpowiedzi: … (wymagane 3–6)” pokazuje, czy pytanie spełnia warunki. Gdy na granicy szóstki kilka odpowiedzi ma tyle samo głosów, serwis pokaże remis — <span class=\"m-control\">Zmień wybór w remisie</span> zmienia, które z nich trafią na tablicę. Poprawki zapisują się na bieżąco, więc możesz przerwać i wrócić później.</p>\n<p class=\"m-p\"><strong>Ankieta „Punktacja”</strong> — odpowiedzi są stałe; zobaczysz tylko podgląd punktów (odpowiedzi poniżej 4 punktów są wyszarzone).</p>\n<p class=\"m-p\">Gdy wszystko się zgadza, wybierz <span class=\"m-control\"><i data-icon=\"check\"></i>Zatwierdź</span>. Zobaczysz „Głosy podliczone. Gra gotowa.”. <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Wyjdź z podliczania</span> wraca do zatrzymanej ankiety bez zamykania.</p>\n<h2 class=\"m-h2\" id=\"s-15-7\"><span class=\"m-num\">15.7</span> Wyniki i wykorzystanie ich w grze</h2>\n<p class=\"m-p\">Po zatwierdzeniu ankieta jest zamknięta, a gra ma status GOTOWA — możesz ją rozegrać przyciskiem <span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span> (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>). Wyniki obejrzysz w <span class=\"m-control\"><i data-icon=\"eye\"></i>Podgląd</span> w <span class=\"m-page\">Moich grach</span>, przełączając widok na „Ankieta”.</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"refresh\"></i>Uruchom ponownie</span> otwiera nową ankietę dla tej samej gry — dotychczasowe głosy i wyniki zostaną usunięte.</li><li>Edycja gry lub zmiana jej rodzaju także usuwa wyniki (po potwierdzeniu, → <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>, <a class=\"m-ref\" href=\"?ch=7#s-7-8\">7.8</a>).</li><li>Aby zachować wynik i jednocześnie zebrać nową ankietę, najpierw powiel grę (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>).</li></ul>"
  },
  {
   "id": "16",
   "title": "Ustawienia rozgrywki",
   "sections": [
    {
     "id": "16.1",
     "title": "Przygotowanie ustawień",
     "level": 2
    },
    {
     "id": "16.2",
     "title": "Drużyny",
     "level": 2
    },
    {
     "id": "16.3",
     "title": "Wygląd",
     "level": 2
    },
    {
     "id": "16.4",
     "title": "Dźwięk",
     "level": 2
    },
    {
     "id": "16.5",
     "title": "Pytania",
     "level": 2
    },
    {
     "id": "16.5.1",
     "title": "Ustawienia pytań",
     "level": 3
    },
    {
     "id": "16.5.2",
     "title": "Pytania finałowe",
     "level": 3
    },
    {
     "id": "16.5.3",
     "title": "Pytania do rund",
     "level": 3
    },
    {
     "id": "16.6",
     "title": "Dodatkowe ustawienia",
     "level": 2
    },
    {
     "id": "16.7",
     "title": "Zapis i użycie ustawień",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-16-1\"><span class=\"m-num\">16.1</span> Przygotowanie ustawień</h2>\n<p class=\"m-p\">Ustawienia dotyczą jednej, konkretnej gry. Otworzysz je przyciskiem <span class=\"m-control\"><i data-icon=\"settings\"></i>Ustawienia gry</span> w <span class=\"m-page\">Moich grach</span> albo <span class=\"m-control\">Zmień ustawienia</span> w podsumowaniu w panelu sterowania (→ <a class=\"m-ref\" href=\"?ch=17#s-17-2\">17.2</a>).</p>\n<p class=\"m-p\">Ustawienia przygotuj <strong>przed rozpoczęciem rozgrywki</strong>. Gdy gra jest otwarta w panelu sterowania, ustawień nie zmienisz. Jeśli zamknąłeś panel w trakcie gry, serwis pokaże „Gra w toku” z wyborem: <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Wróć</span> albo <span class=\"m-control\">Zakończ rozgrywkę i otwórz ustawienia</span> — ta druga opcja kończy grę, a urządzenia trzeba będzie podłączyć od nowa.</p>\n<p class=\"m-p\">Ustawienia są podzielone na sekcje: „Drużyny”, „Wygląd”, „Dźwięk”, „Pytania — Ustawienia”, „Pytania — Finał”, „Pytania — Rundy” i „Ustawienia gry”.</p>\n<h2 class=\"m-h2\" id=\"s-16-2\"><span class=\"m-num\">16.2</span> Drużyny</h2>\n<p class=\"m-p\">Wpisz „Nazwę drużyny A” i „Nazwę drużyny B” (domyślnie „Drużyna A” i „Drużyna B”). Nazwy pojawią się na Wyświetlaczu, na ekranie prowadzącego i w panelu sterowania. Długość nazwy jest ograniczona do tego, co mieści Wyświetlacz; znaki, których Wyświetlacz nie pokaże, nie zostaną przyjęte.</p>\n<h2 class=\"m-h2\" id=\"s-16-3\"><span class=\"m-num\">16.3</span> Wygląd</h2>\n<ul class=\"m-ul\"><li><strong>Kolory</strong> — kolor drużyny A, kolor drużyny B, tło i kolor kropki (świecących punktów Wyświetlacza). Kliknij kolor, aby wpisać kod koloru albo ustawić go suwakami.</li><li><strong>Motyw</strong> — „Klasyczny” albo „Nowoczesny”.</li><li><strong>Logo</strong> — „Domyślne” albo jedno z Twoich logo (→ <a class=\"m-ref\" href=\"?ch=8\">8</a>).</li><li><strong>Logo prowadzącego</strong> — jak logo wygląda na ekranie prowadzącego:<ul class=\"m-ul\"><li>„Piksele” — tak samo jak na Wyświetlaczu, z kropek,</li><li>„Źródło” (domyślnie) — w postaci, z której logo powstało: logo tekstowe jako wygięty napis w stylu logo Familiady, logo z obrazu jako oryginalny obraz, logo rysunkowe jako gładki rysunek w kolorze kropek.</li></ul></li></ul>\n<p class=\"m-p\">Wyświetlacz zawsze pokazuje logo z kropek, bo jest ekranem kropkowym.</p>\n<p class=\"m-p\">„Podgląd wyświetlacza” i „Podgląd prowadzącego” pokazują efekt zmian na bieżąco.</p>\n<h2 class=\"m-h2\" id=\"s-16-4\"><span class=\"m-num\">16.4</span> Dźwięk</h2>\n<p class=\"m-p\">Gra ma 10 dźwięków: intro, zakończenie, przejście między rundami, motyw finału, naciśnięcie przycisku, poprawna odpowiedź, błędna odpowiedź, powtórzenie w finale, koniec czasu i odsłonięcie odpowiedzi. Dla każdego możesz:</p>\n<ul class=\"m-ul\"><li>wybrać wariant — „Klasyczny” albo „Własny” (wtedy wskaż plik mp3, wav lub ogg),</li><li>odsłuchać go przyciskiem ▶,</li><li>ustawić głośność od 0 do 100%.</li></ul>\n<p class=\"m-p\">Własny plik może trwać do 120 sekund dla zakończenia, do 30 sekund dla intro, przejścia i finału oraz do 5 sekund dla pozostałych dźwięków. Gdy wybierzesz „Własny”, musisz dodać plik — inaczej ustawień nie da się zapisać.</p>\n<h2 class=\"m-h2\" id=\"s-16-5\"><span class=\"m-num\">16.5</span> Pytania</h2>\n<p class=\"m-p\">Te sekcje decydują, które pytania trafią do finału i w jakiej kolejności będą rundy.</p>\n<h3 class=\"m-h3\" id=\"s-16-5-1\"><span class=\"m-num\">16.5.1</span> Ustawienia pytań</h3>\n<ul class=\"m-ul\"><li><strong>„Czy gra zawiera finał?”</strong> — „Tak” albo „Nie” (domyślnie finału nie ma). Bez finału gra kończy się po rundach (→ <a class=\"m-ref\" href=\"?ch=3#s-3-7\">3.7</a>).</li><li><strong>„Tryb wyboru pytań finału”</strong> — „Losowe” (serwis wylosuje 5 pytań) albo „Ręcznie” (wybierzesz je sam w sekcji „Pytania — Finał”).</li><li><strong>„Tryb kolejności pytań rund”</strong> — „Losowe” albo „Kolejność” (ustalisz ją sam w sekcji „Pytania — Rundy”).</li></ul>\n<h3 class=\"m-h3\" id=\"s-16-5-2\"><span class=\"m-num\">16.5.2</span> Pytania finałowe</h3>\n<p class=\"m-p\">Przy wyborze ręcznym zaznacz <strong>dokładnie 5</strong> pytań finałowych — przy innej liczbie ustawień nie da się zapisać. Pytania finałowe nie są używane w rundach.</p>\n<p class=\"m-p\">Przy losowaniu zestaw zobaczysz w podsumowaniu przed rozpoczęciem gry, gdzie możesz wybrać <span class=\"m-control\">Losuj ponownie</span> (→ <a class=\"m-ref\" href=\"?ch=17#s-17-2\">17.2</a>).</p>\n<h3 class=\"m-h3\" id=\"s-16-5-3\"><span class=\"m-num\">16.5.3</span> Pytania do rund</h3>\n<p class=\"m-p\">Przy trybie „Kolejność” w sekcji „Pytania — Rundy” wybierz pytania do rund i ułóż je przeciąganiem (albo strzałkami). Rundy wykorzystają je po kolei; pytania finałowe są tu pominięte. Przy trybie „Losowe” serwis potasuje pytania przed grą — kolejność zobaczysz w podsumowaniu (→ <a class=\"m-ref\" href=\"?ch=17#s-17-2\">17.2</a>). Wylosowane pytania finałowe nie trafią do rund.</p>\n<h2 class=\"m-h2\" id=\"s-16-6\"><span class=\"m-num\">16.6</span> Dodatkowe ustawienia</h2>\n<p class=\"m-p\">Sekcja „Ustawienia gry”:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Ustawienie</th><th>Domyślnie</th><th>Co zmienia</th></tr></thead><tbody><tr><td>„Mnożniki rund”</td><td>1, 1, 1, 2, 3</td><td>Ile razy liczą się punkty w kolejnych rundach. Ostatni mnożnik obowiązuje we wszystkich dalszych rundach (→ <a class=\"m-ref\" href=\"?ch=3#s-3-2\">3.2</a>).</td></tr><tr><td>„Próg punktów do finału”</td><td>300</td><td>Łączny wynik drużyny, po którego osiągnięciu gra przechodzi do finału albo się kończy (→ <a class=\"m-ref\" href=\"?ch=3#s-3-6\">3.6</a>).</td></tr><tr><td>„Cel finału (pkt)”</td><td>200</td><td>Ile punktów muszą razem zdobyć finaliści (→ <a class=\"m-ref\" href=\"?ch=4#s-4-3\">4.3</a>). Widoczne przy włączonym finale.</td></tr><tr><td>„Tryb ekranu po zakończeniu”</td><td>—</td><td>Co pokaże ekran końcowy: „Logo”, „Punkty” albo „Kwota nagrody” (tylko z finałem).</td></tr><tr><td>„Kwota główna nagrody”</td><td>25 000</td><td>Nagroda za osiągnięcie celu finału.</td></tr><tr><td>„Mnożnik nagrody (po finale)”</td><td>3</td><td>Przez ile mnoży się punkty zwycięskiej drużyny przy wyliczaniu kwoty.</td></tr></tbody></table></div>\n<p class=\"m-p\">Ostatnie dwa ustawienia są widoczne, gdy gra ma finał i ekran końcowy pokazuje kwotę nagrody. Kwota na ekranie końcowym to punkty zwycięskiej drużyny (z rund i finału) pomnożone przez „Mnożnik nagrody”, a po osiągnięciu celu finału — powiększone o kwotę główną. Przy remisie ekran końcowy pokazuje logo.</p>\n<h2 class=\"m-h2\" id=\"s-16-7\"><span class=\"m-num\">16.7</span> Zapis i użycie ustawień</h2>\n<ul class=\"m-ul\"><li>Zmiany zapisujesz przyciskiem <span class=\"m-control\"><i data-icon=\"save\"></i>Zapisz</span>. Dopóki tego nie zrobisz, serwis pokazuje „Niezapisane zmiany” i zapyta przy wyjściu.</li><li><span class=\"m-control\"><i data-icon=\"refresh\"></i>Przywróć domyślne</span> na górnym pasku przywraca wszystkie ustawienia (także usuwa własne dźwięki); w sekcjach „Wygląd”, „Dźwięk” i „Ustawienia gry” jest też przywracanie tylko tej sekcji.</li><li>Jeśli ustawienia zmieniono w międzyczasie w innym oknie, serwis o tym uprzedzi przed zapisem.</li><li><span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span> przechodzi od razu do panelu sterowania (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>). Gra musi być gotowa do rozegrania (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</li></ul>"
  },
  {
   "id": "17",
   "title": "Prowadzenie rozgrywki i podłączanie urządzeń",
   "sections": [
    {
     "id": "17.1",
     "title": "Interfejsy i podłączanie urządzeń",
     "level": 2
    },
    {
     "id": "17.2",
     "title": "Przygotowanie i rozpoczęcie gry",
     "level": 2
    },
    {
     "id": "17.3",
     "title": "Prowadzenie rund",
     "level": 2
    },
    {
     "id": "17.4",
     "title": "Prowadzenie finału",
     "level": 2
    },
    {
     "id": "17.5",
     "title": "Zakończenie gry",
     "level": 2
    }
   ],
   "html": "<p class=\"m-p\">Rozgrywkę prowadzi <strong>operator</strong> w <span class=\"m-page\">Panelu sterowania</span>. Pozostałe urządzenia pokazują grę uczestnikom i prowadzącemu. Ten rozdział opisuje je razem — etap po etapie: co robi operator i co w tym czasie dzieje się na pozostałych ekranach. Zasady rund i finału → <a class=\"m-ref\" href=\"?ch=3\">3</a> i <a class=\"m-ref\" href=\"?ch=4\">4</a>.</p>\n<h2 class=\"m-h2\" id=\"s-17-1\"><span class=\"m-num\">17.1</span> Interfejsy i podłączanie urządzeń</h2>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Urządzenie</th><th>Rola</th><th>Gdzie zwykle działa</th></tr></thead><tbody><tr><td><span class=\"m-page\">Panel sterowania</span></td><td>operator prowadzi całą grę: odsłania odpowiedzi, daje błędy, przechodzi dalej</td><td>komputer lub tablet operatora</td></tr><tr><td><strong>Wyświetlacz</strong></td><td>tablica dla uczestników i publiczności — odpowiedzi, punkty, X, logo</td><td>telewizor, projektor, drugi monitor</td></tr><tr><td><strong>Prowadzący</strong></td><td>ekran dla osoby czytającej pytania — pytanie, wszystkie odpowiedzi z punktami</td><td>tablet lub telefon</td></tr><tr><td><strong>Przycisk do pojedynku</strong></td><td>dwa przyciski, A i B, dla zawodników w pojedynku</td><td>telefon ułożony poziomo</td></tr></tbody></table></div>\n<p class=\"m-p\"><strong>Jak otworzyć Panel sterowania.</strong> Zaznacz gotową grę w <span class=\"m-page\">Moich grach</span> i wybierz <span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span>. Pierwszy krok to <span class=\"m-page\">Urządzenia</span>.</p>\n<p class=\"m-p\"><strong>Jak podłączyć urządzenie.</strong> Każde urządzenie ma w panelu swoją kartę z 6-cyfrowym kodem:</p>\n<ul class=\"m-ul\"><li><strong>Wyświetlacz</strong> — <span class=\"m-control\"><i data-icon=\"eye\"></i>Otwórz</span> otwiera go w nowym oknie na tym komputerze; przeciągnij okno na telewizor lub drugi monitor. Na innym urządzeniu otwórz familiada.online → <span class=\"m-control\"><i data-icon=\"phone\"></i>Podłącz urządzenie</span> → <span class=\"m-control\">Podłącz kodem</span> i wpisz kod.</li><li><strong>Prowadzący</strong> i <strong>Przycisk</strong> — zeskanuj <span class=\"m-control\">Kod QR</span> telefonem albo wpisz kod przez <span class=\"m-control\"><i data-icon=\"phone\"></i>Podłącz urządzenie</span>. <span class=\"m-control\"><i data-icon=\"qr-code\"></i>QR na wyświetlaczu</span> pokazuje kod na Wyświetlaczu, żeby łatwo go zeskanować z sali.</li></ul>\n<p class=\"m-p\"><span class=\"m-control\"><i data-icon=\"copy\"></i>Kopiuj</span> kopiuje kod, a <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Udostępnij</span> wysyła urządzenie innej osobie — wpisz jej adres e-mail lub nazwę użytkownika albo wybierz znajomego. Odbiorca z kontem znajdzie urządzenie w <span class=\"m-page\">Podłącz urządzenie</span> → „Urządzenia udostępnione dla mnie”, a osoba bez konta — w wiadomości e-mail i na stronie <span class=\"m-page\">Moje powiadomienia</span> (→ <a class=\"m-ref\" href=\"?ch=14#s-14-5\">14.5</a>). Udostępnianie urządzeń wymaga konta.</p>\n<p class=\"m-p\">Kropki na górnym pasku panelu pokazują, które urządzenia są połączone.</p>\n<p class=\"m-p\"><strong>Bez części urządzeń:</strong></p>\n<ul class=\"m-ul\"><li>„Nie używaj tabletu prowadzącego” — grasz bez ekranu prowadzącego (np. prowadzący czyta z panelu),</li><li>„Przycisk fizyczny” — używasz własnych przycisków albo zgłoszeń z ręki; operator sam wskazuje, która drużyna była pierwsza.</li></ul>\n<p class=\"m-p\">Wyświetlacz jest zawsze potrzebny.</p>\n<p class=\"m-p\"><strong>Tryb testowy</strong> pokazuje wszystkie urządzenia w jednym oknie — do próby gry na jednym komputerze (wymaga dużego okna). Do prawdziwej rozgrywki używaj osobnych urządzeń (→ <a class=\"m-ref\" href=\"?ch=19#s-19-4\">19.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-17-2\"><span class=\"m-num\">17.2</span> Przygotowanie i rozpoczęcie gry</h2>\n<ol class=\"m-ol\"><li><strong>Urządzenia.</strong> Podłącz urządzenia (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>). Na karcie „Dźwięk” wybierz, skąd ma płynąć dźwięk: z <span class=\"m-page\">Panelu sterowania</span> albo z <strong>Wyświetlacza</strong> (np. głośniki telewizora). Przy dźwięku z Wyświetlacza naciśnij na nim <span class=\"m-control\"><i data-icon=\"speaker-on\"></i>Odblokuj dźwięk</span> — bez tego nie przejdziesz dalej. Wybierz <span class=\"m-control\">Dalej</span>.</li><li><strong>Podsumowanie ustawień.</strong> Sprawdź drużyny, wygląd z podglądem, głośność dźwięków, pytania rund i finału. <span class=\"m-control\">Losuj ponownie</span> zmienia wylosowane pytania, <span class=\"m-control\">Zmień ustawienia</span> otwiera ustawienia gry (→ <a class=\"m-ref\" href=\"?ch=16\">16</a>). Wybierz <span class=\"m-control\">Gotowe — przejdź do rozgrywki</span>.</li><li><strong>Rozpoczęcie gry.</strong> <span class=\"m-control\">Rozpocznij grę</span> odtwarza intro. Potem wybierz <span class=\"m-control\">Rozpocznij rundę</span>.</li></ol>\n<p class=\"m-p\">Przed startem ustaw Wyświetlacz na pełnym ekranie i nie zamykaj go. Przeglądarka może wyciszyć dźwięk po przeładowaniu strony albo uśpieniu telewizora — wtedy ponownie naciśnij <span class=\"m-control\"><i data-icon=\"speaker-on\"></i>Odblokuj dźwięk</span>.</p>\n<h2 class=\"m-h2\" id=\"s-17-3\"><span class=\"m-num\">17.3</span> Prowadzenie rund</h2>\n<p class=\"m-p\"><strong>Pojedynek.</strong></p>\n<ol class=\"m-ol\"><li>Po <span class=\"m-control\">Rozpocznij rundę</span> prowadzący czyta pytanie. Na ekranie prowadzącego pytanie jest zasłonięte do momentu pojedynku — odsłania się je przesunięciem palca.</li><li>Zawodnicy naciskają swój przycisk (A lub B). Panel pokaże, kto był pierwszy: <span class=\"m-control\">Zatwierdź: {drużyna}</span> albo <span class=\"m-control\">Ponów naciśnięcie</span>. Przy przycisku fizycznym operator wybiera drużynę A albo B.</li><li>Operator zaznacza odpowiedź zawodnika na liście albo daje X. Serwis sam rozstrzyga pojedynek: najwyżej punktowana odpowiedź wygrywa od razu; w przeciwnym razie odpowiada druga drużyna i wygrywa wyższa odpowiedź (przy remisie — pierwsza). Gdy obie odpowiedzi są spoza tablicy, pojedynek rozgrywa kolejna para zawodników.</li></ol>\n<p class=\"m-p\"><strong>Rozgrywka drużyny.</strong></p>\n<ul class=\"m-ul\"><li>Operator klika odpowiedź, a potem potwierdza — odpowiedź odsłania się na Wyświetlaczu z dźwiękiem, a punkty trafiają do puli rundy (na Wyświetlaczu „SUMA”).</li><li><span class=\"m-control\">X</span> dodaje błąd (licznik „1 / 3”, „2 / 3”, „3 / 3”); na Wyświetlaczu pojawia się X z dźwiękiem.</li><li><span class=\"m-control\">Rozpocznij odliczanie 3s</span> włącza trzysekundowe odliczanie, gdy odpowiedź się przeciąga. Po upływie czasu serwis sam doda X. Ponowne kliknięcie albo inna czynność wyłącza odliczanie bez X.</li><li><span class=\"m-control\">Oddaj kontrolę</span> przekazuje pytanie przeciwnikom — raz w rundzie, przed pierwszą odkrytą odpowiedzią.</li></ul>\n<p class=\"m-p\">Akcje odpowiedzi, błędu i oddania kontroli wymagają dwóch kliknięć: zaznacz, potem potwierdź — to chroni przed pomyłką.</p>\n<p class=\"m-p\">Prowadzący widzi na swoim ekranie pytanie i wszystkie odpowiedzi z punktami — odkryte są zaznaczone. Odpowiedzi są pod zasłoną, którą odsłania i zasłania przesunięciem palca.</p>\n<p class=\"m-p\"><strong>Kradzież.</strong> Po trzech błędach panel przechodzi do kradzieży („Runda … — kradzież”). Przeciwnicy podają jedną odpowiedź: operator zaznacza ją albo daje X. Trafienie przenosi pulę do przeciwników, pudło zostawia ją drużynie grającej.</p>\n<p class=\"m-p\"><strong>Koniec rundy.</strong> <span class=\"m-control\">Zakończ rundę</span> przyznaje pulę pomnożoną przez mnożnik rundy. Następnie operator może odsłonić pozostałe odpowiedzi i wybiera <span class=\"m-control\">Przejdź do następnej rundy</span>, <span class=\"m-control\">Przejdź do finału</span> albo <span class=\"m-control\">Przejdź do zakończenia gry</span> — zależnie od progu, ustawień finału i liczby pytań (→ <a class=\"m-ref\" href=\"?ch=3#s-3-6\">3.6</a>, <a class=\"m-ref\" href=\"?ch=3#s-3-7\">3.7</a>).</p>\n<h2 class=\"m-h2\" id=\"s-17-4\"><span class=\"m-num\">17.4</span> Prowadzenie finału</h2>\n<ol class=\"m-ol\"><li><span class=\"m-control\">Rozpocznij finał</span>. Drugi finalista powinien wyjść i założyć słuchawki (→ <a class=\"m-ref\" href=\"?ch=4#s-4-1\">4.1</a>).</li><li><strong>Pierwszy finalista.</strong> <span class=\"m-control\">Rozpocznij odliczanie (15s)</span> — prowadzący czyta pięć pytań, operator wpisuje odpowiedzi w pięć pól. Odliczanie można uruchomić tylko raz; zatrzymać je da się po wypełnieniu wszystkich pól.</li><li><strong>Ocena odpowiedzi.</strong> Dla każdego pytania operator wybiera pasującą odpowiedź z listy, „Nie ma na liście (0 pkt)” albo „Brak odpowiedzi”, a potem <span class=\"m-control\">Pokaż odpowiedź</span> i <span class=\"m-control\">Pokaż punkty</span> — Wyświetlacz odsłania je po kolei. <span class=\"m-control\">Dalej</span> przechodzi do następnego pytania.</li><li><span class=\"m-control\">Rozpocznij 2 rundę</span> — wraca drugi finalista; odpowiedzi pierwszego są ukryte.</li><li><strong>Drugi finalista.</strong> <span class=\"m-control\">Rozpocznij odliczanie (20s)</span>. Gdy drugi finalista powtórzy odpowiedź pierwszego, operator naciska <span class=\"m-control\"><i data-icon=\"check\"></i>Powtórzenie</span> — słychać sygnał, a finalista podaje inną odpowiedź. Ocena odpowiedzi — jak w punkcie 3.</li></ol>\n<p class=\"m-p\">Prowadzący widzi pytania, odpowiedzi finalistów i ich dopasowanie. Gdy finaliści osiągną cel (domyślnie 200 → <a class=\"m-ref\" href=\"?ch=4#s-4-3\">4.3</a>), operator może wybrać <span class=\"m-control\">Zakończ finał</span>, nie odsłaniając pozostałych pytań.</p>\n<h2 class=\"m-h2\" id=\"s-17-5\"><span class=\"m-num\">17.5</span> Zakończenie gry</h2>\n<p class=\"m-p\"><span class=\"m-control\">Zakończ grę</span> podsumowuje wynik, odtwarza zakończenie i pokazuje na Wyświetlaczu to, co wybrano w ustawieniach: logo, punkty albo kwotę nagrody (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). Potem możesz wybrać <span class=\"m-control\">Zacznij od nowa</span> albo <span class=\"m-control\">Wróć do moich gier</span>.</p>\n<p class=\"m-p\">Zawsze kończ grę tym przyciskiem. Jeśli zamkniesz panel w trakcie, gra pozostanie w toku i zablokuje zmianę ustawień (→ <a class=\"m-ref\" href=\"?ch=16#s-16-1\">16.1</a>). Logo na ekranie prowadzącego zależy od ustawienia „Logo prowadzącego” (→ <a class=\"m-ref\" href=\"?ch=16#s-16-3\">16.3</a>). Problemy z urządzeniami → <a class=\"m-ref\" href=\"?ch=19#s-19-5\">19.5</a>.</p>"
  },
  {
   "id": "19",
   "title": "Rozwiązywanie problemów",
   "sections": [
    {
     "id": "19.1",
     "title": "Problemy z kontem i dostępem",
     "level": 2
    },
    {
     "id": "19.2",
     "title": "Problemy z grami i zasobami",
     "level": 2
    },
    {
     "id": "19.3",
     "title": "Problemy z ankietami i głosowaniem",
     "level": 2
    },
    {
     "id": "19.4",
     "title": "Problemy podczas rozgrywki",
     "level": 2
    },
    {
     "id": "19.5",
     "title": "Problemy z urządzeniami",
     "level": 2
    },
    {
     "id": "19.6",
     "title": "Kontakt z pomocą",
     "level": 2
    }
   ],
   "html": "<p class=\"m-p\">Każdy punkt: <strong>objaw</strong> → możliwa przyczyna → co zrobić.</p>\n<h2 class=\"m-h2\" id=\"s-19-1\"><span class=\"m-num\">19.1</span> Problemy z kontem i dostępem</h2>\n<ul class=\"m-ul\"><li><strong>Nie przyszła wiadomość z potwierdzeniem konta</strong> → wiadomość trafiła do spamu albo adres ma literówkę → sprawdź folder spam; spróbuj założyć konto ponownie i wybierz <span class=\"m-control\"><i data-icon=\"refresh\"></i>Wyślij ponownie</span> (raz na godzinę) (→ <a class=\"m-ref\" href=\"?ch=5#s-5-2\">5.2</a>).</li><li><strong>„Potwierdź e-mail (link w skrzynce)” przy logowaniu</strong> → konto nie zostało potwierdzone → kliknij odnośnik z wiadomości „FAMILIADA — Potwierdzenie konta”.</li><li><strong>„Zły e-mail lub hasło.”</strong> → błędne hasło albo adres → sprawdź wielkość liter w haśle; możesz też logować się nazwą użytkownika; w razie potrzeby <span class=\"m-control\"><i data-icon=\"envelope\"></i>Przypomnij hasło</span> (→ <a class=\"m-ref\" href=\"?ch=5#s-5-7\">5.7</a>).</li><li><strong>Nie mogę ponownie zamówić resetu hasła</strong> → kolejną wiadomość można zamówić po godzinie → poczekaj na koniec odliczania i sprawdź spam.</li><li><strong>Pojawia się „Potwierdź, że jesteś człowiekiem”</strong> → kilka nieudanych prób logowania → wybierz <span class=\"m-control\">Kontynuuj</span> i zaloguj się ponownie.</li><li><strong>Zniknęły dane z konta gościa</strong> → konto gościa działa tylko w jednej przeglądarce i jest usuwane po 5 dniach bez wizyty → aby tego uniknąć, zapisz je jako zwykłe konto (→ <a class=\"m-ref\" href=\"?ch=5#s-5-4\">5.4</a>).</li><li><strong>„Niedostępne w koncie gościa”</strong> → ta funkcja wymaga konta → załóż konto, przenosząc dane gościa (→ <a class=\"m-ref\" href=\"?ch=5#s-5-4\">5.4</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-19-2\"><span class=\"m-num\">19.2</span> Problemy z grami i zasobami</h2>\n<ul class=\"m-ul\"><li><strong><span class=\"m-control\"><i data-icon=\"gamepad\"></i>Graj</span> jest nieaktywne</strong> → gra nie jest gotowa albo ankieta nie jest zamknięta → najedź na przycisk, aby zobaczyć powód; braki widać też pod nazwą gry (→ <a class=\"m-ref\" href=\"?ch=6#s-6-2\">6.2</a>, <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</li><li><strong>Nie mogę edytować gry</strong> → ankieta jest otwarta lub zatrzymana, gra jest otwarta w innym miejscu albo trwa jej rozgrywka → przerwij lub zamknij ankietę, zamknij inne okno z tą grą, zakończ rozgrywkę (→ <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>).</li><li><strong>„Ta gra jest otwarta gdzie indziej.”</strong> → gra jest otwarta w innej karcie lub na innym urządzeniu (edytor, ustawienia, ankieta, panel sterowania) → zamknij tamto okno i spróbuj ponownie.</li><li><strong>Odpowiedź się nie zapisuje</strong> → zawiera znaki, których nie pokaże Wyświetlacz (np. emotki), albo jest za długa → usuń te znaki; odpowiedź może mieć do 17 znaków (→ <a class=\"m-ref\" href=\"?ch=7#s-7-3\">7.3</a>).</li><li><strong>Import pliku nie działa</strong> → plik nie jest grą z serwisu albo jest uszkodzony → użyj pliku <code class=\"m-code\">.famgame</code> wyeksportowanego z serwisu (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>); przy imporcie tekstu sprawdź zapis (→ <a class=\"m-ref\" href=\"?ch=7#s-7-7\">7.7</a>).</li><li><strong>Nie mogę edytować logo</strong> → trwa rozgrywka albo są otwarte ustawienia gry; na telefonie edytor jest niedostępny → zakończ grę lub zamknij ustawienia; użyj komputera lub tabletu (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>).</li><li><strong>„Ten element bazy jest właśnie edytowany…”</strong> → ktoś inny edytuje ten element → poczekaj chwilę i spróbuj ponownie (→ <a class=\"m-ref\" href=\"?ch=12#s-12-5\">12.5</a>).</li><li><strong><span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Wyślij</span> jest nieaktywne</strong> → gra ma ankietę (wysłać można tylko szkic), pochodzi z Gier Społeczności lub z materiałów demo, albo nie masz znajomych → zob. <a class=\"m-ref\" href=\"?ch=11#s-11-2\">11.2</a>.</li></ul>\n<h2 class=\"m-h2\" id=\"s-19-3\"><span class=\"m-num\">19.3</span> Problemy z ankietami i głosowaniem</h2>\n<ul class=\"m-ul\"><li><strong>Odbiorca nie dostał zaproszenia</strong> → ma wyłączone powiadomienia albo wiadomość trafiła do spamu → poproś o sprawdzenie spamu; znajomy znajdzie zaproszenie także w <span class=\"m-page\">Zadaniach</span> (→ <a class=\"m-ref\" href=\"?ch=15#s-15-4\">15.4</a>); możesz wysłać <span class=\"m-control\">Przypomnij</span> (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>).</li><li><strong>„Już oddałeś głos w tej ankiecie”</strong> → w tej przeglądarce już zagłosowano → każdy głosuje raz.</li><li><strong>Głos nie został policzony</strong> → głosujący wyszedł przed ostatnim pytaniem → odpowiedzi wysyłają się dopiero po ostatnim pytaniu (→ <a class=\"m-ref\" href=\"?ch=15#s-15-3\">15.3</a>).</li><li><strong><span class=\"m-control\"><i data-icon=\"polls\"></i>Podlicz głosy</span> jest nieaktywne</strong> → ankieta nie jest zatrzymana albo ma mniej niż 10 pełnych ankiet → zatrzymaj ankietę; zbierz więcej głosów (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li><li><strong>Nie mogę zatwierdzić podliczenia</strong> → któreś pytanie ma mniej niż 3 odpowiedzi z co najmniej 4 punktami → w ankiecie tekstowej połącz podobne odpowiedzi; w razie potrzeby wznów głosowanie (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-19-4\"><span class=\"m-num\">19.4</span> Problemy podczas rozgrywki</h2>\n<ul class=\"m-ul\"><li><strong>Przycisk przejścia dalej długo jest nieaktywny</strong> (np. <span class=\"m-control\">Rozpocznij rundę</span> po intro) → Wyświetlacz jest zminimalizowany albo otwarty jako karta obok panelu sterowania → otwórz Wyświetlacz w osobnym oknie na pełnym ekranie (telewizor, drugi monitor).</li><li><strong>Gra wstrzymała się z komunikatem o braku urządzenia</strong> → zob. <a class=\"m-ref\" href=\"?ch=19#s-19-5\">19.5</a>.</li><li><strong>Gra zakończyła się po zmianie ustawień</strong> → zmiana ustawień w trakcie rozgrywki kończy bieżącą grę → zmieniaj ustawienia przed startem albo po zakończeniu; przejście do podręcznika i powrót nie przerywa gry (→ <a class=\"m-ref\" href=\"?ch=16#s-16-1\">16.1</a>).</li><li><strong>Gra nie została zakończona</strong> → zamknięto panel sterowania bez zakończenia gry → zawsze kończ grę przyciskiem <span class=\"m-control\">Zakończ grę</span> na ekranie końcowym (→ <a class=\"m-ref\" href=\"?ch=17#s-17-5\">17.5</a>).</li><li><strong>Opóźnienia tablicy lub dźwięku w trybie testowym</strong> → wszystkie ekrany w jednej karcie i częste przełączanie kart → tryb testowy służy do próby; do prawdziwej gry używaj osobnych urządzeń (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>Gra czeka na dźwięk z Wyświetlacza</strong> → po każdym otwarciu Wyświetlacza i po wyciszeniu strony przez przeglądarkę (np. uśpiony telewizor) trzeba ponownie odblokować dźwięk → naciśnij <span class=\"m-control\"><i data-icon=\"speaker-on\"></i>Odblokuj dźwięk</span> przed startem i nie przeładowuj Wyświetlacza w trakcie gry (→ <a class=\"m-ref\" href=\"?ch=17#s-17-2\">17.2</a>).</li><li><strong><span class=\"m-control\">Gotowe — przejdź do rozgrywki</span> jest nieaktywne</strong> → finał nie ma 5 pytań → wybierz 5 pytań finałowych albo tryb losowy (→ <a class=\"m-ref\" href=\"?ch=16#s-16-5-2\">16.5.2</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-19-5\"><span class=\"m-num\">19.5</span> Problemy z urządzeniami</h2>\n<ul class=\"m-ul\"><li><strong>Gra wstrzymuje się co jakiś czas, urządzenie pokazuje się jako rozłączone</strong> → telefon z przyciskami albo tablet prowadzącego zgasł lub przełączono na inną aplikację → trzymaj ekran włączony przez całą grę, podłącz urządzenie do ładowarki, wydłuż czas automatycznej blokady ekranu i nie przełączaj aplikacji. Gdy używasz przycisków fizycznych albo grasz bez tabletu prowadzącego — zaznacz odpowiednią opcję w panelu (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>). Po powrocie do strony urządzenie łączy się samo w kilka sekund.</li><li><strong>Kod QR zeskanowano kilka razy</strong> → na tym samym telefonie działa najnowsza karta, a starsze pokazują komunikat oczekiwania → wracaj do tej samej karty zamiast skanować ponownie; zbędne karty zamknij.</li><li><strong>„Urządzenie czeka na swoją kolej”</strong> → to samo urządzenie (przyciski, ekran prowadzącego lub Wyświetlacz) jest otwarte na innym telefonie albo w innej przeglądarce → zamknij tamtą kartę albo poczekaj kilkanaście sekund, aż się rozłączy.</li><li><strong>„Obróć telefon poziomo…”</strong> na przycisku do pojedynku → przycisk działa w poziomie → obróć telefon i wyłącz blokadę obrotu ekranu.</li><li><strong>Brak dźwięku</strong> → dźwięk nie jest odblokowany albo urządzenie jest wyciszone → sprawdź, skąd ma płynąć dźwięk (→ <a class=\"m-ref\" href=\"?ch=17#s-17-2\">17.2</a>), głośność urządzenia i głośność w podsumowaniu ustawień.</li></ul>\n<h2 class=\"m-h2\" id=\"s-19-6\"><span class=\"m-num\">19.6</span> Kontakt z pomocą</h2>\n<p class=\"m-p\">Na dole każdej strony jest przycisk <span class=\"m-control\">Kontakt</span>. W oknie „Napisz do nas”:</p>\n<ul class=\"m-ul\"><li>„Twój e-mail” — na ten adres przyjdzie odpowiedź (po zalogowaniu wpisany sam),</li><li>„Temat” i „Wiadomość” — opisz problem,</li><li>„Numer zgłoszenia (opcjonalnie)” — jeśli piszesz w sprawie wcześniejszego zgłoszenia, wiadomość zostanie do niego dołączona,</li><li>„Załączniki” — do 5 plików po 5 MB, np. zrzuty ekranu.</li></ul>\n<p class=\"m-p\">Po wysłaniu dostaniesz numer zgłoszenia. Aby szybciej rozwiązać problem, napisz:</p>\n<ul class=\"m-ul\"><li>co robiłeś (na której stronie, krok po kroku),</li><li>czego się spodziewałeś i co się stało,</li><li>treść komunikatu, jeśli się pojawił — najlepiej ze zrzutem ekranu,</li><li>na jakim urządzeniu i w jakiej przeglądarce.</li></ul>"
  },
  {
   "id": "20",
   "title": "Słownik pojęć",
   "sections": [
    {
     "id": "20.1",
     "title": "Pojęcia teleturniejowe",
     "level": 2
    },
    {
     "id": "20.2",
     "title": "Pojęcia związane z ankietami i współpracą",
     "level": 2
    },
    {
     "id": "20.3",
     "title": "Pojęcia związane z grą i urządzeniami",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-20-1\"><span class=\"m-num\">20.1</span> Pojęcia teleturniejowe</h2>\n<ul class=\"m-ul\"><li><strong>Bank (pula rundy)</strong> — suma punktów odkrytych w rundzie; po rundzie trafia do zwycięskiej drużyny (→ <a class=\"m-ref\" href=\"?ch=3#s-3-4\">3.4</a>, <a class=\"m-ref\" href=\"?ch=3#s-3-6\">3.6</a>).</li><li><strong>Błąd (X)</strong> — odpowiedź spoza tablicy albo brak odpowiedzi w 3 sekundy (→ <a class=\"m-ref\" href=\"?ch=3#s-3-5\">3.5</a>).</li><li><strong>Cel finału</strong> — liczba punktów, którą muszą razem zdobyć finaliści (→ <a class=\"m-ref\" href=\"?ch=4#s-4-3\">4.3</a>).</li><li><strong>Finał</strong> — ostatni etap: dwóch finalistów, pięć pytań (→ <a class=\"m-ref\" href=\"?ch=4\">4</a>).</li><li><strong>Głowa rodziny</strong> — kapitan drużyny w teleturnieju (→ <a class=\"m-ref\" href=\"?ch=3#s-3-3\">3.3</a>).</li><li><strong>Kradzież (przejęcie punktów)</strong> — po trzech błędach przeciwnicy mają jedną odpowiedź; trafienie daje im bank (→ <a class=\"m-ref\" href=\"?ch=3#s-3-5\">3.5</a>).</li><li><strong>Mnożnik</strong> — ile razy liczą się punkty z danej rundy (→ <a class=\"m-ref\" href=\"?ch=3#s-3-2\">3.2</a>).</li><li><strong>Pojedynek</strong> — początek rundy: zawodnicy obu drużyn rywalizują o prawo gry (→ <a class=\"m-ref\" href=\"?ch=3#s-3-3\">3.3</a>).</li><li><strong>Próg</strong> — łączny wynik, po którego osiągnięciu gra przechodzi do finału (→ <a class=\"m-ref\" href=\"?ch=3#s-3-6\">3.6</a>).</li><li><strong>Tablica</strong> — lista odpowiedzi z punktami, odsłanianych w trakcie rundy (→ <a class=\"m-ref\" href=\"?ch=2#s-2-2\">2.2</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-20-2\"><span class=\"m-num\">20.2</span> Pojęcia związane z ankietami i współpracą</h2>\n<ul class=\"m-ul\"><li><strong>Ankieta</strong> — zbieranie odpowiedzi od głosujących, z których powstaje tablica (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>).</li><li><strong>Pełna ankieta</strong> — głos osoby, która odpowiedziała na wszystkie pytania; od nich liczy się punkty (→ <a class=\"m-ref\" href=\"?ch=2#s-2-4\">2.4</a>, <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li><li><strong>Podliczanie</strong> — opracowanie głosów w punkty przed zamknięciem ankiety (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li><li><strong>Kopia</strong> — niezależny egzemplarz gry lub logo, powielony dla siebie lub wysłany znajomemu (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>, <a class=\"m-ref\" href=\"?ch=11\">11</a>).</li><li><strong>Subskrybent</strong> — osoba bez konta, którą zapraszasz do ankiet przez e-mail (→ <a class=\"m-ref\" href=\"?ch=14\">14</a>).</li><li><strong>Udostępnienie</strong> — wspólny dostęp do bazy pytań albo urządzenia (→ <a class=\"m-ref\" href=\"?ch=12\">12</a>, <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>Zadanie</strong> — zaproszenie do ankiety, które otrzymałeś (→ <a class=\"m-ref\" href=\"?ch=15#s-15-4\">15.4</a>).</li><li><strong>Zaproszenie</strong> — prośba o znajomość, subskrypcję, dostęp do bazy lub udział w ankiecie.</li><li><strong>Znajomy</strong> — inna osoba z kontem, z którą połączyliście się zaproszeniem (→ <a class=\"m-ref\" href=\"?ch=10\">10</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-20-3\"><span class=\"m-num\">20.3</span> Pojęcia związane z grą i urządzeniami</h2>\n<ul class=\"m-ul\"><li><strong>Baza pytań</strong> — biblioteka pytań do wielokrotnego użytku (→ <a class=\"m-ref\" href=\"?ch=9\">9</a>).</li><li><strong>Ekran prowadzącego (Prowadzący)</strong> — urządzenie z pytaniem i wszystkimi odpowiedziami dla osoby czytającej pytania (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>Gra preparowana</strong> — gra z odpowiedziami i punktami wpisanymi ręcznie, bez ankiety (→ <a class=\"m-ref\" href=\"?ch=7#s-7-1\">7.1</a>).</li><li><strong>Gry Społeczności</strong> — publiczny katalog gotowych gier (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li><li><strong>Logo</strong> — napis lub obraz pokazywany podczas gry (→ <a class=\"m-ref\" href=\"?ch=8\">8</a>).</li><li><strong>Panel sterowania</strong> — strona operatora, z której prowadzi się grę (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>).</li><li><strong>Przycisk do pojedynku</strong> — telefon z przyciskami A i B dla zawodników (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>Szkic</strong> — gra w przygotowaniu, jeszcze niegotowa do rozegrania (→ <a class=\"m-ref\" href=\"?ch=6#s-6-2\">6.2</a>).</li><li><strong>Tryb testowy</strong> — wszystkie urządzenia w jednym oknie, do próby (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>Wyświetlacz</strong> — tablica dla uczestników i publiczności, np. na telewizorze (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li></ul>"
  }
 ]
};

export default manual;

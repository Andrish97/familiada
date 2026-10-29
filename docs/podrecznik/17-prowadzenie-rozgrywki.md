# 17. Prowadzenie rozgrywki i podłączanie urządzeń

Rozgrywkę prowadzi **operator** w *Panelu sterowania*. Pozostałe urządzenia pokazują grę
uczestnikom i prowadzącemu. Ten rozdział opisuje je razem — etap po etapie: co robi operator
i co w tym czasie dzieje się na pozostałych ekranach. Zasady rund (→ 3) i finału (→ 4).

## 17.1 Urządzenia i ich podłączanie

| Urządzenie | Rola | Gdzie zwykle działa |
|---|---|---|
| *Panel sterowania* | operator prowadzi całą grę: odsłania odpowiedzi, daje błędy, przechodzi dalej | komputer z dużym ekranem |
| **Wyświetlacz** | tablica dla uczestników i publiczności — odpowiedzi, punkty, X, logo | telewizor, projektor, drugi monitor |
| **Prowadzący** | ekran dla osoby czytającej pytania — pytanie i wszystkie odpowiedzi z punktami | tablet lub telefon |
| **Przycisk do pojedynku** | dwa przyciski, A i B, dla zawodników w pojedynku | telefon ułożony poziomo |

*Panel sterowania* nie działa na telefonie — potrzebny jest komputer lub tablet z szerokim
ekranem. Prowadzący nie steruje grą — robi to operator. Jedna osoba może łączyć obie role, ale wymaga to
sprawnego przechodzenia między rozmową z uczestnikami a obsługą panelu.

**Jak otworzyć Panel sterowania.** Zaznacz gotową grę w *Moich grach* i wybierz [Graj].
Pierwszy krok to *Urządzenia*. Na górnym pasku panelu kropki pokazują, które urządzenia są
połączone; przyciski urządzeń pozwalają wrócić do ich kodów i udostępniania także w trakcie gry.

![Krok „Urządzenia” — kody, Otwórz, Kod QR i kropki połączeń](zrzut:control-devices)

**Wyświetlacz** jest zawsze potrzebny — bez niego nie przejdziesz dalej.

- **Drugi monitor lub projektor przy komputerze.** Włącz rozszerzony pulpit (Windows: Win+P,
  Mac: ⌘+F1), wybierz [Otwórz] przy Wyświetlaczu, przeciągnij okno na drugi ekran i włącz pełny
  ekran.
- **Telewizor z przeglądarką.** W przeglądarce telewizora otwórz adres
  `familijna.app/connect/tv/` — uproszczoną stronę z polem na 6-cyfrowy kod i przyciskiem
  [Podłącz]. Wpisz kod Wyświetlacza z panelu; strzałki góra/dół przełączają między polem
  a przyciskiem, OK/Enter zatwierdza. Możesz też użyć zwykłej strony [Podłącz urządzenie].
  Logowanie na telewizorze nie jest potrzebne.
- **Inne urządzenie.** Otwórz familijna.app → [Podłącz urządzenie] → [Podłącz kodem] i wpisz kod.

![Strona dla telewizora — kod Wyświetlacza](zrzut:play-connect-tv)

> Uwaga: Wyświetlacz musi być widoczny przez całą grę. Gdy jego okno lub karta są w tle,
> przeglądarka może wstrzymać animacje i aktualizację tablicy. Gdy Wyświetlacz jest otwarty w tej samej
> przeglądarce co panel sterowania i schowa się w tle, panel pokaże nad podpowiedzią ostrzeżenie.

**Prowadzący** i **Przycisk** — zeskanuj [Kod QR] telefonem albo wpisz kod przez
[Podłącz urządzenie]. Strona *Podłącz urządzenie* działa bez logowania: po wpisaniu kodu zobaczysz
nazwę gry i jej właściciela — sprawdź je i zatwierdź. Na telefonie i tablecie jest też
[Skanuj QR] (skanowanie aparatem; jeśli przeglądarka tego nie obsługuje, użyj aparatu systemowego). [QR na wyświetlaczu] pokazuje kody na Wyświetlaczu, żeby ekipa mogła je
szybko zeskanować z sali. Najlepiej użyć dwóch osobnych urządzeń.

![Kod QR Prowadzącego w panelu](zrzut:play-control-qr-modal)
![Strona *Podłącz urządzenie*](zrzut:connect-device)
![Po wpisaniu kodu — nazwa gry i właściciel do sprawdzenia](zrzut:play-connect-confirm)

**Telefon i tablet nie mogą zgasnąć.** Strony Prowadzącego i Przycisku same proszą system, żeby
nie wygaszał ekranu. iPhone i iPad (czasem też Android) zgadzają się na to dopiero po dotknięciu
strony — to zabezpieczenie przeglądarki przed stronami, które bez wiedzy użytkownika trzymałyby
włączony ekran i rozładowywały baterię. Dlatego po otwarciu urządzenia i po każdym powrocie
z innej aplikacji może pojawić się ekran „Ekran może się wygasić”. Naciśnij [Nie wygaszaj ekranu]
— to dotknięcie daje zgodę. Bez niego ekran zgaśnie po czasie automatycznej blokady, a urządzenie
straci połączenie z grą.

![iPhone — ekran „Ekran może się wygasić” na Przycisku](zrzut:play-buzzer-wake@phone-landscape)

> Uwaga: zgaszony telefon lub tablet wypada z gry. Przed rozgrywką na każdym z nich:
> - **wyłącz tryb oszczędzania energii** (iPhone: Tryb niskiego zużycia energii, który skraca
>   automatyczną blokadę do 30 sekund; Android: Oszczędzanie baterii) — inaczej system może
>   zgasić ekran mimo zgody;
> - **podłącz ładowarkę** — gra trwa długo, a przy niskiej baterii system sam włącza oszczędzanie;
> - **ustaw automatyczną blokadę ekranu** na najdłuższy czas albo „Nigdy”;
> - **nie blokuj ekranu przyciskiem i nie przełączaj aplikacji** — strona w tle traci połączenie;
> - **włącz tryb „Nie przeszkadzać”** — przychodzące połączenia i powiadomienia nie zasłonią strony,
>   a internet działa dalej (nie używaj trybu samolotowego, bo wyłącza też internet);
> - **zrób próbę**: podłącz urządzenie, odłóż je na kilka minut i sprawdź, czy ekran nadal świeci,
>   a kropka urządzenia w panelu jest zielona.

Każde urządzenie działa w jednym miejscu naraz. Otwarcie go w nowej karcie albo na innym sprzęcie
(np. po ponownym zeskanowaniu kodu) od razu przejmuje jego rolę, a poprzedni ekran pokazuje
„Urządzenie otwarto w innym miejscu”. Aby wrócić do poprzedniego ekranu, kliknij na nim
[Używaj tutaj] — wtedy wyłączy się ten drugi.

![Poprzedni ekran Przycisku — urządzenie otwarto w innym miejscu](zrzut:device-lease-replaced@phone-landscape)

[Kopiuj] kopiuje kod. [Udostępnienia] (obok kodu, z liczbą osób) pokazuje, komu urządzenie
jest udostępnione w tej sesji — ikoną kosza cofniesz udostępnienie. [Udostępnij] (przy
Wyświetlaczu obok [Otwórz], przy Prowadzącym i Przycisku pod kodami QR) wysyła urządzenie innej
osobie — wpisz jej adres e-mail lub nazwę użytkownika albo zaznacz znajomych i wybierz
[Udostępnij]; okno się zamknie. Odbiorca z kontem znajdzie urządzenie w
*Podłącz urządzenie* → „Urządzenia udostępnione dla mnie”, a osoba bez konta — w wiadomości
e-mail i na stronie *Moje powiadomienia*. Na liście udostępnionych telefon i tablet
pokazują Prowadzącego i Przycisk, a komputer — Wyświetlacz. Udostępnianie urządzeń wymaga konta.

![Udostępnienia urządzenia — komu jest udostępnione w tej sesji](zrzut:play-control-share-device-list)
![Udostępnij urządzenie — adres lub znajomi](zrzut:control-share-send)

**Bez części urządzeń:**

- „Nie używaj tabletu prowadzącego” — grasz bez ekranu prowadzącego; prowadzący czyta z panelu.
- „Przycisk fizyczny” — używasz własnych przycisków albo zgłoszeń z ręki; w pojedynku operator
  sam wskazuje drużynę, która była pierwsza.

![Przycisk fizyczny zamiast telefonu; Prowadzący jeszcze niepodłączony](zrzut:play-control-devices-mixed)

**Tryb testowy** pokazuje Wyświetlacz, Prowadzącego i Przycisk w jednym oknie, obok panelu — do
próby gry na jednym komputerze (wymaga dużego okna). Do prawdziwej rozgrywki używaj osobnych
urządzeń (→ 19.4).

**Ekran prowadzącego** ma dwie części: w pionie górną i dolną, w poziomie lewą i prawą. Pierwsza
pokazuje etap gry (np. „RUNDA 1 — ROZGRYWKA”) i pytanie, druga — materiały: odpowiedzi
z punktami, pytania finału albo szczegóły oceny odpowiedzi. Druga część bywa przykryta
**zasłoną**, żeby gracze nie podejrzeli odpowiedzi: w pionie przesuń ją w dół, aby odsłonić,
i w górę, aby zasłonić; w poziomie — w prawo i w lewo. Odsłonięcie widzi tylko prowadzący.
Po każdej zmianie etapu zasłona może wrócić.

Motyw wybrany w ustawieniach gry dopasowuje również wygląd Prowadzącego.
Skrzydła, Radar, Kaseton, Wstęga i Most mają osobne ramki oraz zasłony,
z kolorami oprawy zależnymi od tła i akcentami w kolorach drużyn.
Układ pytania i odpowiedzi oraz sposób odsłaniania pozostają takie same.

![Prowadzący w motywie Radar — pytanie i odpowiedzi](zrzut:host-theme-radar@tablet-landscape)

![Ekran prowadzącego — prawa część pod zasłoną](zrzut:play-host-duel@tablet-landscape)
![Zasłona odsunięta — pytanie i odpowiedzi z punktami](zrzut:play-host-duel-open@tablet-landscape)

**Rozłączenie urządzenia.** Gdy urządzenie przestanie odpowiadać, po kilku sekundach panel
pokaże, którego brakuje i dlaczego: **uśpione** (zablokowany ekran telefonu albo inna aplikacja
na wierzchu — odblokuj je i wróć do strony urządzenia) albo **bez połączenia** (sprawdź internet;
w razie potrzeby podłącz urządzenie ponownie przyciskami na górnym pasku). Grę wstrzymuje brak
Wyświetlacza, a w pojedynku także brak Przycisku (gdy nie używasz przycisków fizycznych). Brak
Prowadzącego albo Przycisku w pozostałych momentach nie zatrzymuje gry — panel pokazuje wtedy
ostrzeżenie nad podpowiedzią. Wcześniej zatwierdzone czynności pozostają zapisane, a uruchomiony
zegar dalej odlicza czas. Najczęstsze przyczyny i rozwiązania → 19.5.

![Rozłączony Wyświetlacz — gra wstrzymana](zrzut:play-control-device-lost)

![Uśpiony Prowadzący i Przycisk — ostrzeżenie, gra trwa](zrzut:play-control-device-asleep)

## 17.2 Przygotowanie i rozpoczęcie gry

1. **Urządzenia.** Podłącz urządzenia (→ 17.1). Na karcie „Dźwięk” wybierz, skąd ma płynąć
   dźwięk:
   - *Panel sterowania* — dźwięk z komputera operatora. Przy telewizorze podłączonym przez HDMI
     zwykle wystarczy wybrać telewizor jako wyjście dźwięku komputera.
   - **Wyświetlacz** — dźwięk z osobnego telewizora lub urządzenia. Naciśnij na Wyświetlaczu
     [Odblokuj dźwięk] (na telewizorze — OK lub Enter na pilocie); bez tego nie przejdziesz dalej.

   Wybierz [Dalej].
2. **Podsumowanie ustawień.** Sprawdź drużyny, wygląd z podglądem Wyświetlacza i ekranu
   prowadzącego, dźwięki, pytania rund i finału. Głośność zmieniona tutaj obowiązuje tylko w tej
   rozgrywce — przy kolejnej wczytają się wartości z ustawień gry. [Losuj ponownie] zmienia
   wylosowane pytania, [Zmień ustawienia] otwiera ustawienia gry (→ 16). Wybierz
   [Gotowe — przejdź do rozgrywki] — ten przycisk jest nieaktywny, gdy finał nie ma 5 pytań.
3. **Rozpoczęcie gry.** Wyświetlacz pokazuje teraz nazwy drużyn. Przycisk do pojedynku jest już
   widoczny, ale nie przyjmuje naciśnięć. W tym stanie panel może czekać do właściwego startu.
   [Rozpocznij grę] odtwarza intro i wejście logo na Wyświetlaczu. Potem wybierz
   [Rozpocznij rundę].

![Dźwięk z Wyświetlacza — trzeba go odblokować na Wyświetlaczu](zrzut:play-control-devices-sound-display)
![Podsumowanie ustawień](zrzut:control-summary)
![Rozpoczęcie gry](zrzut:play-control-intro)
![Wyświetlacz po rozpoczęciu — logo i nazwy drużyn](zrzut:play-display-logo)

Przeglądarka może wyciszyć dźwięk Wyświetlacza po jego przeładowaniu albo uśpieniu telewizora —
wtedy przycisk [Odblokuj dźwięk] pojawi się ponownie, a panel poczeka na jego naciśnięcie.

**Jak działa panel.** Kolumna podpowiedzi mówi, kto teraz odpowiada, jaki jest następny krok
i reguły, których nie widać na przyciskach (np. że koniec odliczania 3 s to X, a trzeci X
oznacza kradzież); przy zaznaczonym kafelku przypomina o drugim kliknięciu. Pasek pod
tablicą pokazuje drużynę grającą i pulę rundy. Przycisk przejścia dalej zmienia nazwę zależnie
od kroku (np. [Przejdź do finału]). Czynności, które zmieniają wynik — odsłonięcie odpowiedzi,
X, przyjęcie zgłoszenia, oddanie kontroli — wymagają **dwóch kliknięć**: pierwsze zaznacza
kafelek, drugie zatwierdza. Wyszarzone przyciski są chwilowo niedostępne, np. w czasie dźwięku
lub animacji — poczekaj, aż panel je odblokuje.

![Pierwsze kliknięcie zaznacza, drugie zatwierdza](zrzut:play-control-duel-armed)

## 17.3 Prowadzenie rund

**Pojedynek.**

1. Po [Rozpocznij rundę] na ekranie prowadzącego pojawia się „RUNDA 1 — PRZYCISK”. Pytanie jest
   pod zasłoną, żeby gracze nie zobaczyli go przed zadaniem.
2. Prowadzący czyta pytanie, zawodnicy naciskają swój przycisk (A lub B) — przycisk rozświetla się
   od razu. Panel pokazuje, kto był pierwszy: zatwierdź [Zatwierdź: {drużyna}] albo wybierz
   [Ponów naciśnięcie]. Przy przycisku fizycznym operator wybiera drużynę A lub B i zatwierdza.
3. Operator zaznacza odpowiedź zawodnika albo daje X. Serwis sam rozstrzyga pojedynek:
   najwyżej punktowana odpowiedź wygrywa od razu; w przeciwnym razie odpowiada druga drużyna
   i wygrywa wyższa odpowiedź (przy remisie — pierwsza). Gdy obie odpowiedzi są spoza tablicy,
   pojedynek rozgrywa kolejna para zawodników. Wyświetlacz pokazuje, która drużyna gra.

![Start rundy](zrzut:play-control-round-start)
![Przycisk — gotowy do naciśnięcia](zrzut:play-buzzer-on@phone-landscape)
![Przycisk — drużyna A nacisnęła pierwsza](zrzut:play-buzzer-pushed@phone-landscape)
![Panel — kto był pierwszy: Zatwierdź: {drużyna} albo Ponów naciśnięcie](zrzut:play-control-duel)
![Przycisk fizyczny — operator wybiera drużynę](zrzut:play-control-duel-physical)
![Wyświetlacz — lampka drużyny, która nacisnęła](zrzut:play-display-duel)

**Rozgrywka drużyny** („RUNDA 1 — ROZGRYWKA” u prowadzącego).

- Trafiona odpowiedź: zaznacz ją i zatwierdź. Na Wyświetlaczu odsłania się tekst, potem punkty,
  a na końcu nowa suma puli rundy. Odsłonięty kafelek w panelu robi się zielony.
- [X] dodaje błąd (licznik „1 / 3”, „2 / 3”, „3 / 3”); na Wyświetlaczu pojawia się X z dźwiękiem.
- [Rozpocznij odliczanie 3s] włącza trzysekundowe odliczanie, gdy odpowiedź się przeciąga. Po
  upływie czasu serwis sam doda X. Ponowne kliknięcie albo inna czynność wyłącza odliczanie bez X.
- [Oddaj kontrolę] przekazuje pytanie przeciwnikom — raz w rundzie, zaraz po wygranym
  pojedynku: pierwsza odpowiedź drużyny (trafiona albo X) wyłącza tę możliwość. Na ekranie prowadzącego pojawia się wtedy czerwona podpowiedź.

Prowadzący widzi pytanie i wszystkie odpowiedzi z punktami, np. „2) Rower (24)” — zielony
wiersz to odpowiedź już pokazana publiczności. Pulę, X i wyniki drużyn sprawdza na Wyświetlaczu.

![Rozgrywka zaraz po pojedynku — zaznaczona odpowiedź i Oddaj kontrolę](zrzut:play-control-play-pass)
![Odliczanie 3 s](zrzut:play-control-timer3)
![Wyświetlacz — odsłonięte odpowiedzi, pula i X](zrzut:play-display-play)
![Ekran prowadzącego — pokazane odpowiedzi na zielono](zrzut:play-host-play@tablet-landscape)

**Kradzież** („RUNDA 1 — KRADZIEŻ”). Po trzech błędach przeciwnicy podają jedną odpowiedź:
operator zaznacza ją albo daje X. Trafienie przenosi pulę do przeciwników, pudło zostawia ją
drużynie grającej.

![Kradzież — panel](zrzut:play-control-steal)
![Kradzież — Wyświetlacz](zrzut:play-display-steal)
![Kradzież — ekran prowadzącego](zrzut:play-host-steal@tablet-landscape)

**Koniec rundy.** [Zakończ rundę] przyznaje pulę pomnożoną przez mnożnik rundy. Potem możesz
odsłonić pozostałe odpowiedzi dla publiczności („RUNDA 1 — ODSŁANIANIE”) — nie dają już punktów.
Następnie wybierz [Przejdź do następnej rundy], [Przejdź do finału] albo
[Przejdź do zakończenia gry]. Gdy gra się kończy (próg bez finału albo brak pytań), pozostałych
odpowiedzi się nie odsłania (→ 3.6, 3.7).

![Zakończ rundę](zrzut:play-control-round-end)
![Odsłanianie pozostałych odpowiedzi](zrzut:play-control-reveal)
![Odsłanianie — ekran prowadzącego](zrzut:play-host-reveal@tablet-landscape)

> Uwaga: dobierz liczbę pytań i próg punktów tak, aby pytania nie skończyły się przed
> planowanym finałem — sam brak pytań nie prowadzi do finału.

## 17.4 Prowadzenie finału

**Przygotowanie.** Przygotuj miejsce oczekiwania i słuchawki z muzyką dla drugiego zawodnika
(→ 4.1). [Rozpocznij finał] otwiera tablicę finału: wynik zwycięskiej drużyny zostaje, w miejscu
wyniku przeciwników pojawia się zegar, a suma finału — na górze.

![Rozpoczęcie finału](zrzut:play-control-final-start)

**Gracz 1 — wpisywanie.**

1. Uruchom zegar (15 s) przyciskiem [Rozpocznij odliczanie (15s)] albo skrótem Ctrl+Enter
   (Mac: ⌘+Enter) — zegar nie rusza sam.
2. Prowadzący czyta pytania, operator wpisuje odpowiedzi w pięć pól. Enter i strzałka w dół
   przechodzą do następnego pustego pola, strzałka w górę — do poprzedniego. Aby poprawić wpis,
   kliknij jego pole.
3. Zegar można zatrzymać dopiero po wpisaniu wszystkich pięciu odpowiedzi; po upływie czasu
   przejdziesz dalej także z brakami. Każdy gracz musi wykorzystać zegar.

Prowadzący widzi „FINAŁ RUNDA 1 — ODLICZANIE 12s” i pięć pytań ze statusem: „wpisano”, „brak”
albo (u drugiego gracza) „powtórzenie”. Literówki możesz poprawić także po upływie czasu.

Wyświetlacz ma na odpowiedź 11 miejsc. Litery, które się nie zmieszczą, są pomarańczowe i przekreślone — w polach wpisywania, na przyciskach odpowiedzi przy ocenie i pod [Pokaż odpowiedź]. Słowo
ucięte w środku Wyświetlacz kończy kropką, np. „Kawa z mlekiem” → „Kawa z ml.”. Znaki, których
Wyświetlacz nie pokazuje (np. emotki), są w przekreślonej czerwonej ramce — na tablicy zostają pominięte
bez pustego miejsca.

![Gracz 1 — wpisywanie odpowiedzi w czasie odliczania](zrzut:play-control-final-p1-timer)
![Ekran prowadzącego — odliczanie i statusy pytań](zrzut:play-host-final-p1@tablet-landscape)

**Gracz 1 — ocena i odsłanianie.** Dla każdego pytania porównaj wpis z listą odpowiedzi:

- wybierz pasującą odpowiedź z listy,
- „Nie ma na liście (0 pkt)” — Wyświetlacz pokaże dosłownie wpisaną odpowiedź i zero,
- „Brak odpowiedzi” — zero.

Następnie [Pokaż odpowiedź] i [Pokaż punkty] — suma rośnie dopiero przy odsłonięciu punktów.
[Dalej] przechodzi do następnego pytania. Prowadzący widzi pytanie, wpis operatora („Wprowadzono”),
stan dopasowania i pełną listę odpowiedzi z punktami. Po odsłonięciu odpowiedzi nie można zmienić.

![Ocena — odpowiedź dopasowana do listy](zrzut:play-control-final-p1-map)
![Ocena — odpowiedzi nie ma na liście](zrzut:play-control-final-p1-map-miss)
![Ocena — ekran prowadzącego](zrzut:play-host-final-map@tablet-landscape)
![Wyświetlacz po graczu 1](zrzut:play-display-final-p1)

**Gracz 2.** [Rozpocznij 2 rundę] — wraca drugi zawodnik; odpowiedzi pierwszego są znów na
Wyświetlaczu, więc drugi zawodnik odwraca się od tablicy. Operator widzi je przy polach, co
pomaga rozpoznać powtórzenie. Zegar ma 20 s.

- Gdy gracz powtórzy odpowiedź pierwszego, kliknij [Powtórzenie] (lub Shift+Enter w pustym polu) —
  słychać sygnał, a prowadzący prosi o inną odpowiedź. Każde kliknięcie odtwarza sygnał ponownie;
  oznaczenie znika dopiero po wpisaniu nowej odpowiedzi.
- Dopóki jest czas, prowadzący może wracać do pominiętych pytań.
- Ocena i odsłanianie — jak u gracza 1. Prowadzący widzi dodatkowo odpowiedź gracza 1 na to samo pytanie.

![Przejście do gracza 2](zrzut:play-control-final-p2-start)
![Gracz 2 — wpisywanie, odpowiedzi gracza 1 przy polach i Powtórzenie](zrzut:play-control-final-p2-timer)
![Gracz 2 — ekran prowadzącego](zrzut:play-host-final-p2@tablet-landscape)
![Gracz 2 — ocena przy powtórzeniu](zrzut:play-control-final-p2-repeat-map)
![Gracz 2 — ekran prowadzącego przy ocenie](zrzut:play-host-final-p2-repeat@tablet-landscape)
![Wyświetlacz — odpowiedzi obu graczy](zrzut:play-display-final)

**Koniec finału.** Gdy finaliści osiągną cel — domyślnie 200 punktów (→ 4.3) — dalsza ocena jest blokowana,
a przycisk zmienia się na [Zakończ finał] — operator sam wybiera moment zakończenia. Jeśli celu
nie osiągnięto, [Zakończ finał] pojawi się po ostatnich punktach gracza 2.

![Cel osiągnięty — Zakończ finał](zrzut:play-control-final-goal)

## 17.5 Zakończenie gry

- **Po finale** — [Zakończ finał] pokazuje ekran końcowy: logo, punkty albo kwotę nagrody
  (→ 16.6). Następnie [Zakończ grę] odtwarza muzykę zakończenia; wynik pozostaje widoczny.
- **Bez finału** — [Przejdź do zakończenia gry] rozlicza pulę i pokazuje ekran końcowy, a
  [Zakończ grę] odtwarza muzykę zakończenia. Przy ustawieniu kwoty nagrody gra bez finału pokazuje
  punkty, a przy remisie — logo.

![Ekran końcowy — kwota nagrody](zrzut:play-display-end-money)
![Ekran końcowy — punkty (gra bez finału)](zrzut:play-display-end-points)
![Ekran końcowy — logo (remis)](zrzut:play-display-end-logo)
![Panel przed Zakończ grę](zrzut:play-control-game-end-points)

Ekran prowadzącego jest wtedy czyszczony. Na koniec wybierz [Zacznij od nowa] albo
[Wróć do moich gier].

Zawsze kończ grę w panelu. Jeśli go zamkniesz w trakcie, gra pozostanie w toku i zablokuje zmianę
ustawień (→ 16.1). Logo na ekranie prowadzącego zależy od ustawienia „Logo prowadzącego” (→ 16.3).

![Gra zakończona — Zacznij od nowa albo Wróć do moich gier](zrzut:play-control-game-ended)
![Ekran prowadzącego po zakończeniu](zrzut:play-host-end@tablet-landscape)
![Wyjście z panelu w trakcie gry](zrzut:play-control-leave-confirm)

## 17.6 Skróty klawiszowe panelu

Skróty działają, gdy kursor nie jest w polu tekstowym. Aktualne skróty dla danego kroku pokazuje
też kolumna podpowiedzi.

| Skrót | Czynność |
|---|---|
| 1–6, potem Enter | odsłoń odpowiedź |
| X, potem Enter | błąd (X) |
| T, potem Enter | odliczanie 3 s |
| P, potem Enter | oddaj kontrolę |
| C, potem Enter | zatwierdź zgłoszenie z przycisku |
| A / B, potem Enter | wybór drużyny przy przycisku fizycznym |
| N, potem Enter | przycisk przejścia dalej |
| E, potem Enter | zmień ustawienia (w podsumowaniu) |
| B, potem Enter | powrót, gdy jest dostępny |
| M | wycisz / włącz dźwięk |
| Ctrl+Enter (Mac: ⌘+Enter) | finał: start / stop zegara |
| ↑ / ↓ / Enter | finał: poprzednie / następne puste pole |
| Shift+Enter | finał, gracz 2: powtórzenie w pustym polu |
| 1–6, W, O, R | ocena w finale: odpowiedź z listy, wpisana odpowiedź, brak odpowiedzi, powtórzenie |
| Enter, potem Enter | ocena w finale: pokaż odpowiedź, potem punkty |
| I | ocena w finale: przejdź do pola wpisanej odpowiedzi |

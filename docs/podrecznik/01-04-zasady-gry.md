# Część I — Zasady gry

# 1. Na czym polega gra?

Dwie drużyny zgadują najpopularniejsze odpowiedzi na pytania, które wcześniej zadano
w ankiecie. Nie liczy się wiedza, tylko wyczucie, co odpowiedziałaby większość ludzi: na
pytanie „Wymień coś, co zabierasz na plażę” najwięcej punktów dostaje ręcznik, bo tak
odpowiedziało najwięcej ankietowanych.

Drużyny stają naprzeciwko siebie, a grę prowadzi prowadzący. Każda drużyna ma kapitana
(„głowę rodziny”), który zaczyna rozgrywkę. W kolejnych rundach drużyny odkrywają odpowiedzi
ukryte na tablicy i zbierają punkty. Każda pomyłka to znak X na tablicy, a po trzech
pomyłkach szansę dostaje przeciwnik. W późniejszych rundach punkty są warte więcej.

Gra trwa, dopóki jedna z drużyn nie zdobędzie łącznie 300 punktów. Zwycięska drużyna wybiera
dwóch finalistów, którzy w krótkim czasie odpowiadają na pięć pytań. Jeśli razem zdobędą
co najmniej 200 punktów, drużyna wygrywa nagrodę główną.

# 2. Pytania ankietowe i odpowiedzi

## 2.1 Skąd biorą się odpowiedzi

Pytania zadaje się wcześniej ankietowanym — najlepiej osobom w różnym wieku i z różnych
środowisk, żeby wyniki nie zależały od jednej grupy. W grze zgaduje się więc nie
„prawidłową” odpowiedź, lecz to, co ludzie odpowiadali najczęściej. To nie jest quiz
z jedną obiektywnie poprawną odpowiedzią.

## 2.2 Jak czytać tablicę

Punkty przy odpowiedzi mówią, ile osób na 100 ankietowanych jej udzieliło. Odpowiedzi są
ułożone od najpopularniejszej.

Rzadkie odpowiedzi nie trafiają na tablicę. Przykład — „Wymień coś, co zabierasz na plażę”:
ręcznik 31 osób, krem z filtrem 22, okulary przeciwsłoneczne 14. Pojedyncze odpowiedzi,
takie jak parasol (3 osoby), książka (2) czy hamak (1), są pomijane. Dlatego suma punktów na
tablicy zwykle jest mniejsza niż 100.

Najlepiej sprawdzają się pytania, na które powtarza się od 3 do 8 odpowiedzi; pytania
z bardzo rozproszonymi odpowiedziami są mniej ciekawe.

## 2.3 Co oznacza odpowiedź pasująca do tablicy

Drużyna próbuje odgadnąć odpowiedzi z tablicy. Odpowiedź, która jest na tablicy, zostaje
odkryta, a jej punkty trafiają do puli rundy. Odpowiedź spoza tablicy jest pomyłką.
Szczegóły (→ 3).

## 2.4 Jak serwis wykorzystuje wyniki ankiety

Serwis może zebrać odpowiedzi w Twojej własnej ankiecie (→ 15) i zamienić je na tablicę
odpowiedzi z punktami:

- **Liczba głosujących jest dowolna** — może być mniej niż 100 osób albo kilkaset. Do
  podliczenia potrzeba co najmniej 10 osób, które odpowiedziały na wszystkie pytania
  (pełnych ankiet).
- **Punkty to procent pełnych ankiet**, zaokrąglony w dół. Jeśli na 50 osób 20 podało tę
  samą odpowiedź, dostaje ona 40 punktów — tak jakby ankietowanych było 100.
- **Odpowiedź trafia na tablicę od 4 punktów.** Rzadsze odpowiedzi są
  pomijane.
- **Na tablicy mieści się najwyżej 6 odpowiedzi** — tyle wierszy ma Wyświetlacz. Jeśli
  kwalifikuje się więcej, zostaje sześć najpopularniejszych.
- Aby zamknąć ankietę, każde pytanie musi mieć **co najmniej 3** takie odpowiedzi.

W ankiecie tekstowej serwis najpierw łączy identyczne odpowiedzi, a Ty możesz scalić
podobne (np. „ręcznik” i „ręczniki”) i poprawić literówki. Dopiero potem liczy punkty,
odrzuca odpowiedzi poniżej 4 punktów i wybiera sześć najlepszych (→ 15.6).

# 3. Przebieg rundy i pojedynek

Poniżej opisano klasyczny przebieg rundy. Tam, gdzie serwis daje wybór albo działa
inaczej, jest to zaznaczone.

## 3.1 Układ rund

Rundy rozgrywa się jedna po drugiej, aż któraś drużyna zdobędzie łącznie **300 punktów**.
Zwykle wystarczają trzy rundy, ale gra trwa dalej, jeśli nikt nie osiągnął progu.

**W serwisie:** próg ustawiasz sam w ustawieniach gry (→ 16.6); domyślnie to 300. Liczba rund nie jest stała —
zależy od tego, kiedy któraś drużyna osiągnie próg, i od liczby przygotowanych pytań.

## 3.2 Punktacja i mnożnik rundy

Mnożnik rundy mówi, ile razy liczą się punkty zdobyte w danej rundzie. Pierwsze trzy rundy
są zwykłe, w czwartej punkty są podwojone, a od piątej — potrojone.

| Runda | 1 | 2 | 3 | 4 | 5 i dalej |
|---|---|---|---|---|---|
| Mnożnik | ×1 | ×1 | ×1 | ×2 | ×3 |
| Pula 60 pkt daje | 60 | 60 | 60 | 120 | 180 |

**W serwisie:** to są ustawienia domyślne. Możesz ustawić własne mnożniki kolejnych rund;
ostatni mnożnik obowiązuje we wszystkich dalszych rundach (→ 16.6).

## 3.3 Pojedynek na początku rundy

1. Do przycisku podchodzi po jednej osobie z każdej drużyny (w pierwszej rundzie —
   kapitanowie, potem kolejni członkowie).
2. Prowadzący czyta pytanie. Kto pierwszy naciśnie przycisk, odpowiada pierwszy.
3. Jeśli to najwyżej punktowana odpowiedź — jego drużyna wygrywa pojedynek.
4. W przeciwnym razie odpowiada druga osoba. Wygrywa ta, której odpowiedź jest wyżej na
   tablicy.
5. Jeśli obie odpowiedzi są spoza tablicy, odpowiadają kolejne osoby z obu drużyn.

Drużyna, która wygrała pojedynek, gra dalej pytanie. Może też zrezygnować i oddać pytanie
przeciwnikom.

**W serwisie:** sygnał z przycisku pokazuje, kto był pierwszy; operator zatwierdza wynik
pojedynku (→ 17.3). Oddanie pytania jest możliwe raz w rundzie, przed pierwszą odkrytą
odpowiedzią.

## 3.4 Odpowiadanie przez drużynę

Po pojedynku odpowiadają po kolei członkowie grającej drużyny. Każda trafiona odpowiedź
zostaje odkryta, a jej punkty trafiają do puli rundy (na tablicy — „bank”). Grająca drużyna
nie może się naradzać.

## 3.5 Błędy i przejęcie punktów

- Odpowiedź spoza tablicy to **błąd** — na tablicy pojawia się X i słychać brzęczek.
- Na odpowiedź są **3 sekundy**. Limit utrzymuje tempo gry: brak odpowiedzi w czasie też jest
  błędem. Prowadzący sygnalizuje koniec czasu, a na tablicy pojawia się X.
- Po **trzech błędach**, zanim odkryto wszystkie odpowiedzi, pytanie przechodzi do
  przeciwników. Mogą się oni naradzać już od drugiego błędu grających.
- Kapitan drużyny przeciwnej udziela **jednej** odpowiedzi. Jeśli jest na tablicy, cała pula
  rundy przechodzi do jego drużyny. Jeśli nie — pula zostaje u drużyny grającej.

**W serwisie:** przejęcie punktów nazywa się **kradzieżą**. Trzysekundowe odliczanie operator
włącza wtedy, gdy odpowiedź się przeciąga; po upływie czasu serwis sam dodaje X (→ 17.3).

## 3.6 Zakończenie rundy i sprawdzenie progu

Runda kończy się, gdy drużyna odkryje wszystkie odpowiedzi albo po próbie przejęcia.
Pula rundy, pomnożona przez mnożnik rundy, trafia do drużyny, która ją wygrała.
Następnie sprawdza się próg: jeśli któraś drużyna ma łącznie 300 punktów lub więcej, przechodzi
do finału. Próg dotyczy łącznego wyniku drużyny, a nie liczby odpowiedzi ani mnożnika.

## 3.7 Odwzorowanie w serwisie

Serwis sprawdza próg po rozliczeniu każdej rundy. Gdy któraś drużyna go osiągnie:

- przechodzi do **finału**, jeśli finał jest włączony (→ 16.5.1),
- albo gra się **kończy**, jeśli finał jest wyłączony — ekran końcowy pokazuje wynik z rund.

Gra kończy się bez finału także wtedy, gdy **zabraknie pytań**, zanim któraś drużyna
osiągnie próg.

Jak panel sterowania prowadzi operatora przez te etapy (→ 17).

# 4. Finał

## 4.1 Przebieg finału

1. Kapitan zwycięskiej drużyny wskazuje **dwóch finalistów**.
2. Drugi finalista nie może słyszeć ani widzieć odpowiedzi pierwszego — na przykład wychodzi
   na chwilę z sali albo zakłada słuchawki.
3. **Pierwszy finalista** odpowiada na **5 pytań** w **15 sekund**. Może pominąć pytanie
   i wrócić do niego, jeśli zostanie czas.
4. Odpowiedzi pojawiają się na tablicy z punktami z ankiety; odpowiedź spoza tablicy daje
   0 punktów. Potem odpowiedzi pierwszego finalisty znikają z tablicy.
5. **Drugi finalista** wraca, prowadzący mówi mu, ile punktów zdobył partner, i czyta te same
   pięć pytań. Ma **20 sekund**, bo ta część jest trudniejsza.
6. Drugi finalista **nie może powtórzyć** odpowiedzi pierwszego — przy powtórzeniu słychać
   brzęczek i musi podać inną.
7. Odpowiedzi i punkty drugiego finalisty odsłania się obok odpowiedzi pierwszego.

## 4.2 Punktowanie

Punkty obu finalistów się sumują. W finale **nie ma mnożnika** — liczą się punkty z ankiety.

**W serwisie:** punkty finałowe zawsze liczą się pojedynczo.

## 4.3 Cel punktowy finału

Celem finalistów jest razem **co najmniej 200 punktów**.

**W serwisie:** cel ustawiasz sam w ustawieniach gry (→ 16.6); domyślnie to 200. Gdy finaliści go osiągną, operator
może zakończyć finał od razu, bez odsłaniania pozostałych pytań (→ 17.4).

## 4.4 Nagroda główna i rozliczenie wyniku

- Jeśli finaliści zdobędą 200 punktów lub więcej, drużyna wygrywa **nagrodę główną**,
  dodaną do tego, co wygrała wcześniej (punkty z rund razy mnożnik nagrody).
- Jeśli nie — drużyna otrzymuje tylko **punkty z rund przed finałem razy mnożnik nagrody**.
  Punkty zdobyte w finale nie wchodzą do tego mnożenia; rozstrzygają tylko, czy przyznano
  nagrodę główną.

**W serwisie:** ekran końcowy może pokazać logo, punkty albo kwotę nagrody (→ 16.6). Kwotę
nagrody głównej i mnożnik ustawiasz sam (domyślnie 25 000 i ×3). Kwota to punkty
zwycięskiej drużyny z rund razy mnożnik, a gdy finaliści osiągną cel — do tego
nagroda główna. Punkty zdobyte w finale decydują tylko o tym, czy cel został osiągnięty.

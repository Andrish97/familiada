# Refaktor wyglądu Hosta i Buzera

Status: wdrażany na branchu `refactor/host-buzzer-responsive-ui`; poza `main`.
To jest zakres i lista kontroli dla refaktoru.

## Stan prac — 2026-10-08

- Host: uproszczono ustawianie wielkości wiersza, siatkę tła generuje JS,
  a treść jest renderowana w osobnych wierszach. Siatka i tło wypełniają
  również safe area; treść, gest i przycisk pełnego ekranu pozostają w
  bezpiecznym polu. Odstępy dla dwóch pasm uwzględniają orientację.
- Host: ustawione kolory drużyn aktualizują też zasłonę pasma 2; zmianę
  barw obsługuje także bez przełączania motywu. Dodano komunikat iOS
  zgodny z treścią Buzera.
- Host: motyw Classic/Modern zmienia tło, tekst i krój. Kolory A/B z
  ustawień gry barwią zasłonę; nie zastępują beżowego tła kartki w Classic.
- Buzzer: arkusz CSS przepisano na jeden układ z paddingiem safe area.
  Przyciski są obok siebie w poziomie i jeden nad drugim w pionie. Modal
  iOS jest w prawidłowym miejscu DOM i zamyka się przyciskiem, Escape lub
  kliknięciem tła.
- Host: odsunięto pierwszy wiersz od przycisku pełnego ekranu. W podglądzie
  sprawdzane jest, że przycisk nie nachodzi na treść w obu orientacjach.
- Host: treść jest tabelą komórek siatki. Każdy wiersz tekstu trafia do
  osobnej komórki o wysokości jednego wiersza, tekst jest centrowany w obu
  osiach i lekko obniżony wewnątrz komórki.
- Host: ładowanie motywów działa przez `display-themes.json`, równolegle
  do Display. Każdy moduł udostępnia `createTheme(root)` i zwraca m.in.
  `ruled`, które steruje liniami bez sprawdzania nazwy motywu w CSS.
- Logo na zasłonie Hosta: domyślne logo ma gradient wyliczany z DOT, cień
  zachowuje proporcję kolorów odczytaną z `logo.svg`, a podpis gestu używa
  DOT. Własne logo pozostaje obecnie ostre; warianty wygładzania są tylko
  materiałem do wyboru w `tests/recordings/host-buzzer-preview/host-logo-smoothing-options/`.
- Zachowano atomowe wysyłanie naciśnięcia, natychmiastowe zapalenie
  kontrolki, kolory drużyn, dźwięk i blokady.
- Zmiany nie są jeszcze wdrożone na produkcję. Podglądy zapisują się w
  `tests/recordings/host-buzzer-preview/`; generator:
  `node tests/preview/host-buzzer-screenshots.mjs`.
- Podglądy są już wygenerowane; otwórz `tests/recordings/host-buzzer-preview/index.html`,
  żeby zobaczyć galerię Hosta i Buzera. Generator kończy się błędem, gdy
  treść Hosta nachodzi na przycisk pełnego ekranu.
- Zrzuty w Chromium mogą tylko symulować wartości safe area. Pełna kontrola
  notch/paska systemowego wymaga ponownego sprawdzenia na fizycznym iPhonie.

## Logo prowadzącego — stan na 2026-10-09

- W Ustawieniach rozgrywki przełącznik „Logo prowadzącego” wybiera **Piksele**
  albo **Źródło**. Wybór zapisuje się w istniejącym `games.settings.display`;
  brak pola w starszym ustawieniu oznacza `pixel`. Nie ma migracji bazy.
- Podgląd Hosta stoi obok podglądu Wyświetlacza i reaguje na niezapisane
  zmiany. Podsumowanie Control pokazuje wybrany wariant i podgląd planszy
  Hosta. Etykiety są przetłumaczone na PL/EN/UK.
- Silnik `web/host/js/sourceLogo.js` odtwarza źródło bez zmieniania zapisu
  logo. Edytory pozostały nietknięte; tryb Piksele nadal używa dotychczasowego
  rastera. Obrazy zapisane w bazie są pobierane z `source.imageUrl` w Storage.
- **TEXT:** bierze sam tekst z `source.text` i odtwarza zatwierdzony algorytm
  z narzędzia testowego: Unbounded 900, szerokość 82%, wysokość 133%, odstęp
  11 px, rybie oko 0,50, głębokość 12 px i kąt 32°.
- **IMAGE:** stosuje obrót i prostowanie przed kadrem v2 26:11, tak jak
  edytor. Sprawdza przezroczystość źródła i jej nie modyfikuje. Jednolite
  tło usuwa globalnie tylko przy zgodnych narożnikach (tolerancja 20,
  miękkość krawędzi 20); kolory samego obrazu zachowuje.
- **DRAW:** odtwarza pełne `source.fabricData` przez Fabric i serializuje
  widoczną, złożoną scenę do SVG. Filtr luminancji zachowuje kolejność
  warstw: biel staje się kolorem DOT, czerń i puste fragmenty są
  przezroczyste. Białe tło płótna jest częścią wyniku, gdy zapis ma `bg` WHITE.
- Brak wymaganego źródła nie przełącza po cichu wariantu na piksele. Edytory
  logo pozostają nietknięte.
- Test wykorzystuje trzy rzeczywiste pliki `.famlogo.json` dostarczone dla
  logo Tekst, Rysunek i Obraz. IMAGE w eksporcie ma `imageData`; runner
  wystawia te same bajty pod lokalnym adresem Storage i przekazuje Hostowi
  `imageUrl`, bez osadzania Base64 w payloadzie podglądu. Dodatkowo nakłada
  kontrastowe kształty SVG na ten obraz i sprawdza zachowanie obu kolorów oraz
  przezroczystości po renderze.
- Test DRAW tworzy warstwy białego prostokąta, czarnego prostokąta i białego
  koła przez Fabric.js, zapisuje JSON w `localStorage`, wczytuje go ponownie i
  przekazuje dokładnie ten odczytany payload do Hosta. Sprawdza piksele wyniku:
  biel pozostaje widoczna w DOT, czarna warstwa wycina biel pod spodem, biała
  warstwa nad czernią ponownie pokazuje DOT, a obszar poza rysunkiem jest
  przezroczysty. Zrzut `draw-roundtrip-control-source.png` dokumentuje wynik.
- W każdym przypadku rzeczywiste ramki Display i Host działają równocześnie;
  ten sam stan podglądu trafia do obu. To weryfikuje, że oba podglądy nie
  zakłócają sobie renderowania.
- Runner zapisuje galerię 16 zrzutów (Game Settings i podsumowanie Control,
  Piksele/Źródło, trzy typy logo plus warstwowy IMAGE) oraz dodatkowy zrzut
  testu DRAW. Pliki trafiają do `tests/recordings/host-logo-source/`, a kod
  testu jest w `tests/preview/host-logo-source-screenshots.mjs`.
- Uruchomienie lokalne: `node tests/preview/host-logo-source-screenshots.mjs`.
  Test używa wyłącznie lokalnego serwera i losowego portu; nie łączy się z
  bazą ani nie zmienia danych. Test produkcyjny jest osobnym krokiem po
  wdrożeniu Pages: przed startem trzeba sprawdzić, czy nikt inny nie używa
  wybranego konta, gry i urządzeń.
- Pełny przebieg edytora DRAW jest w `tests/e2e/host-logo-draw.spec.js`.
  Otwiera kod strony z bieżącego brancha, loguje konta `test9` i `test10`,
  rysuje przez scenę Fabric edytora, czeka na autozapis, pobiera zapisany
  wiersz i ogląda go równocześnie w prawdziwych podglądach Host/Display.
  Test usuwa po sobie wyłącznie utworzone logo. Używa dwóch osobnych kont,
  więc oba przypadki można uruchomić równolegle (`--workers=2`). Przed
  uruchomieniem sprawdź, czy inny test lub operator nie korzysta już z tych
  kont; nie uruchamiaj równoległego przebiegu na tym samym koncie.
- Test nie zmienia schematu bazy ani ustawień gry. Jedyny zapis to chwilowe
  logo testowe w `user_logos`, usuwane w `finally`; wdrożenie aplikacji
  następuje przez Pages po przejściu testów.

## Narzędzia testowe logo

- Osobne laboratorium SVG dla DRAW zostało usunięte. Test złożenia DRAW
  odbywa się przez renderer Hosta i rzeczywisty format sceny Fabric, a nie
  przez alternatywny silnik demonstracyjny.
- Laboratorium usuwania tła IMAGE przywrócono do wersji sprzed dodania
  przycinania testowego obrazu. Przykłady tła pozostają dostępne; ta strona
  służy do testowania samego usuwania tła.
- Strona próbna prezentacji logo Hosta pozostaje w Settings Tools.

## Cel

Uporządkować wygląd Hosta i Buzzerza na telefonach i tabletach, zwłaszcza na małych ekranach oraz po obróceniu urządzenia. Tekst i przyciski mają być proporcjonalne do dostępnego miejsca. Tła w obu stronach wypełniają cały ekran, a treść i cele dotykowe pozostają w safe area. Linie Hosta mają odpowiadać rzeczywistym wierszom. Motyw i kolory ustawione dla gry mają być widoczne także na Hostcie. Host dostaje wyjaśnienie ograniczeń pełnego ekranu w iOS, spójne z Buzzerem.

Host był sprawdzany na fizycznym iPhonie. Refaktor nadal trzeba zweryfikować na urządzeniu, bo emulacja nie potwierdzi zachowania Safari, safe area ani instalacji aplikacji na ekranie początkowym.

## Ustalenia projektowe

Motyw dodaje się przez wpis w `web/shared/data/display-themes.json` z
`module` dla Display i `hostModule` dla Hosta. Moduł Hosta trafia do
`web/host/js/themes/<key>.js`, eksportuje `createTheme(root)`, ustawia
zmienne CSS motywu i zwraca `{ ruled: true|false }`. Etykieta w rejestrze
powinna zawierać PL, EN i UK. CSS wspólny korzysta z `data-host-ruled`,
więc nie trzeba dopisywać selektora dla konkretnej nazwy motywu.

### Prezentacja własnych logo na Hostcie

#### Stany wariantu i kolory

Ustawienie gry `display.hostLogoMode` wybiera prezentację: `pixel` zachowuje
dotychczasowy ostry wariant, a `source` używa źródła IMAGE/DRAW/TEXT. Brak
wartości w starszym zapisie oznacza `pixel`. To pole trafia do istniejącego
JSON `games.settings` i `game_state.detail.display`; nie wymaga migracji.

| Logo i wariant | DOT domyślny `#d7ff3d` | DOT zmieniony przez użytkownika |
| --- | --- | --- |
| Domyślna Familiada, oba warianty | Napis FAMILIADA w stylu Unbounded 3D: `#fc0` i `#a80` | Napis używa wybranego DOT; cień zachowuje proporcję z logo |
| Własne IMAGE, `pixel` | Siatka pikseli `#fc0` | Siatka pikseli w wybranym DOT |
| Własne IMAGE, `source` | Oryginalne kolory i przezroczystość | Oryginalne kolory i przezroczystość |
| Własne DRAW, `pixel` | Siatka pikseli `#fc0` | Siatka pikseli w wybranym DOT |
| Własne DRAW, `source` | Po złożeniu warstw w kolejności Fabric biel mapuje się na `#fc0`; czerń i puste obszary są przezroczyste | Po złożeniu warstw w kolejności Fabric biel mapuje się na DOT; czerń i puste obszary są przezroczyste |
| Własne TEXT, `pixel` | Siatka pikseli `#fc0` | Siatka pikseli w wybranym DOT |
| Własne TEXT, `source` | Powierzchnia `#fc0`, głębia `#a80` | Powierzchnia w wybranym DOT, głębia zachowuje proporcję cienia SVG |

Własne IMAGE w wariancie `source` zachowuje istniejącą alfę; PNG z już
przezroczystym tłem pozostaje bez zmian. Jednolite tło usuwa się wg progów
20/20 tylko przy pewnym wykryciu.

Podgląd Hosta obok podglądu Wyświetlacza w Ustawieniach rozgrywki reaguje na
niezapisane zmiany, w tym przełącznik, kolor DOT i wybór logo. Podsumowanie
Control pokazuje ten sam wariant Hosta i krótko opisuje aktywne ustawienie.

W DRAW kontury są renderowane z `strokeUniform`, aby skalowanie grup Fabric nie
pogrubiało ich dodatkowo. Domyślny napis FAMILIADA korzysta z tego samego
silnika tekstowego co wariant TEXT; plik SVG pozostaje w repozytorium i nie
jest już źródłem domyślnego logo Hosta.

Wariant Hostowy jest renderowany z danych źródłowych w przeglądarce i nie
zapisuje dodatkowego pliku. Nie zmienia `bits_b64`, warstw edytora ani logo
na Wyświetlaczu. Użytkownik nie dostaje narzędzi do ręcznego usuwania tła
ani osobnego procesu eksportu. DRAW i TEXT wymagają odpowiednio
`source.fabricData` i `source.text`; przy braku źródła Host nie pokazuje
wariantu źródłowego i nie przełącza go po cichu na piksele. IMAGE zachowuje
oryginalne kolory, a DOT dla DRAW/TEXT jest nakładany przy każdym renderze,
więc zmiana koloru nie tworzy nieaktualnego pliku.

W ustawieniach rozgrywki jest jedna wartość „Logo prowadzącego” z dwoma
wariantami: dotychczasowe logo pikselowe, ostre i bez wygładzania, albo
logo przygotowane ze źródła (IMAGE, DRAW lub TEXT). To wybór wariantu
wyświetlania, nie edycja logo. Podgląd Hosta w iframe znajduje się obok
podglądu Wyświetlacza; oba podglądy mają mieścić się czytelnie w tym samym
obszarze ustawień, również przy węższym oknie.

Wariant Hostowy wypełnia dostępną szerokość zasłony bez pustego marginesu
wewnątrz znaku. Zachowuje proporcje, a przycięcie wyznacza widoczny obszar
logo. Zasłona i elementy sterujące nadal respektują safe area.

- **IMAGE:** wykorzystać `source.imageUrl` lub `source.imageData`, zapisany
  kadr `source.crop` (format v2 względem obrazu) i transformację obrotu.
  Zachować oryginalne kolory oraz już istniejącą przezroczystość. Usuwać
  białe/jasne tło tylko wtedy, gdy można je pewnie rozpoznać jako tło — np.
  piksele bliskie bieli połączone z brzegiem kadru. Białe obszary
  odseparowane wewnątrz znaku zostają. Jeśli rozpoznanie jest niepewne,
  zachować obraz bez zmian. W edytorze obrazu dodać krótką podpowiedź, że
  jasne, jednolite tło ułatwia jego usunięcie; nie zakładać, że każde logo
  ma białe tło.
- **DRAW:** odtworzyć zapisaną scenę `source.fabricData` w jej wymiarach
  `source.world` i użyć kadru rysunku. Białe elementy rysunku przyjmują
  kolor DOT, czarne stają się przezroczyste. Przyciąć do nieprzezroczystej
  zawartości i dopasować do pełnej szerokości zasłony.
- **TEXT:** użyć zapisanego `source.text`; nie odtwarzać napisu ze starych
  warstw glifów.
  Wariant Hostowy ma mieć krój podobny do znaku Familiady: cały napis ma
  układać się po łuku jak wordmark w SVG (nie wystarczy pochylić liter).
  Krzywiznę uzyskać podczas układu/renderowania tekstu po ścieżce, bez
  modyfikowania pliku fontu ani deformowania konturów glifów,
  gradient budowany z DOT i efekt przestrzenny z kilku kopii tekstu
  przesuniętych względem siebie. Kopie mają wizualnie zlać się w jedną
  bryłę przez nałożenie warstw; nie jest wymagane geometryczne łączenie
  ścieżek. Całość należy wyrenderować wektorowo/rasteryzować z naturalnym
  wygładzaniem krawędzi — bez filtra blur. SVG
  `web/assets/img/logo.svg` jest wektorowym wordmarkiem z dwiema ścieżkami:
  złotą powierzchnią `#fc0` i ciemniejszą warstwą `#a80`; nie ma w nim tła
  ani gradientu. Te ścieżki są punktem odniesienia dla powierzchni i
  wielowarstwowego efektu głębi, a nowa kolorystyka tekstu nadal wynika z
  DOT. Tekst ma być wektorowy lub rasteryzowany w dużej rozdzielczości, ale
  niezależny od siatki Display. Font musi obejmować całą pulę dozwoloną w
  edytorze tekstowym w PL/EN/UK. Wybrany krój: **Unbounded Black (waga
  900)**. Przed wdrożeniem potwierdzić obecność wszystkich znaków z puli,
  zwłaszcza `ҐЄІЇ`, oraz przygotować próbkę z wygięciem i warstwami 3D.
  Gamay Black, Passion One Black, Paytone One, Russo One i Rubik Black
  pozostają wzorami porównawczymi, nie domyślnym wyborem. Passion One i
  Paytone One w metadanych Google Fonts nie deklarują cyrylicy; Gamay
  wymaga osobnej weryfikacji zakresu znaków i licencji osadzania.

Font tekstowy logo ma 89 glifów i spację. Małe litery są przyjmowane jako
odpowiedniki wielkich. Lista glifów:

```text
0123456789 !"'(),-.:;?ABCDEFGHIJKLMNOPQRSTUVWXYZÓĄĆĘŁŃŚŹŻЄІЇАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЬЮЯҐ
```

W interfejsie PL/EN cyrylica jest ukryta (56 glifów plus spacja); w UK
widoczna jest cała pula (89 glifów plus spacja). Pozostałe glify z
`font_5x7.json` Wyświetlacza, takie jak greka, strzałki, waluty i ułamki,
nie należą do puli tekstowego logo i nie muszą być obsługiwane przez nowy
krój.

Po wygenerowaniu warianty porównać na zrzutach w normalnym rozmiarze:
IMAGE z białym, kolorowym i przezroczystym tłem; DRAW z białymi i czarnymi
elementami; TEXT z polskimi i ukraińskimi znakami oraz symbolami z puli.
Zrzuty porównawcze wygładzania pozostają osobnym eksperymentem — domyślnie
Host nie wygładza logo pikselowego, dopóki nie zostanie wybrany konkretny
wariant.

1. **Tła wypełniają cały ekran, również safe area.** Beżowe tło, linie oraz tło zasłony pasma 2 (cover) mają dochodzić pod notch, zaokrąglone narożniki i dolny pasek systemowy. Safe area nie może ucinać tła ani siatki. Logo, tekst podpowiedzi i wszystkie elementy klikalne pozostają wewnątrz safe area; obszary dotyku nie mogą wchodzić na systemowe krawędzie.
2. **Siatka jest tabelą komórek tekstu.** Każdy wiersz treści trafia do własnej komórki o wysokości odpowiadającej jednemu wierszowi siatki. Tekst jest wyśrodkowany w poziomie i pionie, z lekkim obniżeniem wewnątrz komórki. Długie pytanie może zająć kolejne wiersze; nie może nachodzić na następną treść. Jeśli całość nie mieści się na ekranie, zachowujemy możliwość przewinięcia treści zamiast cichego obcięcia.
3. **Skalowanie zależy od dostępnego pola tekstu**, orientacji i wysokości ekranu, nie tylko od szerokości. Rozmiary tekstu i odstępy między liniami są wyliczane razem. Pytanie może mieć własny, czytelny rozmiar, a lista odpowiedzi nie może rosnąć nadmiernie na małym ekranie.
4. **Classic i Modern mają mieć porównywalną wielkość optyczną tekstu.** Krój pisma może się różnić, ale rozmiar liter widziany przez prowadzącego nie powinien gwałtownie skakać po zmianie motywu. Rozmiary i wysokość wiersza trzeba dostroić dla obu krojów na tych samych viewportach, nie opierać się wyłącznie na identycznej wartości `font-size`.
5. **Układ safe area ma być wspólny.** Safe area wyznacza wewnętrzne odstępy treści i sterowania. Usuwamy osobne, nakładające się korekty marginesów dla kolejnych elementów, jeśli po wdrożeniu nie okażą się konieczne. Arkusz i siatka pozostają rozciągnięte na cały viewport.
6. **Motywy Hosta muszą reagować na bieżący stan gry.** Zmiana motywu lub kolorów w ustawieniach ma aktualizować Host bez odświeżania strony. Kolory planszy są pobierane z `detail.display.colors`; motyw określa też tło, tekst i krój pisma. Kolory statusów odpowiedzi (np. trafiona odpowiedź) zachowują swoje znaczenie i kontrast.
7. **Host dostaje komunikat iOS.** W Safari na iPhonie przycisk pełnego ekranu ma otwierać krótką podpowiedź o dodaniu Hosta do ekranu początkowego i uruchomieniu go jako aplikacji. W trybie zainstalowanym przycisk korzysta z dostępnego pełnego ekranu. Nie pokazujemy komunikatu użytkownikom innych przeglądarek ani systemów.
8. **Buzzer przechodzi własne uproszczenie CSS.** Zachowujemy działanie przycisku, kolory drużyn, dźwięk i obecną podpowiedź iOS, ale porządkujemy reguły rozmiaru i safe area. Tło Buzzerza wypełnia ekran pod notch i paski systemowe, natomiast przyciski, tekst i obszary dotyku są odsunięte od tych krawędzi.
9. **Logo Hosta dostaje osobne warianty źródłowe.** IMAGE zachowuje kolory i przezroczystość, z ostrożnym usuwaniem łatwo rozpoznawalnego jasnego tła; DRAW mapuje biel na DOT i czerń na przezroczystość; TEXT dostaje krój podobny do wordmarku, wygięcie, efekt 3D i gradient DOT. Przygotowanie jest automatyczne i niewidoczne dla użytkownika. W ustawieniach rozgrywki użytkownik wybiera między ostrym logo pikselowym a wariantem ze źródła. Obok podglądu Wyświetlacza mieści się podgląd Hosta w iframe.

## Kolejność prac

### Etap 1 — inwentaryzacja i punkt odniesienia

- Spisać obecne widoki Hosta: pojedynek, runda, wpisywanie finału, mapowanie finału i zasłonięte pasmo.
- Zmierzyć układ na małym i dużym iPhonie w pionie i poziomie oraz na tablecie.
- Zanotować przypadki długich pytań, list odpowiedzi i treści finału, w których tekst się zawija lub przewija.
- Zachować obecne zachowanie gestu odsłaniania i treść pokazywaną prowadzącemu.

### Etap 2 — model arkusza i typografia

- Uprościć strukturę CSS do arkusza, wspólnych safe-area paddingów i dwóch pól treści.
- Zastąpić niezależne tło liniami siatki generowanymi dla dostępnej wysokości.
- Rozciągnąć arkusz i siatkę pod całym safe area; padding safe area stosować wyłącznie do treści oraz sterowania. Sprawdzić, że `overflow`, stałe pozycjonowanie ani wysokość viewportu iOS nie przycinają tła.
- Rozciągnąć tło covera pod cały safe area, a jego logo i podpowiedź gestu pozycjonować w bezpiecznym polu. Przycisk pełnego ekranu i inne elementy interaktywne również muszą mieć bezpieczny odstęp od krawędzi.
- Renderować treść jako wiersze tabeli: każda komórka mieści jeden wiersz siatki, tekst jest centrowany i lekko obniżony; zawijanie długiego tekstu zajmuje kolejne komórki.
- Wyliczać rozmiar czcionki i wysokość wiersza razem na podstawie pola tekstu, orientacji i wymiarów ekranu.
- Skalibrować Classic i Modern na wspólnych rozmiarach ekranów, aby ich tekst miał podobny rozmiar optyczny mimo różnych krojów.
- Zachować pełną treść i przewijanie, gdy tekst nie mieści się w widocznym obszarze.
- Sprawdzić zmianę orientacji, zmianę rozmiaru okna, safe area i powiększenie tekstu przez system.

### Etap 3 — motywy i kolory

- Naprawić aktualizowanie motywu, gdy zmieniają się kolory, ale klucz motywu pozostaje ten sam.
- Podłączyć ustawione kolory planszy do odpowiednich elementów Hosta.
- Sprawdzić kontrast tekstu i statusów w każdym motywie oraz po przełączaniu motywów w obie strony.
- Nie dopuścić do pozostawania zmiennych CSS ze starego motywu po zmianie ustawień.

### Etap 4 — komunikat pełnego ekranu w iOS

- Dodać do Hosta modal/podpowiedź zgodną z istniejącym wzorcem Buzzerza i tłumaczeniami PL/EN/UK.
- Rozpoznawać zwykłą kartę Safari na iOS oraz tryb aplikacji dodanej do ekranu początkowego.
- W zwykłej karcie wyjaśnić ścieżkę „Udostępnij → Do ekranu początkowego”; nie udawać, że Fullscreen API zadziałało.
- W trybie aplikacji pozwolić użyć dostępnego API pełnego ekranu bez blokowania Hosta, gdy API nie istnieje.
- Umieścić elementy komunikatu w safe area i sprawdzić go w pionie oraz poziomie.

### Etap 5 — uproszczenie Buzzerza

- Przejrzeć `web/buzzer/css/buzzer.css` i usunąć nakładające się lub nieużywane reguły, grupując wspólne wymiary i safe-area odstępy.
- Zapewnić pełnoekranowe tło pod safe area, a przycisk buzzera, etykiety i przycisk pełnego ekranu umieścić w bezpiecznym polu.
- Dostosować rozmiar przycisku i tekstów do orientacji oraz wymiarów ekranu bez utraty łatwego klikania na dotyku.
- Zachować kolory drużyn, lokalne zapalenie przycisku przed wysłaniem sygnału, dźwięk oraz istniejącą podpowiedź iOS.

### Etap 6 — weryfikacja

- Testy przeglądarkowe: różne proporcje ekranu, mały viewport, obrót, długie pytania, pełna lista odpowiedzi, zmiana motywu i kolorów bez przeładowania.
- Test Buzzerza w obu orientacjach i na małych oraz dużych ekranach: rozmiar i dostępność przycisku, kolory drużyn, brak nakładania na systemowe krawędzie.
- Kontrola, że treść Hosta nie nachodzi na notch ani przyciski i że nadmiar treści można przewinąć.
- Kontrola na fizycznym iPhonie, że tło i linie wypełniają obszar pod notchem i dolnym paskiem, a treść nie jest tam obcięta.
- Kontrola, że tło covera również wypełnia safe area, a logo, podpowiedź i obszary dotyku pozostają poza notchem oraz systemowymi krawędziami.
- Porównanie wielkości optycznej tekstu Classic i Modern na tym samym urządzeniu, w obu orientacjach.
- Test fizyczny na iPhonie w Safari oraz po dodaniu Hosta do ekranu początkowego; osobno sprawdzić Buzzer, by upewnić się, że jego obecny komunikat nadal działa.
- Sprawdzić PL/EN/UK i dostępność zamknięcia komunikatu z dotyku oraz klawiatury.
- Sprawdzić zachowanie dźwięku, połączenia i reakcji obu Buzzerów po zmianach CSS.
- Sprawdzić trzy typy wariantów Hostowego logo, wykorzystanie zapisanego kadru,
  brak pustych marginesów, zmianę DOT bez przeładowania oraz fallback dla
  starych i niepełnych źródeł. Usuwanie jasnego tła nie może usuwać bieli
  wewnątrz znaku ani zmieniać kolorów obrazu.
- Sprawdzić font tekstu logo na całej puli PL/EN/UK, także znakach `ĄĆĘŁŃÓŚŹŻ`
  i `ҐЄІЇ`, oraz potwierdzić, że źródłowy tekst i render Display pozostają
  niezmienione.
- Sprawdzić zapis i odczyt wyboru wariantu „Logo prowadzącego” w ustawieniach
  rozgrywki oraz aktualizację wariantu źródłowego po zmianie DOT.
- Sprawdzić, że podglądy Wyświetlacza i Hosta (iframe) są obok siebie i
  mieszczą się w ustawieniach na typowych szerokościach okna.

## Kryteria zakończenia

- Tło, linie i tło covera dochodzą do krawędzi ekranu także w safe area; safe area nie ucina żadnego z tych elementów.
- Logo, podpowiedzi i elementy klikalne pozostają wewnątrz safe area, z dala od krawędzi systemowych.
- Na małym ekranie tekst nie jest nieproporcjonalnie duży, Classic i Modern mają porównywalną wielkość optyczną, a odstępy i linie siatki pozostają zgodne.
- Obrót urządzenia przelicza układ bez przesunięć i obciętych marginesów safe area.
- Każdy widoczny wiersz treści zajmuje odpowiednie miejsce; długie treści nie znikają poza ekranem.
- Host od razu odzwierciedla zmianę motywu i kolorów w ustawieniach gry.
- Gradient domyślnego logo na zasłonie Hosta jest budowany z koloru DOT, a
  jego cień zachowuje proporcję odczytaną z kolorów `logo.svg`. Podpis gestu
  używa koloru DOT. Własne logo pikselowe pozostaje ostre; warianty
  wygładzania są przygotowane osobno do wyboru.
- Przycisk pełnego ekranu Hosta daje właściwą podpowiedź w Safari na iPhonie i nie pokazuje jej na innych urządzeniach.
- Buzzer zachowuje swoje działanie i czytelność po uproszczeniu CSS, a tło i kontrolki respektują safe area.
- IMAGE, DRAW i TEXT mają osobne warianty Hostowe renderowane bez wewnętrznych
  marginesów; oryginalny payload oraz obraz na Wyświetlaczu są niezmienione.
- Użytkownik może wybrać w ustawieniach rozgrywki ostre logo pikselowe albo
  logo ze źródła; podgląd Hosta mieści się obok podglądu Wyświetlacza.
- Dotychczasowe treści, gest odsłaniania i działanie Hosta pozostają poprawne.

## Poza zakresem

- Zmiany logiki gry, stanu Control i synchronizacji z Wyświetlaczem.
- Gwarancja pełnego ekranu w zwykłej karcie Safari — iOS nie udostępnia stronie takiej możliwości.

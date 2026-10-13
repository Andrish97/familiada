# Gry i Logo — wysyłanie kopii znajomym

Stan: **w realizacji**, etap E19C. Wspólne pakiety Gier i Logo zamknięte na produkcji; samo wysyłanie/oferty/powiadomienia jeszcze nie wdrożone. Decyzja użytkownika 2026-10-12.
Realizacja po bieżącym E19, przed E19N/E14/E20; manual pozostaje ostatni.

## Zasady i wygląd

### Wspólne powielanie i wysyłanie — decyzje2026-10-13

Jeden mechanizm klonowania definicji i potrzebnych plików obsługuje
Gry, Bazy i Logo. Powiel tworzy własny zasób; Wyślij wykorzystuje ten
sam mechanizm do tworzenia oczekującej kopii Gry/Logo znajomego.
Bazy zachowują obecne współdzielenie, a otrzymują możliwość Powiel.

| Działanie | Właściciel wyniku | Nazwa i oznaczenia | Przenoszone dane |
|---|---|---|---|
| Powiel — Gra/Baza/Logo | Bieżące konto | Dopisek „kopia” **w nazwie**, nie osobna plakietka na kafelku; kolejne konflikty rozwiązywane numerem | Definicja zgodna z istniejącym formatem zasobu; foldery i tagi Bazy, własne potrzebne pliki Logo |
| Wyślij — Gra/Logo | Znajomy, oczekująca własna kopia | Nazwa wysyłanego zasobu; po akceptacji lekki znacznik „od X” | Ta sama definicja i niezależne pliki, bez dodatkowego importu przy akceptacji |

Powiel ma ikonę duplikowania obok eksportu/importu. Nie dziedziczy
udostępnień, uprawnień innych osób, ofert, głosów, sesji, tokenów,
historii, oznaczenia „od X” ani stanu urządzeń. Nowy wynik otrzymuje
nowe ID. Powielanie nie wysyła powiadomienia do samego siebie.

**Pliki:** obraz już znajdujący się w naszym buckecie kopiować przez
Storage bez konwersji do base64 i ponownego uploadu. Przepisać również
odwołania w zagnieżdżonych obrazach DRAW na własne pliki wyniku.
Base64 pozostaje częścią samowystarczalnego eksportu/importu pliku
oraz obsługi źródeł już osadzonych w danych. Obie ścieżki mają wspólny
plan własności, limitów, ponowień i sprzątania po błędzie/usunięciu.

**Demo:** zakazać wysyłania demonstracyjnych Gier i Logo. Sama zmiana
nazwy ani Powiel nie mogą umożliwić wysłania niezmienionej treści demo;
sprawdzenie na serwerze, nie tylko wyłączony przycisk. Wewnętrzna
informacja potrzebna tej kontroli nie tworzy zależności dostępu ani
żywego połączenia ze źródłem. Testy obejmują demo, zmianę nazwy,
powielenie i próby obejścia przez stare ścieżki/RPC.

Parser Logo zamknięty produkcyjnie: branch38330340333 success1/1,
Pages38330568612 success, main38330805999 success1/1 bez retry.
Prywatny upload obrazów opisany na końcu jest przygotowaniem dla
osadzonych danych; zwykłe pliki bucketowe wymagają bezpośredniej kopii.

| Obszar | Docelowe zachowanie |
|---|---|
| Odbiorcy | Wyłącznie znajomi. Brak pola e-mail/nazwy i brak Subskrybentów. |
| Akcja wejścia | **„Wyślij”**, w sekcji importu/eksportu Gier i Logo. Koperta: na telefonie sama ikona, na komputerze ikona obok nazwy. |
| Nadawca | Wybiera własną grę albo logo, otwiera standardowy modal udostępniania, zaznacza znajomych i klika „Wyślij”. Modal zawiera wybór znajomych, przycisk „Wyślij” oraz poniżej zwijaną historię; bez sekcji „Udostępnione”. Wspólna lista/checkboxy, odstępy, dymki i cooldowny jak w pozostałych modalach. |
| Po wysłaniu | Znikający dymek potwierdzenia. Bez listy współpracowników, ról, cofania i ponowień wiersza. |
| Historia | Zwijana sekcja „Historia wysyłek” poniżej wyboru znajomych i przycisku „Wyślij”: komu wysłano tę konkretną grę/logo i kiedy. Wpisy żyją 30 dni, potem są usuwane. Bez zarządzania dostępem i śledzenia decyzji odbiorcy. Pusta sekcja ukryta. |
| Odbiór | Propozycja kopii w odpowiedniej istniejącej zakładce typu na stronie Gier albo Logo. Przyciski akceptacji/odrzucenia jak w Bazach; nie dodawać tego do Zadań, które pozostają wyłącznie dla ankiet. |
| Utworzenie kopii | Już przy Wyślij powstaje własna gra/logo odbiorcy z nowymi ID i własnymi danymi/plikami, oznaczona jako oczekująca; bez zależności od oryginału. |
| Akceptacja | Zatwierdza istniejącą oczekującą kopię i udostępnia zwykłe działania zasobu; nie tworzy kolejnego zasobu ani okna importu. |
| Odrzucenie / brak decyzji przez5 dni | Usuwa oczekującą własną kopię i jej nieużywane pliki. Odrzucenie usuwa również pakiet i nie daje cofnięcia odmowy ani odtworzenia. |
| Filtr Gier | We wszystkich własnych zakładkach typu (Preparowane, tekstowe, punktowe) dostępne „Otrzymane”, oparte na zapisanym pochodzeniu kopii od znajomych. Gry społeczności bez filtra; wspólny wygląd E20. |
| Przyjęta kopia | Tylko lekki znacznik „od X”, bez statusu „zaakceptowano”, uprawnień i dodatkowego panelu udostępnienia. |
| Cofanie | Nadawca nie może cofnąć wysłanej kopii. Odbiorca zarządza przyjętym zasobem tak jak własnym importem. |
| Plakietki | Oczekujące kopie liczyć na właściwej stronie/ikonie Gier lub Logo i wypustce zakładki typu. Gry i Logo mają plakietki na wypustkach typów oraz przyciskach prowadzących do właściwej strony; wypustki pokazują oczekujące u odbiorcy kopie swojego typu, przycisk ich sumę. Bazy już mają ten mechanizm i są wzorcem. Po akceptacji/odrzuceniu/usunięciu/wygaśnięciu aktualizować, zero ukrywa plakietkę. Bez powielania w Zadaniach. |
| Mail i link | Zasada systemowa: odbiorca dostaje propozycję również przy wyłączonych mailach. Flagę sprawdzać przed kolejką. Link przez `/go/`, z kontrolą właściwego konta i spójnymi komunikatami stanów. |

**Przyjęcie na kafelku — korekta2026-10-13:** Akceptuj zatwierdza
własną kopię utworzoną podczas Wyślij, z przyciskiem zablokowanym na
czas operacji. Nie otwiera okna importu pliku ani nie wymaga dodatkowego
wyboru/pliku/ponownego zatwierdzania. Po sukcesie propozycję zastępuje
własny kafelek z lekkim „od X”; błąd zostawia możliwość ponowienia tej
samej próby. Wspólny importer oznacza wspólny zapis, nie wspólny modal.

## Snapshot i graf zasobów

Wysyłanie oznacza przekazanie wersji odpowiadającej eksportowi w chwili
wysłania i utworzenie oczekującego zasobu odbiorcy przez wspólny importer.
Przyjęcie zmienia jego stan. Nie tworzyć drugiego
formatu lub drugiej logiki klonowania obok importu/eksportu.

### Starsze ścieżki importu/eksportu — doprecyzowanie2026-10-13

Użytkownik wskazał, że Import/Eksport/Do bazy w Grach są bardzo stare
i zaproponował uproszczenie. Przy porządkach starszych funkcjonalności
przejrzeć wszystkie trzy ścieżki oraz ich komunikaty, błędy i częściowe
zapisy; dopieszczenie obsługi/ikon w E20. Nie tworzyć osobnego formatu
dla wysyłania. Znaczenie działań pozostaje jawne:

| Działanie | Cel | Wspólny mechanizm |
|---|---|---|
| Eksport | Pobranie pliku | Snapshot Gier/Logo |
| Wyślij | Utworzenie niezależnej oczekującej kopii na koncie znajomego | Ten sam snapshot i importer; stałe ID próby zapobiega duplikatom |
| Import | Utworzenie własnego zasobu z pliku | Wspólny importer |
| Akceptuj otrzymaną kopię | Zatwierdzenie istniejącej oczekującej kopii | Zmiana stanu, bez drugiego importu |
| Do bazy | Zapis pytań w wybranej bazie | Osobna istniejąca ścieżka pytań; uwzględnić w przeglądzie starych operacji |

Wstępny odczyt kodu Do bazy: qb_questions już zapisuje porcjami200,
więc nie powielać tam optymalizacji pojedynczych pytań. Nazwa/pozycja
i utworzenie folderu są osobnymi operacjami; porażka uruchamia sprzątanie
pytań i folderu. Przegląd obejmuje atomowość całego wyniku, równoczesne
eksporty, utratę odpowiedzi i sprawdzenie błędów zwracanych przez
sprzątanie. Korekta użytkownika2026-10-13: okno po sukcesie nie może
mignąć i samoczynnie zniknąć. Zapis/pobieranie kończą się bez sztucznej
zwłoki; pozostaje czytelne potwierdzenie i świadome zamknięcie Gotowe.

Potwierdzenie użytkownikowi2026-10-13: wersja zostaje utrwalona przy
wysłaniu, nie dopiero przy akceptacji. Usunięcie oryginału przed
akceptacją pozostawia ofertę wraz z kompletnym pakietem i jej pierwotnym
terminem. Dotyczy także osadzonych obrazów Logo. W testach wymagana
akceptacja po usunięciu źródła, znajomości oraz konta nadawcy; żadna
z tych operacji nie może usunąć gałęzi odbiorcy ani wyłączyć jej maila.

| Zdarzenie / zależność | Skutek |
|---|---|
| Tworzenie kopii | Sprawdzić własność źródła, znajomość, stan i blokady zgodnie z eksportem; pakiet ma być kompletny i spójny. |
| Historia wysyłek → wpis | Wpis nadawcy dotyczy konkretnej gry/logo i odbiorcy; usunąć po 30 dniach od wysłania. Wygaśnięcie historii nie usuwa propozycji ani przyjętej kopii odbiorcy. |
| Wysłany pakiet | Jest niezależną propozycją przeznaczoną dla konkretnego konta odbiorcy. Nie ma żywej zależności dostępu od źródłowej gry/logo ani znajomości. |
| Edycja/usunięcie oryginału albo usunięcie znajomości po wysłaniu | Nie zmienia ani nie cofa przekazanej kopii. Nie tworzyć ukrytego cofania przez kaskadę. |
| Usunięcie konta nadawcy | Usuwa jego oryginały i własną historię. Przekazana kopia należy do poddrzewa odbiorcy; nie daje dostępu do zasobów usuniętego nadawcy. Oznaczenie pochodzenia nie może wiązać się z nowym kontem o tej samej nazwie/adresie. |
| Konto odbiorcy → oczekująca własna gra/logo → zatwierdzenie | Odbiorca jest stałym ID konta. Usunięcie jego konta sprząta propozycje, pakiety i jego zasoby/pliki, również przed akceptacją. Nowe konto z tym samym adresem nie przejmuje starych kopii. |
| Pliki | Pakiet i przyjęta kopia nie mogą zależeć od plików w katalogu nadawcy. Sprzątanie odrzuconej/wygasłej propozycji nie usuwa plików używanych przez przyjęty zasób. |

Przed wdrożeniem sprawdzić rzeczywistą zawartość obecnego eksportu/importu:
definicję gry, ustawienia, logo i powiązane pliki. Przenosić ten sam zakres,
z własnością odbiorcy i bez cudzych identyfikatorów, tokenów sesji,
udostępnień, głosów i stanu urządzeń. Typ i stan początkowy zgodnie z importem.

## Realizacja i testy

1. Uzupełnić wspólną tabelę stanów, ważności i cooldownów dla propozycji
   kopii, uwzględniając duplikaty, odmowę i zmianę decyzji odbiorcy.
   Bez funkcji cofania nadawcy i bez przypomnień odrzuconych.
2. Wspólny eksport/snapshot/import oraz graf plików; utworzenie kopii
   podczas Wyślij dokładnie raz, także po utraconej odpowiedzi. Akceptacja
   zatwierdza istniejący zasób. Limity jak przy imporcie.
3. Modal tylko ze znajomymi, propozycje w zakładkach typu, lekki znacznik
   po przyjęciu, plakietki i spójne puste stany. Wejście „Wyślij” w sekcji
   importu/eksportu (osobno od górnych akcji zasobu).
4. Maile PL/EN/UK i `/go/`; kontrola odbiorcy, stanu oraz ważności pakietu
   przy kolejce i dostarczeniu. Nie uzależniać już przekazanej kopii od
   późniejszego istnienia źródła/nadawcy.
5. Testy obu zasobów i wszystkich typów: mail on/off, brak znajomości,
   brak własności, limity, wadliwy/niepełny pakiet, duplikat, odmowa,
   wygaśnięcie, kasowanie rodziców, zmiana adresu i wyścigi. Sprawdzić także historię właściwej gry/logo, granicę 30 dni i niezależność kopii po usunięciu wpisu historii.
6. Cykl wdrożenia z AGENTS.md; po zmianach wyglądu zrzuty z przykładowymi
   danymi (390/1400 px, także telefon w poziomie), bez czekania na akceptację.

## Inwentaryzacja istniejącego importu i eksportu — 2026-10-12

Przegląd kodu przed E19C (bez wykonania samego wysyłania):

| Zasób | Istniejący pakiet | Reguła do zachowania | Luka do obsłużenia przed wysyłaniem |
|---|---|---|---|
| Gra (`games-import-export.js`) | Nazwa, typ, pytania i odpowiedzi/punkty. Bez ustawień, logo, dźwięków, głosów, urządzeń, udostępnień i cudzych ID | Zamknięta ankieta eksportuje się jako Preparowana; robocza tekstowa nie przenosi odpowiedzi, punktowa zeruje punkty. Import tworzy nowe ID i stan draft | Obecny importer zapisuje kolejno, z usunięciem częściowej gry po błędzie. Wspólna akceptacja kopii musi zapewnić dokładnie jeden kompletny wynik; po utracie odpowiedzi nie tworzyć drugiego importu |
| Logo (`logo/js/transfer.js`, `list.js`) | GLYPH: warstwa/wiersze i source; PIX: format/rozmiar/bits oraz source. Obraz osadzany w JSON jako imageData. Bez ID/właściciela/historii edycji i rastra Host | Odbiorca korzysta z obecnego parsera. Import IMAGE zapisuje obraz w swoim Storage i sprząta go po błędzie rekordu; nazwa rozwiązuje konflikt w własnej liście | Obecny eksport po błędzie pobrania obrazu pozostawia imageUrl nadawcy. Wysyłanie ma odmówić niekompletnego pakietu albo zapewnić osadzenie; przekazana kopia nie może zależeć od pliku nadawcy |

Zakres gry jest identyczny z bieżącym eksportem — nie dodawać do tej
paczki osobnego formatu obejmującego ustawienia czy logo gry. Pliki logo
rozpatrywać również dla source/fabricData, aby kopia nie odwoływała się do
Storage nadawcy. Oryginał i jego historia wysyłek pozostają gałęzią nadawcy;
pakiet, oferta i przyjęty zasób — gałęzią stałego ID odbiorcy.

## Powiadomienia o kopiach — doprecyzowanie użytkownika 2026-10-12

Wysłana Gra i Logo są również źródłami powiadomień. Powiadomienie mailowe
powstaje we wspólnej kolejce, z flagą odbiorcy sprawdzoną przed insercją
oraz kontrolą aktualnej oferty przed dostarczeniem. Nowe rodzaje obejmuje
ten sam graf źródło→alokacja→kolejka→dostarczenie i katalog treści PL/EN/UK.
Link maila prowadzi przez Go do strony Gier albo Logo i właściwej zakładki.

| Sytuacja | Zachowanie |
|---|---|
| Oczekująca kopia, mail włączony | Oferta w zakładce odbiorcy, plakietka zakładki i przycisku strony, mail powiadomienia z Go |
| Oczekująca kopia, mail wyłączony | Ta sama oferta i plakietki; flaga blokuje utworzenie maila |
| Przyjęcie/odmowa/usunięcie oferty lub konta odbiorcy | Przeliczenie plakietek; jeszcze niewysłany mail traci ważne źródło i jest anulowany |
| Usunięcie oryginału, znajomości lub konta nadawcy po wysłaniu | Pakiet pozostaje w gałęzi odbiorcy; jego ważność i powiadomienie nie mogą zależeć od dalszego istnienia oryginału/nadawcy |
| Przypisanie dawnego adresu do innego konta | Nowe konto nie przejmuje oferty ani powiadomienia; tożsamość odbiorcy jest stałym ID Auth |

Decyzje i odbiór kopii pozostają na stronach Gier i Logo, zgodnie
z dotychczasowym planem plakietek i zakresu Zadań (ankiety).

### Pierwsza paczka E19C — wspólny pakiet Gry

Istniejący eksport korzysta z game-transfer-format.js. To ten sam format
.famgame i te same reguły dla Preparowanej/tekstowej/punktowej oraz ready
→Preparowana; bez ID, ustawień, cudzych plików, głosów i runtime. Zachowany
postęp eksportu. Nie wdraża jeszcze wysyłania ani propozycji.

Unit sprawdza trzy typy×cztery stany, brak cudzych pól/ID, niezmienność
wejścia i wartości domyślne. Punktowy game-transfer-format.spec.js ma
sprawdzić rzeczywisty eksport→istniejący import wszystkich trzech typów,
nowe ID, zgodność całej definicji i cleanup wyłącznie własnych gier.
Akceptacja oferty dokładnie raz będzie odrębną transakcyjną paczką.

### Ważność oczekującej kopii — pytanie architektoniczne

Historia nadawcy ma ustalone30 dni. Termin oczekującej oferty kopii był nieokreślony; pytanie wysłane do
użytkownika (bez terminu /30 dni /5 dni), a następnie wybrane5 dni.
Użytkownik poprosił najpierw o porównanie: aktualna oferta bazy wygasa po
5 dniach od utworzenia, osobiste zadanie ankiety żyje w bieżącym uruchomieniu
(bez stałego terminu dni). Zatrzymanie blokuje głosowanie, wznowienie może
przywrócić je w tym samym uruchomieniu.30 dni odmowy bazy to inny zegar.
Nie traktować pytania o obecne terminy jako wyboru terminu kopii.
Wspólny format/pakiet i niezależność plików można przygotowywać dalej.

### Druga paczka formatu — kompletne Logo

Wspólny eksporter Logo przygotowuje samowystarczalne source: IMAGE
osadza obraz, DRAW osadza także zagnieżdżone obrazy/tło/clipPath. Usuwa
historię edycji i pochodny raster Host, zachowując edytowalną treść.
Nieudane pobranie przerywa eksport z komunikatem PL/EN/UK; nie oddaje
pakietu z odwołaniem do pliku nadawcy. To uzupełnia istniejący .famlogo,
nie tworzy osobnego formatu dla kopiowania.

5 unit: IMAGE/TEXT/DRAW, osadzone dane bez odczytu nadawcy, nested
źródła, brak mutacji, niekompletne/błędne pobranie, teksty PL/EN/UK.
Native logo-transfer-format.spec.js przygotowany dla3 trybów: realny
plik w Storage, eksport/parser/własny rekord i własny plik IMAGE,
niezależne źródło DRAW, brak pakietu po404 i cleanup własnych danych.
Zamknięte na produkcji: branch38324179700, Pages38325603741,
main38325798279 success1/1 bez retry/539 unit. Sama oferta jeszcze
niewdrożona. Termin wybrany:5 dni.

## Decyzja: oczekująca kopia wygasa po5 dniach — 2026-10-12

Użytkownik: „No to zrób jak w bazach5 dni”. Termin liczony od pierwotnego
wysłania; otwieranie linku, odświeżenie, ponowne wejście ani dostarczenie
maila nie przedłuża ważności. Po terminie nie można przyjąć starej oferty,
plakietka znika, niewysłany mail jest anulowany, pakiet i jego nieużywane
pliki są sprzątane. Nowa świadoma wysyłka tworzy nową ofertę z własnym
terminem, przy zwykłych kontrolach znajomości, flagi i cooldownów.

| Zegar | Czas i zakres |
|---|---|
| Oczekująca oferta Gry/Logo |5 dni od wysłania, jak w Bazach |
| Historia nadawcy |30 dni od wysłania; niezależna od statusu oferty |
| Przyjęta własna kopia | Bez terminu oferty; zwykły zasób odbiorcy, usuwany jego decyzją lub wraz z kontem |

Odmowa zachowuje ukryty okres blokady nowej wysyłki30 dni, lecz dla
kopii Gier/Logo usuwa zasób i pakiet bez możliwości cofnięcia. Nie
przedłużać terminu oczekującej kopii przez przypomnienie/otwarcie.

### Import dokładnie raz — paczka364

Wspólny game_import_package tworzy grę i całą definicję w jednej
transakcji, korzystając z istniejącego game_import_content używanego
przez edytor. Prywatny kwit importu wiąże stałe ID właściciela, ID próby
i skrót pakietu. Ponowienie tej samej próby zwraca ten sam wynik;
inny pakiet z tym samym ID jest odrzucany. Usunięcie gry nie pozwala
jej wskrzesić ponowieniem. Usunięcie konta sprząta także kwity.

Lokalny rollback i trzy kontrolowane wyścigi zielone: równoczesny
import, usunięcie gry i konta. Zachowana zgodność starego edytora
oraz importu gościa. Migracja dodająca364 gotowa do bramki izolowanego
CI; frontend przejdzie na wspólne RPC dopiero po zastosowaniu DB.

### Wspólna tabela stanów oferty — E19C

| Stan odbiorcy | Odbiorca | Treść i ważność | Nadawca |
|---|---|---|---|
| Oczekuje | Kafelek w zakładce typu, Akceptuj/Odrzuć; liczony w plakietkach | Własna gra/logo odbiorcy już istnieje,5 dni od wysłania; zwykłe działania zasobu zablokowane do decyzji | Historia wysyłki; bez cofania ani ponawiania |
| Odrzucono | Oczekująca gra/logo oraz jej pliki i pakiet usunięte; brak sekcji odrzuconych i brak przywracania kopii | Minimalny zapis odmowy30 dni, bez treści zasobu i bez odtwarzania | Bez ponowienia; nowa wysyłka tego samego źródła tej osobie zablokowana przez okres odmowy |
| Przyjęto | Istniejąca własna Gra/Logo zatwierdzona, lekki znacznik „od X”; bez kafelka oczekującej oferty | Bez drugiego importu i bez nowych ID przy akceptacji; termin oferty nie dotyczy zatwierdzonego zasobu | Historia mówi tylko komu i kiedy wysłano, nie pokazuje decyzji |
| Oferta wygasła | Brak kafelka i plakietki; stary link nie pozwala przyjąć | Oczekująca kopia, pakiet i nieużywane pliki sprzątane; niewysłany mail anulowany | Wpis historii do końca swoich30 dni; nowa świadoma wysyłka przy zwykłych kontrolach |
| Usunięto źródło, znajomość albo konto nadawcy | Ten sam bieżący stan oferty | Bez zmiany snapshotu i jego zegarów | Sprzątanie własnych zasobów/historii nie usuwa gałęzi odbiorcy |
| Usunięto konto odbiorcy | Brak oferty i własnej kopii | Kaskada pakietu, kwitów, własnego zasobu/plików oraz jego maila | Brak przejęcia przez nowe konto o tym samym adresie |

Odmowa nie jest przypomnieniem ani nową wysyłką. Wspólny importer
pilnuje pojedynczego wyniku Wyślij również po utraconej odpowiedzi;
akceptacja zatwierdza ten wynik. Historia nadawcy ma niezależny
termin30 dni od wysłania i nie pokazuje statusów odbiorcy.

### Korekta momentu tworzenia kopii — decyzja2026-10-13

Użytkownik: kopie mają powstawać w bazie na koncie odbiorcy już przy
wysłaniu, a odrzucenie ma je usuwać. Zastępuje wcześniejszy plan
pakietu w osobnej tabeli i importu dopiero przy akceptacji. Zakończone
formaty, pliki Logo i importer364 pozostają użyteczne; zmienia się
moment wywołania importera i graf oczekującego zasobu.

Docelowo games/questions/answers albo user_logos i własne pliki
należą do odbiorcy od wysłania. Osobny wpis propozycji wiąże zasób,
nadawcę, token, typ, ważność i decyzję. Do akceptacji oczekujący zasób
ma podgląd oraz Akceptuj/Odrzuć; zwykła edycja/rozgrywka/ponowna
wysyłka nie mogą ominąć tej decyzji przez stare ścieżki lub RPC.
Zatwierdzenie nie zmienia ID i niczego ponownie nie importuje.

Odrzucenie oraz brak decyzji przez5 dni usuwają oczekujący własny
zasób i jego pliki, plakietkę oraz jeszcze niewysłany mail. Usunięcie
nadawcy/oryginału/znajomości tego nie robi. Konto odbiorcy pozostaje
nadrzędnym korzeniem wszystkich kopii i ich kolejki mailowej.

**Pytanie rozstrzygnięte przez użytkownika:** „Odrzucenie usuwa i nie
daje możliwości powrotu”. Odrzucenie usuwa oczekujący zasób, jego
pliki i pakiet. Brak undo i sekcji „Odrzucone przeze mnie” dla kopii.
Pozostaje minimalny zapis odmowy do ukrytej blokady30 dni oraz
informacja stanu w Go; bez treści umożliwiającej odtworzenie. Nowa
świadoma wysyłka po okresie odmowy pozostaje możliwa. Nie zmienia to
wdrożonych odmów Znajomych/Subskrybentów/Baz/Ankiet.

Lokalne draft-copy-graph-365.sql i test-copy-graph-365.sql sprawdziły
**wcześniejszy model**, w szczególności niezależność od źródła/nadawcy,
stałego odbiorcę, zegary i pojedynczy import przy akceptacji. Nie są
migracją ani wdrożoną wysyłką i nie wolno publikować ich jako realizacji
nowej decyzji; wymagają przeróbki momentu tworzenia kopii oraz blokad.

### Lokalny prototyp po korekcie — tworzenie podczas Wyślij

draft-copy-send-365.sql oraz test-copy-send-365.sql, izolowany
fam365send: trzy typy własnej gry powstają podczas wysłania, zanim
odbiorca kliknie Akceptuj. Akceptacja zatwierdza te same ID. Odmowa
usuwa grę/pytania/odpowiedzi i nie trzyma pakietu do odtworzenia;
granicę5 dni oraz usuwanie obu kont sprawdza rollback. Wybrane stare
mutacje gry/pytań/odpowiedzi/runtime są blokowane przed akceptacją.

To **lokalny prototyp, bez publicznego API i bez migracji**. Dalej:
pełny audyt blokad/wyścigów i atomowego snapshotu źródła, własne pliki
Logo podczas wysłania, kolejka/alokacja/dostarczenie, Go, UI i plakietki.
Nie deklarować tym wdrożenia wysyłania ani testów Logo/SMTP.

### Własny obraz odbiorcy — przygotowanie serwera

Istniejący importer oraz przyszły serwer wysyłania używają wspólnych
parseLogoPackage i decodeImportedLogoImage. Te same formaty, błędy
i limit5MiB; osobne unit sprawdzają granicę rzeczywistych bajtów.
Prywatny helper Workera przygotowany do zapisu w
receiver_id/received/copy_id.ext na podstawie zweryfikowanego planu DB.
Bez nadpisywania; konflikt ponowienia uznaje tylko identyczne bajty.
Na razie helper nie jest podpięty do endpointu i nie wysyła kopii.

Przed podłączeniem obowiązkowe: zweryfikowany plan tworzenia z własnością
źródła/znajomością/stałym odbiorcą, snapshot, sprzątanie nieukończonych
uploadów i wyścigi z usunięciem konta/odrzuceniem/wygaśnięciem. Nigdy
nie przyjmować katalogu odbiorcy bezpośrednio z niezaufanego body żądania.

### Wspólna definicja i bezpośrednia kopia pliku — realizacja

prepareResourceClone współdzieli gameExportSnapshot, parseLogoPackage
i baseExportSnapshot; obecny eksport Bazy także używa tego ostatniego.
mapLogoSourceImages obsługuje IMAGE i nested DRAW; eksport do pliku
zachowuje samowystarczalne base64, klonowanie może przypisać własny URL.
copyLogoStorageImage używa native Storage copy, tylko metadane HEAD:
kontrola własnego źródła, sygnatury pliku, MIME i5MiB; nie nadpisuje
wyniku i uznaje identyczny plik przy retry także po usunięciu źródła.
14 nowych unit, razem573 green. Przygotowanie planu nie jest jeszcze
publicznym klonowaniem: wymagane prywatne kwity/własność, staging/cleanup
oraz podłączenie do zapisu definicji i kontrole demo na serwerze.

### Bazy są objęte Powiel — ponowne potwierdzenie2026-10-13

Lokalny wspólny _resource_clone_write tworzy także Bazę w jednej
transakcji: nowe ID folderów/tagów/pytań, przemapowane rodzice/foldery
i oba rodzaje tagowania. Bez przejęcia question_base_shares i zaproszeń.
Test błędu drugiego pytania usuwa cały niezakończony wynik; retry
zwraca jeden zasób, usuniętego wyniku nie odtwarza. Test usuwania konta
wywołuje rzeczywiste delete_user_everything, nie sam DELETE Auth.
Bezpośrednia kaskada Auth po fixture utworzonym w tej samej transakcji
miała konflikt przejściowych FK Bazy; realna ścieżka z poprawną
kolejnością usuwania przechodzi. To lokalne kontrakty, jeszcze bez
publicznego Powiel. Source reader kontroluje konto/własność/pending
i blokady, blokuje rodziców/dzieci na czas spójnego odczytu; wzorce
demo trafiają do wspólnego porównania definicji na serwerze.

**Ujednolicenie plików po decyzji2026-10-13:** zarówno bezpośrednia
copyLogoStorageImage, jak i uploadCloneLogoImage dla osadzonych danych
używają cloneLogoImagePath: receiver/copies/job_id/asset_id.ext.
Zastępuje przygotowawczą ścieżkę received/copy.ext; nowy asset_id jest
częścią zweryfikowanego planu. Lokalny staging trzyma utrwalony odczyt
źródła i recepty plików; kolejne prace obejmują commit, GC i późne
sprzątanie po usunięciu konta, zanim trafi do publicznego przepływu.

### Staging i ochrona demo — lokalne kontrakty365

Jedna próba klonowania ma trwały job i recepty plików, zapisany spójny
odczyt źródła i stały katalog receiver/copies/job/asset. Istniejący job
nie czyta ponownie źródła po ukończeniu; przechowuje minimalny wynik,
nie drugi pakiet po publikacji. Commit Logo sprawdza, że wszystkie
referencje IMAGE/DRAW wskazują na zarejestrowane własne pliki z
odpowiednimi metadanymi. Kasowanie wyniku zleca cały katalog plików;
kasowanie konta również nieukończone joby. Oddzielne zapewnienie
cleanup obsługuje późne zakończenie uploadu po usunięciu konta.

Pochodzenie oryginalnego demo rejestrowane prywatnie przy seedzie
i backfillu. Nie kasować go przy zmianie nazwy/publicznego is_demo.
Bool demo_origin przechodzi wewnętrznie do własnej kopii, bez FK do
oryginału i bez znacznika na kafelku. Dodatkowo porównanie definicji
wykrywa niezmienione demo po imporcie; Bazy mają tylko Powiel,
bez nowej blokady istniejącego współdzielenia Baz.

To testy lokalne, nie publiczny endpoint. Pozostają: pełna orkiestracja
Workera, atomowe wybieranie nazwy przy równoległych kopiach, GC
nieukończonych prób, migracja/bramki i dopiero UI. Jednogodzinny
termin joba jest wewnętrznym sprzątaniem niedokończonej operacji;
nie zmienia5 dni oczekującej wysyłki ani30 dni jej historii/odmowy.

### Orkiestracja Powiel — przygotowanie

duplicateResource jest jednym przebiegiem Gier/Baz/Logo. Właściciel
pochodzi z Auth, nigdy z body. Snapshot i recepty plików pozostają
stałe między ponowieniami; po zagubionej odpowiedzi bazy sprawdzany
jest już zatwierdzony wynik. Normalne pliki bucketa idą native copy,
osadzone obrazy przez wspólny dekoder/bajty, statyczny demo-image.png
przez odczyt wyłącznie znanego własnego assetu i upload bajtów bez
base64. Niedozwolone hosty, cudze ścieżki i ścieżki kodowane odrzucać
przed uprzywilejowanym dostępem do Storage.

Commit wybiera nazwę pod blokadą właściciela: „kopia/copy/копія”,
kolejne numery i80 znaków; dopisek pozostaje wyłącznie w nazwie.
GC nieukończonej próby po godzinie oraz późnego pliku po usunięciu
konta sprawdza UUID, nie dawny e-mail. Root już zapisanej kopii chroni
jej pliki przed cleanup nieukończonego joba. API nie jest jeszcze
routowane; wymagane izolowane kontrakty, dodająca migracja/log i cały
cykl testów przed UI. Publiczne Wyślij/Go/mail pozostają dalszą paczką.

### Powiel Gier/Baz/Logo — bramka publicznego UI

365 zastosowane produkcyjnie (log03:14:54 UTC), Worker38341381212 success.
Native API38342073981 success: wszystkie typy Gier i Logo, pełna Baza
z folderami/tagami/oboma przypisaniami oraz nowymi ID bez shares.
UI branch38343598152 success,9 zrzutów w docs/img/transfer/duplicate.
Jeden bindResourceDuplicate, ikona przy importach/eksportach, nazwa
z kopia/copy/копія; bez dodatkowego znacznika. Aktualnie Powiel dotyczy
własnych zasobów zalogowanego konta. Publikacja UI i kontrola main
pozostają bramką zamknięcia tej paczki. Wyślij/mail/Go jeszcze niewdrożone.

### Powiel zamknięte produkcyjnie —2026-10-13

Main38347856610 success2/2 bez retry/593 unit po Pages38347797671:
publiczne API i rzeczywiste przyciski wszystkich3 stron. Galeria
ec3a2efae5/docs/img/transfer/duplicate zawiera9 widoków. Baza zachowuje
foldery/tagi/pytania i oba przypisania z nowymi ID, bez udostępnień.
Następne Wyślij nie jest jeszcze wdrożone. Przed nim366 usuwa inbox
odbiorcy przed zasobami i blokuje Auth względem równoległego wysyłania.
Rzeczywiste delete_user_everything sprawdzone lokalnie dla obu stron,
Gier i Logo;2 wyścigi green, wymagane finalne izolowane CI→DB/log.

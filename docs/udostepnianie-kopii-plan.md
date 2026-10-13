# Gry i Logo — wysyłanie kopii znajomym

Stan: **w realizacji**, etap E19C. Wspólne pakiety Gier i Logo zamknięte na produkcji; samo wysyłanie/oferty/powiadomienia jeszcze nie wdrożone. Decyzja użytkownika 2026-10-12.
Realizacja po bieżącym E19, przed E19N/E14/E20; manual pozostaje ostatni.

## Zasady i wygląd

| Obszar | Docelowe zachowanie |
|---|---|
| Odbiorcy | Wyłącznie znajomi. Brak pola e-mail/nazwy i brak Subskrybentów. |
| Akcja wejścia | **„Wyślij”**, w sekcji importu/eksportu Gier i Logo. Koperta: na telefonie sama ikona, na komputerze ikona obok nazwy. |
| Nadawca | Wybiera własną grę albo logo, otwiera standardowy modal udostępniania, zaznacza znajomych i klika „Wyślij”. Modal zawiera wybór znajomych, przycisk „Wyślij” oraz poniżej zwijaną historię; bez sekcji „Udostępnione”. Wspólna lista/checkboxy, odstępy, dymki i cooldowny jak w pozostałych modalach. |
| Po wysłaniu | Znikający dymek potwierdzenia. Bez listy współpracowników, ról, cofania i ponowień wiersza. |
| Historia | Zwijana sekcja „Historia wysyłek” poniżej wyboru znajomych i przycisku „Wyślij”: komu wysłano tę konkretną grę/logo i kiedy. Wpisy żyją 30 dni, potem są usuwane. Bez zarządzania dostępem i śledzenia decyzji odbiorcy. Pusta sekcja ukryta. |
| Odbiór | Propozycja kopii w odpowiedniej istniejącej zakładce typu na stronie Gier albo Logo. Przyciski akceptacji/odrzucenia jak w Bazach; nie dodawać tego do Zadań, które pozostają wyłącznie dla ankiet. |
| Akceptacja | Powstaje własny zasób odbiorcy, jak po imporcie. Nowe identyfikatory i własne pliki; bez dostępu do oryginału i bez aktualizowania kopii zmianami oryginału. |
| Filtr Gier | We wszystkich własnych zakładkach typu (Preparowane, tekstowe, punktowe) dostępne „Otrzymane”, oparte na zapisanym pochodzeniu kopii od znajomych. Gry społeczności bez filtra; wspólny wygląd E20. |
| Przyjęta kopia | Tylko lekki znacznik „od X”, bez statusu „zaakceptowano”, uprawnień i dodatkowego panelu udostępnienia. |
| Cofanie | Nadawca nie może cofnąć wysłanej kopii. Odbiorca zarządza przyjętym zasobem tak jak własnym importem. |
| Plakietki | Oczekujące kopie liczyć na właściwej stronie/ikonie Gier lub Logo i wypustce zakładki typu. Gry i Logo mają plakietki na wypustkach typów oraz przyciskach prowadzących do właściwej strony; wypustki pokazują oczekujące u odbiorcy kopie swojego typu, przycisk ich sumę. Bazy już mają ten mechanizm i są wzorcem. Po akceptacji/odrzuceniu/usunięciu/wygaśnięciu aktualizować, zero ukrywa plakietkę. Bez powielania w Zadaniach. |
| Mail i link | Zasada systemowa: odbiorca dostaje propozycję również przy wyłączonych mailach. Flagę sprawdzać przed kolejką. Link przez `/go/`, z kontrolą właściwego konta i spójnymi komunikatami stanów. |

## Snapshot i graf zasobów

Wysyłanie oznacza przekazanie pakietu odpowiadającego eksportowi w chwili
wysłania. Przyjęcie wykorzystuje wspólny importer. Nie tworzyć drugiego
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
| Wyślij | Zapisanie niezależnego pakietu i oferty dla znajomych | Ten sam snapshot; bez tworzenia zasobu odbiorcy przed akceptacją |
| Import | Utworzenie własnego zasobu z pliku | Wspólny importer |
| Akceptuj otrzymaną kopię | Utworzenie własnego zasobu z otrzymanego pakietu | Ten sam importer, stałe ID oferty i dokładnie jeden wynik |
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
| Konto odbiorcy → propozycja → przyjęta gra/logo | Odbiorca jest stałym ID konta. Usunięcie jego konta sprząta propozycje, pakiety i jego zasoby/pliki. Nowe konto z tym samym adresem nie przejmuje starych kopii. |
| Pliki | Pakiet i przyjęta kopia nie mogą zależeć od plików w katalogu nadawcy. Sprzątanie odrzuconej/wygasłej propozycji nie usuwa plików używanych przez przyjęty zasób. |

Przed wdrożeniem sprawdzić rzeczywistą zawartość obecnego eksportu/importu:
definicję gry, ustawienia, logo i powiązane pliki. Przenosić ten sam zakres,
z własnością odbiorcy i bez cudzych identyfikatorów, tokenów sesji,
udostępnień, głosów i stanu urządzeń. Typ i stan początkowy zgodnie z importem.

## Realizacja i testy

1. Uzupełnić wspólną tabelę stanów, ważności i cooldownów dla propozycji
   kopii, uwzględniając duplikaty, odmowę i zmianę decyzji odbiorcy.
   Bez funkcji cofania nadawcy i bez przypomnień odrzuconych.
2. Wspólny eksport/snapshot/import oraz graf plików; akceptacja dokładnie
   raz, również przy dwóch równoczesnych kliknięciach. Limity jak przy imporcie.
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

Odmowa i możliwość zmiany decyzji zachowują wspólny model E19; nie
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
| Oczekuje | Kafelek w zakładce typu, Akceptuj/Odrzuć; liczony w plakietkach | Kompletny snapshot,5 dni od wysłania | Historia wysyłki; bez cofania ani ponawiania |
| Odrzucono | Zwinięte „Odrzucone przeze mnie”, ikona cofnięcia odmowy; sekcja ukryta gdy pusta | Wspólny model Baz:30 dni od pierwszej odmowy, bez odnawiania przez kolejne odrzucenie | Bez ponowienia; nowa wysyłka tego samego źródła tej osobie zablokowana przez okres odmowy |
| Cofnięto odmowę | Ponownie propozycja z osobnymi Akceptuj/Odrzuć | Jak w Bazach: zachowany pierwotny declined_at i jego30-dniowa granica, bez nowego okresu5 dni | Ta sama wysyłka, bez nowego maila/historycznego wpisu |
| Przyjęto | Własna Gra/Logo, lekki znacznik „od X”; bez kafelka oczekującej oferty | Nowe własne ID/pliki; termin oferty nie dotyczy przyjętego zasobu | Historia mówi tylko komu i kiedy wysłano, nie pokazuje decyzji |
| Oferta wygasła | Brak kafelka i plakietki; stary link nie pozwala przyjąć | Pakiet i nieużywane pliki sprzątane; niewysłany mail anulowany | Wpis historii do końca swoich30 dni; nowa świadoma wysyłka przy zwykłych kontrolach |
| Usunięto źródło, znajomość albo konto nadawcy | Ten sam bieżący stan oferty | Bez zmiany snapshotu i jego zegarów | Sprzątanie własnych zasobów/historii nie usuwa gałęzi odbiorcy |
| Usunięto konto odbiorcy | Brak oferty i własnej kopii | Kaskada pakietu, kwitów, własnego zasobu/plików oraz jego maila | Brak przejęcia przez nowe konto o tym samym adresie |

Odmowa nie jest przypomnieniem ani nową wysyłką. Wspólny importer
pilnuje pojedynczego wyniku również po utraconej odpowiedzi; akceptacja
oferty używa stałego ID tej oferty. Historia nadawcy ma niezależny
termin30 dni od wysłania i nie pokazuje statusów odbiorcy.

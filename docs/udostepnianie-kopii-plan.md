# Gry i Logo — wysyłanie kopii znajomym

Stan: **do zrobienia**, etap E19C. Decyzja użytkownika 2026-10-12.
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

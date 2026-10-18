# E13 — plan prac nad instrukcją

Stan: **redakcja robocza**. Gałąź `codex/e13-manual` wskazuje ten sam commit co lokalny `main` i `origin/main`; nowa polska treść jest osobnym plikiem i nie została jeszcze włączona do opublikowanej strony `/manual/`.

E13 jest zwykle ostatnim etapem kolejki, ale redakcja polskiej wersji może trwać równolegle z pracami nad wyglądem. Przyjęto, że nadchodzące uwagi wizualne nie zmienią instrukcji. Przed włączeniem tekstu do strony sprawdzić go jeszcze raz z gotowym interfejsem.

## Cel

Nowa instrukcja ma pozwolić osobie, która pierwszy raz korzysta z Familiady, przygotować zawartość, zaprosić odbiorców ankiety, skonfigurować grę i poprowadzić ją bez zgadywania kolejnych kroków. Każdy opis ma odpowiadać na trzy pytania:

1. Gdzie wejść lub co wybrać?
2. Co zrobić na ekranie?
3. Co zobaczę po tej czynności albo jaki ma ona skutek?

Zakres przeglądu obejmuje **wszystkie funkcje, stare i nowe, na równych prawach**. Nie poświęcać więcej miejsca funkcji tylko dlatego, że została niedawno dodana. O długości opisu decydują liczba kroków, wybory użytkownika, możliwe skutki i to, czy bez wyjaśnienia łatwo utknąć. Proste, oczywiste czynności dostają krótką instrukcję; bardziej złożone przepływy dostają kolejne kroki — niezależnie od wieku funkcji.

Pisać po nazwach widocznych w aplikacji. Usuwać informacje o kodzie, plikach, bazie, usługach, przeglądarce i wewnętrznych mechanizmach, chyba że użytkownik musi wykonać konkretną czynność na swoim urządzeniu. Nie opisywać historii zmian ani szczegółów, które nie pomagają podjąć decyzji lub wykonać zadania.

## Kolejność i zakres

1. W trakcie redakcji wykonać pełny przegląd bieżących stron, nawigacji, pustych stanów, ikon i przepływów.
2. Zbudować mapę: zadanie użytkownika → strona → wymagane przygotowanie → wynik → następny krok.
3. Sprawdzić obecne treści PL, EN i UK względem aktualnego interfejsu; zachować dobre fragmenty Control i Ustawień gry, poprawiać tylko różnice i braki.
4. Napisać PL jako wersję źródłową, następnie wyrównać EN i UK. Nazwy przycisków oraz sekcji muszą odpowiadać interfejsowi w danym języku.
5. Wykonać punktowy przegląd treści z ekranami desktop i telefon, w tym poziomą orientacją tam, gdzie zmienia ona układ lub obsługę.
6. Dopiero po zgodności treści opublikować zmiany i wykonać kontrolę strony manuala.

## Proponowany układ instrukcji

Użyć obecnych kategorii jako szkieletu, a nie jako zasady „jedna strona aplikacji = jedna zakładka”. Podział ma uwzględniać dwa wymiary: **rodzaj zasobu** (gra, baza, ankieta, logo) oraz **rodzaj czynności** (utworzenie, edycja, udostępnienie, użycie w rozgrywce). Wspólne czynności wyjaśniać raz i podawać odnośniki z miejsc, w których są potrzebne. Cały przepływ od przygotowania do zakończenia gry ma własną kategorię **Przebieg rozgrywki**, podzieloną na krótkie etapy.

| Kategoria | Drobniejszy, logiczny podział | Główne strony / powiązane przepływy |
| --- | --- | --- |
| **Ogólny opis** | Od czego zacząć; różnica między przygotowaniem materiałów a grą na żywo; role operatora i prowadzącego. Logowanie i odzyskanie dostępu tylko jako krótka pomoc przy wejściu. | Strona główna, logowanie, Moje gry |
| **Gry** | Jedna sekcja **Tworzenie i edycja gry**: utworzenie lub wybór gry, dodawanie i poprawianie pytań oraz odpowiedzi, import i zapis. Dodać szczegółowy krok wysłania gry znajomemu jako niezależnej kopii oraz przyjęcia lub odrzucenia otrzymanej kopii. Krótkie wstawki pokazują, kiedy użyć bazy albo ankiety. | Gry, Edytor gry; odnośniki do Bazy pytań, Ankiet, Znajomych i Przebiegu rozgrywki |
| **Gry Społeczności** | Krótka sekcja: gdzie znaleźć gry społeczności, jak obejrzeć wybraną grę i jakie są dostępne dalsze działania. Jednym zdaniem odróżnić grę społeczności od prywatnej kopii wysłanej znajomemu. | Marketplace, Gry; odnośnik do Znajomych |
| **Znajomi** | Opisać zapraszanie, przyjmowanie i odrzucanie zaproszeń. Wyjaśnić udostępnianie każdego obsługiwanego zasobu w miejscu, gdzie ta czynność naturalnie występuje, oraz dodać tu mapę/odnośniki. Przy każdym typie wyjaśnić właściwe dla niego działanie i rezultat — kopia, dostęp z rolą albo zadanie do wykonania — bez zakładania jednego wspólnego sposobu. Zakres i szczegółowość wyznacza pełna lista funkcji, nie ich data dodania. | Znajomi, Gry, Logo, Bazy pytań, Ankiety; odnośniki do odpowiednich kroków |
| **Bazy pytań** | Zachować jako osobną sekcję. Treść jest prawie aktualna: lekko sprawdzić nazwy i czynności przy znalezieniu/podglądzie, użyciu lub edycji własnej bazy. Udostępnianie bazy opisać szczegółowo: wybór znajomego/odbiorcy i roli, co odbiorca widzi, jak przyjmuje dostęp oraz skutek cofnięcia dostępu. | Bazy pytań, Eksplorator baz, Edytor gry, Znajomi |
| **Ankiety** | Dwie odrębne podsekcje: **Ankieta dla subskrybentów** — jak udostępnić ankietę odbiorcom, jak trafia ona do ich Zadań, jak oddają głos i jak sprawdzić postęp; **Ankieta anonimowa** — jak otworzyć głosowanie linkiem/QR, zebrać głosy, zamknąć ankietę, połączyć zebrane głosy i podliczyć wynik do użycia w grze. Potwierdzić nazwy i kolejność tych czynności w aktualnym UI. | Ankiety, Zadania, głosowanie tekstowe i punktowe, QR, Gry |
| **Tworzenie logo** | Jedna sekcja obejmująca bibliotekę logo i wszystkie podstrony edytora: wybór logo → utworzenie jako tekst/obraz/rysunek → edycja → wysłanie znajomemu jako niezależnej kopii i przyjęcie/odrzucenie kopii → wybór w ustawieniach rozgrywki. Nie rozbijać trzech edytorów na osobne sekcje. | Logo, edytory tekstu/obrazu/rysunku, Znajomi, Ustawienia rozgrywki |
| **Ustawienia rozgrywki** | Osobna sekcja: drużyny, wygląd, dźwięk i pytania; objaśniać wybory przez ich widoczny skutek podczas gry. Zachować dobre istniejące opisy, poprawiając tylko niezgodności z aktualnym interfejsem. | Ustawienia gry, wybór logo, Panel sterowania (Podsumowanie) |
| **Przebieg rozgrywki** | **1. Przygotowanie przed startem:** sprawdź Ustawienia rozgrywki i podłącz urządzenia. Szczegółowo opisać udostępnienie urządzenia znajomemu lub innej osobie, wybór urządzenia, dostęp i cofnięcie udostępnienia. **2. Podsumowanie i start. 3. Rundy:** pojedynki, odpowiedzi, błędy, przejęcie i koniec rundy. **4. Finał:** przygotowanie graczy, wpisywanie i odsłanianie odpowiedzi. **5. Zakończenie lub rozpoczęcie od nowa.** Podłączanie i udostępnianie urządzenia to nazwane podrozdziały przygotowania, nie osobne zakładki. | Podłącz urządzenie, Panel sterowania, Wyświetlacz, Prowadzący, Przycisk, Znajomi; odnośnik do Ustawień rozgrywki |

Nie tworzyć osobnych zakładek dla Konta, Marketplace, Subskrypcji, Demo ani Podłącz urządzenie. Znajomi mają własną sekcję z krótką mapą różnic, a szczegółowe instrukcje czynności znajdują się także przy odpowiednich zasobach. W sekcji Ankiety oddzielić ankietę dla subskrybentów i Zadania od anonimowego głosowania. Ustawienia rozgrywki pozostają samodzielną sekcją. Biblioteka logo i jej trzy edytory tworzą jedną sekcję. Podłączanie i udostępnianie urządzeń to szczegółowy podrozdział przygotowania w Przebiegu rozgrywki.

## Przegląd treści istniejącej

- **Panel sterowania i Ustawienia gry:** są już opisane szeroko w `docs/Control i Game Settings — sekcje do sprawdzenia.md` oraz `docs/manual/control-game-settings.{en,uk}.md`; traktować je jako materiał do weryfikacji, nie pisać od zera. Sprawdzić wszystkie etykiety, ikonowe akcje, kroki urządzeń, nazwy przycisków oraz faktyczne zachowanie zapisu i resetowania ustawień.
- **Edytor gry:** uznać za prawie aktualny; sprawdzić nazwę gry, dodawanie i zmianę pytań/odpowiedzi, import, usuwanie, stan zapisu i powrót. Nie objaśniać budowy edytora.
- **Obecny manual na stronie:** treść główna jest w `web/shared/translation/pl.js`, `en.js`, `uk.js`; widoczne zakładki definiuje `web/manual/index.html`. Obecne kategorie są wzorcem, ale można je pogrupować wokół zadań: Ustawienia rozgrywki jako osobna sekcja, trzy edytory razem w sekcji Logo oraz podłączanie urządzeń jako podrozdział Przebiegu rozgrywki. Klucze `subscriptions` i `demo` istnieją w tłumaczeniach, lecz nie są aktualnymi zakładkami HTML; potrzebne informacje włączyć przy właściwej czynności albo pominąć.
- **Nowe i odrębne miejsca:** potwierdzić aktualność krótkiej sekcji Gry Społeczności, samodzielnej sekcji Znajomych i mapy typów udostępniania, szczegółowych kroków udostępniania bazy oraz urządzeń, Konta, Logo i ścieżek głosowania. Sekcja Baz jest osobna i prawie aktualna — lekko sprawdzić podstawowy opis, a udostępnianie bazy opisać szczegółowo. Wspólne kroki mogą być połączone, ale sekcje mają zachować sensowne punkty wejścia.
- **Strona główna (`/`):** skrócono galerię z 12 kart do czterech kroków: przygotowanie gry, zbieranie odpowiedzi, ustawienie wyglądu i prowadzenie partii. Gry społeczności, znajomi, udostępnianie oraz bazy są wymienione zwięźle pod galerią. FAQ uzupełniono o różnicę między ankietą anonimową i dla subskrybentów oraz o sposoby udostępniania materiałów. Dalszy przegląd powinien skupić się na świeżych, przykładowych obrazach zamiast dodawania kolejnych kart funkcji.
- **Mail marketingowy:** osobny przegląd treści, nie część instrukcji. Zweryfikować, czy obietnica i przykłady zgadzają się z aktualną stroną, czy przycisk prowadzi do właściwego miejsca i czy treść pozostaje zrozumiała bez wiedzy o projekcie. Pliki do porównania: `web/shared/js/core/marketing-mail.js` oraz tłumaczenia strony.

## Zrzuty i przykładowe dane

Zrzuty dodawać wtedy, gdy pokazują wybór, ikonę lub przejście trudne do opisania samym tekstem. Każdy zrzut powinien potwierdzać konkretny krok instrukcji, a nie pełnić roli dekoracji. Dla nowych lub zmienionych układów przygotować telefon 390 px i komputer 1400 px; dodać poziomy telefon, jeśli zmienia widok lub gest.

Aktualna praktyka daje dwie różne rzeczy:

- `docs/img/wzorce/` zawiera przeglądowe obrazy stron, ale sprawdzone obrazy Edytora i Ustawień pokazują pusty stan/szkielet; nie wystarczą jako dowód aktualnego przepływu ani zrzuty instrukcji.
- `.github/workflows/e2e-record.yml` uruchamia ręcznie nagrywany, czterookienkowy przebieg Control/Display/Host/Buzzer. `tests/e2e/record-playthrough.js` odtwarza demo przez tę samą czynność co przycisk demo, z realną treścią gry; istniejące demo ma 16 pytań rund po 6 odpowiedzi. To dobry materiał do oceny przebiegu gry i dźwięku, ale długi film nie zastępuje małych, podpisanych zrzutów kroków.

Koncepcja galerii strony głównej:

Zamiast osobnego obrazu dla każdej strony aplikacji ułożyć krótką, czteroczęściową opowieść zgodną z przebiegiem manuala. Jedna karta może zawierać dwa lub trzy powiązane kadry, jeśli pokazują kolejne kroki tej samej czynności. Pozostałe funkcje (np. Gry Społeczności, udostępnianie gier i logo, bazy) wymienić zwięźle pod galerią, bez wymuszania kolejnego zrzutu dla każdej z nich.

1. **Przygotuj grę:** sensownie wypełniona lista gier oraz edytor z kompletnym pytaniem. Kadr ma pokazywać działanie i rezultat, nie pusty formularz.
2. **Zbierz odpowiedzi — anonimowo lub od swojej puli:** w jednym zestawie ująć trzy kroki puli: zaakceptowany subskrybent, wybór odbiorców ankiety i status oddanego zadania; obok pokazać anonimowe głosowanie linkiem/QR z wynikiem. Proponowany podpis: „Zbuduj pulę subskrybentów, wysyłaj im ankiety jako zadania albo zbieraj głosy anonimowo przez link lub QR”. To jedna opowieść o ankiecie, nie osobna karta „Znajomi” i dwie kolejne karty ankiet.
3. **Dopasuj wygląd:** jeden zestaw z widokiem Ustawień gry i zapisanym logo/podglądem planszy. Pokaże, że logo i wygląd można przygotować przed rozpoczęciem partii.
4. **Poprowadź rozgrywkę:** zestawić Panel sterowania i Wyświetlacz z jednego stanu partii. W podpisie krótko wspomnieć, że Prowadzący i Przycisk do pojedynku można podłączyć dodatkowo; nie poświęcać im osobnych dużych kart.

Każdy zestaw ma reprezentować faktyczny przepływ, ale zachować dobrą czytelność na telefonie. Na szerokim ekranie kadry można zestawić obok siebie; na telefonie ułożyć je w kolejności pracy i dodać krótkie etykiety „Anonimowo” / „Zaproszeni” oraz strzałki tylko tam, gdzie są potrzebne do zrozumienia przepływu. Nie łączyć stron wyłącznie po to, by zmniejszyć liczbę plików: połączenie musi opowiadać jedną czynność.

Proponowany system nowych zrzutów E13:

1. Nie budować odrębnego screenshot-runnera, jeśli wystarczą już istniejące Playwright E2E i mechanizmy publikowania ich zrzutów. Dodać tylko brakujące kroki przechwytywania na końcu przepływu, po ustawieniu czytelnego stanu. Utrzymywać jeden zestaw kroków i danych dla weryfikacji przepływu oraz obrazu.
2. Używać deterministycznych danych z neutralnymi nazwami drużyn i zrozumiałymi pytaniami. Dla gry pełnej przygotować wymagane co najmniej 10 pytań i 3–6 odpowiedzi na pytanie. Bez prawdziwych nazw, adresów ani przypadkowych kont. Demo nadaje się tylko wtedy, gdy pokazuje dokładnie scenę potrzebną w instrukcji.
3. Ograniczyć ujęcia do stanów, które ułatwiają czynność: punkt wejścia, ważny wybór, rezultat. Nie robić galerii każdej ikony i wariantu. Dla stron z nowym układem uwzględnić telefon 390 px i komputer 1400 px; dodać poziom tylko wtedy, gdy zmienia obsługę.
4. Zrzuty z konkretnych przepływów przechowywać w `docs/img/manual/`; opisać sekcję, widok, szerokość i użyte dane w krótkim README. Podpis mówi użytkownikowi, na co spojrzeć.
5. Używać osobnego workflow `.github/workflows/manual-screenshots.yml`: uruchamia się po zmianie `web/**` na `main` i ręcznie. Języki mają niezależne joby; błąd jednego kadru nie pomija kolejnych ujęć, a błąd jednego języka nie anuluje pozostałych. Zrzuty są robione z wersji strony z danego commitu na osobnych kontach. Test tworzy trzy przykładowe gry, relacje odbiorców, zadania i głosy, a obrazy przekazuje wyłącznie jako artefakty przebiegu do przejrzenia. Nie zapisujemy ich teraz w bazie ani nie podmieniamy automatycznie grafik na stronie; zapis w bazie będzie osobnym, później podłączonym etapem. Do dopisania pozostają Bazy/Eksplorator, Logo, Ustawienia gry, Prowadzący, para Control/Display i finał. Recorder nadal służy do pełnego nagrania rozgrywki; nie zastępuje kadrów z jednego, zsynchronizowanego stanu.

### Dane scen i powtarzalne sprzątanie

**Wdrożony szkielet zrzutów:** `.github/workflows/manual-screenshots.yml` jest osobny od workflow E2E; po zmianie `web/**` na `main` i po ręcznym uruchomieniu wykonuje osobny job dla PL, EN i UK. Każdy job używa dedykowanego konta `test16`, `test17` lub `test18`, a nie wspólnej puli regresji. `tests/e2e/manual-screenshots.spec.js` na początku przebiegu tworzy trzy gry dla danego języka: preparowaną, ankietę punktową i ankietę tekstową. Każda ma 10 pytań, a pierwsze to pytanie ze starego zrzutu Control („Podaj coś, co można zjeść na szybko”) w wersji językowej danego konta. Gra preparowana i ankieta punktowa zawierają przy nim sześć odpowiedzi ze zrzutu w pozycjach 1–6 z punktami 39/24/16/9/7/5. Pozostałe dziewięć pytań ankiet jest osobnych. Wszystkie kadry danego języka korzystają z tego pytania. Obie ankiety są otwarte przed zrzutem. Znajomość i trzy subskrypcje są prawdziwymi rekordami aplikacji, ale subskrybentami są adresy e-mailowe na domenie `example.com`; wpisy aktywują automatyczne wywołania aplikacji, bez logowania odbiorców i bez otwierania skrzynek. To rzeczywiste wpisy z symulowaną akceptacją, nie rzeczywiste konta subskrybentów. Relacje są znajdowane i ponownie używane. Dla świeżych gier tworzy zadania dla znajomego i trzech subskrybentów, rejestruje zadaniowe głosy i anonimowy głos z telefonu, a potem sprawdza widok wyników. Zadaniowe odpowiedzi są obecnie wysyłane przez funkcje aplikacji, nie przez klikanie formularza Zadania. Joby są szeregowane, bo konta językowe są naprzemiennie odbiorcami i właścicielami. Nazwy kont zmieniają się tylko na czas zrzutu i są przywracane. Gry, zadania i głosy są usuwane po przechwyceniu, a każda scena czeka na zawartość ekranu i zapisuje obraz niezależnie. Zwykłe kadry mają 1365×768, anonimowy telefon 390×844, a główny Display 1600×900. Obrazy trafiają do artefaktów, nie są automatycznie publikowane.

**Obecny zakres przebiegu:** lista gier, edytor preparowanej gry, Znajomi, Subskrybenci, udostępnianie ankiety punktowej i tekstowej z prawdziwymi odbiorcami, stan Zadań przed i po odpowiedzi, anonimowy formularz na telefonie, rzeczywiste wyniki obu ankiet oraz osobny obraz główny Wyświetlacza. Główny obraz używa trybu podglądu i podanych X-ów/liczb bez otwierania prawdziwego meczu. To działający szkielet, nie gotowy zestaw do galerii: nie pokazuje jeszcze Baz/Eksploratora, Logo, Prowadzącego, zgodnej pary Panel/Wyświetlacz z żywej rozgrywki ani finału. Te kadry trzeba dopisać i obejrzeć przed włączeniem ich do strony.

**Konta dla zrzutów:** testy regresji używają wspólnej puli `test1`–`test8`; `test9` i `test10` są wyłączone ze zwykłej puli, `test11`–`test13` obsługują testy maili konta, `test14` jest skrzynką bez konta, a `test15` służy dedykowanym testom tożsamości odbiorcy i usuwania konta. `test16`, `test17` i `test18` są wyłącznie dla workflow zrzutów: po jednym koncie na `pl`, `en` i `uk`. Nie dodawać ich do puli regresji ani nie używać ich adresów jako skrzynek. Workflow sam ustawia język widoku przez `uiLang` i parametr `lang`, pozostawiając konto w jego przypisanym języku.

- Na początku każdego przebiegu powstają trzy osobne gry na bieżącym koncie: gra preparowana, ankieta punktowa i tekstowa. Są to rekordy poza demo. Każda ma dokładnie 10 pytań, a pierwsze jest pytaniem ze starego zrzutu Control („Podaj coś, co można zjeść na szybko”) w wersji językowej danego konta. Gra preparowana i ankieta punktowa mają przy nim sześć odpowiedzi ze zrzutu w pozycjach 1/2/3/4/5/6 z punktacją 39/24/16/9/7/5. Pozostałe pytania ankiet mają naturalną treść dla głosujących; wszystkie kadry używają pierwszego pytania.
- Na kontach zrzutowych pozostaje po jednej zaakceptowanej znajomości oraz trzech aktywnych, testowych subskrypcjach e-mailowych. Scena znajduje istniejące wpisy i używa ich ponownie, więc kolejne uruchomienia nie mnożą kontaktów i nie zmieniają ich w odrzucone relacje z blokadą ponownego zaproszenia. Gry i powiązane z nimi zadania oraz głosy są tymczasowe i usuwane po przechwyceniu.
- Każdy przebieg zaprasza znajomego i trzy testowe adresy subskrybentów do obu ankiet, rejestruje odpowiedzi zadaniowe jako rekordy aplikacji oraz głos anonimowy w mobilnym formularzu. Zadania są obecnie wypełniane funkcją aplikacji, a nie klikaną ankietą na stronie Zadania. Adresy subskrybentów korzystają z domeny `example.com`; workflow aktywuje rzeczywiste wpisy testowe bez kont odbiorców i bez wysyłania wiadomości.
- Konta językowe pojawiają się naprzemiennie w roli właściciela i znajomego. Joby PL/EN/UK są szeregowane, żeby jednocześnie nie zmieniać nazwy profilu ani nie wykonywać relacji na tym samym koncie. Błąd pojedynczego zrzutu nie pomija kolejnych ujęć ani pozostałych języków.
- Dla gry na żywo przywrócić demo, wybrać konkretne pytanie rundy, a potem poprowadzić Control do jednego, jawnie opisanego stanu — na przykład po odsłonięciu trzech odpowiedzi. Zrzut Control i Wyświetlacza musi powstać z tej samej gry i chwili, a treść, wynik drużyn i ujawnione odpowiedzi muszą się zgadzać między ekranami. Istniejący `record-playthrough.js` już przywraca demo i synchronizuje urządzenia; można wykorzystać jego sprawdzoną sekwencję, ale nie wolno użyć filmu ani niezależnych zrzutów z różnych stanów jako pary.

### Co rzeczywiście obejmuje obecny automat

Stan automatu należy odróżnić od docelowego zestawu galerii. `.github/workflows/manual-screenshots.yml` przygotowuje trzy gry na konto/język i przechwytuje listę gier, edytor, jej stan gotowy, Znajomych, Subskrybentów, udostępnianie obu typów ankiet, Zadania przed i po głosowaniu, anonimowe głosowanie na telefonie, listy rzeczywistych odpowiedzi i główny obraz Display. Obrazy są osobnymi artefaktami CI; żaden nie odświeża grafik strony ani `docs/img/manual/`.

- **Dane ankiet:** znajomy i trzy e-mailowe subskrypcje są rekordami aplikacji. Akceptacja subskrypcji jest automatyczna; odbiorcy nie logują się jako konta. `poll_share_send` tworzy prawdziwe zadania, a odpowiedzi są zapisywane przez funkcje głosowania. Nie korzystamy ze starego testu układu z 20 wirtualnymi osobami.
- **Pozostałe kadry galerii:** bazy i Eksplorator, wybór/rysowanie logo, Ustawienia rozgrywki, Host, zsynchronizowana para Panel/Wyświetlacz, finał oraz dedykowany główny obraz Wyświetlacza nie są jeszcze w automacie. Recorder zapisuje osobny pełny przebieg gry i nie zastępuje ujęć pary Control/Display z jednego stanu.

Zanim zrzuty trafią do galerii, należy uruchomić sceny na aktualnym interfejsie, obejrzeć wszystkie kadry i porównać je z poniższą listą starych obrazów. Sam fakt, że plik powstał w Playwright albo że workflow zakończył się powodzeniem, nie potwierdza jeszcze, że pokazuje właściwy krok ani dobre dane.

Wizualny przegląd bieżących polskich obrazów strony głównej:

- `landing-games.webp` pokazuje pustą kartę nowej gry i szkic „DEMO — Preparowana”; układ Moich gier i podpisy nie opowiadają pełnego tworzenia gry.
- `landing-editor.webp` pokazuje cztery widoczne pozycje oraz pasek przewijania listy. Nie należy wyciągać wniosku, że gry ma tylko cztery pytania: status „Minimum spełnione” może dotyczyć dalszych pytań poniżej. Mimo tego ujęcie jest stare i prawie puste po prawej stronie; zastąpić je pełnym, czytelnym przykładem.
- `landing-friends.webp` faktycznie przedstawia **Subskrypcje**, nie Znajomych. Podpis i treść w PL/EN/UK zostały już poprawione na „Zbuduj pulę odbiorców ankiet” oraz wyjaśniają zapraszanie subskrybentów i wysyłanie im zadań. Sam zrzut nie pokazuje jeszcze przejścia z aktywnej puli do odbiorców ankiety.
- `landing-polls.webp` pokazuje ankietę Punktacji z linkiem, QR i wynikami, ale konto „Test10”, nazwy demo oraz stary stan przycisku „Zamknąć ankietę” wymagają podmiany.
- `landing-polls-center.webp` pokazuje Centrum ankiet, ale panel **Zadania** jest pusty. Nie ilustruje zaproszenia do subskrypcji ani oddanego zadania, więc nie potwierdza treści obecnej karty.
- `landing-control.webp` pokazuje starszy układ Panelu sterowania i wymaga ponownego zrzutu.
- `landing-display.webp` i `landing-host.webp` pokazują konkretne widoki rozgrywki, lecz ich stan/styl należy porównać z aktualnym motywem przed użyciem. Zamiast dwóch osobnych kart lepiej zestawić aktualne kadry Control + Display w jednej karcie „Gra na żywo”.
- `landing-buzzer.webp` jest ilustracją samego przycisku, nie zrzutem strony. Można ją pominąć w galerii; funkcję wymienić jako opcjonalne urządzenie w opisie gry na żywo.
- `landing-bases.webp`, `landing-base-manager.webp` i `landing-logo.webp` zawierają dane demo i dawne ekrany biblioteki. Nie wymagają osobnych kart; wybrać jeden nowy kadr do zestawu „Dopasuj wygląd” tylko wtedy, gdy pokazuje faktyczny wybór logo lub efekt w ustawieniach.

Plan galerii zakłada więc cztery karty-przepływy zamiast dwunastu kart-stron. Szczególnie ankieta dostaje złożony obraz z dwoma ścieżkami — publiczną anonimową i zaproszeniową dla własnej puli — aby użytkownik od razu zobaczył, że może wybrać sposób zbierania głosów. Przed podmianą obrazów trzeba przygotować wiarygodne, neutralne dane testowe obejmujące aktywnych subskrybentów, wysłane i wykonane zadanie oraz anonimowy wynik.

## Postęp redakcji

- Polski szkic `docs/manual/e13-manual-pl.md` został przepisany w dziewięciu uzgodnionych sekcjach jako instrukcja krok po kroku. Zawiera tworzenie i edycję gier, gry społeczności, znajomych, bazy, zadania i głosowanie anonimowe, logo, ustawienia oraz przebieg rund i finału.
- Dodano towarzyszące uzasadnienie redakcyjne `docs/manual/e13-manual-pl-uzasadnienie.md`: objaśnia rolę każdej sekcji, akapitu i kroku, przesłanki kolejności oraz miejsca wymagające ponownego potwierdzenia w interfejsie. Ten plik jest notatką dla redakcji i nie należy go publikować w manualu.
- Dodano widok przeglądowy `docs/manual/e13-manual-pl-przeglad.md`, w którym pełny tekst i uzasadnienie każdej sekcji są zestawione obok siebie. To kopia do czytania; źródłami pozostają szkic i notatki redakcyjne.
- Strona główna została zredagowana po polsku, angielsku i ukraińsku w częściach obejmujących opis przepływu, kafelki funkcji i kluczowe odpowiedzi FAQ. Stare twierdzenia o liczbie pytań, edycji wyników, wznowieniu gry i wymaganym sprzęcie zastąpiono opisem faktycznych czynności.
- Błędnie opisana karta Subskrypcji na stronie głównej została nazwana zgodnie z rzeczywistym zrzutem; nowy projekt galerii łączy ją z drogą ankiety dla subskrybentów i anonimowym głosowaniem.
- Domyślna treść maila marketingowego została skrócona i ułożona wokół zadań użytkownika; usunięto nieaktualne obrazy i zbędne szczegóły o przeliczaniu wyników oraz wymaganym sprzęcie.
- Do zrobienia: przejść wszystkie opisane przepływy na aktualnych ekranach z testowymi danymi, dopracować szczegóły ustawień i panelu z istniejącego manuala, sprawdzić pozostałe treści strony i maila oraz przygotować przykładowe zrzuty. Następnie zdecydować, jak podzielić nowy tekst na sekcje strony manuala i włączyć polską wersję.

Zrzuty mają dokumentować zachowanie użytkowe. Nie umieszczać ich w manualu po to, by pokazywać wskaźniki ładowania, logi lub diagnostykę.

## Wydajność i raporty PageSpeed

Wnioski z raportów dotyczą strony głównej, nie treści manuala. Raport mobilny z 2026-10-12 oceniał wydajność na 0,76; FCP wynosił 2,4 s, a LCP 5,2 s. Raport desktopowy oceniał ją na 0,98; FCP wynosił 0,5 s, a LCP 1,0 s. W obu raportach TBT i CLS wynosiły 0. Największą wskazaną możliwością poprawy były obrazy (szacunkowo 799 KB na telefonie i 754 KB na desktopie), w tym obrazy kart funkcji pobierane przed ich obejrzeniem oraz warianty językowe pobierane ponownie po inicjalizacji tłumaczeń. Raport wskazywał też 44 KB nieużywanego JavaScriptu.

Wprowadzone poprawki: widoczna od razu treść strony nie czeka już na zakończenie inicjalizacji tłumaczeń; galeria ma cztery zamiast dwunastu kart; podglądy obrazów są zmniejszone do 960 px, ładowane leniwie, rezerwują proporcje przed pobraniem i są wybierane dopiero po ustaleniu języka, więc nie pobiera się najpierw niewłaściwy wariant. Kliknięcie nadal otwiera pełny obraz. Usunięto preload nieużywanego obrazu. Pozostawiono kod Supabase używany do rozpoznania zalogowanego użytkownika, oceny aplikacji i przycisku konta. Po wdrożeniu porównać nowe wyniki PageSpeed dla obu urządzeń; nie przedstawiać oszczędności z raportu jako pomiaru po zmianie.

Odnośniki do raportów: [telefon](https://pagespeed.web.dev/analysis/https-familiada-online/5oesbg85ga?utm_source=search_console&form_factor=mobile&hl=pl) i [desktop](https://pagespeed.web.dev/analysis/https-familiada-online/5oesbg85ga?utm_source=search_console&form_factor=desktop&hl=pl). Lokalny `docs/plan-performance.md` opisuje wcześniejsze prace, ale nie zastępuje pomiaru tych raportów. Do manuala przenosić tylko skutki widoczne dla użytkownika, np. co zrobić po utracie kontaktu urządzenia lub kiedy poczekać na potwierdzenie — bez pomiarów, implementacji i architektury.

## Zasady redakcyjne i akceptacja

- Każdy akapit odpowiada na potrzebę użytkownika; usunąć zdania opisujące rozwiązania techniczne lub powtarzające to, co już jednoznacznie pokazuje ekran.
- Przed redakcją sporządzić pełną listę zadań użytkownika dla wszystkich kategorii. Sprawdzić ją w obie strony: każda istotna funkcja ma jasne wyjaśnienie w manualu, a każdy opis odpowiada czynności dostępnej w aplikacji. Nie wyróżniać funkcji według tego, czy są nowe, stare lub ostatnio zmienione.
- Prowadzić użytkownika zadaniem, nie katalogiem stron. Jedna akcja w zdaniu; nazwa przycisku w cudzysłowie lub wyróżniona.
- Objaśniać ikony przy pierwszym użyciu albo pokazać je obok podpisu; nie wypisywać ikon, których znaczenie wynika z etykiety.
- Ostrzeżenia zostawić tylko wtedy, gdy wybór ma istotny skutek lub trudno go odwrócić.
- Zachować te same nazwy ról i widoków w PL/EN/UK. Nie tłumaczyć nazw, których interfejs w danym języku nie tłumaczy.
- Nie podawać szczegółów zależnych od wersji systemu/przeglądarki, jeśli istnieje krótsza uniwersalna czynność.
- Przed publikacją sprawdzić każdy opis bezpośrednio na aktualnym ekranie i przejść opisany przepływ z przykładowymi danymi.

E13 można zamknąć, gdy pełny wykaz funkcji i zadań jest pokryty proporcjonalnymi instrukcjami PL/EN/UK, treść odpowiada bieżącemu UI, powiązane przepływy mają czytelne odnośniki, zrzuty pokazują rzeczywiste UI z przykładowymi danymi, a główna strona i mail marketingowy nie obiecują nieaktualnych funkcji.

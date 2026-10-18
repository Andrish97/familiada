# E13 — pełny scenariusz przygotowania i robienia zrzutów

To jest scenariusz do przejrzenia przed rozbudową automatu. Rozróżnia kliknięcia wykonywane na ekranach, rekordy przygotowywane w danych testowych oraz widoki symulowane. Zrzut zapisujemy dopiero po potwierdzeniu, że właściwy tekst i stan są widoczne.

## Konta i języki

Każdy przebieg językowy loguje się na osobne konto właściciela: `test16` — polski, `test17` — angielski, `test18` — ukraiński. Język tych kont pozostaje zgodny z językiem ujęć. Workflow uruchamia języki kolejno, bo konta są używane także jako odbiorcy u znajomych.

W obecnym kodzie znajomym jest następne konto językowe: PL → EN, EN → UK, UK → PL. Zaproszenie jest rekordem aplikacji; przyjęcie wykonuje konto odbiorcy przez funkcję aplikacji.

**Rekomendacja dla tych kadrów:** zasymulować odbiorców, a zostawić prawdziwy interfejs. Zrzut ma pokazać, jak wygląda lista i jak używa się jej w ankiecie; nie musi dowodzić, że konkretna osoba odebrała wiadomość. Obecny sposób — trzy testowe wpisy subskrypcji utworzone przez `subscribers_invite` i aktywowane przez `poll_sub_accept_email` — daje poprawne rekordy i stany, bez skrzynek, dodatkowych kont ani wysyłania wiadomości. To testowe osoby i symulowane akceptacje, ale strona Subskrybentów, lista odbiorców i Zadania pokazują prawdziwy UI aplikacji. Znajomego również można przygotować jako relację testową między kontami zrzutowymi. Nie potrzeba zakładać kolejnych kont tylko po to, by uzyskać statyczne kadry.

Rozróżnienie zależy od tego, co ma udowadniać obraz: dla list i widoków wynikowych wystarczą stabilne dane testowe; gdy kadr ma pokazywać samą czynność, np. odbiorca otwiera zaproszenie albo oddaje głos, automat powinien przejść tę czynność w UI na dedykowanym koncie. Żaden wariant nie używa prawdziwych osób ani prywatnej poczty.

## Dane przygotowywane przed ekranami

Każdy przebieg usuwa pozostałości poprzedniego uruchomienia wyłącznie dla trzech nazw zarezerwowanych na zrzuty, a potem tworzy na koncie właściciela trzy nowe gry. To dodatkowe gry obok demo.

| Gra | Dane |
| --- | --- |
| Wieczór z Familiadą / Family Game Night / Вечір родинної гри | Gra preparowana, 10 pytań. Pierwsze to dokładnie pytanie ze starego zrzutu Control: „Podaj coś, co można zjeść na szybko” (odpowiednia wersja językowa na koncie). Ma sześć odpowiedzi jak na zrzucie: kanapka 39, pizza 24, hot-dog 16, zupa 9, jogurt 7, baton 5. Kolejne dziewięć pytań to lokalne przykłady. |
| Pytania dla znajomych / Questions for Friends / Запитання для друзів | Ankieta punktowa, 10 pytań. Pytanie z Control jest pierwsze, a kolejne dziewięć to pytania ankiety. Ankieta jest otwarta i gotowa do anonimowego głosowania oraz wysłania zadań. |
| Szybka ankieta / Quick Survey / Швидке опитування | Ankieta tekstowa, 10 pytań. To samo pytanie z Control jest pierwsze, potem dziewięć pytań do ankietowania. Ankieta jest otwarta i gotowa do wysłania zadań. |

W grach preparowanej i punktowej wpisujemy odpowiedzi przez bezpośrednie utworzenie rekordów pytań i odpowiedzi w bazie aplikacji — nie przez wpisywanie ich w edytorze. Dzięki temu wszystkie przebiegi językowe startują z powtarzalnymi danymi. Zrzut Edytora nadal pokazuje prawdziwy ekran aplikacji i gotową zawartość.

Pozostałych dziewięciu pytań nie zastępujemy wariantami tego samego pytania. Mają zwykłą, różną treść, aby lista i ankiety wyglądały jak kompletne materiały, a głosowanie miało sens.

## Ustalona kolejność rund i pytań finałowych

Pytanie z Control musi być pierwszą pozycją w rundach. Nie wolno zostawić losowania, bo obraz nie będzie powtarzalny. W grze preparowanej konfigurujemy to przez ekran **Ustawienia gry**:

1. W **Moich grach** zaznacz przygotowaną grę i otwórz **Ustawienia gry**.
2. Wejdź w **Pytania — Ustawienia**. Włącz finał i wybierz **Wybrane ręcznie** dla pytań finałowych oraz dla pytań rund.
3. W **Pytania — Finał** wybierz pięć pytań spośród pozostałych dziewięciu. Pytania finałowe i rundowe nie mogą się powtarzać.
4. W **Pytania — Rundy** ustaw pytanie „Podaj coś, co można zjeść na szybko” na pierwszym miejscu, a za nim wybierz cztery pytania rundowe. Zapisz ustawienia.
5. Wróć do listy. Dopiero teraz przejdź do **Graj**. Panel sterowania ma rozpocząć rundy od dokładnie tego pytania; nie losuje go z puli.

Te czynności trzeba wykonać w automacie przez widoczne zakładki i przyciski, żeby kadr ustawień pokazywał prawdziwy wybór i kolejność. Pozostałe dane gier tworzy przygotowanie fixture’ów; nie ma potrzeby klikać edytora, by ręcznie wpisywać dziesięć kompletnych pytań.

## Przebieg każdego językowego joba

1. Zaloguj właściciela właściwego języka, ustaw język strony i poczekaj na gotowość widoku. Nie przechwytuj ekranu na samym `domcontentloaded`; wymagaj widocznej treści właściwej dla sceny.
2. Utwórz trzy gry i pytania opisane powyżej. Przy przerwanym wcześniejszym jobie usuń tylko własne gry o zarezerwowanych nazwach.
3. Zaloguj konto znajomego w osobnym oknie przeglądarki. Utwórz/odnajdź znajomość i doprowadź ją do aktywnego stanu.
4. Utwórz/odnajdź trzy aktywne testowe subskrypcje. Dla kadrów listy i udostępniania aktywuj je funkcją aplikacji, bez tworzenia nowych kont i skrzynek. Jeśli później potrzebny będzie kadr, który wyjaśnia samo przyjmowanie zaproszenia, dodaj osobny przepływ UI na dedykowanym koncie; nie jest potrzebny do statycznego widoku aktywnej puli.
5. Dla obu ankiet wybierz znajomego i subskrybenta jako odbiorców zadań. Obecny automat tworzy zadania przez `poll_share_send`, czyli bez klikania przycisku wysyłki na ekranie. Sam ekran udostępniania jest później otwierany w interfejsie i czeka na widoczny QR oraz odbiorcę. Jeśli obraz ma dokumentować samą czynność wysyłania, automat musi dodatkowo wykonać wybór odbiorców i kliknąć **Wyślij** w interfejsie.
6. Oddaj anonimowe głosy na stronie głosowania telefonu przez klikanie odpowiedzi. Dla zadań obecny automat wywołuje funkcje głosowania i ukończenia zadania jako właściwy odbiorca; rekordy głosów i zadań są prawdziwe, ale wpisanie odpowiedzi nie odbywa się w ekranie Zadania. Dla zrzutu pokazującego samą czynność należy w przyszłości kliknąć odpowiedzi z widoku odbiorcy.
7. Przejdź kolejno po kadrach poniżej. Każdy kadr ma własny warunek gotowości i własny zapis. Błąd jednego ujęcia nie przerywa pozostałych.
8. Na końcu usuń trzy świeże gry; powiązane z nimi zadania i głosy znikają wraz z grami. Zachowaj jedną zaakceptowaną znajomość i trzy subskrypcje do ponownego użycia. Przywróć pierwotne nazwy profili i zamknij wszystkie okna, szczególnie przed innym jobem językowym.

## Kadry — czynności i warunek zrzutu

### Przygotowanie gry

| Kadr | Co robi przeglądarka | Co musi być widoczne przed zapisem |
| --- | --- | --- |
| **Lista gier** — 1365×768 | Otwiera **Moje gry**; niczego nie tworzy kliknięciem, bo trzy gry zostały wcześniej przygotowane w bazie aplikacji. | Wszystkie trzy tytuły i typy. |
| **Edytor gry** — 1365×768 | Otwiera edytor przygotowanej gry i pierwsze pytanie. | Dokładne pytanie ze starego Control, sześć odpowiedzi z punktami oraz informacja, że gra ma komplet pytań. |
| **Gra gotowa** — 1365×768 | Wraca do **Moich gier**. Obecny kod ustawia stan gry `ready` bezpośrednio w bazie, nie przez akcję w edytorze. | Ta sama gra ma stan gotowy i nadal jest na liście. |
| **Ustawienia — kolejność rund** — 1365×768 | Otwiera **Ustawienia gry**, klika **Pytania — Ustawienia**, włącza ręczny wybór rund, następnie **Pytania — Rundy**; przesuwa pytanie Control na pozycję 1 i zapisuje. | Lista pokazuje pytanie Control jako pierwsze i zapisany wybór. |
| **Ustawienia — finał** — 1365×768 | W tej samej grze włącza finał, wybiera ręczny tryb, wskazuje pięć pytań z pozostałych dziewięciu i zapisuje. | Pięć wybranych pytań finału. Żadne z nich nie jest pytaniem rundy. |
| **Bazy i Eksplorator** — 1365×768 | Otwiera istniejącą przykładową bazę, wchodzi do Eksploratora, wyszukuje lub wybiera kategorię i otwiera pytanie. Nie wpisuje danych produkcyjnych. | Czytelna kategoria, pytania i wybrany podgląd pytania. |
| **Gry Społeczności** — 1365×768 | Otwiera katalog, wybiera grę i otwiera podgląd; nie publikuje nowej gry. | Tytuł, opis i zawartość wybranej gry oraz dostępne działanie dla użytkownika. |

### Znajomi, subskrybenci i ankiety

| Kadr | Co robi przeglądarka | Co musi być widoczne przed zapisem |
| --- | --- | --- |
| **Znajomi** — 1365×768 | Otwiera **Znajomi** i klika zakładkę aktywnych/otrzymanych znajomych. | Aktywna przykładowa osoba, bez pustego stanu i bez danych prawdziwego użytkownika. |
| **Subskrybenci** — 1365×768 | Otwiera **Subskrybenci** i przechodzi do aktywnych wpisów. | Trzy aktywne przykładowe subskrypcje. Adresy są testowe, akceptacje automatyczne; nie przedstawiamy ich jako realnych kont. |
| **Udostępnianie ankiety punktowej** — 1365×768 | Otwiera Ankiety dla gry punktowej. Pokazuje wybór odbiorców oraz część anonimową z linkiem/QR ankiety. Obecny kod bezpośrednio tworzy zadania RPC; automatyczne kliknięcie **Wyślij** jest osobnym brakującym krokiem. | Nazwa ankiety, trzy wybrane wpisy subskrybentów i powiązane zadania. Docelowy QR podmienimy po otrzymaniu linku do mini-strony. Do tego czasu brak lub błąd renderowania samego QR nie przerywa tego ani pozostałych zrzutów; w takim przypadku automat ukrywa pusty/nieudany kod tylko na obrazie. Zrzut Wyświetlacza nie zawiera QR. |
| **Udostępnianie ankiety tekstowej** — 1365×768 | Otwiera analogiczny ekran gry tekstowej. | Właściwy tytuł ankiety i wybrani odbiorcy. |
| **Zadania oczekujące** — 1365×768 | Loguje konto znajomego, otwiera **Zadania**. | Dwa zadania w oczekiwaniu, jedno z każdej ankiety. Są rzeczywistymi rekordami, obecnie utworzonymi przez RPC. |
| **Anonimowe głosowanie na telefonie** — 390×844 | Otwiera link ankiety punktowej i klika pierwszą odpowiedź dla każdego pytania, czekając po każdym wyborze na następne pytanie. | Na pierwszym ekranie pytanie Control i jego odpowiedzi; po ostatniej odpowiedzi ekran potwierdzenia. Głosy zapisuje prawdziwa funkcja głosowania. |
| **Zadania wykonane** — 1365×768 | W bieżącym przebiegu zadania głosowane są przez batch RPC, a nie przez klikanie odpowiedzi w widoku **Zadania**. Potem konto znajomego otwiera tę stronę i rozwija wykonane. | Oba zadania w wykonanych. Wiersze i głosy są realnymi rekordami, lecz obecnie czynność wypełnienia zadania jest zasymulowana funkcją aplikacji. |
| **Wyniki ankiety punktowej** — 1365×768 | Właściciel otwiera zakładkę wyników. | Głosy anonimowe i zadaniowe zapisane wcześniej w aplikacji. |
| **Wyniki ankiety tekstowej** — 1365×768 | Właściciel otwiera wyniki ankiety tekstowej. | Kilka czytelnych odpowiedzi tekstowych z prawdziwych wpisów głosów. |

### Logo i rozgrywka

| Kadr | Co robi przeglądarka | Co musi być widoczne przed zapisem |
| --- | --- | --- |
| **Logo** — 1365×768 | Otwiera bibliotekę, wybiera istniejące logo. | Kilka nazwanych przykładów i wybrane logo. |
| **Edytor rysunku** — 1365×768 | Klika utworzenie logo rysunkowego, wybiera narzędzie i rysuje widoczny prosty znak. | Płótno z ukończonym znakiem i narzędzia; zapisane logo wraca do biblioteki. |
| **Ustawienia wyglądu/dźwięku** — 1365×768 | Otwiera ustawienia przygotowanej gry, wybiera zapisane logo i ustawienie dźwięku. Zapisuje przez **Zapisz**. | Podgląd rzeczywistej zmiany oraz wybrana opcja dźwięku. |
| **Panel sterowania i Wyświetlacz — runda 1** — Control 1365×768, Display 1600×900 | Z listy otwiera **Graj** dla przygotowanej gry. W Ustawieniach gry wybiera ręcznie rundy i finał, zapisuje i rozpoczyna grę. W Control wykonuje pierwszy pojedynek, a następnie klika odsłonięcia odpowiedzi. Display pozostaje podłączony do tej samej sesji. Zrzuty robi po wspólnym stanie renderu, bez otwierania drugiej gry. | Pytanie Control jako pierwsze w rundach, odpowiedzi/iksy i wyniki zsynchronizowane na obu ekranach. Konkretny moment odsłonięcia ustalamy z kadrem docelowym; nie odtwarzamy go przez podłożenie innego game_state. |
| **Prowadzący** — 1365×768 | W tej samej sesji otwiera lub podłącza **Prowadzącego** i czeka na aktualne pytanie. | Widok Host pokazuje pytanie i pełne odpowiedzi dla prowadzącego; zgodność z Control/Display. |
| **Finał** — 1365×768 | Kontynuuje tę samą grę. Kończy rundy, aż panel sam przejdzie do finału według wybranych ustawień; wpisuje przykładowe odpowiedzi obu graczy, a następnie pokazuje ekran przed odsłonięciem lub stan odsłaniania. | Wybrane pięć pytań finałowych i rzeczywisty stan finału. Nie tworzymy równoległego urządzenia tylko dla kadru finału. |

### Oddzielny główny obraz Wyświetlacza

Ten kadr jest **symulowany**, bo pokazuje nietypowe, wcześniej wskazane ułożenie planszy, którego nie należy uzyskiwać przez otwieranie dodatkowej rozgrywki i blokowanie zasobów. Uruchamiamy aktualny renderer Wyświetlacza w trybie podglądu, przekazujemy mu przygotowany stan i czekamy na zdarzenie gotowości. Stan: odkryte pozycje 1, 3, 5; iksy na pozycjach 1 i 3 po obu stronach; 111 punktów po obu stronach; 999 u góry; podpisy FAMILIADA i ONLINE. Ten obraz nie udaje prawdziwej sesji Control/Display i nie zastępuje zsynchronizowanej pary powyżej.

## Rozdzielczość i zapisywanie

- Zwykłe widoki desktop: **1365×768 px**.
- Anonimowe głosowanie telefonu: **390×844 px**.
- Główny, symulowany Display: **1600×900 px**.
- Zrzut pełnego ekranu tylko wtedy, gdy konkretna strona wymaga pokazania całego długiego zestawu. Nie zmniejszać później obrazu tak, by tekst był nieczytelny.
- Każdy obraz ma osobny warunek gotowości i osobny zapis. Błąd jednego obrazu nie kasuje ani nie pomija pozostałych.
- Workflow uruchamia się po zmianach `web/**` na `main` albo ręcznie, osobno dla wszystkich języków lub wybranego języka. Wyniki są artefaktami do obejrzenia; nie podmieniają automatycznie grafik strony.

## Co automat robi dziś, a co jest jeszcze planem

Obecny kod tworzy trzy gry, przygotowuje znajomego i trzy e-mailowe wpisy subskrybentów, tworzy zadania, głosuje anonimowo przez ekran telefonu, zapisuje zadaniowe głosy funkcjami RPC i przechwytuje listę gier, edytor, stan gotowy, Znajomych, Subskrybentów, udostępnianie, Zadania, wyniki oraz osobny symulowany obraz Display. W kilku miejscach dane/akcje są przygotowane przez bezpośrednie wywołanie funkcji lub zapis bazy zamiast kliknięcia UI — opisano to w tabelach.

Ręczny wybór kolejności rund i pytań finału, kadry obu zakładek ustawień, rzeczywisty przepływ od **Graj** do rundy, zsynchronizowana para Control/Display, Host oraz finał są kolejnym krokiem automatu. Trzeba je dodać jako odrębny scenariusz, ustawić konkretne pytanie na pierwszej pozycji rund i pięć innych pytań w finale, a potem przejść grę w panelu. Nie należy zakładać, że obecny zrzut listy „Gra gotowa” dowodzi przeprowadzenia tej rozgrywki.

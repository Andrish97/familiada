# E13 — automatyczny przebieg zrzutów

Workflow przygotowuje przykładowe dane, otwiera widoki aplikacji i zapisuje każdy zrzut jako osobny artefakt przebiegu. Sceny są od siebie odizolowane: nieudane oczekiwanie na jeden ekran zapisuje błąd tej sceny i pozwala kontynuować pozostałe. Zrzuty pokazują wygląd i przykładowe stany; nie wymagają kompletnego, działającego przebiegu między urządzeniami.

## Konta i przykładowe dane

Każdy język ma właściciela na wydzielonym koncie: `test16` — PL, `test17` — EN, `test18` — UK. Joby idą po kolei, bo następne konto językowe jest odbiorcą zaproszeń do znajomych. Subskrybentów tworzy się jako testowe wpisy adresowe i aktywuje przepływem aplikacji; workflow nie zakłada do tego nowych kont ani nie wysyła prawdziwych wiadomości.

Na koncie właściciela jest jedna stała gra preparowana oraz dwie osobne gry ankietowe po 10 pytań. Przy każdym przebiegu workflow odnawia pytania gry preparowanej i tworzy od nowa otwartą ankietę punktową oraz otwartą ankietę tekstową pod tymi samymi nazwami. Pierwsza gra zachowuje ID; ankiety dostają nowe ID, aby można było ponownie wysłać zadania zgodnie z limitami aplikacji. Pierwsze pytanie w każdej grze to pytanie ze starego zrzutu Control: „Podaj coś, co można zjeść na szybko” (w odpowiednim języku). W grze preparowanej odpowiedzi mają wartości: kanapka 39, pizza 24, hot-dog 16, zupa 9, jogurt 7, baton 5. Dziewięć pozostałych pytań ma zwykłą, zróżnicowaną treść. Druga gra to ankieta punktowa z odpowiedziami bez przypisanych jeszcze punktów; trzecia to ankieta tekstowa.

Do widoków Ankiet workflow przygotowuje aktywnego znajomego, trzy wpisy subskrybentów oraz zadania dla obu ankiet. Workflow przygotowuje przykładowe głosy i zadania do zrzutów; nie musi ręcznie odgrywać każdego głosowania. Dla ankiety punktowej przygotowuje 125 głosów na pytanie, niezależnie od późniejszego rozdzielenia punktów na planszy. Na ekranie wyników widać głosy przed podliczeniem, a wartości punktowe pozostają zerowe.

Dane gier, pytań, odpowiedzi, baz, logo, zadań i głosów workflow przygotowuje jako fixture’y. Control zaczyna od **Zacznij od nowa**. Ujęcia Prowadzącego i Wyświetlacza dostają ten sam przygotowany wiersz wbudowanego podglądu, więc nie tworzą sesji urządzeń ani nie zależą od połączenia na żywo. Główny kadr Wyświetlacza jest osobnym, symulowanym stanem planszy.

## Kolejność pytań i szybkie przejście do finału

W **Ustawieniach gry** automat włącza finał, wybiera ręczny wybór finałowych pytań, wskazuje pięć pytań i przełącza kolejność rund z losowej na wybraną ręcznie. Pytanie ze starego Control pozostaje poza finałem i na początku listy rund. Ustawienia są zapisywane przyciskiem **Zapisz wszystko**.

Ustawienia kolejności zapisujemy na stałej grze preparowanej. Jej identyfikator pozostaje ten sam między przebiegami; ustawienia są odnawiane do stanu potrzebnego do zrzutów.

## Przebieg jednego językowego joba

1. Zaloguj konto językowe i poczekaj na gotowość strony.
2. Odśwież treść stałej gry preparowanej i utwórz dwie nowe gry ankietowe. Poprzednie gry ankietowe wraz z ich głosami i zadaniami usuń.
3. Na grze preparowanej otwórz Control i jako pierwszą czynność wybierz **Zacznij od nowa**. Jeśli źródłem dźwięku jest przypadkowo Wyświetlacz, przełącz je na Control.
4. Zapisz kadr Control, a następnie osobny kadr formularza finału z przykładowymi pytaniami i wpisanymi odpowiedziami. Dla Prowadzącego i Wyświetlacza wstaw ten sam symulowany stan planszy; nie uruchamiaj połączeń urządzeń ani rzeczywistej partii.
5. Przygotuj dane znajomych, subskrybentów, zadań i głosów. Otwórz widoki gier, ankiet, zadań, baz, logo i ustawień, czekając na gotowość każdej strony.
6. Oddzielnie zapisz główny, symulowany kadr Wyświetlacza dla PL.
7. Usuń bazę i logo utworzone na potrzeby przebiegu oraz przywróć pierwotne nazwy profili. Gra preparowana pozostaje i jest odnawiana; poprzednie gry ankietowe są zastępowane przy kolejnym przebiegu. Zrzuty pozostają artefaktami, nie zapisujemy ich w bazie.

## Kadry

Zwykłe kadry mają rozmiar **1365×768 px**. Głosowanie na telefonie ma **390×844 px**. Główny, symulowany Wyświetlacz ma **1600×900 px**. Ekrany gier, bazy, edytora i ustawień są przechwytywane bez pełnostronicowego pomniejszania.

| Kadr (PL; EN i UK używają tego samego przebiegu) | Co robi automat i jaki stan przechwytuje |
| --- | --- |
| **Moje gry** (`games`) | Otwiera listę trzech przykładowych gier; nazwy i typy są widoczne razem. |
| **Edytor gry** (`game-editor`) | Otwiera pierwsze pytanie gry preparowanej, sześć odpowiedzi z punktami oraz listę pozostałych pytań. |
| **Gra gotowa** (`game-ready`) | Otwiera tę samą grę po przygotowaniu do prowadzenia; na liście widać jej stan gotowości. |
| **Logo** (`logos`) | Pokazuje nazwaną bibliotekę logo z przykładowymi zapisami. |
| **Edytor rysunku** (`logo-draw-editor`) | Wchodzi do edytora rysunku, wybiera narzędzie, rysuje i zapisuje znak. |
| **Bazy pytań** (`bases`) | Pokazuje przykładową bazę z kategorią i wpisanymi pytaniami. |
| **Eksplorator bazy** (`base-explorer`) | Wybiera przygotowaną bazę, klika **Przeglądaj** i czeka na widoczną treść w Eksploratorze. |
| **Ustawienia finału** (`game-settings-finale`) | Włącza finał, przełącza na wybór ręczny i wskazuje pięć pytań innych niż pytanie Control. |
| **Kolejność rund** (`game-settings-rounds`) | Przełącza tryb rund na ręczny i pokazuje pytanie Control jako pierwszą pozycję. |
| **Wygląd gry** (`game-settings-display`) | Otwiera **Wygląd**, wybiera przygotowane logo i czeka, aż wybór jest widoczny oraz zaznaczony. |
| **Dźwięk gry** (`game-settings-sound`) | Otwiera **Dźwięk** i czeka na widoczną listę ustawień dźwięków. |
| **Panel sterowania** (`gameplay-control`) | Otwiera Control na grze preparowanej, zaczyna od **Zacznij od nowa** i pokazuje przygotowanie urządzeń z wybranym źródłem dźwięku Control. |
| **Prowadzący** (`gameplay-host`) | Pokazuje ekran Prowadzącego z przykładowym pytaniem i odpowiedziami, wyrenderowany z przygotowanego stanu podglądu. |
| **Wyświetlacz** (`gameplay-display`) | Pokazuje planszę z tym samym przygotowanym stanem co ujęcie Prowadzącego; pytanie, odkryte odpowiedzi, X i wynik są spójne. To podgląd, bez sesji na żywo. |
| **Wpisywanie finału** (`gameplay-finale`) | Pokazuje ekran Control z pięcioma finałowymi pytaniami i przykładowymi wpisami odpowiedzi. To samodzielny stan widoku, bez uruchamiania finału ani urządzeń. |
| **Znajomi** (`friends`) | Pokazuje listę przykładowego znajomego na stronie **Znajomi**. |
| **Subskrybenci** (`subscribers`) | Pokazuje trzy testowe aktywne wpisy subskrybentów. |
| **Udostępnianie ankiety punktowej** (`poll-sharing`) | Pokazuje sekcję anonimową z linkiem/QR oraz listę odbiorców, w tym subskrybentów. Gdy QR nie da się wyrenderować, automat ukrywa wyłącznie pusty element QR dla tego kadru i nadal robi pozostałe zrzuty. Później kod QR w tym kadrze podmienimy linkiem do mini-stronki po jej otrzymaniu. |
| **Udostępnianie ankiety tekstowej** (`poll-text-sharing`) | Pokazuje ten sam przebieg udostępniania dla ankiety tekstowej. |
| **Zadania oczekujące** (`tasks-pending`) | Otwiera jako znajomy listę dwóch nieukończonych zadań — po jednym do każdej ankiety. |
| **Głosowanie anonimowe na telefonie** (`anonymous-voting-mobile`) | Otwiera ankietę punktową w szerokości telefonu; pierwsze pytanie to pytanie ze starego zrzutu Control. |
| **Głosowanie po ostatniej odpowiedzi** (`anonymous-voting-done-mobile`) | Odpowiada kliknięciem na wszystkie dziesięć pytań i przechwytuje stan końcowy mobilnej ankiety. |
| **Zadania ukończone** (`tasks-done`) | Otwiera jako znajomy listę dwóch wykonanych zadań. Głosy w tych zadaniach istnieją w bazie testowej, ale są wprowadzone przez funkcje aplikacji, a nie przez ekran Zadania. |
| **Wynik ankiety punktowej** (`poll-votes`) | Otwiera **Głosy** i przechwytuje 125 przygotowanych głosów na pytanie. Odpowiedzi mają jeszcze zero punktów; punkty zostaną wyliczone dopiero przy podliczeniu ankiety. |
| **Wynik ankiety tekstowej** (`poll-text-votes`) | Otwiera **Głosy** dla ankiety tekstowej i przechwytuje zebrane wpisy. |
| **Główny obraz Wyświetlacza** (`main-display`, tylko PL) | W trybie podglądu aktualny renderer pokazuje pytanie „Podaj coś, co można zjeść na szybko”, odsłonięte pozycje 1, 3 i 5, iksy na pozycjach 1 i 3 po obu stronach, wynik 111:111, 999 u góry oraz napisy FAMILIADA i ONLINE. To osobny symulowany kadr planszy. |

## Co trafia do artefaktu, a co zostaje w danych testowych

Pliki PNG są artefaktami wykonania GitHub Actions i zachowują ustawione rozdzielczości. Nie są automatycznie kopiowane do `/web` ani zapisywane w bazie. Stała gra preparowana pozostaje na koncie. Gry ankietowe, ich głosy i zadania są usuwane, a przy kolejnym przebiegu powstają nowe ankiety pod tymi samymi nazwami. Baza i logo utworzone na potrzeby przebiegu są usuwane. Stabilne relacje testowe znajomych i subskrybentów pozostają. Zrzut ankiety nadal pokazuje obecny QR ankiety; po ustaleniu adresu mini-stronki podmienimy cel kodu wyłącznie w ujęciu zrzutowym.

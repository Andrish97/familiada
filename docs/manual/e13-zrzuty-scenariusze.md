# E13 — automatyczny przebieg zrzutów

Workflow przygotowuje przykładowe dane, przechodzi przez widoki aplikacji i zapisuje każdy zrzut jako osobny artefakt przebiegu. Sceny są od siebie odizolowane: nieudane oczekiwanie na jeden ekran zapisuje błąd tej sceny i pozwala kontynuować pozostałe.

## Konta i przykładowe dane

Każdy język ma właściciela na wydzielonym koncie: `test16` — PL, `test17` — EN, `test18` — UK. Joby idą po kolei, bo następne konto językowe jest odbiorcą zaproszeń do znajomych. Subskrybentów tworzy się jako testowe wpisy adresowe i aktywuje przepływem aplikacji; workflow nie zakłada do tego nowych kont ani nie wysyła prawdziwych wiadomości.

Na koncie właściciela powstają trzy dodatkowe gry po 10 pytań. Pierwsze pytanie w każdej to pytanie ze starego zrzutu Control: „Podaj coś, co można zjeść na szybko” (w odpowiednim języku). W grze preparowanej odpowiedzi mają wartości: kanapka 39, pizza 24, hot-dog 16, zupa 9, jogurt 7, baton 5. Dziewięć pozostałych pytań ma zwykłą, zróżnicowaną treść. Druga gra to Punktacja, a trzecia Ankieta tekstowa.

Do widoków Ankiet workflow przygotowuje aktywnego znajomego, trzy wpisy subskrybentów oraz zadania dla obu ankiet. Głos anonimowy oddaje się na telefonie przez rzeczywiste kliknięcia w odpowiedzi. Głosy z zadań i ukończenie tych zadań przygotowuje się funkcjami aplikacji, a nie wpisywaniem odpowiedzi w widoku odbiorcy. Są to prawdziwe rekordy głosów/zadań na kontach testowych; ich wprowadzenie jest w tym scenariuszu przygotowaniem danych.

Dane gry, pytań i odpowiedzi, bazy oraz wybranych przykładów logo workflow przygotowuje w fixture’ach. Widoki, które są tematem zrzutu, otwiera i obsługuje w aplikacji. Osobny główny kadr Wyświetlacza jest symulowany w trybie podglądu: pokazuje aktualny renderer i przygotowany wiersz planszy, nie udaje sesji na żywo.

## Kolejność pytań i szybkie przejście do finału

W **Ustawieniach gry** automat włącza finał, wybiera ręczny wybór finałowych pytań, wskazuje pięć pytań i przełącza kolejność rund z losowej na wybraną ręcznie. Pytanie ze starego Control pozostaje poza finałem i na początku listy rund. Ustawienia są zapisywane przyciskiem **Zapisz wszystko**.

W tymczasowej grze do zrzutów automat ustawia też niski próg wejścia do finału i cel finału, zapisuje je w ustawieniach, po czym rozgrywa jedną rundę w Control. Dzięki temu może dojść do rzeczywistego ekranu finału bez odgrywania kilku pełnych rund. Te wartości dotyczą wyłącznie kasowanej gry testowej.

## Przebieg jednego językowego joba

1. Zaloguj konto właściwego języka, ustaw język i poczekaj, aż widok pokaże treść potrzebną do następnej czynności.
2. Usuń ewentualne pozostałości tylko po zarezerwowanych nazwach zrzutowych. Utwórz trzy gry i dziesięć pytań w każdej.
3. Przygotuj znajomego, trzy aktywne wpisy subskrybentów i zadania do ankiet. Akceptacja zaproszeń subskrybentów odbywa się testowym przepływem aplikacji; nie tworzy kolejnych kont.
4. Przejdź przez widoki gier, edytora, logo, baz i ustawień. Zmiany wyglądu i wybór kolejności wykonaj na ekranie, zapisz i sprawdź w UI.
5. Dla gry preparowanej otwórz jedną sesję Control, podłącz do niej Wyświetlacz, Prowadzącego i Przycisk do pojedynku. Zaczekaj na ekran gotowości urządzeń. Rozpocznij grę i rundę, naciśnij przycisk drużyny A, zatwierdź jej udział, odkryj pierwszą i trzecią odpowiedź oraz dodaj jeden błąd X.
6. Zapisz Control, Prowadzącego i Wyświetlacz bez zmiany stanu między tymi trzema ujęciami. Dalsze czynności w tej samej grze odkrywają pozostałe odpowiedzi, kończą rundę, przechodzą do finału i wpisują pięć przykładowych odpowiedzi pierwszego gracza. Zrzut finału obejmuje tylko Control.
7. Przejdź do Znajomych i Subskrybentów, potem do udostępniania obu ankiet. Oddaj anonimowe głosy na telefonie. Uzupełnij zadaniowe głosy funkcjami aplikacji, otwórz Zadania jako odbiorca i przejrzyj wyniki obu ankiet.
8. Oddzielnie otwórz podgląd głównego kadru Wyświetlacza dla PL.
9. Na końcu zamknij sesję gry i okna urządzeń, usuń trzy gry, bazę i logo utworzone na potrzeby przebiegu oraz przywróć pierwotne nazwy profili. Zaakceptowane połączenie znajomych i testowe subskrypcje pozostają do ponownego wykorzystania. Nie zapisuj zrzutów do bazy.

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
| **Panel sterowania** (`gameplay-control`) | W jednej sesji gry prowadzi pierwszy pojedynek, odkrywa odpowiedzi 1 i 3, dodaje X. Kadr przedstawia właściwą planszę, pytanie i wynik rundy. |
| **Prowadzący** (`gameplay-host`) | Bez zmiany stanu przechwytuje Prowadzącego dla tego samego pytania i rundy; widoczne są pytanie oraz pełna lista odpowiedzi dla prowadzącego. |
| **Wyświetlacz na żywo** (`gameplay-display`) | Bez zmiany stanu przechwytuje Wyświetlacz po tych samych odkryciach. Jego plansza i wynik muszą odpowiadać temu, co pokazuje Control. |
| **Finał** (`gameplay-finale`) | W tej samej partii kończy rundę, przechodzi do finału i wpisuje pięć przykładowych odpowiedzi. Zrzut pokazuje wypełniane pola Control bez osobnego ujęcia urządzeń. |
| **Znajomi** (`friends`) | Pokazuje listę przykładowego znajomego na stronie **Znajomi**. |
| **Subskrybenci** (`subscribers`) | Pokazuje trzy testowe aktywne wpisy subskrybentów. |
| **Udostępnianie ankiety punktowej** (`poll-sharing`) | Pokazuje sekcję anonimową z linkiem/QR oraz listę odbiorców, w tym subskrybentów. Gdy QR nie da się wyrenderować, automat ukrywa wyłącznie pusty element QR dla tego kadru i nadal robi pozostałe zrzuty. Później kod QR w tym kadrze podmienimy linkiem do mini-stronki po jej otrzymaniu. |
| **Udostępnianie ankiety tekstowej** (`poll-text-sharing`) | Pokazuje ten sam przebieg udostępniania dla ankiety tekstowej. |
| **Zadania oczekujące** (`tasks-pending`) | Otwiera jako znajomy listę dwóch nieukończonych zadań — po jednym do każdej ankiety. |
| **Głosowanie anonimowe na telefonie** (`anonymous-voting-mobile`) | Otwiera ankietę punktową w szerokości telefonu; pierwsze pytanie to pytanie ze starego zrzutu Control. |
| **Głosowanie po ostatniej odpowiedzi** (`anonymous-voting-done-mobile`) | Odpowiada kliknięciem na wszystkie dziesięć pytań i przechwytuje stan końcowy mobilnej ankiety. |
| **Zadania ukończone** (`tasks-done`) | Otwiera jako znajomy listę dwóch wykonanych zadań. Głosy w tych zadaniach istnieją w bazie testowej, ale są wprowadzone przez funkcje aplikacji, a nie przez ekran Zadania. |
| **Wynik ankiety punktowej** (`poll-votes`) | Otwiera **Głosy** i przechwytuje wspólny wynik anonimowych oraz zadaniowych odpowiedzi. |
| **Wynik ankiety tekstowej** (`poll-text-votes`) | Otwiera **Głosy** dla ankiety tekstowej i przechwytuje zebrane wpisy. |
| **Główny obraz Wyświetlacza** (`main-display`, tylko PL) | W trybie podglądu aktualny renderer pokazuje pytanie „Podaj coś, co można zjeść na szybko”, odsłonięte pozycje 1, 3 i 5, iksy na pozycjach 1 i 3 po obu stronach, wynik 111:111, 999 u góry oraz napisy FAMILIADA i ONLINE. To jedyne symulowane ujęcie. |

## Co trafia do artefaktu, a co zostaje w danych testowych

Pliki PNG są artefaktami wykonania GitHub Actions i zachowują ustawione rozdzielczości. Nie są automatycznie kopiowane do `/web` ani zapisywane w bazie. Fixture’y gier, głosów, zadań, bazy i logo są usuwane w sprzątaniu. Stabilne relacje testowe znajomych i subskrybentów pozostają, bo służą kolejnym przebiegom. Zrzut ankiety nadal pokazuje obecny QR ankiety; po ustaleniu adresu mini-stronki podmienimy cel kodu wyłącznie w ujęciu zrzutowym.

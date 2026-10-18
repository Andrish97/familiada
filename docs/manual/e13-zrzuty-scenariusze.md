# E13 — automatyczny przebieg zrzutów

Workflow otwiera wdrożone strony z `main` i zapisuje każdy widok jako osobny artefakt. Nie loguje się na konta, nie zakłada kont i nie zapisuje danych w bazie. Przykładowe treści podstawia lokalnie w przeglądarce, korzystając z bieżącego HTML-a, CSS-u, ikon i rendererów aplikacji. Błąd pojedynczego ujęcia nie zatrzymuje pozostałych zrzutów.

Ujęcia Control, Prowadzącego i Wyświetlacza korzystają z bieżącego interfejsu rozgrywki i renderera podglądu, z tym samym przykładowym stanem rundy. Główny kadr Wyświetlacza to osobny podgląd z wyróżniającymi się liczbami i układem odpowiedzi. Listy zasobów, znajomych, zadań i ankiet używają lokalnych przykładów renderowanych wspólnymi komponentami aplikacji. Kadry pokazują wygląd i przykładowe stany, a nie zapisane rekordy ani rozgrywkę na żywo.

## Przebieg

Dla każdego języka workflow otwiera stronę wdrożoną z `main`, czeka na jej strukturę i style, dodaje lokalne przykładowe treści i zapisuje PNG w docelowym rozmiarze. Przebiegi PL, EN i UK działają niezależnie. Dane przykładowe pozostają w przeglądarce, a zrzuty są artefaktami workflow.

Ustawienia pokazują przykładowy wybór pytań finałowych, kolejność rund, logo wyświetlacza i źródło dźwięku. Zwykła runda używa drużyn Króliczki i Zajączki, z nazwami dostosowanymi do EN i UK. Osobny podgląd Wyświetlacza używa FAMILIADA / ONLINE, wyniku 111:111, liczby 999 u góry i ustalonego układu odkryć oraz iksów. Ten specjalny układ występuje tylko na tym jednym zrzucie.

## Kadry

Zwykłe kadry mają rozmiar **1365×768 px**. Głosowanie na telefonie ma **390×844 px**. Główny, symulowany Wyświetlacz ma **1600×900 px**. Ekrany gier, bazy, edytora i ustawień są przechwytywane bez pełnostronicowego pomniejszania.

| Kadr | Co pokazuje |
| --- | --- |
| **Moje gry** (`games`) | Listę przykładowej gry przygotowanej, ankiety punktowej i ankiety tekstowej. |
| **Edytor gry** (`game-editor`) | Pytanie rundy, sześć odpowiedzi z punktami oraz listę pytań. |
| **Gra gotowa** (`game-ready`) | Tę samą listę z grą oznaczoną jako gotowa do prowadzenia. |
| **Ustawienia finału** (`game-settings-finale`) | Przykładowy wybór pięciu pytań finałowych. |
| **Kolejność rund** (`game-settings-rounds`) | Ręcznie ustawioną kolejność z pytaniem rundy na początku. |
| **Wygląd gry** (`game-settings-display`) | Wybór przykładowego logo. |
| **Dźwięk gry** (`game-settings-sound`) | Ustawienie źródła dźwięku. |
| **Logo** (`logos`) | Bibliotekę kilku nazwanych logo. |
| **Edytor rysunku** (`logo-draw-editor`) | Edytor z przykładowym rysunkiem na obszarze roboczym. |
| **Bazy pytań** (`bases`) | Listę baz z przykładowymi nazwami i liczbą pytań. |
| **Eksplorator bazy** (`base-explorer`) | Kategorie, pytanie i przykładowe odpowiedzi. |
| **Znajomi** (`friends`) | Listę znajomego z przykładowymi danymi. |
| **Subskrybenci** (`subscribers`) | Listę trzech subskrybentów. |
| **Udostępnianie ankiety** (`poll-sharing`) | Link do anonimowej ankiety oraz przykładowe wpisy odbiorców; pusty lub niedostępny QR jest pomijany w tym ujęciu. |
| **Zadania oczekujące** (`tasks-pending`) | Dwa zadania do ankiet z akcją głosowania. |
| **Zadania ukończone** (`tasks-done`) | Dwa przykłady zadań po oddaniu głosu. |
| **Głosowanie anonimowe na telefonie** (`anonymous-voting-mobile`) | Pytanie i warianty odpowiedzi w widoku mobilnym. |
| **Wynik ankiety punktowej** (`poll-votes`) | Przykładowe liczby głosów przed podliczeniem punktów. |
| **Wynik ankiety tekstowej** (`poll-text-votes`) | Przykładowe wpisy tekstowe i ich liczby. |
| **Panel sterowania** (`gameplay-control`) | Rundę z odkrytymi odpowiedziami, wynikami i nazwami drużyn. |
| **Prowadzący** (`gameplay-host`) | Widok dla osoby czytającej pytania, ze stanem tej samej rundy. |
| **Wyświetlacz** (`gameplay-display`) | Planszę tej samej rundy co w Control i u Prowadzącego. |
| **Wpisywanie finału** (`gameplay-finale`) | Pięć pytań finałowych i przykładowe odpowiedzi. |
| **Główny obraz Wyświetlacza** (`main-display`, tylko PL) | Osobny kadr z FAMILIADA / ONLINE, wynikiem 111:111, wartością 999 u góry i nietypowym układem odkryć oraz iksów. |
## Co trafia do artefaktu

PNG są artefaktami GitHub Actions i zachowują rozmiar kadru. Nie są automatycznie kopiowane do `/web` ani zapisywane w bazie. Rozdzielczość komputera wynosi **1365×768 px**, głównego Wyświetlacza **1600×900 px**, a głosowania mobilnego **390×844 px**. Kadry nie są pomniejszane przez przechwytywanie całej strony.

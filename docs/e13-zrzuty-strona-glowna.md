# Zrzuty strony głównej — zestaw do panelu admina

Zrzuty pokazują aktualne widoki aplikacji z czytelnymi, przygotowanymi przykładami. Admin otwiera i edytuje dane danego widoku, przegląda jeden widok naraz w iframe i uruchamia odświeżenie całego zestawu. Każdy kadr czeka na gotową treść; błąd pojedynczego kadru nie zatrzymuje pozostałych. Gotowe pliki trafiają do bucketa. Na razie strona główna nadal korzysta ze starych obrazów; pobieranie nowych kadrów z bucketa zostanie podłączone osobno. Nie używamy kont ani danych puli E2E do przygotowania galerii.

## Kolejność i kadry

### 1. Gry i bazy

1. **Moje gry — Preparowane.** Lista kilku gier; wybrana gra „Rodzinny pojedynek” jest tą samą grą, którą pokazują następne kadry.
2. **Edycja gry.** Otwarta „Rodzinny pojedynek”; po lewej lista pytań, po prawej wybrane pytanie „Podaj coś, co można zjeść na szybko” z sześcioma podpisanymi odpowiedziami i punktami.
3. **Bazy pytań.** Kilka czytelnych kafelków baz.
4. **Eksplorator bazy.** Jedna z widocznych baz otwarta na folderach/kategoriach i wpisach pytań; bez edytora odpowiedzi.

### 2. Znajomi, zadania i ankiety

1. **Znajomi.** Kilka pozycji w różnych stanach relacji, z naturalnymi nazwami i czytelnymi statusami.
2. **Subskrybenci.** Lista kilku osób w różnych stanach zaproszenia do puli odbiorców ankiet.
3. **Zadania.** Kilka zadań ankietowych w różnych stanach; nazwy ankiet są zgodne z kolejnymi kadrami.
4. **Udostępnianie ankiety.** Widok z publicznym linkiem i QR oraz zaproszeniami dla subskrybentów. QR będzie prowadzić pod adres dostarczony przez właściciela produktu; do tego czasu brak docelowego adresu nie może przerywać generowania pozostałych kadrów.
5. **Głosowanie anonimowe — telefon.** Osobny widok mobilny tej samej ankiety.
6. **Głosy i wyniki.** Odpowiedzi z kilku źródeł i widok podsumowania; liczba oddanych głosów pozostaje spójna z listą odpowiedzi.

### 3. Wygląd i logo

1. **Ustawienia wyglądu.** Podgląd logo i wyglądu planszy.
2. **Ustawienia dźwięku.** Karty dostępnych dźwięków z nazwami i właściwym podglądem.
3. **Biblioteka logo.** Kilka kafelków z prawdziwymi podglądami.
4. **Edytor rysunku.** Przykładowy projekt otwarty w edytorze.

### 4. Rozgrywka

1. **Panel sterowania — runda.** „Rodzinny pojedynek”, drużyny Króliczki i Zajączki oraz konkretne pytanie i częściowo odsłonięte odpowiedzi.
2. **Prowadzący.** Ten sam stan rundy, co w Panelu sterowania.
3. **Wyświetlacz — runda.** Plansza odpowiada dokładnie temu samemu stanowi i wynikom.
4. **Panel sterowania — finał.** Osobny stan wpisywania odpowiedzi finałowych, bez urządzeń.
5. **Główny Wyświetlacz.** Osobna, przygotowana plansza FAMILIADA / ONLINE z 999 u góry, wynikami 111:111 i uzgodnionym nietypowym układem odsłoniętych X-ów.

## Dane i rozmiary

Wspólny przykład gry ma 10 pytań. Jedno z nich to „Podaj coś, co można zjeść na szybko” z odpowiedziami „Kanapka”, „Owoc”, „Jogurt”, „Sałatka”, „Drożdżówka”, „Baton” i punktacją odpowiednio 39, 24, 16, 9, 7 i 5. Ten sam tytuł gry, nazwy drużyn, pytanie i wyniki są używane we wszystkich powiązanych kadrach. Ankieta ma osobne dane przykładowe, żeby jej liczba odpowiedzi nie musiała odpowiadać punktacji planszy.

Rozmiary docelowe: widoki aplikacji **1440×900 px**, telefon **390×844 px**, główny Wyświetlacz **1600×900 px**. Kadry mają pokazywać normalny ekran, bez zmniejszania całej strony do jednego obrazu. W panelu podglądu montowany jest tylko jeden iframe naraz.

## Panel danych przykładowych

- Panel ma dwie zakładki: **Lista ogólna** oraz **Podgląd kategorii**. Wybór kategorii, języka i akcje zapisu lub przechwycenia są zawsze na górze karty.
- Lista ogólna przechowuje wspólne wpisy używane w kilku kadrach, między innymi grę i jej pytania, nazwy drużyn, ankietę i aktywnych subskrybentów.
- Podgląd kategorii zestawia edytowane dane po lewej z rzeczywistym widokiem strony po prawej. Nad nimi pokazuje, czy dane pochodzą z listy ogólnej, czy są przykładami tylko tej kategorii.
- Kategoria może wskazywać osobę z listy ogólnej i dopisywać jej działanie bez kopiowania ani edycji danych osoby. Przykład: zaproszony subskrybent i informacja, czy oddał głos w tej ankiecie. Ta informacja należy do kategorii ankiety; lista ogólna zawiera samą osobę.
- Zapis kategorii obejmuje jej własne dane i przypisane działania. Zapis listy ogólnej aktualizuje wspólne wpisy we wszystkich powiązanych kadrach.

## Instalacja panelu admina

- Panel ma osobny manifest i zakres aplikacji `/settings/`, dzięki czemu można dodać osobny skrót „Panel admina”, niezależny od aplikacji Familiada.
- Przycisk instalacji pojawia się po uzyskaniu dostępu do panelu. Cloudflare Access nadal chroni stronę przy każdym otwarciu; instalacja nie zapisuje ani nie omija logowania. Jeśli sesja Access wygaśnie, panel poprosi o ponowne zalogowanie.
- Panel nie działa offline i nie buforuje danych. Na iPhonie przycisk pokazuje krótką instrukcję dodania strony do ekranu początkowego, a w Safari na Macu instrukcję dodania do Docka; na obsługiwanych przeglądarkach uruchamia natywne okno instalacji.

## Reguły odświeżania

- Domyślne przykłady są zapisane przy konfiguracji widoków w bazie i można je poprawić przed przechwyceniem.
- Przechwycenie uruchamia się z panelu admina; nie jest osobnym workflow GitHub Actions i nie korzysta z kont testowych.
- Każdy widok jest przechwytywany niezależnie po potwierdzeniu, że jego treść jest gotowa.
- Nieudany kadr zostaje oznaczony jako nieudany, a przebieg przechodzi do następnego.
- Po osobnym podłączeniu strona główna będzie używać aktualnych obiektów z bucketa. Stare obrazy w repozytorium usuwa się dopiero po pełnym przełączeniu galerii na nowe adresy.

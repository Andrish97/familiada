# Aktywność użytkowników — wdrożenie

Pełny podgląd „Aktywność teraz” i wykresy należą do karty Statystyki.
Maintenance pokazuje nieklikalny kafelek z liczbą użytkowników oraz
podsumowaniem gier i edycji. W Statystykach kafelek znajduje się w siatce
z pozostałymi licznikami i otwiera to samo okno szczegółów oraz tę samą
tabelę z paginacją co inne statystyki. Tabela nie znajduje się w głównym
widoku. Liniowy wykres aktywności z delikatnym wypełnieniem i punktami
jest osobną kartą w dotychczasowej sekcji wykresów.

## Sygnały bieżące

- Nowy lekki sygnał otwartej strony co 30 s, z informacją o widoczności
  karty. Wygasa z podglądu po 90 s. Otwarta karta nie oznacza działania
  użytkownika. Sygnał zaczyna działać po odświeżeniu istniejącej strony.
- Wspólne blokady zasobów: aktywna edycja, ważność 25 s.
- Obecność urządzeń: ważność 25 s; korzystają z niej oba zestawy.
- Stare sesje gry: nieukończona sesja z kontaktem w ciągu 15 minut jest
  możliwą trwającą grą. Stary ping statystyk ma odstęp 5 minut.
- Control2: aktualny etap i faza z `game_state`, bez treści odpowiedzi.

Brak wpisów lub błąd odświeżenia nie potwierdza braku użytkowników.
Wykluczenia dotyczą również podsumowania w Maintenance.

## Historia i wykresy

Przechowujemy identyfikator użytkownika i godzinę kontaktu, aby policzyć
unikalne osoby w godzinie, dniu i tygodniu. Nie zapisujemy historii
kliknięć ani treści pól. Widoki: 48 godzin, 30 dni, 90 dni; czas Warszawy.
Historia jest usuwana po 90 dniach przy kolejnych sygnałach aktywności.
Dane wcześniejsze od wdrożenia nie są odtwarzane z domysłów.

## Wspólne wykluczenia

Jedna reguła dla dotychczasowych statystyk, bieżącej aktywności i wykresów:

- ręczne wpisy w istniejącej liście wykluczeń;
- konta testN rozpoznane po rzeczywistym adresie w `auth.users`:
  `testN@familiada.online`;
- **wyłącznie goście testowi**, oznaczeni zaufanym `app_metadata.is_test_guest`
  przez zabezpieczony endpoint E2E. Zwykli goście pozostają w statystykach.

Lista pokazuje powód i oznaczenie wykluczenia automatycznego; nie ma dla
niego przycisku usuwania. Wykluczenie działa także na wcześniej zebrane
przedziały historii. Dawnych gości bez zaufanego oznaczenia nie rozpoznajemy
jako testowych na podstawie samej nazwy ani `is_guest`.

Globalna lista zakazanych początków nazw znajduje się w bazie w
`reserved_username_prefixes`. Obejmuje `test`, `familiada`, `admin`,
`administrator`, `moderator`, `support`, `pomoc`, `kontakt`, `contact`,
`system`, `official`, `security`, `billing`, `noreply`. Sprawdzamy również
dowolne końcówki oraz wielkość liter. Formularze pobierają tę samą listę;
trigger blokuje tworzenie i zmianę nazwy również przez bezpośrednie API.
Użytkownik widzi zwykły komunikat o zajętej/niedostępnej nazwie, bez
wyjaśnienia rezerwacji. Istniejących nazw migracja nie zmienia automatycznie.
Wyjątki dla oficjalnych kont są nadawane wyłącznie administracyjnie w
`reserved_username_accounts`. Rzeczywiste testN mają wąski wyjątek zgodny
z ich adresem uwierzytelniania; samo wpisanie nazwy nie wyklucza ze statystyk.

## Weryfikacja i późniejsze sprzątanie

Wąskie testy: uprawnienia, duplikaty kart i godzin, wykluczenia wspólne,
zwykły i testowy gość, blokada nazw oraz stary/nowy Control. Po migracji
workflow sprawdza rzeczywisty zapis w produkcyjnej bazie na test1,
w transakcji wycofywanej po sprawdzeniu. Konta i historie użytkowników
pozostają zachowane. Wdrożenie nie dotyka nagrań.

- [ ] Po wyłączeniu starego zestawu usunąć jego rozpoznawanie sesji,
  etykiety i dedykowane testy podglądu; zachować wspólne blokady edycji,
  nowy zestaw i historyczne statystyki. Patrz `refaktor-struktury-repo.md`.
- [ ] Zapisać wyniki testów, migracji i kontroli produkcyjnej po wykonaniu.

## Wyniki wdrożenia 6 października 2026

- Commit funkcji: `18859d6fe`.
- Wąskie testy lokalne: 5/5 (uprawnienia endpointu, rozróżnianie starego
  i nowego Control, zarezerwowane prefiksy). Kontrola importów zasobów: 1/1.
- Migracje 303 i 304: przebieg `37516716275`, sukces. Przed migracją
  przeszły testy SQL m.in. wykluczeń zwykłego/testowego gościa, nazw
  z dopiskami i wyjątków administracyjnych. Po migracji przeszła kontrola
  zapisu, deduplikacji i uprawnień na rzeczywistej produkcyjnej bazie.
- Worker: `37516716239`, sukces. Pages po ponownym uruchomieniu:
  `37517381618`, sukces; pierwszy przebieg czekał przed uruchomieniem joba.
- Dwa testy przeglądarkowe na produkcji: `37517375061`, sukces bez retry.
  Faktyczny ping konta testowego, wspólne wykluczenie, odmowa odczytu
  administracyjnego snapshotu zwykłemu użytkownikowi, odmowa zmiany nazwy
  na prefiks `admin` w bazie oraz oznaczenie i wykluczenie gościa E2E.
- Chronione Settings nie było otwierane automatycznie: wygląd listy
  i wykresu sprawdza użytkownik przez swoją sesję Cloudflare Access.

Po zgłoszeniu użytkownika poprawiono wyrównanie przycisku „Usuń” w liście
wykluczeń i zastosowano wspólny UI Select do wyboru przedziału wykresu.
Nie dodano sztucznych danych historii. Aby sprawdzić podgląd, należy
odświeżyć stronę na zwykłym koncie poza wykluczeniami i otworzyć np.
„Moje gry” lub edytor; sygnał powinien pojawić się w około 45 s.
Settings samo nie jest śledzone, a konto testN oraz gość testowy nie
zwiększają widocznych liczników.

## Sprzątanie po przełączeniu produkcyjnym

Plan rozszerzono w `refaktor-struktury-repo.md`, w sekcji „Sprzątanie bazy,
statystyk i aktywności po przełączeniu”. Usuwamy rozpoznawanie starego
Control z bieżącej aktywności, a nie całą funkcję aktywności. Godzinowa
historia jest wspólna dla stron i nie ma wersji Control — zostaje wraz
z retencją 90 dni oraz wspólnymi wykluczeniami. Zmianę nazw tras trzeba
zgrać z listą stron w RPC pingu, frontendem i zapytaniem administratora.
To plan; nie wykonano migracji usuwającej dane.

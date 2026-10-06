# Aktywność użytkowników — wdrożenie

Pełny podgląd „Aktywność teraz” i wykresy należą do karty Statystyki.
Maintenance pokazuje skrócone podsumowanie i odnośnik do szczegółów.

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

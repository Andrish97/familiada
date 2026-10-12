# Go — rodzaj linku, stan, komunikat i akcja

Źródła: `poll_go_resolve`, `poll_state`, `control_device_share_resolve`,
centrum `/mail/` i reguły E19. Mapa przejść: `nawigacja-mapa-plan.md`.
To wspólny kontrakt komunikatów; wpis „do poprawy” nie oznacza wykonania.
Kopie Gier/Logo otrzymają własne wiersze przy E19C.

## Kolejność rozstrzygnięć

1. Rozpoznaj jeden rodzaj linku i wymagane parametry. Mieszane rodzaje,
   powtórzone pola lub niepoprawny token: „Link nieważny”, bez akcji.
2. Sprawdź rodzica, bieżący przebieg/sesję i źródło dostępu. Usunięcie,
   cofnięcie albo rotacja ma pierwszeństwo przed przyciskiem działania.
3. Dla linku konta sprawdź kanoniczny identyfikator odbiorcy. Brak sesji
   oznacza logowanie; inne konto oznacza brak dostępu. Zmiana adresu nie
   zmienia właściciela zaproszenia.
4. Pokaż stan i tylko akcje dozwolone przez ten stan. Otwarcie strony,
   odświeżenie, Wstecz/Dalej nie przyjmuje, nie odrzuca i nie wysyła maila.
   Znacznik otwarcia może być zapisany przez obecny resolver.
5. Błąd sieci pokazuje możliwość ponownego sprawdzenia. Nie udaje wygaśnięcia.

## Wspólne stany

| Stan | Komunikat | Akcja |
|---|---|---|
| Brak rodzaju linku | Brak linku | Brak |
| Mieszane rodzaje/powtórzony token/niepoprawne parametry | Link nieważny | Brak; wspólny parser wszystkich rodzajów, frontend na branchu |
| Nie ma rodzica lub tokenu | To zaproszenie wygasło / Link nieważny, zależnie od znanego rodzaju | Brak; nie odtwarzać dawnego dostępu |
| Cofnięty dostęp albo nadrzędna rezygnacja adresu (`revoked`) | Udostępnienie jest już niedostępne | Brak działania na zasobie; wspólny komunikat na branchu |
| Brak logowania do linku konta | Zaloguj się, aby otworzyć zaproszenie | Logowanie z zachowaniem rodzaju linku i powrotu |
| Inne konto | To konto nie jest odbiorcą zaproszenia | Bez akceptacji/głosowania; wspólny komunikat bez pustego adresu na branchu |
| Błąd sieci | Nie udało się sprawdzić linku. Spróbuj ponownie później. | Ponowne sprawdzenie wszystkich rodzin na branchu |

## Znajomi (`f`; historyczny `s` może zwrócić rodzaj friend)

| Stan | Komunikat | Akcja i warunek |
|---|---|---|
| pending | Zaproszenie do znajomych | Bez konta: Logowanie. Właściwe konto: Znajomi → Propozycje. Inne konto: brak dostępu |
| active | Jesteście znajomymi | Właściwe konto: strona Znajomych; bez ponownej akceptacji |
| declined do30 dni | Zaproszenie odrzucone | Właściwe konto: Znajomi i własna sekcja odmów; zmiana decyzji jest obsługiwana tam |
| cancelled lub odmowa po30 dniach | Zaproszenie wygasło | Resolver nie zwraca aktywnej relacji; brak przyjmowania i ponowienia |
| Usunięte konto/źródło | Zaproszenie wygasło | Brak dostępu; istniejące niezależne granty innych zasobów mają własne reguły |

## Subskrypcja adresu bez konta (`s`)

| Stan | Komunikat | Akcja i warunek |
|---|---|---|
| pending, adres bez konta | Zaproszenie do subskrypcji | Przyjmij/Odrzuć przez token; bez tworzenia subskrypcji innego adresu |
| active, adres bez konta | Subskrypcja aktywna | Brak ponownej akceptacji. Wypisanie przez właściwy link/centrum |
| declined do30 dni | Zaproszenie odrzucone | Bez anonimowego cofnięcia odmowy; po upływie karencji można wysłać nowe zaproszenie |
| cancelled / expired | Zaproszenie wygasło | Brak akceptacji, pola nowego maila ani tworzenia nowej relacji |
| Globalna rezygnacja | Udostępnienie jest już niedostępne | Globalna reguła ma pierwszeństwo; zarządzanie flagą w centrum maili |
| Adres został przypisany do konta | Konto korzysta ze Znajomych | Właściwe konto: Znajomi → Propozycje, bez akceptacji subskrypcji w panelu |
| To konto potem zmieniło adres | Ten sam odbiorca | Resolver363 przekazuje zapisany `registered_user_id` (produkcja potwierdzona); Go na branchu sprawdza ten ID przed adresem |
| Inne konto / nowy właściciel dawnego adresu | To konto nie jest odbiorcą zaproszenia | Brak przejęcia wcześniejszej relacji; kanoniczny ID ma pierwszeństwo |
| `action=unsub` po konwersji tokenu na friend | Konto korzysta ze Znajomych | Na branchu: przejście do Znajomych; bez wywołania RPC subskrypcji dla relacji friend |

## Osobiste zadanie ankiety (`t`)

| Stan | Komunikat | Akcja i warunek |
|---|---|---|
| pending/opened, konto | Zaproszenie do ankiety | Właściwe konto: Zadania. Bez sesji: Logowanie. Inne konto: brak dostępu |
| pending/opened, adres bez konta | Zaproszenie do ankiety | Głosuj/Odrzuć; token zadania, jeden pełny głos, bez anonimowego licznika tempa |
| done, ważne źródło i przebieg | Dziękujemy, głos oddany | Brak drugiego głosu ani przypomnienia |
| declined, ważne źródło i przebieg | Zaproszenie odrzucone | Brak głosowania; cofnięcie decyzji dla konta obsługują Zadania |
| poll_stopped | Ankieta jest zatrzymana | Brak głosowania |
| poll_closed | Ankieta zakończona | Brak głosowania |
| cancelled/expired, nowy klucz, cofnięte źródło | Zaproszenie wygasło | Brak działania; stan rodzica/źródła ma pierwszeństwo przed stanem starego zadania |
| Usunięta gra/konto | Zaproszenie wygasło | Brak działania; pełny wynik może zostać jako anonimowy agregat zgodnie z kaskadą |

## Anonimowe głosowanie (`p=anon&id&key`)

| Stan | Komunikat | Akcja |
|---|---|---|
| open/text lub open/points | Sprawdzanie zakończone | Przejście do właściwego formularza, bez logowania |
| stopped | Ankieta jest zatrzymana | Brak głosowania |
| ended | Ankieta zakończona | Brak głosowania |
| draft | Ankieta została zamknięta | Brak głosowania |
| expired | Ten link wygasł | Brak działania |
| not_found | Nie ma takiej ankiety | Brak działania |
| Błąd sieci | Nie udało się sprawdzić linku | Ponowne sprawdzenie |

**Wykonane i sprawdzone:** main38317995881 — scenariusz Go success,
branch38317376700 success. Obejmuje rzeczywiste oba typy/QR/rodziców i sieć.
Jeden licznik dotyczy późniejszego formularza, nie sprawdzania linku w Go.

## Baza (`b`)

| Stan | Komunikat | Akcja i warunek |
|---|---|---|
| pending/opened | Zaproszenie do bazy | Konto odbiorcy: Bazy → Udostępnione. Bez sesji: Logowanie. Akceptacja/odmowa na stronie Baz |
| done | Baza została już przyjęta | Bazy, jeśli to właściwe konto; osobny komunikat na branchu |
| declined do30 dni | Zaproszenie odrzucone | Bazy → Odrzucone przeze mnie, jeśli to właściwe konto; osobny komunikat na branchu |
| cancelled | Udostępnienie zostało cofnięte | Brak akceptacji; osobny komunikat na branchu |
| expired po5 dniach oczekiwania lub30 dniach odmowy | Zaproszenie wygasło | Brak przyjmowania starego tokenu |
| Inne konto | To konto nie jest odbiorcą zaproszenia | Bez akcji i bez pustego adresu w zdaniu |
| Usunięta baza/konto | Zaproszenie wygasło | Brak dostępu; role i zadania zostały usunięte kaskadowo |

## Urządzenie i ekran QR (`d`)

| Stan | Komunikat | Akcja |
|---|---|---|
| active + zgodne urządzenie/gra | Dostęp sprawdzony | Właściwe urządzenie Host/Display/Buzzer; docelowy guard ponownie sprawdza dostęp |
| revoked | Właściciel cofnął udostępnienie | Brak podłączania |
| expired po1h bez aktywności sesji | Sesja Control wygasła | Brak podłączania; potrzebny nowy link/sesja |
| Inny typ/gra/braki/nieznany token | Link nieważny | Brak działania |
| Błąd sieci | Nie udało się sprawdzić linku | Ponowne sprawdzenie na branchu |
| d=qr | Ekran kodu QR ankiety | Obecne wejście na ekran; w treści kodu jest anonimowy link Go. Na branchu: walidacja parametrów i bieżącego poll_state przed przejściem |

## Centrum maili i rezygnacje (`m`, historyczne `u`/`s&action=unsub`)

`m` kieruje do `/mail/`; stany prywatnego dostępu i nadrzędnej flagi są
wyświetlane tam w tym samym lekkim stylu. Go nie powiela procesu potwierdzenia.
Auth (rejestracja, reset, zmiana maila) ma osobne linki i nie podlega kolejce
powiadomień, blokadzie ani stopce centrum.

| Stan | Komunikat / miejsce | Akcja |
|---|---|---|
| Ważny prywatny dostęp | Moje powiadomienia w `/mail/` | Subskrypcje, zadania, urządzenia i flaga adresu |
| Dostęp do konta | Zaloguj się na swoje konto | Login → ustawienia konta |
| Wygasły/niepoprawny/użyty dowód | Komunikat centrum maili | Nowe potwierdzenie; bez odtwarzania dostępu starego dowodu |
| Globalna rezygnacja aktywna | Sekcja flagi w centrum | Inne listy ukryte, zaproszenia/udostępnienia odrzucone zgodnie z grafem |
| Ponowne włączenie | Sekcja flagi w centrum | Nie odtwarza automatycznie starych odrzuconych źródeł |
| Historyczny u / action=unsub | Właściwa starsza ścieżka wypisania | Bez przyznania uprawnień do prywatnych list; nowe stopki używają m. Przegląd starych RPC w E14 |

## Bramki kolejnych poprawek

- Jedno źródło kluczy komunikatów, komplet PL/EN/UK, brak tekstów SQL w UI.
- Unit: rodzaj×stan×aktor, braki/duplikaty/mieszane typy oraz kolejność stanów.
- UI: każdy wariant ma właściwy tytuł/opis/przyciski, odstępy i brak
  nadpisania przez późniejszy start tłumaczeń.
- Produkcja punktowo tylko zmienione przypadki. SMTP/SQL zakończonych rodzin
  nie ponawiać dla zmiany samego tekstu; jeśli zmienia się resolver, dodać jego
  kontrakt i tożsamość przy zmianie adresu/usunięciu rodzica.
- Końcowe nowe zrzuty390/1400 z przykładowymi danymi i osobne oznaczenie atrap.

## Pokrycie bieżącej paczki Go

| Warstwa | Zakres | Wynik |
|---|---|---|
| Tożsamość resolvera363 | Własne konto po zmianie maila; inny właściciel dawnego adresu; pending/active/declined; cofnięcie; brak sesji; usunięcie konta | Lokalny rollback, isolated38320404401/38320540803, produkcyjny rollback DB38320540716 — success; log363 OK23:10:01 UTC |
| Parser i rzeczywiste handlery UI |8 rodzin; mieszane i duplikowane pola; niezgodny typ; stany Baz/Subskrypcji/Ankiet/Znajomych×brak sesji/właściwe/obce konto; komunikaty PL/EN/UK |529 unit success |
| Przeglądarka i zrzuty | Zmienione komunikaty, przyciski i retry; rzeczywiste logowanie, jawne przykładowe odpowiedzi biznesowe; bez wysyłania maili i zmian zasobów | Branch38320834879 w toku; po nim Pages→ten sam main |

Natychmiastowe przejścia aktywnych urządzeń i pełne anonimowe ankiety były
sprawdzone natywnie w poprzednich paczkach. Nowa galeria nie zastępuje
wcześniejszych wyników DB/SMTP ani nie dowodzi ponownie ich działania.

**Kontrola main ujawniła drugą warstwę wejścia:** Worker miał wcześniejsze
przekierowanie każdego m, także m+b, zanim frontend Go zdążył odrzucić link.
Diag38321800038 potwierdził niepoprawne parametry po przejściu do innej strony.
Worker korzysta teraz z tego samego parseGoLink; przekierowuje wyłącznie
poprawny pojedynczy m. Niepoprawne linki pozostają w Go. Deploy Workera
śledzi także zmiany wspólnego parsera; unit obejmuje GET/HEAD i14 wariantów.
Przed zamknięciem wymagane Worker→ta sama punktowa kontrola main.

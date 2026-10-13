# E20 — kategorie stron, przewijanie i dostępność

Roboczy wykaz stron do poprawy i ujednolicania. Narzędzia osadzone w panelu
(`/settings/tools/**`) są poza zakresem. Sam `/settings/` jest uwzględniony:
korzysta z globalnego topbara, ale ma rozbudowane panele z odrębnymi zasadami
przewijania.

## Kategorie globalne

- **Topbar** — globalna kategoria stylowa dla stron aplikacji. Podkategorie
  funkcjonalne określają zawartość topbara i układ strony; topbar pozostaje
  przypięty u góry.
- **Login** — strony logowania z gradientowym tłem i topbarem zawierającym
  Wstecz oraz wybór języka, bez tła topbara i separatora.
- **Ekran urządzenia** — pełnoekranowy widok urządzenia, bez zwykłej stopki.
- **Dedykowany styl TV** — osobna strona i przepływ, niezależne od zwykłego
  topbara.
- **Panel administracyjny** — globalny układ Topbar z wyjątkami panelowymi.
  Domyślnie przewija się dokument; niektóre widoki, zwłaszcza Poczta
  Familiada, blokują scroll dokumentu i przewijają własne kolumny.

## Cechy wspólne podkategorii

| Podkategoria                                       | Wspólne cechy                                                                                                                                                                                                                                                                                                                                            | Wyjątki / poprawki                                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strona główna                                      | Zwykły topbar i stopka; układ treści właściwy stronie głównej.                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                    |
| Logowanie                                          | Gradientowe tło; topbar z Wstecz i językiem bez widocznego tła ani separatora. Karta ma pozostać dostępna w krótkim widoku landscape przez przewijanie i kompaktowy układ.                                                                                                                                                                               | Bez globalnego przewijania; elementy wewnątrz się skalują                                                                                                                            |
| Przeglądarka zasobów: Gry, Bazy, Logo              | Wspólny wzorzec: tytuł i podpowiedź, akcje, wyszukiwanie i filtry oraz lista. Akcje górne dopasowują tekst lub ikony do miejsca; dolne grupują akcje przy krawędziach i zawijają je proporcjonalnie, z jak najmniejszą liczbą wierszy.                                                                                                                   | —                                                                                                                                                                                    |
| Katalog społeczności                               | Katalog z przeglądaniem, wyszukiwaniem i filtrami; zwykły topbar i stopka.                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                    |
| Edytor                                             | Nagłówek edytora znajduje się w topbarze. Edytory mają różne funkcje; łączą je wybrane cechy, bez narzucania wspólnej siatki ani pełnego systemu responsywności.                                                                                                                                                                                         | Każdy telefon w landscape jest blokowany przed odsłonięciem strony. Ustawienia gry: poniżej 980 px ukrywa się panel boczny. |
| Konekcje                                           | Wspólna kategoria funkcjonalna dla znajomych, subskrypcji, zadań, połączeń urządzeń i centrum maili; typ widoku zależy od podstrony. Listy i treści przewijają się wewnętrznie, jeśli wskazano to w tabeli. Nagłówek i podpowiedź podobnie jak w katalogach. Ale karty z różną zawartością i nie zawsze z wypustkami. Albo z wypustkami tylko na mobile. | `/connect/`: odstępy do poprawy. `/mail/`: normalna stopka, listy/treść przewijane wewnętrznie.                                                                                      |
| Instrukcje                                         | Strony informacyjne z normalnym topbarem i stopką oraz globalnym przewijaniem treści.                                                                                                                                                                                                                                                                    | Manual i polityka prywatności mają odrębny rodzaj treści.                                                                                                                            |
| Formularz                                          | Publiczny formularz głosowania; bez globalnego przewijania.                                                                                                                                                                                                                                                                                              | Tekst i punkty mają oddzielne formularze.                                                                                                                                            |
| Drogowskaz                                         | Prosta strona kierująca do docelowego miejsca; zwykły topbar i stopka.                                                                                                                                                                                                                                                                                   | Bez globalnego, treść przewija się wewnątrz, ale takie przypadki są znikome                                                                                                          |
| Komunikat serwisowy                                | Prosty komunikat w zwykłej powłoce strony.                                                                                                                                                                                                                                                                                                               | `/404.html` i `/maintenance/` nie przewijają się globalnie i skalują elementy wewnątrz.                                                                                              |
| Panel prowadzącego                                 | Roboczy interfejs Control z obszarem wewnętrznym; bez globalnego scrolla.                                                                                                                                                                                                                                                                                | Min. viewport 980 px; komputer lub tablet zgodnie z guardem. Ale ogólnie już jest dobrze zrobiony.                                                                                   |
| Ekrany urządzeń: Display, Host, Buzzer, QR ankiety | Pełny ekran, bez zwykłego topbara i globalnego scrolla; device guard konfigurowany zależnie od funkcji.                                                                                                                                                                                                                                                  | Display/QR: komputer, duży tablet lub jawny tryb TV. Host/Buzzer: ekran dotykowy, telefon lub tablet.                                                                                |
| Łączenie na TV                                     | Osobny pełnoekranowy wygląd i przepływ parowania, bez globalnego scrolla.                                                                                                                                                                                                                                                                                | `/connect/tv/` jest osobną stroną TV.                                                                                                                                                |
| Panel administracyjny                             | Zwykły topbar; przewijanie zależy od aktywnego widoku. Panele zachowują własne obszary scrolla i nie dziedziczą globalnych ograniczeń wysokości.                                                                                                                                                                                                            | `/settings/`: dokument przewijany domyślnie; Poczta Familiada blokuje scroll dokumentu na mobile i przewija wewnętrznie foldery, listę i treść. Narzędzia `/settings/tools/` są poza audytem. |

## Pełna lista stron

Dostępność jest rozbita na dwie niezależne płaszczyzny: konto/sesja oraz
urządzenie. Typ scrolla opisuje przewijanie dokumentu. Gdy tabela mówi
„bez globalnego”, wewnętrzny obszar może mieć własne przewijanie.

| Strona                           | Globalna kategoria | Podkategoria funkcjonalna    | Typ scrolla                                    | Dostęp — konto/sesja                 | Dostęp — urządzenia                                          |
| -------------------------------- | ------------------ | ---------------------------- | ---------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `/`                              | Topbar             | Strona główna                | Globalny                                       | Publiczna                            | Dowolne urządzenie                                           |
| `/login/`                        | Login              | Logowanie                    | Bez globalnego; elementy wewnątrz się skalują  | Publiczna                            | Dowolne urządzenie                                           |
| `/login/confirm/`                | Login              | Logowanie                    | Bez globalnego; elementy wewnątrz się skalują  | Publiczna                            | Dowolne urządzenie                                           |
| `/login/reset/`                  | Login              | Logowanie                    | Bez globalnego; elementy wewnątrz się skalują  | Publiczna                            | Dowolne urządzenie                                           |
| `/games/`                        | Topbar             | Przeglądarka zasobów         | Bez globalnego; lista wewnętrzna               | Gość lub konto                       | Dowolne urządzenie                                           |
| `/bases/`                        | Topbar             | Przeglądarka zasobów         | Bez globalnego; lista wewnętrzna               | Gość lub konto                       | Dowolne urządzenie                                           |
| `/logo/`                         | Topbar             | Przeglądarka zasobów         | Bez globalnego; lista wewnętrzna               | Gość lub konto                       | Dowolne urządzenie                                           |
| `/marketplace/`                  | Topbar             | Katalog społeczności         | Globalny                                       | Publiczna                            | Dowolne urządzenie                                           |
| `/games/editor/`                 | Topbar             | Edytor                       | Bez globalnego; panele wewnętrzne              | Gość lub konto                       | Dowolne urządzenie                                           |
| `/bases/explorer/`               | Topbar             | Edytor                       | Bez globalnego; obszar eksploratora wewnętrzny | Gość lub konto                       | Telefon portrait dozwolony; landscape telefonu blokowane globalnie  |
| `/logo/editor/text/`             | Topbar             | Edytor                       | Bez globalnego; panele wewnętrzne              | Gość lub konto                       | Min. viewport 700 px                                         |
| `/logo/editor/draw/`             | Topbar             | Edytor                       | Bez globalnego; panele wewnętrzne              | Gość lub konto                       | Min. viewport 700 px                                         |
| `/logo/editor/image/`            | Topbar             | Edytor                       | Bez globalnego; panele wewnętrzne              | Gość lub konto                       | Min. viewport 700 px                                         |
| `/games/settings/`               | Topbar             | Edytor                       | Bez globalnego; panele wewnętrzne              | Gość lub konto                       | Min. viewport 700 px; poniżej 980 px ukrywa się boczny panel |
| `/settings/`                     | Topbar             | Panel administracyjny        | Mieszany: dokument albo panele wewnętrzne zależnie od widoku | Cloudflare Access                   | Dowolne urządzenie; mobile ma własne układy paneli            |
| `/account/`                      | Topbar             | Edytor                       | Globalny                                       | Gość lub konto                       | Dowolne urządzenie                                           |
| `/polls/`                        | Topbar             | Edytor                       | Bez globalnego; listy i panele wewnętrzne      | Gość lub konto                       | Dowolne urządzenie                                           |
| `/friends/`                      | Topbar             | Konekcje                     | Bez globalnego; listy wewnętrzne               | Tylko konto                          | Dowolne urządzenie                                           |
| `/subscribers/`                  | Topbar             | Konekcje                     | Bez globalnego; listy wewnętrzne               | Tylko konto                          | Dowolne urządzenie                                           |
| `/tasks/`                        | Topbar             | Konekcje                     | Bez globalnego; lista wewnętrzna               | Tylko konto                          | Dowolne urządzenie                                           |
| `/connect/` (odstępy do poprawy) | Topbar             | Konekcje                     | Bez globalnego; lista/karty wewnętrzne         | Publiczna                            | Dowolne urządzenie                                           |
| `/manual/`                       | Topbar             | Instrukcje                   | Globalny                                       | Gość lub konto                       | Dowolne urządzenie                                           |
| `/privacy/`                      | Topbar             | Instrukcje                   | Globalny                                       | Publiczna                            | Dowolne urządzenie                                           |
| `/polls/vote/text/`              | Topbar             | Formularz                    | Bez globalnego                                 | Publiczna                            | Dowolne urządzenie                                           |
| `/polls/vote/points/`            | Topbar             | Formularz                    | Bez globalnego                                 | Publiczna                            | Dowolne urządzenie                                           |
| `/go/`                           | Topbar             | Drogowskaz                   | Bez globalnego                                 | Publiczna                            | Dowolne urządzenie                                           |
| `/404.html`                      | Topbar             | Komunikat serwisowy          | Bez globalnego                                 | Publiczna                            | Dowolne urządzenie                                           |
| `/mail/`                         | Topbar             | Konekcje                     | Bez globalnego; treść/listy wewnętrzne         | Publiczna                            | Dowolne urządzenie                                           |
| `/maintenance/`                  | Topbar             | Komunikat serwisowy          | Bez globalnego; skalowanie elementów wewnątrz  | Publiczna                            | Dowolne urządzenie                                           |
| `/control/`                      | Topbar             | Panel prowadzącego           | Bez globalnego; obszar roboczy wewnętrzny      | Gość lub konto                       | Min. viewport 980 px; komputer lub tablet zgodnie z guardem  |
| `/control/display/`              | Ekran urządzenia   | Display                      | Pełny ekran; bez globalnego scrolla            | Publiczna; dostęp przez `id` i `key` | Komputer, duży tablet lub TV                                 |
| `/control/host/`                 | Ekran urządzenia   | Host                         | Pełny ekran; bez globalnego scrolla            | Publiczna; dostęp przez `id` i `key` | Dotykowy telefon lub tablet                                  |
| `/control/buzzer/`               | Ekran urządzenia   | Buzzer                       | Pełny ekran; bez globalnego scrolla            | Publiczna; dostęp przez `id` i `key` | Dotykowy telefon lub tablet                                  |
| `/polls/vote/qr/`                | Ekran urządzenia   | QR ankiety                   | Pełny ekran; bez globalnego scrolla            | Publiczna; link/klucz ankiety        | Komputer, duży tablet lub TV                                 |
| `/connect/tv/`                   | Dedykowany styl TV | Łączenie urządzenia przez TV | Bez globalnego scrolla                         | Publiczna                            | Przeznaczone do telewizyjnego flow parowania                 |

## Ładowanie i wejście na stronę

- Każda istniejąca i nowo dodawana strona ma czytelny stan ładowania i nie
  pokazuje niegotowego lub niezainicjalizowanego interfejsu.
- Podczas pobierania danych układ rezerwuje miejsce dla treści, aby ograniczyć
  przeskoki. Po zakończeniu ładowania pokazuje treść, stan pusty albo błąd z
  możliwością dalszego działania.
- Blokada urządzenia/orientacji uruchamia się przed odsłonięciem treści.
  Telefon w landscape widzi nieprzezroczysty guard, a nie rozmyty podgląd
  załadowanej strony.
- Audyt screenami obejmuje widok po ustabilizowaniu danych oraz sprawdza, czy
  startowa powłoka/loader nie miga niekompletną zawartością. Dla stron z
  różnymi trybami danych kontroluje też właściwy pusty lub błędny stan.

## Zasady scrolla i orientacji

- Przy globalnym scrollu topbar pozostaje przypięty u góry, a stopka jest za
  treścią, na końcu dokumentu. Panele i listy nie dostają własnego scrolla.
- Bez globalnego scrolla topbar pozostaje u góry, stopka przy dolnej krawędzi
  viewportu, a wskazane panele i listy mogą przewijać się wewnętrznie.
- **Telefony w orientacji landscape są blokowane globalnie i proszone o obrót.**
  Strony TV i ekrany urządzeń pozostają częścią reguły globalnej; ich guardy
  funkcjonalne nadal określają obsługiwane urządzenia.
- Komunikat **„Obróć urządzenie”** pokazuj tylko wtedy, gdy fizyczne
  urządzenie jest w portrait i obrót może spełnić wymagany próg. Małe okno
  desktopu, tryb okienkowy podobny szerokością do telefonu oraz split view
  tabletu dostają komunikat **„Za wąskie okno”**, gdy obrót nie zwiększy
  dostępnego viewportu. Rozmiar viewportu sam nie zmienia typu urządzenia.
- Wąski viewport może wymagać kompaktowego układu, ale nie zmienia urządzenia
  w telefon. Zachowania wyłącznie mobilne i dobór komunikatu guarda opierają
  się na typie urządzenia; responsywne dopasowanie treści może opierać się na
  dostępnej szerokości.

## Nadrzędność guardów — reguła wspólna (2026-10-13)

Guard wybiera **jeden pierwszy właściwy powód blokady**. Warunki sprawdza się
w kolejności poniżej. Nie wolno pokazać instrukcji obrotu, jeżeli obrót nie
może odblokować strony. Guard urządzenia ma zadziałać przed ujawnieniem treści
i przed pobieraniem danych strony; może pobrać tylko minimum potrzebne do
języka, topbara i samego komunikatu.

| Priorytet | Warunek sprawdzany | Stan i komunikat | Kiedy przejść dalej |
|---:|---|---|---|
| 1 | Wymagane wejście dotykowe, ale urządzenie go nie zapewnia | `touch`: „Wymagany ekran dotykowy” | Tylko gdy dotyk jest dostępny albo strona go nie wymaga. Ten powód ma pierwszeństwo przed zwykłą niezgodnością formatu. |
| 2 | Format urządzenia jest wykluczony przez stronę, np. TV na telefonie lub Display na telefonie | `unsupported`: urządzenie nieobsługiwane z wyjaśnieniem dla tej strony | Tylko dla dozwolonego formatu. Jeśli telefon nie jest obsługiwany, nie pokazuj mu „Obróć urządzenie”. |
| 3 | Fizyczny ekran nie może spełnić minimalnej szerokości funkcji w żadnej orientacji | `unsupported` albo precyzyjny komunikat „wymagany większy ekran” | Jeśli obrót może dać wymaganą szerokość, nie blokuj jako unsupported; przejdź do punktu 4. |
| 4 | Dozwolony telefon jest w landscape, a globalna reguła blokuje telefon poziomo | `rotate`: „Obróć urządzenie” | Ten warunek dotyczy wyłącznie stron obsługujących telefon w portrait. Wyjątek wymaga jawnej pozycji w mapie dostępności. |
| 5 | Dozwolony tablet jest w portrait, a landscape spełni próg strony | `rotate`: „Obróć urządzenie” | Jeśli obrót nie zwiększy dostępnej szerokości do wymaganego progu, nie sugeruj obrotu. |
| 6 | Bieżący viewport jest za mały, ale sama zmiana rozmiaru okna/split view może pomóc | `narrow`: „Za wąskie okno” | Dotyczy małego okna komputera, split view i tabletu/telefonu z niewystarczającym viewportem, gdy obrót nie rozwiąże problemu. |
| 7 | Urządzenie i viewport są dopuszczone | Nie pokazuj guarda urządzenia; dopiero teraz rozstrzygaj logowanie, uprawnienia, dostęp do zasobu i blokadę zasobu | Pokazuj właściwy guard dostępu/zasobu albo właściwą stronę. Nie nakładaj ich pod guardem urządzenia. |

Zasady rozstrzygania kolizji:

- **Niezgodny format wygrywa z obrotem.** Telefon, który nie obsługuje danej
  strony w żadnej orientacji, dostaje komunikat o niedostępności strony na
  telefonie, również w landscape.
- **Dotyk jest osobnym wymaganiem.** Na stronie Host/Buzzer brak dotyku
  wyjaśnia blokadę; nie zastępuje go komunikat o wąskim oknie.
- **„Obróć” oznacza, że obrót rzeczywiście pomaga.** Używaj go dla telefonu
  zablokowanego globalnie w landscape oraz dla tabletu portrait, którego
  landscape osiąga próg strony. Dla małego okna komputera i split view używaj
  „Za wąskie okno”.
- **Wymóg funkcji może wykluczyć urządzenie przed oceną orientacji.** Jeśli
  maksymalna szerokość fizycznego ekranu nie osiągnie progu, pokaż wymóg
  większego ekranu; obrót nie może prowadzić do pętli rotate → nadal blocked.
- **Guard urządzenia blokuje inicjalizację strony.** Nie renderuj za nim
  przygaszonej treści ani nie pobieraj danych/nie zakładaj blokad zasobów.
  Po zmianie viewportu przelicz hierarchię od punktu 1.
- **Guardy dostępu są niższego priorytetu od urządzenia.** Po dopuszczeniu
  urządzenia pokaż logowanie, uprawnienia, gościa lub blokadę zasobu zgodnie
  z regułami danej strony. Nie zmieniaj tych reguł po to, by ominąć guard
  urządzenia w testach; w testach wyglądu izoluj wyłącznie niezwiązany stan
  zajętości/treści zasobu.

| Przykład | Oczekiwany pierwszy komunikat |
|---|---|
| Telefon portrait na TV, która obsługuje tylko komputer/TV | Urządzenie nieobsługiwane na tej stronie |
| Telefon landscape na zwykłej stronie, która działa w portrait | Obróć urządzenie |
| Telefon landscape na stronie niedostępnej dla telefonu | Urządzenie nieobsługiwane; bez sugestii obrotu |
| Tablet portrait, a jego landscape spełnia próg 980 px | Obróć urządzenie |
| Małe okno komputera poniżej 980 px | Za wąskie okno |
| Host/Buzzer na urządzeniu bez dotyku | Wymagany ekran dotykowy |
| Dopuszczone urządzenie, ale użytkownik nie ma uprawnień | Guard dostępu strony |

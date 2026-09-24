# Tekst zapasowy w HTML a tłumaczenie PL

Zasada: tekst wpisany w HTML przy elemencie z `data-i18n` (tekst zapasowy, widoczny zanim wczytają się tłumaczenia) ma być **identyczny** z tłumaczeniem PL (`translation/pl.js`). Różnica = błąd.

Stan: `main` przed poprawką, porównane wszystkie strony HTML (treść elementów i atrybuty `placeholder`, `title`, `aria-label`, `alt` itd.). Zmienne `{year}`, `{site}`, `{siteHost}` liczone jako wartości.

## Poprawione (57)

Tekst zapasowy w HTML zamieniony na tłumaczenie PL. Liczba linii w plikach bez zmian.

| Plik:linia | Klucz | Gdzie | Było w HTML | Jest (PL) |
|---|---|---|---|---|
| `404.html:48` | `notFound.footerRight` | treść | Jeśli to błąd — skontaktuj się z nami. | Jeśli to błąd — kontakt@familiada.online |
| `account.html:68` | `account.migrateHint` | treść | Podaj e-mail i hasło, aby zamienić konto gościa na pełne konto — Twoje gry, bazy pytań i pliki zostaną zachowane. | Podaj e-mail i hasło (opcjonalnie też nazwę użytkownika), aby zamienić konto gościa na pełne konto — Twoje gry, bazy pytań i pliki zostaną zachowane. |
| `account.html:104` | `account.emailPostHint` | treść | Zmiana e-maila wymaga potwierdzenia linków w skrzynkach. Do tego czasu możesz logować się dotychczasowym adresem. | Zmiana e-maila wymaga potwierdzenia linków w skrzynkach. Do tego czasu możesz logować się dotychczasowym adresem. Jeśli nie widzisz wiadomości, sprawdź spam. |
| `account.html:147` | `account.demo.hint` | treść | Przywróć przykładowe materiały startowe: bazę pytań, loga i gotowe gry różnych kategorii. | Przywróć przykładowe materiały startowe: bazy pytań, loga i gotowe gry różnych kategorii. |
| `bases.html:86` | `bases.sections.mine` | treść | Moje | Moje bazy |
| `bases.html:97` | `bases.sections.shared` | treść | Udost. | Udostępnione |
| `bases.html:213` | `bases.shareModal.add` | treść | Udostępnij | Dodaj |
| `buzzer2.html:35` | `buzzer.btnA` | aria-label | Buzzer A | Przycisk A |
| `buzzer2.html:36` | `buzzer.btnB` | aria-label | Buzzer B | Przycisk B |
| `control2.html:445` | `manual.legal` | treść | 🔐 Polityka prywatności | Polityka prywatności 🔐 |
| `control2.html:492` | `control.qrModalCodeHint` | treść | Wejdź na familiada.online → Podłącz urządzenie → wprowadź kod | familiada.online → Podłącz urządzenie → wprowadź kod |
| `control2.html:502` | `control.shareDeviceModal.title` | treść | Udostępnij urządzenie | Udostępnij |
| `control2.html:505` | `control.shareDeviceModal.subtitle` | treść | Wybierz subskrybenta lub wpisz e-mail / nazwę użytkownika. | Wybierz subskrybenta lub wpisz e-mail. |
| `control2.html:524` | `bases.shareModal.sectionSubscribers` | treść | Moi subskrybenci | Subskrybenci |
| `control2.html:420` | `control.deviceDisplay` | title | Wyświetlacz — kliknij, żeby pokazać kod/link | Wyświetlacz |
| `control2.html:423` | `control.deviceHost` | title | Prowadzący — kliknij, żeby pokazać kod QR | Prowadzący |
| `control2.html:426` | `control.deviceBuzzer` | title | Przycisk — kliknij, żeby pokazać kod QR | Przycisk |
| `editor.html:42` | `editor.backToGames` | treść | Moje gry | ← Moje gry |
| `editor.html:80` | `editor.importBtn` | treść | Import | Importuj |
| `game-settings2.html:63` | `manual.legal` | treść | 🔐 Polityka prywatności | Polityka prywatności 🔐 |
| `index.html:138` | `home.about.p2` | treść | Odpowiedzi uczestników zbierane są przez ankietę online — każdy odpowiada przez link lub kod QR ze swojego telefonu. Wyniki są automatycznie normalizowane do 100 punktów, dokładnie jak w prawdziwym teleturnieju. | Odpowiedzi uczestników zbierane są przez ankietę online — każdy bierze udział w ankiecie przez link lub kod QR ze swojego telefonu. Wyniki są automatycznie normalizowane do 100 punktów, dokładnie jak w prawdziwym teleturnieju. |
| `index.html:157` | `home.tiles.t1.d` | treść | Wybierz jak chcesz zbierać odpowiedzi. Typowa ankieta i punktacja zbierają głosy od prawdziwych ludzi, a gra preparowana pozwala na szybkie wpisanie własnych pytań i punktów. | Wybierz jak chcesz zbierać odpowiedzi. Typowa ankieta i Punktacja zbierają wyniki od prawdziwych ludzi, a gra preparowana pozwala na szybkie wpisanie własnych pytań i punktów. |
| `index.html:173` | `home.tiles.t3.d` | treść | Dodawaj znajomych, aby wspólnie pracować nad ankietami i bazami pytań. Idealne przy organizacji dużych eventów firmowych czy wesel. | Dodawaj znajomych, aby wspólnie pracować nad ankietami i bazami pytań. Idealne przy organizacji dużych wydarzeń firmowych czy wesel. |
| `index.html:180` | `home.tiles.t4.t` | treść | Ankieta online i zbieranie odpowiedzi | Ankieta online i zbieranie głosów |
| `index.html:181` | `home.tiles.t4.d` | treść | Pokaż kod QR gościom — mogą głosować ze swoich telefonów bez instalacji aplikacji. Wyniki spływają na żywo, a system automatycznie normalizuje punkty do 100. | Pokaż kod QR gościom — mogą brać udział w ankiecie ze swoich telefonów bez instalacji aplikacji. Wyniki spływają na żywo, a system automatycznie normalizuje punkty do 100. |
| `index.html:258` | `home.forwhom.t1.t` | treść | Eventy firmowe i integracje | Wydarzenia firmowe i integracje |
| `index.html:259` | `home.forwhom.t1.d` | treść | Familiada to sprawdzony format na integrację zespołu — angażuje wszystkich, rozśmiesza i nie wymaga żadnego doświadczenia od uczestników. Przygotuj grę przed eventem, zbierz odpowiedzi w ankiecie i poprowadź rozgrywkę na żywo. | Familiada to sprawdzony format na integrację zespołu — angażuje wszystkich, rozśmiesza i nie wymaga żadnego doświadczenia od uczestników. Przygotuj grę przed wydarzeniem, zbierz odpowiedzi w ankiecie i poprowadź rozgrywkę na żywo. |
| `index.html:263` | `home.forwhom.t2.d` | treść | Prowadzisz eventy zawodowo i potrzebujesz narzędzia które nie zawiedzie przed klientem. Panel operatora, osobny widok prowadzącego i tablica wyników działają niezależnie — każdy skupia się na swojej roli. | Prowadzisz wydarzenia zawodowo i potrzebujesz narzędzia które nie zawiedzie przed klientem. Panel operatora, osobny widok prowadzącego i tablica wyników działają niezależnie — każdy skupia się na swojej roli. |
| `index.html:274` | `home.forwhom.t5.t` | treść | Konferencje i eventy sceniczne | Konferencje i wydarzenia sceniczne |
| `index.html:287` | `home.forwhom.t8.d` | treść | Zebrania, integracje, eventy dla wolontariuszy. Familiada to dobry sposób na rozluźnienie atmosfery i wciągnięcie wszystkich — niezależnie od wieku i doświadczenia z grami. | Zebrania, integracje, wydarzenia dla wolontariuszy. Familiada to dobry sposób na rozluźnienie atmosfery i wciągnięcie wszystkich — niezależnie od wieku i doświadczenia z grami. |
| `index.html:304` | `home.faq.q7.a` | treść | W grze preparowanej — wpisujesz pytania i odpowiedzi, gotowe w kilkanaście minut. W grze z ankietą dochodzi etap zbierania odpowiedzi, który trwa tyle ile zdecydujesz — godzinę, dzień, tydzień. Samo prowadzenie rozgrywki na żywo to zwykle od 20 minut wzwyż. | W grze preparowanej — wpisujesz pytania i odpowiedzi, gotowe w kilkanaście minut. W grze ankietowej dochodzi etap zbierania głosów, który trwa tyle ile zdecydujesz — godzinę, dzień, tydzień. Samo prowadzenie rozgrywki na żywo to zwykle od 20 minut wzwyż. |
| `index.html:307` | `home.faq.q10.a` | treść | W grze preparowanej od 3 do 6 — wybierasz sam przy tworzeniu. W grze z ankietą zależy to od ankietowanych — system bierze najpopularniejsze odpowiedzi po normalizacji do 100 punktów. | W grze preparowanej od 3 do 6 — wybierasz sam przy tworzeniu. W grze ankietowej zależy to od ankietowanych — system bierze najpopularniejsze odpowiedzi po normalizacji do 100 punktów. |
| `index.html:311` | `home.faq.q14.a` | treść | Po zebraniu głosów system przelicza każdą odpowiedź proporcjonalnie tak, żeby suma wynosiła 100. Jeśli 40% ankietowanych odpowiedziało "pies" — na tablicy pojawia się 40 punktów. Mniej popularne odpowiedzi dostają mniej. Dokładnie jak w telewizji. | Po zebraniu głosów system przelicza każdą odpowiedź proporcjonalnie tak, żeby suma wynosiła 100. Jeśli 40% ankietowanych odpowiedziało 'pies' — na tablicy pojawia się 40 punktów. Mniej popularne odpowiedzi dostają mniej. Dokładnie jak w telewizji. |
| `index.html:312` | `home.faq.q15.a` | treść | Tak. W panelu ankiet widzisz wyniki na bieżąco — które odpowiedzi zbierają najwięcej głosów i jaki jest postęp zbierania. Ty decydujesz kiedy zamknąć ankietę i przejść do gry. | Tak. W panelu ankiet widzisz wyniki na bieżąco — które odpowiedzi zbierają najwięcej wyników i jaki jest postęp zbierania. Ty decydujesz kiedy zamknąć ankietę i przejść do gry. |
| `index.html:314` | `home.faq.q16.a` | treść | Obowiązkowe są dwa: wyświetlacz (TV lub rzutnik) jako tablica wyników i przycisk (buzzer) do pojedynków. Prowadzący jest opcjonalny — możesz prowadzić rozgrywkę używając wyłącznie panelu sterowania (kontrolera). Panel kontrolera działa na komputerze, tablecie lub telefonie. | Obowiązkowe są dwa: komputer z panelem operatora i tablica wyników (TV lub rzutnik). Widok prowadzącego na tablecie lub telefonie to wygodne ułatwienie, ale nie jest konieczny — grą można prowadzić bezpośrednio z panelu operatora. Buzzer do pojedynku jest opcjonalny: zamiast niego można użyć fizycznego przycisku, a o naciśnięciu decyduje operator. |
| `index.html:331` | `home.footer.left` | treść | © Familiada — system do gry na żywo | © {year} Familiada — system do gry na żywo |
| `logo-editor.html:82` | `logoEditor.list.hint` | treść | Kliknij kafelek, żeby go zaznaczyć. Podwójne kliknięcie zmienia nazwę. | Naciśnij kafelek, żeby go zaznaczyć. Podwójne naciśnięcie zmienia nazwę. |
| `logo-editor.html:203` | `logoEditor.image.invert` | treść | Invert | Odwróć |
| `logo-editor.html:204` | `logoEditor.image.reset` | treść | Reset | Przywróć |
| `logo-editor.html:329` | `logoEditor.create.drawSubtitle` | treść | Można rysować dowolnie | Można rysować dowolnie i dodawać tekst |
| `logo-editor.html:437` | `manual.legal` | treść | 🔐 Polityka prywatności | Polityka prywatności 🔐 |
| `maintenance.html:36` | `maintenance.title` | treść | TRWA PRZERWA TECHNICZNA | TRWA PRZERWA TECHNICZNA ⏳ |
| `maintenance.html:39` | `maintenance.messageText` | treść | System jest chwilowo niedostępny. Za moment wszystko wróci do normy i będzie można kontynuować pracę. | System jest chwilowo niedostępny. Za jakiś czas wszystko wróci do normy i będzie można kontynuować pracę. |
| `maintenance.html:55` | `maintenance.footerRight` | treść | Masz pilną sprawę? Skontaktuj się z nami. | Masz pilną sprawę? kontakt@familiada.online |
| `marketplace.html:67` | `marketplace.title` | treść | Marketplace | Gry Społeczności |
| `marketplace.html:96` | `marketplace.mySent.btnAdd` | treść | Dodaj nową do marketplace | Dodaj nową do Gier Społeczności |
| `marketplace.html:109` | `marketplace.submit.title` | treść | Dodaj grę do marketplace | Dodaj grę do Gier Społeczności |
| `marketplace.html:148` | `marketplace.submit.withdrawInfo` | treść | Wycofanie usuwa ją z katalogu, ale osoby które ją dodały nadal ją mają. | Wycofanie usuwa ją z katalogu, ale osoby, które ją dodały, nadal ją mają. |
| `marketplace.html:160` | `marketplace.submit.btnSubmit` | treść | Wyślij do marketplace | Wyślij do Gier Społeczności |
| `marketplace.html:132` | `marketplace.submit.descPlaceholder` | placeholder | Krótki opis gry… | Krótki opis gry (temat, poziom trudności, dla kogo…) |
| `polls-hub.html:61` | `pollsHubPolls.header.hint` | treść | Zarządzaj ankietami oraz zaproszeniami. | Zarządzaj ankietami oraz zaproszeniami do ankiety. |
| `polls-hub.html:122` | `pollsHubPolls.details.subtitle` | treść | Usuń wynik powiązany z zadaniem, jeśli to konieczne. | Usuń głos powiązany z zadaniem, jeśli to konieczne. |
| `polls.html:147` | `polls.qrModal.hint` | treść | familiada.online → Podłącz urządzenie → wprowadź kod | Wejdź na familiada.online → Podłącz urządzenie → wprowadź kod |
| `privacy.html:65` | `privacy.pageTitle` | treść | Polityka Prywatności | Familiada Online — Polityka Prywatności |
| `subscriptions.html:59` | `pollsHubSubscriptions.header.hint` | treść | Zarządzaj subskrybentami oraz zaproszeniami. | Zarządzaj ankietami oraz zaproszeniami do ankiety. |
| `subscriptions.html:85` | `pollsHubSubscriptions.tabs.subscriptionsMobile` | treść | Subskryp. | Subskrypc. |
| `subscriptions.html:85` | `pollsHubSubscriptions.tabs.subscriptionsMobile` | treść | Subskryp. | Subskrypc. |

## Błędy budowy elementu (5)

Element ma `data-i18n` (tłumaczenie wstawiane przez `textContent`), a w środku inne znaczniki — tłumaczenie je kasuje (np. licznik powiadomień).

| Plik:linia | Klucz | Stan |
|---|---|---|
| `bases.html:48` | `builder.nav.pollsHubSubs` | **poprawione** — `data-i18n` przeniesione na wewnętrzny `<span>`, licznik zostaje |
| `control.html:326` | `control.shareDevice` | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:351` | `control.shareDevice` | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:383` | `control.shareDevice` | stara strona (ma wersję 2) — nie ruszamy |
| `polls-hub.html:46` | `builder.nav.pollsHubSubs` | **poprawione** — `data-i18n` przeniesione na wewnętrzny `<span>`, licznik zostaje |

## Pominięte (18)

| Plik:linia | Klucz | Gdzie | W HTML | PL | Powód |
|---|---|---|---|---|---|
| `buzzer.html:21` | `buzzer.title` | treść | Familiada — buzzer | Familiada — przycisk | stara strona (ma wersję 2) — nie ruszamy |
| `buzzer.html:66` | `buzzer.btnA` | aria-label | Buzzer A | Przycisk A | stara strona (ma wersję 2) — nie ruszamy |
| `buzzer.html:67` | `buzzer.btnB` | aria-label | Buzzer B | Przycisk B | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:77` | `manual.legal` | treść | 🔐 Polityka prywatności | Polityka prywatności 🔐 | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:126` | `control.qrModalCodeHint` | treść | Wejdź na familiada.online → Podłącz urządzenie → wprowadź kod | familiada.online → Podłącz urządzenie → wprowadź kod | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:362` | `control.noHostTabletHint` | treść | Jeśli prowadzący nie używa osobnego tabletu/telefonu, zaznacz tę opcję. | Jeśli prowadzący nie używa osobnego tabletu/telefonu, zaznacz tę opcję. Podpięcie urządzenia prowadzącego nie będzie wymagane. | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:394` | `control.physicalBuzzerHint` | treść | Jeśli posiadasz fizyczny przycisk buzzer, zaznacz tę opcję. | Jeśli posiadasz fizyczny przycisk typu buzzer użyj tej opcji. Operator decyduje o tym kto nacisnął pierwszy na podstawie obserwacji. | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:400` | `control.deviceCodeHint` | treść | Wejdź na familiada.online, kliknij „Podłącz urządzenie" i wprowadź kod urządzenia. | Wejdź na familiada.online, kliknij "Podłącz urządzenie" i wprowadź kod urządzenia. | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:505` | `control.setupFinishHint` | treść | Po kliknięciu „Gotowe" przejdziesz do panelu rund. | Po kliknięciu "Gotowe" przejdziesz do panelu rund. | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:514` | `control.devicesFinish` | treść | Gotowe — przejdź do rund | Gotowe — przejdź dalej | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:915` | `control.finalEndHint` | treść | To konic finału. Na wyświetlaczu pokażemy logo programu, punkty zwycięskiej drużyny lub kwotę wygranej (w zależności co wybrałeś w ustawiniach). | To koniec finału. Na wyświetlaczu pokażemy logo programu, punkty zwycięskiej drużyny lub kwotę wygranej (w zależności co wybrałeś w ustawiniach). Po zakończeniu możesz wrócić do Moje gry. | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:945` | `control.shareDeviceModal.title` | treść | Udostępnij urządzenie | Udostępnij | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:948` | `control.shareDeviceModal.subtitle` | treść | Wybierz subskrybenta lub wpisz e-mail / nazwę użytkownika. | Wybierz subskrybenta lub wpisz e-mail. | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:968` | `bases.shareModal.sectionSubscribers` | treść | Moi subskrybenci | Subskrybenci | stara strona (ma wersję 2) — nie ruszamy |
| `control.html:243` | `control.tabRounds` | title | Rozgrywka | Rundy | stara strona (ma wersję 2) — nie ruszamy |
| `display.html:19` | `display.title` | treść | Wyświetlacz jak w klasycznej Familiadzie | Wyświetlacz jak w klasycznej „Familiada” | stara strona (ma wersję 2) — nie ruszamy |
| `game-settings.html:14` | `gameSettings.title` | treść | Familiada — Ustawienia rozgrywki | Ustawienia gry | stara strona (ma wersję 2) — nie ruszamy |
| `game-settings.html:63` | `manual.legal` | treść | 🔐 Polityka prywatności | Polityka prywatności 🔐 | stara strona (ma wersję 2) — nie ruszamy |

## Bez zmian — puste elementy (14)

Element w HTML jest celowo pusty, treść pochodzi tylko z tłumaczeń (np. długie zakładki instrukcji). Nie przepisujemy do HTML.

| Plik:linia | Klucz |
|---|---|
| `account.html:105` | `account.emailNoAccessHint` |
| `account.html:126` | `account.emailNotifTitle` |
| `account.html:127` | `account.emailNotifHint` |
| `account.html:131` | `account.emailNotifCheckbox` |
| `manual.html:92` | `manual.content.general` |
| `manual.html:93` | `manual.content.edit` |
| `manual.html:94` | `manual.content.community` |
| `manual.html:95` | `manual.content.bases` |
| `manual.html:96` | `manual.content.polls` |
| `manual.html:97` | `manual.content.subscriptions` |
| `manual.html:98` | `manual.content.logo` |
| `manual.html:99` | `manual.content.control` |
| `manual.html:100` | `manual.content.connect` |
| `manual.html:101` | `manual.content.gameSettings` |

## Tytuły kart przeglądarki — poprawione (6)

Tekst w `<title>` zamieniony na tłumaczenie PL (to i tak ono jest wyświetlane po wczytaniu strony).

| Plik:linia | Klucz | Było w HTML | Jest (PL) |
|---|---|---|---|
| `buzzer2.html:8` | `buzzer.title` | Familiada — Buzzer (v2) | Familiada — przycisk |
| `display2.html:8` | `display.title` | Familiada — Wyświetlacz (v2) | Wyświetlacz jak w klasycznej „Familiada” |
| `game-settings2.html:14` | `gameSettings.title` | Familiada — Ustawienia rozgrywki | Ustawienia gry |
| `host2.html:8` | `host.title` | Familiada — prowadzący (v2) | Familiada — prowadzący |
| `marketplace.html:14` | `marketplace.title` | Pytania do Familiady — Gotowe Gry Społeczności | Gry Społeczności |
| `subscriptions.html:15` | `pollsHubSubscriptions.tabs.subscriptions` | Familiada — subskrypcje | Subskrypcje |

## Rozbieżności między językami — poprawione

| Klucz | Problem | Poprawka |
|---|---|---|
| `maintenance.countdownTitle` | EN i UK miały ⏳, PL nie | dodane ⏳ w PL (ujednolicone z EN/UK i z pozostałymi tytułami przerwy) |
| `marketplace.libraryCount` | tylko EN miał „×” („added {count}×”) | EN: „added {count}” — jak PL „{count} dodano” i UK „додано {count}” |
| `bases.shareModal.subtitle` | klucz tylko w UK, brak w PL i EN, nigdzie nieużywany | usunięty z UK |

Poza tym wszystkie klucze mają te same zmienne `{…}` we wszystkich trzech językach.

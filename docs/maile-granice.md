# Maile do innych osób — granice „nie naprzykrzać się”

Dotyczy maili, które **użytkownik wysyła innym ludziom** przez aplikację
(subskrypcje, ankiety, udostępnianie bazy, udostępnianie urządzenia).
Maile systemowe (rejestracja, reset hasła) i admina — osobno, bez zmian.
Stan: `mail_cooldown_policies` (migracja 288) — limity jako dane w bazie,
sprawdzane w bazie (nie w przeglądarce).

---

## 1. Zasady (decyzja 2026-10-07)

1. **Zgoda przed treścią.** Do osoby, która nie zaakceptowała subskrypcji,
   może pójść **tylko** zaproszenie do subskrypcji. Mail z ankietą — tylko
   do aktywnych subskrybentów.
2. **„Nie” znaczy nie.** Odrzucenie / wypisanie zatrzymuje maile od razu
   i na długo (tabela 2). Odrzucenie zaproszenia do ankiety = koniec maili
   o tej ankiecie w tym uruchomieniu.
3. **Wypisanie wygrywa ze wszystkim.** Wypisanie od nadawcy → ten nadawca
   nigdy więcej (chyba że osoba sama się zapisze); wypisanie ze wszystkich
   → nikt nigdy. Działa także dla osób z kontem (ustawienie w Koncie).
4. **Limity liczy baza**, przy każdej wysyłce, po odbiorcy (adres
   e-mail / konto), nie po tym, co kliknięto na stronie.
5. **Nadawca widzi granicę**: przycisk nieaktywny + „Możesz wysłać
   ponownie: jutro 14:30” zamiast błędu po kliknięciu.
6. **Podłoga techniczna** zostaje: najwyżej 1 mail na minutę od tego
   samego nadawcy do tego samego odbiorcy, cokolwiek to jest.

### Reguła kolejki — decyzja 2026-10-11

- W całym systemie „powiadomienie” oznacza e-mail.
- Przed wstawieniem powiadomienia do `mail_queue` sprawdź flagę odbiorcy
  `user_flags.email_notifications`. Flaga wyłączona oznacza, że mail nie jest
  dodawany do kolejki. Kontrola ma być wspólna na granicy kolejki, a nie
  zależna od konkretnego ekranu.
- Dla odbiorcy z kontem wyłączenie maili nie odbiera zadania ani uprawnienia
  widocznego po zalogowaniu. Adres bez konta nie ma skrzynki z zadaniami;
  link może być przekazany poza kolejką tylko przez jawne skopiowanie przez
  właściciela, jeśli dana funkcja udostępnia taką możliwość.
- Ponowienie wysyła wyłącznie mail przypominający do istniejącego
  zaproszenia/udostępnienia. Nie tworzy nowego uprawnienia, rekordu ani tokenu.
  Przycisk ponowienia ukrywamy, jeśli odbiorca wyłączył powiadomienia.
- **Aktualizacja 2026-10-11:** po wyraźnej odmowie nie wysyłamy
  przypomnień (Znajomi/Subskrybenci/Bazy/Ankiety), także przez bezpośrednie
  RPC. Ponów dotyczy wyłącznie oczekujących bez odmowy. Zniknięcie odmowy
  z listy nie resetuje limitów przed końcem karencji. Odmowy znajomości,
  zaproszenia do subskrypcji i bazy wygasają po czasie (założenie 30 dni);
  dopiero jawne nowe dodanie może wysłać nowy mail. Wygaśnięcie odmowy nie
  wysyła maila ani automatycznie nie przywraca relacji/dostępu. Po30 dniach
  także wypisanie odbiorcy pozwala na nowe zaproszenie; globalna flaga
  wyłączenia maili pozostaje osobna i trwała. Szczegóły w E19 §7.
- Cofnięcie własnej odmowy przez odbiorcę przywraca oczekujące, nie wysyła
  maila i nie resetuje dotychczasowych limitów. Akceptacja pozostaje
  osobną akcją. Wyjątek ustalony przez użytkownika: odmowa subskrypcji
  bez konta nie ma cofnięcia przez 30 dni; potem możliwe nowe zaproszenie.
  Dostępność i ważność odmowy opisuje E19 §7.
- Cooldown ogranicza wysłanie maila. UI pokazuje pozostały czas, backend
  autorytatywnie rozstrzyga możliwość wysłania; cooldown nie opóźnia
  przyznania ani cofnięcia dostępu.

## 2. Tabela granic (decyzja 2026-10-07)

**Tabela historyczna z 2026-10-07.** Jej dawne „wypisał się → nigdy”
zastępuje zatwierdzone E19: wypisanie odbiorcy = odmowa5/30 dni
(Znajomi/Subskrybenci/Bazy), bez przypomnień. Ankieta: koniec możliwości
w bieżącym uruchomieniu, bez undo. Globalne wyłączenie maili jest niezależne.
Aktualne kontrakty/wyjątki i obie strony są w E19 §7, limity w §5 poniżej.

| Mail | Kiedy wolno | Limit | Po odmowie / braku odpowiedzi |
|---|---|---|---|
| **Zaproszenie do subskrypcji** | osoba nie jest subskrybentem | 1 mail; **ponowienie** po ≥ 5 dniach, **najwyżej 1 raz** (razem 2 maile) | odrzucił → ponowne zaproszenie dopiero po **30 dniach**; wypisał się od nadawcy → **nigdy**; bez odpowiedzi po 2 mailach → zaproszenie wygasa, nowe po 30 dniach |
| **Zaproszenie do ankiety** | aktywny subskrybent, ankieta otwarta | 1 na osobę na uruchomienie | odrzucił → nic więcej w tym uruchomieniu |
| **Przypomnienie o ankiecie** (dzwonek) | osoba „czeka” | ≥ 24 h od poprzedniego maila o tej ankiecie; **najwyżej 2** na uruchomienie | — |
| **Ponowne zaproszenie** po usunięciu udostępnienia | jw. | liczy się jak przypomnienie (ten sam licznik) | — |
| **Wszystkie maile ankietowe od jednego nadawcy do jednej osoby** | — | **najwyżej 3 na 24 h** (łącznie, ze wszystkich gier) | — |
| Udostępnienie bazy | — | jak dziś: 1 na 24 h na (nadawca, odbiorca, baza) | jak dziś |
| Udostępnienie urządzenia | — | jak dziś: 1 na h na (nadawca, odbiorca, urządzenie, gra); sam dostęp nigdy blokowany | — |

Przykład: zapraszam Anię do ankiety A (mail 1). Nie odpowiada — po 24 h
dzwonek (mail 2), po kolejnych 24 h drugi raz (mail 3); więcej o A w tym
uruchomieniu nie da się wysłać. Ania odrzuca → nic więcej o A.
Przerywam i uruchamiam A ponownie → nowe uruchomienie, Ania może dostać
nowe zaproszenie, ale nie więcej niż 3 maile ode mnie na dobę łącznie.

## 3. Dziś (różnice do usunięcia)

- zaproszenie do subskrypcji: 5 dni; ponowienie: 24 h, **bez limitu liczby**;
- ankieta: 24 h na (nadawca, odbiorca, gra), brak przypomnień, brak
  łącznego limitu na nadawcę;
- odrzucenie subskrypcji: brak okresu karencji (można zapraszać od razu
  po 5 dniach od poprzedniego maila);
- limit ankiety liczony też po stronie przeglądarki (inny klucz niż
  w bazie) — do usunięcia, liczy tylko baza.

## 4. Decyzje (2026-10-07)

- Zasady i liczby z sekcji 1–2 zatwierdzone.
- Osoby z kontem dostają zaproszenia do ankiet jak dziś: w karcie
  Zadania **i** mailem (z limitami jak wyżej).

## 5. Wartości obecnych polityk i zakres

Wartości w bazie po migracji 288 i późniejszych korektach. Przed nową
implementacją weryfikować `mail_cooldown_policies` i RPC — UI nie jest źródłem
limitu.

| Klucz / akcja | Obecny limit | Zastosowanie i uwagi |
|---|---:|---|
| `base:share` | 24 h | Ta sama para nadawca/odbiorca i baza. |
| `device:share` | 1 h | Ta sama para oraz typ urządzenia w grze; dawniej opisany jako limit samego maila. Nowy model Control przypina dostęp do konkretnego rekordu i sesji. |
| `poll:invite` | 5 dni | Zaproszenie do subskrypcji; polityka po odmowie jest osobna. |
| `poll:resend` | 5 dni | Ponowienie zaproszenia subskrypcyjnego; tylko przypominający e-mail. |
| `poll:share` | 24 h | Mail o udostępnieniu ankiety tej samej osobie i grze. |
| `poll:invite_after_reject` | 30 dni | Ponowne zaproszenie do subskrypcji po odmowie. |
| `friend:invite` | 5 dni | Nowe zaproszenie na tę samą parę. |
| `friend:resend` | 5 dni | Przypomnienie; maks. dwa maile na parę w 30 dni. |
| `friend:invite_after_reject` | 30 dni | Odstęp przed nowym zaproszeniem po odmowie. |
| Maile ankietowe nadawca → odbiorca | 3 / 24 h | Łącznie między grami; maks. dwa przypomnienia na uruchomienie. |
| Ogólny nadawca → odbiorca | 1 / min | Techniczny limit wspólny dla maili. |

Cooldowny cofnięcia i zmiany roli nie są tu ustalonymi wartościami. Szczegółowa tabela zachowań jest w
`e19-znajomi-plan.md`, sekcja 7.

**Stan E19 (2026-10-11):** migracja `2026-10-11_323` wdrożyła wspólny
`BEFORE INSERT` trigger na `mail_queue`. Wyłączona flaga pomija wstawienie
przed rezerwacją cooldownu; adres bez konta pozostaje dozwolony. Pełny restore
PG16, lokalny test oraz izolowany job SQL `38126186374` potwierdziły trzy
przypadki; produkcyjny log `38126386184` potwierdza zastosowanie migracji.
Transakcyjny smoke test produkcyjny przeszedł w runie `38126593098`.

## Ujednolicenie treści i wyglądu maili — doprecyzowanie 2026-10-11

Osobny punkt E19, przed końcową aktualizacją manuala. Nie oznaczać go jako
wykonanego na podstawie samego wspólnego szablonu zaproszeń.

| Obszar | Zakres przeglądu |
|---|---|
| Zaproszenia: znajomi, subskrypcje, ankiety, bazy, urządzenia | Jednoznaczny temat, nadawca, zasób/rola, cel przycisku; osobne warianty dla konta i adresu bez konta. |
| Przypomnienia | Wyraźna treść przypominająca, link do tego samego dostępu/zadania; bez sugerowania utworzenia nowego udostępnienia. Control nie ma przypomnień. |
| Konto i uwierzytelnianie | Przejrzeć również potwierdzenie konta/e-maila, zmianę adresu i reset hasła; dostosować treść do rzeczywistego przepływu. |
| Wygląd i języki | Wspólna typografia, odstępy, przycisk i link tekstowy, tematy i treści PL/EN/UK, czytelność na telefonie. |
| Ważność i stopki | Opis wygaśnięcia zgodny z faktycznym TTL; ustawienia powiadomień dla konta, właściwa rezygnacja dla adresu bez konta; brak nieprawdziwych obietnic. |
| Kontrola | Faktyczny odbiór maila, temat/treść/język, link i jego działanie dla uprawnionego oraz stan po cofnięciu/wygaśnięciu; flaga mailowa i cooldown. |

Routing linków pozostaje zgodny z mapą: linki udostępnień przez `/go/`,
linki uwierzytelniania według własnego przepływu logowania.

### Audyt wejść przed pkt6 — 2026-10-11 (do wdrożenia)

| Wejście | Obecny stan | Praca pkt6 |
|---|---|---|
| Znajomi/Subskrybenci — invite-mail.js | Wspólny dokument i transport, lecz ponowienie korzysta z tematu/treści pierwszego zaproszenia; ustawienia konta mają starszą ścieżkę account bez końcowego slash. | Osobna przypominająca treść/temat, ten sam token; kanoniczne account i lang. |
| Ankiety — poll-mail.js | Osobny renderer, przypomnienie ma inny temat i tytuł, ale tę samą treść; parametr nazwy zasobu trafia do HTML. | Wspólny renderer z escapingiem parametrów, własny body reminder, konto versus adres i właściwe stopki. |
| Bazy — bases.js | Własny renderer; initial/reminder wspólny temat/body, bez informacji o roli. | Wspólny renderer, rola i informacja o oczekującej zgodzie, wariant przypomnienia. |
| Control — shareDevice.js | Własny renderer; brak przypomnień zgodny z decyzją, typ i nazwa gry w treści; sendShareEmail ignoruje odpowiedź błędu. | Ten sam renderer, stan wyniku transportu i stopka odpowiednia dla odbiorcy; zachować brak ponowienia. |
| Uwierzytelnianie — send-email/index.ts i email-templates.ts | Treści authEmail PL/EN/UK z tłumaczeń strony; osobny renderer, zmiana adresu ma osobną typografię/wersaliki. | Wspólne zasady wyglądu, czytelność i prawdziwe przepływy signup/guest_migrate/recovery/email_change, zachować metadane źródła języka. |

To jest wynik przeglądu źródeł, nie oznaczenie wdrożenia ani dostarczenia.
Pkt5 Ankiet nadal wymaga końcowej bramki branch/Pages/main; nie promować
kolejnego frontu mailowego razem z niedomkniętymi Ankietami.

### Pkt6 / wspólny szablon — branch, jeszcze niewdrożony

Kanoniczny czysty renderer: supabase/functions/_shared/mail-document.js.
Przeglądarka otrzymuje identyczną wygenerowaną kopię przez
scripts/sync-mail-document.cjs; unit wykrywa rozjazd. Jeden dokument
obsługuje Znajomych/Subskrybentów/Ankiety/Bazy/Control/auth, z escapowaniem
tekstu i atrybutów, PL/EN/UK, jednolitą typografią/przyciskiem/linkiem.
Bez rozmycia i wersalików, których klienci pocztowi nie wspierali spójnie.
Przypomnienia mają odrębną treść i temat przy zachowaniu tokenu/limitu;
Bazy podają aktualną rolę i wymaganie akceptacji. Control nadal bez
przypomnień; błędy transportu są sygnalizowane, dostęp już powstały nie
jest cofany przez awarię wysyłki. Linki i stopki zachowują język.

424/424 unit lokalnie ✓. Deno check obecnego auth początkowo wykazał sześć
starszych problemów typów (identycznie odtworzonych na niezmienionym HEAD):
nullable service client/token oraz URL|null. Jawne guardy i walidacja tokenu
usuwają je, świeży check ✓. Osobny izolowany runner verify_e19_mail oraz
kontrola rzeczywistych maili/UI nadal wymagane przed publikacją.

Zrzuty z faktycznych funkcji rendererów i danych przykładowych:
[znajomi390](img/e19-mails/friend-reminder-pl-390.png),
[subskrybenci390](img/e19-mails/subscriber-reminder-pl-390.png),
[ankiety390](img/e19-mails/poll-reminder-pl-390.png),
[baza390](img/e19-mails/base-viewer-pl-390.png),
[urządzenie390](img/e19-mails/device-pl-390.png),
[auth1400](img/e19-mails/auth-recovery-pl-1400.png),
[baza EN390](img/e19-mails/base-viewer-en-390.png),
[baza UK390](img/e19-mails/base-viewer-uk-390.png).
Wszystkie sześć rodzajów ma też wersję1400, bez overflow390/1400.
Zrzuty dokumentują wykonanie wyglądu, nie dowód dostarczenia nowego maila.
Nie zamykać pkt6 na podstawie unit/check/zrzutów. Audyt treści pozostałych
maili systemowych, wszystkie języki dostarczania i granice pozostają w zakresie.

### Dalsze wejścia i wynik transportu — audyt pkt6

- Worker contact-email.js: potwierdzenie zgłoszenia/odpowiedź/compose ma
  własny dokument560px i escapowane cytaty, lecz inną typografię oraz brak
  jawnego języka. Dopiąć po pierwszej paczce sześciu wejść; wiadomość
  kontaktowa nie potrzebuje sztucznego przycisku akcji.
- Settings: ręczna poczta HTML/odpowiedzi/marketing mają osobne opakowania,
  podpis i załączniki. Zachować funkcję edytora HTML podczas ujednolicenia;
  nie wprowadzać escaping całego zamierzonego HTML z edytora.
- send-mail zwraca queued=rows.length bez odczytania rzeczywiście
  wstawionych rekordów. Flaga zmieniona między RPC a BEFORE INSERT może
  pomijać wiersz, a wynik nadal sugeruje zakolejkowanie. Domknąć prawdziwy
  wynik i zachowanie per adres/flag race w pkt6, z testem faktycznej kolejki;
  nie oznaczać pierwszej paczki rendererów jako rozwiązania tej granicy.

### Druga paczka pkt6 — kontakt i Settings (draft)

Kontakt confirmation/reply/compose używa wspólnego dokumentu z jawnym
lang PL/EN/UK. Renderer ma identyczne generowane kopie frontu oraz Workera.
Jawne wejście rich HTML zachowuje formatowanie TinyMCE; nagłówki, cytaty
i podpisy nadal są escapowane. Przycisk akcji jest opcjonalny.
Settings podgląd i wysyłka ręcznej wiadomości używają tej samej funkcji.

Admin compose sprawdza błąd INSERT i rzeczywisty id kolejki. Pominięty mail
nie zapisuje wysłanej historii ani załączników; edytor pozostaje otwarty.
Marketing liczy tylko rzeczywiste INSERT RETURNING i tylko dla nich zapisuje
historię. Wynik queued/skipped jest widoczny również przy całym batch mail-off.
Odrębne zapisy kolejki i historii nie są jeszcze jedną transakcją: błąd
historii po zakolejkowaniu wymaga audytu spójności w pkt7. Szablony wizualne
marketingu dopięte w następnej części tego draftu (poniżej).

Unit całych handlerów sprawdza queued0/mixed/full, normalizację/dedup,
brak historii dla mail-off, błędy kolejki/historii, id i załączniki oraz limit500.
Punktowy E2E mail-content uruchamia kod15 szablonów (3 kontaktowe + ręczny
×3lang oraz trzy marketingowe) i wysyła przez send-mail do test14. Nie wywołuje publicznego formularza
kontaktu, który powiadamia też administratora przez Telegram. Ten E2E nie
jest kontrolą publicznego formularza ani autoryzowanego interfejsu admina.

Zrzuty po wykonaniu, bez overflow390/1400:
[kontakt390](img/e19-mails/contact-confirmation-pl-390.png),
[kontakt1400](img/e19-mails/contact-confirmation-pl-1400.png),
[odpowiedźUK1400](img/e19-mails/contact-reply-uk-1400.png),
[ręczny390](img/e19-mails/contact-manual-pl-390.png),
[długa nazwa390](img/e19-mails/long-resource-390.png).
Dostarczenie i kontrola branch/main wymagane przed zamknięciem paczki.

### Marketing i pierwsza kontrola main — aktualizacja

Pierwsza paczka wdrożona i sprawdzona: main38170191574 ma13 poprawnych
scenariuszy; świeży main38171488172 ✓ wypisanie z poprawną asercją odmowy.
Nie powtarzać niezmienionych13. Pkt6 jako całość nadal otwarty.

Marketing invitation/newsletter/custom używa jednego helpera zarówno do
podglądu, jak i wysyłki, wspólnej ramki, akcji i stopki. Zachowano bogatą
treść zaproszenia, cztery ilustracje i edytowalny HTML newsletter/custom.
Obecny marketing ma polskie treści bez selektora języka; dokument jawnie
lang=pl. Ręczny tekst bez body_html w API jest escapowany we wspólnej ramce.
Pusty dokument marketingowy jest odrzucany przed kolejką.
Nowy E2E obejmuje15 rzeczywistych szablonów na test14; unit443 lokalnie.

Zrzuty [marketing390](img/e19-mails/marketing-invitation-390.png),
[marketing1400](img/e19-mails/marketing-invitation-1400.png),
[newsletter390](img/e19-mails/marketing-newsletter-390.png),
[własny390](img/e19-mails/marketing-custom-390.png), wszystkie bez overflow.

Przegląd screenshotów marketingu wykrył legacy /img/pl/ zwracające404.
Aktualne /assets/img/pl/ zwraca200 image/webp. Zrzuty odświeżone z czterema
ilustracjami; unit weryfikuje lokalne pliki i ścieżki, E2E sprawdza HTTP
każdego obrazka przed SMTP. Izolowana bramka buduje też Worker przez
Wrangler --dry-run, bez wdrożenia.

### Zapisane podglądy Settings — uzupełnienie audytu

Pięć miejsc pokazywania wiadomości/wątku/dwukliku używa jednego helpera
stored-mail. Pełny body_html wyświetla się dokładnie jak zapisano, bez
dokładania drugiego nagłówka/dokumentu oraz nadpisywania CSS. Fragmenty
body_html zachowują formatowanie we wspólnej ramce; body bez HTML jest
wyświetlany jako zwykły tekst, również gdy zawiera znaki przypominające tagi.
Unit sprawdza dokument/fragment/tekst i wszystkie pięć wywołań; punktowy
E2E importuje rzeczywiste moduły przeglądarki. To nie jest pełna kontrola
autoryzowanego panelu administracyjnego. SMTP15 i ilustracje potwierdzone
branch38172035648; po tej zmianie niezmienieni producenci nie wymagają
powtórzenia SMTP na branchu, main obejmie15mail+preview.

### Pkt6 — aktualny stan wdrożony i zweryfikowany

Worker38172431062, Edge38172431290, Pages38172431095 ✓.
Main38172503834 ✓2/2 bez retry/unit447:15 rzeczywiście odebranych maili
(35–49s), wszystkie treści/lang/formatowanie,4 ilustracje HTTP200 oraz
opublikowane moduły przeglądarki podglądu. Pierwsza paczka sharing/auth/
flag:13 poprawnych38170191574 i wypisanie38171488172 ✓.
Pkt6 zamknięty; wcześniejsze draft/do wdrożenia są historią realizacji.

Pokrycie nie oznacza pełnego autoryzowanego panelu admina/publicznego
kontaktu: handler admina sprawdzony unit ze sztucznym transportem,
kontaktowy i marketingowy kod rzeczywistych szablonów + prawdziwy SMTP
przez send-mail. Auth4typy×3lang renderer unit; reset i zmiana e-maila mają
prawdziwe przepływy E2E oraz treściPL/EN/UK. Signup/guest migration nie były
nowym funkcjonalnym E2E tej paczki. Audyt atomowości queue/historia pkt7.

### Pozostałe domknięcie kolejki i stopki Control (audyt 2026-10-12)

358 sprawdza globalną preferencję konta/adresu przed budżetem Control i insercją czterech rodzin powiadomień; nie kończy kontroli źródeł podczas dostarczania. Obecny mail Control do adresu bez konta nie zawiera stopki globalnego wypisania (potwierdzone rzeczywistym mailem test14 w38257851591). Uzupełnić ją w dalszym ujednoliceniu maili, używając istniejącego globalnego tokenu adresu i Go, bez zakładania konta ani własnego systemu preferencji. Test358 globalnego mail-off wykorzystuje istniejący token z subscribers_invite; nie jest dowodem stopki Control.

### Decyzja użytkownika — zawsze stopka i nadrzędna preferencja (2026-10-12)

**Korekta zakresu:** maile rejestracji, odzyskiwania hasła, potwierdzenia
zmiany adresu i konwersji konta gościa korzystają z osobnej funkcji
uwierzytelniania i bezpośredniej wysyłki. Nie dodawać do nich stopki
centrum `/mail/` ani rezygnacji z powiadomień. Native linki logowania
i potwierdzenia pozostają ich własną ścieżką. Poniższa zasada „każdy mail”
dotyczy powiadomień systemowych, nie korespondencji uwierzytelniającej.
Treść tych maili podstawia Edge `send-email`/`email-templates.ts`;
nie przenosić jej do renderera powiadomień ani centrum.
Nie są powiadomieniami: nie podlegają `user_flags.email_notifications`,
globalnemu `suppressed_at`, odmowom zaproszeń ani blokadom maili
powiadomień. Wyłączenie maili nie blokuje rejestracji, resetu hasła,
potwierdzenia/zmiany adresu ani konwersji gościa. Natywne ograniczenia
prób uwierzytelniania pozostają osobnym mechanizmem.

| Rodzaj wiadomości | Globalna rezygnacja z powiadomień | Stopka centrum | Ścieżka |
|---|---|---|---|
| Znajomi, Subskrybenci, Ankiety, Bazy, Control, przypomnienia | blokuje mail | tak | kolejka powiadomień |
| Marketing i wiadomość bez wątku zgłoszenia | blokuje mail | tak | kolejka |
| Potwierdzenie centrum zamówione przez odbiorcę | nie blokuje | ten sam jednorazowy link | prywatne źródło weryfikacji |
| Potwierdzenie przyjęcia zgłoszenia Kontakt i odpowiedź w jego wątku | nie blokuje | tak | rzeczywiste zgłoszenie i zgodny odbiorca |
| Rejestracja, reset hasła, potwierdzenie/zmiana adresu, konwersja gościa | **nie dotyczy** | **nie** | osobna funkcja Edge uwierzytelniania |

**Świadome zgłoszenie Kontakt jest wyjątkiem:** globalna rezygnacja nie
blokuje wysłania formularza ani potwierdzenia przyjęcia i odpowiedzi
w jego wątku. Nie włącza to powiadomień i nie przywraca zaproszeń.
Potwierdzenie centrum zamówione ręcznie także jest wyjątkiem. Wyjątek
mailowy musi mieć prywatne powiązanie z faktycznym zgłoszeniem/linkiem,
nie wynikać z action_key albo deklaracji nadawcy. Zwykłe powiadomienia,
zaproszenia, przypomnienia i marketing nadal respektują globalną flagę.

Stopka globalnego wypisania ma być w każdym mailu, także do odbiorcy z kontem; sam odnośnik do ustawień konta nie zastępuje wypisania. Jeden globalny stan odbiorcy obowiązuje wszystkich nadawców i wszystkie miejsca kolejkowania/dostarczania powiadomień. UI może wyjaśniać „Ta osoba zrezygnowała z powiadomień e-mail. Dostęp zostanie nadany bez maila”. Mail-off nie cofa uprawnienia.

Audyt aktualnego Go: przed potwierdzeniem „zablokować wszystkie powiadomienia mailowe”, po nim „Nie będziesz już otrzymywać żadnych maili”, brak instrukcji przywrócenia i brak anonimowego cofnięcia. Ustawienia konta zapisują user_flags, ale nie czyszczą globalnego suppressed_at; niespójność do naprawienia. Dla konta przywrócenie powinno być świadomą akcją właściciela w ustawieniach. Sposób przywrócenia adresu bez konta pozostaje do uzgodnienia; nie ogłaszać bezwarunkowo nieodwracalności ani dodawać samodzielnie anonimowego włączania przez nadawcę. Dopiąć opis skutków i drogi powrotu w Go, wspólną stopkę i macierz flag/zmiany maila/rejestracji/kolejki.

### Decyzja użytkownika — centrum adresu bez konta `/mail/` (2026-10-12)

Strona domyka lukę powrotu do powiadomień i zbiera aktualne powiązania adresu bez przeszukiwania skrzynki. Po globalnym wypisaniu Go przedstawia dwie drogi: zarejestrować konto i świadomie włączyć maile w ustawieniach albo wejść na `/mail/`, podać adres i przywrócić powiadomienia. Dla adresu z kontem komunikat „Masz konto w systemie. Zaloguj się, żeby zarządzać swoimi powiadomieniami” i logowanie; stan ustalany przez kanoniczny Auth.

Potwierdzenie właściciela adresu: przed pokazaniem danych, zdjęciem blokady lub anulowaniem relacji wymagany link potwierdzający wysłany na podany adres. Sam wpis adresu nie stanowi uprawnienia. To mail żądany do zarządzania adresem, dostępny również przy wyłączonych powiadomieniach; nie włącza ich samoczynnie. Potwierdzenie prowadzi przez Go, ma termin ważności i nie ujawnia danych osobie wpisującej cudzy adres. Dopiero po potwierdzeniu następuje świadome włączenie. Zwykłe powiadomienia nadal podlegają nadrzędnej globalnej fladze. Limitowanie żądań potwierdzenia współdzielone, jawny cooldown, bez resetowania limitów zaproszeń/odmów.

| Sekcja `/mail/` po potwierdzeniu | Dane i akcje |
|---|---|
| Powiadomienia | Prawdziwy globalny stan adresu, włącz/wyłącz; sam podgląd i odświeżenie nie zmieniają zgody. |
| Subskrypcje | Wszystkie aktualne aktywne subskrypcje, nazwa nadawcy, wypisz się; wypisanie od konkretnego nadawcy zachowuje odmowę30 dni. |
| Zaproszenia / ankiety | Aktualne propozycje subskrypcji i ważne ankiety przypisane do adresu, zgodne stany i dostępne akcje jak w Go; bez obejścia terminów, odmów i limitów. |
| Udostępnione urządzenia | Aktualne granty mailowe dla ważnych sesji Control, gra/nadawca/typ, przejdź do urządzenia; wygasłe/cofnięte znikają zgodnie z grafem. |

Znajomości, Bazy i kopie Gier/Logo wymagają konta, nie są dokładane sztucznie do centrum mail-only. Przegląd nie daje dodatkowych uprawnień i nie unieważnia niczego automatycznie. Braki: wspólne kafelki z przerywaną obwódką. Wspólne wiersze, komunikaty i cooldowny, przewijanie wewnętrzne, telefon/tablet/landscape; zrzuty po wdrożeniu.

Dopiąć graf: adres/preferencja → żądanie potwierdzenia → czasowa sesja centrum → akcja na aktualnym źródle. Rejestracja/zmiana adresu/usunięcie rodzica/wygaśnięcie źródła nie pozwala wykorzystać starej sesji do zarządzania nieaktualnymi danymi. Sesja centrum nie jest kontem Auth, nie tworzy profilu ani gościa. Publiczne wejście ujawnia tylko decyzję o logowaniu wymaganą przez użytkownika; listy i tokeny dostępu dopiero po potwierdzeniu. Tests: konto vs mail-only, global-off, realny mail potwierdzający, brak zgody przed potwierdzeniem, termin/jednorazowość, cudzy/niepoprawny token, wszystkie źródła/statusy, kaskady i wyścigi; potem branch/main.

### Doprecyzowanie użytkownika — dwie sekcje i rodzaje kafli `/mail/` (2026-10-12)

Dwie sekcje główne: **Subskrypcje** oraz **Zadania i udostępnienia**. Wcześniejsza tabela zakresu opisuje rodzaje danych, nie cztery odrębne karty. Globalny stan/przełącznik powiadomień w pasku nad sekcjami. Na komputerze równy podział na dwie kolumny; na telefonie wspólny wzorzec dwóch zakładek z niskimi wypustkami, pełna wysokość i przewijanie w środku.

| Sekcja | Zawartość i akcje |
|---|---|
| Subskrypcje | Aktywne: wypisz się/anuluj. Oczekujące: akceptuj lub odrzuć. Wypisanie i odmowa zachowują kontrakt30 dni dla adresu bez konta; nie przywracać ich przez samo włączenie maili. |
| Zadania i udostępnienia | Ankiety: przejdź do głosowania/zadania, odrzuć. Urządzenia: przejdź do podłączenia dla aktualnej sesji. Kafelki z ikoną pochodzenia i delikatnym kolorem rodzaju jak w dawnych Zadaniach; ankiety i urządzenia na tej liście. |

Wspólne stany puste, kafelki/akcje i mobilne skrócenie informacji; żadnego zbędnego filtra typu/wyszukiwania. Zwykła strona Zadania dla kont pozostaje tylko ankietowa zgodnie z wcześniejszą decyzją; rozszerzona lista dotyczy centrum mail-only.

Mechanizm potwierdzenia: nowy jednorazowy link z tokenem przez Go, zamiast obowiązku przepisywania kodu. Po potwierdzeniu otwiera czasową sesję centrum dla tego adresu. Nie zastępuje tokenów zadań, subskrypcji ani grantów urządzeń; kolejne przejście do zasobu używa jego istniejącego tokenu i sprawdza aktualną ważność. Wydanie potwierdzenia/sesji nie włącza powiadomień ani nie akceptuje propozycji samoistnie. Zastępuje wcześniejsze „anonymousundo do uzgodnienia” dla globalnych maili: przywrócenie przez potwierdzone `/mail/` albo ustawienia konta. Pozostałe kontrakty odmów pozostają zgodne z E19.

Wariant lokalnego prototypu rozważany przed ostatnią decyzją: globalne wyłączenie zachowywało widoczne subskrypcje/zadania. **Zastąpiony decyzją poniżej**; nie wdrażać lokalnego global-unsubscribe-prototype.sql/test oczekujących zachowania subskrypcji.

### Najnowsza decyzja — nadrzędna rezygnacja, anulowanie i token w stopce (2026-10-12)

W `/mail/` nadrzędna sekcja **globalnej rezygnacji**. Jeśli adres zrezygnował, pozostałe listy nie są wyświetlane, a jego zaproszenia, subskrypcje, zadania i udostępnienia są odrzucone/anulowane/unieważnione zgodnie z rodzajem. Ponowne włączenie nie przywraca automatycznie dawnych źródeł ani nie resetuje odmów/cooldownów. Zakończone głosy i wymagane agregaty zachowują dotychczasowy kontrakt grafu; nie udawać, że wygasła sesja Control znów daje dostęp. Osobne akcje konkretnych źródeł pozostają dostępne podczas aktywnego stanu adresu.

**Link w stopce każdego maila zawiera token dostępu do centrum tego adresu.** Kliknięcie przechodzi przez Go bezpośrednio do `/mail/`; rezygnacja i reszta zarządzania wykonywane tam. Posiadanie poprawnego tokenu ze stopki jest potwierdzeniem dostępu — nie żądać dodatkowego maila, żeby otworzyć centrum z tej ścieżki. Wejście ręczne na `/mail/` i samo wpisanie adresu nadal wymagają nowego jednorazowego linku potwierdzającego. Link/footer nie wyłącza automatycznie w czasie GET, na podglądzie poczty ani przy odświeżeniu. Token centrum nie zastępuje tokenów ankiet i urządzeń. Adres z kontem nadal→login/account.

Zmiana zastępuje wcześniejszy wariant „tylko mail, źródła pozostają widoczne” dla centrum adresu bez konta. **Otwarta kluczowa granica:** czy ma również zmienić istniejący przełącznik powiadomień konta, odwołując dostępy do Baz i innych zasobów, czy tam pozostaje wyłączeniem maili. Zadano jedno pytanie; do odpowiedzi nie wdrażać automatycznego usuwania dostępów zarejestrowanych. Kontynuować niezależną implementację centrum mail-only i wspólnego footer/token/Go.

Granica uprawnień tokenu stopki: obecny email_unsub_tokens.token bywa zwracany nadawcy przez API przygotowania subskrypcji i służy wyłącznie wypisaniu. Nie rozszerzać go na odczyt wszystkich relacji i kluczy urządzeń odbiorcy. Nowy token pełnego centrum jest wydawany tylko przez usługę wysyłki i trafia do odbiorcy w rzeczywistym mailu, nie do przeglądarki/API nadawcy. Historyczne uprawnienie unsubscribe nie staje się odczytem innych zasobów. Ręczne potwierdzenie wydaje odpowiednią ograniczoną sesję po poprawnym linku. Testować brak odkrywania tokenów centrum przez właściciela zasobu i anon, a także prawidłowy dostęp odbiorcy z rzeczywistego maila.

Nadrzędna rezygnacja mail-only obejmuje też nowo próbowane zaproszenia/udostępnienia w czasie blokady: nie powstaje aktywny dostęp ukryty przez frontend. Backend tworzenia/Go/open/vote/device-key/listy/kolejka respektuje stan rodzica. TestControl358 z dostępem bez maila był kontraktem wcześniejszej decyzji; nowy pakiet celowo zmienia globalnie zablokowany adres bez konta, bez przedstawiania358 jako błędnie wdrożonego. Zakres kont nadal czeka na odpowiedź.

### Wygląd centrum maili — decyzja użytkownika 2026-10-12

Wzorzec wizualny: Go. Lekki topbar, następnie **jedna karta z listami**.
Globalna rezygnacja jako nadrzędna sekcja karty; pod nią Subskrypcje oraz
Zadania i udostępnienia. Wcześniejszy podział na kolumny/zakładki dotyczy
sekcji wewnątrz tej karty, nie osobnych rozbudowanych kart ani panelu
podobnego do Gier. Wspólne wiersze i akcje pozostają zgodne z E19.
Dopuszczona mała, dyskretna zachęta do obejrzenia Familiady i rejestracji;
nie zasłania list ani zarządzania powiadomieniami. Brak obowiązku konta.

### Realizacja dostępu centrum — lokalny kontrakt360

Odrębny token stopki i jednorazowego potwierdzenia, losowe32 bajty,
w bazie wyłącznie skrót; nowe sesje również zapisują tylko skrót.
Wydanie/wymiana/odczyt zakresu i list przez usługę, nie RPC nadawcy.
Przeglądarka otrzyma sesję w ciasteczku HttpOnly/Secure, bez sekretu
w odpowiedzi JSON lub trwałym storage. Ostateczny endpoint i ochrona
żądań zostaną sprawdzone przed wdrożeniem.

Parametry realizacji: link stopki30 dni (potem nowe potwierdzenie ze
strony), potwierdzenie15 minut/jednorazowe, sesja1 godzina bez aktywności
oraz24 godziny maksymalnie. Wygaśnięcie potwierdzenia po jego użyciu nie
skraca już potwierdzonej sesji; nie przedłuża się jej granica24 godzin.
Rejestracja/zmiana adresu/usunięcie konta lub rodzica unieważnia wcześniejsze
uprawnienie, bez odzyskania go przez ponowne użycie starego adresu.
Globalna rezygnacja pozostawia dostęp do nadrzędnej sekcji przywrócenia,
które nie przywraca dawnych źródeł ani liczników.

Lokalne szkice w docs/sql/*mail-center*360*, nie migracje produkcyjne.
Kontrakt bazowy, ACL,24 wyścigi i rezygnacja przez potwierdzoną sesję
sprawdzone lokalnie. Brakuje list/akcji, ochrony nowych źródeł w czasie
blokady, żądania potwierdzenia i dostarczenia pełnej stopki oraz UI/Go.

### Ostatnia korekta wyglądu `/mail/` — 2026-10-12

Sekcja globalnej rezygnacji **nad** kartą list. Karta ma rzeczywiste
wypustki jak Ankiety: ten sam HTML/CSS, dwie zakładki Subskrypcje oraz
Zadania, również na komputerze. Zastępuje wcześniejsze dwie równoczesne
kolumny i prostokątne mobilne przyciski. Tytuł „Moje powiadomienia”
w stylu nagłówka Gier, złote logo, lekki topbar; stopka stale przy dolnej
krawędzi przez pełną wysokość układu. Globalna rezygnacja ukrywa kartę
list, zachowuje nadrzędną sekcję przywrócenia.

Ostateczne doprecyzowanie ikon wszystkich udostępnień: X dla odmowy,
rezygnacji, opuszczenia dostępu przez odbiorcę; śmietnik dla usunięcia
zasobu, relacji lub cofnięcia/anulowania własnego udostępnienia przez
nadawcę. Samo zamknięcie okna nadal X. Wspólny sharingActionIcon oraz
renderery udostępnień pilnują tej semantyki; podpis opisuje akcję.
Zastępuje przejściową interpretację „śmietnik przy każdej rezygnacji”.

### Korekta awarii wysyłki Auth — 2026-10-12

Maile rejestracji, resetu hasła, zmiany adresu i konwersji gościa nigdy nie
wchodzą do kolejki powiadomień ani nie podlegają jej blokadom. Audyt kodu
wykrył dawny awaryjny INSERT do tej kolejki po wyczerpaniu dostawców;
usuwamy go. Bez dostępnego dostawcy funkcja Auth zwraca błąd wysyłki,
nie pozorny sukces kolejkowania. Treści nadal podstawia Edge; brak stopki
centrum i odczytu flag konta/globalnej rezygnacji. Testy obejmują sukces,
błąd dostawcy, brak limitu i brak dostawców.

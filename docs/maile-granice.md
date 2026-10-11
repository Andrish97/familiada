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

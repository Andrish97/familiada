# Audyt `PAGES`, `initPage()` i przekierowań

Stan na 2026-10-17. Audyt statyczny repozytorium; bez testów i galerii.

## Rola elementów

- `PAGES` w `web/shared/js/core/nav-map.js` opisuje dziś głównie nawigację
  aplikacji: cele, powroty, role, karty, stany URL i ograniczenia urządzeń.
  Decyzja użytkownika z 2026-10-17 rozszerza wymaganie: mapa/inwentarz ma
  jawnie obejmować każdą trasę HTML, także samodzielne przepływy techniczne.
  Trasy, które nie należą do menu, dostają wpis z oznaczeniem samodzielności
  i powodem wyłączenia z nawigacji. Aktualny brak takich wpisów jest luką do
  zamknięcia, nie wyjątkiem od reguły.
- `initPage()` w `web/shared/js/core/page-init.js` uruchamia typową stronę
  aplikacji: najpierw czeka na device guard, potem rozstrzyga dostęp i sesję,
  a następnie podpina topbar, Wstecz, instrukcję, przyciski i stan arkusza.
- Samodzielne przepływy publiczne i widoki urządzeń mają własny bootstrap.
  Część z nich wywołuje bezpośrednio wspólny `guardViewportWidth()`.

## Pokrycie

| Grupa | Mapa `PAGES` | `initPage()` | Uwagi |
| --- | --- | --- | --- |
| Gry, edytor gry, ustawienia gry, Bazy, Eksplorator, Logo, Ankiety, Konto, Control, Znajomi, Subskrybenci, Zadania, Marketplace, Connect, Manual, Prywatność | Tak | Tak | Standardowe strony aplikacji; Znajomi i Subskrybenci wchodzą przez wspólny `contacts-page.js`. |
| Home, Login, Mails | Tak | Nie | Mają własne inicjalizatory. `PAGES` jest im potrzebne do linków, powrotów lub stanu URL. Home i Login mają własną obsługę sesji; Mails własny publiczny przepływ mailowy. |
| Connect TV | Tak | Nie | Dedykowana bramka TV i osobny ekran parowania. |
| Login confirm/reset, Go, głosowanie tekstowe/punktowe/QR, Display/Host/Buzzer, 404, Maintenance | Nie | Nie | Osobne publiczne, tokenowe, urządzeniowe albo serwisowe przepływy. Powinny dostać jawne wpisy jako trasy samodzielne; Go nie może być celem `ret`, by powrót nie otwierał jednorazowego linku ponownie. |
| Panel admina `/settings/` i narzędzia | Nie | Nie | Osobna autoryzacja/powłoka; poza zakresem galerii na polecenie użytkownika, ale również wymaga jawnego wpisu trasy samodzielnej w inwentarzu. |

`mailCenter` jest wpisem w `PAGES` i jest wyłączony z powiadomień
rating/guest-info w `initPage()`, ale `mail.js` nie wywołuje `initPage()`.
To nie powoduje obecnej usterki landscape, lecz jest pozostałością do
rozstrzygnięcia przy ewentualnej migracji startu Mails.

## Znaleziony rozjazd z wpływem na device guard

Szesnaście chronionych stron aplikacji nadal ma w `<head>` skrypt, który
szuka dowolnego klucza `sb-*-auth-token` w `localStorage` i bezpośrednio
wykonuje `location.replace('/login/')`, jeżeli go nie znajdzie:

`/account/`, `/bases/`, `/bases/explorer/`, `/control/`, `/friends/`,
`/games/`, `/games/editor/`, `/games/settings/`, `/logos/`,
`/logos/editor/draw/`, `/logos/editor/image/`, `/logos/editor/text/`,
`/manual/`, `/polls/`, `/subscribers/`, `/tasks/`.

Te strony później i tak używają `initPage()` (bezpośrednio albo przez
`contacts-page.js`). Wczesne sprawdzenie sesji wykonuje się przed modułami,
więc anonimowe wejście może przekierować do Login zanim `initPage()` pokaże
device guard. Narusza to opisaną kolejność „urządzenie przed sesją” i tłumaczy,
dlaczego na tej samej stronie blokada bywa niewidoczna przy braku sesji.
Sprawdzenie w HTML zna tylko obecność klucza, nie sprawdza jego ważności ani
tożsamości użytkownika; właściwe rozstrzygnięcie wykonuje później `initPage()`.

### Proponowany następny krok

Usunąć z powyższych 16 plików HTML wyłącznie wczesne sprawdzenie sesji i
przekierowanie, pozostawiając `page-loading`. `initPage()` stanie się jedynym
źródłem decyzji o sesji i zachowa kolejność: device guard → dostęp/sesja →
odsłonięcie strony. Panel admina pozostaje poza tą zmianą.

Nie przenosić automatycznie wszystkich stron do `initPage()`: dla przepływów
Go, głosowania, Login, Mails i urządzeń trzeba najpierw określić, które
zachowania topbara, auth, ratingu i powrotu są tam właściwe.

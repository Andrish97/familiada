# Audyt `PAGES`, `initPage()` i przekierowań

Stan na 2026-10-17. Audyt statyczny repozytorium oraz punktowy test pokrycia
tras; bez pełnego zestawu i galerii.

## Rola elementów

- `PAGES` w `web/shared/js/core/nav-map.js` opisuje cele, powroty, role, karty,
  stany URL i ograniczenia urządzeń. Po decyzji użytkownika z 2026-10-17
  obejmuje też każdą trasę HTML, w tym samodzielne przepływy techniczne.
  Trasy spoza zwykłego menu mają jawne oznaczenie i powód wyłączenia.
- `initPage()` w `web/shared/js/core/page-init.js` uruchamia typową stronę
  aplikacji: najpierw czeka na device guard, potem rozstrzyga dostęp i sesję,
  a następnie podpina topbar, Wstecz, instrukcję, przyciski i stan arkusza.
- Samodzielne przepływy publiczne i widoki urządzeń mają własny bootstrap.
  Część z nich wywołuje bezpośrednio wspólny `guardViewportWidth()`.

## Pokrycie po uzupełnieniu mapy

`PAGES` obejmuje teraz każdą stronę aplikacji oraz wszystkie pliki HTML pod
`web/`. Dodano wpisy `kind: "standalone"` z `standaloneReason` dla przepływów
tokenowych, urządzeń, fallbacku 404/Maintenance oraz panelu i narzędzi admina.
Samodzielne trasy mają `from: []`, więc nie są celami zwykłego powrotu;
automatyczne powroty z instrukcji pomijają je. Obsługa dialogu kontaktu
pozostaje zgodna z dotychczasowym globalnym zestawem stron.
Test `navMap.test.js` przegląda pliki HTML i pilnuje pokrycia oraz jawnego
uzasadnienia każdego wpisu samodzielnego.

## Pokrycie `initPage()`

| Grupa | Mapa `PAGES` | `initPage()` | Uwagi |
| --- | --- | --- | --- |
| Gry, edytor gry, ustawienia gry, Bazy, Eksplorator, Logo, Ankiety, Konto, Control, Znajomi, Subskrybenci, Zadania, Marketplace, Connect, Manual, Prywatność | Tak | Tak | Standardowe strony aplikacji; Znajomi i Subskrybenci wchodzą przez wspólny `contacts-page.js`. |
| Home, Login, Mails | Tak | Nie | Mają własne inicjalizatory. `PAGES` jest im potrzebne do linków, powrotów lub stanu URL. Home i Login mają własną obsługę sesji; Mails własny publiczny przepływ mailowy. |
| Connect TV | Tak | Nie | Dedykowana bramka TV i osobny ekran parowania. |
| Login confirm/reset, Go, głosowanie tekstowe/punktowe/QR, Display/Host/Buzzer, 404, Maintenance | Tak — standalone | Nie | Osobne publiczne, tokenowe, urządzeniowe albo serwisowe przepływy. Go nie jest celem `ret`, by powrót nie otwierał jednorazowego linku ponownie. |
| Panel admina `/settings/` i narzędzia | Tak — standalone | Nie | Osobna autoryzacja/powłoka; poza zakresem galerii na polecenie użytkownika. |

`mailCenter` jest wpisem w `PAGES` i jest wyłączony z powiadomień
rating/guest-info w `initPage()`, ale `mail.js` nie wywołuje `initPage()`.
To nie powoduje obecnej usterki landscape, lecz jest pozostałością do
rozstrzygnięcia przy ewentualnej migracji startu Mails.

## Usunięty rozjazd z wpływem na device guard

Szesnaście chronionych stron aplikacji miało w `<head>` skrypt, który
szukał dowolnego klucza `sb-*-auth-token` w `localStorage` i bezpośrednio
wykonywał `location.replace('/login/')`, jeżeli go nie znalazł:

`/account/`, `/bases/`, `/bases/explorer/`, `/control/`, `/friends/`,
`/games/`, `/games/editor/`, `/games/settings/`, `/logos/`,
`/logos/editor/draw/`, `/logos/editor/image/`, `/logos/editor/text/`,
`/manual/`, `/polls/`, `/subscribers/`, `/tasks/`.

Te strony i tak używają `initPage()` (bezpośrednio albo przez
`contacts-page.js`). Duplikat usunięto, a `page-loading` pozostawiono.
`initPage()` jest teraz pierwszym źródłem decyzji o sesji i zachowuje
kolejność device guard → dostęp/sesja → odsłonięcie strony. Samo sprawdzanie
klucza w HTML nie weryfikowało ważności ani tożsamości użytkownika.

### Zakres wdrożenia

Zmieniono wyłącznie powyższe 16 plików. Panel admina pozostał poza zmianą
auth/device guard; został tylko wpisany do inwentarza tras.

Nie przenosić automatycznie wszystkich stron do `initPage()`: dla przepływów
Go, głosowania, Login, Mails i urządzeń trzeba najpierw określić, które
zachowania topbara, auth, ratingu i powrotu są tam właściwe.

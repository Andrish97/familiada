# Panel admina `/admin/` — analiza i podział (E23 §8a)

Stan: 2026-10-24. Plan etapu: `docs/silnik-stylow-projekt.md` §8a.
Panel jest tylko po polsku (teksty na sztywno — decyzja 2026-10-23);
`t()` służy wyłącznie podglądowi strony przerwy (ta jest wielojęzyczna).

## Moduły (`web/admin/js/`)

Dawny `settings.js` (7496 linii, jeden plik) podzielony na moduły paneli
bez zmiany zachowania. Podział zrobił skrypt na drzewie składni (espree +
eslint-scope): każda deklaracja w jednym module, importy/eksporty wyliczone
z użyć, zapisów cudzych zmiennych między modułami — 0.

| moduł | linie | zawartość |
|---|---|---|
| `settings.js` | ~180 | start panelu: logowanie Access, zakładki → panele, `wireEvents` (przyciski zakładek, wyloguj) |
| `core.js` | ~380 | `els`, stałe, `apiFetch`/`adminGet`/`adminPost`/`adminFetch`, `showToast`, `showAuth`/`showPanel`, formatowanie dat, `esc`, `loadTinyMce`, `syncTopbarHeight` — liść (nie importuje paneli) |
| `tabs.js` | ~100 | aktywna karta, `?tab=` (`core/tabs.js`), przełączanie paneli, `onEnterMarketingTab` |
| `maintenance.js` | ~990 | przerwa techniczna: tryby, wybór daty (okno `.dt-modal`), podgląd strony przerwy, odpytywanie stanu (`startPolling`/`stopPolling`), obejście |
| `mail-settings.js` | ~1220 | poczta: dostawcy i kolejność, harmonogram, kolejka, dziennik, dostawcy AI, test Telegrama |
| `stats.js` | ~1300 | statystyki: przegląd, retencja, wykluczeni, snake, szczegóły (okno), diagnoza rozgrywek Control |
| `ratings.js` | ~120 | oceny aplikacji, oceny gier producenta (okno „Oceniający”) |
| `marketplace.js` | ~290 | Społeczność gier: lista, podgląd, akceptacja, odrzucenie (okno), wycofanie, usunięcie |
| `mailbox.js` | ~2050 | skrzynka i zgłoszenia: foldery, lista, wiadomość, wątek, przypisanie (okno), pisanie (TinyMCE), widok telefonu |
| `tools.js` | ~120 | laboratoria `/admin/tools/*` w ramce panelu |
| `marketing.js` | ~230 | maile marketingowe: szablony, odbiorcy, podgląd, wysyłka, edytor TinyMCE |
| `marketing-contacts.js` | ~620 | kontakty (lead-finder): przebiegi, tabela z zaznaczaniem, dzienniki |

Bez zmian: `generator.js` (Gry Producenta), `activity.js`, `session-diagnosis.js`,
`stats-export.js`, `admin-pwa.js`, `tools-guard.js`.

Kolejność ładowania: `core.js` nie zależy od paneli (jedyne użycie przy
ładowaniu modułu: `MAIL_PROVIDERS` w `mail-settings.js`). Pozostałe cykle
(`tabs` ↔ `mailbox`, `mail-settings` → `tabs`) dotyczą wyłącznie funkcji.

Testy unit czytające kod panelu: `tests/unit/helpers/admin-source.js`
(`adminPanelSource()` — tekst wszystkich modułów).

## Panele — elementy i zależności

| panel | okna | tabele / listy | uwagi |
|---|---|---|---|
| Przerwa | `maintenancePreviewOverlay` (ramka z podglądem strony przerwy), `.dt-modal` (wybór daty) | — | podgląd w `<iframe srcdoc>` z `t()` |
| Poczta | — | kolejka, dziennik (paginacja) | `ui-select` ×6, kolejność dostawców (strzałki) |
| Społeczność gier | `marketPreviewOverlay`, `marketRejectOverlay` | lista gier | licznik w zakładce |
| Oceny | `ratersOverlay` | oceny, oceny producenta | |
| Statystyki | okno szczegółów (`openStatsDetailModal`, budowane w JS) | tabele z paginacją, wykres trendu | eksport CSV (`stats-export.js`) |
| Generator | edytor gry — **brak okna w HTML** (decyzja użytkownika otwarta) | lista gier | `generator.js` |
| Zgłoszenia / skrzynka | `assignReportModal`, podgląd załącznika | lista wiadomości, wątek | TinyMCE (`tox-*`), 3 widoki na telefonie |
| Marketing | — | lista adresów | TinyMCE |
| Kontakty | — | tabela z zaznaczaniem komórek | Worker `/leads/*` |
| Narzędzia | — | — | ramka z laboratorium |

## Przepięcie na silnik (krok 5) — lista

1. Kolory na sztywno w `settings.css` (99) → tokeny.
2. Nadpisania elementów silnika w pliku strony: `.topbar` (sticky zamiast
   stałego), `.overlay` (pod topbarem), `.modal-actions`,
   `.topbar-mobile-overlay` → zachowanie silnika.
3. Okno wyboru daty `.dt-modal` (własna nakładka) → `.overlay` + `openDialog`.
4. Pigułki poczty `.mail-pill--*` → `.tag` ze znaczeniami (`tag--gold` → silnik).
5. Style w JS: `generator.js` 21, `tools.js` 7, `stats.js` 6, `mailbox.js` 3,
   `mail-settings.js` 1.
6. Puste stany (`mail-list-empty`, `activity-chart-empty`) → `emptyState()`.
7. Zrzuty przed/po wszystkich scen `admin-*` (38 scen × telefon/komputer).

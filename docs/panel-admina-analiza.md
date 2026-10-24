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

## Przepięcie na silnik (krok 5) — wykonane 2026-10-24

1. Kolory na sztywno w `settings.css`: 99 → 0 (tokeny stanów, tła `--surface-*`,
   tło logowania `--bg-auth`).
2. Nadpisania silnika usunięte: topbar stały jak na innych stronach (było
   `sticky` + `page-fit` znoszone własnymi regułami), okna na całym ekranie
   z przyciemnieniem (były pod topbarem), `.modal-actions`,
   `.topbar-mobile-overlay`, `.footer` z silnika; `--z-sticky` usunięty.
3. Okno wyboru daty: `.overlay.modal--sheet` + `openDialog` (nagłówek z X,
   Anuluj/OK z ikonami, na telefonie arkusz). Przy okazji: pokrętła godzin
   ustawiają się po pokazaniu okna (wcześniej zawsze 00).
4. Pigułki poczty → `.tag` (`--gold`, `--muted`, `--bad`).
5. Pasek stanu generatora `.status-bar` → `.callout` (silnik dostał
   `--ok` i `--info`). Menu narzędzi → `placeDropdown(…, { align: "start" })`.
6. Tabele: komponent silnika `.data-table` (+ `.data-table-wrap`,
   `--scroll`, `--wide`, `.data-table-empty`) zamiast `mail-table`; tabela
   kontaktów na tej samej bazie (zostają reguły zaznaczania komórek).
   `stats-table` to lista wartości (etykieta–liczba), nie tabela danych.
7. Puste stany → `emptyState`/`emptyStateHtml`; martwe reguły `.mail-panel`
   (nazwa zajęta przez centrum maili) usunięte.
8. Zostają: style statyczne edytora gry Producenta w `generator.js` — okno
   edytora nie istnieje w HTML (przycisk „Edytuj” rzuca błąd od zawsze);
   decyzja użytkownika: zbudować okno czy usunąć przycisk.

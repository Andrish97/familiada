# „Postaw kawę” — plan (2026-10-22)

Prośba użytkownika: Familiada zostaje bezpłatna, ale kto chce, może dobrowolnie
wesprzeć twórcę („kawa bez benefitów”). Branch: `ccr-c9e1b7c4-8uoses`.
Na razie **tylko plan** dla FAQ i podręcznika (decyzja użytkownika 2026-10-22).

## Decyzje

- **2026-10-22** — wsparcie dobrowolne, bez żadnych korzyści w aplikacji; tekst mówi
  to wprost.
- **2026-10-22** — w stopce ikonka (filiżanka) obok „Kontakt”; kliknięcie otwiera okno
  z wyjaśnieniem i linkiem (nie bezpośredni link).
- **2026-10-22** — dodatkowo sekcja w FAQ strony głównej i rozdział na końcu podręcznika.
- Otwarte: **link do profilu** (buycoffee.to / Ko-fi / inny) — od użytkownika.

## Krok 1 — stopka i okno (zrobione na branchu, commit „Postaw kawę: filiżanka…”)

- Ikona `coffee` (`web/assets/icons/communication/coffee.svg`, rejestr w `icons.js`).
- `web/shared/js/core/support-modal.js`: `SUPPORT_URL` (pusty = brak przycisku),
  `ensureSupportEntryPoint()` (wołane z `contact-modal.js`, grupa `.footer-actions`
  z Kontaktem), `openSupportModal()` (`choiceModal`: Zamknij / Postaw kawę, link
  w nowej karcie, notka o zewnętrznym serwisie).
- Telefon: sama ikona (wysokość stopki bez zmian przy 360/390 px); komputer: ikona + napis.
- Teksty `support.*` PL/EN/UK; sceny `support-footer`, `support-footer-home`, `support-modal`.

## Krok 2 — FAQ na stronie głównej (plan)

Miejsce: `web/index.html` (sekcja `#faq`), teksty `home.faq.*` w `web/shared/translation/{pl,en,uk}.js`.

1. **Dopisek do q1** „Czy Familiada Online jest bezpłatna?”:
   „Tak, w pełni bezpłatna — i tak zostanie. Możesz tworzyć gry, zbierać ankiety
   i prowadzić rozgrywkę bez żadnych opłat.” (bez linku — odsyła do nowej sekcji).
2. **Nowa kategoria na końcu FAQ** `home.faq.cat6` „Wsparcie projektu”, po „Rozgrywce
   na żywo”:
   - **q31** „Jak mogę wesprzeć Familiadę?” — „Jeśli lubisz korzystać z Familiady,
     możesz postawić twórcy kawę — filiżanka w stopce każdej strony. To dobrowolny
     gest, który pomaga rozwijać serwis.”
   - **q32** „Czy wsparcie daje dodatkowe funkcje?” — „Nie. Wszystkie funkcje są
     dostępne dla każdego bez opłat. Wsparcie niczego nie odblokowuje — jest po prostu
     podziękowaniem.”
3. **Przycisk w odpowiedzi q31**: pod tekstem przycisk „Postaw kawę” (ikona `coffee`),
   który otwiera **to samo okno** co stopka (`openSupportModal`), zamiast linku
   wprost — jeden adres i jedno wyjaśnienie. `faq-a` jest ustawiane przez `data-i18n`
   (tekst), więc przycisk jako osobny element obok `<p>`, nie w tłumaczeniu.
   Bez `SUPPORT_URL` przycisk ukryty (jak w stopce).
4. **Dane strukturalne**: statyczny JSON-LD `FAQPage` w `web/index.html` (dla
   robotów) uzupełnić o q31–q32 i nowy tekst q1; `updateStructuredFaq()` w
   `web/home/js/index.js` i tak buduje go z DOM po zmianie języka.
5. Testy: `tests/unit/indexAudit.test.js` — dopisać sprawdzenie q31/q32 w 3 językach
   (bez obietnic korzyści: brak „premium”/„odblokuj”). Zrzut sceny `home`
   (`fullPage`) + nowa scena `home-faq-support` z rozwiniętą q31.

## Krok 3 — podręcznik: rozdział na końcu (plan)

Miejsce: karta **Pomoc** (`?tab=help`), po „20. Słownik pojęć”; treść w
`web/manual/content/{pl,en,uk}.js` (klucz `help`).

- **21. O projekcie i wsparcie** (`#r21`)
  - **21.1 Familiada jest bezpłatna** (`#r21-1`) — wszystkie funkcje dla każdego,
    konto gościa i zarejestrowane bez opłat.
  - **21.2 Postaw kawę** (`#r21-2`) — gdzie jest przycisk (`span.m-btn` z ikoną
    `coffee`, „w stopce, obok Kontakt; na telefonie sama filiżanka”), co pokazuje
    okno, że link prowadzi do zewnętrznego serwisu i że wsparcie nie daje żadnych
    funkcji ani korzyści. Odsyłacz do 19.6 „Kontakt z pomocą” dla uwag i pomysłów.
- Struktura (id, odnośniki, przyciski) identyczna w 3 językach — pilnuje
  `tests/unit/controlRelease.test.js`.
- `docs/podrecznik-plan.md`: rozdział 21 w części III i w „Decyzjach wdrożeniowych”
  karta `help` = rozdz. 19–21.
- Słownik (20) bez nowego hasła — pojęcie nie jest potrzebne do obsługi.
- Zrzut: scena `manual-help` (lub nowa z kotwicą `#r21`).

## Kolejność wdrożenia (cykl z CLAUDE.md)

1. Link od użytkownika → `SUPPORT_URL`.
2. Kroki 2–3 na branchu, unit, zrzuty (390/1400 px).
3. E2E z kodu brancha (`serveBranchCode`) — nowy spec `support-modal.spec.js`:
   filiżanka w stopce (strona główna, Moje gry), brak na ekranach urządzeń, okno
   otwiera się z stopki i z FAQ, „Postaw kawę” otwiera nową kartę z `SUPPORT_URL`
   (bez wchodzenia na serwis), podręcznik `?tab=help#r21`. Bez kont na stałe i bez
   `@mailbox` — może iść razem z innymi lekkimi specami.
4. Pages (push na `main`) → te same testy kontrolne na produkcji → wpis w Dzienniku.

Bez migracji i bez przerwy technicznej (zmiana jawna, zgodna wstecz).

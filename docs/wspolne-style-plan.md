# E23 — wspólne style i mechanizmy na wszystkich stronach

Cel (decyzja użytkownika 2026-10-21): **każda strona korzysta ze wspólnych
stylów i mechanizmów**. Plik strony zawiera tylko układ tej strony (siatka,
kolejność, rzeczy, których nie ma nigdzie indziej). Przyciski, pola, okna,
karty, wypustki, kafle, wiersze, paski akcji, oznaczenia, puste stany,
dymki, wczytywanie, kolory, odstępy, progi szerokości i warstwy (`z-index`)
pochodzą wyłącznie z `web/shared/css/`. Wzorce: [`wzorce-ui.md`](wzorce-ui.md).

## Decyzje

- **2026-10-21:** wspólne style wszędzie zamiast samego sprzątania; strony
  nie definiują własnych wersji wspólnych elementów (bez lokalnych kopii
  klas i nadpisań per strona).
- **Zakres Control/TV/wyświetlacz/buzzer/snake (domyślnie, do potwierdzenia
  przez użytkownika):** wspólne tokeny, przyciski, pola, okna i komunikaty
  także tam; plansza TV, wyświetlacz gry, buzzer i snake zachowują własny
  wygląd rozgrywki (zasada z `ujednolicenie-wygladu.md`: nie psuć układu TV
  i Control).

## Stan wyjściowy (pomiar 2026-10-21)

- 35 plików CSS, 18,5 tys. linii; największe: `base.css` 3380,
  `settings.css` 2582, `control.css` 2158, `base-explorer.css` 2067.
- 1511 kolorów wpisanych na sztywno, 673 użycia `var(--…)`; `:root`
  w 10 plikach (osobne palety: base, auth-landing, tv, logo, display,
  control, buzzer, host, maintenance, games).
- 193 `!important` (settings 66, base 60).
- ~25 wariantów `@media` (600/620/640/720/760/768/900/980/1100 px…).
- `z-index` bez skali (1000, 9999, 10000, 10001, 99999).
- 124 proste selektory zdefiniowane w więcej niż jednym pliku (np.
  `.a2hs*`, `.colorModal*`, `.field`, `.hint`, `.card`, `.actions`).
- Własne wersje elementów: przyciski `.btn` w 10 katalogach, okna w 11,
  pola formularzy w 12, karty/zakładki w 9.
- ~200 klas z CSS bez wystąpienia w HTML/JS (control 90, settings 37,
  game-settings 25) — pomiar przybliżony, część klas składa JS.
- Style poza CSS: 885 przypisań stylu w JS, 320 `style=` w HTML,
  13 bloków `<style>`.

## Docelowa budowa `web/shared/css/`

1. `tokens.css` — jedna paleta (tło, karty, tekst, akcent, stany),
   odstępy, promienie, cienie, czcionki, skala `z-index`; progi szerokości
   zapisane raz (telefon / tablet / komputer) i używane wszędzie.
2. `base.css` — reset, body, typografia, topbar, stopka, układ strony.
3. Komponenty, każdy w jednym pliku: przyciski, pola i formularze, okna
   (`.uni-modal`, `.overlay > .modal`), karty i wypustki, kafle, wiersze
   i sekcje udostępniania, paski akcji, wyszukiwanie/filtry, oznaczenia,
   pusty stan, dymki, wczytywanie, blokady.
4. Strony: tylko układ własny; bez kolorów na sztywno, bez `!important`,
   bez własnych progów.
5. Mechanizmy JS (modal, toast, karty `?tab=`, wyszukiwarka, puste stany,
   blokady) — strona wywołuje wspólny moduł, nie buduje własnego DOM/stylu.
   Style inline w JS tylko dla wartości naprawdę dynamicznych (pozycje,
   rysowanie logo/planszy).

## Kroki (każdy: branch → zrzuty `scripts/screens/` → e2e punktowe → `main` → kontrola)

| # | Krok | Szac. |
|---|------|-------|
| 1 | Narzędzia: stylelint (duplikaty, `!important`, kolory spoza tokenów, `@media` spoza progów) jako raport w unit; skrypt nieużywanych klas | 0,5 d |
| 2 | Usunięcie martwego CSS | 0,5–1 d |
| 3 | `tokens.css`: jedna paleta, odstępy, skala `z-index`, progi; podmiana wartości na zmienne we wszystkich plikach | 2–3 d |
| 4 | Przyciski i pola — jeden komponent, usunięcie wersji stronowych | 1–2 d |
| 5 | Okna — wszystkie przez `modal.js` i dwa wzorce okien | 1–2 d |
| 6 | Karty/wypustki, kafle, wiersze, paski akcji, oznaczenia, puste stany | 2–3 d |
| 7 | Strony po kolei: plik strony = tylko układ (kolejność: Gry/Bazy/Logo → Ankiety/Znajomi/Zadania/Connect → Konto/Ustawienia → Eksplorator → Control/host/TV) | 3–5 d |
| 8 | Style inline z JS/HTML do klas; bloki `<style>` do plików | 2–3 d |
| 9 | Reguła w lintach: nowa strona nie może łamać zasad z pkt 4 „Docelowej budowy” | 0,5 d |

Razem: ok. **13–20 dni roboczych** sesji.

## Dziennik E23

| Data | Krok | Wynik |
|------|------|-------|
| 2026-10-21 | Decyzja i plan | Pomiar stanu wyjściowego, plan kroków. |

# Podręcznik — robocza treść rozdziałów (E13)

Szkice rozdziałów według [`../podrecznik-plan.md`](../podrecznik-plan.md), pisane na podstawie
[`../podrecznik-weryfikacja.md`](../podrecznik-weryfikacja.md) (stan serwisu z 2026-10-21).
Po zakończeniu treść trafi na stronę `/manual/` (PL, potem EN/UK).

Oznaczenia w szkicach (na stronie dostaną własne style):

- `[Przycisk]` — nazwa przycisku dokładnie jak w serwisie,
- *Strona* — nazwa strony lub widoku (kursywa),
- (→ 7.3) — odnośnik do rozdziału lub podrozdziału; czytelnik widzi tytuł celu, nie numer (numery są tylko w źródle),
- `> Uwaga:` — informacja ważna dla skutków decyzji (ramka ostrzeżenia); `> Wskazówka:` — podpowiedź (ramka informacji),
- *Strona* z listy `PAGE_LINKS` w `scripts/manual/build-content.mjs` (np. *Moje gry*, *Bazy pytań*) staje się odnośnikiem do tej strony; „←” na niej wraca do miejsca w podręczniku,
- `![Podpis](zrzut:scena)` albo `![Podpis](zrzut:scena@tablet)` (`desktop` domyślnie, `phone`, `tablet`) — zrzut ekranu ze sceny `scripts/screens/scenes.cjs`; kilka takich linii pod rząd to karuzela. Pliki: `node scripts/screens/run.cjs --scenes=$(node scripts/screens/publish-manual.cjs --list) --lang=all --devices=desktop,tablet,phone && node scripts/screens/publish-manual.cjs` (→ `web/manual/img/<język>/`).

Zasady treści (decyzja 2026-10-11): bez słownictwa technicznego, te same nazwy co
w serwisie, tylko informacje, które wpływają na użytkownika.

Pliki `NN-*.md` (w kolejności nazw) to źródło strony `/manual/`: po każdej zmianie
`node scripts/manual/build-content.mjs` (zapisuje `web/manual/content/{pl,en,uk}.js`;
test jednostkowy sprawdza aktualność). Tłumaczenia: `en/`, `uk/` — te same nazwy plików.
Nagłówki: `# Część …` (część), `# 7. Tytuł` (rozdział), `## 7.3 Tytuł`, `### 16.5.1 Tytuł`.

Rozdział 18 („Najczęstsze pytania”) jest pominięty, dopóki nie pojawią się rzeczywiście
powtarzające się pytania użytkowników (plan, rozdz. 18).

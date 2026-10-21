# PROGRESS — E21 (reguły gier, transfer, naprawa danych)

**Status:** ZAKOŃCZONE (2026-10-21, 02:50 UTC).

**Plan (źródło prawdy):** [`docs/reguly-gier-transfer-plan.md`](docs/reguly-gier-transfer-plan.md) §5 „Plan prac — kolejność wdrożenia” (14 kroków).
Szczegóły i numery przebiegów: Dziennik w [`docs/wdrozenia.md`](docs/wdrozenia.md).

## Decyzje przy zakładaniu tego pliku (2026-10-20, 23:20 UTC)

- Polecenie wskazywało „[PLIK Z PLANEM]” bez nazwy — przyjęty plan bieżącego etapu E21 (powyżej), bo tylko on ma otwarte kroki z tej sesji.
- Dziennik w `docs/wdrozenia.md` zostaje (wymóg `CLAUDE.md`); ten plik to skrót stanu kroków.

## Kroki

| # | Krok | Stan |
|---|---|---|
| 1 | Odczyt danych | ✅ 403, 408, 410; odczyty bez migracji: `db-read.yml` (rola `agent_reader`, 414) |
| 2 | Silnik reguł | ✅ 404 |
| 3 | Bramki zapisu | ✅ 404 |
| 4 | Edytory gry i baz | ✅ 404 + lista warunków, podpowiedzi nad kafelkiem „+” |
| 5 | Zmień typ | ✅ 404 + karty typów, ikona, strona na telefonie, opisy według operacji, tło okien-stron |
| 6 | Base Explorer | ✅ |
| 7 | Ankiety | ✅ 405 + ikony Scal/Remis |
| 8 | Control | ✅ |
| 9 | Transfer | ✅ 406 |
| 10 | Marketplace | ✅ 404, 406 |
| 11 | Szablony demo | ✅ 409 (log 15:39 UTC), dopasowanie kopii po treści 413 |
| 12 | Nocna naprawa danych | ✅ 2026-10-21 01:30 UTC, raport `e21_repair_runs` #1: pytania gier 11 / baz 24 skrócone, bazy demo 364 pytania (mapa 298), demo preparowane 119 (476 odp. <4 pkt), ankiety demo dopełnione 140 + 141, pominięte 0, zostało 0 |
| 13 | Ograniczenia bazy | ✅ `questions_text_len` i `answers_text_chars` założone przez naprawę |
| 14 | Kontrola i zamknięcie | ✅ odczyty kontrolne (0 pytań >100, 0 odp. >17 w bazach demo, kopie demo jak szablon), e2e `39535133821` ✓ |

## Co dalej

Nic w E21. Kolejne etapy — kolejka w `docs/wdrozenia.md`.
13 otwartych ankiet demo ma <10 pełnych ankiet (6 z prawdziwymi głosami, 7 z ponownie otwartym/zatrzymanym uruchomieniem) — zmiany użytkowników, celowo bez ingerencji.

## Znane problemy

- Na telefonie teksty odpowiedzi w podliczaniu ankiety są ucinane — wcześniejszy problem układu, nie z E21 (zrzut `polls-tally-tie`).
- Środowisko GitHub `maintenance` i sekret `MAINTENANCE_TOTP_SECRET` nieużywane (przerwę włącza tylko właściciel w panelu admina) — do skasowania przez użytkownika.
- `AGENTS.md` ma regułę o mapie nawigacji, której brak w `CLAUDE.md` (różnica sprzed tej sesji).

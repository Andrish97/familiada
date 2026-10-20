# PROGRESS — E21 (reguły gier, transfer, naprawa danych)

**Status:** W TOKU — czeka na nocną naprawę danych (krok 12, `pg_cron` 01:30 UTC 2026-10-21).

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
| 12 | Nocna naprawa danych | ⏳ 407 + 409 + 411 + 413, `pg_cron` 01:30 UTC — teksty „ładnie” (granica słowa, mapa 298 dla baz demo), nieedytowane kopie demo jak obecna wersja, `rules_state` |
| 13 | Ograniczenia bazy | ⏳ zakłada naprawa (`questions_text_len`, `answers_text_chars`); 5 odpowiedzi z emotek → słowa (412), więc nic już nie blokuje |
| 14 | Kontrola i zamknięcie | ⏳ po kroku 12 |

## Co dalej

1. Po 01:30 UTC: `scripts/agent-tools/gh-run.sh db-read.yml sql_file=scripts/db-read/e21-repair-report.sql` — raport naprawy (liczby).
   Oczekiwane: `zostalo_pytan_ponad_100` = 0, `zostalo_odp_niedozwolonych` = 0, oba ograniczenia `t`; kopie demo poprawione (gry pominięte przez Control wracają kolejnej nocy).
2. Odczyty kontrolne: `e21-demo-copies-state.sql`, `e21-demo-bases-state.sql`, `e21-long-questions-cut.sql` (powinny pokazać 0 problemów).
3. E2E kontrolne na produkcji: `e2e/e21-rules.spec.js`.
4. Wpis w Dzienniku, krok 14 → ✅, status „ZAKOŃCZONE”.

## Limit wykorzystania

- Użytkownik (2026-10-20, 23:35 UTC): limit odnawia się o **4:40**. Założenie: czas polski (CEST, UTC+2) → **02:40 UTC**; zapas na wypadek UTC → 04:40 UTC.
- Wznowienia w sesji (ten sam prompt: przeczytać PROGRESS.md, git status, kroki 12–14):
  - **02:45 UTC** (`trig_01Y1whFtYtheRkLCKbiDP71E`, 5 min po resecie wg czasu polskiego; wcześniej 02:15 — przesunięte, żeby nie trafić w limit),
  - **04:45 UTC** (`trig_015iSh7JMLcEy7z32FsEm4wK`, zapas; przy statusie „ZAKOŃCZONE” tylko krótka informacja).
- Naprawa danych idzie sama w bazie (`pg_cron` 01:30 UTC) — limit agenta jej nie dotyczy.

## Znane problemy

- Na telefonie teksty odpowiedzi w podliczaniu ankiety są ucinane — wcześniejszy problem układu, nie z E21 (zrzut `polls-tally-tie`).
- Środowisko GitHub `maintenance` i sekret `MAINTENANCE_TOTP_SECRET` nieużywane (przerwę włącza tylko właściciel w panelu admina) — do skasowania przez użytkownika.
- `AGENTS.md` ma regułę o mapie nawigacji, której brak w `CLAUDE.md` (różnica sprzed tej sesji).

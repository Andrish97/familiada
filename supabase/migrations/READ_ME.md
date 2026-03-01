# DB migrations (Familiada)

## Zasady
- Migracje są **forward-only**.
- **Nigdy** nie edytuj już zastosowanej migracji (pipeline sprawdza checksum i przerwie).
- Każdy plik: `YYYY-MM-DD_NNN_opis.sql` i jest wykonywany alfabetycznie.

## Co jest w repo
- `supabase/migrations/` — pliki migracji
- `supabase/schema.sql` — snapshot schematu po ostatniej udanej migracji
- `supabase/migration_logs/latest.log` — ostatni log z migracji

## Jak to działa
Push na `main` z nową migracją:
1) GitHub Actions wysyła `supabase/migrations/` na serwer (staging).
2) Serwer uruchamia skrypt `apply-migrations.sh`:
   - wykrywa nowe migracje,
   - aplikuje je transakcyjnie,
   - loguje sukces/błąd,
   - aktualizuje `schema.sql`.
3) Workflow pobiera `schema.sql` i logi i commit/push do repo.

## Baseline
Pierwsza migracja `*_baseline.sql` jest generowana z aktualnej bazy.
Na istniejącej (już wypełnionej) bazie baseline jest **bootstrappowany**
(oznaczany jako zastosowany bez wykonywania), żeby nie próbować tworzyć
obiektów które już istnieją.
Na czystej bazie baseline wykonuje się normalnie.
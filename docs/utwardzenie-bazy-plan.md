# Utwardzenie bazy — ostrzeżenia Supabase (2026-10-24)

Źródło: eksport „Performance & Security Lints” ze Studio (nowy serwer, po
przeprowadzce). Żadne ostrzeżenie nie wynika z przeprowadzki — to stan
bazy sprzed niej (uprawnienia po odtworzeniu wyrównane `acl-sync`).

| Ostrzeżenie | Liczba | Decyzja |
|---|---|---|
| `pg_graphql_anon/authenticated_table_exposed` | 46 + 47 | GraphQL nieużywany (strona i Worker tylko PostgREST/RPC) → `drop extension pg_graphql` (Supabase zostawia zaślepkę `graphql_public.graphql`). Migracja 480. |
| `function_search_path_mutable` | 60 | Stała ścieżka `public, extensions, pg_temp` (wcześniej ścieżka wywołującego; m.in. `game_state_write` i inne SECURITY DEFINER — realne ryzyko podmiany obiektów). Migracja 480. |
| `public_bucket_allows_listing` | 1 | `homepage-screenshots`: polityka SELECT pozwala listować; obecny kod bucketu nie czyta (publiczne adresy działają bez polityki) → usunięta. Migracja 480. |
| `anon/authenticated_security_definer_function_executable` | 125 + 201 | Prawie wszystkie to RPC strony (nazwy także składane dynamicznie, np. `friends_${kind}`), z własnym sprawdzeniem `auth.uid()` — zostają świadomie. Odebrane tylko tam, gdzie wywołanie z API nie ma sensu: funkcje wyzwalaczy (wyzwalacz nie sprawdza EXECUTE) i wewnętrzne `_storage_cleanup_*`, `_game_control_active`, `_resource_copy_mail_epoch`. Migracja 481. |
| `rls_enabled_no_policy` (INFO) | 47 | Zamierzone: tabele tylko przez RPC/klucz serwisowy. Bez zmian. |
| `extension_in_public` | 2 | `pg_trgm`, `vector` w `public` — przeniesienie ryzykowne (indeksy, typy kolumn), zysk mały. Bez zmian. |

## Decyzje

- 2026-10-24: właściciel — „działajmy” (utwardzenie jako osobny etap po P7).
- Zasada: odbieramy uprawnienia tylko tam, gdzie jest pewność z katalogu bazy
  (typ zwracany `trigger`) albo z kodu; RPC strony bez zmian.

## Dziennik

- 2026-10-24 01:20 UTC: 480 i 481 zastosowane na produkcji (log: search_path 60 funkcji, wyzwalacze bez EXECUTE: 67). Aktywność przed wdrożeniem: 0. Lokalnie: `tests/sql/db-hardening-480-481.sql` OK. Pierwsze testy kontrolne (40049395970, 40049398079) czerwone: dodanie pytania „permission denied for function _game_control_active” — wyzwalacz `guard_game_content` jest SECURITY INVOKER (błędnie odczytany jako DEFINER). Poprawka 482 (01:30 UTC, przywrócony EXECUTE) — test SQL rozszerzony o wstawienie pytania. Po 482: blokady/bezpieczeństwo/ankiety/kopie (40050120863) i Control (40050123444) — **zielone**.

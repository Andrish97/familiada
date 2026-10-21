# Audyt bezpieczeństwa E24 (2026-10-21)

Zakres: baza (tabele/RLS, funkcje SECURITY DEFINER, widoki, Storage),
Worker Cloudflare, funkcje Edge, sekrety w repo, wybrane XSS we froncie.
Odczyty produkcji wyłącznie przez `db-read.yml` (same liczby/bool), pliki
zapytań w `scripts/db-read/` (`table-acl-audit`, `definer-acl-audit` +
`.names`, `storage-policy-audit`, `storage-open-policies`).

Skala ważności: **KRYTYCZNE** (dane/operacje dowolnych kont bez logowania),
**WYSOKIE** (wyciek danych osobowych, nadużycia), **ŚREDNIE**, **NISKIE**.

## Wyniki — baza

| # | Ważność | Problem (stan produkcji przed poprawką) | Poprawka | Stan |
|---|---|---|---|---|
| B1 | KRYTYCZNE | `example_table`, `konta_do_stworzenia` (kolumna z hasłami), `schema_migrations`, `stats_excluded_users` — bez RLS, pełne SELECT/INSERT/UPDATE/DELETE dla anon i authenticated | 446: RLS, odebrane prawa, tylko service_role | wdrożone 17:41 |
| B2 | KRYTYCZNE | `email_providers` (konfiguracja i limity dostawców poczty), `public_kv`, `marketing_cities`, `marketing_raw_contacts` (e-maile z wyszukiwania), `marketing_search_queries_log` — polityki `USING (true)` dla wszystkich, pełne prawa anon | 446 | wdrożone 17:41 |
| B3 | KRYTYCZNE | `marketing_verified_contacts` (e-maile kontaktów), `marketing_search_logs`, `marketing_ai_providers` — j.w.; panel admina czytał je wprost kluczem publicznym | Panel → Worker `/_admin_api/marketing/*`; 447 zamyka tabele | czeka na wdrożenie |
| B4 | KRYTYCZNE | 25 funkcji SECURITY DEFINER bez sprawdzania użytkownika wykonywalnych przez anon, m.in. `delete_user_everything(uuid)` (usunięcie danych dowolnego konta), `auth_clear_email_change`, `storage_list_objects` (lista plików dowolnego bucketu), `mail_cron_set`, `reset_email_limits`, `save_attachment`, `seed_demo_for_user`, kolejka leadów i limity AI | 448: tylko service_role; e2e resetuje limity przez `/_e2e_api/mail-limits/reset` | czeka na wdrożenie |
| B5 | ŚREDNIE | Storage: ręczne polityki dla authenticated bez warunku na bucket (INSERT/UPDATE/DELETE własnych plików w dowolnym buckecie, w tym publicznym `homepage-screenshots`) oraz zakładanie bucketów przez zalogowanych | 449: usunięte; zostają polityki per bucket | czeka na wdrożenie |
| B6 | NISKIE | Widok `stats_exclusions_effective` (prawa właściciela, omija RLS) dostępny dla anon — lista UUID wykluczonych kont | 446: tylko service_role | wdrożone |
| B7 | WYSOKIE | `profile_login_to_email(login)` (anon): każdy pozna e-mail dowolnej nazwy użytkownika. Potrzebne do logowania nazwą (Supabase loguje e-mailem) i do udostępniania baz po nazwie | Do decyzji: logowanie nazwą przez Worker (zwraca sesję, nie e-mail) + udostępnianie po nazwie bez ujawniania e-maila | otwarte |
| B8 | ŚREDNIE | `email_get_status`, `get_email_intent_status`, `email_resend_prepare` (anon): sprawdzenie, czy e-mail ma konto (enumeracja kont) | Do decyzji (część przepływu rejestracji) | otwarte |
| B9 | NISKIE | `user-logos`: publiczny SELECT obejmuje listowanie — widać foldery (UUID kont) i nazwy plików logo | Do rozważenia: SELECT tylko właściciel (obraz idzie publicznym URL-em) — wymaga testu wgrywania/usuwania | otwarte |

Sprawdzone bez uwag: pozostałe tabele `public` mają RLS (po 446 żadna tabela
bez RLS nie ma praw anon/authenticated); widok `game_sessions_effective`
ma `security_invoker`; polityki „wszystko” w Storage dotyczą tylko
service_role; funkcje panelu admina — 443/444; publiczne odczyty
profili/kodów urządzeń/ocen/kolejki — 445.

Pozostałe funkcje SECURITY DEFINER wykonywalne przez anon (ok. 70) są wołane
z przeglądarki zgodnie z projektem (głosowanie, wyświetlacz, urządzenia,
ankiety po tokenie, cooldowny) albo w politykach RLS (`base_can_*`,
`can_edit_locked_resource`, `control_device_realtime_claim_valid`) lub
z wyzwalaczy SECURITY INVOKER (`gen_share_key`, `_game_control_active`).

## Wyniki — Worker, funkcje Edge, sekrety, XSS

(uzupełniane)

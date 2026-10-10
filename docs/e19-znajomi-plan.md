# E19 — Znajomi, Subskrybenci, Zadania: plan techniczny

Decyzje: [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md), sekcje od
„Udostępnianie — wiersze, role, sekcje wg stanu (E19)” do końca. Zasady pracy:
[`wdrozenia.md`](wdrozenia.md). Nowe migracje od **320**.

Rozbieżność do poprawy: `usuwanie-danych.md` (tabela „dziś”, wiersz 43) mówi,
że subskrypcje po e-mailu zostają po usunięciu konta — decyzja 2026-10-07
i E19 oraz obecny `delete_user_everything` je usuwają (tabela opisuje stan
sprzed E12).

## 1. Model danych

- **`friendships`** (320): `id`, `requester_id`, `addressee_id` (FK `profiles`,
  ON DELETE CASCADE), `status` ∈ `pending|active`, `token` (link `go?f=`),
  `created_at`, `accepted_at`, `email_sent_at`, `email_send_count`. CHECK
  różne osoby; unikalna para nieuporządkowana (`least/greatest`). Odrzucenie,
  cofnięcie, usunięcie = DELETE; blokada ponownego zaproszenia w
  `mail_cooldowns` (`friend:invite_after_reject`). RLS ENABLE+FORCE, SELECT
  tylko strony relacji, zapis wyłącznie przez RPC SECURITY DEFINER.
  `are_friends(a,b)`. Polityki maili `friend:invite`, `friend:resend`.
- **`poll_subscriptions`** zostaje tylko dla e-maili (wiersze z
  `subscriber_user_id` nie są już tworzone ani czytane; kolumna znika w E14).
  `poll_claim_email_records` przestaje przepinać subskrypcje na konto
  (przepinanie `poll_tasks` zostaje).
- **Migracja danych** (320 i powtórka w 321, idempotentna): aktywne
  i oczekujące subskrypcje kont → `friendships` (ten sam `token`, więc stare
  maile `go?s=` działają przez `poll_go_resolve` rozszerzone o `friendships`).
  Stare wiersze kasuje E14.
- **Subskrybent zakłada konto**: `friend_invites_from_subscriptions()` (przy
  logowaniu / listach) tworzy zaproszenie do znajomych od właściciela;
  subskrypcja zostaje.
- **Urządzenia bez konta**: `shared_devices.recipient_email` (+ `recipient_id`
  nullable, CHECK jedno z dwóch, unikalny indeks po e-mailu). E-mail konta →
  zapis po `recipient_id`.
- **Usunięcie konta**: `delete_user_everything` dodatkowo usuwa `friendships`
  (obie strony), `shared_devices` po `recipient_id` i `recipient_email`.
  Definicja na bazie wersji z `schema.sql` po 319.

## 2. RPC

| Obszar | Nowe | Zmienione | Do E14 (usunięcie) |
|---|---|---|---|
| Znajomi | `friends_invite(handle)`, `friends_list()`, `friends_accept/reject/cancel/remove/resend(id)`, `friends_token_info(token)` | — | `polls_hub_list_my_subscriptions`, `polls_hub_subscription_accept/_reject/_cancel/_invite/_invite_a`, `poll_sub_accept` |
| Subskrybenci | `subscribers_invite(email)` (konto → `has_account`), `subscribers_list()` (+`friend_user_id`) | `poll_claim_email_records`, `poll_go_resolve` | kolumna `subscriber_user_id`, CHECK, indeks |
| Ankieta | `poll_share_send(game, friend_ids[], subscriber_ids[])` | — | `polls_hub_share_poll` |
| Bazy | — | `base_share_by_user` wyszukuje konto (znajomość nie jest wymagana); linki `go?b=` zamiast `/bases?share=` | `bases_count_incoming_share_invites` (jeśli zbędne) |
| Urządzenia | `device_share_create(user|email, …)`, `device_shares_list_mine()`, `device_share_revoke(id)` | `e2e_shared_devices_cleanup` | `share_device`, `unshare_device`, `list_my_device_shares` |
| Zadania | `tasks_list()` (ankiety, bazy do akceptacji, aktywne urządzenia), `badges_get()` | `site_activity_ping` (+friends/subscribers/tasks) | `polls_badge_get`, `polls_hub_overview`, `polls_hub_list_tasks` |
| Testy | `e2e_friendships_cleanup` | `294_e2e_cleanup_mail_cooldowns` (+`friend:*`) | — |

## 3. Strony

- `PAGES`: `friends`, `subscribers`, `tasks` (access `user`, parent `games`);
  `subscriptions` usunięte (z `from`, przycisków, `manual.tabs`). Lista gier:
  `btnFriends`, `btnSubscribers`, `btnTasks` + plakietki. `PAGE_ROUTES` w
  Workerze. Katalog `web/subscriptions/` usunięty.
- `/friends/`: Zaproszenia do mnie · Wysłane · Znajomi, „+ Zaproś” (konto).
- `/subscribers/`: Oczekujące · Aktywni, „+ Zaproś” (e-mail).
- `/tasks/`: Do zrobienia · Zrobione (zwinięte), filtr rodzaju.
- `/go/`: `?t=` → `/tasks/`, nowe `?b=` (baza) i `?f=` (znajomi), `?s=` tylko
  subskrybenci e-mail.
- Wspólny komponent: `share-sections.js` — sekcje jako parametr, wiersz z
  inicjałem, szarą linijką i kanałem (`friend|subscriber|mail`), akcje w
  wierszu (tekst / ikona), usuwanie ikoną; `renderShareSources` (mail/nazwa +
  znajomi [+ subskrybenci w ankiecie]). Jeden moduł maili zaproszeń
  (`invite-mail.js`), bez trzeciej kopii szablonu.

## 4. Kroki (każdy: branch → unit → e2e → `main` → e2e)

1. Migracja 320 (dodająca, od razu na `main`): tabela, RLS, RPC nowe, kopia danych.
2. Komponent wierszy + `/tasks/` (stare `/subscriptions/` działa dalej).
3. `/friends/`, `/subscribers/` + migracja 321 (przełączenie) razem z kodem;
   usunięcie `/subscriptions/`, `/go/`, `delete_user_everything`.
4. Ankieta (`poll_share_send`).
5. Bazy (migracja 322: `base_share_by_user` + `go?b=`), akceptacja w `/tasks/`.
6. Urządzenia (`shareDevice.js`: znajomi + dowolny e-mail).
7. Przegląd wzorców, zrzuty, `wzorce-ui.md`.

Ryzyka: okno 320→321 (powtórka kopii); dwa źródła tokenu `go?s=`; cofnięcie
udostępnienia urządzenia na e-mail nie unieważnia linku (klucz gry); duplikaty
znajomy+subskrybent; stare linki `/bases?share=` martwe po kroku 5 (≤ 5 dni).

Specy: przepisanie `subscriptions.spec.js` na `friends.spec.js` /
`subscribers.spec.js`, nowe `tasks.spec.js`, zmiany `go`, `bases`, `control2`
(urządzenia), `frontend-navigation`, `account-deletion`. Konta tylko z puli —
pula test1–test8; test9/test10 zarezerwowane.

## 5. Stan kroków (2026-10-10)

| Krok | Stan |
|---|---|
| 1. Migracja 320 (`friendships`, `friends_*`, `tasks_list`, `badges_get`, kopia subskrypcji kont) | **zrobione** — na produkcji (`d38e829`), test SQL `docs/sql/test-friendships-320.sql` 60/60 |
| 2. Komponent wierszy (`renderRowSections`/`rowEl` w `share-sections.js`) + `/tasks/` | **zrobione** — e2e `tasks`, `frontend-navigation`, `go` zielone |
| 3. `/friends/`, `/subscribers/` + migracja 321 (przełączenie), usunięcie `/subscriptions/` | **w toku** — branch `codex/e19-3`; migracja 321 i front przygotowane, wymagane SQL/unit na runnerze, wdrożenie razem i kontrola produkcji |
| 4. Ankieta: udostępnianie oknem (Znajomi · Subskrybenci), jedna lista odbiorców | do zrobienia |
| 5. Bazy: jedno okno (udostępnieni + dodawanie), `go?b=`, akceptacja w `/tasks/` | do zrobienia |
| 6. Urządzenia: jedno okno, klucz na udostępnienie z sesją rozgrywki, odbiorca bez konta | do zrobienia (dotyka Control — obszar drugiej sesji, ostrożnie) |
| 7. Przegląd wzorców | do zrobienia |

## 6. Decyzje użytkownika (wszystkie, stan na 2026-10-10)

Model (z `ujednolicenie-wygladu.md`, E19):
- **Trzy osobne strony**: `/friends/` (Znajomi — konta, dwustronnie),
  `/subscribers/` (Subskrybenci — tylko e-mail bez konta, jednostronnie, tylko
  ankiety), `/tasks/` (Zadania — co mi przysłano). `/subscriptions/` znika
  (bez aliasu; linki z maili przez `/go/`).
- **Kanały**: ankiety → znajomi + subskrybenci; bazy → zawsze **konto**
  (e-mail/nazwa tylko do wyszukania konta; znajomi = skrót, znajomość nie
  jest wymagana); urządzenia → e-mail/nazwa, **konto niekonieczne** (bez
  konta — tylko mail; z kontem — widać w Zadaniach i „Podłącz urządzenie”);
  znajomi = skrót.
- **Zadanie dla konta = zawsze mail**, globalnie wyłączalny
  (`user_flags.email_notifications`).
- **Usunięcie konta**: znajomości (obie strony), zaproszenia, wpisy
  subskrybenta na jego e-mail, udostępnienia baz/urządzeń, zadania — usunięte;
  u znajomych osoba znika bez maila; nowe konto na ten sam e-mail nie
  odzyskuje niczego.

Odpowiedzi na pytania planu:
1. Subskrybent zakłada konto → zaproszenie do znajomych tylko na `/friends/` +
   plakietka, **bez maila**.
2. Pomyłka strony → komunikat: „Do tego maila jest przypisane konto w systemie
   Familiada — możesz zaprosić tę osobę do znajomych. Przejdź →” (i odwrotnie:
   „…możesz dodać ją jako subskrybenta. Przejdź →”). Bez automatycznego
   przełączania.
3. Usunięcie znajomego → kasuje oczekujące zaproszenia/zadania pary; przyjęte
   bazy i urządzenia **zostają**; okno potwierdzenia o tym mówi (można je
   cofnąć osobno).
4. Link urządzenia → **osobny klucz na udostępnienie, przypięty do sesji
   rozgrywki** (`game_sessions`), wygasa sam po jej zakończeniu, najpóźniej
   **ostatnia aktywność rozgrywki + 1 h, potem wygasa automatycznie**
   (potwierdzone 2026-10-10). Otwarty wygasły link: „Zaproszenie wygasło —
   poproś o nowy link”; w Zadaniach i na liście urządzeń wygasłe **nie są
   widoczne**. **Link do skopiowania z panelu Control działa tak samo.**
5. Plakietka Zadań → ankiety + bazy do zaakceptowania (urządzenia mają własną
   plakietkę na „Podłącz urządzenie” — nie dublujemy).
6. Mail z urządzeniem do osoby bez konta → tak, z limitem i linkiem wypisania.
7. Baza zawsze na konto (patrz wyżej).
8. Subskrybent, który przyjmie zaproszenie do znajomych → **znika z listy
   subskrybentów**, zostaje znajomym (ankiety dostaje jako znajomy).
9. „Podłącz” w Zadaniach → `/connect/?share=<id>` z wybranym udostępnieniem.
10. Filtr rodzaju w Zadaniach w adresie (`?kind=`), lista rozwijana `ui-select`.

Wygląd i układ:
- Wiersze zamiast kafli, akcje w wierszu (komputer: tekst, telefon: ikona;
  usuwanie ikoną), jedna kolumna ok. 760 px.
- **Zadania**: bazy tylko do zaakceptowania (po akceptacji/odrzuceniu
  znikają), urządzenia tylko aktywne, „Zrobione” tylko ankiety.
- **Listy już udostępnionych** (bazy, urządzenia, ankieta): **jedna lista**,
  bez podziału na sekcje wg kanału; na wierszu oznaczenie znajomy /
  subskrybent.
- **Ankieta**: udostępnieni widoczni na stronie ankiety (panel), **dodawanie
  w oknie** z dwiema listami (Znajomi · Subskrybenci), w jedną stronę (tylko
  dodaje), już wybrani nie pokazują się w oknie.
- **Bazy i urządzenia**: **jedno okno** — w nim lista już udostępnionych
  i dodawanie (pole mail/nazwa + znajomi).

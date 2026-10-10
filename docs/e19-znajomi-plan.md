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
| Bazy | — | `base_share_by_user` wymaga znajomości (`not_friend`); linki `go?b=` zamiast `/bases?share=` | `bases_count_incoming_share_invites` (jeśli zbędne) |
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
test4/5/9/10 zarezerwowane.

## 5. Pytania (czekają na decyzję)

Lista w rozmowie 2026-10-09; odpowiedzi zapisywać tutaj, w „Decyzje”.

## Decyzje (2026-10-10)

1. **Subskrybent zakłada konto** → zaproszenie do znajomych tylko na
   `/friends/` + plakietka, **bez maila**.
2. **Pomyłka strony**: komunikat, np. „Do tego maila jest przypisane konto
   w systemie Familiada — możesz zaprosić tę osobę do znajomych. Przejdź →”
   (link do `/friends/`); odwrotnie na `/friends/` dla e-maila bez konta →
   „…możesz dodać ją jako subskrybenta. Przejdź →”. Bez automatycznego
   przełączania.
3. **Usunięcie znajomego**: kasuje oczekujące zaproszenia i zadania między
   parą; przyjęte bazy i urządzenia zostają (udostępnia się je głównie
   mailem). Okno potwierdzenia usunięcia **mówi o tym** i że można je cofnąć
   osobno.
4. **Link urządzenia**: osobny klucz na udostępnienie, **wygasa sam** —
   po zakończeniu sesji rozgrywki (`game_sessions`), najpóźniej np. po
   godzinie bezczynności. Urządzenia są „tu i teraz”. Po wygaśnięciu
   komunikat „Zaproszenie wygasło — poproś o nowy link”.
5. **Link musi nieść sesję rozgrywki**, nie tylko grę; po wygaśnięciu prośba
   o nowy link. **Link do skopiowania z panelu Control działa tak samo.**
6. **Mail z urządzeniem do osoby bez konta** — tak (limit + wypisanie).
   **Plakietka Zadań**: urządzenia mogą się liczyć, chyba że dublowałoby to
   plakietkę na przycisku urządzeń — wtedy nie (interpretacja: liczymy
   ankiety i bazy; urządzenia mają własną plakietkę na „Podłącz urządzenie”).
7. **Baza zawsze na konto**; e-mail służy tylko do wyszukania konta. Wybór ze
   znajomych to skrót, serwer nie wymaga znajomości. **Zadanie dla konta =
   zawsze powiadomienie mailem**, z globalnym wyłączeniem
   (`user_flags.email_notifications`).
8. **Subskrybent, który przyjmie zaproszenie do znajomych** — „lepiej nie”
   zostawiać: wpis subskrybenta **znika** (staje się znajomym; subskrybenci
   to tylko osoby bez konta). Do potwierdzenia przy kroku 3.
9. „Podłącz” w Zadaniach → `/connect/` z wybranym udostępnieniem. Tak.
10. Filtr rodzaju w Zadaniach w adresie (`?kind=`). Filtry to listy
    rozwijane **`ui-select`** (wspólne `list-search.js` już ich używa).

# Konta testowe — tory, skrzynki bez konta, zasady (E25)

Cel: więcej kont testowych i jasny podział, żeby kilka agentów mogło
puszczać e2e naraz bez czekania na siebie. Zasady obowiązujące **dziś**
i docelowe (po E25) opisuje `tests/README.md`, sekcja „Konta testowe”.
Ten dokument: decyzje, stan obecny, schemat docelowy, kroki wdrożenia.

## Decyzje

| Data | Decyzja |
|---|---|
| 2026-10-22 | Zwiększyć pulę kont i podzielić ją tak, żeby różne agenty nie czekały na siebie (użytkownik). |
| 2026-10-22 | Przerobić dokument o testach: warunki przypisywania i używania kont testowych (użytkownik). |
| 2026-10-22 | Skrzynki bez konta dostają **inny identyfikator** niż `testN` (użytkownik): `bezkontaN` (adres `e2e+bezkontaN@familiada.online`, patrz decyzja o poczcie niżej). Liczba w adresie = numer toru. `testN` zawsze oznacza konto, `bezkontaN` — samą skrzynkę. |
| 2026-10-22 | Podział na **tory** (komplet rozłącznych kont + własna skrzynka bez konta). Na start 4 tory, w tym obecny (propozycja agenta przyjęta do planu). |

| 2026-10-22 | **Poczta bez dopisywania reguł** (użytkownik: „jak nie dodawać za każdym razem maili w Cloudflare”; mechanizm zaproponowany przez agenta): jedna reguła Cloudflare `e2e@familiada.online` → Worker `familiada` + włączony *Subaddressing*; wszystkie nowe skrzynki testowe to `e2e+<id>@familiada.online`. Szczegóły: „Poczta testowa — jedna reguła”. |

**Do potwierdzenia przez użytkownika:** liczba torów (w planie 4);
konta specjalne (hasło, profil, usuwanie) na razie tylko w torze 1.

## Poczta testowa — jedna reguła

**Ustawienie jednorazowe (użytkownik, panel Cloudflare):**
1. Email Routing → Settings → **Subaddressing: włączone**.
2. Routing rules → Custom address `e2e@familiada.online` → akcja
   *Send to a Worker* → `familiada`.

Od tej chwili każdy adres `e2e+<cokolwiek>@familiada.online` trafia do
Workera tą jedną regułą (Cloudflare dopasowuje `user+detail@` do reguły
`user@`, część `+detail` zostaje w `message.to`). Nowy tor, nowa skrzynka
bez konta, nowe konto specjalne — **bez zmian w Cloudflare**.

**Adresy:**
- konto toru: e-mail `e2e+t{L}{k}@familiada.online`, nazwa użytkownika
  `test{L}{k}` (np. `e2e+t23@…` / `test23`). Spece logują się **nazwą
  użytkownika** (logowanie przyjmuje nazwę zamiast e-maila), a adres
  służy tylko do poczty;
- skrzynka bez konta: `e2e+bezkonta{L}@familiada.online` — inny
  identyfikator, z samego adresu widać, że konta nie ma;
- istniejące test1–test17 zostają przy swoich regułach (bez przenoszenia
  kont); `bezkonta1` (tor 1) to już `e2e+bezkonta1@…`, więc test14
  i jego reguła odchodzą po przejściu.

**Worker:** adres testowy = obecne `testN@` **albo**
`^e2e\+(t[2-9][1-8]|bezkonta[1-9])@familiada\.online$` → zapis do
`e2e_emails` (nigdy do skrzynki admina, Telegrama ani przekierowania).
Inna część po `+` → odrzucenie (`message.setReject`), żeby spam na
`e2e+losowe@` nie zaśmiecał niczego. Gdyby `message.to` przyszło bez
`+detail` (starsza wersja dokumentacji Cloudflare tak to opisywała),
Worker czyta adresata z nagłówka `To` — rozstrzyga to jeden mail
kontrolny po włączeniu (krok 4).

**Sprawdzone w kodzie:** `_norm_email` = `lower(btrim)` (plus nie jest
wycinany, adresy się nie zlewają); walidacja e-maila w `auth.js` tylko
wymaga `@`; wyjątek statystyk i rezerwacja nazw działają po nazwie
`test[0-9]+` — dla nowych adresów `e2e+…` wyjątek statystyk trzeba dopisać
(funkcja `e2e_test_address`).

**Dlaczego nie catch-all:** dziś każdy mail spoza adresów testowych idzie
do skrzynki admina, na przekierowanie i do Telegrama. Catch-all na Worker
wpuściłby tam spam na dowolne adresy domeny albo wymagał listy
prawdziwych adresów do odrzucania — zmiana produkcyjnej poczty. Reguła
`e2e@` jest dodająca i odizolowana.

## Stan obecny (2026-10-22) — dlaczego agenty czekają

1. Spece mają konta wpisane na stałe: `testAccountUsername(1)` (m.in.
   base-explorer, games, bases, editor, mobile-sheet-modals), domyślne
   `loginAsTestUser` = test1 (editor, game-settings, cross-resource-locks,
   polls, privacy-manual), test7/test8 (friends, poll-share, subscribers,
   control2, recipient-account-cascade). Wejście `test_accounts` zmienia
   wyłącznie konta z puli — tych speców nie rozdziela.
2. Pula bez `test_accounts` zaczyna od test1, więc spece z puli trafiają
   na to samo konto co spece z test1 na stałe.
3. Jedna skrzynka bez konta (`test14`) dla ok. 9 speców; `clearMailbox`
   czyści ją całą.
4. Zakresy adresów rozsiane i niespójne:
   - Worker `e2e-api.js`: `E2E_EMAIL_RE = test([1-9]|1[0-5]|17)`,
     `mail-trigger` odrzuca test9/test10, test14 na stałe w kilku
     endpointach;
   - `e2e_emails` CHECK: `test([1-9]|1[0-5])` (brak test17, choć Worker go
     przyjmuje — do sprawdzenia, czy zapis poczty test17 się udaje);
   - funkcje SQL z własnymi zakresami: `e2e_friendships_cleanup`,
     `e2e_poll_mail_budget_cleanup`, `e2e_poll_subscriptions_cleanup`,
     `e2e_registered_subscriber_fixture` (test1–7 → test8),
     `e2e_shared_devices_cleanup`, `e2e_subscriber_email_cleanup`
     (test14/test15), `e2e_subscriber_mail_flag` (test14), trigger
     `mail_queue_cooldown_guard` (`test([1-9]|1[0-3])`);
   - `login.js`: `TEST_ACCOUNT_NUMBERS` tylko 1–10.
5. `e2e-seq.sh` czeka, aż na GitHubie nie biegnie **żaden** przebieg e2e.

Działa już ogólnie (`test[0-9]+`): automatyczny wyjątek statystyk
(`stats_exclusions_effective`), rezerwacja nazw (`profiles_reserve_test_username`),
`e2e_storage_cleanup_peek`, `e2e_marketplace_cleanup` (tylko zasoby wołającego).

## Schemat docelowy

### Tory

| Tor | Konta (sloty 1–8) | Skrzynka bez konta | Konta specjalne |
|---|---|---|---|
| 1 | test1–test8 (obecne adresy `testN@`) | `e2e+bezkonta1@` (zastępuje test14) | test11, test12+13, test15, test17 |
| 2 | test21–test28 (`e2e+t21@`…`e2e+t28@`) | `e2e+bezkonta2@` | — |
| 3 | test31–test38 (`e2e+t31@`…) | `e2e+bezkonta3@` | — |
| 4 | test41–test48 (`e2e+t41@`…) | `e2e+bezkonta4@` | — |

Slot `k` toru `L`: nazwa użytkownika tor 1 → `test{k}`, tor ≥ 2 →
`test{L}{k}`; e-mail tor 1 → `test{k}@`, tor ≥ 2 → `e2e+t{L}{k}@`.
Numery test9, test10, test14, test16, test18–20, test29–30, test39–40,
test49–50 **nie są przydzielane** (test9/test10: rezerwa bez skrzynki
do ręcznych przebiegów; test14 wycofany po przejściu na `bezkonta1`).

### Role slotów (takie same w każdym torze)

| Slot | Rola | Skrzynka |
|---|---|---|
| 1 | konto główne (domyślne `loginAsTestUser`), operator Control | nie |
| 2 | drugi użytkownik: właściciel/edytor przy udostępnieniu | nie |
| 3 | trzeci użytkownik: odbiorca udostępnienia (zadania, logo) | nie |
| 4, 5 | wolne — workery puli (`loginAsPooledTestUser`) | nie |
| 6 | edytor logo (pula logo), użytkownik bez maili | nie |
| 7 | zalogowany odbiorca z pocztą (bazy, udostępnianie urządzenia, subskrypcje) | tak |
| 8 | zaproszony / odbiorca maili (subskrypcje, znajomi, poll-share) | tak |
| bez konta | odbiorca bez konta (subskrybent tylko e-mail, urządzenie na e-mail) | tak |

### Jedno źródło listy adresów

- JS: `tests/e2e/helpers/test-accounts.js` — tory, sloty, role,
  `laneAccount(slot)`, `laneNoAccountEmail()`, `specialAccount(name)`;
  bieżący tor z `TEST_LANE`. `testAccountUsername(n)` = slot `n`
  bieżącego toru (spece z `testAccountUsername` działają w każdym torze
  bez zmian).
- SQL: `public.e2e_test_address(p_email) → (lane, slot, kind)` (kind:
  `account` / `no_account` / `special`); wszystkie funkcje `e2e_*`
  i `mail_queue_cooldown_guard` korzystają z niej zamiast własnych
  wyrażeń; odbiorca „slot 8 / bez konta” wyliczany z toru wołającego.
  CHECK `e2e_emails` = adres ze skrzynką według tej funkcji.
- Worker: jedna stała z listą (generowana z pliku JS albo kopia
  pilnowana testem unit, jak `notification-mail-texts.js`).
- Blokada: trigger odrzuca założenie konta na `e2e+bezkonta*@familiada.online`.

### Przebiegi

- Workflow `e2e-tests.yml`: wejście `lane` (1–4), `run-name` z torem
  (`e2e tor N …`), `TEST_LANE` w środowisku. `test_accounts` zostaje
  tylko do podziału puli wewnątrz toru.
- `e2e-seq.sh`: wybiera wolny tor (przebiegi w toku po `run-name`),
  czeka tylko gdy wszystkie zajęte. Nie używać `concurrency` GitHuba do
  kolejki (jeden oczekujący na grupę; nowszy anuluje starszy).
- Spece z kontami specjalnymi: tag `@specjalne`, tylko tor 1 (helper
  rzuca błąd w innym torze).
- Wspólne mimo torów: serwer bazy (ciężkie spece — control2,
  wyświetlacz — jeden naraz globalnie), limity dostawcy poczty
  (`resetMailProviderLimits` globalny; `@mailbox` najwyżej 2 tory naraz),
  łącznie najwyżej 3 przebiegi naraz na start.

## Kroki wdrożenia (E25)

1. **Pomocnik JS** `test-accounts.js` + przepięcie speców z adresami na
   stałe (`test14@`, `test8@`, `test1@`, `test9@`, `LOGO_E2E_ACCOUNTS`,
   `mailbox.js`) na role toru; tor 1 = dzisiejsze adresy, więc bez zmian
   zachowania. Unit + punktowe e2e w torze 1.
2. **Migracja dodająca**: `e2e_test_address`, nowe adresy w CHECK
   `e2e_emails` (stare zostają), trigger blokujący konta `bezkonta*`.
   Lokalny Postgres + test SQL → `main` → log.
3. **Worker**: rozpoznawanie `e2e+<id>@` (odrzucenie nieznanych `id`), lista adresów z jednego źródła, endpoint `restore` zakłada
   konta torów (potwierdzony adres, `TEST_PASSWORD`, stałe ID), endpointy
   z test14 → skrzynka bez konta toru.
4. **Cloudflare Email Routing** (użytkownik, jeden raz): Subaddressing
   + reguła `e2e@` → Worker. Jeden mail kontrolny na `e2e+bezkonta2@`
   (czy `message.to` zawiera `+detail`). Później żadnych reguł.
5. **Migracja zmieniająca** funkcje `e2e_*` na `e2e_test_address` (razem
   z kodem; test lokalny, wdrożenie razem, od razu testy kontrolne).
6. **Założenie kont** torów 2–4 przez Worker; logowanie każdego konta.
7. **Workflow + `e2e-seq.sh`**: wejście `lane`, wybór wolnego toru.
8. **Przejście tor 1 z test14 na `bezkonta1`**, potem test14 wycofany.
9. Testy kontrolne: spece z rolami 7/8/bez konta (subscribers, friends,
   poll-share, bases) w torach 1 i 2 równolegle; wpis w Dzienniku.
10. Dokumentacja: `tests/README.md` (część „po E25” staje się obowiązującą),
    CLAUDE.md, AGENTS.md.

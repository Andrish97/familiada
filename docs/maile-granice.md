# Maile do innych osób — granice „nie naprzykrzać się”

Dotyczy maili, które **użytkownik wysyła innym ludziom** przez aplikację
(subskrypcje, ankiety, udostępnianie bazy, udostępnianie urządzenia).
Maile systemowe (rejestracja, reset hasła) i admina — osobno, bez zmian.
Stan: `mail_cooldown_policies` (migracja 288) — limity jako dane w bazie,
sprawdzane w bazie (nie w przeglądarce).

---

## 1. Zasady (decyzja 2026-10-07)

1. **Zgoda przed treścią.** Do osoby, która nie zaakceptowała subskrypcji,
   może pójść **tylko** zaproszenie do subskrypcji. Mail z ankietą — tylko
   do aktywnych subskrybentów.
2. **„Nie” znaczy nie.** Odrzucenie / wypisanie zatrzymuje maile od razu
   i na długo (tabela 2). Odrzucenie zaproszenia do ankiety = koniec maili
   o tej ankiecie w tym uruchomieniu.
3. **Wypisanie wygrywa ze wszystkim.** Wypisanie od nadawcy → ten nadawca
   nigdy więcej (chyba że osoba sama się zapisze); wypisanie ze wszystkich
   → nikt nigdy. Działa także dla osób z kontem (ustawienie w Koncie).
4. **Limity liczy baza**, przy każdej wysyłce, po odbiorcy (adres
   e-mail / konto), nie po tym, co kliknięto na stronie.
5. **Nadawca widzi granicę**: przycisk nieaktywny + „Możesz wysłać
   ponownie: jutro 14:30” zamiast błędu po kliknięciu.
6. **Podłoga techniczna** zostaje: najwyżej 1 mail na minutę od tego
   samego nadawcy do tego samego odbiorcy, cokolwiek to jest.

### Reguła kolejki — decyzja 2026-10-11

- W całym systemie „powiadomienie” oznacza e-mail.
- Przed wstawieniem powiadomienia do `mail_queue` sprawdź flagę odbiorcy
  `user_flags.email_notifications`. Flaga wyłączona oznacza, że mail nie jest
  dodawany do kolejki. Kontrola ma być wspólna na granicy kolejki, a nie
  zależna od konkretnego ekranu.
- Dla odbiorcy z kontem wyłączenie maili nie odbiera zadania ani uprawnienia
  widocznego po zalogowaniu. Adres bez konta nie ma skrzynki z zadaniami;
  link może być przekazany poza kolejką tylko przez jawne skopiowanie przez
  właściciela, jeśli dana funkcja udostępnia taką możliwość.
- Ponowienie wysyła wyłącznie mail przypominający do istniejącego
  zaproszenia/udostępnienia. Nie tworzy nowego uprawnienia, rekordu ani tokenu.
  Przycisk ponowienia ukrywamy, jeśli odbiorca wyłączył powiadomienia.
- Cooldown ogranicza wysłanie maila. UI pokazuje pozostały czas, backend
  autorytatywnie rozstrzyga możliwość wysłania; cooldown nie opóźnia
  przyznania ani cofnięcia dostępu.

## 2. Tabela granic (decyzja 2026-10-07)

| Mail | Kiedy wolno | Limit | Po odmowie / braku odpowiedzi |
|---|---|---|---|
| **Zaproszenie do subskrypcji** | osoba nie jest subskrybentem | 1 mail; **ponowienie** po ≥ 5 dniach, **najwyżej 1 raz** (razem 2 maile) | odrzucił → ponowne zaproszenie dopiero po **30 dniach**; wypisał się od nadawcy → **nigdy**; bez odpowiedzi po 2 mailach → zaproszenie wygasa, nowe po 30 dniach |
| **Zaproszenie do ankiety** | aktywny subskrybent, ankieta otwarta | 1 na osobę na uruchomienie | odrzucił → nic więcej w tym uruchomieniu |
| **Przypomnienie o ankiecie** (dzwonek) | osoba „czeka” | ≥ 24 h od poprzedniego maila o tej ankiecie; **najwyżej 2** na uruchomienie | — |
| **Ponowne zaproszenie** po usunięciu udostępnienia | jw. | liczy się jak przypomnienie (ten sam licznik) | — |
| **Wszystkie maile ankietowe od jednego nadawcy do jednej osoby** | — | **najwyżej 3 na 24 h** (łącznie, ze wszystkich gier) | — |
| Udostępnienie bazy | — | jak dziś: 1 na 24 h na (nadawca, odbiorca, baza) | jak dziś |
| Udostępnienie urządzenia | — | jak dziś: 1 na h na (nadawca, odbiorca, urządzenie, gra); sam dostęp nigdy blokowany | — |

Przykład: zapraszam Anię do ankiety A (mail 1). Nie odpowiada — po 24 h
dzwonek (mail 2), po kolejnych 24 h drugi raz (mail 3); więcej o A w tym
uruchomieniu nie da się wysłać. Ania odrzuca → nic więcej o A.
Przerywam i uruchamiam A ponownie → nowe uruchomienie, Ania może dostać
nowe zaproszenie, ale nie więcej niż 3 maile ode mnie na dobę łącznie.

## 3. Dziś (różnice do usunięcia)

- zaproszenie do subskrypcji: 5 dni; ponowienie: 24 h, **bez limitu liczby**;
- ankieta: 24 h na (nadawca, odbiorca, gra), brak przypomnień, brak
  łącznego limitu na nadawcę;
- odrzucenie subskrypcji: brak okresu karencji (można zapraszać od razu
  po 5 dniach od poprzedniego maila);
- limit ankiety liczony też po stronie przeglądarki (inny klucz niż
  w bazie) — do usunięcia, liczy tylko baza.

## 4. Decyzje (2026-10-07)

- Zasady i liczby z sekcji 1–2 zatwierdzone.
- Osoby z kontem dostają zaproszenia do ankiet jak dziś: w karcie
  Zadania **i** mailem (z limitami jak wyżej).

## 5. Wartości obecnych polityk i zakres

Wartości w bazie po migracji 288 i późniejszych korektach. Przed nową
implementacją weryfikować `mail_cooldown_policies` i RPC — UI nie jest źródłem
limitu.

| Klucz / akcja | Obecny limit | Zastosowanie i uwagi |
|---|---:|---|
| `base:share` | 24 h | Ta sama para nadawca/odbiorca i baza. |
| `device:share` | 1 h | Ta sama para oraz typ urządzenia w grze; dawniej opisany jako limit samego maila. Nowy model Control przypina dostęp do konkretnego rekordu i sesji. |
| `poll:invite` | 5 dni | Zaproszenie do subskrypcji; polityka po odmowie jest osobna. |
| `poll:resend` | 5 dni | Ponowienie zaproszenia subskrypcyjnego; tylko przypominający e-mail. |
| `poll:share` | 24 h | Mail o udostępnieniu ankiety tej samej osobie i grze. |
| `poll:invite_after_reject` | 30 dni | Ponowne zaproszenie do subskrypcji po odmowie. |
| `friend:invite` | 5 dni | Nowe zaproszenie na tę samą parę. |
| `friend:resend` | 5 dni | Przypomnienie; maks. dwa maile na parę w 30 dni. |
| `friend:invite_after_reject` | 30 dni | Odstęp przed nowym zaproszeniem po odmowie. |
| Maile ankietowe nadawca → odbiorca | 3 / 24 h | Łącznie między grami; maks. dwa przypomnienia na uruchomienie. |
| Ogólny nadawca → odbiorca | 1 / min | Techniczny limit wspólny dla maili. |

Cooldowny cofnięcia i zmiany roli nie są tu ustalonymi wartościami. Szczegółowa tabela zachowań jest w
`e19-znajomi-plan.md`, sekcja 7.

**Stan E19 (2026-10-11):** migracja `2026-10-11_323` dodaje wspólny
`BEFORE INSERT` trigger na `mail_queue`. Wyłączona flaga pomija wstawienie
przed rezerwacją cooldownu; adres bez konta pozostaje dozwolony. Lokalny
test PG16 potwierdził wszystkie trzy przypadki. Pozostało uruchomić punktowy
job SQL, wdrożyć migrację i sprawdzić ją po wdrożeniu.

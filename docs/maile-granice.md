# Maile do innych osób — granice „nie naprzykrzać się”

Dotyczy maili, które **użytkownik wysyła innym ludziom** przez aplikację
(subskrypcje, ankiety, udostępnianie bazy, udostępnianie urządzenia).
Maile systemowe (rejestracja, reset hasła) i admina — osobno, bez zmian.
Stan: `mail_cooldown_policies` (migracja 288) — limity jako dane w bazie,
sprawdzane w bazie (nie w przeglądarce).

---

## 1. Zasady (propozycja do potwierdzenia)

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

## 2. Tabela granic (liczby do potwierdzenia)

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

## 4. Pytania

1. Liczby z tabeli 2 (2 maile subskrypcji, 30 dni po odrzuceniu,
   przypomnienie co 24 h max 2 razy, łącznie 3 na dobę od nadawcy) — ok?
2. Osoby z kontem: zaproszenia do ankiet dostają **i** w Zadaniach, **i**
   mailem (jak dziś), czy tylko w Zadaniach (mail tylko dla osób bez
   konta)?

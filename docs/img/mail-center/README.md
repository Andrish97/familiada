# Mails — symulowane zrzuty aktualnego interfejsu

Zrzuty renderują bieżący HTML, CSS i JavaScript z `web/`. Lokalny podgląd
podstawia odpowiedzi API i przykładowe rekordy, więc niczego nie pobiera ani
nie zapisuje na koncie i nie wysyła maili. Rozmiary: komputer 1400 × 900,
telefon 390 × 844; dodatkowo aktywny widok telefonu poziomo 844 × 390.

W zwykłym centrum Mails na komputerze obie listy są pokazane równolegle jako
karty w jednej wspólnej karcie. Na telefonie zostaje dotychczasowy wybór listy
wypustkami i zakładkami; przy nazwie listy widać licznik, tak jak u Znajomych.
Licznik nie jest powielany przy desktopowych nagłówkach. Odstęp nagłówka od
listy zwiększono. Formularz wpisania adresu pozostaje osobnym, węższym widokiem.

Wybrane zakładki zapisują się jako `?tab=items` w tym samym URL-u; domyślna
„Subskrypcje” nie dodaje parametru. Zmiana używa `replaceState`, więc nie
tworzy osobnej ścieżki ani pozycji w historii Wstecz.

W każdym stanie sprawdzono brak błędów JavaScript i poziomego przepełnienia.

| Stan | Telefon | Komputer |
|---|---|---|
| Wpisywanie adresu | ![Wpisywanie adresu — telefon](entry-mobile.png) | ![Wpisywanie adresu — komputer](entry-desktop.png) |
| Link wysłany | ![Link wysłany — telefon](sent-mobile.png) | ![Link wysłany — komputer](sent-desktop.png) |
| Potwierdzenie adresu | ![Potwierdzenie — telefon](confirm-mobile.png) | ![Potwierdzenie — komputer](confirm-desktop.png) |
| Aktywne centrum | ![Subskrypcje — telefon, zakładka zachowana](active-mobile.png) | ![Subskrypcje i zadania w dwóch kartach — komputer](active-desktop.png) |
| Zadania: ankiety i urządzenia | ![Zadania — telefon, zakładka zachowana](active-tasks-mobile.png) | ![Zadania — komputer](active-tasks-desktop.png) |
| Powiadomienia wyłączone | ![Powiadomienia wyłączone — telefon](disabled-mobile.png) | ![Powiadomienia wyłączone — komputer](disabled-desktop.png) |
| Nieaktualny link | ![Nieaktualny link — telefon](expired-mobile.png) | ![Nieaktualny link — komputer](expired-desktop.png) |
| Adres powiązany z kontem | ![Adres konta — telefon](registered-mobile.png) | ![Adres konta — komputer](registered-desktop.png) |
| Puste centrum | ![Puste centrum — telefon](empty-mobile.png) | ![Puste centrum — komputer](empty-desktop.png) |

## Pozostałe ujęcia

![Aktywne centrum w poziomym telefonie](active-landscape.png)

![Wspólny modal kontaktu w widoku telefonu](contact-mobile.png)

![Wspólny modal kontaktu w widoku komputera](contact-desktop.png)

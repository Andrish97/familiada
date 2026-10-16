# E20 — audyt renderów, stan 2026-10-13

## Korekta metody galerii — 2026-10-16

Na prośbę użytkownika nowy przebieg korzysta wyłącznie z istniejących,
niegaleryjnych rekordów kont testowych. Przygotowanie sesji wykonuje tylko
odczyty; nie tworzy ani nie zmienia gier, baz, logo, ankiet ani linków
urządzeń. Pozostałości o nazwach `E20-GALLERY-*` z dawnych przebiegów są
pomijane, nie są usuwane.

Widoczne modale są otwierane kliknięciem rzeczywistych akcji interfejsu.
Nie zmieniamy DOM, wartości pól, pustych stanów ani odpowiedzi API, by
wyprodukować kadr. Panel admina `/settings/` jest wyłączony; Ustawienia gry
`/games/settings/` zostają. Konserwacja i blokady korzystają z bieżącego
stanu backendu.

Widoki urządzeń nadal korzystają z emulowanych wymiarów przeglądarki oraz
ramek i safe area zapisanych w wymaganiach E20; treść i stan aplikacji nie
są emulowane. Nowa galeria pozostaje niepotwierdzona do czasu ukończenia
workflow i sprawdzenia artefaktu.

Tabela kategorii i wspólnych cech stron jest ukończona i odhaczona w głównym
planie E20 w `ujednolicenie-wygladu.md`. Ten raport dokumentuje osobny etap:
renderowanie stron i pierwsze poprawki layoutu.

## Zakres przebiegu

- 37 widoków aplikacji (w tym trzy widoki panelu `/settings/`), poza
  `/settings/tools/**`.
- 7 profili: MacBook, iPad portrait, iPad landscape, iPhone portrait,
  iPhone landscape, wąskie okno desktopowe o rozmiarze telefonu oraz split
  view iPada.
- 259 głównych zrzutów: po jednym dla każdego widoku i profilu. Dodatkowe
  kadry dokumentują otwarte menu topbara i wyszukiwanie.
- Przeglądarka uruchamia prawdziwe strony aplikacji, z lokalnymi atrapami
  usług i przykładowymi danymi. Wymiary Safe Area, notch i zaokrąglenia są
  emulowane. To nie są dane kont produkcyjnych ani test na fizycznym sprzęcie.

Wcześniejszy podgląd HTML został usunięty. Końcowa galeria E20 będzie
udostępniona jako artefakt zawierający foldery stron i same pliki PNG.

## Wyniki automatycznego pomiaru

- 0 wykrytych poziomych przepełnień/pozostałych problemów layoutu.
- 0 błędów strony JavaScript w zebranych kadrach.
- 37/37 widoków w fizycznym landscape telefonu pokazało globalną blokadę.
  Małe okno desktopowe i split view iPada mają odrębne profile i nie są
  klasyfikowane jako obrót telefonu.
- Widoki ustawień miały 0 przepełnień nawigacji na MacBooku i iPadzie po
  dodaniu menu topbara. Dodatkowe kadry sprawdzają otwarte menu.

## Sprawdzone poprawki

- `/settings/` ma zbyt wiele pozycji, by zmieścić je w zwykłym topbarze na
  laptopie i iPadzie. Przy szerokości do 1800 px korzysta z hamburgera;
  panel nawigacji przewija się niezależnie, a przewijanie aktywnej treści
  ustawień pozostaje bez zmian.
- Telefon w landscape jest zasłonięty przed pierwszym renderem nieprzezroczystą
  warstwą i nie pokazuje zawartości strony pod guardem.
- Zebrane kadry pokazują poprawną geometrię Safe Area i symulowane wycięcia;
  pełna ręczna ocena każdego kadru i każdego stanu pozostaje w planie.

## Ograniczenia i pozostała praca

- To przebieg stabilnych widoków z przykładowymi danymi. Nie dowodzi poprawnego
  ładowania każdej strony w wolnej sieci, podczas błędu, przy pustych danych ani
  bez mignięcia niegotowej powłoki. Stopniowe odsłanianie jest osobnym,
  nadal otwartym audytem.
- W kadrze maintenance w panelu ustawień lokalna atrapka danych daje etykietę
  „Invalid Date”; to zanieczyszcza przykładowy stan i nie jest zaliczone jako
  potwierdzony błąd layoutu. Warto poprawić fixture przy kolejnym przebiegu.
- iPad jest emulowany w przeglądarce. Fizyczne sprawdzenie na tablecie nadal
  pozostaje otwarte.

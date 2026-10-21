# 7. Tworzenie i edycja gry

## 7.1 Wybór rodzaju gry

Grę tworzysz w zakładce jej rodzaju na stronie *Moje gry* (→ 6.3). Są trzy rodzaje:

| Rodzaj | Co przygotowujesz | Skąd biorą się odpowiedzi i punkty |
|---|---|---|
| **Ankieta tekstowa** | tylko pytania | Głosujący wpisują własne odpowiedzi; serwis zlicza je i zamienia na punkty (→ 15). |
| **Punktacja** | pytania i listę odpowiedzi | Głosujący wybierają jedną z Twoich odpowiedzi; punkty wynikają z ich wyborów (→ 15). |
| **Preparowana** | pytania, odpowiedzi i punkty | Wszystko wpisujesz sam — gra nie potrzebuje ankiety. |

Rodzaj gry możesz później zmienić (→ 7.8).

## 7.2 Edytor gry

Zaznacz grę na liście i wybierz [Edytuj]. Edytor składa się z:

- pola **Nazwa** na górze — tu zmienisz nazwę gry bez wychodzenia z edytora,
- **listy pytań** po lewej — z kafelkiem [Dodaj pytanie] i listą warunków, które gra musi
  spełnić (→ 7.6),
- **wybranego pytania** po prawej — z polem „Treść pytania” i listą odpowiedzi
  (w ankiecie tekstowej odpowiedzi nie ma).

Kliknij pytanie na liście, aby je otworzyć. Aby je usunąć, kliknij ikonę kosza na jego
kafelku i potwierdź — usuniesz pytanie razem z odpowiedziami.

Na węższym ekranie edytor pokazuje na zmianę listę pytań albo wybrane pytanie; do listy
wracasz przyciskiem [Wstecz].

## 7.3 Pytania i odpowiedzi

- **Pytanie** może mieć do **100 znaków**.
- **Odpowiedź** może mieć do **17 znaków** — tyle mieści jeden wiersz tablicy na
  Wyświetlaczu. W pytaniach finałowych Wyświetlacz pokazuje do 11 znaków odpowiedzi.
- Pytanie może mieć do **6 odpowiedzi** — kafelek [Dodaj odpowiedź] pokazuje, ile już jest.

Odpowiedzi nie mogą zawierać znaków, których nie pokaże Wyświetlacz (na przykład emotek).
Serwis nie zapisze takiej odpowiedzi i pokaże komunikat.

W ankiecie tekstowej wpisujesz tylko pytania. W grach „Punktacja” i preparowanych —
także odpowiedzi.

Pytania i odpowiedzi możesz też przygotować w bazie pytań i utworzyć z nich grę (→ 9.8).

## 7.4 Punktacja odpowiedzi

- **Punktacja** — kolumny punktów nie ma. Punkty wynikną z ankiety (→ 15.6).
- **Preparowana** — przy każdej odpowiedzi wpisujesz punkty (liczbę od 0 do 100). Pasek
  „SUMA” pokazuje sumę punktów w pytaniu.

Aby gra preparowana była gotowa:

- każda odpowiedź musi mieć **co najmniej 4 punkty**,
- suma punktów w pytaniu może wynosić **najwyżej 100** — nie musi być równa 100.

Wartości niespełniające tych warunków serwis zapisze, ale oznaczy na czerwono, a gra nie
będzie gotowa. Jak punkty liczą się w rozgrywce (→ 3.2).

## 7.5 Zapisywanie i edycja gry po rozpoczęciu ankiety

Edytor zapisuje zmiany sam — nie ma przycisku „Zapisz”:

- treść pytań i odpowiedzi zapisuje się chwilę po tym, jak przestaniesz pisać, oraz po
  opuszczeniu pola,
- punkty i nazwa gry zapisują się po opuszczeniu pola (lub po naciśnięciu Enter).

Puste pytanie lub odpowiedź zapisze się jako „Pytanie 1”, „ODP 1” itd.

**Gra z ankietą:**

- Gdy ankieta jest **otwarta** albo **zatrzymana**, edycja jest zablokowana. Aby edytować,
  przerwij ankietę (→ 15.5) — zebrane głosy przepadną.
- Gdy ankieta jest **zamknięta**, przy próbie edycji serwis zapyta: „Zresetować ankietę?”.
  Po wybraniu [Resetuj] usunięte zostaną głosy, odpowiedzi ankietowanych oraz linki i kody QR
  do ankiety; pytania i odpowiedzi zostaną, punkty zostaną wyzerowane, a gra wróci do szkicu.

Gry nie można edytować także wtedy, gdy jest otwarta w innym miejscu albo trwa jej
rozgrywka — serwis pokaże powód.

## 7.6 Warunki gotowości gry

Lista warunków w edytorze („Ankietę uruchomisz, gdy:” albo „Gra będzie gotowa, gdy:”)
pokazuje na bieżąco, co jest spełnione (zielony znak), a czego brakuje (czerwony znak,
z numerami pytań, których to dotyczy).

| Rodzaj | Warunki |
|---|---|
| Wszystkie | co najmniej **10 pytań** (bez górnego limitu) |
| Punktacja | każde pytanie ma od **3 do 6** odpowiedzi |
| Preparowana | każde pytanie ma od **3 do 6** odpowiedzi, każda ma co najmniej **4 punkty**, suma w pytaniu najwyżej **100** |
| Ankieta tekstowa | wystarczą pytania — odpowiedzi zbierze ankieta |

W grach z ankietą spełnienie warunków pozwala uruchomić ankietę. Grę rozegrasz dopiero po jej
podliczeniu i zamknięciu (→ 15.6, 15.7).

## 7.7 Import pytań z pliku tekstowego

W edytorze wybierz [Importuj]. Możesz wkleić tekst albo wczytać plik `.txt`. Zapis:

```
@Nazwa gry
# Pierwsze pytanie
odpowiedź pierwsza / 40
odpowiedź druga / 30
odpowiedź trzecia / 20
# Drugie pytanie
1. odpowiedź
2. odpowiedź
3. odpowiedź
```

- Wiersz zaczynający się od `#` to pytanie, kolejne wiersze to jego odpowiedzi.
- `@Nazwa gry` (opcjonalnie, przed pierwszym pytaniem) ustawia nazwę gry.
- Numery odpowiedzi (`1`, `1.`, `2)`, `3 -`, `4:`) są opcjonalne i zostaną pominięte —
  dlatego odpowiedź zaczynająca się od liczby (np. „100 lat”) straci tę liczbę.
- Punkty po ukośniku `/` są opcjonalne i działają tylko w grze preparowanej.

W oknie widać podgląd: liczbę pytań i odpowiedzi oraz pierwsze pytania.

> Uwaga: import **zastępuje** całą dotychczasową zawartość gry. Serwis poprosi o potwierdzenie.

Zbyt długie teksty zostaną skrócone (pytanie do 100, odpowiedź do 17 znaków), a z więcej niż
6 odpowiedzi zostanie pierwszych 6. W ankiecie tekstowej odpowiedzi z pliku nie są
wczytywane. Jeśli plik zawiera znaki, których nie pokaże Wyświetlacz, albo odpowiedź przed
pierwszym pytaniem, serwis wskaże miejsce błędu i nic nie zmieni.

## 7.8 Zmiana typu istniejącej gry

Zaznacz grę w *Moich grach* i wybierz [Zmień typ]. Zmienia się **ta sama gra** — to nie
kopia. Jeśli chcesz zachować obecną wersję, najpierw użyj [Powiel] (→ 6.6).

- Gry z ankietą **otwartą lub zatrzymaną** nie można w tej chwili zmienić.
- Przy ankiecie **zamkniętej** serwis najpierw zapyta o jej wyzerowanie (→ 7.5).
- Gier z zakładki Gry Społeczności nie można zmieniać.

W oknie „Zmień typ gry” każdy rodzaj ma opis skutków — sprawdź go przed wyborem [Zmień]:

| Nowy rodzaj | Co się stanie z zawartością |
|---|---|
| Ankieta tekstowa | Pytania zostaną. Odpowiedzi i punkty zostaną usunięte. |
| Punktacja | Pytania i odpowiedzi zostaną. Punkty zostaną usunięte — wynikną z nowej ankiety. |
| Preparowana | Pytania i odpowiedzi zostaną. Punkty trzeba będzie uzupełnić, jeśli ich nie było. |

Z ankiety tekstowej przechodzą tylko pytania — odpowiedzi trzeba wpisać. Po zmianie gra jest
zawsze szkicem.

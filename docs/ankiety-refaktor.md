# Ankiety — refaktor (hub znika)

Etap **E11** w [`wdrozenia.md`](wdrozenia.md). Źródło prawdy dla ankiet.
Stan faktyczny sprawdzony w kodzie 2026-10-07 (opis niżej, sekcja 4).

---

## 1. Decyzje (2026-10-07)

- **Gry preparowane** — bez zmian.
- **Gry ankietowe** (tekst / punktacja) przejmują to, co dziś jest
  w hubie. **Hub ankiet (`/polls-hub/`) znika całkiem.**
- **Strona ankiety (`/polls/?id=`)** — jedyne miejsce zarządzania jedną
  ankietą: uruchomienie, zamknięcie, ponowne uruchomienie,
  **udostępnianie** (link / QR dla każdego **i** subskrybentom — dziś
  okno w hubie).
- **„Szczegóły” i podobne dodatki znikają jako osobne okna** — co
  potrzebne, pojawia się na stronie ankiety; bez przekombinowania.
- **Podgląd** (okno „Podgląd” na liście gier) dostaje na górze
  przełącznik **Gra · Ankieta**; w „Ankieta” podgląd wyników ankiety.
- **Subskrypcje** dostają trzecią kartę **Zadania** — ankiety do
  zagłosowania (dziś karta „Zadania” w hubie). Karty: Moi subskrybenci ·
  Moje subskrypcje · Zadania.
- Osobne liczenie głosów (anonimowe / od subskrybentów) — prawdopodobnie
  zbędne (patrz pytania).

## 2. Co gdzie po zmianie

| Funkcja | Dziś | Po zmianie |
|---|---|---|
| Lista moich ankiet | gry + hub „Moje ankiety” | tylko gry |
| Uruchom / zamknij / uruchom ponownie | strona ankiety | strona ankiety |
| Link i QR dla każdego | strona ankiety (tylko przy otwartej) | strona ankiety |
| Udostępnienie subskrybentom (+ maile) | hub, okno „Udostępnij” | strona ankiety |
| Kto zagłosował / usuń głos | hub, okno „Szczegóły” | strona ankiety, w uproszczonej formie (do ustalenia) albo wcale |
| Wyniki | strona ankiety | podgląd na liście gier (przełącznik Gra · Ankieta); na stronie ankiety — do ustalenia |
| Ankiety do zagłosowania (zadania) | hub, karta „Zadania” | subskrypcje, karta „Zadania” |
| Badge zadań w topbarze | prowadzi do huba | prowadzi do subskrypcji, karta „Zadania” |
| Wejście z maila `?t=` dla konta | hub | subskrypcje, karta „Zadania” |

## 3. Pytania otwarte

1. **Liczniki głosów** — jeden licznik „Głosy: N” zamiast podziału
   anonimowe / subskrybenci? *(propozycja: tak)*
2. **Lista subskrybentów na stronie ankiety** — ma pokazywać przy każdym
   stan (zaproszony / zagłosował), czy tylko zaznaczenie, komu wysłać?
   Usuwanie pojedynczego głosu zostaje czy znika? *(propozycja: stan
   zostaje, usuwanie głosu znika)*
3. **Wyniki na stronie ankiety** — zostają (podgląd na żywo w trakcie
   głosowania), czy tylko w podglądzie na liście gier?
4. **„Uruchom ponownie”** kasuje głosy; zaproszenia: a) wszystkie
   anulowane, wysyłasz od nowa, czy b) same wracają do „czeka” z nowym
   mailem? *(propozycja: a)*
5. **Udostępnienie subskrybentom przed uruchomieniem** — tylko przy
   otwartej ankiecie (jak dziś), czy zaznaczenie wcześniej i maile przy
   uruchomieniu?

## 4. Stan faktyczny i błędy do naprawy przy okazji

- Hub: `polls_hub_list_polls`, `polls_hub_share_poll` (+ maile przez
  edge function, `polls_hub_tasks_mark_emailed`), szczegóły z `poll_tasks`,
  `poll_admin_delete_vote`, `polls_hub_list_tasks`, `polls_hub_task_decline`.
- Głosy anonimowe (link / QR, `?id=&key=`) i od subskrybentów (`?t=`)
  trafiają do tych samych sesji i są liczone razem przy zamknięciu.
- Błędy:
  1. `poll_open` (ponowne uruchomienie) kasuje głosy, ale zostawia
     zaproszenia jako „zagłosował” — nie mogą głosować ponownie ani dostać
     nowego zaproszenia.
  2. `polls_hub_subscriber_remove` nie anuluje otwartych zaproszeń —
     zamknięcie ankiety czeka na nie w nieskończoność.
  3. Szczegóły: zaproszenia w stanie `opened` nie trafiają do żadnej grupy;
     kosz przy każdej grupie, nie tylko przy głosach.
  4. `polls_hub_share_poll` nie sprawdza w bazie, czy ankieta jest otwarta.
  5. Gotowość do zamknięcia liczona dwa razy (`polls_hub_can_close`
     i `game_poll_close_check`).
  6. Nieużywane RPC: `poll_close_and_normalize`, `poll_task_send`,
     `*_batch_owner`, `poll_admin_preview`, `poll_admin_can_close`,
     `polls_hub_list_open_polls`, `polls_hub_overview`, `polls_action`,
     `game_action_state`, `*_legacy`.
  7. Gry → ankieta przekazują `from=games`, hub → `ret=`; strona czyta
     tylko `ret`.

## 5. Wpływ na inne plany

- `ujednolicenie-wygladu.md`: sekcja o hubie nieaktualna (hub znika);
  subskrypcje — układ list + trzecia karta Zadania.
- `nawigacja-mapa-plan.md`, sekcja 8: `/polls/` jako hub odpada; adres
  strony ankiety i subskrypcji do ustalenia przy E5b.

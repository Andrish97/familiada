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

## 4a. Cykl udostępniania — stan faktyczny (2026-10-07)

- **Link publiczny** (`share_key_poll`) powstaje z grą i nigdy się nie
  zmienia. Szkic i zamknięta ankieta dają głosującemu ten sam ogólny błąd
  („nie udało się otworzyć”), nie „ankieta zamknięta”.
- **Ponowne uruchomienie** kasuje głosy, ale: anonimowi mają w przeglądarce
  znacznik „już głosowałem” → nie mogą głosować; zaproszenia zostają
  „zagłosował” → subskrybenci nie mogą głosować ani dostać nowego
  zaproszenia.
- **Ekran QR** sprawdza stan tylko przy starcie — po zamknięciu dalej
  pokazuje kod. Kod urządzenia (6 cyfr) nigdy nie wygasa.
- **Zaproszenie**: 5 stanów (czeka / otwarte / zagłosował / odrzucił /
  anulowane) + 4 znaczniki czasu, różnie czytane w różnych miejscach.
  Link z maila po zamknięciu ankiety nie mówi „zamknięta”.
- **Zamknięcie jest niemożliwe, dopóki jakiekolwiek zaproszenie czeka** —
  subskrybent, który nie odpowiada, blokuje ankietę na zawsze (obejście
  tylko przez usuwanie w „Szczegółach”, które nie widzi zaproszeń
  „otwartych”). Usunięcie subskrybenta nie anuluje jego zaproszeń.
- **Ponowne udostępnienie**: odznaczenie = anulowanie; ponowne
  zaznaczenie przez 24 h zablokowane (limit), potem nowe zaproszenie
  i nowy link (stary „wygasł”). Nie da się ponownie wysłać maila.
- **Tokenów jest 7** (klucz ankiety, token zaproszenia + kopia klucza,
  token subskrypcji, token wypisania, kod urządzenia, token głosującego
  w przeglądarce, `task:<id>`).
- **Luka bezpieczeństwa**: `poll_open`, `poll_text_close_apply`,
  `poll_points_close_and_normalize` sprawdzają tylko klucz z linku
  głosującego, nie właściciela, i są dostępne publicznie (brak `REVOKE`
  w migracjach) — każdy z linkiem do głosowania może ponownie uruchomić
  ankietę (skasować głosy) albo ją zamknąć.
- **Blokady**: strona ankiety trzyma `game:G`, ale żadna funkcja ankiety
  w bazie nie sprawdza blokad; edytor pytań resetuje ankietę do edycji
  **przed** wzięciem blokady (`editor.js:336` vs `:349`); hub udostępnia
  i usuwa głosy niezależnie od tego, kto trzyma grę.

## 4b. Prostszy mechanizm (propozycja)

**Runda.** Każde uruchomienie ankiety to nowa runda (`poll_round` w grze).
Głosy i zaproszenia należą do rundy. Ponowne uruchomienie = następna
runda: stare głosy i zaproszenia przestają się liczyć same, bez kasowania
i anulowania; znacznik „głosowałem” w przeglądarce zawiera numer rundy,
więc wszyscy mogą głosować od nowa.

**Stany ankiety** (jedno źródło: `games.status` + runda):

| Stan | Właściciel (strona ankiety) | Głosujący z linku / QR | Zaproszony (karta Zadania / link z maila) |
|---|---|---|---|
| Szkic | Uruchom | „Ankieta jeszcze nie jest otwarta” | — (zaproszeń nie ma) |
| Otwarta | Zamknij; link + QR; zaproś subskrybentów; liczba głosów | głosowanie / „Dziękujemy, głos oddany” | Zagłosuj · Odrzuć |
| Zamknięta | Uruchom ponownie (potwierdzenie: głosy i zaproszenia tej rundy przepadają) | „Ankieta została zamknięta” | „Ankieta została zamknięta” (znika z Zadań) |
| Nowa runda po moim zaproszeniu | — | — | stare zaproszenie: „Ankieta została uruchomiona ponownie — poczekaj na nowe zaproszenie” |

**Zaproszenie** — 3 stany: **czeka · zagłosował · odrzucił**. Bez
„otwarte” i „anulowane”: wycofanie zaproszenia = usunięcie (link mówi
„zaproszenie wycofane”). Odrzucenie niczego nie blokuje — właściciel
widzi „odrzucił” przy osobie.

**Zamykanie** — gdy są minimalne odpowiedzi; **czekające zaproszenia nie
blokują** (po zamknięciu ich link mówi „ankieta zamknięta”). Usuwa to
problem nieodpowiadających i potrzebę „Szczegółów”.

**Ekran QR i kod urządzenia** — QR śledzi stan i po zamknięciu pokazuje
„Ankieta zamknięta”; kod urządzenia wygasa przy zamknięciu.

**Bezpieczeństwo i blokady** — uruchomienie, zamknięcie, zaproszenia
i reset do edycji: tylko właściciel (`auth.uid()`), tylko ze strony,
która trzyma `game:G`; baza sprawdza blokadę (`*_checked`). Głosowanie
dalej po kluczu z linku.

**Do usunięcia**: hub, `poll_tasks.opened_at/cancelled_at` i stany
pośrednie, kopia klucza w zaproszeniu, `poll_task_opened`, warunek
„czekające zaproszenia blokują zamknięcie”, `polls_hub_can_close`,
nieużywane RPC (sekcja 4), znacznik „głosowałem” bez rundy.

## 5. Wpływ na inne plany

- `ujednolicenie-wygladu.md`: sekcja o hubie nieaktualna (hub znika);
  subskrypcje — układ list + trzecia karta Zadania.
- `nawigacja-mapa-plan.md`, sekcja 8: `/polls/` jako hub odpada; adres
  strony ankiety i subskrypcji do ustalenia przy E5b.

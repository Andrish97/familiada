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
- **Ponowne uruchomienie = nowe udostępnienie**: nowy klucz, stare linki,
  QR i zaproszenia tracą ważność; nikt nie głosuje ponownie starym
  linkiem (sekcja 4b).
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

**Każde uruchomienie = nowe udostępnienie** (decyzja 2026-10-07).
Uruchomienie nadaje ankiecie **nowy klucz** (`share_key_poll`
zmienia się przy każdym `poll_open`). Stare linki, kody QR, kody urządzeń
i zaproszenia **tracą ważność** — po ponownym uruchomieniu trzeba
udostępnić od nowa (nowy link / QR, nowe zaproszenia). Głosy poprzedniego
uruchomienia przepadają. Nikt nie głosuje „od nowa” starym linkiem.

**Stany ankiety** (jedno źródło: `games.status` + bieżący klucz):

| Stan | Właściciel (strona ankiety) | Głosujący z linku / QR | Zaproszony (karta Zadania / link z maila) |
|---|---|---|---|
| Szkic | Uruchom | „Ankieta jeszcze nie jest otwarta” | — (zaproszeń nie ma) |
| Otwarta | Zamknij · Przerwij; link + QR; zaproś subskrybentów; liczba głosów | głosowanie / „Dziękujemy, głos oddany” | Zagłosuj · Odrzuć |
| Zamknięta | Uruchom ponownie (potwierdzenie: głosy przepadają, trzeba udostępnić od nowa) | „Ankieta została zamknięta” | „Ankieta została zamknięta” (znika z Zadań) |
| Link / zaproszenie ze starszego uruchomienia | — | „Ten link wygasł” | „To zaproszenie wygasło” (znika z Zadań) |

**Zamknięcie a przerwanie.** Dziś ankietę da się zamknąć tylko przy
minimum odpowiedzi (punktacja: ≥3 odpowiedzi z ≥3 punktami na pytanie;
tekst: ≥3 różne odpowiedzi) i gdy żadne zaproszenie nie czeka. Przy
otwartej ankiecie pytań nie da się edytować — z mało głosami nie ma
wyjścia. Propozycja: dwie akcje przy otwartej ankiecie:
- **Zamknij** — przelicza głosy na odpowiedzi gry; tylko przy minimum
  odpowiedzi;
- **Przerwij** — zawsze dostępne; głosy przepadają, linki i zaproszenia
  wygasają, ankieta wraca do szkicu i można edytować pytania.

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
pośrednie, kopia klucza w zaproszeniu (zaproszenie ważne tylko przy
bieżącym kluczu gry), `poll_task_opened`, warunek „czekające zaproszenia
blokują zamknięcie”, `polls_hub_can_close`, nieużywane RPC (sekcja 4).

## 6. Specyfikacja (do potwierdzenia)

Dotyczy gier **tekst** i **punktacja**. Preparowane bez zmian.

### 6.1 Stany i przejścia

```
Szkic ──Uruchom──▶ Otwarta ──Zamknij──▶ Zamknięta
  ▲                   │                    │
  └─────Przerwij──────┘                    │
  ▲                                        │
  └──Przerwij (wyniki zerowane)────────────┘
     „Uruchom ponownie” = Przerwij + Uruchom (jedno kliknięcie)
     „Edytuj pytania” w edytorze = Przerwij (dziś: reset do edycji)
```

| Przejście | Kto / skąd | Warunek | Skutek |
|---|---|---|---|
| **Uruchom** (Szkic → Otwarta) | właściciel, strona ankiety | pytania gotowe (jak dziś) | nowy klucz ankiety → nowy link i QR; głosów 0 |
| **Zamknij** (Otwarta → Zamknięta) | jw. | minimum odpowiedzi (punktacja: ≥3 odpowiedzi z ≥3 pkt na pytanie; tekst: ≥3 różne odpowiedzi); czekające zaproszenia **nie** blokują | głosy przeliczone na odpowiedzi gry (tekst: jak dziś okno scalania); link, QR, kod urządzenia i zaproszenia przestają działać |
| **Przerwij** (Otwarta → Szkic) | jw. | zawsze; potwierdzenie „Głosy przepadną, linki i zaproszenia wygasną” | głosy usunięte; link, QR, kod urządzenia i zaproszenia przestają działać; pytania znów edytowalne |
| **Uruchom ponownie** (Zamknięta → Otwarta) = Przerwij + Uruchom | jw. | potwierdzenie „Głosy i wyniki zostaną usunięte, trzeba udostępnić od nowa” | **wyniki zerowane** (punkty odpowiedzi = 0, jak przy edycji) + nowy klucz, głosów 0 (decyzja 2026-10-07) |
| **Edytuj pytania** (Zamknięta → Szkic) | właściciel, wejście do edytora pytań | potwierdzenie „Wyniki ankiety zostaną wyzerowane” | **istnieje dziś** (`game_reset_poll_for_edit`: status szkic, punkty 0; w ankiecie tekstowej zostają odpowiedzi ustalone przy zamknięciu, z punktami 0). Do poprawy: edytor robi reset **przed** wzięciem blokady gry — odwrócić kolejność |

Każda akcja: tylko właściciel, tylko gdy trzyma blokadę gry (strona
ankiety / edytor) — sprawdzane w bazie. Głosowanie nie wymaga konta ani
blokady (po kluczu z linku / tokenie zaproszenia). Luka (sekcja 4a)
naprawiana w ramach tego etapu, nie osobno (decyzja 2026-10-07).

### 6.2 Strona ankiety (właściciel) — układ

Topbar (wg `ujednolicenie-wygladu.md`): `FAMILIADA` + „Wstecz” ·
**ANKIETA** / nazwa gry · `?` · konto. Pod topbarem:

**A. Pasek stanu** (pełna szerokość, zawsze):
- po lewej: oznaczenia (tagi) — typ (Tekst / Punktacja), stan (Szkic /
  Otwarta / Zamknięta), przy otwartej **Głosy: N**;
- po prawej: przyciski stanu —
  Szkic: **Uruchom** · Otwarta: **Zamknij** (wyłączony z powodem obok,
  gdy brak minimum) + **Przerwij** · Zamknięta: **Uruchom ponownie**.

**B. Treść** — karty **Udostępnianie · Wyniki** na każdym urządzeniu,
także na komputerze (wzór kart z list; decyzja 2026-10-07):

| Stan | Karta **Udostępnianie** | Karta **Wyniki** |
|---|---|---|
| Szkic | pusta karta: „Uruchom ankietę, żeby ją udostępnić” | lista pytań bez wyników |
| Otwarta | sekcja **Link i QR** + sekcja **Subskrybenci** (niżej) | wyniki na żywo (odświeżanie samo co kilka sekund, bez przycisku ⟳) |
| Zamknięta | pusta karta: „Ankieta zamknięta — udostępnianie wygasło” | wyniki końcowe (punkty w grze) |

Sekcja **Link i QR**: QR (duży), pole z linkiem (tylko do odczytu),
przyciski **Kopiuj** · **Otwórz** · **QR na wyświetlaczu** (kod urządzenia).

Sekcja **Subskrybenci** — kafle (wzór kafli z list; decyzja 2026-10-07):
- kafel zaproszonego: nazwa, oznaczenie stanu (**czeka** /
  **zagłosował** / **odrzucił**), w rogu ikony: **dzwonek** = Przypomnij
  (tylko „czeka”, raz na 24 h) obok **kosza** = usuń udostępnienie;
- **kosz** (każdy stan): zaproszenie usunięte; **jeśli osoba zagłosowała,
  jej głos też jest usuwany**; odrzucone zaproszenie usuwa się tak samo;
- niezaproszeni subskrybenci: kafle do zaznaczenia + **Wyślij
  zaproszenia** (zaproszenie + mail, 6.4); po usunięciu udostępnienia
  osobę można zaprosić ponownie, **ale z limitem maili** (6.4) — dla
  wszystkich tak samo (decyzja 2026-10-07);
- brak subskrybentów → „Nie masz subskrybentów” + link do Subskrypcji.

**Wyniki na żywo bez skakania** (dziś przycisk ⟳, bo lista skakała):
odświeżanie co kilka sekund **bez przebudowy listy** — stała kolejność
(punktacja: kolejność odpowiedzi z gry; tekst: kolejność pojawienia się,
nowe na końcu), zmieniają się tylko liczby i szerokość pasków (płynne
przejście CSS), nic się nie przesuwa; sortowanie według głosów dopiero
przy zamykaniu. Stała wysokość listy i wierszy. **Przycisk ⟳ znika**
(decyzja 2026-10-07).

**C. Zamykanie ankiety tekstowej** — „Zamknij” przełącza treść (B) na
pełnoszerokie okno scalania odpowiedzi (jak dziś: scal / zmień nazwę /
usuń, cofnij / ponów) z **Anuluj** i **Zamknij i przelicz**; pasek stanu
zostaje.

### 6.3 Głosujący

**Z linku / QR** (bez konta). Jeden głos na uruchomienie w tej przeglądarce
(znacznik zapisany z kluczem — przy nowym uruchomieniu i tak potrzebny
nowy link).

| Sytuacja | Widzi |
|---|---|
| ankieta otwarta, ten link aktualny | głosowanie → „Dziękujemy, głos oddany” |
| już głosował | „Już oddałeś głos w tej ankiecie” |
| ankieta zamknięta (link z tego uruchomienia) | „Ankieta została zamknięta” |
| link z wcześniejszego uruchomienia albo ankieta przerwana / w szkicu | „Ten link wygasł” |
| gra usunięta / zły link | „Nie ma takiej ankiety” |

**Z zaproszenia** (link z maila; z kontem także karta Subskrypcje →
Zadania).

| Sytuacja | Link z maila | Karta Zadania |
|---|---|---|
| czeka, ankieta otwarta | Zagłosuj · Odrzuć | kafel: Zagłosuj · Odrzuć (✕) |
| zagłosował | „Dziękujemy, głos oddany” | znika |
| odrzucił | „Zaproszenie odrzucone” | znika |
| ankieta zamknięta | „Ankieta została zamknięta” | znika |
| przerwana / ponownie uruchomiona / udostępnienie usunięte | „To zaproszenie wygasło” | znika |

Odrzucenie: jedno kliknięcie, bez potwierdzenia; właściciel widzi
„odrzucił”; niczego nie blokuje.

### 6.4 Maile

| Mail | Kiedy | Do kogo | Treść / przycisk | Limit |
|---|---|---|---|---|
| Zaproszenie do subskrypcji | właściciel dodaje subskrybenta (kafel „+”) | podany e-mail / użytkownik | „X chce wysyłać Ci ankiety” → Akceptuj | jak dziś: 1 na 5 dni na osobę; ponowne wysłanie 1 na 24 h |
| **Zaproszenie do ankiety** | „Wyślij zaproszenia” przy otwartej ankiecie | zaznaczeni subskrybenci (aktywni) | „X zaprasza Cię do ankiety „nazwa”” → Zagłosuj (link `?t=`) | wspólny limit niżej |
| Przypomnienie (decyzja 2026-10-07) | dzwonek na kafelku osoby, która czeka | ta osoba | jak zaproszenie, „Przypomnienie” | wspólny limit niżej |

**Limit maili ankietowych** (decyzja 2026-10-07 — nie naprzykrzać się):
jeden wspólny limit dla zaproszenia, ponownego zaproszenia po usunięciu
udostępnienia i przypomnienia — **najwyżej 1 mail na osobę na grę na
24 h**, dla wszystkich subskrybentów (z kontem i tylko e-mail).
Kafel osoby pokazuje, kiedy znów będzie można wysłać (dzwonek /
zaproszenie nieaktywne do tego czasu).

**Bez maili** przy: zamknięciu, przerwaniu, ponownym uruchomieniu,
usunięciu udostępnienia — link sam mówi, co się stało (6.3).

Każdy mail ma stopkę jak dziś: konto → „ustawienia konta”; bez konta →
„wypisz się od tego nadawcy” / „wypisz się ze wszystkich”.

### 6.5 Subskrypcje a zaproszenia

- usunięcie subskrybenta / jego wypisanie się / odrzucenie subskrypcji →
  jego czekające zaproszenia wycofane;
- zaprosić do ankiety można tylko aktywnego subskrybenta;
- karta **Zadania** w Subskrypcjach: tylko zaproszenia „czeka” do
  otwartych ankiet; badge w topbarze = ich liczba.

### 6.6 Ekran QR i kod urządzenia

- `/poll-qr/` sprawdza stan co kilka sekund; po zamknięciu / przerwaniu /
  nowym uruchomieniu pokazuje „Ankieta została zamknięta” albo „Ten link
  wygasł” zamiast kodu;
- kod urządzenia (6 cyfr) ważny tylko w tym uruchomieniu.

### 6.7 Baza (zakres zmian)

- `poll_open`: nowy `share_key_poll`; usuwa zaproszenia poprzedniego
  uruchomienia (albo oznacza je jako nieaktualne kluczem);
- nowa akcja „przerwij” (do szkicu, bez przeliczania);
- zamknięcie bez warunku „czekające zaproszenia”;
- `poll_tasks`: stany `pending` / `done` / `declined`; usunięcie udostępnienia = usunięcie zaproszenia i głosu tej osoby;
  zaproszenie ważne tylko przy bieżącym kluczu gry;
- uruchom / zamknij / przerwij / zaproszenia / reset: `auth.uid()` =
  właściciel + blokada `game:G` tej karty;
- usunięcie subskrybenta wycofuje jego zaproszenia;
- usunięcie nieużywanych RPC (sekcja 4) i huba.

### 6.8 Usunięcie gry i konta

Wg [`usuwanie-danych.md`](usuwanie-danych.md) (E12). Dla ankiet:
usunięcie gry z otwartą ankietą = Przerwij + usuń; zaproszenia i maile
w kolejce znikają; głosujący i zaproszeni widzą „Ta ankieta została
usunięta”.

## 5. Wpływ na inne plany

- `ujednolicenie-wygladu.md`: sekcja o hubie nieaktualna (hub znika);
  subskrypcje — układ list + trzecia karta Zadania.
- `nawigacja-mapa-plan.md`, sekcja 8: `/polls/` jako hub odpada; adres
  strony ankiety i subskrypcji do ustalenia przy E5b.

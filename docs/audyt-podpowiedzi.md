# Audyt podpowiedzi i tłumaczeń (2026-10-23)

Polecenie użytkownika: audyt podpowiedzi w systemie — skuteczność, klarowność,
trafność, sensowność, nieoczywistość (**oczywistych rzeczy nie podpowiadamy**).

Zakres: wszystkie teksty-podpowiedzi stron (`web/shared/translation/pl.js`,
klucze `*hint*`, `*Hint*`, `*help*`, `tooltips`) — 222 klucze — plus logika
podpowiedzi Control (`web/shared/js/gameplay/hints.js`, `web/control/js/ui.js`
`hintBlock`, ekrany `c2-intro`). Każdy klucz sprawdzony w kodzie: gdzie się
pokazuje i obok czego (etykiety przycisków, pasek statusu). EN/UK sprawdzone
wyrywkowo (zgodność z etykietami przycisków).

Ocena: ✅ zostaje · ✏️ przeredagować · ➕ brakuje podpowiedzi · ✖ usunąć.

## Wnioski główne

1. **Najważniejszych nieoczywistości Control nikt nie podpowiada**, a część
   podpowiedzi mówi rzeczy widoczne na przyciskach. Brakuje:
   - **dwa kliknięcia** — odpowiedzi, X, „Oddaj kontrolę”, „Zatwierdź” to kafle
     z potwierdzeniem: pierwsze kliknięcie zaznacza, drugie wykonuje
     (`armableTile`, `ui.js:843`). Dla myszy nigdzie tego nie ma (skróty
     „X → Enter” opisują to tylko klawiaturze); operator klika raz i „nic się
     nie dzieje”.
   - **odliczanie 3 s kończy się X-em** (`EXPIRE_TIMER3` → `resolved: "X"`,
     `engine.js:402`). Dawna podpowiedź („czas=X”) jest martwa.
   - **trzeci X uruchamia kradzież** automatycznie — było tylko w martwym
     `roundsPlayHint`.
   - **„Oddaj kontrolę” tylko przed pierwszym trafieniem** (`PASS`,
     `allowPass` znika po trafieniu) — `playOrPass` tego nie mówi.
   - **pojedynek**: po odpowiedzi pierwszej drużyny (nie najwyżej
     punktowanej) odpowiada druga; wygrywa wyżej punktowana. `duelAnswering`/
     `duelNowAnswering` mówią tylko „odpowiada: X”.
2. **Martwe teksty**: ~85 kluczy PL (×3 języki) nieużywanych w kodzie albo
   nieosiągalnych — głównie stary Control 1 i stare przestrzenie `pollsHub*`.
   Mylą tłumaczy i audyty (np. `control.colorHint` z literówką „bierząco”).
3. **Ten sam wzorzec, różne podpowiedzi** — lista kafli z podwójnym
   naciśnięciem (zmiana nazwy): Gry, Bazy i Logo działają tak samo
   (`addRenameGesture`), ale Gry mówią „Zaznacz grę, aby włączyć akcje
   i eksport…”, Bazy „Naciśnij kafelek, żeby go zaznaczyć…”, a Logo **w ogóle
   nie mówią** o zmianie nazwy (pasek pokazuje podtytuł rodzaju logo,
   `logos/js/list.js:176`). Zasada symetrii z CLAUDE.md.
4. **Niezgodność z etykietą przycisku**: EN `duelFirst`/`duelPhysical` każe
   kliknąć „Confirm”, a przycisk to „Accept: {name}”. EN/UK `rRoundStart`
   cytuje skrót („Start”/«Розпочати») zamiast pełnej etykiety — to akurat
   zgodne z EN/UK `roundsStartBtn`, ale niespójne z PL („Rozpocznij rundę”).
5. **Liczby wpisane na sztywno** zamiast stałych: `control.finalAnswerLengthHint`
   („11 znaków”) i `editor.importModal.formatHint` („17 znaków”) — stałe są
   w `answer-text.js` (`FINAL_DISPLAY_MAX`, `ANSWER_MAX`), a
   `questionForm.hints` już ich używa.

## Control — podpowiedzi w trakcie gry (`control.hints.*`)

Zasada w kodzie (`hints.js:33`) jest dobra: podpowiedź mówi **następny krok**,
nie powtarza paska statusu. Kilka tekstów jej nie spełnia.

| Klucz | Treść PL | Ocena | Propozycja |
|---|---|---|---|
| `duelWaiting` | Przycisk aktywny. Czekam na zgłoszenie drużyny. | ✅ | — (mówi, że czekamy na urządzenie, nie na operatora) |
| `duelFirst` | Pierwsza: {team}. Kliknij „Zatwierdź”, żeby przyjąć zgłoszenie. | ✏️ | „Pierwsza” źle brzmi z nazwą wpisaną przez użytkownika („Pierwsza: Kowalscy”). Przycisk i tak pokazuje „Zatwierdź: {team}”. Wartość ma tylko alternatywa: „Zgłoszenie: {team}. Zatwierdź albo — jeśli to falstart — „Ponów naciśnięcie”.” |
| `duelPhysical` | Obserwuj, kto nacisnął przycisk jako pierwszy. Kliknij drużynę, a potem „Zatwierdź”. | ✅ | EN: „Confirm” → „Accept” |
| `duelAnswering` / `duelNowAnswering` | Pojedynek — odpowiada: {team}. / Teraz odpowiada: {team}. | ✏️ | „Pojedynek —” powtarza nagłówek kroku. Dwa klucze różnią się tylko tym słowem. Jeden tekst z regułą: „Odpowiada: {team}. Jeśli nie trafi najwyżej punktowanej, odpowiada druga drużyna — wygrywa wyższa.” (druga połowa tylko przy pierwszej odpowiedzi cyklu) |
| `playNoTeam` | Brak drużyny grającej. | ✏️ | Stan błędny, operator nic nie może. Albo usunąć, albo powiedzieć, co zrobić (np. wrócić krok). |
| `playOrPass` | Może zagrać dalej albo oddać kontrolę. | ✏️ | Brak podmiotu, pomija regułę. „Drużyna może grać albo oddać pytanie — tylko teraz, przed pierwszym trafieniem.” |
| `playPick` | Wskaż trafioną odpowiedź albo kliknij X (pudło). | ✏️ | Oczywiste (kafle mają te etykiety). Zamienić na nieoczywiste: „Kafel klikasz dwa razy: zaznacz, potwierdź. Koniec odliczania 3 s = X. Trzeci X — kradzież.” |
| `playCanEnd` | Wszystkie odpowiedzi odsłonięte. Kliknij „Zakończ rundę”. | ✅ | — |
| `stealChance` | Szansa na kradzież. Kliknij trafioną odpowiedź albo X (pudło). | ✏️ | Druga część oczywista. Nieoczywiste: „Jedna próba drużyny przeciwnej: trafienie zabiera cały bank.” |
| `stealWon` / `stealLost` | Kradzież udana — bank przechodzi… / …zostaje… | ✏️ | Mówią wynik, nie następny krok (wbrew zasadzie). Dopisać: „Odsłoń pozostałe odpowiedzi albo zakończ rundę.” |
| `reveal` | Odsłoń pozostałe odpowiedzi. Punkty się nie zmienią. | ✅ | wzór dobrej podpowiedzi — druga część jest nieoczywista |
| `entryIdle` / `entryRunning` / `entryTimeUp` | Wpisz odpowiedzi gracza {round}… | ✅ | „i uruchom odliczanie” — kolejność zależy od studia; zostawić |
| `mapRevealAnswer` | Sprawdź odpowiedź i odsłoń ją. | ✏️ | Nieoczywiste jest to, że rozstrzygnięcie jest **już wybrane** (dopasowanie / „Nie ma na liście” / „Brak odpowiedzi” — komentarz `hints.js:105`). „Sprawdź zaznaczone dopasowanie (zmień, jeśli trzeba) i odsłoń.” |
| `mapRevealPoints` | Odsłoń punkty. | ✏️ | Oczywiste po odsłonięciu odpowiedzi; można zostawić jako krok, ale krócej łączyć z `mapRevealAnswer` („Enter — odpowiedź, Enter — punkty” jest już w skrótach). |
| `mapNext` | Przejdź dalej. | ✖ | Oczywiste — przycisk „Dalej” jest jedynym aktywnym. Pusta podpowiedź = brak bloku. |
| `mapRepeat` | Powtórzenie: brak punktów. Odsłoń odpowiedź. | ✅ | — |
| `mapReached200` / `mapAllRevealed` | …Zakończ finał. | ✅ | `mapReached200`: „próg finału” → „200 punktów (cel finału)” — konkretniej |
| `rIntro`, `rRoundStart`, `fStart`, `p2Start`, `fEnd` | — | ✖ | **Nieosiągalne**: te kroki rysują ekran `c2-intro` z własnym tekstem (`roundsIntroHint`, `roundsStartHint`, `finalStartHint`, `finalP2StartHint`), `hintBlock` nie powstaje. Gałęzie i klucze do usunięcia (+ `tests/unit/hints.test.js`). |

### Ekrany przejściowe i ustawienia urządzeń (`control.*Hint`)

| Klucz | Ocena | Uwagi |
|---|---|---|
| `roundsIntroHint` | ✏️ | „zostanie otworzone intro” — „zostanie odtworzone”. Treść sensowna (mówi, co zobaczą widzowie). |
| `roundsStartHint`, `finalStartHint`, `endHint*`, `finalOutroHint` | ✅ | mówią, co zobaczy Wyświetlacz/prowadzący — nieoczywiste |
| `finalP2StartHint` | ✅ | — |
| `finalAnswerLengthHint` | ✏️ | liczba z `FINAL_DISPLAY_MAX`, nie na sztywno; doklejana przy każdym wpisywaniu — wystarczy raz (runda 1) |
| `deviceCodeHint` | ✏️ | ten sam sens co `qrModalCodeHint`, `polls.qrModal.hint`, `connectDevice.enterCode.hint` — 4 różne zapisy (cudzysłów prosty `"…"` vs „…”, strzałki vs zdanie). Jeden tekst. |
| `physicalBuzzerHint`, `noHostTabletHint` | ✅ | nieoczywiste konsekwencje opcji |
| `soundSourceDisplayHint` | ✅ | — |
| `testModeHint` | ✏️ | „Wyświetlacz, prowadzący i przycisk w tym oknie.” — skrót myślowy; „Wszystkie trzy urządzenia pokażą się w tym oknie — do próby bez drugiego ekranu.” |

### Skróty klawiszowe (`control.shortcuts.*`)

Lista doklejana pod każdą podpowiedzią w grze (`ui.js:1980`). Uwagi:
- `b` — „B → Enter — powrót / ręczny wybór drużyny B w pojedynku”: dwa
  znaczenia w jednym wierszu; na danym ekranie pokazywać tylko to, które działa.
- `n` — „przycisk dalszego przejścia” — mówić, co robi („Dalej”).
- Lista jest długa przy każdym kroku; to dobre miejsce na nieoczywiste
  (Ctrl+Enter, Shift+Enter), ale skróty liter = etykiety kafli są oczywiste
  dla kogoś, kto widzi literę na kaflu (`data-shortcut`). Do rozważenia: lista
  zwinięta, rozwijana.

## Strony

| Klucz | Ocena | Uwagi / propozycja |
|---|---|---|
| `games.hint.selectPlus` | ✏️ | „Zaznacz grę, aby włączyć akcje i eksport” — oczywiste (przyciski wyszarzone). Nieoczywiste jest tylko podwójne naciśnięcie. Wspólny tekst dla Gier, Baz, Logo: „Podwójne naciśnięcie kafla zmienia nazwę.” |
| `bases.headerHint` | ✏️ | jw. — „Naciśnij kafelek, żeby go zaznaczyć” oczywiste |
| `bases.headerHintShared` | ✖ | „Naciśnij kafelek, żeby go zaznaczyć.” — tylko oczywistość |
| Logo — pasek listy | ➕ | brak informacji o zmianie nazwy, choć działa (`list.js:332`) |
| `games.market.hint` | ✖ | „Zaznacz grę, aby włączyć akcje.” — oczywiste |
| `tasks.bar.hint`, `contacts.friends.hint`, `contacts.subscribers.hint` | ✅ | definiują pojęcie (kim jest subskrybent) — nieoczywiste |
| `polls.tally.hintText` / `hintTextTouch` / `hintPoints` | ✅ | wzorcowe: przeciąganie = scalanie i próg 4% są nieoczywiste |
| `editor.config.*.hintTop/Bottom` | ✅ | warunki gotowości — trafne; „widzowie” → „ankietowani” (odpowiadają osoby z ankiety, nie widzowie gry) |
| `questionForm.hints.answerLimit` | ✏️ | łączy dwie sprawy: limit (pole przycina na bieżąco, `wireTextLimit` — więc „zostaną przycięte” dotyczy tylko wklejania) i nieobsługiwane znaki (stała podpowiedź o błędzie, który zwykle nie występuje). Limit zostawić; zdanie o znakach pokazywać tylko przy błędzie (już jest oznaczanie w `mark()`). |
| `questionForm.hints.finalDisplay` | ✅ | nieoczywiste |
| `editor.importHint` | ✅ | — |
| `editor.importModal.formatHint` | ✏️ | „17 znaków” na sztywno → `ANSWER_MAX` |
| `gameSettings.questions.roundsModeHint` | ✏️ | najsłabiej czytelna: „przy wejściu do Podsumowania” (krok Control, nie tej strony), „ręcznie wybrane pytania finału pomija”, „Rundy wykorzystują pytania po kolei” — trzy zdania o „Losowe”, kolejność myśli. Propozycja: „Losowe — kolejność pytań losowana przy każdym starcie gry (bez pytań finału). Kolejność — tylko pytania z zakładki „Pytania — Rundy”, w ustalonej kolejności.” (do potwierdzenia z kodem tasowania) |
| `gameSettings.questions.finalModeHint` | ✅ | — |
| `gameSettings.finale.dragHint` vs `control.finalListHint` | ✏️ | „musisz wybrać 5” obok etykiety „Pytania finału (max 5)” — sprzeczność („max” vs „dokładnie”). `finalListHint` → „Pytania finału (5)”. `finalPoolHint`/`finalListHint` to nagłówki kolumn, nie podpowiedzi (przenieść do kluczy etykiet). |
| `gameSettings.rounds.hint` / `hintPhone` | ✅ | — |
| `gameSettings.game.prizeHint`, `finalMinPointsHint`, `roundMultipliersHint` | ✅ | nieoczywiste reguły — dobre |
| `gameSettings.teams.defaultHint` | ✅ | — |
| `gameSettings.display.hostLogoHint` | ✏️ | „Piksele pokazują dotychczasową wersję. Źródło wykorzystuje…” — niezrozumiałe bez kontekstu opcji; nazwać skutek: „Logo na urządzeniu prowadzącego: Piksele — tak jak na planszy; Źródło — oryginalny obraz, rysunek lub napis.” |
| `account.usernameHint` | ✏️ | „Widoczna dla subskrybentów i w panelu” — „w panelu” = ? Wymienić, kto widzi (znajomi, osoby, którym udostępniasz, subskrybenci). |
| `account.emailHint` | ✏️ | „Zmieniaj adres logowania.” — dziwny tryb; druga część dubluje `emailPostHint`. „Adres do logowania. Zmianę potwierdzasz linkiem z nowej skrzynki.” |
| `account.passwordHint` | ✏️ | dubluje żywą listę wymagań z `auth.passwordHint*` przy polu — jeden z nich |
| `account.emailNotifHint` | ✏️ | „Otrzymywać wiadomości…” — bezokolicznik bez podmiotu, długie. „Maile o zaproszeniach, zadaniach i udostępnionych bazach. Bez maili zobaczysz je tylko na stronie.” |
| `account.demo.hint` + `btnHint` | ✏️ | dwie linijki o jednym przycisku; `btnHint` ważne (przenosi na inną stronę) — złączyć w jedno zdanie |
| `account.deleteHint*`, `migrateHint`, `migratePendingHint` | ✅ | — |
| `confirm.*Hint`, `reset.*Hint` | ✅ | konkretne, co zrobić dalej |
| `connectDevice.header.hintMobile/Desktop`, `scan` | ✅ | — |
| `bases.shareModal.hint`, `control.shareDeviceModal.hint`, `polls.share.addRecipientsHint` | ✏️ | trzy okna udostępniania, trzy wersje; ujednolicić. „Zaznacz znajomych” — oczywiste przy liście z polami wyboru; zostawić „Wpisz nazwę lub e-mail.” |
| `baseExplorer.search.sheetHelp` | ✅ | nieoczywiste (tekst + filtry razem) |
| `baseExplorer.rename.help`, `tags.createModeHelp`, `tags.editModeHelp` | ✖ | „Wpisz nową nazwę i zapisz.” / „Dodaj nowy tag.” — powtarzają tytuł okna |
| `baseExplorer.export.typeHint*` | ✅ | warunki eksportu — nieoczywiste |
| `logoEditor.draw.tooltips.*` | ✅ | dymki narzędzi; `shapesLines` (Shift, 15°) wzorcowy |
| `logoEditor.image.previewHint` | ✅ | — |
| `snake.keysHint` | ✅ | — |
| `notFound.*RedirectHint` | ✅ | — |

## Martwe klucze (do usunięcia ze wszystkich trzech języków)

Sprawdzone: brak użycia w `web/`, `supabase/`, `scripts/` (także dynamicznego
— jedyne dynamiczne odwołania to `logoEditor.draw.tooltips.${k}`
i `questionForm.hints.${key}`, oba żywe; `authEmail.*` czyta funkcja
`send-email` — żywe).

- Control 1: `control.colorHint`, `audioUnlockHint`, `teamHint`,
  `lookThemeHint`, `lookLogoHint`, `extraSettingsHint`, `roundMultipliersHint`,
  `finalPrizeMultiplierHint`, `mainPrizeAmountHint`, `finalOnlyHint`,
  `roundsPickHint`, `setupFinishHint`, `roundsReadyHint`, `roundsDuelHint`,
  `roundsDuelHintPhysical`, `roundsPlayHint`, `roundsGameEndHint`,
  `finalP1EntryHint`, `finalMapHint`, `finalP2EntryHint`, `finalEndHint`,
  `finalUi.mapHintInputPrefix`, `finalUi.mapHintNoInput`,
  `finalUi.mapHintNoText`.
- Control 2, gałęzie nieosiągalne: `control.hints.rIntro`, `rRoundStart`,
  `fStart`, `p2Start`, `fEnd`.
- Ankiety (stare przestrzenie): `pollsHub.*`, `pollsHubPolls.*`,
  `pollsHubSubscriptions.*` — klucze `header.hint`, `sections.*Hint`,
  `shareHint.*`, `shareLockedHint`, `shareHintMissing`, `bar.hint*`;
  `pollsHub.mail.linkHint`, `pollsHubPolls.mail.linkHint` (żywy jest tylko
  `pollsHubSubscriptions.mail.linkHint`).
- Inne: `buzzer.rotateHint`, `games.header.hint`, `games.hint.select`,
  `logoEditor.list.hint` (do odzyskania jako wspólny tekst listy — wniosek 3),
  `connectDevice.scan.hint`, `connectDevice.enterCode.hint`.

## Proponowana kolejność poprawek

1. Control: dopisać nieoczywiste (dwa kliknięcia, 3 s = X, trzeci X,
   oddanie tylko przed trafieniem, reguła pojedynku, następny krok po
   kradzieży); usunąć oczywiste (`mapNext`, druga część `playPick`/
   `stealChance`); EN „Confirm” → „Accept”. Test unit `hints.test.js`.
2. Usunąć martwe klucze i gałęzie (PL/EN/UK) — bez zmian widocznych.
3. Listy kafli: jeden tekst o podwójnym naciśnięciu dla Gier, Baz i Logo.
4. Stałe zamiast liczb (`FINAL_DISPLAY_MAX`, `ANSWER_MAX`).
5. Redakcja stron (ustawienia gry, konto, okna udostępniania, kod urządzenia).

Zmiany wyłącznie tekstowe/UI: unit + zrzuty `scripts/screens` (Control,
Ustawienia gry, Konto, listy), jeden szybki przebieg e2e Control
(spece sprawdzające teksty podpowiedzi — przed zmianą przejrzeć `--grep`
na `c2-hint`).

## Audyt tłumaczeń — nieużywane klucze

Polecenie użytkownika (2026-10-23): dodać audyt tłumaczeń na nieużywane
i wykonać razem z poprawkami podpowiedzi.

Narzędzia:
- `scripts/i18n-unused.mjs` — lista nieużywanych kluczy
  `web/shared/translation/{pl,en,uk}.js`. Klucz jest używany, gdy kod
  (`web`, `supabase/functions`, `cloudflare`, `scripts`; bez testów) ma go
  dosłownie, gdy pasuje do prefiksu dynamicznego (`` t(`ns.${x}`) ``,
  `"ns." + x`) albo gdy należy do sekcji czytanej w całości poza stroną
  (`authEmail` — send-email, `marketplaceSsr` i `contactEmail` — Worker).
  Klucze maili powiadomień są w `scripts/sync-notification-mail-texts.mjs`,
  więc liczą się jako używane.
- `scripts/i18n-prune.mjs` — wycina nieużywane klucze ze źródła (parser
  literału obiektu; formatowanie, funkcje i komentarze zostają; pusty obiekt
  znika). Po wycięciu sprawdza, że zostały dokładnie oczekiwane klucze
  z niezmienionymi wartościami.
- Zapadka `tests/unit/i18nUnused.test.js`: brak nieużywanych kluczy i ten
  sam zestaw kluczy w PL/EN/UK.

Weryfikacja wyników: brak innych form składania kluczy (zmienne z
prefiksem, `${ns}.x`, `.join(".")`), wyrywkowo sprawdzone grupy
(`privacy.contact.*`, `tasks.deviceType.*`, `security.selfXssWarning`,
`pollsHub*`); teksty usuniętych kluczy nie występują w asercjach e2e.
Testy unit, które sprawdzały istnienie martwego klucza
(`pollAnonymous.wait`), poprawione na klucze faktycznie używane.

Wynik: **995 kluczy usuniętych w każdym języku (3523 → 2528)**, `pl.js`
199 KB → 150 KB.

| Sekcja | Usunięte / było |
|---|---|
| `control` | 231 / 518 (stary Control 1) |
| `pollsHubSubscriptions` | 189 / 198 |
| `pollsHub` | 173 / 173 (cała sekcja) |
| `pollsHubPolls` | 164 / 175 |
| `bases` | 48 / 164 |
| `baseExplorer` | 33 / 242 |
| `gameSettings` | 29 / 122 |
| `polls` | 23 / 163 |
| `editor` | 18 / 90 |
| `privacy` | 15 / 20 (stary formularz kontaktu) |
| `tasks` | 15 / 39 |
| `index` | 12 / 78 |
| `logoEditor` | 10 / 186 |
| `games` | 9 / 186 |
| `connectDevice` | 7 / 43 |
| `maintenance` | 6 / 15 |
| `account` | 5 |
| `marketplace` | 4 |
| `contacts` | 3 |
| `auth` | 2 |
| `pollSharePanel`, `buzzer`, `manual`, `pollAnonymous`, `notFound`, `security` | po 1 |

## Wykonane (2026-10-23)

Control:
- nowe podpowiedzi o nieoczywistych regułach: reguła pojedynku (z nazwą
  drużyny wygrywającej przy remisie), 3 s = X i trzeci X → kradzież,
  oddanie kontroli tylko przed pierwszym trafieniem, kradzież zabiera cały
  bank, mapowanie finału „sprawdź zaznaczony wybór”, cel finału z liczbą
  punktów z ustawień;
- **zaznaczony kafel** (zaznacz → potwierdź): na czas zaznaczenia blok
  podpowiedzi mówi „Kliknij zaznaczony kafel jeszcze raz (albo Enter)…”
  (`ui.js`, po renderze, gdy jest `.c2-tile-armed`);
- usunięte oczywiste („Przejdź dalej”, „Wskaż trafioną… albo X”) i
  nieosiągalne gałęzie (`r_intro`, `r_roundStart`, `f_start`, `f_p2_start`,
  `f_end`, brak drużyny);
- EN „Confirm” → „Accept” (zgodnie z przyciskiem), „11 znaków” ze stałej
  `FINAL_DISPLAY_MAX`.

Strony:
- jeden tekst `common.renameTileHint` („Podwójne naciśnięcie kafla zmienia
  nazwę.”) na Grach, Bazach (moje) i Logo (zamiast opisu rodzaju, który
  powtarzał tekst kafla „Nowe logo…”);
  bez podpowiedzi w Społeczności i Udostępnionych bazach (tylko oczywistość);
- bez oczywistych opisów w oknie zmiany nazwy i tagów Eksploratora;
- Konto: nazwa użytkownika (kto ją widzi), e-mail (jedna podpowiedź
  zamiast dwóch o tym samym), powiadomienia, demo (jedna linia zamiast dwóch);
- kod urządzenia — jeden zapis w Control (okno QR, krok urządzeń)
  i ankietach;
- Ustawienia gry: tryb kolejności rund (bez „Podsumowania”), logo
  prowadzącego, „Pytania finału (5)” zamiast „(max 5)”;
- formularz pytania: limit znaków bez stałego zdania o nieobsługiwanych
  znakach (błąd pokazuje się przy polu, `questionForm.errors.answerChars`);
- edytor: „uczestnicy ankiety” zamiast „widzowie”; literówka „otworzone”.

Zostawione: `editor.importModal.formatHint` ma „17 znaków” na sztywno —
statyczne `data-i18n` nie przyjmuje parametrów, a stała się nie zmienia.

## Dublowanie w jednym widoku (2026-10-23)

Polecenie użytkownika: „Podpowiedź loga dubluje podpowiedź na kaflu. Sprawdź
podobne przypadki dublowania w jednym widoku.”

Metoda: skaner na scenach `scripts/screens` (PL, komputer i telefon, ~500
scen bez Podręcznika — jego sceny zawieszają się w środowisku zrzutów):
widoczne teksty bloków dzielone na zdania; zgłaszane zdania (≥ 15 znaków)
powtórzone w jednym widoku i zdania prawie równe (wspólne słowa ≥ 70% albo
zawieranie). W tym samym przejściu: surowe klucze tłumaczeń na stronach —
**brak**. Większość trafień to dane (nazwy, daty, adresy), nawigacja
(zakładka ↔ tytuł sekcji, spis treści Podręcznika) albo przycisk ↔ tytuł
okna, które otwiera — zostają.

Poprawione:
| Widok | Było | Teraz |
|---|---|---|
| Logo — lista | opis rodzaju w pasku = tekst kafla „Nowe logo…” | pasek: tylko „Podwójne naciśnięcie kafla zmienia nazwę.” |
| Edytor gry (preparowana) | dolna podpowiedź „Każda odpowiedź co najmniej 4 pkt, suma… 100” = lista warunków | bez dolnej podpowiedzi |
| Edytor logo — obraz | „Obszar wyświetlacza” jako tytuł karty i podpis w ramce kadrowania (na obrazie) | tylko tytuł karty |
| Edytor logo — napis | „Napis się nie mieści: szerokość 86/30” + „Szerokość: 86/30 (nie mieści się)” | ostrzeżenie „Napis się nie mieści — skróć go.”, pomiar „Szerokość: 86/30.” |
| Logowanie (rejestracja), reset hasła, konto | podpowiedź „Hasło musi zawierać: …” i błąd z tym samym początkiem | błąd: „Brakuje: …” (tylko braki) |
| Reset hasła | tytuł „Ustaw nowe hasło” + „Link OK. Ustaw nowe hasło.” | „Link jest ważny.” |
| Control — start gry, rundy, finału, rundy 2 finału | duży tytuł = przycisk („Rozpocznij rundę” ×2) | bez tytułu; opis (co pokaże Wyświetlacz) jest główną treścią |
| Control — koniec gry | tytuł „Koniec gry” = nagłówek kroku | bez tytułu |
| Podłącz wyświetlacz (TV) — zły kod | błąd powtarzał etykietę „Wpisz kod … z panelu sterowania” | „Ten kod nie jest kodem wyświetlacza. Pasuje też kod ekranu QR z ankiety.” |
| Wypisanie od właściciela (`/go`) | tytuł = przycisk „Wypisz się od X”, opis „Kliknij poniżej…” | „Ankiety od X”, skutek wypisania, przycisk „Wypisz się” |
| Strona główna | tytuł sekcji ≈ h1; zdanie o widoku prowadzącego w sekcji i w kaflu 4 | „Jak działa Familiada Online”; zdanie tylko w sekcji |

Zostawione celowo: „Zostaną same pytania” przy dwóch opcjach zmiany typu
(każda opcja ma swój opis), „Gry społeczności” w górnym pasku i jako
zakładka (dwa różne miejsca), dymek przycisku-ikony „Proponowane
kategorie”.

## Decyzje

- **2026-10-23 (użytkownik):** audyt tłumaczeń na nieużywane klucze
  i poprawki podpowiedzi wykonać razem.
- **2026-10-23 (użytkownik):** podpowiedzi w Control nie mogą być za długie —
  zawsze mieszczą się bez przewijania. Pilnuje tego test
  `hints.test.js` (każda `control.hints.*` ≤ 90 znaków, PL/EN/UK); pomiar
  w przeglądarce (najdłuższa nazwa drużyny, lista skrótów finału, okna
  1180×820, 1024×700 i 980×640 — najmniejsza szerokość Control) —
  wszystko się mieści.
- **2026-10-23 (użytkownik):** zasady podpowiedzi i obowiązek pilnowania
  tłumaczeń przy każdej zmianie dopisane do zasad agentów (`CLAUDE.md`,
  `AGENTS.md`) i do wzorców UI (`docs/wzorce-ui.md` „A16. Podpowiedzi”).

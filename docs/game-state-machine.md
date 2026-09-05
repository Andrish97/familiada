<!-- WYGENEROWANE z shared/gameStateMachine.js przez scripts/gen-game-state-docs.mjs — nie edytuj ręcznie. -->

# Mapa stanów gry — public.game_state.step

Ta strona jest wygenerowana z `shared/gameStateMachine.js` — jedynego źródła prawdy, którego `assertTransition()` egzekwuje w `control2/js/engine.js`. Zmiana zachowania wymaga zmiany w kodzie; ten dokument aktualizuje się przez `node scripts/gen-game-state-docs.mjs`.

## Karta: `devices`

### `devices_display`

- **Karta**: `devices`
- **Wejście**: start gry / pierwsze wejście w Control
- **Zapis (`detail`)**: detail.display.mode='BLACK' (wartość domyślna)
- **Display**: Czarny ekran — wynika z odczytu domyślnego wiersza, nie ze specjalnej komendy startowej.
- **Host**: Nieaktywny/nieotwarty.
- **Buzzer**: Nieaktywny/nieotwarty.
- **Dźwięki**: —
- **Dozwolone kolejne kroki**: `devices_hostbuzzer`

### `devices_hostbuzzer`

- **Karta**: `devices`
- **Wejście**: operator potwierdza połączenie Display
- **Zapis (`detail`)**: detail.display.mode ('BLACK'|'QR'), detail.display.qr.{host,buzzer}.show (niezależne, jeden LUB oba naraz)
- **Display**: BLACK domyślnie; QR z qr.host.show/qr.buzzer.show gdy operator kliknie 'QR na wyświetlaczu' dla Hosta/Buzzera (niezależnie).
- **Host**: Czeka na połączenie (lub pominięty przez flags.noHostTablet).
- **Buzzer**: Czeka na połączenie (lub pominięty przez flags.physicalBuzzer).
- **Dźwięki**: —
- **Dozwolone kolejne kroki**: `setup_finish`

## Karta: `setup`

### `setup_finish`

- **Karta**: `setup`
- **Wejście**: oba urządzenia połączone (lub odhaczone jako nie dotyczy)
- **Zapis (`detail`)**: detail.settings.* (denormalizowane z games.settings), detail.rounds._questionPool / detail.final.picked (losowane raz, jeśli tryb random)
- **Bramkowane przez ustawienia**: `hasFinal`, `roundsQuestionsMode`, `finalQuestionsMode`
- **Display**: BLACK — zostaje czarny przez cały etap ustawień; podgląd kolorów/motywu/logo renderuje się lokalnie w Control (miniaturka), nie na prawdziwym Display.
- **Host**: Nieaktywny.
- **Buzzer**: Nieaktywny.
- **Dźwięki**: —
- **Dozwolone kolejne kroki**: `r_intro`

## Karta: `rounds`

### `r_intro`

- **Karta**: `rounds`
- **Wejście**: operator klika 'Rozpocznij' po zakończeniu ustawień
- **Zapis (`detail`)**: locks.gameStarted=true
- **Display**: Logo/plansza powitalna.
- **Host**: Puste.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `show_intro`
- **Dozwolone kolejne kroki**: `r_roundStart`

### `r_roundStart`

- **Karta**: `rounds`
- **Dozwolone fazy**: `READY`
- **Wejście**: koniec poprzedniej rundy (bez wejścia w finał/koniec gry) lub po r_intro
- **Zapis (`detail`)**: roundNo
- **Display**: Logo widoczne, plansza rundy jeszcze ukryta.
- **Host**: Puste, czeka.
- **Buzzer**: Wyłączony.
- **Dźwięki**: —
- **Dozwolone kolejne kroki**: `r_duel`

### `r_duel`

- **Karta**: `rounds`
- **Dozwolone fazy**: `DUEL`
- **Wejście**: operator klika 'Start rundy' (startRound())
- **Zapis (`detail`)**: question, answers, duel={enabled,lastPressed,firstTeam,secondTeam,currentTeam}
- **Bramkowane przez ustawienia**: `roundsQuestionsMode`, `physicalBuzzer`
- **Display**: Plansza rundy wjeżdża (odpowiedzi zakryte), logo znika, INDICATOR OFF.
- **Host**: Pytanie widoczne (SET1), odpowiedzi zakryte (SET2 puste).
- **Buzzer**: Włączony (ON) w trybie normalnym; nieużywany w trybie physicalBuzzer. Wciśnięcie zapisuje duel.lastPressed bezpośrednio (game_state_buzzer_press).
- **Dźwięki**: `round_transition`, `reveal`
- **Dozwolone kolejne kroki**: `r_play`

### `r_play`

- **Karta**: `rounds`
- **Dozwolone fazy**: `DUEL`, `PLAY`, `STEAL`, `REVEAL`
- **Wejście**: przyjęcie bzyczenia (phase pozostaje DUEL do rozstrzygnięcia pojedynku), potem naturalne przejścia PLAY→STEAL→REVEAL wewnątrz tego samego kroku
- **Zapis (`detail`)**: controlTeam, bankPts, xA, xB, revealed[], steal={active,used,team,won}, allowPass, passUsed
- **Display**: INDICATOR ON_A/ON_B (kto ma kontrolę — zmienia się przy CONTINUE_SECOND/RESET/STEAL); odsłonięte odpowiedzi z punktami; lampki X (sloty 1-3 licznik, slot 4 osobny 'duży X'/flash); TOP=bank; LEFT/RIGHT=wyniki drużyn.
- **Host**: SET1=tytuł zależny od fazy + pytanie, SET2=lista odpowiedzi z zielonym podświetleniem odkrytych. Host NIGDY nie pokazuje banku, X ani wskaźnika kontroli.
- **Buzzer**: Wyłączony przez cały ten krok.
- **Dźwięki**: `buzzer_press`, `answer_correct`, `answer_wrong`, `reveal`, `round_transition`
- **Dozwolone kolejne kroki**: `r_duel`, `r_play`, `r_roundStart`, `f_start`, `r_gameEnd`

### `r_gameEnd`

- **Karta**: `rounds`
- **Wejście**: koniec ostatniej rundy bez finału (próg osiągnięty ale hasFinal!==true, lub pula pytań wyczerpana)
- **Zapis (`detail`)**: totals
- **Bramkowane przez ustawienia**: `endScreenMode`
- **Display**: RBATCH ANIMOUT, potem LOGO SHOW (zawsze przy remisie) lub WIN <najwyższy wynik> ('points' i 'money' identyczne w tej ścieżce — brak finału, brak realnej kwoty do policzenia).
- **Host**: Wyczyszczony.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `show_intro`
- **Dozwolone kolejne kroki**: — (terminalny)

## Karta: `final`

### `f_start`

- **Karta**: `final`
- **Wejście**: próg punktowy osiągnięty i hasFinal===true i finał poprawnie skonfigurowany
- **Zapis (`detail`)**: winnerTeam, final.picked (5 pytań)
- **Bramkowane przez ustawienia**: `hasFinal`, `finalMinPoints`, `finalQuestionsMode`
- **Display**: Plansza finału z placeholderami od razu widoczna (nie czeka na pierwsze odsłonięcie).
- **Host**: COVER + puste pole 2.
- **Buzzer**: Wyłączony na cały finał (jedyna komenda do Buzzera w finale).
- **Dźwięki**: `final_theme`, `reveal`
- **Dozwolone kolejne kroki**: `f_p1_entry`

### `f_p1_entry`

- **Karta**: `final`
- **Wejście**: start finału
- **Zapis (`detail`)**: runtime.timer={running,phase:'P1',endsAt}, runtime.p1[i].text
- **Display**: LEFT/RIGHT po stronie zwycięzcy pokazują odliczanie (15s) — polimorficzne pole, poza finałem to wyniki drużyn.
- **Host**: Tytuł rundy 1 (z odliczaniem gdy timer aktywny) + status 5 pytań.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `time_over`
- **Dozwolone kolejne kroki**: `f_p1_map_q1`

### `f_p1_map_q1`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 1, pytanie 1/5
- **Zapis (`detail`)**: runtime.map1[0]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FL — najpierw tekst odpowiedzi, dopiero potem FA punkty + FSUMA A (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 1, tytuł gracza 1. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p1_map_q2`, `f_end`

### `f_p1_map_q2`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 1, pytanie 2/5
- **Zapis (`detail`)**: runtime.map1[1]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FL — najpierw tekst odpowiedzi, dopiero potem FA punkty + FSUMA A (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 2, tytuł gracza 1. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p1_map_q3`, `f_end`

### `f_p1_map_q3`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 1, pytanie 3/5
- **Zapis (`detail`)**: runtime.map1[2]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FL — najpierw tekst odpowiedzi, dopiero potem FA punkty + FSUMA A (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 3, tytuł gracza 1. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p1_map_q4`, `f_end`

### `f_p1_map_q4`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 1, pytanie 4/5
- **Zapis (`detail`)**: runtime.map1[3]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FL — najpierw tekst odpowiedzi, dopiero potem FA punkty + FSUMA A (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 4, tytuł gracza 1. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p1_map_q5`, `f_end`

### `f_p1_map_q5`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 1, pytanie 5/5
- **Zapis (`detail`)**: runtime.map1[4]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FL — najpierw tekst odpowiedzi, dopiero potem FA punkty + FSUMA A (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 5, tytuł gracza 1. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p2_start`, `f_end`

### `f_p2_start`

- **Karta**: `final`
- **Wejście**: po f_p1_map_q5 (bez wcześniejszego wyjścia na f_end)
- **Zapis (`detail`)**: —
- **Display**: FHALF A — cała lewa połowa (odpowiedzi gracza 1) zamaskowana placeholderami.
- **Host**: CLEAR (obie strony czyszczone).
- **Buzzer**: Wyłączony.
- **Dźwięki**: `round_transition`, `reveal`
- **Dozwolone kolejne kroki**: `f_p2_entry`

### `f_p2_entry`

- **Karta**: `final`
- **Wejście**: operator klika 'Start rundy 2'
- **Zapis (`detail`)**: runtime.timer={running,phase:'P2',endsAt}, runtime.p2[i].{text,repeat}
- **Display**: LEFT/RIGHT po stronie zwycięzcy pokazują odliczanie (20s). Przy starcie timera: FHALF A z pełną, jednorazową odsłoną wszystkich 5 odpowiedzi gracza 1 (nie stopniowo).
- **Host**: Tytuł rundy 2 + status 5 pytań. Odsłania się RAZEM z Display (naprawiona luka — dziś UNCOVER nigdy nie jest wysyłane, patrz plan sekcja 2a).
- **Buzzer**: Wyłączony.
- **Dźwięki**: `time_over`, `answer_repeat`
- **Dozwolone kolejne kroki**: `f_p2_map_q1`

### `f_p2_map_q1`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 2, pytanie 1/5
- **Zapis (`detail`)**: runtime.map2[0]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FR — najpierw tekst odpowiedzi, dopiero potem FB punkty + FSUMA B (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 1, tytuł gracza 2. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p2_map_q2`, `f_end`

### `f_p2_map_q2`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 2, pytanie 2/5
- **Zapis (`detail`)**: runtime.map2[1]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FR — najpierw tekst odpowiedzi, dopiero potem FB punkty + FSUMA B (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 2, tytuł gracza 2. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p2_map_q3`, `f_end`

### `f_p2_map_q3`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 2, pytanie 3/5
- **Zapis (`detail`)**: runtime.map2[2]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FR — najpierw tekst odpowiedzi, dopiero potem FB punkty + FSUMA B (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 3, tytuł gracza 2. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p2_map_q4`, `f_end`

### `f_p2_map_q4`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 2, pytanie 4/5
- **Zapis (`detail`)**: runtime.map2[3]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FR — najpierw tekst odpowiedzi, dopiero potem FB punkty + FSUMA B (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 4, tytuł gracza 2. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_p2_map_q5`, `f_end`

### `f_p2_map_q5`

- **Karta**: `final`
- **Wejście**: poprzedni krok mapowania rundy 2, pytanie 5/5
- **Zapis (`detail`)**: runtime.map2[4]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}
- **Bramkowane przez ustawienia**: `finalTarget`
- **Display**: FR — najpierw tekst odpowiedzi, dopiero potem FB punkty + FSUMA B (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).
- **Host**: SET1/SET2 dla pytania 5, tytuł gracza 2. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.
- **Buzzer**: Wyłączony.
- **Dźwięki**: `reveal`, `answer_correct`, `answer_wrong`
- **Dozwolone kolejne kroki**: `f_end`, `f_end`

### `f_end`

- **Karta**: `final`
- **Wejście**: wczesne wyjście (suma osiągnęła finalTarget) z dowolnego kroku mapowania, lub koniec f_p2_map_q5
- **Zapis (`detail`)**: runtime.sum, winAmount
- **Bramkowane przez ustawienia**: `endScreenMode`, `finalPrizeMultiplier`, `mainPrizeAmount`, `finalTarget`
- **Display**: INDICATOR OFF (gaśnie po raz pierwszy od f_start), TOP 000, LEFT/RIGHT=wynik z doliczoną sumą finału, FBATCH ANIMOUT, potem LOGO SHOW / WIN <suma> ('points') / WIN <realna kwota z mnożnikiem+premią> ('money' — różni się realnie od 'points', w przeciwieństwie do r_gameEnd).
- **Host**: Wyczyszczony.
- **Buzzer**: Wyłączony.
- **Dźwięki**: —
- **Dozwolone kolejne kroki**: — (terminalny)

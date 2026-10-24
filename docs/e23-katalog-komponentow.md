<!-- E23: katalog duplikatów komponentów (inwentaryzacja 2026-10-23, tylko odczyt).
     Plan „skończonego zestawu elementów” (decyzje w wspolne-style-plan.md). Odhaczać
     w Dzienniku E23; numery linii z dnia inwentaryzacji. -->
# Inwentaryzacja elementów UI: klasy stron, które dublują silnik albo siebie nawzajem

**Stan:** drzewo robocze z 2026-10-23. Ktoś równolegle edytuje 29 plików, m.in. `components.css`, `layout.css`, `base-explorer.css`, `logo.css`, `polls.css`, `settings.css`, `marketplace.css` i `snake.css`. Numery linii mogą się więc przesunąć o kilka.

**Prace już trwające (widać je w `git diff`):**
- `.tbBtn` (Eksplorator), `.ctxBtn` (logo) i `.tcBtn` (ankiety) są usunięte.
- `.icon-btn` z `layout.css` zastąpiono `.btn.icon` / `.btn.sm.icon`.
- Doszedł `.btn.is-active` / `[aria-pressed=true]`, a `.btn.xsm` zniknął.

Poniżej opisuję to, co **zostało**.

**Kolumny:** „użycie” to liczba plików JS/HTML (bez `control/display` i `settings/tools`). „e2e” to liczba wystąpień w `tests/e2e`. Gwiazdka (*) oznacza nazwę tak ogólną, że liczby są zawyżone.

**Ważne:** silnik nie ma ogólnego `.card` (jest tylko `.card.games-card` w `layout.css:119`), nie ma też ogólnego `.field`, przełącznika, menu kontekstowego, paska postępu poza oknem ani spinnera.

## 1. Przyciski
| klasa strony | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.c2-btn` (+`.primary`) | control/css/control2.css:287-291 | 1 (control/js/ui.js:824,1202,1217,1309,1556) | przycisk akcji Control | `.btn` / `.btn.gold` | padding 10/14, `--line2`, tło w-8 (nie kryjące), `font-size .95em`; `.primary` to kopia `.btn.gold`; e2e 4 (tylko `.c2-btn-repeat`) |
| `.c2-intro-btn` | control2.css:129 | 1 | duży przycisk startu | `.btn.gold` + nowy rozmiar `.btn.lg` | padding 14/34, `1.1em` |
| `.msg-icon-btn` (`--gold/--danger/--tagged/--active`) | settings/css/settings.css:1778 | 1 (settings.js:3311-3382) | przycisk-ikona w wierszu poczty | `.btn.sm.icon` + `.gold`/`.danger`/`.is-active` | 30×30, przezroczysty, bez ramki |
| `.btn-external` | settings.css:545 | 1 | link zewnętrzny | `.btn.sm` | ma tylko kolory |
| `.tab-btn` (`.active`) | settings.css:553 | settings/index.html:55-63 | zakładki admina | `.btn.sm.is-active` albo `.tabs-strip` | `.active` dubluje nowe `.is-active` |
| `.mkt-close-btn` | marketplace/css/marketplace.css:271 | 1 | „Zamknij” w oknie | `.btn.sm` | sam odstęp |
| `.search-submit` | bases/explorer/css/base-explorer.css:290 | 1 | lupa (telefon) | `.btn.icon` + `.is-active` | 36×36; **identyczny** z `.mkt-search-button` |
| `.mkt-search-button` | marketplace.css:74, 429-431 | 1 | lupa (telefon) | `.btn.icon` + `.is-active` | 40 → 36 px, własne `.is-active` złote |
| `.mkt-filter-btn` (ikonowy na telefonie) | marketplace.css:435 | 1 | filtr jako ikona | `.ui-select` z wariantem ikonowym | 36×36 |
| `.left-view-btn` (+`.badge` 14 px) | base-explorer.css:1854, 1946 | 1 | przełącznik widoku z licznikiem | `.btn.icon` + `.badge` | badge przemalowany (#2a2614, 9 px) |
| `.logoX` | logos/css/logo.css:90 | 1 | kosz na kaflu | `.grid .tile .x` (komponenty ok. 1729) | 32×32, `--bd-mid`; e2e 6 |
| `.imgSetBtn` (+`Val`/`Label`) | logo.css:652 | 2 (7×`btn sm imgSetBtn`) | przycisk-ustawienie z wartością | `.btn.sm` + `.is-active` | ma `!important` na kolorach; e2e 3 |
| `.ctxColorBtn` | logo.css:323 | 1 | próbka koloru w pasku | wspólny picker (pkt 16) | 28×32 |
| `.ctxSelectBtn` | logo.css:938 | 1 | rozwijana lista w pasku | `.ui-select.sm` | własny caret i ikona |
| `.roundsOrderBtn` | shared/css/game-settings.css:638 | 1 | ↑↓ kolejność | `.btn.xs.icon` | 28×28, twarde kolory #3a3e47/#1a1d25; e2e 1 |
| `.sfx-preview-btn`, `.sound-preview-btn` | game-settings.css:132-173 **i ponownie** 407-415; control/css/control.css:1190-1222 | 2 | odtwórz dźwięk | `.btn.xs.icon` | 30×30, bez tła; **trzy kopie** |
| `.sfx-add-btn` | game-settings.css:201 **i** 441 | 1 | „Dodaj plik” | `.btn.xs` | kopia w tym samym pliku |
| `.sfx-file-remove` | game-settings.css:195 **i** 435 | 1 | ✕ w znaczniku pliku | `.searchClear` (gołe ✕) | kopia w tym samym pliku |
| `.summarySoundPlay` | control.css:1181 | 1 | odtwórz dźwięk | jak `.sound-preview-btn` | e2e 5 |
| `.blocking-action` (`.is-accent`) | shared/css/blocking-overlay.css:38 | 2 | przycisk ekranu blokady | `.btn` / `.btn.gold` | r 12px, rgba(255,255,255,.14); plik działa bez tokenów |
| `.a2hsClose` | snake/css/snake.css:144, control/buzzer/css/buzzer.css:145, control/host/css/host.css:420 | 3 | zamknij baner | `.a2hsClose` z silnika | 3 identyczne nadpisania |
| `.m-side-toggle`, `.gs-sidebar-toggle` | manual/css/manual.css:480; game-settings.css:100, 578 | 1+1 | otwórz szufladę | `.btn.icon` + nowy `.drawer` | ta sama rola, dwie nazwy |
| `.shot-carousel-nav` / `.m-carousel-nav` (+`-dot`) | home/css/index.css:319; manual.css:564 | 1+1 | strzałki i kropki karuzeli | nowy `.carousel` | dwie karuzele |
| `.hero-cta`, `.stats-session-details-button`, `.c2-btn-back`, `.mkt-star-btn` | index.css:44; settings.css:2358; control2.css:209; marketplace.css:467 | po 1 | warianty `.btn` / gwiazdki | `.btn` / `.star-btn` (silnik) | `.mkt-star-btn` dubluje `.star-btn`; e2e 3 / 0 / 0 / 4 |

## 2. Pola tekstowe i select
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.form input` | shared/css/auth-landing.css:103 | 3 (login, confirm, reset) | pole logowania | `.inp` | padding 12, tło k-20, fokus z poświatą |
| `input` (globalnie) | login/css/login.css:105-120 | 1 | j.w. | `.inp` | selektor elementu; fokus g-60 + 3 px |
| `.dt-input` | settings.css:232 | 1 | pole daty i czasu | `.inp` | szerokość 86, `--line2` |
| `.mail-search` | settings.css:1590 | 1 (`inp mail-search`) | szukaj w poczcie | `.searchBox.searchBox--field` | 28 px, 12 px |
| `.ctxInput` | logo.css:299 | 1 | liczba w pasku | `.inp.sm` (nowy rozmiar) | 28 px |
| `.connect-device-code-input` | connect/css/connect-device.css:102 | 1 | kod urządzenia | `.inp` | max 180 |
| `.c2-entrytile-input`, `.c2-mapinput` | control2.css:402, 424 | 2 | wpis odpowiedzi | `.inp` | `.c2-mapinput` ma e2e 5 |
| `.qf-pts`, `.qf-text` | shared/css/question-form.css:111, 78 | 2-3 | pola pytania | `.inp` | e2e 14 i 17 |
| `.mail-ui-select`, `.mail-cron-select` | settings.css:788, 803 | 1 | select | `.ui-select` | przemalowany na g-10 |
| **etykiety pól:** `.gs-label`, `.lbl2`, `.field-label` (×2), `.qf-label`, `.c2-field-label`, `.mkt-rate-label`, `.stat-label` | game-settings.css:242; game-settings.css:456 + control.css:525; settings.css:611 i marketplace.css:413; question-form.css:21; control2.css:406; marketplace.css:465; settings.css:1125 | po 1 | etykieta pola | **nowy `.field__label`** | 11-15 px, raz złota, raz wersaliki; w silniku są tylko `.contact-label` (components.css:642) i `.name-field-label` |
| **grupy pól:** `.gs-field`, `.field` (settings.css:216, control.css:515), `.xField` | game-settings.css:235; base-explorer.css:976 | 1/9*/1 | etykieta + pole + podpowiedź | **nowy `.field`** | wszystkie: `grid; gap 6px` |

## 3. Przełączniki, checkboxy, suwaki
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.toggle-group` / `.toggle-item` / `.toggle-slider` | game-settings.css:295-320; **kopia** control.css:209-275 | 2 | przełącznik segmentowy (radio) | nowy `.segmented` (silnik zna tylko `.toggle-item > input`, components.css:13) | r-lg, ramka 2 px, zaznaczenie złote; nadpisanie w game-settings.css:286-288; e2e 22 (`.toggle-item`) |
| `.bld-preview-switch` | games/css/games.css:35 | 2 | przełącznik widoku | `.segmented` | dziś flex z `.btn` |
| `.mode-slider` / `.mode-range` | settings.css:127, 135 | 1 | suwak trybu | nowy `.range` | `accent-color: #f7d27b`, tor 6 px |
| `.rng`, `.sliders`, `.sliderRow`, `.sLbl`, `.sVal` | game-settings.css:363-394; base-explorer.css:457-532; **martwa kopia** control.css:814-897 | 1+1 | suwaki RGB/HSL | nowy `.range` (w pickerze) | 3 kopie; e2e 1 |
| `.chk`, `.ctxChk`, `.device-opt-check`, `.mkt-checkbox-row` | logo.css:226, 338; control.css:988; marketplace.css:375 | 4/1/1/1 | etykieta + checkbox | nowy `.check-row` | gap 4 / 8 / 8 px, 11-13 px; sam checkbox jest już wspólny (components.css:12) |
| `.radio input` | control.css:349 | 8* | radio | wspólne radio (components.css:13) | nadpisuje `transform` |

## 4. Karty i panele
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.card` (×2) | control.css:449, 472 | – | karta Control | **nowy `.card`** | r-lg, padding 14, cień 18/45 |
| `body.pollpub-body .card` | shared/css/poll.css:19, 30 | polls/vote/{points,text}/index.html:37 | karta wejścia | `.card.card--entry` | |
| `.landing-card` | auth-landing.css:52 | 3 | karta wejścia (logowanie) | `.card--entry` | r-lg, `--card`, padding 18 |
| `.login-card`, `.setup-card` | login.css:56, 170 | 1 | j.w. | `.card--entry` | tło w-8, cień 24/60; setup ma ramkę g-35 |
| `.poll-go-card` | go/css/go.css:17 | 2 (go, mails) | j.w. | `.card--entry` | szer. 680, padding 20 |
| `.notfound-card`, `.maintenance-card` | 404/css/404.css; maintenance/css/maintenance.css:21 | 1+1 | karta blokady | `.card--entry` (wzorzec `page--block`) | padding 32/28 albo 18 |
| `.blocking-card` | blocking-overlay.css:22 | 2 | karta blokady | `.card--entry` | r 18px, #111827, bez tokenów |
| `.auth-card`, `.dt-card` | settings.css:34, 296 | 1 | karta logowania / okna | `.card--entry` / `.uni-modal` | #0a0e1d |
| `.account-panel` | account/css/account.css:15 | 1 (8 sekcji) | sekcja karty | `.card` poziom 2 | r-lg, w-14, `--card` |
| `.settings-card`, `.stats-inner-card`, `.stat-box`, `.connect-device-inner-card`, `.qf-section` | settings.css:655, 1177, 1098; connect-device.css:15; question-form.css:11 | po 1 | panel wewnętrzny (poziom 2) | **`.card.card--inset`** | wszystkie: r-md, tło w-4, ramka w-8 albo w-14, padding 12-18 |
| `.gs-section`, `.mail-panel` (settings.css:635; mail/css/mail.css:31), `.contacts-card`, `.mkt-games-card` | game-settings.css:225; shared/css/contacts.css:10; marketplace.css:95 | po 1-2 | karta treści | `.card` | `contacts-card` = kopia `games-card` (surface-1, cień) |
| `.hero-card`, `.forwhom-card`, `.tile` (home) | home/css/index.css:15, 397, 243 | 1 / 1 / 11* | karty strony głównej | `.card` | **`.tile` w index.css koliduje nazwą z `.grid .tile` silnika**; e2e 164* |
| `.m-part-card`, `.m-note`, `.m-warn` | manual.css:261, 384, 393 | 1-3 | ramka w tekście | `.card--inset` + nowy `.callout--warn` | |
| `.bases-card` / `.polls-card` + reguły `:has(.slot-*.active)` | bases/css/bases.css:89-101; shared/css/polls.css:142-147; contacts.css:39-40 | – | zaokrąglenie przy aktywnej wypustce | `.tabs-card` z silnika (components.css:2052-2190) | 3 ręczne powtórki mechanizmu narożników |

## 5. Kafle
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.mkt-card` (+`-top/-title/-desc/-footer/-author`) | marketplace.css:109 | marketplace.js:341 | kafel zasobu | `.tile` (+`.meta`, `.tileTags`) | r-lg zamiast r-md, tło #070b16; e2e 10 |
| `.addTile` | games/editor/css/editor.css:256-312, 456 | 1 | kafel „Dodaj” | `.addCard` (layout.css:162) | r-lg, przerywana g-35, min-h 100 (silnik: 130); e2e 14 |
| `.qcard` | editor.css:129 | 1 | kafel pytania | `.tile` | r-lg; e2e 15 |
| `.logoTile` | logo.css:44-69; **martwa kopia** control.css:1091-1110 | 2 | kafel logo | `.logoTile` (silnik) | stan wybrany: `.is-selected` (logo) / `.selected` (control, gs) |
| `.gs-logo-tile` | game-settings.css:469 | 1 | wybór logo | `.logoTile.is-selected` | ramka 2 px, r-sm; e2e 1 |
| `.connect-device-tile` (+`mail-row--device`) | connect-device.css:40 | 1 | kafel urządzenia | `.shareRow` / `.tile` | miesza nazwy z wierszem poczty |
| `.c2-tile`, `.c2-entrytile` | control2.css:242, 352 | 2 | kafle gry | zostawić (ekran gry) | e2e 4 |
| `.imgCard`, `.tagsColorTile` | logo.css:625; base-explorer.css:627 | 2 / 1 | panel / kafel koloru | `.card--inset` / picker | |

## 6. Wiersze list
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.mkt-sent-row` | marketplace.css:208 | 1 | wiersz „Wysłane” | `.shareRow` | padding 12/14, `--card`; e2e 1 |
| `.device-row` (+`-1/-2/-opt/-line`) | control.css:960; control2.css | 2 | wiersz urządzenia | `.shareRow` | padding 14, tło k-20; e2e 18 |
| `.activity-row`, `.excluded-account-row`, `.game-row`, `.provider-order-row`, `.mail-thread-item`, `.mc-log-entry` | settings.css:2311, 2316, 1307, 717, 1601, 2143 | po 1 | wiersze admina | `.shareRow` / `.rowsRow` | r-sm / bez ramki / tylko linia na dole: 6 różnych wyglądów |
| `.mail-row` (`--poll/--device/--subscription`) | mail.css:35-43 | 2 | wiersz z akcentem rodzaju | `.shareRow` + modyfikator koloru | lewa krawędź 3 px, kolory na sztywno |
| `.roundsOrderItem` | game-settings.css:593; **martwa kopia** control.css:129-201 | 1 | wiersz do przeciągania | `.shareRow.shareRow--compact` | #242831; e2e 3 |
| `.sfx-row`, `.summarySoundRow`, `.qRow` | game-settings.css:115, 536; control.css:1159, 304 (martwa) | 1 | wiersz ustawienia | `.rowsRow` / `.setting-row` | e2e 5 / 6 / 19 |
| `.shareDeviceFriendRow` | control.css:929 | 1 | wiersz odbiorcy | `.shareRow` (resource-send) | |
| `.tree-row`, explorer `.row`, `.xPickItem` | base-explorer.css:1649, 189, 617 | 3 / 66* / 1 | drzewo i tabela | zostawić (Eksplorator), `.xPickItem` → `.shareRow` | e2e `.row` 510* |

## 7. Pigułki, oznaczenia, liczniki
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.mail-pill` + 12 wariantów (`-status-*`, `-level-*`, `-fn-*`, `-event-skipped`) | settings.css:848-890 | 1 | stan wiersza | `.tag` + `--ok/--bad/--warn/--info/--muted` | r-pill zamiast r-sm |
| `.session-status` (`--live/--done/--err`) | settings.css:2299 | 1 | stan sesji | `.tag--info/--ok/--bad` | twarde #60a5fa / #4ade80 |
| `.ans-chip` (+`.ans-pts`), `.q-text`, `.q-block` | settings.css:1363-1370 | 1 | odpowiedź w podglądzie | `.tag--muted` | |
| `.msg-pill` | control.css:551 | 1 | pigułka komunikatu | `.tag` | slate rgba(15,23,42); e2e 1 |
| `.xCountPill`, `.tree-count`, `.mkt-count`, `.bulk-count`, `.tallyCounter` | base-explorer.css:1142, 1949; marketplace.css:187; settings.css:1393; polls.css:387 | po 1 | licznik | `.badge` | pill 11 px, różne tła; e2e tylko `.tallyCounter` 1 |
| `.qf-sumChip`, `.sfx-file-tag`, `.mkt-added-badge`, `.mkt-status-badge`, `.mail-ticket-badge` | question-form.css:224; game-settings.css:178; marketplace.css:341, 254; settings.css:1640-1643 | po 1 | oznaczenie | `.tag` (`--gold/--ok`) | #7ef0a2 na sztywno |
| `.cm-kbd`, `.rating-badge-index` | base-explorer.css:1209; index.css:474 | 1 | skrót / ocena | `.tag--muted` | |
| `.dot` / `.dotRow` | control.css:27 | 16* | kropka stanu | `.conn-status` (silnik) | |

## 8. Puste stany
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.bld-no-q` ≡ `.mkt-no-q` | games.css:122; marketplace.css:326 | 1+1 | „brak pytań” | `.empty-state` | **identyczne** (13 px, opacity .55, padding 16 0) |
| `.list-empty` | base-explorer.css:1657 (+ layout.css:198) | 3 | pusta lista | `.empty-state` | dwie definicje |
| `.left-panel-empty`, `.m-search-empty`, `.gs-picker-empty`, `.mail-empty`, `.connect-device-empty` | base-explorer.css:134; manual.css:103; game-settings.css:457; settings.css:960; connect-device.css:100 | po 1-2 | pusty stan | `.empty-state` (+ nowy `--inline`) | opacity .38-.75, kursywa; e2e `m-search-empty` 1 |
| `.empty` | editor.css:188 | 28* | pusty edytor | `.empty-state` | |
| `.activity-chart-empty`, `.stats-session-suggestion-empty` | settings.css:2328, 2359 | 1 | pusty wykres | `.empty-state` | min-h 200 |
| `.pollLinkPlaceholder`, `.mail-conv-placeholder` | polls.css:207; settings.css:1653 | 1-2 | miejsce na treść | `.empty-state` | już ma przerywaną ramkę jak silnik |
| `.contacts-load-retry`, `.poll-load-retry`, `.tasks-load-retry` | contacts.css:9; polls.css:480; tasks/css/tasks.css:19 | 2 / 1 / 1 | błąd ładowania + „Ponów” | nowy `.empty-state--error` albo `.load-retry` | 3 kopie, różne marginesy |

## 9. Komunikaty statusu, błędu, podpowiedzi
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.hint` (w stronach) | auth-landing.css:133; login.css:153; control.css:532 | – | podpowiedź | `.hint` | **silnik definiuje `.hint` dwa razy:** components.css:608 (13 px, .8) i layout.css:88 (12 px, .75, mt 4) |
| `.qf-hint`, `.gs-hint`, `.c2-hint`, `.poll-go-hint`, `.notfound-hint`, `.panelHint`, `.field-hint`, `.mode-hint`, `.connect-device-code-hint`, `.tallyHint`, `.subsSendHint`, `.imgPrevHint`, `.xTypeHint`, `.tinyHint`, `.qr-hint`, `.pollQrHint`, `.pollBarHint` | question-form.css:145; game-settings.css:252; control2.css:141; go.css:65; 404.css:15; editor.css:65; settings.css:625, 220; connect-device.css:112; polls.css:368, 291, 244, 81; logo.css:650; base-explorer.css:1074; poll.css:87; poll-qr.css:32 | po 1-2 | podpowiedź | `.hint` (+ `--warn`) | 12-13 px, opacity .45-.85: 17 nazw na jedną rolę; e2e tylko `qr-hint` 4 |
| `.err`, `.status` | auth-landing.css:79, 88 | 32* / 64* | błąd / status formularza | nowy `.status-line` (`--error/--ok`) | e2e 44* / 468* |
| `.modal-err` | login.css:204 | 1 | błąd w oknie | `.status-line--error` | #ff9d9d |
| `.gs-field-msg` (`.is-error`), `.gs-field-suggest` (`.is-warn`) | game-settings.css:718 | 1 | błąd pola | `.field__error` | #ffb3b3, #ffd27a |
| `.mkt-submit-error`, `.mkt-submit-warn`, `.mkt-lang-picker` (ramka) | marketplace.css:396, 362, 349 | 1 | baner błędu / ostrzeżenia | nowy `.callout--bad/--warn` | r-sm / r-md, rgba na sztywno |
| `.pending-bar`, `.bulk-bar` | settings.css:1395, 1380 | 1 | pasek ostrzeżenia / zaznaczenia | `.callout` / `.list-toolbar` | |
| `.warn`, `.panel-status`, `.status-bar`, `.gs-actionbar-msg`, `.connect-device-msg`, `.msg` (control.css:497) | settings.css:630, 453, 1434; game-settings.css:102; connect-device.css:76 | 1-53* | status | `.status-line` | `.msg` jest też w silniku (components.css:613) |
| `.importMsg` | editor.css:405 | 9 | komunikat importu | `.importMsg` (components.css:792) | kopia |
| `.device-load-error` | buzzer.css:162; host.css | 2 | błąd ładowania urządzenia | `.blocking-overlay` | |
| `.cooldown` | account.css:118, 129; login.css:161 | 15* | odliczanie ponowienia | `.hint` / `.callout` | dwa różne wyglądy pod jedną nazwą (przerywana ramka vs zwykły tekst); e2e 18 |

## 10. Paski akcji
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.pollBar`, `.mkt-head` | polls.css:49; marketplace.css:25 | 2 / 2 | górny pasek | `.bar` (layout.css:37) | identyczne z `.bar` (flex, space-between, gap 12); e2e `pollBar` 6 |
| `.stepFoot`, `.gs-page-footer`, `.sfx-foot` | control.css:484; game-settings.css:19, 204 | 1 | dolny pasek | `.list-toolbar` | e2e `stepFoot` 2 |
| `.gs-actionbar`, `.m-actionbar` | game-settings.css:89; manual.css:33 | 1-2 | pasek strony pracy | `.bar` | g-10 tło |
| `.actions`, `.account-actions`, `.notfound-actions`, `.poll-go-actions`, `.mkt-detail-actions`, `.panel-actions`, `.dt-actions`, `.blocking-actions`, `.logoActions`, `.mkt-sent-actions`, `.provider-order-actions`, `.bypass-actions`, `.market-actions`, `.pollBarActions`, `.pollLinkActions`, `.tallyTools`, `.subsTools` | auth-landing.css:122; account.css:91; 404.css:25; go.css:47; marketplace.css:333, 246; settings.css:436, 421, 742, 482, 1457; blocking-overlay.css:37; logo.css:84; polls.css:88, 216, 369, 281 | po 1-2 | rząd przycisków | `.modal-actions` / nowa pomocnicza `.cluster` (§4.3) | wszystkie `flex; wrap; gap 10`, różnią się tylko `justify`; e2e `.actions` 34* |
| `.toolbar`, `.editorToolbar` | base-explorer.css:903; logo.css:198 | 19* / 3 | pasek narzędzi edytora | nowy `.toolbar` (doc §4.1) | #090d1a vs k-20 |

## 11. Okna i modale
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.overlay`, `.modal`, `.mTitle`, `.mSub`, `.importRow`, `.importTa`, `.importMsg` | editor.css:338-410 | 1 | okno | silnik (components.css:624, 732, 748, 762, 770, 800) | **pełna kopia silnika**; różni się tylko `z-index: 50` |
| `.overlay:where(:not(.sheet-active))` | settings.css:1907-1916 | – | okno pod topbarem | `.overlay` | `!important` na top/z-index |
| `.overlay` (z-index) | logo.css:790; base-explorer.css:1441 | – | | `--z-overlay` | z-index 9999 / 1100 |
| `.dt-modal` + `.dt-card` | settings.css:287, 296 | 1 | okno daty | `.uni-modal` | z-index 120, własne tło; e2e 1 |
| `.imgv-overlay` / `.imgv-panel` | shared/css/image-viewer.css:3, 10 | 1 | podgląd obrazu | `.overlay > .modal` (nowy wariant `--fullscreen`) | z-index 9999; e2e 5 |
| `.stats-session-details-overlay .modal` | settings.css:2331 | 1 | szerokość okna | `.modal` + wariant szerokości | |
| `.mkt-modal-detail`, `.bld-preview-modal`, `.pollRecipientsModal`, `.export-modal`, `.move-modal`, `.question-modal`, `.tags-modal`, `.rename-modal`, `.search-modal`, `.modal.shareModal`, `.modal-wide` | marketplace.css:259; games.css:23; polls.css:306; base-explorer.css:958, 1872, 1170, 541, 2023, 1976; bases.css:16; settings.css:1492 | 1-7 | tylko szerokość okna | **nowe `.modal--sm/--md/--lg`** | 560 / 760 / 820 / 860 px; e2e `question-modal` 10, `export-modal` 5 |
| podgląd pytań: `.bld-q-*` ≡ `.mkt-q-*` ≈ `.market-preview-q*` / `.q-block` | games.css:89-122; marketplace.css:293-326; settings.css:1363, 1479 | po 1 | lista pytań w podglądzie | **nowy `.q-preview`** | 3 kopie, wartości identyczne (14/13/11 px) |
| `.blocking-overlay` | blocking-overlay.css:2 | 39* | ekran blokady | `block-screen` (doc §4.1) | z-index max, rgba(0,0,0,.78), bez tokenów |
| tła szuflad: `.gs-sidebar-backdrop`, `.m-side-backdrop`, `.drawer-overlay`, `.context-menu-backdrop` | game-settings.css:579; manual.css:165; base-explorer.css:1350, 1673 | po 1 | tło szuflady | nowy `.drawer` + `.scrim` | k-70, 4 kopie; e2e `drawer-overlay` 3 |

## 12. Menu rozwijane i kontekstowe
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.context-menu` / `.cm-item` / `.cm-sep` (+ arkusz `cmSheetUp`) | base-explorer.css:357-379, 1737-1740 | 7 / 1 / 1 | menu kontekstowe | **nowy `.menu`** (wspólny z `.nav-more-dropdown`, `.lang-menu`, `.account-menu`) | #141414 / #272727, z-index 9999, własne animacje arkusza (kopia `sheetUp` z components.css:903); e2e 25 / 21 |
| `.ctxPop`, `.shapePickerPop` | logo.css:904, 912 | 2 / 1 | wyskakujący panel | `.menu` | cień 24/60, z-index 1000 |
| `.lang-menu` (z-index), `.tv-language`, `.lang-floating` | snake.css:148-170; connect/tv/css/tv.css:17-19 | 1-2 | menu języka | `.lang-menu` (silnik) | tylko nadpisania |

## 13. Zakładki
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.tab-btn` | settings.css:553 | 1 (9 zakładek) | zakładki panelu | `.tabs-strip` / `.tab-label` albo `.btn.sm.is-active` | |
| `.left-view-tabs` | base-explorer.css:1864 | render.js:126 | zakładki widoku | `.segmented` | e2e 3 |
| `.mail-folders` / `.mail-folder` | settings.css:1551 | 1 | pionowe zakładki | `.menu` / `.gs-sidebar-item` | w Instrukcji `.m-side-item` to ta sama rola |
| `.gs-sidebar-item`, `.m-side-item` | game-settings.css; manual.css | 1 | boczna nawigacja | nowy `.drawer` + `.nav-item` | 2 kopie |
| `.contacts-tabs` | contacts.css:32-40 | 2 | wypustki | `.tabs-card` | ręczne narożniki |

## 14. Wyszukiwarki list
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.mkt-search-bar`/`-field`/`-box`/`-input` | marketplace.css:73-76, 102 | 1 | szukaj | `.searchBox--field` (już użyty) + `.listTools` | 4 klasy-otoczki |
| `.searchBox` (nadpisania), `.searchBoxIco`, `.search-row`, `.moveSearch`, `.searchSheetBody` | base-explorer.css:276, 1198, 1992, 289, 1874, 2009 | 1-2 | szukaj | `.searchBox--field` / `.list-search` (layout) | `--under: #131723`; e2e `moveSearch` 4, `search-row` 2 |
| `.m-search` | manual.css:51 | 1 | szukaj (sticky) | `.searchBox--field` | |
| `.mail-search` | settings.css:1590 | 1 | szukaj | `.searchBox--field` | dziś `.inp` 28 px |

## 15. Pickery koloru
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.colorRow`/`.colorItem`/`.swatchBtn`/`.colorPreview`/`.colorTopRow`/`.colorModalControls`/`.colorHexField` | game-settings.css:323-366, 682-684 | game-settings.js | picker koloru | **nowy `.color-picker`** | e2e `swatchBtn` 8 |
| `.colorModalTitle`/`.colorModalBody`/`.colorPreview`/`.colorTopRow` + suwaki | base-explorer.css:427-532 | tags-modal.js | picker koloru znaczników | `.color-picker` | druga implementacja |
| **martwa kopia** całego pickera | control.css:760-900, 1058-1076 | 0 w control/js | – | **usunąć** | |
| `.ctxColorBtn` | logo.css:323 | 1 | wybór koloru pędzla | `.color-picker` (próbka) | |

## 16. Banery (A2HS, pełny ekran)
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.a2hs`/`.a2hsCard`/`.a2hsTitle`/`.a2hsText`/`.a2hsClose` | snake.css:121-146; buzzer.css:120-145; host.css:393-420 | 3 | baner „Do ekranu początkowego” | silnik (components.css:1034-1068, w `flat.css`) | **3 niemal identyczne nadpisania** (różnią się `--safe-*` vs `env()`): z-index 20000, karta #1a1a1a, padding 24 (silnik: surface-raised, 16) |
| `.fs-btn.is-active` | snake.css:84 | 1 | pełny ekran | `.fs-btn` + `.is-active` | kolor limonkowy rgba(215,255,61) |
| `.pseudoFS .fs-btn` | host.css:489 | 1 | | `.fs-btn` | |

## 17. Paski postępu
| klasa | definicja | użycie | rola | proponowany | uwagi |
|---|---|---|---|---|---|
| `.progress-bar-bg` / `.progress-bar-fill` | settings.css:1409, 1416 | settings/index.html:536 | postęp | **nowy `.progress`** (z `.uni-progress-track/-bar`, components.css:2046) | 4 px, złoty gradient; silnik: 10 px, biały |
| inline paski | settings.js:1265-1272 | 1 | wykres udziału | `.progress` | style inline, 6 px |
| `.c2-topbar-progress`, `.c2-stepper` | control2.css:115, 96 | 1 | postęp gry (tekst) | zostawić | |
| `.countdown`, `.countdown-inline` | maintenance.css:55, 70 | 1 | odliczanie | zostawić / `.tag` | |

## 18. Spinnery i ładowanie
- W stronach **nie ma żadnego spinnera** (zero `@keyframes spin` i zero `.spinner`).
- Ładowanie obsługują `html.page-loading` i `body.skel-body` / `[data-skel-step]` (base.css:41, 106-136) oraz `login.css:44-50` (powtórka `[data-skel-step]` dla `.login-shell`).
- Stan zajęty na przycisku jest tylko lokalny: `.c2-btn-busy` (control2.css:293, `cursor: wait`). `aria-busy` ustawiają `contact-modal.js` i `resource-duplicate.js`, ale bez stylu.
- Propozycja: jeden `.btn.is-loading` / `[aria-busy=true]` (doc §4.1 „skeleton / is-loading”).

## Nadpisania klas silnika w plikach stron (do wyczyszczenia przy okazji)
- **control.css** (19): `.btn`, `.card`×2, `.conn-status`, `.hint`, `.logoTile`×3, `.msg`, `.shareList`×3, `.toggle-item`×4, `.top-status`×2.
- **logo.css** (13): `.grid`×6, `.logoTile`×4, `.card`×2, `.overlay`.
- **editor.css** (7): pełna kopia okna.
- **base-explorer.css** (8): `.searchBox`×5, `.overlay`×2.
- Mniejsze: `polls.css` (`.card`, `.meta`, `.name`, `.tabs-card`), `bases.css` (`.modal`, `.tabs-card`, `.uni-foot`), `games.css` (`.tabs-card`×4), `settings.css` (`.overlay`, `.ui-select`, `.modal-actions`), `login.css` (`.hint`, `.meta`, `.modal-actions`), `question-form.css` (`.btn`), `game-settings.css` (`.inp`).

## Proponowane NOWE wspólne komponenty (tylko tam, gdzie nic w silniku nie pasuje)
1. **`.card`** (poziom 1) + **`--inset`** (poziom 2: r-md, w-4, w-8/14) + **`--entry`** (520-720 px). Silnik ma tylko `.card.games-card`, a karta jest w ok. 25 klasach (pkt 4).
2. **`.field` / `.field__label` / `.field__error`**: 7 kopii etykiet i 4 kopie grup pól (pkt 2), plus `.gs-field-msg` i `.modal-err`.
3. **`.status-line`** (`--error/--ok/--info`) i **`.callout`** (`--warn/--bad`): ok. 12 klas statusu i 5 ramek ostrzeżeń (pkt 9). Silnik ma tylko dymek (`.app-toast`).
4. **`.segmented`** (przełącznik segmentowy): `.toggle-group` ×2 plus `.bld-preview-switch` i `.left-view-tabs`. `.toggle-item` silnik dziś tylko omija.
5. **`.menu`** (popover + wersja arkuszowa): `.context-menu`, `.ctxPop`; scalić z `.nav-more-dropdown`, `.lang-menu`, `.account-menu`, które mają już takie samo tło, cień i r-md.
6. **`.color-picker`** i **`.range`**: 2 żywe implementacje + 1 martwa (pkt 15), suwaki ×3, `.mode-range`.
7. **`.progress`**: wydzielić z `.uni-progress-*` i używać też w Ustawieniach.
8. **`.drawer`** (+ `.scrim`, `.nav-item`): szuflady `.gs-sidebar`, `.m-side`, `.explorer-left` z 4 tłami.
9. **`.modal--sm/--md/--lg`**: 11 klas istnieje tylko po to, żeby ustawić szerokość okna.
10. **`.q-preview`**: podgląd pytań ×3 (games, marketplace, settings).
11. **`.check-row`**: etykieta z checkboxem ×4.
12. **`.carousel`**: home + manual.
13. Pomocnicza **`.cluster`** (już przewidziana w doc §4.3): zastępuje ok. 17 klas `*-actions`.

## Kolejność prac (od największego zysku)
1. **Usunąć martwy CSS w `control.css`**: picker koloru i suwaki (760-900, 1058-1076), `.roundsOrder*` (129-201), `.qList`/`.qRow` (279-326), `.finalCol` (671-689), `.sectionBlock`/`.sectionTitle` (51-63), `.setting-item` (902-909), `.lbl2` (525), `.logoTile` (1091-1110). W `control/js` brak użyć (sprawdzone grepem). Do tego **duplikaty wewnątrz `game-settings.css`** (`.sfx-*` 132-201 vs 407-441). Około 400 linii bez zmiany wyglądu i bez e2e.
2. **`editor.css:338-410` → klasy silnika** (`.overlay`, `.modal`, `.mTitle`, `.mSub`, `.import*`), `.addTile` → `.addCard`. Kopia 1:1; `.addTile` ma 14 odwołań w e2e (trzeba zmienić selektory).
3. **Przyciski, ciąg dalszy obecnej pracy:** `.c2-btn` → `.btn` (5 miejsc w ui.js), `.msg-icon-btn`, `.search-submit` ≡ `.mkt-search-button` → `.btn.icon.is-active`, `.tab-btn.active` → `.is-active`, `.roundsOrderBtn`, `.sfx-preview-btn`, `.logoX` → `.tile .x` (e2e 6), `.imgSetBtn` (e2e 3). Nowe `.is-active` jest już w silniku.
4. **Podpowiedzi i statusy:** scalić podwójne `.hint` w silniku (components.css:608 / layout.css:88), potem 17 klas `*-hint` → `.hint` i nowy `.status-line`/`.callout`. Najwięcej nazw na jedną rolę, prawie zero e2e.
5. **Puste stany:** `.bld-no-q` ≡ `.mkt-no-q` i 8 innych → `.empty-state`, a `*-load-retry` ×3 → jeden wariant. e2e minimalne.
6. **Pigułki:** `.mail-pill` ×13 i `.session-status` → `.tag--*`; 5 liczników → `.badge`. Tylko Ustawienia i Eksplorator, e2e 0-1.
7. **Nowy `.card`** (+ `--inset`/`--entry`) i przepięcie ok. 25 klas kart; przy okazji ręczne narożniki `:has(.slot-*.active)` w bases/polls/contacts → `.tabs-card`.
8. **A2HS ×3** (snake/buzzer/host) → usunąć nadpisania, zostawić `flat.css`; ewentualnie dodać `--fullscreen-safe`.
9. **`.segmented` i `.field`** (game-settings, Control, Ustawienia). `.toggle-item` ma 22 odwołania w e2e: zachować nazwę albo zmienić selektory testów.
10. **`.menu`, `.drawer`, `.color-picker`, `.range`, `.progress`, `.q-preview`, szerokości `.modal--*`.** Największy koszt (Eksplorator: `.context-menu` e2e 25, `.cm-item` e2e 21), zysk głównie w spójności.
11. **Na końcu Ustawienia (doc §8a):** wiersze admina → `.shareRow`, inline paski postępu → `.progress`.

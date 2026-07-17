# Plan wdrożenia — wydajność i wizualne lagi

Status: 🔲 = do zrobienia | ✅ = zrobione

---

## ETAP 1 — FOUC fix (skel-body + topbar-ready)
✅ Zrobione — wszystkie główne strony

✅ builder.html + builder.js  
✅ bases.html + bases.js  
✅ polls.html + polls.js  
✅ editor.html + editor.js  
✅ game-settings.html + game-settings.js  
✅ connect-device.html + connect-device.js  
✅ marketplace.html + marketplace.js  
✅ settings.html + settings.js  
✅ index.html + index.js  
✅ login.html + login.js  
✅ base-explorer.html + base-explorer/js/page.js  
✅ manual.html + manual.js  
✅ account.html + account.js  
✅ privacy.html + privacy.js  
✅ 404.html  
✅ maintenance.html  
✅ poll-text.html  
✅ poll-points.html  

---

## ETAP 2 — iOS: touch-action + pointerdown w topbarze
✅ Zrobione

✅ css/base.css — touch-action:manipulation na przyciskach topbara  
✅ js/core/topbar-controller.js — dropdown "Więcej": click → pointerdown  
✅ js/core/topbar-controller.js — dropdown konta: click → pointerdown  
✅ js/core/topbar-controller.js — hamburger toggle + close: click → pointerdown  
✅ backdrop overlay — zostawiony jako click (żeby nie triggerować przy dragowaniu)  

---

## ETAP 3 — Ujednolicenie breakpointów → 980px
✅ Zrobione

✅ css/base.css — 8 wystąpień 900px → 980px  
✅ css/builder.css — 3 wystąpienia 900px → 980px + min-width:1025px → 981px  
✅ css/account.css, auth-landing.css, game-settings.css, login.css, manual.css, marketplace.css — po 1  
✅ css/settings.css — 3 wystąpienia  
✅ css/bases.css — 2 wystąpienia  
✅ css/polls-hub.css — 3 wystąpienia + 2× min-width:901px → 981px  
✅ css/index.css — 2 wystąpienia  
✅ js/pages/settings.js — 5 wystąpień matchMedia 900px → 980px  
✅ js/pages/index.js — 1 wystąpienie  

---

## ETAP 4 — Back buttons: withLangParam wszędzie
✅ Zrobione

✅ js/pages/game-settings.js — import + withLangParam('/builder')  
✅ js/pages/polls.js — backTarget = withLangParam(ret || "builder")  
✅ js/pages/bases.js — import + getBackLink() owinięte w withLangParam  
✅ js/pages/editor.js — import + 4× location.href = withLangParam("builder")  
✅ js/core/topbar-controller.js — usunięto martwe selektory [data-mobile-back],.btn-back,.btn.back  
✅ manual.js, privacy.js, connect-device.js — już miały withLangParam  

---

## ETAP 5 — Promise waterfall: initI18n + auth równolegle
✅ Zrobione

✅ js/pages/builder.js — requireAuth startuje równolegle z initI18n  
✅ js/pages/polls.js — requireAuth startuje równolegle z initI18n  
✅ js/pages/editor.js — requireAuth startuje równolegle z initI18n  
✅ js/pages/connect-device.js — getUser startuje równolegle z initI18n  
✅ js/pages/marketplace.js — getUser startuje równolegle z initI18n  
✅ js/pages/privacy.js — getUser startuje równolegle z initI18n  
✅ js/pages/account.js — loadProfile() startuje równolegle z initI18n  
✅ js/pages/bases.js — już równoległe (IIFE)  
✅ base-explorer/js/page.js — requireAuth równolegle z initI18n  

---

## Dodatkowe poprawki (poza pierwotnym planem)

✅ logo-editor: addCard min-height 230px = logoTile (brak skoku wysokości)  
✅ logo-editor: logoPrev min-height 151px — rezerwuje miejsce przed canvas  
✅ logo-editor: async canvas rendering przez requestIdleCallback (nie blokuje UI)  
✅ logo-editor: scrollbar-gutter:stable both-edges — brak zmiany szerokości kafelków  
✅ base-explorer: skel-body na body  

---

## ETAP 6 — Cleanup
🔲 W trakcie

### 6.1 Duplikaty .hidden w CSS
🔲 control/control.css — sprawdzić czy control.html importuje base.css → jeśli tak, usunąć duplikat  
🔲 display/styles.css — to samo  
🔲 css/buzzer.css — to samo  
🔲 logo-editor/logo-editor.css — to samo  
🔲 base-explorer/base-explorer.css — to samo  

### 6.2 Mieszane sposoby ukrywania elementów
🔲 Ocenić zakres — może być zbyt duże ryzyko regresu, zdecydować czy robić  

### 6.3 Topbar-controller: resize listenery
🔲 Połączyć w jeden listener z debounce (~16ms)  

### 6.4 Preconnect na wszystkich stronach
🔲 Dodać `<link rel="preconnect">` do Supabase i cdn.jsdelivr.net  

---

## ETAP 7 — RPC Supabase dla wyników ankiety

### 7.1 Napisać RPC w Supabase
🔲 Migracja: funkcja get_poll_preview(p_game_id uuid) zwraca JSON z pytaniami + głosami  
🔲 Obsłużyć 3 przypadki: STATUS.READY, POLL_POINTS, POLL_TEXT  

### 7.2 Zaktualizować polls.js
🔲 Zastąpić previewResults() jednym await sb().rpc('get_poll_preview', ...)  

### 7.3 RLS
🔲 Sprawdzić czy SECURITY DEFINER potrzebny  

# Plan wdrożenia — wydajność i wizualne lagi

Status: 🔲 = do zrobienia | ✅ = zrobione

---

## ETAP 1 — FOUC fix (skel-body + topbar-ready)
✅ Zrobione — wszystkie główne strony

---

## ETAP 2 — iOS: touch-action + pointerdown w topbarze
✅ Zrobione

---

## ETAP 3 — Ujednolicenie breakpointów → 980px
✅ Zrobione

---

## ETAP 4 — Back buttons: withLangParam wszędzie
✅ Zrobione

---

## ETAP 5 — Promise waterfall: initI18n + auth równolegle
✅ Zrobione

---

## Dodatkowe poprawki (poza pierwotnym planem)

✅ logo-editor: addCard min-height 230px = logoTile (brak skoku wysokości)
✅ logo-editor: logoPrev min-height 151px — rezerwuje miejsce przed canvas
✅ logo-editor: async canvas rendering przez requestIdleCallback (nie blokuje UI)
✅ logo-editor: scrollbar-gutter:stable both-edges — brak zmiany szerokości kafelków
✅ base-explorer: skel-body na body + remove('page-loading') po initI18n

---

## ETAP 6 — Cleanup
✅ Zrobione

✅ 6.1 — Usunięto duplikaty `.hidden`/`[hidden]` z CSS (control, buzzer, logo-editor, base-explorer)
✅ 6.2 — Pominięto (zbyt duże ryzyko regresu, 203 wystąpień style.display)
✅ 6.3 — Pominięto (resize listenery — refaktor bez zysku)
✅ 6.4 — Preconnect do jsdelivr + supabase na wszystkich 27 stronach

---

## ETAP 7 — Control: szybsze ładowanie
✅ Zrobione

✅ 7.1 — ctrlLoader overlay ("Ładowanie panelu…") widoczny po initI18n, usuwany po renderFromState()
✅ 7.2 — skel-body + page-loading już były
✅ 7.3 — ensureAuthOrRedirect() + loadGameOrThrow() w Promise.all (jeden round-trip mniej)
✅ 7.4 — sfx.js nie blokuje (brak AudioContext przy imporcie) — pominięto
✅ 7.5 — preconnect — zrobione w 6.4

---

## ETAP 8 — RPC Supabase dla wyników ankiety
✅ Zrobione

✅ Migracja 223: get_poll_preview(p_game_id uuid) — 3 przypadki: ready/poll_points/poll_text
✅ polls.js: previewResults() → jednym sb().rpc('get_poll_preview', ...) zamiast N+1 query
✅ Efekt: prawie natychmiastowe ładowanie wyników (był 10+ round-tripów, teraz 1)
✅ SECURITY DEFINER + sprawdzenie owner_id = auth.uid()

---

## ETAP 9 — Refaktor bootPage() (opcjonalny)
🔲 Pominięto — nie warto przy obecnej strukturze

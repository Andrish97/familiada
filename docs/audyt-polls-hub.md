# Audyt polls-hub (`polls-hub.html` + `js/pages/polls-hub.js` + `css/polls-hub.css`)

Stan na commit `70924371a`. Audyt z lektury kodu + przyszłe testy e2e.

## Rozmiar i struktura

| Plik | Linie | Co robi |
|---|---|---|
| `polls-hub.html` | 132 | layout: dwie kolumny (Ankiety + Zadania), modale (Udostępnij, Szczegóły, Progress) |
| `js/pages/polls-hub.js` | 1194 | lista ankiet/zadań, sorting/filtering, udostępnianie do subskrybentów, wysyłanie maili, usuwanie głosów |
| `css/polls-hub.css` | 779 | viewport lock, scroll w .hub-list, desktop/mobile, media query landscape |

Zależności core: `db-guard.js`, `auth.js`, `game-validate.js`, `modal.js`, `topbar-controller.js`, `modal-sheet.js`.

---

## P0 — utrata / uszkodzenie danych

### 1. refreshData() w setInterval bez error handling **[pewne]**
`polls-hub.js:1189`. `setInterval(() => refreshData(), 30000)` nie ma try/catch. 
Jeśli RPC failed (sieć, sesja, DB), strona może zostać w stanie nieaktualnym bez komunikatu. 
Debugowanie trudne bo błąd jest czyszczony / nie wyświetlony.
**Poprawka**: dodać try/catch w setInterval albo w samej `refreshData()`; jeśli failed, pokazać alert lub log.

### 2. RPC zwracające obiekty mogą być null — brak null check **[pewne]**
`polls-hub.js:707`: `const subById = new Map(((await sb().rpc("polls_hub_list_my_subscribers")).data || []).map(...))`.
Jeśli `.data` jest null (RPC error ale response.ok=true), `.data || []` spasuje, ale jeśli całe `.data` struktury są mniej szczegółowe niż oczekiwane, map może rzucić. 
Również linia 1010-1011: dwie równoległe RPC bez obsługi błędów w `refreshData()`.
**Scenariusz**: wybrać ankietę → Szczegóły → sieć spada → RPC vraca brak danych → pusta tabela, ale `renderDetails()` może się wysypać.
**Poprawka**: destructure RPC z error handling, checked response shape.

### 3. setProgress() pokazuje bez czyszczenia progressOverlay na error **[pewne]**
`polls-hub.js:488-495` (decline task). `setProgress({ show: true, ... })` na start, ale jeśli RPC failed i exception, finally zawsze robi `setProgress({ show: false })`. To OK.  
Ale sprawdzić czy na szybkiego zamknięcia modalu progress overlay nie zostaje widoczny — mogą się nakładać.

---

## P1 — błędy funkcjonalne

### 4. shareMsg czyszczone są zbyt wcześnie / zbyt późno **[do potwierdzenia]**
`polls-hub.js:612`: `shareMsg.textContent = ""` na start openShareModal.  
`polls-hub.js:741, 755, 767, 875, 879`: setowanie tekstu msg różnie — czasami `.shareSaveFail()`, czasami z kontekstem.  
Ale gdzie się czyszcz po zamknięciu modalu? `closeShareModal()` (linia 688) robi `shareList.innerHTML = ""` ale nie czyści `shareMsg`. 
Po otwarciu drugiej ankiety ten sam msg może zostać na ekranie.
**Scenariusz**: Udostępnij ankietę → fail → zamknij modal → otworz inną ankietę → stary komunikat.
**Poprawka**: w `closeShareModal()` dodać `shareMsg.textContent = ""`.

### 5. Brak debounce/lock przy szybkim kliknięciu ankiet **[pewne]**
`polls-hub.js:446`: `item.addEventListener("click", () => selectPoll(poll))` bez blokady. 
Szybkie klikanie różnych ankiet może spowodować że `selectedPollId` zmienia się a `renderDetails()` czeka na RPC — 
wyniki zmieszane, detale są ze złej ankiety.
**Scenariusz**: klik A, natychmiast klik B, RPC A powraca po RPC B → szczegóły od A zamiast B.
**Poprawka**: w `selectPoll()` ustawić flagę `isLoadingDetails` na true, unblock gdy render skończony.

### 6. Task decline nie mówi o statusie potem — trzeba refresh **[do potwierdzenia]**
`polls-hub.js:487-490`: po `polls_hub_task_decline` robi `await refreshData()`. To powinno pracować, ale:
- `refreshData()` jest asynchroniczne, a modal zamyka się od razu?
- Czy pauza wystarczająca że RPC i render zdażą?
**Scenariusz**: odrzuć zadanie → modal zamyka się → ale dane się aktualizują z opóźnieniem.
**Poprawka**: czekać na completetion `refreshData()` przed zamknięciem modalu albo dodać visual feedback.

---

## P2 — niespójności UX

### 7. Brak informacji czy użytkownik może edytować ankietę czy nie **[pewne]**
`polls-hub.js` nie pokazuje „czemu" przycisk Szczegóły jest disabled. W metodzie z game-validate powinno być msg.
**Poprawka**: `validateGame()` zwraca code, użyć do wyświetlenia błędu jeśli action blocked.

### 8. Sortowanie taskies filtruje + sortuje razem — trudno **[pewne]**
`polls-hub.js:381-402` `sortTasksList()`. Switch na sortState.tasks ma cases "available" i "done" które robiąfiltry,  
a potem są cases dla samego sortowania. Ale każdy click na sort przełącza state, więc widok się zmienia.
Intuicyjnie: "dostępne" powinno być toggle, a sorting oddzielny.
**Poprawka**: rozdzielić filtrowanie i sortowanie (dwie zmienne).

### 9. Focus task z URL (`?t=`) nie działa na mobile **[pewne]**
`polls-hub.js:24, 116-125`. `focusTaskToken` się czyta, ale nigdy się nie ustawia selectedPollId.  
`focusTaskHandled` ma być flagą żeby nie robić tego wielokrotnie, ale brak logiki na `selectedPollId = focusedTask.poll_id`.
**Scenariusz**: otwierz link do konkretnego task na telefonie → niewidoczny, trzeba szukać.
**Poprawka**: dołożyć logikę ustawiania `selectedPollId` i scrollowania do task.

---

## Tłumaczenia

Szybki przegląd — żeby sprawdzić czy wszystkie `t()` i `data-i18n` są zdefiniowane we wszystkich 3 plikach (pl, en, uk).

Kluczowe klucze do sprawdzenia:
- `pollsHubPolls.*` — główne teksty
- `pollsHubPolls.mail.*` — emaile
- `pollsHubPolls.modal.*` — modale

**TODO**: grep przez kod, match z translation/*.js, raportować brakujące.

---

## Testy e2e (TODO)

- [ ] Zaloguj test user
- [ ] Lista ankiet się ładuje
- [ ] Klik na ankietę → szczegóły sie pokazują
- [ ] Sortowanie działa
- [ ] Udostępnij → submit → OK message
- [ ] Focus task z URL ?t=
- [ ] Task decline
- [ ] Szybkie klikanie ankiet (race condition test)

---

## RPC verification (TODO)

Sprawdzić w `supabase/migrations/`:
- `polls_hub_list_polls` — shape
- `polls_hub_list_tasks`
- `polls_hub_list_my_subscribers`
- `polls_hub_share_poll`
- `polls_hub_task_decline`
- `polls_hub_tasks_mark_emailed`
- `poll_admin_delete_vote`
- `polls_badge_get`
- `get_unsub_info_for_task_emails`

Czy zwracają shape jaki JS oczekuje? Czy error handling jest poprawny?

---

## Poprawki

(Będą wdrażane iteracyjnie po testach)

---

## Status

- Lektura kodu: ✅ w toku
- Tłumaczenia: ⏳
- RPC verification: ⏳
- Testy e2e: ⏳
- Poprawki: ⏳

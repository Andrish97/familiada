# Usuwanie gry i konta — stan i mapa docelowa

Etap **E12** w [`wdrozenia.md`](wdrozenia.md). Audyt kodu 2026-10-07
(`supabase/schema.sql` do migracji 308). Część dotycząca ankiet wchodzi
w E11 ([`ankiety-refaktor.md`](ankiety-refaktor.md)).

---

## 1. Usunięcie gry — dziś

| Wejście | Sprawdzenia w bazie |
|---|---|
| Lista gier → Usuń (`delete_resource_checked('game')`) | właściciel; odmowa przy otwartej ankiecie albo zajętej blokadzie gry |
| Usunięcie kopii ze Społeczności (`market_remove_from_library`; lista gier i Społeczność) | **brak** (tylko sprawdzenie na stronie gier, w Społeczności żadnego) |
| Wycofanie nieudanego importu (`games-import-export.js:150`) | **brak** — zwykły `delete` |
| Bezpośrednio przez API (reguła RLS `games_owner_delete`) | **brak** — omija `delete_resource_checked` |
| Usunięcie konta | **brak** |

Kaskadą znika: pytania, odpowiedzi, sesje i głosy ankiety, zaproszenia,
kody urządzeń, stan rozgrywki, aktywność. Zostaje: blokady (wygasają po
25 s), **maile w kolejce** (zaproszenia do usuniętej ankiety dalej
wychodzą), zapamiętane urządzenia (`shared_devices` z pustą grą), wpis
w Społeczności (bez gry źródłowej), dźwięki w Storage przy usunięciu
inną drogą niż lista gier.

Głosujący / urządzenia po usunięciu: linki i QR dają „nie znaleziono”,
zaproszenie „nieprawidłowy token”, wyświetlacz „zły klucz albo gra nie
istnieje” — działa, ale komunikaty są techniczne.

## 2. Usunięcie konta — dziś

Wejścia: strona Konto (funkcja `delete-account` → `delete_user_everything`),
„porzuć konto gościa” (`guest_discard_current`), nocne czyszczenie gości
i niepotwierdzonych kont (`guest_cleanup_expired`).

| Dane | Co się dzieje |
|---|---|
| Moje gry (z ankietami, zaproszeniami, głosami) | usunięte, **bez sprawdzenia otwartej ankiety i blokad** |
| **Moje głosy w cudzych ankietach** | **usunięte** — zmieniają cudze wyniki |
| Moje bazy | usunięte z udostępnieniami — współpracownik traci bazę w trakcie edycji |
| Logo, profil, konto | usunięte |
| Subskrypcje i zaproszenia po `user_id` | usunięte |
| **Subskrypcje i zaproszenia tylko po e-mailu** | **zostają**; po ponownej rejestracji tym samym e-mailem **wracają** do nowego konta |
| Opublikowane w Społeczności | zostają, bez autora |
| **Kolejka maili** | zostaje — oczekujące maile dalej wychodzą, nieudane leżą z pełną treścią na zawsze |
| Logi maili, tokeny wypisania, zgłoszenia kontaktowe (e-mail, IP), zaproszenia do baz (e-mail), limity wysyłek | zostają na zawsze |
| Pliki (Storage) | konto: usuwane **przed** bazą (błąd bazy = pliki znikają, konto zostaje), max 1000 plików; porzucenie gościa: **wcale** |

## 3. Mapa docelowa (propozycja do potwierdzenia)

**Gra**
1. Jedna droga usunięcia w bazie: `delete_resource_checked('game')` —
   także dla kopii ze Społeczności i wycofania importu; reguła RLS na
   bezpośredni `delete` gier usunięta.
2. Otwarta ankieta nie blokuje usunięcia: w istniejącym oknie
   potwierdzenia usunięcia dochodzi informacja „Ankieta zostanie
   przerwana” (decyzja 2026-10-07). Zajęta blokada gry dalej blokuje.
3. Usunięcie gry usuwa jej maile z kolejki, zapamiętane urządzenia tej gry
   i jej pliki (dźwięki) — w bazie / jednej funkcji, nie po stronie
   przeglądarki.
4. Głosujący / urządzenia: „Ta ankieta / gra została usunięta” zamiast
   komunikatów technicznych.

**Konto**
1. **Usunięcie konta jest nadrzędne** (decyzja 2026-10-07): nie czeka na
   blokady ani otwarte ankiety — usuwa wszystko. Otwarte strony innych
   (współpracownik w mojej bazie, moja druga karta) przy najbliższym
   odnowieniu blokady / akcji dostają `gone` → komunikat „usunięte”.
   To jedyny wyjątek od zasady „blokady trwałe” (`blokady-zasobow.md`).
2. **Moje głosy w cudzych ankietach zostają anonimowe** (bez powiązania
   z kontem) — cudze wyniki się nie zmieniają (decyzja 2026-10-07).
3. Usuwane też wszystko, co powiązane z moim **e-mailem**: subskrypcje
   i zaproszenia tylko po e-mailu, zaproszenia do baz, oczekujące
   i nieudane maile do mnie i ode mnie, logi maili, tokeny wypisania,
   limity wysyłek, zgłoszenia kontaktowe — **całe** (decyzja 2026-10-07).
   Ponowna rejestracja tym samym e-mailem zaczyna od zera.
4. Współpracownik mojej bazy: przy najbliższej akcji / odnowieniu
   blokady komunikat „Baza została usunięta” z wyjściem do listy baz.
5. Pliki: najpierw baza, potem pliki (z kolejki, ze stronicowaniem);
   także przy porzuceniu konta gościa.
6. Jedna funkcja usuwania używana przez wszystkie trzy wejścia.

## 4. Decyzje (2026-10-07)

1. Usunięcie gry z otwartą ankietą: dozwolone; okno potwierdzenia mówi,
   że ankieta zostanie przerwana.
2. Głosy usuniętego konta w cudzych ankietach: zostają anonimowe.
3. Zgłoszenia kontaktowe usuniętego konta: usuwane całe.
4. Usunięcie konta jest nadrzędne — pomija blokady (jedyny wyjątek).
   Usunięcie gry blokady respektuje.

## 5. Stan wdrożenia (E12, 2026-10-08)

Migracja `2026-10-08_312_deletion_unified.sql` + okno usunięcia gry („Ankieta zostanie przerwana”) + wycofanie importu przez RPC + `delete-account` (baza, potem pliki ze stronicowaniem) + `guest_discard_current` czyści Storage. Reguła RLS `games_owner_delete` zostaje (testy e2e sprzątają gry bezpośrednim `delete`). Maile w kolejce gry: dopasowanie po linku `poll-go?t=<token>` w treści (brak kolumny z id gry). Test lokalny: `docs/sql/test-deletion-312.sql`. Do zrobienia: komunikaty „usunięta” na display/host/buzzer (dziś czarny ekran / cicha konsola).

## Pliki w Storage — usuwa baza (migracja 313, decyzja 2026-10-08)

Decyzja użytkownika: pliki mają znikać atomowo z wierszem, w każdym miejscu
usuwania, bez udziału przeglądarki.

- Trigger `AFTER DELETE` na `games` (folder `user-sounds/<właściciel>/<gra>`),
  `user_logos` (obraz z `payload.source.imageUrl`, tylko własny folder) i
  `profiles` (cały folder użytkownika w `user-sounds` i `user-logos`) zapisuje
  wpis w `storage_cleanup_queue` **w tej samej transakcji** — wycofane
  usunięcie nie zostawia wpisu, zatwierdzone zawsze go ma.
- Edge function `storage-cleanup` opróżnia kolejkę przez Storage API: wołana
  przez pg_net po zatwierdzeniu (trigger na instrukcję) i co 10 min przez
  pg_cron (ponowienia; po 20 próbach wpis zostaje z `last_error`).
- Przed usunięciem `storage_cleanup_claim()` odrzuca wpisy, których właściciel
  znów istnieje albo których obraz jest nadal używany (przywrócenie demo).
- Przeglądarka nie usuwa już plików przy usuwaniu gry, logo, kopii ze
  Społeczności ani przy przywróceniu demo. Wymiana obrazu w edytorze logo i
  reset dźwięków w ustawieniach gry (wiersz zostaje) — bez zmian.
- Do usunięcia po potwierdzeniu na produkcji: edge function
  `cleanup-guest-storage` i jej wywołania w `guest_cleanup_expired` /
  `guest_discard_current`, sprzątanie plików w `delete-account`.
- Wywołanie funkcji: sekrety `vault` (`project_url`, `anon_key`) — migracja 318
  (`app_config` z 313 nie był ustawiony; kolejka nie była opróżniana do 2026-10-09).
- Test lokalny: `docs/sql/test-storage-313.sql`.

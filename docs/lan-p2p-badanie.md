# Połączenie lokalne urządzeń (LAN / hotspot) — badanie

Pytanie użytkownika (2026-10-22): czy urządzenia w jednej sieci (ten sam
router, hotspot z telefonu bez internetu) mogą łączyć się lokalnie zamiast
przez bazę — np. w górach ze słabym internetem.

## Jak jest dziś

- Każda zmiana gry idzie: Control → Cloudflare → nasz serwer (zapis
  `game_state`, nowa rewizja) → Realtime (`postgres_changes`) → urządzenia.
  Baza jest jedynym źródłem prawdy: rewizje, lease urządzeń, atomowe
  naciśnięcie Przycisku (`game_state_buzzer_press`), statystyki.
- Strony ładują się z `www.familiada.online`; `web/sw.js` służy tylko do
  instalacji PWA — **bez pamięci podręcznej offline**. Bez internetu strony
  się nie otworzą.
- Kanał „dzwonka” (`familiada-state:<gameId>`) jest publiczny i niesie tylko
  numer rewizji (urządzenie i tak pobiera stan z bazy) — nie wolno nim
  przesyłać samego stanu, bo każdy znający id gry mógłby go podrobić.

## Technika: WebRTC DataChannel

Przeglądarki mogą łączyć się bezpośrednio (peer-to-peer) przez WebRTC.
W jednej sieci połączenie idzie po kandydatach „host” (adresy lokalne; Chrome
ukrywa je pod nazwami mDNS `*.local`, w sieci lokalnej zwykle się
rozwiązują) — bez serwera STUN/TURN i bez internetu. Opóźnienie w LAN to
pojedyncze milisekundy. Działa w Chrome/Android, Safari/iOS, Firefox; na
telewizorach (Tizen/webOS) — do sprawdzenia.

Warunek: wymiana „ofert” (SDP) między urządzeniami — tzw. sygnalizacja.

Przeszkody:
- **Izolacja klientów** w części sieci (hotelowe, publiczne Wi-Fi, niektóre
  routery „gościnne”) blokuje ruch między urządzeniami → potrzebny powrót do
  serwera. Hotspot z telefonu (Android, iPhone) zwykle pozwala.
- Sygnalizacja potrzebuje kanału: przy internecie — nasz Realtime (prywatny
  kanał z autoryzacją lease); bez internetu — tylko ręcznie (kody QR w obie
  strony: Control pokazuje ofertę, urządzenie skanuje i pokazuje odpowiedź do
  zeskanowania przez Control) — niewygodne przy 3 urządzeniach.

## Warianty

### A. Przyspieszacz lokalny (internet potrzebny, baza zostaje źródłem prawdy)

- Control po udanym zapisie (zna nową rewizję i pełny stan) wysyła stan także
  kanałem WebRTC do urządzeń w tej samej sieci; urządzenie stosuje to, co
  przyjdzie pierwsze (wyższa rewizja wygrywa), `postgres_changes` i odczyt
  z bazy zostają jako potwierdzenie i zapas.
- Zysk: odpada droga zapis → WAL → Realtime → urządzenie (przy słabym łączu
  telefonu-Wyświetlacza to większość opóźnienia). Zostaje czas zapisu
  z Control (jedno łącze zamiast dwóch).
- Przycisk: naciśnięcie dalej rozstrzyga baza (uczciwość), ale sygnał
  „ktoś nacisnął” może iść lokalnie od razu.
- Nakład: średni — sygnalizacja przez Realtime (prywatny kanał), połączenia
  Control↔każde urządzenie, odnawianie po zerwaniu, wskaźnik „połączenie
  lokalne” w kaflach urządzeń, diagnostyka (już mamy pomiar łącza, 466).
- Nie pomaga, gdy internetu nie ma wcale.

### B. Tryb offline (hotspot bez internetu)

- Strony z pamięci podręcznej (Service Worker z cache stron Control,
  Wyświetlacza, Prowadzącego, Przycisku i fontów/dźwięków) — urządzenia muszą
  je wcześniej otworzyć z internetem; dane gry (pytania, logo, dźwięki)
  pobrane przed wyjazdem.
- Control staje się źródłem prawdy: rewizje, kolejność naciśnięć Przycisku
  (rozstrzyga Control po czasie odbioru — w LAN różnice są pomijalne),
  timery; statystyki zapisane lokalnie i wysłane po powrocie internetu.
- Parowanie bez serwera: kody QR w obie strony (lub krótki kod + lokalne
  wykrywanie — przeglądarka nie potrafi sama nasłuchiwać w sieci, więc bez
  serwera zostaje QR).
- Nakład: duży — druga ścieżka całego silnika gry (dziś logika bezpieczeństwa
  i lease siedzi w SQL), osobne testy, ryzyko rozjazdu z trybem online.

## Rekomendacja

1. Najpierw zebrać dane z pomiaru łącza (466): jeśli spowolnienia to głównie
   „łącze urządzenia”, wariant A realnie pomoże tylko przy jednym słabym
   urządzeniu w dobrej sieci lokalnej; jeśli „serwer” — pomoże przeprowadzka
   serwera i strojenie Realtime.
2. Wariant A jako osobny etap (po przeprowadzce serwera), z decyzją
   użytkownika.
3. Wariant B tylko przy wyraźnej potrzebie (gry w terenie bez internetu) —
   to w praktyce nowy tryb aplikacji.

## Decyzje

(brak — czeka na użytkownika)

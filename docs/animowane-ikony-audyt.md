# Animowane części ikon — audyt i decyzje (2026-10-25)

## Decyzje użytkownika

Wspólny silnik ma obsługiwać animowane części SVG. W tej paczce wdrażamy
hamburger zmieniający się w krzyżyk oraz kawę: filiżanka i spodek stoją,
para płynnie zmienia kształt fali. Pozostałe zastosowania stanowią kolejkę,
nie polecenie jednoczesnego animowania całego interfejsu.

Animacja nie zmienia pola ikony, fontu, wymiarów przycisku ani układu.
Dziedziczy currentColor. Ograniczony ruch wyłącza animację, zachowuje czytelny
stan. Para działa tylko w obszarze widoku i aktywnej karcie; bez pętli JS.

## Zakres audytu

Baza: `27e8357e5e`. W plikach HTML/JS publicznej aplikacji, z pominięciem
bibliotek i definicji samego katalogu: 382 dosłowne odwołania do 75 nazw ikon
w 66 plikach (icon/iconText/data-icon/data-i18n-icon). To dolna granica:
nazwy składane ze stanu nie są liczone. Poniżej miejsca i warunki wdrożenia.

| Priorytet | Ikona / miejsce | Ruch części i wyzwalacz | Źródło stanu / ograniczenie |
|---|---|---|---|
| Wdrożone | Hamburger, wspólny topbar | Trzy kreski → dwie przekątne; odwrócenie po zamknięciu | `topbar-controller.js`, aria-expanded; klik, klawiatura, Escape, zamknięcie panelem/tłem i nawigacja |
| Wdrożone | Kawa, wspólna stopka | Dwie krzywe pary zmieniają falę, filiżanka stoi | `support-modal.js`, widoczność SVG/karty i prefers-reduced-motion; rozmiary kaw w oknie statyczne |
| Następne | Strzałki list rozwijanych | Obrót grotu przy otwarciu/zamknięciu | `list-search.js`, `ui-select.js`, aria-expanded; 14 dosłownych użyć caret-down/7 plików |
| Następne | Zapis ustawień i logo | Krótka sygnalizacja pracy, po sukcesie narysowanie check | `game-settings.js` saving, `logos/js/editor-page.js` saving/status; dopiero po wyniku serwera, nie po samym kliknięciu |
| Następne | Kopiowanie / Powiel | Rozsunięcie kartek, potem potwierdzenie | `resource-duplicate.js` aria-busy i rozstrzygnięcie Promise; nie odtwarzać sukcesu przy błędzie |
| Następne | Pokaż/ukryj hasło | Powieka / przekreślenie zmienia stan | `password-toggle.js`; stan pola type i etykieta dostępności, bez dekoracyjnej pętli |
| Opcjonalne | Dźwięk i wyciszenie | Fale znikają/pojawiają się | Panel Control i ustawienia; faktyczny stan mute, bez powiązania z czasem audio |
| Opcjonalne | Foldery drzewa baz | Obrót strzałki i otwarcie konturu | `bases/explorer/js/ui/tree.js`; aria-expanded / stan drzewa, nie na każdy rerender listy |
| Opcjonalne | Wysyłanie / import / eksport | Ruch strzałki podczas rzeczywistej pracy | aria-busy/Promise; 10 użyć upload/6 plików i 5 download/3 pliki; bez fikcyjnego procentu |
| Ostrożnie | Dzwonek / liczniki | Jedno krótkie poruszenie po nowej informacji | Zmiana liczby, nie ponowne wczytanie topbara i nie stale dodatni licznik |
| Bez automatycznej pętli | Odśwież / reset | Obrót wyłącznie podczas pobierania | 15 użyć refresh/10 plików obejmuje także reset ustawień; sam kształt ikony nie dowodzi pracy sieciowej |
| Statyczne | Usuń, błędy, ostrzeżenia, konto, język | Czytelny symbol | Brak animacji opóźniającej decyzję, ukrywającej błąd lub sugerującej sukces |
| Osobny silnik | Plansza gry, punkty, X, czas finału, buzzer | Istniejący renderer rozgrywki | Poza biblioteką ikon; nie ingerować w rytm i synchronizację gry |

## Kontrakt silnika

- SVG w `web/assets/icons` jest jednym źródłem rysunku statycznego i części.
- `node scripts/build-icon-parts.mjs` generuje mały `icon-parts.js`; unit pilnuje
  aktualności. Brak pobierania SVG po pokazaniu strony i podmiany geometrii.
- `icon("hamburger", { animation: "menu" })` i `icon("coffee", { animation: "steam" })`.
  HTML: `data-icon-animation="menu|steam"`; hydracja zachowuje tę deklarację.
  Zwykłe `icon(name)` nadal używa cache'owanego zewnętrznego SVG.
- Hamburger korzysta z transformacji części w CSS i aria-expanded przycisku.
  Para korzysta z natywnej interpolacji krzywej SVG (`animate attributeName="d"`),
  a wspólny `icon-motion.js` zarządza widocznością, ograniczonym ruchem i odpinaniem.
- Bez obsługi SMIL/IntersectionObserver rysunek pozostaje statyczny i czytelny.
- Nowa animacja wymaga jawnej pary nazwa/profil, testu stanów i pomiaru
  geometrii. Nie uruchamiać wszystkich animacji po każdym renderze dokumentu.

# Animowane części ikon — audyt i decyzje (2026-10-25)

## Decyzje użytkownika

Wspólny silnik obsługuje animowane części SVG: hamburger, parę kawy,
strzałki rozwijania, oko hasła, zapis ustawień i Powiel. Filiżanka i spodek
stoją, para płynnie zmienia kształt fali. Dalsze zastosowania mają osobne
priorytety w tabeli.

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
| Wdrożone | Hamburger, wspólny topbar | Trzy kreski → dwie przekątne; odwrócenie po zamknięciu | `topbar-controller.js`, aria-expanded; klik, klawiatura, Escape, zamknięcie przełącznikiem/tłem i nawigacja |
| Wdrożone | Kawa, wspólna stopka | Dwie krzywe pary zmieniają falę, filiżanka stoi | `support-modal.js`, widoczność SVG/karty i prefers-reduced-motion; rozmiary kaw w oknie statyczne |
| Wdrożone | Strzałki wspólnych list, konta i Więcej | Obrót grotu przy otwarciu/zamknięciu | `ui-select.js`, `topbar-controller.js`, aria-expanded; stałe wymiary przycisku |
| Wdrożone | Zapis ustawień gry | Ruch szczeliny podczas pracy, check po sukcesie | `game-settings.js`: aria-busy oraz wynik CAS; nowa edycja usuwa check, błąd go nie pokazuje |
| Wdrożone | Powiel w Grach, Bazach i Logo | Rozsunięcie kartek na czas oczekiwania | Istniejące aria-busy w `resource-duplicate.js`; koniec ruchu nie udaje sukcesu, wynik opisuje rzeczywista operacja |
| Wdrożone | Pokaż/ukryj hasło | Tęczówka i rysowane przekreślenie | Wspólne `auth.js` (initPasswordToggles): rzeczywisty type, aria-pressed, jeden zachowany SVG; etykieta PL/EN/UK |
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


## Weryfikacja wdrożenia

Unit 814/814. Chromium 390/360/1400: fala zmienia krzywą przy stałej
filiżance, pauza przy ograniczonym ruchu, własna oś czasu SVG, brak zmian
geometrii przycisku. Kontrola produkcji 40232849277 5/5 i po doprecyzowaniu
Escape 40233368390 1/1. Pages 40233133027. Prywatna kopia silnika oraz
ujednolicenie TinyMCE mają własną weryfikację w repo familiada-server.

- Uzupełnienie decyzji 2026-10-25: główne menu jest szufladą z prawej,
  zamykaną tym samym hamburgerem/X. Usunięto dodatkowy krzyżyk panelu.
  Animowane kreski obejmują także sekcje ustawień i spis Wskazówek;
  drzewo baz zachowuje przyciski widoków drzewo/tagi/kategorie.

### Kolejna paczka: stany kontrolek (2026-10-25)

Decyzja właściciela: więcej animacji. Cztery dodatkowe profile są uruchamiane
przez rzeczywiste stany kontrolek, bez powiększania ikon i bez pętli dekoracyjnej.
Maski kopii dostają unikalne ID przy każdym renderowaniu. Strzałki i wspólny
silnik są synchronizowane również z prywatnym pakietem admina; jego poprawka
przewijania selektora pozostaje zachowana.

Stopka: ostateczna decyzja właściciela przywraca **dokładnie oryginalny rozmiar
1.45em i wymiary Kontaktu**, pozostawiając animację pary. Nie powiększać jej
ponownie w celu uwidocznienia ruchu.

Potwierdzenie wdrożenia dodatkowych profili: publiczne Pages **40241370158**,
kontrola produkcji **40241473501 ✓ 4/4**, jednostkowe po merge **828/828**.
Prywatnie CI **40240583138 ✓ 91 unit + 25 browser**, production
**40240924445 ✓**. Status paczki: **zrobione**.

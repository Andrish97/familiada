# Przebudowa kontroli unikalności gier — 2026-10-25

## Aktualny stan produkcji — zakończone

Działa pełny system: blokada identycznych zestawów w bazie (487/488),
porównanie tekstowe i znaczenia pytań z odpowiedziami, świeże raporty
oraz potwierdzanie zbieżności i niepełnych wyników w panelu. Model działa
na własnym serwerze; kod `services/market-semantic` i osobny workflow
`deploy-market-semantic.yml` są w repo familiada, zgodnie z decyzją właściciela.
Prywatne familiada-server zawiera instalator i compose. Bez nowego DNS,
publicznego portu ani domeny; prywatna sieć `supabase_default`, 1 CPU/1 GiB,
read-only, osobny token generowany wyłącznie na serwerze.

Deploy modelu 40199162665 ✓ (kod 424dd2aab): kontrola autoryzacji, zasobów
oraz zbioru parafraz PL/EN/UK; uzupełniono 900 pytań z 90 gier.
Raporty zapisanej gry oraz kandydata przed publikacją przez rzeczywiste
Edge przeszły w trzech językach. DB READ ONLY 40199332058 ✓:
**900/900 wektorów i 90/90 pełnych raportów**, aktywny indeks kopii,
bezpośredni INSERT użytkownika zablokowany, 0 grup identycznych zestawów.

Produkcja 40199335322 ✓ 2/2 (zgłoszenie/prywatny podgląd oraz blokada kopii
pod nowym ID, tytułem i językiem). Poprzednia kontrola całego zmienionego
przepływu 40193541789 ✓ 6/6: także anonim, biblioteka, ocena i ochrona listy
oceniających. Jednostkowe testy instalacji/sekretów 8/8, kontraktu usługi 5/5,
wcześniejsze testy SQL i wyścigów oraz raportów/API pozostają zielone.

Okresowe uzupełnianie działa co 15 minut, a podgląd/sprawdzenie w panelu
uzupełnia brakujący kontekst sprawdzanej gry. Zmiana pytań/odpowiedzi
unieważnia ich wektory; tytuł i punktacja nie wymagają nowego liczenia.
Migracja 489: timeout HTTP 90 s zamiast domyślnego 5 s dla większej partii,
lokalny SQL ✓, produkcja 40199926405 ✓ (log OK 13:58:49 UTC).
Rzeczywisty wywołany mechanizm crona 40200181919 ✓: aktywne zadanie,
konfiguracja Vault obecna, jawny timeout, odpowiedź HTTP 200 bez przekroczenia
czasu i z pełnym indeksem. Tokeny i treści nie są wypisywane do Actions.

Podobieństwo jest wskazaniem dla moderatora; dokładne kopie blokuje baza.
Zbiór kontrolny parafraz: 29/30 wykrytych i 0/30 kontrolnych wskazanych,
co nie jest gwarancją wykrywania każdej parafrazy ani ogólnym benchmarkiem.
Podobieństwo tekstowe/znaczenia porównujemy w języku gry; identyczne zestawy
są chronione globalnie także po zmianie etykiety języka.

Poniższy dziennik zawiera wcześniejsze stany sprzed wdrożenia.

## Decyzje i zakres

Użytkownik: „Możemy przebudować system sprawdzania? Żeby był skuteczny”.
Realizujemy poprawkę po audycie `audyt-unikalnosci-gier.md`. Gałąź
`codex/market-uniqueness`. Publiczne gry i obecny interfejs pozostają.

Zasady przyjęte do implementacji:
- Dokładna kopia = ten sam zbiór pytań i odpowiedzi po normalizacji tekstu,
  niezależnie od tytułu, autora, ID, języka wpisu, kolejności i punktacji.
  Punkty same nie tworzą nowej gry. Powtarzające się elementy są zachowane
  w formacie kanonicznym, granice pytań/odpowiedzi są jednoznaczne.
- Blokada w bazie obejmuje pending i published, wszystkie ścieżki zapisu,
  ponowną publikację i edycję, także równoczesne transakcje. Rejected/
  withdrawn nie rezerwują treści. Obecnych rekordów nie usuwamy ani nie
  modyfikujemy ich pytań/odpowiedzi.
- Normalizacja zachowuje diakrytykę i znaczące symbole wewnątrz tekstu;
  ujednolica Unicode, wielkość liter, odstępy i końcową interpunkcję zdań.
- Zbieżność części pytań lub parafrazy to wskazanie dla moderatora, nie
  automatyczne odrzucenie. Raport pokazuje konkretne pary pytań i metodę.
  Tytuł jest osobną informacją, nigdy dowodem identycznej treści.
- Dokładne i tekstowe porównanie działają zawsze. Porównanie znaczenia
  dodaje wyniki, nie wyłącza pozostałych metod; brak części wektorów jest
  widoczny jako niepełne pokrycie. Żaden brak/błąd nie oznacza „unikalna”.
- Świeży skan po zmianie danych; wersja treści chroni przed zastosowaniem
  wyników lub wektorów do zmienionej gry. Uprawnienia moderatora chronią
  raporty zgłoszeń i treści pending. Komunikaty autora bez danych innych
  prywatnych zgłoszeń.
- Przyjęto lokalny model CPU na własnym serwerze, po pomiarze zasobów.
  Część bazodanowa i panel działają niezależnie od dostępności modelu.

## Etapy

1. Dodające funkcje kanoniczne i raport porównania, lokalny PG + testy
   kopii i wariantów, prawdziwe opublikowane dane oraz współbieżność.
2. Powiązany model per pytanie; testy PL/EN/UK i dostępności/aktualności.
3. Raport w moderacji i generatorze, odrzucanie dokładnych kopii w każdej
   ścieżce, komunikaty użytkownika PL/EN/UK, świeżość, zrzuty i Wskazówki.
4. Bramka branch E2E → publikacja zgodnie z procedurą → kontrola produkcji.
   Dodające migracje można wdrożyć przed kodem; włączenie blokady po
   przygotowaniu obsługi błędu. Bez przerwy przy zgodnych odczytach i
   dodawaniu funkcji; ewentualną przerwę ocenić dopiero na podstawie zmian.

## Dziennik

2026-10-25: start implementacji; brak zmian działania produkcji.


2026-10-25 — wykonanie na branchu (produkcja bez zmian):
- 487: kanoniczny SHA-256 pytania/odpowiedzi, projekcja per pytanie,
  raport dokładny/tekstowy/znaczeniowy, jawne pokrycie i klucz wersji
  zatwierdzenia. Wektory zależą od pytania z odpowiedziami; zmiana punktów
  nie wymaga ponownego liczenia, zmiana pytania/odpowiedzi tak. Zapis CAS.
- 488: unikalny indeks aktywnej treści obejmuje też wyścig, zmianę języka,
  autora i ID; wrappery zachowują kontrakt RPC, zwracają duplicate_content.
  Zapis bezpośrednio z konta użytkownika zamknięty — zgłoszenia przez RPC.
- Edge i panel: raporty par pytań/odpowiedzi, świeży skan i weryfikacja
  aktualnego klucza korpusu przed akceptacją. Potwierdzenie moderatora
  przy podobieństwie/niepełnym modelu, żadnego automatycznego usuwania.
- Usługa CPU services/market-semantic: przypięty model i biblioteki,
  własny sekret, tylko prywatna sieć, brak logów treści i zewnętrznego API
  podczas pracy. Przyjęto wariant lokalny do przygotowania implementacji;
  użytkownik nadal może zmienić tę preferencję z pytania asynchronicznego.
- Porównano dwa modele i oba warianty wejścia. Sam tekst pytania dawał
  mylące podobieństwa szablonu. Wybrano MiniLM multilingual z pytaniem
  i odpowiedziami, próg 0,70, co najmniej 3/10 dopasowanych pytań.
  Kontrolowane kopie z parafrazami: 29/30 pytań, 0/30 kontroli negatywnych;
  rzeczywisty SQL wykrył wszystkie 6 gier w 3 parach PL/EN/UK (nie jako
  identyczny content). To mały zbiór, nie gwarancja każdej parafrazy.
- Prawdziwy opublikowany katalog, lokalny SQL + rzeczywiste wektory:
  90/90 pełnych raportów, 14 gier ma po 1 kandydacie do porównania;
  brak identycznych kopii. Bez oznaczania tych wskazań jako dowodu kopii.
- Lokalne testy SQL 487/488 i dwie równoczesne transakcje ✓. JS unit 14/14
  nowych/powiązanych, szersza bramka 47/47 przed ostatnimi poprawkami.
  Browser panelu: telefon/komputer, raport → anuluj → ponownie potwierdź,
  poprawny klucz zatwierdzenia, 2/2. Zrzuty 18 PL/EN/UK, panel i błąd kopii.
- Obraz Docker zbudowany. Rzeczywisty kontener: 1 CPU, 1 GiB, użytkownik
  bez roota, read-only; health, 3 języki, 384 wymiarów, 401 dla złego
  sekretu ✓. Pamięć po próbie ok. 612 MiB, szczyt cgroup ok. 623 MiB.
  Trwa końcowe sprawdzenie maksymalnej partii i ostatniej wersji kodu.

Blokada wdrożenia infrastruktury: repo Andrish97/familiada-server zwraca
404 przez CLI i aplikację GitHub. Lista dostępnych repo integracji nie
zawiera tego repo. Konto deploy ma ograniczone sudo do istniejących
instalatorów, więc potrzebny jest dostęp do repo konfiguracji. Wysłano
pytanie asynchroniczne o udostępnienie/nazwę; dalsze testy lokalne trwają.
Nie wdrożono 487/488, kodu Edge ani frontu. Workflow market-model-preflight
służy wyłącznie odczytowi numerycznych zasobów serwera, bez zmian.


Końcowa bramka lokalna: 50/50 unit (w tym 15 dla raportu/modelu/API),
Worker 17/17. Native browser 2/2: telefon/komputer, zmiana wersji korpusu
zatrzymuje potwierdzenie, powrót do raportu i potwierdzenie nowego klucza
bez publikacji przed zgodą. Zrzuty: 18 + 2 potwierdzenia. Zabezpieczono
również przejściowo stary format Edge podczas niezależnych wdrożeń:
brak klucza wersji/pokrycia daje 503, nie możliwość zatwierdzenia.
Maksymalna partia kontenera 32 × 1024 znaki przeszła pod limitem 1 CPU/
1 GiB w 1,08 s, bez OOM; szczyt pamięci cgroup ok. 678 MiB. Obraz końcowy
07473b70e34f8d970edf9d5c0301e5bc53a488b7c7ecdaacf78a49505c680f42.
Przygotowany workflow capacity nie jest uruchomiony — nowy plik nie jest
jeszcze na main; zasobów VPS nadal nie zmierzono.

Kontrola końcowego obrazu także z `--network none` ✓: health, model QA-v1,
3 języki, 384 wymiary i autoryzacja, 1 CPU/1 GiB, bez sieci. Wyłączona
telemetria runtime. TypeScript modułu i lint no-undef ✓. Repo konfiguracji
ponownie sprawdzone — nadal 404. Zabezpieczono również zmianę wersji korpusu
między podglądem a kliknięciem i dialog na telefonie (potwierdzenie dopiero
po schowaniu arkusza; Anuluj odtwarza raport).
Bramka CI kodu brancha dotyczy zgodności publicznego katalogu i zgłoszenia
z obecną bazą. Nowy test `unikalność treści` wymaga 488 i ma zostać wykonany
po migracji razem z kontrolą produkcji; lokalny odpowiednik z wyścigiem
już przeszedł. Pozostałe testy raportów moderatora mają kontrolowany backend,
bez logowania prawdziwego człowieka przez Cloudflare Access.


Bramka zgodności kodu brancha z działającym backendem:
[40191286096](https://github.com/Andrish97/familiada/actions/runs/40191286096)
— sukces 2/2 (anonimowy katalog, wyszukiwanie/filtry/języki/historia;
zgłoszenie i prywatny podgląd po odświeżeniu) oraz wybrane unity.
To potwierdza zgodność dotychczasowego publicznego przepływu. Nie jest to
kontrola wdrożenia nowego guarda ani usługi na VPS — te wymagają 487/488
oraz dostępu do konfiguracji serwera.

Stan do kontynuacji: branch `codex/market-uniqueness`, implementacja
b09f15320 + 826df5fa5, sprzątnięcie artefaktów 113d1bfde. Drzewo kodu
przetestowane i wypchnięte. Produkcja pozostaje na poprzedniej wersji.
Dostęp do `Andrish97/familiada-server` ponownie sprawdzony po wszystkich
testach — 404. Następny krok po udostępnieniu: odczytać instrukcje prywatnego
repo, zmierzyć dostępne zasoby, dodać prywatną usługę/sekret/URL w Edge,
wykonać testy instalatora, potem procedura 487 → bramka kodu → kod i 488 →
uzupełnienie wektorów → test nowego guarda oraz kontrola produkcji.
Bez dodatkowego potwierdzania zgody na samą przebudowę.


Decyzja wykonawcza: blokada serwerowego repo dotyczy instalacji modelu,
nie niezależnej ochrony dokładnych kopii. Kontynuujemy wdrożenie SQL,
raportów tekstowych i UI z jawnym stanem niedostępnego modelu. Procedura:
dodające 487 → CI brancha po tej migracji → kod razem z zachowaniem 488 →
kontrola produkcji, a po dostępie do serwera osobne uruchomienie i walidacja
modelu. To daje działającą ochronę bez czekania na nową infrastrukturę.
Stary panel/nowy backend i odwrotnie mają jawne odrzucenie niezgodnego
protokołu (`uniqueness_protocol: 2`), bez udawania pełnych wyników.
Agent_reader otrzymuje wyłącznie odczyt raportu (STABLE), aby zweryfikować
realną produkcję przez numeryczne db-read; inni użytkownicy nadal bez dostępu.

Przed publikacją: numer 486 zajął niezależny etap Wyświetlacza na main.
Niewdrożone pliki tego etapu przenumerowano na 487 (model danych) i 488
(blokada treści); wcześniejsze wpisy dziennika używają numeracji roboczej.

Capacity READ ONLY 40192840935 ✓: 4 CPU, 8 326 938 624 B RAM,
5 765 394 432 B dostępne, swap 4 294 963 200 B, dysk wolny
78 116 810 752 B. Lokalny model z limitem 1 CPU/1 GiB ma zapas;
przed instalacją uwzględnić bieżące obciążenie i zasady prywatnego repo.
Pierwszy etap 487 opublikowany 64207656a; oczekiwanie na log migracji.

Etap 487 zastosowany: Apply DB 40192829492 ✓, schema/log zsynchronizowane
1dedce609, log OK 12:24:58 UTC. DB READ ONLY 40193092955 ✓: 90 gier,
900 pytań, 90 prawidłowych raportów, 0 wektorów, 0 pełnych raportów
znaczenia, 0 grup kopii. Stan zgodny z oczekiwaniem przed 488.
Bramka kodu po migracji: 40193089231 (kod 2edf00f7a).

2026-10-25 — użytkownik udostępnił familiada-server, CLI i integracja
potwierdzają dostęp. Wznowienie wdrożenia modelu: osobny projekt compose
w prywatnej sieci, 1 CPU/1 GiB, osobny generowany na serwerze sekret;
check przed apply zgodnie z CLAUDE.md infrastruktury, potem indeksacja
i numeryczna kontrola pełnego pokrycia oraz punktowy E2E.

Decyzja użytkownika: moduł w repo familiada, osobny workflow wdrożeniowy
jak Lead Finder. Kod już w services/market-semantic; nowy automat
deploy-market-semantic.yml używa konta deploy i ograniczonego instalatora
z prywatnego familiada-server. Publiczny adres/DNS nie jest potrzebny: Edge
i model komunikują się przez prywatną sieć supabase_default.

Pierwszy deploy modelu 40198714440: obraz zbudowany, start przerwany przed
zmianą Edge. Błąd flow-list YAML dzielił tmpfs na dwa wpisy. Poprawiono
cytowanie w prywatnym compose i publicznym przykładzie. Rzeczywisty lokalny
start przez compose z poprawioną konfiguracją ✓: tmpfs /tmp z obiema opcjami,
read-only, 1 CPU/1 GiB, zdrowie i 3 języki × 384 wymiarów.

Model wdrożony 40199162665 ✓: 900 pytań/90 gier uzupełnione, pełne
raporty i kandydaci w PL/EN/UK przez Edge ✓; kontrola parafraz 29/30,
0/30 negatywnych (zbiór kontrolny, nie ogólna miara skuteczności).
DB read 40199332058 ✓: 900/900 wektorów, 90/90 pełnych raportów.
Produkcja 40199335322 ✓ 2/2 (zgłoszenie, kopia pod nowym ID/tytułem/językiem).
Dodatkowy odczyt crona 40199723621 ✓: zadanie aktywne i 3 wymagane sekrety
obecne, ale domyślny timeout pg_net to 5000 ms. Migracja 489 ustawia
90000 ms dla partii modelu (handler może pracować kilkadziesiąt sekund).
Lokalny rzeczywisty PL/pgSQL + atrapy Vault/pg_net ✓: limit czasu, nagłówki,
granice partii, brak żądania bez sekretu, zachowane ograniczone uprawnienia.

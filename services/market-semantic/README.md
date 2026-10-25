# Porównywanie znaczenia pytań i odpowiedzi — lokalny CPU

Usługa wyłącznie w prywatnej sieci Supabase. Nie przechowuje ani nie loguje
pytań. Pobranie modelu jest częścią budowania obrazu, uruchomiony kontener
korzysta z lokalnych plików i nie potrzebuje dostępu do Hugging Face ani API.
Licencja modelu: Apache-2.0. Wersja kodu/parametrów i plików modelu przypięta
w `requirements.txt` i `model_spec.py`; zmiana modelu/poolingu/wejścia wymaga
nowego `MODEL_ID`, aby nie mieszać wektorów.

Model porównuje pojedyncze pytanie **wraz z odpowiedziami**, pomija punkty.
Kontekst wejścia tworzy SQL `market_embedding_text`; pytania i odpowiedzi
mają oddzielne granice. Same podobne sformułowania bez kontekstu powodowały
fałszywe alarmy w teście katalogu. Dokładne kopie chroni osobno baza; model
nigdy sam nie usuwa ani nie odrzuca podobnej gry.

## Interfejs

- `GET /health`: gotowość po wczytaniu modelu i jego identyfikator.
- `POST /embed`: `X-Internal-Secret`, JSON `{model,texts}`. Maksymalnie 32
  niepuste teksty, każdy do 1024 znaków, całość do 192 KiB. Wynik `{ok,model,
  vectors}`; 384 skończone liczby na wektor. Brak kolejki równoległych
  inferencji: jedna, następne dostają 429. Żadnych logów treści.
- Brak sekretu blokuje start. Inna wersja plików/manifestu blokuje start.
  Zły sekret 401, błędne wejście 400, niedostępny model 503.

## Testy

`python3 -m unittest discover -s services/market-semantic -p test_service.py`
— granice, autoryzacja, brak wywołania modelu przez health/odrzucone żądanie.

`python services/market-semantic/check_quality.py --model=/ścieżka/do/modelu`
— rzeczywisty przypięty model; 30 przygotowanych par parafraz PL/EN/UK
z tymi samymi odpowiedziami oraz 30 par o różnych tematach/odpowiedziach.
Taki zbiór sprawdza kopiowanie gry przy przeredagowaniu pytań, nie jest
pełnym benchmarkiem wszystkich możliwych parafraz i odpowiedzi.

`--public-games=<lokalny JSON> --output=<plik.npy>` dodatkowo sprawdza
opublikowany katalog, wypisuje wyłącznie liczby. Nie dodawać treści gier
ani pliku wektorów do repozytorium lub publicznych logów CI.

Wynik pomiaru 2026-10-25: dla progu 0,70 wykryto 29/30 par pozytywnych,
0/30 kontrolnych. Zestaw 10 pytań z parafrazami przekracza próg raportowania
w każdym z trzech języków. Nie jest to gwarancja wykrywania każdej parafrazy.
Katalog 900 pytań z odpowiedziami: 12,43 s na jednym wątku w środowisku
pomiarowym, szczytowy RSS procesu testowego ok. 780 MiB. To nie pomiar VPS.
Przewidziany limit kontenera: 1 CPU i 1 GiB; przed produkcją sprawdzić wolną
pamięć i pomiar pod rzeczywistym limitem.

## Uruchomienie w konfiguracji prywatnego serwera

`compose.example.yaml` jest fragmentem do repozytorium infrastruktury,
nie kompletnym instalatorem. Bez publikowania portu lub domeny. Sekret
`SEMANTIC_TOKEN` w pliku root 0600, poza repo. Nowy, losowy sekret można
przekazać Edge jako `MARKET_SEMANTIC_TOKEN`; usługa i klient muszą dostać
tę samą wartość. Nie wypisywać jej do logu.

Funkcja Edge `generate-game` potrzebuje:

- `MARKET_SEMANTIC_URL=http://market-semantic:8090` — faktyczna nazwa usługi
  i port w prywatnej sieci;
- `MARKET_SEMANTIC_TOKEN` — powyższy sekret. Kod klienta dopuszcza też
  istniejący `GENERATE_GAME_SECRET`, jeśli instalator świadomie użyje go
  po obu stronach. Sekret nie trafia do przeglądarki.

Przykład budowania: `docker build -t familiada-market-semantic:<sha>
services/market-semantic`. W środowisku proxy z własnym CA dodać
`--secret id=proxy_ca,src=<plik-CA>`; mount służy tylko pobieraniu i nie
zostaje w obrazie. Zachować właściwy bundle CA, nie wyłączać TLS.

Kolejność: testy lokalne → prywatna konfiguracja, zasoby i start usługi →
model dodający 487 → testy kodu brancha → wspólna publikacja kodu i blokady
488 → uzupełnienie wszystkich pytań przez panel/cron → kontrola produkcji.
Wycofanie obrazu usługi nie wyłącza dokładnej blokady i tekstowego porównania;
stan znaczenia jest jawnie niepełny/niedostępny. Nie usuwać indeksu ochrony
jako obejścia błędu modelu.

W tej sesji repo `Andrish97/familiada-server` zwracało 404 w CLI i integracji.
Wdrożenie serwerowe wymaga dostępu do prawidłowego repo infrastruktury;
konto deploy nie ma ogólnego sudo ani prawa dodania dowolnego kontenera
(`docs/przeprowadzka-serwera.md`). Nie należy obchodzić tych ograniczeń.

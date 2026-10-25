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

Wdrożenie kodu modułu obsługuje `.github/workflows/deploy-market-semantic.yml`
w tym repo: push do main ze zmianą modułu albo ręczne uruchomienie. Używa
istniejącego konta deploy i ograniczonego instalatora
`familiada-deploy-market-semantic <pełny SHA>`. Instalator, compose i konfiguracja
serwera są w prywatnym `Andrish97/familiada-server`; moduł pozostaje tutaj.
Nie wymaga nowego sekretu GitHub ani rekordu DNS.

Instalator buduje obraz przypisany do SHA, sprawdza gotowość, autoryzację
i kontrolny zbiór PL/EN/UK, konfiguruje osobny token wyłącznie na serwerze,
odświeża kontener funkcji Edge, uzupełnia brakujące wektory i sprawdza raporty
w trzech językach. W logu są wyłącznie liczniki i wersje; treści oraz tokeny
nie trafiają do Actions. Poprzedni obraz służy do powrotu przy nieudanym starcie.
Kolejne wdrożenie nie obraca sekretu i nie liczy ponownie gotowych kontekstów.

Migracje 487/488 i aplikacja są wdrożone. Bieżący stan modelu i numery
przebiegów wdrożeniowych: `docs/unikalnosc-gier-plan.md`.
Pomiar zasobów 40192840935: 4 CPU, ~7,8 GiB RAM, ~5,4 GiB dostępne;
kontener ma limit 1 CPU/1 GiB. Wycofanie obrazu nie wyłącza dokładnej blokady
ani tekstowego porównania; niepełny wynik znaczenia jest jawny w panelu.

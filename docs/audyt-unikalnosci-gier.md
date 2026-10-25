# Audyt unikalności Gier Społeczności — 2026-10-25

**Wniosek: kontrola jest pomocnicza i nie zapewnia unikalności treści.**
Blokada powtórnego zgłoszenia tego samego źródła działa, lecz kopia z nowym
ID przechodzi. Ręczny skaner wykrywa zbliżony tekst, ma niepełną obsługę
porównywania znaczenia i może przechowywać nieaktualne wyniki.

Zakres: polecenie „Zbadaj sprawdzanie unikalności gier, czy jest skuteczne?”.
Badanie na bazie main bfa51debe; kod działania aplikacji, konfiguracja,
sekrety i gry produkcyjne nie były zmieniane. Zapytanie produkcyjne wykonane
w sesji READ ONLY przez `agent_reader`; treści wyłącznie publicznych gier
pobrane przez anon RPC. Funkcji generujących embeddingi na produkcji nie
wywoływano: taki test zapisuje dane i korzysta z zewnętrznej usługi.

## Dane produkcyjne

Odczyt [40184031948](https://github.com/Andrish97/familiada/actions/runs/40184031948)
— sukces, 2026-10-25 10:15 UTC. Reprodukowalne liczniki:
`scripts/db-read/market-uniqueness-audit.sql`.

| Pomiar | Wynik |
|---|---:|
| Opublikowane / oczekujące | 90 / 0 |
| Opublikowane PL / EN / UK | 70 / 10 / 10 |
| Aktywne gry z embeddingiem / bez | 0 / 90 |
| Brakujący lub nieaktualny tekst pytań | 0 |
| Brakujący lub nieaktualny fingerprint pytań | 0 |
| Grupy o identycznym fingerprint w obrębie języka | 0 |
| Identyczne zestawy pytań także po zmianie kolejności | 0 |
| Grupy o tym samym tytule po trim/lower | 0 |

Publiczny katalog: 900 pytań w 90 grach. Lokalny PostgreSQL 16 z `pg_trgm`,
rzeczywiste funkcje tekstu/fingerprint ze `supabase/schema.sql` oraz wyłącznie
publiczna treść: 2505 par w tym samym języku (2415 PL, 45 EN, 45 UK).
Żadna nie przekroczyła progu 0,45; maksimum 0,417, średnia 0,234. Największe
pokrycie identycznymi pytaniami w parze: 1. Badanie nie ujawniło zatem
pełnych kopii w obecnym katalogu. Nie jest to dowód braku podobieństw
znaczeniowych ani pomiar precision/recall na oznaczonym zbiorze parafraz.

**0/90 embeddingów oznacza brak kompletnego korpusu semantycznego w chwili
odczytu.** Nie ustalono przyczyny (konfiguracja tokenu, dostępność API,
format odpowiedzi lub harmonogram). Kod może próbować utworzyć wektor
bieżącej gry na żądanie. Po powodzeniu używa wyłącznie kandydatów już
posiadających wektor, po niepowodzeniu przechodzi do `pg_trgm`.
Nie należy przedstawiać obu trybów jako zawsze uruchamianych równolegle.

## Potwierdzone problemy

### 1. Kopia treści przechodzi jako nowe zgłoszenie

`market_submit_game` blokuje parę autor + źródłowe `game_id` w statusie
pending/published. Nie porównuje treści z innymi rekordami. Blokada advisory
chroni współbieżne zgłoszenie jednego ID, nie identyczne kopie o innych ID.

Lokalny test z rzeczywistą funkcją SQL i triggerem fingerprint:

| Przypadek | Wynik |
|---|---|
| Pierwsze zgłoszenie | Przyjęte |
| Ponowne zgłoszenie tego samego ID | `already_submitted` |
| Te same pytania i odpowiedzi, inna gra źródłowa i tytuł | Przyjęte |
| Te same pytania i odpowiedzi, inny autor | Przyjęte |

Końcowo 3 przyjęte zgłoszenia i 1 fingerprint treści. Test wykonywany na
odrębnej lokalnej bazie; gotowość gry oraz tożsamość były kontrolowanymi
atrapami, aby wyizolować unikalność. Produkcyjny przepływ nie był wywoływany.

`market_admin_review` przy akceptacji nie uruchamia skanera. Generator
`publish-producer-game` i `update-producer-game` także zapisują bez kontroli
unikalności. Sprawdzenie jest osobną, ręczną akcją panelu. Nie ma blokady
publikacji opartej na treści.

### 2. Fingerprint jest obliczany, ale nie egzekwuje unikalności

Trigger prawidłowo aktualizuje tekst/fingerprint po zmianie payload.
`market_games_questions_fingerprint_idx` jest zwykłym indeksem, nie UNIQUE;
żadna ścieżka zgłaszania/publikacji nie używa go do odrzucania kopii.

Obejmuje tylko teksty pytań, łączone znakiem nowej linii, lower i redukcję
białych znaków; pomija odpowiedzi i punktację. Zmiana kolejności albo
interpunkcji zmienia hash. Zatarcie granic pytań może dać ten sam hash dla
inaczej podzielonego tekstu. Nie wystarczy więc zmienić tego indeksu na UNIQUE
bez zaprojektowania właściwego formatu porównania i zasad dotyczących wersji.

### 3. Mieszane pokrycie embeddingami powoduje pomijanie kopii

`check-uniqueness` wybiera embedding **albo** tekst. Gdy badana gra ma wektor,
a identyczny zestaw pod innym tytułem go nie ma, SQL semantyczny pomija taki
rekord. Tekst nie jest już sprawdzany. Wykonanie rzeczywistego handlera TS
z atrapą API/DB potwierdziło pusty wynik przy identycznych pytaniach.

Niekompletność korpusu jest istotna także podczas pierwszego uzupełniania:
`scanForDuplicates` uruchamia tylko jedną partię `embed-missing` (25), a nie
pętlę do końca. Późniejszy skan może zachować wcześniej niepełne wyniki.

### 4. Parafrazy mogą być uznane za unikalne

Kontrolowany zestaw 10 pytań oraz jego parafraza, np. „Co jesz na śniadanie?”
→ „Z czego składa się twój pierwszy posiłek dnia?”: `pg_trgm` 0,183,
poniżej progu 0,45. Brak ostrzeżenia tekstowego mimo zbliżonego znaczenia.
Przykład pokazuje konkretną lukę, nie ogólny odsetek pominiętych kopii.

Zmiana kolejności pytań, wielkości liter, spacji lub usunięcie znaków
zapytania dały 1,000 i zostałyby wykryte przez tekst. Nie należy więc
mylić słabości fingerprintu z zachowaniem właściwego skanera tekstowego.
Zmiana samych odpowiedzi/punktów nie wpływa na te porównania.

### 5. Panel może pokazać stary albo niepełny wynik jako poprawny

- `scanForDuplicates` pomija ID obecne w `uniquenessCache`. Kolejne użycie
  przycisku nie oznacza ponownego sprawdzenia wszystkich gier. Publikacja,
  usunięcie lub edycja innej gry i dołożenie wektorów nie unieważniają całej
  pamięci zależnych wyników. Odświeżenie listy czyści pamięć, ale ponowne
  kliknięcie skanowania jej nie czyści.
- `embed-missing` przy braku tokenu zwraca HTTP 200 z `ok:false`. Frontend
  sprawdza jedynie status HTTP i nie reaguje na taki wynik; może ogłosić
  zakończenie skanowania bez wykonania części semantycznej.
- Błąd zapytania o identyczne tytuły jest ignorowany przez handler.
- Etykieta „brak (>=45%)” pozostaje taka sama w trybie semantycznym,
  mimo że jego próg wynosi 78%.
- Identyczny tytuł jest przedstawiany jako podobieństwo 100% niezależnie
  od treści. `ilike` nie ucieka znaków `%` i `_`; w takich tytułach stają
  się wzorcami. W aktualnych 90 tytułach nie występują te znaki.

## Pozostałe uwagi techniczne

- SQL porównuje wyłącznie ten sam język i pending/published — jest to
  obecna granica zakresu, nie wykrywanie tłumaczeń między językami.
- Podobieństwo dotyczy całego połączonego tekstu, nie par poszczególnych
  pytań; nie raportuje liczby wspólnych/przepisanych pytań.
- Limit 8 stosowany jest w SQL przed usunięciem bieżącej gry w Edge,
  więc pozostaje najwyżej 7 innych kandydatów.
- `generateEmbedding` akceptuje tylko tablicę wierszy po 384 liczby;
  płaski wektor 384 wartości jest odrzucany, wektor zerowy akceptowany.
  Potwierdzone na kontrolowanych odpowiedziach, bez twierdzenia, jaki format
  zwraca obecnie zewnętrzny provider w tej instalacji.
- Nie walidowano jakości modelu `all-MiniLM-L6-v2` na PL/EN/UK. Tytuł i opis
  są dołączane do embeddingu; odpowiedzi i punkty nie są dołączane.
- Istniejący test E2E `already_submitted` sprawdza powtórzenie jednego
  źródła, nie kontrolę identycznej treści różnych źródeł.

## Zalecany prosty zakres poprawki — bez wdrożenia w tym audycie

1. Ustalić dokładny odcisk publicznej treści: uporządkowane/normalizowane
   pytania i odpowiedzi, niezależny od tytułu i ich kolejności; jasno
   rozróżnić zmianę punktacji od nowej gry. Używać go w zgłoszeniu i
   publikacji, z ochroną transakcyjną przed równoczesnymi kopiami.
2. Zawsze uruchamiać dokładne porównanie oraz tekstowe wyszukiwanie pytań;
   semantykę dodawać do wyniku jako uzupełnienie. Identyczny tytuł pokazać
   osobno, bez traktowania go jako dowodu identycznej gry. Podobieństwo
   znaczeniowe pozostawić oceną moderatora, z pokazaniem konkretnych pytań.
3. Naprawić widoczność stanu: świeży skan po zmianie korpusu, licznik
   pokrycia embeddingami, jawny tryb/progi/błąd. Uzupełnić wektory i dopiero
   wtedy oceniać skuteczność na przykładach PL/EN/UK.

Dla tych 90 gier nie ma uzasadnienia przebudowa infrastruktury. Najpierw
poprawna kontrola w obecnej bazie i czytelny wynik w panelu. Testy poprawki
powinny objąć kopie innych autorów, zmianę tytułu/kolejności, parafrazy,
częściowy brak wektorów, awarię API, świeżo dodaną grę i wyścig publikacji.

## Źródła i zakres weryfikacji

- `supabase/schema.sql`: `market_submit_game`, `market_admin_review`,
  `market_games_build_questions_text`, `market_games_compute_fingerprint`,
  `market_games_set_questions_fields`, obie `market_find_similar_*`,
  indeks fingerprintu i trigger.
- `supabase/functions/generate-game/index.ts`: publikacja, aktualizacja,
  `check-uniqueness`, `embed-missing`, parser embeddingów.
- `web/admin/js/generator.js`: `scanForDuplicates`, `checkUniqueness`,
  `callEdgeAction`, `uniquenessCache`, etykieta podobieństwa.
- `web/admin/js/marketplace.js` i pośrednik Workera: moderacja zgłoszeń.
- PostgreSQL 16 + pg_trgm: rzeczywiste 2505 par, 6 wariantów syntetycznych,
  granice pytań i brak unikalnego indeksu, rzeczywisty SQL zgłoszenia z
  kontrolowanymi zależnościami. Handler Edge: 8 przypadków, atrapy usług,
  brak zmian w jego źródle. Odczyt bazy produkcyjnej — liczniki, bez treści
  w logach Actions; pozostałe dane rzeczywiste wyłącznie opublikowane.

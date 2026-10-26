
## Pytania i gry Producenta

`POST /api/questions/{overview,collect,control,create,publish,unpublish}` wymaga
tego samego nagłówka Bearer co Marketing. Dostęp z panelu prowadzi przez
prywatny Worker i funkcję Edge `question-bank`; klucz nie trafia do przeglądarki.
PL/EN/UK mają oddzielne pule. Zlecenie zapisuje cel nowych pytań i trwały
postęp; restart nie kasuje kolejki. Brak wyników albo limit dostawcy nie
oznaczają ukończenia zlecenia.

- `kind=search`: źródłowe pytania/odpowiedzi/punkty z dowodem. Opcja `enrich`
  pozwala opracować brakujące odpowiedzi i punkty; pochodzenie jest jawne.
- `kind=generated`: małe partie, walidacja długości/odpowiedzi/punktów,
  dodatkowa ocena jakości, sprawdzenie powtórzeń w puli i historii gier.
- `create`: minimum 10 pytań w grze. Wybór ręczny, automatyczny albo
  znaczeniowo według kategorii. Cały zestaw gier zapisuje jedna transakcja;
  niedobór lub wyścig nie zużywają części puli. Nazwa i opis są wymagane.

SearXNG współdzieli uczciwą kolejkę `SEARCH_GATE` z Marketingiem. DeepSeek
wykonuje jedno wywołanie naraz (`AI_GATE`), naprzemiennie dopuszczając usługi.
`QUESTION_DAILY_TOKENS=100000`, `MARKETING_DAILY_TOKENS=500000` w `config.txt`
ustalają osobne limity dzienne (UTC). Rezerwacja jest atomowa w bazie przed
wywołaniem i rozliczana według `usage`; nieudane wywołanie bez `usage`
zachowuje rezerwację. Wyczerpanie limitu zapisuje stan oczekiwania i nie
obniża celu. Pamięć źródeł ogranicza ponowne pobieranie i ekstrakcję.

Druga pętla usługi wykonuje `admin_demo_apply_next`: aktualizuje kolejkę
nieedytowanych demo, ponownie sprawdzając treść i blokady przed zapisem.
Nie zmienia wzorców bez żądania administratora z podglądem wersji.

## Dziennik Marketingu

Nowe zlecenie zachowuje logi z ostatnich 7 dni. Ostrzeżenia i błędy operacji
bazy są widoczne w panelu; awaria samej tabeli dziennika trafia tylko do stderr,
żeby nie tworzyć pętli zapisu. Błędy wyszukiwarki, CEIDG i przebiegu zawierają
typ wyjątku oraz traceback (limit wpisu 16000 znaków). Timeout z pustym
komunikatem jest opisany jawnie jako np. `ReadTimeout`.

# Familiada Online

System do tworzenia i prowadzenia rozgrywki w stylu Familiada.

## 🎮 Funkcjonalności

- Tworzenie gier w trzech trybach:
  - sondaż tekstowy
  - punktowane odpowiedzi
  - preparowana (bez sondażu)
- Udostępnianie sondaży przez link i kod QR
- Zarządzanie bazami pytań (foldery, tagi, kategorie)
- Panel operatora do prowadzenia gry na żywo
- Tablica wyników na osobnym wyświetlaczu
- Widok prowadzącego (tablet / telefon)
- Przycisk do pojedynku
- Edytor własnego logo wyświetlanego podczas gry

System działa w przeglądarce – bez instalacji dodatkowego oprogramowania.

## 🌐 Strona produkcyjna

https://www.familiada.online

## 🛠 Stack technologiczny

- Frontend: Vanilla JavaScript (ES Modules)
- Backend / Auth / DB: Supabase
- Hosting: GitHub pages
- Architektura: Single-page modules + osobne widoki urządzeń

## 📌 Status projektu

Projekt jest aktywnie rozwijany.  
Publiczne repozytorium służy wyłącznie do prezentacji kodu źródłowego.

## ⚙️ Generator Gier (Worker)

Generator gier wykorzystuje model LLM (Groq) do automatycznego tworzenia treści gier. Praca odbywa się asynchronicznie za pomocą samodzielnego procesu (workera).

### Uruchomienie Workera

Worker jest napisanym w Deno skryptem, który monitoruje kolejkę w bazie danych.

1. Zainstaluj [Deno](https://deno.com/).
2. Ustaw zmienne środowiskowe:
   ```bash
   export SUPABASE_URL="twoj-url"
   export SUPABASE_SERVICE_ROLE_KEY="twoj-klucz-admina"
   export GROQ_API_KEY="twoj-klucz-groq"
   ```
3. Uruchom skrypt:
   ```bash
   deno run --allow-net --allow-env supabase/worker.ts
   ```

## 📜 Licencja

© 2026 Familiada Online. Wszelkie prawa zastrzeżone.

Kod źródłowy jest udostępniony wyłącznie do wglądu.
Zabronione jest kopiowanie, modyfikowanie, redystrybucja
oraz wykorzystywanie komercyjne bez pisemnej zgody autora.

Szczegóły znajdują się w pliku LICENSE.

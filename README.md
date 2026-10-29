# Familijna

System do tworzenia i prowadzenia drużynowej gry z pytaniami z ankiety.

## 🎮 Funkcjonalności

- Tworzenie gier w trzech trybach:
  - typowa ankieta
  - punktacja
  - preparowana (bez ankiety)
- Udostępnianie ankiet przez link i kod QR
- Zarządzanie bazami pytań (foldery, tagi, kategorie)
- Panel operatora do prowadzenia gry na żywo
- Tablica wyników na osobnym wyświetlaczu
- Widok prowadzącego (tablet / telefon)
- Przycisk do pojedynku
- Edytor własnego logo wyświetlanego podczas gry

System działa w przeglądarce – bez instalacji dodatkowego oprogramowania.

## 🌐 Strona produkcyjna

https://www.familijna.app

## 🛠 Stack technologiczny

- Frontend: Vanilla JavaScript (ES Modules)
- Backend / Auth / DB: Supabase
- Hosting: GitHub pages
- Architektura: Single-page modules + osobne widoki urządzeń

## 📌 Status projektu

Projekt jest aktywnie rozwijany.  
Publiczne repozytorium służy wyłącznie do prezentacji kodu źródłowego.

## 📜 Licencja

© 2026 Familijna. Wszelkie prawa zastrzeżone.

Kod źródłowy jest udostępniony wyłącznie do wglądu.
Zabronione jest kopiowanie, modyfikowanie, redystrybucja
oraz wykorzystywanie komercyjne bez pisemnej zgody autora.

Szczegóły znajdują się w pliku LICENSE.

## Struktura repozytorium

Frontend publikowany do Pages znajduje się w `web/`. Każda strona ma własny
katalog; współdzielony kod i zasoby znajdują się w `web/shared/`.
Opis wdrażania i plan usunięcia starego zestawu: [refaktor struktury repozytorium](https://github.com/Andrish97/familijna-server/blob/main/docs/refaktor-struktury-repo.md).

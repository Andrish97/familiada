# Testowanie wspólnego systemu ikon

Test `e2e/icon-system.spec.js` jest całkowicie lokalny. Nie loguje się, nie
łączy z Supabase i nie zapisuje żadnych danych. Uruchamia prawdziwe moduły ikon
oraz prawdziwy `settings.html`, ale panel ustawień odblokowuje wyłącznie w DOM-ie
na potrzeby kontroli wyglądu.

## GitHub Actions

1. Otwórz **Actions → E2E Tests (Playwright) → Run workflow**.
2. Wybierz gałąź, którą chcesz sprawdzić.
3. Uruchom workflow. Job `icons-local` wykona się niezależnie od testów
   produkcyjnych i nie potrzebuje sekretów.
4. Po zakończeniu pobierz artefakt **icon-system-screenshots**. Zawiera:
   - pełną galerię ikon na desktopie,
   - pełną galerię ikon na telefonie,
   - sekcję maintenance z `settings.html` na desktopie,
   - tę samą sekcję na telefonie.

Test automatycznie sprawdza również:

- poprawność wszystkich eksportów `*_ICON`,
- obecność `viewBox`, `aria-hidden="true"` i `focusable="false"`,
- zgodność wszystkich użyć `data-shared-icon` z `SHARED_ICON_MAP`,
- poprawne nawodnienie każdego wpisu wspólnego silnika,
- oba wystąpienia kalendarza w ustawieniach,
- brak tekstowego elementu `17` w kalendarzu (liczba jest wycięciem ścieżki).

## Lokalnie

W katalogu głównym repozytorium uruchom serwer:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

W drugim terminalu:

```bash
cd tests
npm ci
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/icon-system.spec.js --workers=1
```

Zrzuty znajdziesz w `tests/test-results/`.

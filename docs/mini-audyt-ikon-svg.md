# Mini-audyt ikon SVG

Stan gałęzi `claude/analyze-x-buttons-ui-2paaqm` po wdrożeniu zatwierdzonych uwag z audytu.

## Obecny system

- `js/core/icons.js` jest faktycznym źródłem ikon używanym w aplikacji. Zawiera 58 eksportowanych ikon jako tekstowe fragmenty `<svg>`.
- `img/icons/` zawiera plikowe odpowiedniki przeznaczone głównie do podglądu. Przed tym audytem było ich 38; brakujące 20 plików zostało dodanych, więc katalog ponownie odpowiada centralnemu zestawowi.
- Kod aplikacji nie odwołuje się obecnie do `img/icons/*.svg`. Pliki nie są jeszcze źródłem ikon w runtime.

## Pozostałe SVG zapisane bezpośrednio w kodzie

Poza `js/core/icons.js` pozostają 143 wystąpienia `<svg>` w 35 plikach:

- 55 w plikach HTML,
- 88 w plikach JavaScript.

Największe skupiska:

| Plik | Liczba | Charakter |
|---|---:|---|
| `settings.html` | 20 | głównie ikony interfejsu — kandydaci do centralizacji |
| `logo-editor/js/draw.js` | 19 | ikony narzędzi w szablonach dynamicznych |
| `js/pages/settings.js` | 18 | ikony dynamicznych przycisków i załączników |
| `translation/en.js` | 10 | ikony osadzone w HTML podręcznika |
| `translation/pl.js` | 10 | ikony osadzone w HTML podręcznika |
| `translation/uk.js` | 9 | ikony osadzone w HTML podręcznika |
| `builder.html` | 5 | ikony nawigacji i przycisków |

## Wyjątki, których nie należy traktować jak zwykłych ikon

Nie każde `<svg>` powinno zostać przeniesione do pliku ikony. Dotyczy to przede wszystkim:

- warstw planszy w `display.html` i `display2.html`,
- dynamicznie generowanego wektora logo w `host2/js/coverLogo.js`,
- szablonów i obszarów roboczych edytorów,
- SVG tworzonych z danych użytkownika lub aktualnego stanu aplikacji.

## Emoji i znaki zastępujące ikony

W kodzie HTML/JS poza Cloudflare pozostało 109 wystąpień obserwowanych emoji i znaków graficznych. Część jest świadomie pozostawioną typografią (np. trójkąty rozwijania, symbole odtwarzania), część znajduje się w tłumaczeniach i podręczniku, a część nadal wymaga konwersji zgodnie z komentarzami audytu.

## Wniosek techniczny

Samo zastąpienie inline SVG elementem `<img src="img/icons/...">` nie jest bezpieczne: ikony używają `currentColor`, a SVG ładowany jako obraz nie dziedziczy koloru tekstu/przycisku. Jeśli pliki mają stać się rzeczywistym źródłem runtime, najbardziej spójnym rozwiązaniem będzie jeden plik SVG-sprite i odwołania `<svg><use href="...#nazwa"></use></svg>`. Migrację należy wykonać osobno, etapami, z kontrolą wyglądu w jasnych, ciemnych i kolorowych przyciskach.

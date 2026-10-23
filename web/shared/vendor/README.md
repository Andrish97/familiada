# Biblioteki zewnętrzne serwowane z własnej domeny

Przypięte wersje, bez CDN (decyzja użytkownika 2026-10-23): strona nie zależy
od dostępności jsDelivr, a nowa wersja biblioteki trafia na produkcję tylko
świadomie, razem z testami.

| Plik | Pakiet npm | Wersja | Licencja | Skąd |
|---|---|---|---|---|
| `supabase-js.js` | `@supabase/supabase-js` | 2.118.0 | MIT | `dist/umd/supabase.js` (globalne `window.supabase`) |
| `fabric.min.js` | `fabric` | 5.3.0 | MIT | `dist/fabric.min.js` |
| `jsQR.min.js` | `jsqr` | 1.4.0 | Apache-2.0 | `dist/jsQR.js`, zminifikowany esbuild |

Aktualizacja: `npm pack <pakiet>@<wersja>`, podmiana pliku, wpis w tabeli,
testy e2e stron, które go używają. `scripts/version-assets.js` nie skanuje tego
katalogu (kod bibliotek), ale odwołania do plików dostają `?v=` jak reszta.

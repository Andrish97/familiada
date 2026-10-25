# Lead Finder — analiza (2026-10-25)

Objaw (zgłoszenie użytkownika): Lead Finder prawie nic nie znajduje, a to,
co znajduje, to w dużej części śmieci. Analiza kodu `services/lead-finder/`
(bez danych z produkcji — rola `agent_reader` nie ma dostępu do tabel
`marketing_*`).

## 1. Dlaczego prawie nic nie znajduje

Lejek: SearXNG → filtr domen/TLD → pobranie strony → **musi być e-mail** →
AI. Najwięcej gubimy na etapie e-maila.

| # | Przyczyna | Gdzie | Waga |
|---|---|---|---|
| 1 | **Odrzucane wszystkie adresy Gmail i Hotmail.** `extract_emails` sprawdza `g in e_low` (podciąg), a na liście jest `mail.com` — pasuje do `gmail.com`, `hotmail.com`. Tak samo `test.pl` wycina np. `djcontest.pl`. Mali DJ-e i wodzireje to w większości Gmail. | `main.py:232`, `garbage_email_domains.txt` | krytyczna |
| 2 | **Nie odwiedzamy podstron kontaktu.** `subpage_paths.txt` (`/kontakt`, `/o-nas`…) jest wczytywany, ale nigdzie nieużyty. Wynik wyszukiwania to często strona oferty bez maila → odpada. | `main.py:191` | wysoka |
| 3 | **Ukryte e-maile nie są rozpoznawane:** ochrona Cloudflare (`data-cfemail`, `/cdn-cgi/l/email-protection`), zapis `biuro [at] firma.pl`, encje HTML (`&#64;`). | `extract_emails` | wysoka |
| 4 | **Szablony `site:facebook.com`, `site:instagram.com`, `site:maps.app.goo.gl` nic nie dają:** Facebook/Instagram bez logowania nie pokazują maila (a Playwright jest dla nich pominięty), `.gl` nie przechodzi filtra TLD. 30 wyników na każde wyszukiwanie zmarnowane. | `templates.txt`, `main.py:311` | średnia |
| 5 | **`limit` nie jest parametrem SearXNG** — liczby 50/30/20 w szablonach nic nie robią; jedna strona wyników (~10–20) na zapytanie, bez `pageno`. | `main.py:386` | średnia |
| 6 | **Brak widoczności, czy SearXNG w ogóle zwraca wyniki.** Po przeprowadzce na Contabo (nowy adres IP) Google/Bing mogą blokować SearXNG (CAPTCHA) — kod nie loguje `unresponsive_engines` ani pustych odpowiedzi. Do sprawdzenia w pierwszej kolejności. | `producer_task` | do sprawdzenia |
| 7 | Odrzucenie jednej strony przez AI blokuje **całą domenę** do końca przebiegu (poza 5 portalami). | `main.py:513` | niska |

## 2. Dlaczego dużo śmieci

| # | Przyczyna | Gdzie |
|---|---|---|
| 1 | **Prefiltry są martwe:** `required_keywords.txt` i `negative_keywords.txt` są wczytywane, ale nieużyte — wszystko z mailem trafia do AI. | `main.py:187,192` |
| 2 | **„HARD OVERRIDE” w prompcie:** samo słowo „DJ”/„animator” w URL, tytule lub tekście = akceptacja. Artykuły, ogłoszenia, katalogi przechodzą. | `ai_prompt.txt` KROK 2 |
| 3 | **AI widzi tylko 1000 znaków tekstu** (`AI_TEXT_LIMIT`) — zwykle menu, ciasteczka i nagłówek. Model zgaduje z URL. Gdy strony nie udało się pobrać, wysyłamy zastępnik „[SYSTEM: …]”, a KROK 1 każe wtedy akceptować po samym URL/tytule. | `config.txt`, `main.py:345`, prompt KROK 1 |
| 4 | **E-mail zwrócony przez AI nie jest sprawdzany** względem `emails_found` — model może podać adres zmyślony lub przekręcony. | `consumer_task` |
| 5 | Domyślny model to mały `gpt-oss-20b` (Groq), z promptem ~2,5 tys. tokenów pełnym list domen i wyjątków. Model rozumujący z `max_tokens: 1000` może też zwracać pustą treść (zużyte na rozumowanie) → błąd formatu → cooldown. | `AI_PROVIDERS`, `call_ai_provider` |
| 6 | Listy domen powtórzone w prompcie i w `blocked_domains.txt` — część odrzuceń robi AI zamiast kodu (koszt i błędy). | prompt KROK 0 |

Drobne: `Readability.js` jest pobierany przy starcie i nieużywany;
Playwright uruchamia nową przeglądarkę na każdy URL (ciężkie na serwerze
z bazą).

## 3. Model na serwerze — ocena

Serwer: Contabo x86_64, 7,8 GB RAM, bez GPU, na nim Supabase (Postgres,
GoTrue, Storage, Envoy, funkcje Edge), SearXNG, Chromium Lead Findera.

**Lokalny model językowy (LLM, np. Qwen 3B–8B przez llama.cpp/Ollama) — odradzam.**
- RAM: 3B w Q4 ≈ 2,5–3 GB, 7–8B ≈ 5–6 GB — przy Supabase i Chromium
  serwer zacznie korzystać ze swapu; baza jest wspólna dla gier użytkowników.
- Szybkość na CPU: przetworzenie promptu ~3 tys. tokenów to rzędu minuty
  na lead i pełne obciążenie rdzeni — w tym czasie spowolniona baza.
- Jakość: model 3–8B nie będzie lepszy od obecnego `gpt-oss-20b`; problem
  śmieci nie leży w modelu, tylko w danych wejściowych i prompcie (§2).

**Mały model klasyfikujący na serwerze (osadzenia, np. `multilingual-e5-small`,
~120 MB, ~50 ms/strona na CPU) — sensowny jako drugi krok**, gdy będą dane:
odrzucone/zaakceptowane kontakty z bazy jako zbiór uczący, klasyfikator
odsiewa oczywiste śmieci przed AI. Najpierw jednak potrzebne są poprawki
z §1–2 i liczniki lejka — bez nich nie ma na czym uczyć.

**AI do weryfikacji zostaje zewnętrzne** (Groq/DeepSeek/Anthropic, już
podpięte); po skróceniu promptu i dłuższym tekście strony warto ustawić
Anthropic Haiku jako pierwszego dostawcę — jeden lead to ~3–4 tys. tokenów,
czyli grosze za setki kontaktów.

## 4. Proponowany plan (kolejność)

1. **Liczniki lejka** w `marketing_search_queries_log` (wyniki SearXNG,
   odrzucone przez domenę/TLD, bez maila, wysłane do AI) i log
   `unresponsive_engines` — od razu widać, gdzie ginie. GRANT SELECT dla
   `agent_reader` na tę tabelę (same liczby) → kontrola przez `db-read`.
2. **Poprawki e-maili:** dopasowanie domeny maila dokładnie (część po `@`
   równa domenie z listy albo jej poddomena), usunięcie `mail.com`/`email.com`
   z listy albo dokładne porównanie; dekodowanie `data-cfemail`, `[at]`, encji.
3. **Podstrony:** gdy na stronie nie ma maila — `/kontakt`, `/o-nas` itd.
   z tej samej domeny (najpierw httpx, max 3).
4. **Prefiltry w kodzie:** `negative_keywords` → odrzuć bez AI;
   `required_keywords` → bez żadnego słowa w tytule/tekście odrzuć bez AI;
   brak treści strony → odrzuć bez AI (zamiast zastępnika).
5. **Prompt:** usunąć HARD OVERRIDE i listy domen (zostają w kodzie), krótkie
   kryteria A/B/C/D, tekst do ~3000 znaków (najpierw `<title>`, `meta
   description`, nagłówki, fragmenty z mailem), e-mail z odpowiedzi musi być
   w `emails_found`.
6. **Wyszukiwanie:** usunąć szablony facebook/instagram/maps, dodać `pageno`
   2 dla szablonów z największą liczbą wyników, sprawdzić silniki SearXNG po
   przeprowadzce (Google/Bing/DuckDuckGo/Mojeek).
7. Dopiero potem, na zebranych danych: klasyfikator osadzeń na serwerze (§3).

Wdrożenie: push `services/lead-finder/**` na `main` (workflow
`deploy-lead-finder.yml`); sprawdzenie — przebieg z panelu admina na małym
celu (np. 10) i porównanie liczników lejka przed/po.

## Decyzje

- (czeka) Czy realizować plan §4, kroki 1–6.
- (czeka) Lokalny LLM na serwerze — rekomendacja: nie; klasyfikator osadzeń
  ewentualnie po kroku 6.

#!/usr/bin/env python3
"""
Familiada.online – Lead Finder (Groq AI Edition)
=================================================
Weryfikuje firmy za pomocą Groq AI.
- Dla stron firmowych: szuka maila na głównej -> /kontakt -> sitemap.xml -> podstrony.
- Dla portali/katalogów: sprawdza tylko stronę ogłoszenia (bez /kontakt).
- AI dostaje tylko strony z mailami wykonawców (różne prompty dla firm i portali).

Uruchomienie:
  python3 lead_finder_runner.py --target 50
"""

import json, os, random, re, sys, time
from datetime import datetime
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ["SUPABASE_ANON_KEY"]
BRAVE_KEY = os.environ.get("BRAVE_API_KEY", "")
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
BRAVE_DAILY_LIMIT = 33
GROQ_MODEL = "llama-3.3-70b-versatile"

# Lista domen portali/katalogów, których maili NIE chcemy
BLOCKED_EMAIL_DOMAINS = {
    'weselezklasa.pl', 'oferteo.pl', 'fixly.pl', 'panoramafirm.pl', 'firmo.pl', 'pkt.pl',
    'firmy.info.pl', 'e-wesele.pl', 'animatorki.pl', 'klubanimatora.pl', 'wodzireje.pl',
    'facebook.com', 'google.com', 'youtube.com', 'bing.com'
}

SKIP_DOMAINS = {"google.","youtube.","facebook.com","pinterest.","twitter.com","instagram.com",
        "tiktok.com","linkedin.com","bing.com","duckduckgo.com","wikipedia.org","reddit.com"}

SEARCH_QUERIES = [
    '"DJ" "wesele" {city} kontakt', '"wodzirej" {city} kontakt', '"animator dzieci" {city} kontakt',
    '"agencja eventowa" {city} kontakt', '"event firmowy" {city} organizacja',
    '"team building" {city} firma', '"gry integracyjne" {city} kontakt',
    '"fotobudka" {city} wynajem', '"zespół muzyczny" {city} wesele kontakt',
]

MAJOR_CITIES = [
    "Warszawa","Kraków","Wrocław","Poznań","Gdańsk","Łódź","Katowice","Szczecin","Bydgoszcz",
    "Lublin","Białystok","Gdynia","Częstochowa","Radom","Sosnowiec","Toruń","Kielce","Rzeszów",
    "Gliwice","Zabrze","Olsztyn","Bielsko-Biała","Rybnik","Tychy","Opole","Gorzów","Elbląg",
    "Płock","Wałbrzych","Włocławek","Tarnów","Chorzów","Koszalin","Kalisz","Legnica","Grudziądz"
]

DIR_URLS = [
    ("oferteo_dj", "https://www.oferteo.pl/dj-na-wesele"),
    ("oferteo_wodzirej", "https://www.oferteo.pl/wodzirej"),
    ("oferteo_animacje", "https://www.oferteo.pl/animacje-dla-dzieci"),
    ("oferteo_event", "https://www.oferteo.pl/organizacja-imprez"),
    ("fixly_dj", "https://www.fixly.pl/kategoria/dj"),
    ("fixly_animacje", "https://www.fixly.pl/kategoria/animacje-dla-dzieci"),
    ("fixly_event", "https://www.fixly.pl/kategoria/organizacja-imprez"),
    ("fixly_wodzirej", "https://www.fixly.pl/kategoria/wodzirej"),
    ("panoramafirm_dj", "https://www.panoramafirm.pl/szukaj/dj+wesele.html"),
    ("panoramafirm_wodzirej", "https://www.panoramafirm.pl/szukaj/wodzirej.html"),
    ("panoramafirm_animacje", "https://www.panoramafirm.pl/szukaj/animacje+dla+dzieci.html"),
    ("panoramafirm_event", "https://www.panoramafirm.pl/szukaj/agencja+eventowa.html"),
    ("pkt_dj", "https://www.pkt.pl/dj-wesele"),
    ("pkt_wodzirej", "https://www.pkt.pl/wodzirej"),
    ("pkt_animacje", "https://www.pkt.pl/animacje-dla-dzieci"),
    ("pkt_event", "https://www.pkt.pl/agencja-eventowa"),
    ("firmyinfo_dj", "https://firmy.info.pl/dj+wesele"),
    ("firmyinfo_event", "https://firmy.info.pl/agencja+eventowa"),
    ("wodzireje", "https://wodzireje.pl"),
    ("e-wesele_dj", "https://www.e-wesele.pl/kategoria/dj-na-wesele"),
    ("e-wesele_zespoly", "https://www.e-wesele.pl/kategoria/zespoly-muzyczne"),
    ("animatorki", "https://animatorki.pl"),
    ("klubanimatora", "https://klubanimatora.pl"),
    ("konferansjer", "https://konferansjer.pl"),
    ("eventy_pl", "https://eventy.pl"),
    ("enyo_dj", "https://katalog.enyo.pl/dj+wesele"),
    ("enyo_event", "https://katalog.enyo.pl/agencja+eventowa"),
    ("firmo_dj", "https://firmo.pl/dj+wesele"),
    ("firmo_event", "https://firmo.pl/agencja+eventowa"),
]

# ─── Logi ───
logs = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)
    try: sb_upsert("last_search_log", "\n".join(logs[-20:]))
    except: pass

# ─── Supabase Helpers ───
def sb(path, method="GET", body=None, headers=None):
    h = {"Authorization": f"Bearer {SUPABASE_ANON}", "apikey": SUPABASE_ANON}
    if headers: h.update(headers)
    return httpx.request(method, f"{SUPABASE_URL}{path}", headers=h, json=body, timeout=30)

def sb_upsert(key, val):
    sb("/rest/v1/lead_finder_config", "POST", [{"key": key, "value": str(val)}],
       {"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})

def sb_insert(leads):
    if not leads: return 0
    r = sb("/rest/v1/lead_finder", "POST", leads,
           {"Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates"})
    return len(leads) if r.status_code in (200, 201) else 0

def sb_get_existing_emails():
    emails = set()
    page = 0
    while True:
        r = sb(f"/rest/v1/lead_finder?select=email&limit=1000&offset={page*1000}")
        data = r.json()
        if not data: break
        for row in data: emails.add(row["email"].lower())
        if len(data) < 1000: break
        page += 1
    return emails

def sb_create_search_run(target):
    try:
        r = sb("/rest/v1/lead_search_runs", "POST", [{
            "target": target, "found": 0, "api_calls": 0, "status": "running",
            "cities_done": 0, "cities_list": [], "started_at": datetime.now().isoformat(),
        }], {"Content-Type": "application/json", "Prefer": "return=representation"})
        if r.status_code in (200, 201) and r.json(): return r.json()[0]["id"]
    except: pass
    return None

def sb_update_run(run_id, **kw):
    if not run_id: return
    try: sb(f"/rest/v1/lead_search_runs?id=eq.{run_id}", "PATCH", [kw], {"Content-Type": "application/json"})
    except: pass

def sb_get_config(key):
    """Pobiera pojedynczą wartość konfiguracyjną z bazy."""
    r = sb(f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    if r.status_code == 200 and r.json():
        return r.json()[0].get("value")
    return None

def sb_close_run(run_id, status="completed", reason=""):
    if not run_id: return
    try:
        sb(f"/rest/v1/lead_search_runs?id=eq.{run_id}", "PATCH", [{
            "status": status, "reason": reason, "finished_at": datetime.now().isoformat()
        }], {"Content-Type": "application/json"})
    except: pass

# ─── Fetch & Extract ───
def fetch_page(url, t=8):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        s.headers["Accept-Language"] = "pl-PL"
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def parse_emails_from_html(html):
    if not html: return set(), "", ""
    soup = BeautifulSoup(html, "lxml")
    t = soup.find("title")
    title = t.get_text(strip=True) if t else ""
    for tag in soup(["script", "style"]): tag.decompose()
    text = soup.get_text(" ", strip=True)
    emails = set(re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text))
    return emails, title, text[:1500]

def get_sitemap_urls(base_url):
    sitemaps = [f"{base_url}/sitemap.xml", f"{base_url}/sitemap_index.xml"]
    urls = []
    for sm_url in sitemaps:
        st, html = fetch_page(sm_url, 6)
        if st == 200 and html:
            urls.extend(re.findall(r'<loc>(https?://[^<]+)</loc>', html))
    return urls[:10]

def check_firm_page(url):
    """Sprawdza stronę firmową: główna -> /kontakt -> /contact -> dopiero potem sitemap."""
    domain = urlparse(url).hostname
    if not domain: return None
    all_emails, title, text = set(), "", ""
    
    # 1. Strona główna
    st, html = fetch_page(url, 6)
    if 200 <= st < 400:
        em, ti, tx = parse_emails_from_html(html)
        all_emails.update(em)
        if not title: title, text = ti, tx
    
    # 2. Podstrony kontaktu (jeśli brak maila na głównej)
    if not all_emails:
        for path in ['/kontakt', '/kontakt.html', '/contact', '/contact.html']:
            st2, html2 = fetch_page(f"https://{domain}{path}", 5)
            if 200 <= st2 < 400:
                em2, ti2, tx2 = parse_emails_from_html(html2)
                all_emails.update(em2)
                if not title: title, text = ti2, tx2
                if all_emails: break # Znaleźliśmy maila -> koniec

    # 3. Sitemap i podstrony (tylko jeśli NA CIĄGŁE brak maili)
    if not all_emails:
        log(f"   🗺️ Brak maila na głównej i kontakcie. Szukam w Sitemap...")
        for sub_url in get_sitemap_urls(f"https://{domain}"):
            if sub_url != url:
                st3, html3 = fetch_page(sub_url, 5)
                if 200 <= st3 < 400:
                    em3, ti3, tx3 = parse_emails_from_html(html3)
                    all_emails.update(em3)
                    if not title: title, text = ti3, tx3
                    if all_emails: break
    if not all_emails: return None
    return {"emails": list(all_emails), "title": title, "text": text}

def check_portal_page(url):
    """Sprawdza stronę ogłoszenia na portalu (tylko jedna strona)."""
    st, html = fetch_page(url, 6)
    if st < 200 or st >= 400: return None
    emails, title, text = parse_emails_from_html(html)
    vendor_emails = [e for e in emails if e.split('@')[-1].lower() not in BLOCKED_EMAIL_DOMAINS]
    if not vendor_emails: return None
    return {"emails": vendor_emails, "title": title, "text": text}

# ─── AI Verifier (Groq) ───
def ask_groq(title, text, emails, source_type="brave"):
    if not GROQ_KEY: return None
    email_list = ", ".join(emails)
    
    if source_type in ["portal", "oferteo", "fixly"]:
        prompt = (
            f"Analizuję ogłoszenie na portalu ogłoszeniowym.\n\n"
            f"ZADANIE: Czy to firma/freelancer zajmująca się PROWADZENIEM IMPREZ?\n\n"
            f"✅ AKCEPTUJ TYLKO jeśli: To konkretny DJ, Wodzirej/Konferansjer, Animator dzieci, Zespół/Kapeła, Agencja Eventowa/Teambuilding.\n"
            f"🛑 ODRZUCAJ BEZWZGLĘDNIE: Fotobudki, Pokazy Fajerwerków, Pokazy Bańki, Dmuchańce/Zamki, Wypożyczalnie (meble, namioty), Sale weselne, Catering, Dekoracje/Kwiaty, Foto/Video, Poradniki.\n\n"
            f"📧 OCENA MAILI:\n"
            f"- ✅ POPRAWNE: prywatne@gmail.com/wp/o2, kontakt@domena-firmy.pl, imie.nazwisko@...\n"
            f"- ❌ PODEJRZANE/ODRZUĆ: noreply@, admin@, redakcja@, bok@, biuro@portal.pl (to maile portalu, nie wykonawcy).\n\n"
            f"🌐 PODEJRZANE STRONY: Parkingu domen, Przekierowania na główną portalu, Błędy 404/500.\n\n"
            f"TYTUŁ: {title}\nTEKST: {text[:800]}\nMAILE: {email_list}\n\n"
            f'Odpowiedz JSON: {{"valid": true/false, "email": "najlepszy_mail", "reason": "..."}}'
        )
    else:
        prompt = (
            f"Analizuję bezpośrednią stronę firmową.\n\n"
            f"ZADANIE: Czy to firma/freelancer zajmująca się PROWADZENIEM IMPREZ?\n\n"
            f"✅ AKCEPTUJ TYLKO jeśli: To strona DJ-a, Wodzireja, Animatora dzieci, Zespołu muzycznego, Agencji Eventowej/Teambuilding.\n"
            f"🛑 ODRZUCAJ BEZWZGLĘDNIE: Fotobudki, Pokazy Fajerwerków, Pokazy Bańki, Dmuchańce/Zamki, Wypożyczalnie, Sale weselne, Catering, Dekoratorzy/Florystki, Foto/Video, Blogi.\n\n"
            f"📧 OCENA MAILI:\n"
            f"- ✅ POPRAWNE: kontakt@domena.pl, biuro@..., info@..., jan.kowalski@gmail.com.\n"
            f"- ❌ PODEJRZANE/ODRZUĆ: noreply@, admin@, webmaster@, hosting@, noreply@home.pl (maile techniczne).\n\n"
            f"🌐 PODEJRZANE STRONY: Strona w budowie, Parking domeny, Sklep z wieloma branżami (nie профильный), Strona po angielsku/chielsku (szukamy PL).\n\n"
            f"TYTUŁ: {title}\nTEKST: {text[:800]}\nMAILE: {email_list}\n\n"
            f'Odpowiedz JSON: {{"valid": true/false, "email": "najlepszy_mail", "reason": "..."}}'
        )

    for attempt in range(3):
        try:
            r = httpx.post("https://api.groq.com/openai/v1/chat/completions", json={
                "model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0, "max_tokens": 100,
            }, headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"}, timeout=12)
            if r.status_code == 200:
                content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                start, end = content.find('{'), content.rfind('}') + 1
                if start != -1 and end != 0: return json.loads(content[start:end])
                return {"valid": False, "email": None, "reason": "bad_json"}
            elif r.status_code == 429:
                wait = 5 * (attempt + 1); log(f"⏳ Groq Limit. Czekam {wait}s..."); time.sleep(wait)
            else: return None
        except Exception as e:
            log(f"⚠️ Błąd Groq: {e}"); time.sleep(2)
    return None

def sb_get_config(key):
    r = sb(f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    if r.status_code == 200 and r.json(): return r.json()[0].get("value")
    return None

# ─── Main Search ───
def run_search(target=50):
    log(f"🎯 Cel: {target} leadów | AI: {'ON' if GROQ_KEY else 'OFF'}")
    run_id = sb_create_search_run(target)
    if run_id: log(f"📝 ID: {run_id[:8]}")
    existing = sb_get_existing_emails()
    log(f"📋 Maile w bazie: {len(existing)}")

    # 1. Sprawdź backlog (niewykorzystane strony z poprzednich razy)
    backlog_str = sb_get_config("search_backlog")
    candidate_urls = []
    
    if backlog_str:
        try:
            candidate_urls = json.loads(backlog_str)
            if candidate_urls:
                log(f"📂 Wczytano {len(candidate_urls)} URL-i z backlogu. Analiza w pierwszej kolejności...")
                sb_upsert("search_backlog", "[]") # Czyścimy od razu
        except: pass
    
    # 2. Jeśli brak backlogu, szukamy nowych źródeł
    if not candidate_urls:
        log("🔍 Brak backlogu. Szukam nowych źródeł...")
        urls = [(q.format(city=c), c) for c in random.sample(MAJOR_CITIES, 15) for q in SEARCH_QUERIES]
        random.shuffle(urls)
        session = curl_requests.Session(impersonate="chrome124")
        api_calls, found = 0, 0

        # Brave Search
        log("🔍 Faza 1: Brave Search (strony firm)...")
        total_queries = len(urls)
        for idx, (q, city) in enumerate(urls):
            if len(candidate_urls) >= target * 15 or api_calls >= BRAVE_DAILY_LIMIT: break
            log(f"🔎 [{idx+1}/{total_queries}] Szukam: {q[:60]}...")
            try:
                r = session.get("https://api.search.brave.com/res/v1/web/search",
                                params={"q": q, "count": 10, "cc": "PL"},
                                headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY}, timeout=8)
                if r.status_code == 200:
                    new_found = 0
                    for item in r.json().get("web", {}).get("results", []):
                        u = item.get("url", "")
                        if u and not any(s in u.lower() for s in SKIP_DOMAINS) and not any(p in u.lower() for p in ['oferteo.pl', 'fixly.pl']):
                            candidate_urls.append((u, city, "brave"))
                            log(f"   🔗 {u[:70]}") # Wyświetlaj pojedyncze znalezione URL-e
                api_calls += 1
            except: api_calls += 1
            time.sleep(0.3)
        log(f"📦 Faza 1 zakończona. Znaleziono {len(candidate_urls)} stron firm.")

        # Katalogi
        log("📂 Faza 2: Katalogi i portale ogłoszeniowe...")
        total_dirs = len(DIR_URLS)
        for idx, (key, dir_url) in enumerate(DIR_URLS.items()):
            log(f"🌐 [{idx+1}/{total_dirs}] Skanuję portal: {key}...")
            try:
                st, html = fetch_page(dir_url, 10)
                if st != 200 or not html: 
                    log(f"   ⚠️ Błąd pobierania lub pusta strona.")
                    continue
                soup = BeautifulSoup(html, "lxml")
                new_found = 0
                for a in soup.find_all('a', href=True):
                    href = a['href']
                    if any(x in href for x in ['/oferta/', '/firma/', '/profil/']):
                        full_url = urljoin(dir_url, href)
                        if full_url not in [u[0] for u in candidate_urls]:
                            candidate_urls.append((full_url, "Portal", "portal"))
                            log(f"   🔗 {full_url[:70]}") # Wyświetlaj pojedyncze znalezione profile
                            new_found += 1
                if new_found > 0: log(f"   ✅ Znaleziono {new_found} ogłoszeń/profili")
            except Exception as e:
                log(f"   ❌ Błąd skanowania: {e}")
        log(f"🚀 Łącznie {len(candidate_urls)} stron gotowych do weryfikacji AI.")
    
    # 3. Weryfikacja AI (dla Backlogu i Nowych stron)
    log(f"🤖 Rozpoczynam weryfikację AI dla {len(candidate_urls)} stron...")
    
    last_processed_idx = 0
    api_calls = 0
    found = 0

    for i, (url, city, source) in enumerate(candidate_urls):
        if found >= target or api_calls >= BRAVE_DAILY_LIMIT: break
        
        # Co 10 URL-i zaktualizuj puls (żeby UI wiedziało, że żyjemy) i sprawdź czy nie anulowano
        if i % 10 == 0:
            try:
                sb_upsert("search_heartbeat", datetime.now().isoformat())
                if sb_get_config("search_stop_requested") == "true":
                    log("🛑 Otrzymano sygnał STOP. Zatrzymuję...")
                    sb_upsert("search_stop_requested", "false")
                    sb_close_run(run_id, status="stopped", reason="manual_stop")
                    return # Wyjdź z funkcji
            except: pass

        # Logika zależna od typu źródła
        if source in ["portal", "oferteo", "fixly"]:
            log(f"📂 [{i+1}/{len(candidate_urls)}] Portal: {url[:50]}...")
            page = check_portal_page(url)
            source_type = "portal"
        else:
            log(f"🔍 [{i+1}/{len(candidate_urls)}] Firma: {url[:50]}...")
            page = check_firm_page(url)
            source_type = "brave"
        
        if not page: 
            log(f"   ❌ Brak maili wykonawcy."); 
            last_processed_idx = i + 1
            continue

        sb_update_run(run_id, found=found, api_calls=api_calls)
        log(f"🤖 AI weryfikuje: {page['title'][:50]}...")
        ai = ask_groq(page["title"], page["text"], page["emails"], source_type=source_type)

        if not ai: log(f"   ⚠️ Błąd AI."); last_processed_idx = i + 1; continue
        if not ai.get("valid"): log(f"   ❌ AI odrzuciło: {ai.get('reason', 'nie z branży')}"); last_processed_idx = i + 1; continue

        selected = ai.get("email")
        if not selected or selected.lower() in existing: log(f"   ⚠️ Mail '{selected}' już istnieje."); last_processed_idx = i + 1; continue
        
        existing.add(selected.lower())
        sb_insert([{"name": page["title"][:100] or urlparse(url).hostname,
                    "city": city, "email": selected, "url": url, "source": source}])
        found += 1
        log(f"✅ AI Zatwierdził: {selected} – {page['title'][:50]} ({ai.get('reason','')})")
        last_processed_idx = i + 1

    # 4. Zapisz pozostałe URL-e do backlogu
    remaining_urls = candidate_urls[last_processed_idx:]
    if remaining_urls:
        log(f"💾 Zapisano {len(remaining_urls)} URL-i do backlogu na następny raz.")
        sb_upsert("search_backlog", json.dumps(remaining_urls))
    else:
        log("✅ Przetworzono wszystkie dostępne strony.")

    sb_close_run(run_id, reason="limit" if api_calls >= BRAVE_DAILY_LIMIT else "cel")
    log(f"🏁 Done: {found} leadów zapisanych.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=int, default=50)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    run_search(target=args.target)

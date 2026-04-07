#!/usr/bin/env python3
"""
Familiada.online – Lead Finder (Groq AI Edition)
=================================================
Weryfikuje firmy za pomocą Groq AI.
Akceptuje maile firmowe, prywatne i z platform ogłoszeniowych.

Uruchomienie:
  python3 lead_finder_runner.py --target 50
"""

import json, os, random, re, sys, time
from datetime import datetime
from urllib.parse import urlparse

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

# ─── Logi ───
logs = []
log_counter = 0

def log(msg):
    global log_counter
    log_counter += 1
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)
    # Zapisuj do bazy CO KROK (żeby UI reagowało natychmiast)
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

def sb_close_run(run_id, status="completed", reason=""):
    if not run_id: return
    try:
        sb(f"/rest/v1/lead_search_runs?id=eq.{run_id}", "PATCH", [{
            "status": status, "reason": reason, "finished_at": datetime.now().isoformat()
        }], {"Content-Type": "application/json"})
    except: pass

# ─── AI Verifier (Groq) ───
def ask_groq(title, text, emails):
    """Pyta AI o weryfikację firmy i wybór najlepszego maila. Retry na 429."""
    if not GROQ_KEY: return None

    email_list = ", ".join(emails)
    prompt = (
        f"Analizuję stronę pod kątem kontaktu do branży eventowej w Polsce (DJ, Wodzirej, Animator dzieci, "
        f"Agencja eventowa, Fotobudka, Zespół muzyczny, Team building).\n\n"
        f"To może być:\n"
        f"- Oficjalna strona firmy\n"
        f"- Ogłoszenie na portalu (np. Oferteo, Fixly, Facebook)\n"
        f"- Wpis na blogu (np. recenzja lub polecenie)\n"
        f"- Wizytówka firmowa\n\n"
        f"TYTUŁ: {title}\n"
        f"TEKST: {text[:800]}\n"
        f"ZNALEZIONE MAILE: {email_list}\n\n"
        f"ZADANIE: Czy na tej stronie znajduje się użyteczny kontakt do takiej osoby/firmy?\n"
        f"Jeśli TAK, wskaż najlepszy adres email z listy.\n"
        f"Jeśli to spam, gazeta, urząd lub sklep nie związany z branżą – odrzuć.\n\n"
        f"Odpowiedz TYLKO w formacie JSON:\n"
        f'{{"valid": true/false, "email": "najlepszy_mail_lub_null", "reason": "krótki powód"}}'
    )

    for attempt in range(3):
        try:
            r = httpx.post("https://api.groq.com/openai/v1/chat/completions", json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 100,
            }, headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"}, timeout=12)

            if r.status_code == 200:
                content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                start = content.find('{')
                end = content.rfind('}') + 1
                if start != -1 and end != 0:
                    data = json.loads(content[start:end])
                    return data
                return {"valid": False, "email": None, "reason": "bad_json"}
            
            elif r.status_code == 429:
                wait = 5 * (attempt + 1)
                log(f"⏳ Groq Rate Limit. Czekam {wait}s...")
                time.sleep(wait)
                continue
            else:
                return None
        except Exception as e:
            log(f"⚠️ Błąd Groq: {e}")
            time.sleep(2)
    return None

# ─── Fetch & Extract ───
def fetch_page(url, t=8):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        s.headers["Accept-Language"] = "pl-PL"
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def get_page_data(url):
    domain = urlparse(url).hostname or ""
    if not domain: return None
    scheme = "https" if "https" in url else "http"
    pages = [url, f"{scheme}://{domain}/kontakt", f"{scheme}://{domain}/kontakt.html"]
    emails, active, title, text_sample = set(), False, "", ""
    for p in pages[:3]:
        st, html = fetch_page(p, 6)
        if 200 <= st < 400:
            active = True
            soup = BeautifulSoup(html, "lxml")
            t = soup.find("title")
            if t: title = t.get_text(strip=True)
            for tag in soup(["script", "style"]): tag.decompose()
            clean = soup.get_text(" ", strip=True)
            emails.update(re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', clean))
            if not text_sample: text_sample = clean[:1500]
        time.sleep(0.2)
    
    if not emails: return None
    return {"emails": list(emails), "active": active, "title": title, "text": text_sample}

# ─── Search Config ───
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

def run_search(target=50):
    log(f"🎯 Cel: {target} leadów | AI: {'ON (Sekwencyjnie)' if GROQ_KEY else 'OFF'}")
    run_id = sb_create_search_run(target)
    if run_id: log(f"📝 ID: {run_id[:8]}")

    existing = sb_get_existing_emails()
    log(f"📋 Maile w bazie: {len(existing)}")

    urls = []
    cities_sample = random.sample(MAJOR_CITIES, 15)
    for city in cities_sample:
        for q in SEARCH_QUERIES:
            urls.append((q.format(city=city), city))
    random.shuffle(urls)
    
    session = curl_requests.Session(impersonate="chrome124")
    api_calls = 0
    found = 0

    # 1. Brave Search (zbieramy pulę)
    log("🔍 Pobieram URL-e z Brave...")
    candidate_urls = []
    for q, city in urls:
        if len(candidate_urls) >= target * 15 or api_calls >= BRAVE_DAILY_LIMIT: break
        try:
            r = session.get("https://api.search.brave.com/res/v1/web/search",
                            params={"q": q, "count": 10, "cc": "PL"},
                            headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY},
                            timeout=8)
            if r.status_code == 200:
                for item in r.json().get("web", {}).get("results", []):
                    u = item.get("url", "")
                    if u and not any(s in u.lower() for s in SKIP_DOMAINS): candidate_urls.append((u, city, "brave"))
            api_calls += 1
        except: api_calls += 1
        time.sleep(0.3)

    log(f"📦 Znaleziono {len(candidate_urls)} kandydatów. Rozpoczynam weryfikację AI...")

    # 2. Sekwencyjna weryfikacja AI
    log(f"📦 Znaleziono {len(candidate_urls)} kandydatów. Rozpoczynam weryfikację AI...")

    for i, (url, city, source) in enumerate(candidate_urls):
        if found >= target or api_calls >= BRAVE_DAILY_LIMIT: break
        
        # Aktualizacja paska postępu (krok 1: Pobieranie)
        pct = int(((i + 1) / len(candidate_urls)) * 100)
        sb_update_run(run_id, found=found, api_calls=api_calls)
        
        log(f"🔍 [{i+1}/{len(candidate_urls)}] Pobieram dane: {url[:50]}...")
        
        page = get_page_data(url)
        if not page: 
            log(f"   ❌ Brak danych lub brak maili na stronie.")
            continue

        # Aktualizacja paska (krok 2: AI)
        sb_update_run(run_id, found=found, api_calls=api_calls)
        log(f"🤖 Pytam AI o weryfikację: {page['title'][:50]}...")

        ai = ask_groq(page["title"], page["text"], page["emails"])
        
        if not ai: 
            log(f"   ⚠️ Błąd odpowiedzi AI lub brak klucza.")
            continue
        if not ai.get("valid"): 
            log(f"   ❌ AI odrzuciło: {ai.get('reason', 'nie z branży')}")
            continue

        selected = ai.get("email")
        if not selected or selected.lower() in existing: 
            log(f"   ⚠️ Mail '{selected}' już istnieje w bazie.")
            continue
        
        existing.add(selected.lower())
        leads = [{"name": page["title"][:100] or urlparse(url).hostname, 
                  "city": city, "email": selected, "url": url, "source": source}]
        
        sb_insert(leads)
        found += 1
        log(f"✅ AI Zatwierdził: {selected} – {page['title'][:50]} ({ai.get('reason','')})")
        sb_update_run(run_id, found=found, api_calls=api_calls)
        time.sleep(2) # Pauza dla Groq

    sb_close_run(run_id, reason="limit" if api_calls >= BRAVE_DAILY_LIMIT else "cel")
    log(f"🏁 Done: {found} leadów zapisanych w bazie.")

# Na samym dole pliku lead_finder_runner.py

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Lead Finder Runner")
    parser.add_argument('--target', type=int, default=50)
    parser.add_argument('--resume', action='store_true') # Obsługa flagi wznawiania
    args = parser.parse_args()
    
    run_search(target=args.target)

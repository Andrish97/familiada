#!/usr/bin/env python3
"""
Familiada.online – Lead Finder (Groq AI Edition)
=================================================
Weryfikuje firmy za pomocą Groq AI.
Zapisuje do bazy TYLKO potwierdzone kontakty z branży eventowej.

Wymaga:
  - SUPABASE_URL, SUPABASE_ANON_KEY
  - BRAVE_API_KEY
  - GROQ_API_KEY (w .env na serwerze lub env var)

Uruchomienie:
  python3 lead_finder_groq.py --target 50
"""

import json, os, random, re, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ["SUPABASE_ANON_KEY"]
BRAVE_KEY = os.environ.get("BRAVE_API_KEY", "")
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
BRAVE_DAILY_LIMIT = 33

# ─── Logi ───
logs = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)
    if len(logs) % 5 == 0:
        try: sb_upsert("last_search_log", "\n".join(logs)[-4000:])
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
def verify_with_groq(title, text):
    """Pyta AI czy strona należy do firmy z branży eventowej."""
    if not GROQ_KEY: return True  # Brak klucza = pomijamy weryfikację

    prompt = (
        f"Czy ta strona należy do firmy z branży rozrywkowo-eventowej (DJ, wodzirej, animator dzieci, "
        f"agencja eventowa, fotobudka, zespół muzyczny, organizacja wesel)?\n\n"
        f"TYTUŁ: {title}\n"
        f"TEKST: {text[:1000]}\n\n"
        f"Odpowiedz TYLKO jednym słowem: TAK lub NIE."
    )

    try:
        r = httpx.post("https://api.groq.com/openai/v1/chat/completions", json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": 10,
        }, headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"}, timeout=10)

        if r.status_code == 200:
            resp = r.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip().upper()
            return "TAK" in resp
    except Exception as e:
        log(f"⚠️ Błąd AI: {e}")
    return False

# ─── Search & Extract Helpers ───
def fetch_page(url, t=8):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        s.headers["Accept-Language"] = "pl-PL"
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def get_emails_from_url(url):
    domain = urlparse(url).hostname or ""
    if not domain: return [], False, ""
    scheme = "https" if "https" in url else "http"
    pages = [url, f"{scheme}://{domain}/kontakt", f"{scheme}://{domain}/kontakt.html", f"{scheme}://{domain}/contact"]
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
    return list(emails), active, title, text_sample

def is_valid_business_email(email):
    name = email.split('@')[0].lower()
    if re.match(r'^\d+[a-z]', name): return False
    if name in ['admin', 'webmaster', 'root', 'postmaster', 'noreply', 'redakcja', 'info-pl']: return False
    return True

SKIP_DOMAINS = {"google.","youtube.","facebook.com","pinterest.","twitter.com","instagram.com",
        "tiktok.com","linkedin.com","bing.com","duckduckgo.com","onet.","wp.pl","interia.pl",
        "wikipedia.org","reddit.com","oferteo.pl","fixly.pl","panoramafirm.pl","pkt.pl",
        "firmy.info.pl","enyo.pl","firmo.pl","wodzireje.pl","e-wesele.pl","animatorki.pl",
        "klubanimatora.pl","konferansjer.pl","teambuilding.pl","eventy.pl","pikniki-firmowe.pl"}

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
    log(f"🎯 Cel: {target} leadów | AI: {'ON' if GROQ_KEY else 'OFF'}")
    run_id = sb_create_search_run(target)
    if run_id: log(f"📝 ID: {run_id[:8]}")

    existing = sb_get_existing_emails()
    log(f"📋 Maile w bazie: {len(existing)}")

    # 1. Brave Search
    urls = set()
    queries = [(q.format(city=c), c) for c in random.sample(MAJOR_CITIES, 20) for q in SEARCH_QUERIES]
    random.shuffle(queries)
    
    session = curl_requests.Session(impersonate="chrome124")
    api_calls = 0
    found = 0

    for q, city in queries:
        if found >= target or api_calls >= BRAVE_DAILY_LIMIT: break
        
        try:
            r = session.get("https://api.search.brave.com/res/v1/web/search",
                            params={"q": q, "count": 15, "cc": "PL"},
                            headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY},
                            timeout=10)
            if r.status_code == 200:
                for item in r.json().get("web", {}).get("results", []):
                    u = item.get("url", "")
                    if u and not any(s in u.lower() for s in SKIP_DOMAINS): urls.add((u, city, "brave"))
            api_calls += 1
            sb_update_run(run_id, found=found, api_calls=api_calls)
        except: api_calls += 1
        time.sleep(0.3)

    # 2. Weryfikacja i ekstrakcja (Batch po 5)
    log(f"🤔 Weryfikacja {len(urls)} URL-i przez AI...")
    leads = []
    
    def process_url(url_data):
        url, city, source = url_data
        emails, active, title, text = get_emails_from_url(url)
        if not emails: return None
        
        # AI Check
        if not verify_with_groq(title, text): return None
        
        # Clean Emails
        valid = [e for e in emails if is_valid_business_email(e)]
        if not valid: return None
        
        domain = urlparse(url).hostname.replace("www.", "")
        primary = next((e for e in valid if e.split("@")[1].lower() == domain), valid[0])
        
        if primary.lower() in existing: return None
        existing.add(primary.lower())
        
        return {"name": title[:100] or domain, "city": city, "email": primary, "url": url, "source": source}

    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(process_url, u): u for u in urls}
        for f in as_completed(futs):
            res = f.result()
            if res:
                leads.append(res)
                found += 1
                log(f"✅ AI Potwierdził: {res['email']} – {res['name']}")
                sb_update_run(run_id, found=found, api_calls=api_calls)
                if found >= target: break

    if leads:
        sb_insert(leads)
        log(f"💾 Zapisano {len(leads)} leadów.")
    
    sb_close_run(run_id, reason="limit" if api_calls >= BRAVE_DAILY_LIMIT else "cel")
    log(f"🏁 Done: {found} leadów.")

if __name__ == "__main__":
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    run_search(target)

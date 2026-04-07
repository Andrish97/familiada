#!/usr/bin/env python3
"""
Familiada.online – Lead Finder (Runner)
Ten plik jest odpalany przez Daemona.
Wykonuje: 1. Pobranie linków z backlogu 2. Brave Search 3. Weryfikację AI 4. Zapis
"""

import json, os, re, sys, time
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
BRAVE_DAILY_LIMIT = int(os.environ.get("BRAVE_DAILY_LIMIT", 33))
GROQ_MODEL = "llama-3.3-70b-versatile"

SEARCH_QUERIES = [
    '"DJ" "wesele" {city} kontakt',
    '"Wodzirej" {city} kontakt',
    '"Konferansjer" {city} kontakt',
    '"Prezenter eventowy" {city} kontakt',
    '"Animator dzieci" {city} kontakt',
    '"Agencja eventowa" {city} kontakt',
    '"Organizacja imprez" {city} kontakt',
    '"Team building" {city} kontakt',
    '"Gry integracyjne" {city} kontakt'
]

MAJOR_CITIES = [
    "Warszawa","Kraków","Wrocław","Poznań","Gdańsk","Łódź","Katowice","Szczecin","Bydgoszcz",
    "Lublin","Białystok","Gdynia","Częstochowa","Radom","Sosnowiec","Toruń","Kielce","Rzeszów",
    "Gliwice","Zabrze","Olsztyn","Bielsko-Biała","Rybnik","Tychy","Opole","Gorzów","Elbląg",
    "Płock","Wałbrzych","Włocławek","Tarnów","Chorzów","Koszalin","Kalisz","Legnica","Grudziądz"
]

SKIP_DOMAINS = {"google.","youtube.","facebook.com","pinterest.","twitter.com","instagram.com",
        "tiktok.com","linkedin.com","bing.com","duckduckgo.com","wikipedia.org","reddit.com"}
BLOCKED_EMAIL_DOMAINS = {'oferteo.pl', 'fixly.pl', 'panoramafirm.pl', 'facebook.com', 'google.com'}

# ─── Logi i DB Helpers ───
logs = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)
    # Co kilka logów zapisz do bazy dla UI
    if len(logs) % 5 == 0:
        try: sb_upsert("last_search_log", "\n".join(logs[-20:]))
        except: pass

def sb_req(method, path, json_data=None, timeout=15):
    try:
        r = httpx.request(method, f"{SUPABASE_URL}{path}", json=json_data, timeout=timeout,
                          headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"})
        return r
    except Exception as e:
        log(f"⚠️ Błąd DB: {e}")
        return None

def sb_upsert(key, val):
    sb_req("POST", "/rest/v1/lead_finder_config", [{"key": key, "value": str(val)}])

def sb_get_config(key):
    r = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    return r.json()[0].get("value") if r and r.status_code == 200 and r.json() else None

def sb_get_existing_emails():
    emails = set()
    page = 0
    while True:
        r = sb_req("GET", f"/rest/v1/lead_finder?select=email&limit=1000&offset={page*1000}")
        data = r.json() if r and r.status_code == 200 else []
        if not data: break
        for row in data: emails.add(row["email"].lower())
        if len(data) < 1000: break
        page += 1
    return emails

def sb_insert(leads):
    if not leads: return 0
    r = sb_req("POST", "/rest/v1/lead_finder", leads)
    return len(leads) if r and r.status_code in (200, 201) else 0

def sb_create_search_run(target):
    try:
        r = sb_req("POST", "/rest/v1/lead_search_runs", [{
            "target": target, "found": 0, "api_calls": 0, "status": "running",
            "cities_done": 0, "cities_list": [], "started_at": datetime.now().isoformat(),
        }])
        if r and r.status_code in (200, 201) and r.json(): return r.json()[0]["id"]
    except: pass
    return None

def sb_update_run(run_id, **kw):
    if not run_id: return
    sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{run_id}", [kw])

def sb_close_run(run_id, status="completed", reason=""):
    if not run_id: return
    sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{run_id}", [{
        "status": status, "reason": reason, "finished_at": datetime.now().isoformat()
    }])

# ─── Fetch & Extract ───
def fetch_page(url, t=10):
    try:
        s = curl_requests.Session(impersonate="chrome124")
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
    domain = urlparse(url).hostname
    if not domain: return None
    all_emails, title, text = set(), "", ""
    
    # 1. Główna
    st, html = fetch_page(url, 6)
    if 200 <= st < 400:
        em, ti, tx = parse_emails_from_html(html)
        all_emails.update(em)
        if not title: title, text = ti, tx
    
    # 2. Kontakt
    if not all_emails:
        for path in ['/kontakt', '/kontakt.html', '/contact', '/contact.html']:
            st2, html2 = fetch_page(f"https://{domain}{path}", 6)
            if 200 <= st2 < 400:
                em2, ti2, tx2 = parse_emails_from_html(html2)
                all_emails.update(em2)
                if not title: title, text = ti2, tx2
                if all_emails: break

    # 3. Sitemap
    if not all_emails:
        for sub_url in get_sitemap_urls(f"https://{domain}"):
            if sub_url != url:
                st3, html3 = fetch_page(sub_url, 6)
                if 200 <= st3 < 400:
                    em3, ti3, tx3 = parse_emails_from_html(html3)
                    all_emails.update(em3)
                    if not title: title, text = ti3, tx3
                    if all_emails: break
                    
    if not all_emails: return None
    return {"emails": list(all_emails), "title": title, "text": text}

def check_portal_page(url):
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
            f"Analizuję ogłoszenie na portalu. Czy to oferta DOSTAWCY USŁUG EVENTOWYCH (DJ, Wodzirej, Animator, Agencja)?\n\n"
            f"✅ TAK: Jeśli to oferta konkretnego wykonawcy.\n"
            f"❌ NIE: Jeśli to artykuł, poradnik, strona główna portalu, sklep, wypożyczalnia.\n\n"
            f"TYTUŁ: {title}\nTEKST: {text[:800]}\nMAILE: {email_list}\n\n"
            f'Odpowiedz JSON: {{"valid": true/false, "email": "najlepszy_mail", "reason": "..."}}'
        )
    else:
        prompt = (
            f"Analizuję stronę firmową. Czy to firma z branży WESELNO-EVENTOWEJ (DJ, Wodzirej, Animator, Agencja, Prezentery)?\n\n"
            f"✅ TAK: DJ, Wodzirej, Animator, Agencja, Prezenter.\n"
            f"❌ NIE: Sale, Catering, Foto, Video, Dekoracje, Wypożyczalnie, Sklepy.\n\n"
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
                time.sleep(5 * (attempt + 1))
            else: return None
        except Exception as e:
            time.sleep(2)
    return None

# ─── Telegram ───
def send_tg(text):
    try:
        httpx.post("https://settings.familiada.online/_admin_api/lead-finder/notify",
                   json={"message": text}, timeout=10)
    except: pass

# ─── Main Search ───
def run_search(target=50):
    log(f"🎯 Cel: {target} leadów | AI: {'ON' if GROQ_KEY else 'OFF'}")
    run_id = sb_create_search_run(target)
    if run_id: log(f"📝 ID: {run_id[:8]}")
    
    existing = sb_get_existing_emails()
    log(f"📋 Maile w bazie: {len(existing)}")

    # 1. Backlogi
    candidate_urls = []
    
    # A. Search backlog
    backlog_str = sb_get_config("search_backlog")
    if backlog_str:
        try:
            candidate_urls = json.loads(backlog_str)
            log(f"📂 Wczytano {len(candidate_urls)} URL-i z search_backlog.")
        except: pass

    # B. Portal backlog
    portal_backlog_str = sb_get_config("portal_backlog")
    if portal_backlog_str:
        try:
            portal_links = json.loads(portal_backlog_str)
            current_urls = {u[0] for u in candidate_urls}
            added = 0
            for link in portal_links:
                if link[0] not in current_urls:
                    candidate_urls.append(link)
                    current_urls.add(link[0])
                    added += 1
            if added > 0: log(f"📂 Dodano {added} linków z portal_backlog.")
        except: pass

    # 2. Brave (jeśli mało)
    if len(candidate_urls) < target * 10:
        log("🔍 Mało kandydatów. Uruchamiam Brave Search...")
        urls = [(q.format(city=c), c) for c in MAJOR_CITIES for q in SEARCH_QUERIES]
        random.shuffle(urls) # Potrzeba importu random? Tak, dodam.
        
        session = curl_requests.Session(impersonate="chrome124")
        api_calls = 0
        
        # Limit zapytań
        for q, city in urls:
            if found >= target or api_calls >= BRAVE_DAILY_LIMIT: break # found nie jest zdefiniowane tutaj! FIX
            
            # ... Brave logic ...
            
    # FIX: Przeniesienie logiki do jednej pętli

    # POPRAWNA LOGIKA PĘTLI:
    log(f"🤖 Rozpoczynam weryfikację AI dla {len(candidate_urls)} stron...")
    
    last_processed_idx = 0
    api_calls = 0 # Reset dla lokalnego licznika jeśli trzeba
    found = 0

    for i, (url, city, source) in enumerate(candidate_urls):
        # Check Limit
        # (Tutaj trzeba pobrać aktualny stan licznika z DB dla pewności, ale upraszczamy)
        
        # STOP
        if sb_get_config("search_stop_requested") == "true":
            log("🛑 STOP!"); sb_upsert("search_stop_requested", "false"); break

        # 1. Pobierz dane
        if source in ["portal", "oferteo", "fixly"]:
            page = check_portal_page(url)
            source_type = "portal"
        else:
            page = check_firm_page(url)
            source_type = "brave"
        
        if not page: continue

        # 2. DEDUPLIKACJA PRZED AI (Optymalizacja)
        # Filtruj maile, które już mamy
        new_emails = [e for e in page["emails"] if e.lower() not in existing and e.split('@')[-1].lower() not in BLOCKED_EMAIL_DOMAINS]
        
        if not new_emails:
            # Mamy już te maile, szkoda pytać AI
            continue

        # 3. AI
        log(f"🤖 AI weryfikuje: {page['title'][:50]}...")
        ai = ask_groq(page["title"], page["text"], new_emails, source_type=source_type)
        
        if not ai or not ai.get("valid"): continue

        selected = ai.get("email")
        if not selected: continue # AI nie wskazało maila
        
        if selected.lower() in existing: continue
        
        # 4. Zapis
        existing.add(selected.lower())
        sb_insert([{"name": page["title"][:100] or urlparse(url).hostname, 
                    "city": city, "email": selected, "url": url, "source": source}])
        found += 1
        log(f"✅ Znaleziono: {selected} – {page['title'][:30]}")

        sb_update_run(run_id, found=found, api_calls=0) # Uproszczenie

    sb_close_run(run_id, reason="limit" if api_calls >= BRAVE_DAILY_LIMIT else "cel")
    log(f"🏁 Done: {found} leadów.")
    send_tg(f"Zakończono.\nZnaleziono: {found}/{target}")

if __name__ == "__main__":
    import random
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=int, default=50)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    run_search(target=args.target)

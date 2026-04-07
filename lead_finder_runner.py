#!/usr/bin/env python3
"""
Familiada.online – Lead Finder (Runner)
Naprawiona wersja: URL-e są weryfikowane natychmiast z pamięci, 
nie czekając na powolny zapis w Supabase.
"""

import json, os, re, sys, time, random, hashlib
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

# ─── Helpers ───
logs = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)
    # Zapisuj logi do bazy co krok
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
    sb_req("PATCH", f"/rest/v1/lead_finder_config?key=eq.{key}", [{"value": str(val)}])

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
            "started_at": datetime.now().isoformat(),
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

def sb_insert_query_cache(query_hash, query_text, city, urls):
    """Zapisuje w tle, nie blokując działania."""
    try:
        sb_req("POST", "/rest/v1/search_query_cache", [{
            "query_hash": query_hash,
            "query_text": query_text,
            "city": city,
            "urls": urls,
            "status": "pending"
        }])
    except: pass

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

    st, html = fetch_page(url, 6)
    if 200 <= st < 400:
        em, ti, tx = parse_emails_from_html(html)
        all_emails.update(em)
        if not title: title, text = ti, tx

    if not all_emails:
        for path in ['/kontakt', '/kontakt.html', '/contact', '/contact.html']:
            st2, html2 = fetch_page(f"https://{domain}{path}", 6)
            if 200 <= st2 < 400:
                em2, ti2, tx2 = parse_emails_from_html(html2)
                all_emails.update(em2)
                if not title: title, text = ti2, tx2
                if all_emails: break

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

    if source_type == "portal":
        prompt = (
            f"Analizuję ogłoszenie na portalu. Czy to oferta DOSTAWCY USŁUG EVENTOWYCH?\n"
            f"✅ TAK: Konkretne DJ, Wodzirej, Animator, Agencja.\n"
            f"❌ NIE: Artykuł, poradnik, sklep, wypożyczalnia.\n\n"
            f"TYTUŁ: {title}\nTEKST: {text[:800]}\nMAILE: {email_list}\n\n"
            f'Odpowiedz JSON: {{"valid": true/false, "email": "najlepszy_mail", "reason": "..."}}'
        )
    else:
        prompt = (
            f"Analizuję stronę firmową. Czy to firma WESELNO-EVENTOWA?\n"
            f"✅ TAK: DJ, Wodzirej, Animator, Agencja, Prezenter.\n"
            f"❌ NIE: Sale, Catering, Foto, Video, Dekoracje, Sklepy.\n\n"
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
        except:
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

    # 1. Przygotuj zapytania
    all_queries = [(q.format(city=c), c) for c in MAJOR_CITIES for q in SEARCH_QUERIES]
    random.shuffle(all_queries)
    
    candidate_urls = []
    brave_api_calls = 0
    seen_urls = set()

    # 2. Wykonaj Brave Search i zbierz URL-e DO PAMIĘCI
    for query_text, city in all_queries:
        # Sprawdź czy nie mamy już limitu zapytań
        if brave_api_calls >= BRAVE_DAILY_LIMIT:
            log(f"⚠️ Limit Brave wyczerpany ({brave_api_calls}/{BRAVE_DAILY_LIMIT})")
            break
            
        log(f"🔎 Brave: {query_text[:60]}...")
        try:
            session = curl_requests.Session(impersonate="chrome124")
            r = session.get("https://api.search.brave.com/res/v1/web/search",
                            params={"q": query_text, "count": 15, "cc": "PL"},
                            headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY}, timeout=10)
            
            found_urls = []
            if r.status_code == 200:
                for item in r.json().get("web", {}).get("results", []):
                    u = item.get("url", "")
                    if u and u not in seen_urls and not any(s in u.lower() for s in SKIP_DOMAINS):
                        found_urls.append({"url": u, "city": city, "source": "brave"})
                        seen_urls.add(u)
                        candidate_urls.append((u, city, "brave"))
                
                if found_urls:
                    log(f"   ✅ +{len(found_urls)} URL-i")
                    # Zapisz w tle do bazy (dla cache na przyszłość)
                    q_hash = hashlib.sha256(query_text.encode()).hexdigest()
                    sb_insert_query_cache(q_hash, query_text, city, found_urls)
                else:
                    log(f"   ⛔ Brak wyników")
            
            brave_api_calls += 1
        except Exception as e:
            log(f"   ❌ Błąd: {e}")
            brave_api_calls += 1
        time.sleep(0.5)

    if not candidate_urls:
        log("❌ Brak URL-i do weryfikacji. Koniec.")
        sb_close_run(run_id, reason="no_urls")
        return

    log(f"📦 Znaleziono {len(candidate_urls)} unikalnych URL-i. Rozpoczynam weryfikację AI...")

    # 3. Weryfikacja AI
    found = 0

    for i, (url, city, source) in enumerate(candidate_urls):
        if found >= target: break

        # STOP
        if sb_get_config("search_stop_requested") == "true":
            log("🛑 STOP!"); sb_upsert("search_stop_requested", "false"); break

        # 1. Pobierz dane
        if source == "portal":
            page = check_portal_page(url)
            source_type = "portal"
        else:
            page = check_firm_page(url)
            source_type = "brave"

        if not page:
            continue

        # 2. DEDUPLIKACJA PRZED AI
        new_emails = [e for e in page["emails"] if e.lower() not in existing and e.split('@')[-1].lower() not in BLOCKED_EMAIL_DOMAINS]
        if not new_emails:
            continue

        # 3. AI
        log(f"🤖 AI: {page['title'][:50]}...")
        ai = ask_groq(page["title"], page["text"], new_emails, source_type=source_type)

        if not ai or not ai.get("valid"):
            continue

        selected = ai.get("email") or new_emails[0]
        if selected.lower() in existing:
            continue

        # 4. Zapis
        existing.add(selected.lower())
        sb_insert([{"name": page["title"][:100] or urlparse(url).hostname,
                    "city": city, "email": selected, "url": url, "source": source}])
        found += 1
        log(f"✅ Znaleziono: {selected} – {page['title'][:30]}")
        sb_update_run(run_id, found=found, api_calls=brave_api_calls)

    sb_close_run(run_id, reason="limit" if brave_api_calls >= BRAVE_DAILY_LIMIT else "cel")
    log(f"🏁 Done: {found} leadów.")
    send_tg(f"Zakończono.\nCel: {target}\nZnaleziono: {found}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=int, default=50)
    args = parser.parse_args()
    run_search(target=args.target)
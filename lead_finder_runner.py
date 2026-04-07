#!/usr/bin/env python3
"""
Lead Finder Runner
Tryby:
1. --collect [--boost]: Brave -> Strony -> Maile -> Porównaj lokalnie -> Zapisz do search_urls
2. --verify: search_urls -> AI -> Zapisz do lead_finder
"""
import os, sys, time, json, hashlib, re, random
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
GROQ_MODEL = "llama-3.3-70b-versatile"

BRAVE_DAILY_LIMIT = 33
BRAVE_MONTHLY_LIMIT = 1000

SEARCH_QUERIES = [
    '"DJ" "wesele" {city} kontakt', '"Wodzirej" {city} kontakt', '"Konferansjer" {city} kontakt',
    '"Prezenter eventowy" {city} kontakt', '"Animator dzieci" {city} kontakt', '"Agencja eventowa" {city} kontakt',
    '"Organizacja imprez" {city} kontakt', '"Team building" {city} kontakt', '"Gry integracyjne" {city} kontakt'
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
JUNK_PREFIXES = ['admin', 'webmaster', 'redakcja', 'noreply', 'support', 'kontakt.firmy']

# ─── Helpers ───
logs = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)
    try: sb_req("PATCH", f"/rest/v1/lead_finder_config?key=eq.last_search_log", [{"value": "\n".join(logs[-20:])}])
    except: pass

def sb_req(method, path, json_data=None, timeout=15):
    try:
        return httpx.request(method, f"{SUPABASE_URL}{path}", json=json_data, timeout=timeout,
                             headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"})
    except Exception as e:
        return None

def sb_get(key):
    r = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    return r.json()[0].get("value") if r and r.status_code == 200 and r.json() else None

def sb_set(key, val):
    sb_req("POST", "/rest/v1/lead_finder_config", [{"key": key, "value": str(val)}])

def sb_insert_urls(urls):
    if not urls: return
    # Wstawiamy partiami po 100
    for i in range(0, len(urls), 100):
        try: sb_req("POST", "/rest/v1/search_urls", urls[i:i+100])
        except: pass

def sb_update_url_status(uid, status):
    try: sb_req("PATCH", f"/rest/v1/search_urls?id=eq.{uid}", [{"status": status}])
    except: pass

def sb_insert_leads(leads):
    if not leads: return
    try: sb_req("POST", "/rest/v1/lead_finder", leads)
    except: pass

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

def sb_create_run(target):
    try:
        r = sb_req("POST", "/rest/v1/lead_search_runs", [{"target": target, "found": 0, "status": "running", "started_at": datetime.now().isoformat()}])
        if r and r.status_code in (200, 201) and r.json(): return r.json()[0]["id"]
    except: pass
    return None

def sb_update_run(run_id, **kw):
    if run_id: sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{run_id}", [kw])

def sb_close_run(run_id, status, reason=""):
    if run_id: sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{run_id}", [{"status": status, "reason": reason, "finished_at": datetime.now().isoformat()}])

def send_tg(msg):
    try: httpx.post("https://settings.familiada.online/_admin_api/lead-finder/notify", json={"message": msg}, timeout=10)
    except: pass

# ─── Funkcje Sieciowe ───
def fetch_page(url, t=10):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def extract_emails(html):
    if not html: return set(), "", ""
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else ""
    for tag in soup(["script", "style"]): tag.decompose()
    text = soup.get_text(" ", strip=True)
    emails = set(re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text))
    return emails, title, text[:800]

def is_valid_new_email(email, existing_emails):
    e = email.lower()
    if e in existing_emails: return False
    if e.split('@')[-1] in BLOCKED_EMAIL_DOMAINS: return False
    if e.split('@')[0] in JUNK_PREFIXES: return False
    if re.match(r'^\d', e.split('@')[0]): return False # Maile zaczynające się od cyfry
    return True

# ─── TRYB 1: COLLECT (Zbieranie) ───
def run_collect(is_boost=False):
    log("🚀 COLLECT: Zbieram nowe URL-e i maile (bez AI)...")
    
    # 1. Pobierz istniejące maile
    existing_emails = sb_get_existing_emails()
    log(f"📋 Znane maile: {len(existing_emails)}")

    # 2. Przygotuj zapytania
    # Generuj zapytania dynamicznie i dodaj do bazy jeśli ich nie ma
    all_q = [(q.format(city=c), c) for c in MAJOR_CITIES for q in SEARCH_QUERIES]
    random.shuffle(all_q)
    
    # Dodaj do search_queries jeśli nie istnieją
    for q_text, city in all_q:
        q_hash = hashlib.md5(q_text.encode()).hexdigest()
        try: sb_req("POST", "/rest/v1/search_queries", [{"query_text": q_text, "query_hash": q_hash}])
        except: pass

    # Pobierz dostępne zapytania (nie wyczerpane)
    if is_boost:
        # Boost bierze 10 losowych, nawet jeśli były użyte (resetujemy pule)
        r = sb_req("GET", "/rest/v1/search_queries?select=*&order=created_at.asc") 
        if r and r.json():
            random.shuffle(r.json())
            queries = r.json()[:15] # Bierzemy 15 na zapas
            # Resetuj je
            for q in queries:
                sb_req("PATCH", f"/rest/v1/search_queries?id=eq.{q['id']}", [{"exhausted": False}])
    else:
        r = sb_req("GET", "/rest/v1/search_queries?select=*&exhausted=eq.false&order=created_at.asc&limit=40")
        queries = r.json() if r and r.json() else []

    if not queries:
        log("🔄 Brak zapytań. Resetuję pulę.")
        sb_req("PATCH", f"/rest/v1/search_queries?exhausted=eq.true", [{"exhausted": False}])
        r = sb_req("GET", "/rest/v1/search_queries?select=*&order=created_at.asc&limit=40")
        if r and r.json(): queries = r.json()

    new_urls = []
    count = 0
    limit = 10 if is_boost else BRAVE_DAILY_LIMIT
    
    # Sprawdź dzienny limit
    today = datetime.now().strftime("%Y-%m-%d")
    current_date = sb_get("brave_daily_date")
    current_count = int(sb_get("brave_daily_count") or 0)
    if current_date != today: current_count = 0

    for q in queries:
        if count >= limit: break
        if current_count >= BRAVE_DAILY_LIMIT:
            log("⚠️ Limit dzienny Brave wyczerpany.")
            break

        log(f"🔎 Brave: {q['query_text'][:50]}...")
        try:
            resp = curl_requests.Session(impersonate="chrome124").get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": q['query_text'], "count": 10},
                headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY}, timeout=10
            )
            current_count += 1
            m_used_this_run += 1
            
            if resp.status_code == 200:
                # 1. Zbierz wszystkie URL-e z odpowiedzi Brave
                candidate_urls = []
                for item in resp.json().get("web", {}).get("results", []):
                    u = item.get("url")
                    if u and not any(s in u.lower() for s in SKIP_DOMAINS):
                        candidate_urls.append(u)
                
                if not candidate_urls:
                    continue

                # 2. Sprawdź które URL-e JUŻ MAMY w bazie (żeby nie skanować dwa razy tego samego)
                # Budujemy zapytanie SQL: url IN ('http://a.pl', 'http://b.pl')
                # Uwaga: Supabase ma limit length URL, więc robimy to partiami lub prościej:
                # Sprawdzamy pojedynczo lub partiami. Dla szybkości sprawdzimy w pętli (jest OK przy 10 wynikach)
                
                urls_to_scrape = []
                for u in candidate_urls:
                    # Sprawdź czy URL już istnieje w search_urls
                    r_check = sb_req("GET", f"/rest/v1/search_urls?select=id&url=eq.{u}&limit=1")
                    if not (r_check and r_check.json()):
                        urls_to_scrape.append(u)

                if not urls_to_scrape:
                    log(f"   ⏭️ Wszystkie {len(candidate_urls)} linków już sprawdzane.")
                else:
                    log(f"   🔍 Do skanowania: {len(urls_to_scrape)} nowych linków.")
                    
                    # 3. Skanuj tylko te nowe
                    for url in urls_to_scrape:
                        st, html = fetch_page(url, t=8)
                        if st == 200:
                            emails, title, text = extract_emails(html)
                            # Filtruj maile względem ZATWIERDZONYCH (lead_finder)
                            new_emails = [e for e in emails if is_valid_new_email(e, existing_emails)]
                            
                            if new_emails:
                                # Są nowe maile -> pending (czeka na AI)
                                new_urls.append({"url": url, "source": "brave", "found_emails": new_emails, "title": title[:100], "status": "pending"})
                                log(f"   ✅ +{len(new_emails)} nowe maile: {title[:40]}")
                            else:
                                # Brak nowych maili -> processed (odwiedzone, ale bez wartości)
                                new_urls.append({"url": url, "source": "brave", "found_emails": [], "title": title[:100], "status": "processed"})
                
                # Oznacz zapytanie jako wyczerpane
                sb_req("PATCH", f"/rest/v1/search_queries?id=eq.{q['id']}", [{"exhausted": True}])
            count += 1
        except Exception as e:
            log(f"   ❌ Błąd: {e}")
            count += 1
        time.sleep(1)

    if new_urls:
        sb_insert_urls(new_urls)
        log(f"💾 Zapisano {len(new_urls)} nowych URL-i do puli.")
    
    # Aktualizuj licznik
    sb_set("brave_daily_count", str(current_count))
    sb_set("brave_daily_date", today)
    
    # Sprawdź miesięczny
    month = datetime.now().strftime("%Y-%m")
    m_count = int(sb_get("brave_monthly_count") or 0)
    if sb_get("brave_monthly_date") != month: m_count = 0
    
    if m_count >= BRAVE_MONTHLY_LIMIT:
        log(f"⛔ Limit miesięczny wyczerpany ({m_count}/{BRAVE_MONTHLY_LIMIT}).")
        sb_set("brave_monthly_count", str(m_count))
        sb_set("brave_monthly_date", month)
        sb_set("collect_request", "idle")
        send_tg(f"⛔ Limit miesięczny Brave wyczerpany ({m_count}/{BRAVE_MONTHLY_LIMIT}).")
        return

    # Pętla zliczająca miesięczne w trakcie działania
    m_used_this_run = 0

    for q in queries:
        if count >= limit: break
        if current_count >= BRAVE_DAILY_LIMIT: break
        if (m_count + m_used_this_run) >= BRAVE_MONTHLY_LIMIT:
            log(f"⛔ Osiągnięto limit miesięczny.")
            break

    sb_set("collect_request", "idle")
    send_tg(f"🚀 Collect Done\nNowe URL: {len(new_urls)}\nLimit dzienny: {current_count}/{BRAVE_DAILY_LIMIT}\nMiesięczny: {m_count}/{BRAVE_MONTHLY_LIMIT}")

# ─── TRYB 2: VERIFY (AI) ───
def run_verify(target):
    log(f"🤖 VERIFY: Weryfikuję maile AI (Cel: {target})...")
    run_id = sb_create_run(target)

    # Pobierz URL-e z puli (tylko pending)
    r = sb_req("GET", "/rest/v1/search_urls?select=*&status=eq.pending&limit=200")
    urls_to_check = r.json() if r and r.json() else []

    if not urls_to_check:
        log("⚠️ Brak URL-i w kolejce. Uruchom Collect.")
        sb_close_run(run_id, "completed", "brak_urli")
        send_tg("🤐 Verify: Brak linków w kolejce. Zrób Collect.")
        return

    found = 0

    for item in urls_to_check:
        if found >= target: break
        if sb_get("search_stop_requested") == "true":
            log("🛑 STOP! Zapisuję postęp."); sb_set("search_stop_requested", "false"); break

        log(f"🔍 AI: {item['url'][:60]}...")
        
        emails = item.get("found_emails", [])
        title = item.get("title", "")
        
        # Pobierz tekst strony dla AI (krótki)
        st, html = fetch_page(item['url'], t=8)
        text = ""
        if st == 200:
            if not text: # Jeśli nie mamy tekstu z bazy
                soup = BeautifulSoup(html, "lxml")
                for tag in soup(["script", "style"]): tag.decompose()
                text = soup.get_text(" ", strip=True)[:800]
                if not title and soup.title: title = soup.title.string

        prompt = f"Czy to firma WESELNO-EVENTOWA (DJ, Wodzirej, Animator, Agencja)?\nTYTUŁ: {title}\nTEKST: {text}\nMAILE: {emails}\nOdpowiedz JSON: {{valid: true/false, email: 'najlepszy_mail', reason: 'krotko'}}"
        
        ai_res = None
        try:
            r_ai = httpx.post("https://api.groq.com/openai/v1/chat/completions", json={
                "model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.0, "max_tokens": 100
            }, headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"}, timeout=12)
            if r_ai.status_code == 200:
                content = r_ai.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                start, end = content.find('{'), content.rfind('}') + 1
                if start != -1: ai_res = json.loads(content[start:end])
        except: pass

        if ai_res and ai_res.get("valid"):
            best_email = ai_res.get("email") or (emails[0] if emails else None)
            if best_email:
                sb_insert_leads([{"name": title or item['url'], "city": "Polska", "email": best_email, "url": item['url'], "source": "brave"}])
                found += 1
                sb_update_url_status(item['id'], "processed")
                log(f"✅ Znaleziono: {best_email}")
        else:
            sb_update_url_status(item['id'], "rejected")

        sb_update_run(run_id, found=found)
        time.sleep(1) # Pauza dla Groq

    reason = "cel" if found >= target else "pusta_pula"
    sb_close_run(run_id, "completed", reason)
    send_tg(f"🤖 Verify Done\nZnaleziono: {found}/{target}\nStatus: {reason}")

# ─── Main ───
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--collect', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--boost', action='store_true')
    parser.add_argument('--target', type=int, default=50)
    args = parser.parse_args()

    if args.collect:
        run_collect(is_boost=args.boost)
    elif args.verify:
        run_verify(target=args.target)
    else:
        print("Użycie: --collect [--boost] LUB --verify --target X")
#!/usr/bin/env python3
"""
Familiada Lead Finder - Wersja "Dwie Tabele"
1. search_queries → cache hashy zapytań (nie powtarzamy Brave)
2. search_urls → pula linków do weryfikacji
3. Duplikaty maili sprawdzane w lead_finder przed AI
4. Kończymy po osiągnięciu targetu
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
    try: sb_req("PATCH", f"/rest/v1/lead_finder_config?key=eq.last_search_log", [{"value": "\n".join(logs[-20:])}])
    except: pass

def sb_req(method, path, json_data=None, timeout=15):
    try:
        r = httpx.request(method, f"{SUPABASE_URL}{path}", json=json_data, timeout=timeout,
                          headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"})
        return r
    except Exception as e:
        log(f"⚠️ Błąd DB: {e}")
        return None

def sb_get_existing_emails():
    """Pobiera wszystkie maile z lead_finder (gotowe leady)."""
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

def sb_get_pending_urls(limit=200):
    """Pobiera URL-e oczekujące na weryfikację."""
    r = sb_req("GET", f"/rest/v1/search_urls?select=*&status=eq.pending&limit={limit}&order=created_at.asc")
    if r and r.status_code == 200 and r.json():
        return r.json()
    return []

def sb_mark_urls_processed(url_ids):
    """Oznacza URL-e jako przetworzone."""
    if not url_ids: return
    for uid in url_ids:
        sb_req("PATCH", f"/rest/v1/search_urls?id=eq.{uid}", [{"status": "processed"}])

def sb_mark_urls_rejected(url_ids):
    """Oznacza URL-e jako odrzucone."""
    if not url_ids: return
    for uid in url_ids:
        sb_req("PATCH", f"/rest/v1/search_urls?id=eq.{uid}", [{"status": "rejected"}])

def sb_insert_urls(urls):
    """Dodaje nowe URL-e do puli (ignoruje duplikaty)."""
    if not urls: return
    for u in urls:
        try: sb_req("POST", "/rest/v1/search_urls", [u])
        except: pass

def sb_insert_queries(query_hashes):
    """Dodaje hashe zapytań do cache."""
    if not query_hashes: return
    for qh in query_hashes:
        try: sb_req("POST", "/rest/v1/search_queries", [{"query_hash": qh["hash"], "query_text": qh["text"]}])
        except: pass

def sb_get_brave_count():
    """Pobiera dzienny licznik Brave."""
    r = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.brave_daily_count")
    if r and r.status_code == 200 and r.json():
        return int(r.json()[0].get("value", 0))
    return 0

def sb_inc_brave_count():
    """Zwiększa licznik Brave o 1."""
    current = sb_get_brave_count()
    sb_req("PATCH", f"/rest/v1/lead_finder_config?key=eq.brave_daily_count", [{"value": current + 1}])
    return current + 1

def sb_insert_leads(leads):
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

def check_page(url):
    """Sprawdza stronę: główna -> /kontakt -> /contact."""
    domain = urlparse(url).hostname
    if not domain: return None
    
    all_emails, title, text = set(), "", ""
    pages_to_check = [url]
    if domain:
        pages_to_check.extend([
            f"https://{domain}/kontakt", f"https://{domain}/kontakt.html",
            f"https://{domain}/contact", f"https://{domain}/contact.html"
        ])

    for p in pages_to_check[:3]:
        st, html = fetch_page(p, 6)
        if 200 <= st < 400:
            em, ti, tx = parse_emails_from_html(html)
            all_emails.update(em)
            if not title: title, text = ti, tx
            if all_emails: break

    if not all_emails: return None
    return {"emails": list(all_emails), "title": title, "text": text}

# ─── AI Verifier (Groq) ───
def ask_groq(title, text, emails):
    if not GROQ_KEY: return None
    email_list = ", ".join(emails)
    prompt = (
        f"Czy to firma WESELNO-EVENTOWA (DJ, Wodzirej, Animator, Agencja, Prezenter)?\n"
        f"✅ TAK: DJ, Wodzirej, Animator, Agencja Eventowa, Prezenter.\n"
        f"❌ NIE: Sale, Catering, Foto, Video, Dekoracje, Sklepy, Wypożyczalnie, Artykuły.\n\n"
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

# ─── Main Logic ───
def run_search(target=50):
    log(f"🎯 Cel: {target} leadów | AI: {'ON' if GROQ_KEY else 'OFF'}")
    run_id = sb_create_search_run(target)
    if run_id: log(f"📝 ID: {run_id[:8]}")

    # Pobierz maile z bazy (gotowe leady)
    existing = sb_get_existing_emails()
    log(f"📋 Maile w bazie leadów: {len(existing)}")

    # 1. Sprawdź czy są URL-e w kolejce
    pending_urls = sb_get_pending_urls(limit=target * 10)
    candidate_urls = [(u["url"], u["id"]) for u in pending_urls]
    log(f"📂 URL-e w kolejce do weryfikacji: {len(candidate_urls)}")

    # 2. Jeśli brakuje → Brave Search
    brave_used = 0
    if len(candidate_urls) < target * 5:
        log("🔍 Brak wystarczającej liczby URL-i. Szukam przez Brave...")
        
        all_queries = [(q.format(city=c), c) for c in MAJOR_CITIES for q in SEARCH_QUERIES]
        random.shuffle(all_queries)

        new_urls = []
        new_queries = []
        seen_urls = set(u[0] for u in candidate_urls)

        for query_text, city in all_queries:
            # Pauza NIE zatrzymuje Brave - Brave zbiera dane niezależnie
            # Limit Brave
            if sb_get_brave_count() >= BRAVE_DAILY_LIMIT:
                log(f"⚠️ Limit Brave wyczerpany ({sb_get_brave_count()}/{BRAVE_DAILY_LIMIT})")
                break

            # Sprawdź cache zapytań
            q_hash = hashlib.sha256(query_text.encode()).hexdigest()
            check_q = sb_req("GET", f"/rest/v1/search_queries?select=id&query_hash=eq.{q_hash}")
            if check_q and check_q.status_code == 200 and check_q.json():
                log(f"⏭️ Pomijam zapytanie: {query_text[:40]}...")
                continue

            log(f"🔎 Brave: {query_text[:50]}...")
            try:
                session = curl_requests.Session(impersonate="chrome124")
                resp = session.get("https://api.search.brave.com/res/v1/web/search",
                                params={"q": query_text, "count": 15, "cc": "PL"},
                                headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY}, timeout=10)
                
                if resp.status_code == 200:
                    for item in resp.json().get("web", {}).get("results", []):
                        u = item.get("url", "")
                        if u and u not in seen_urls and not any(s in u.lower() for s in SKIP_DOMAINS):
                            seen_urls.add(u)
                            candidate_urls.append((u, None))
                            new_urls.append({"url": u, "source": "brave"})
                            log(f"   🔗 {u[:60]}")
                
                brave_used += 1
                new_queries.append({"hash": q_hash, "text": query_text})
            except Exception as e:
                log(f"   ❌ Błąd: {e}")
            time.sleep(0.5)

        # Zapisz do bazy
        if new_urls:
            sb_insert_urls(new_urls)
            log(f"💾 Dodano {len(new_urls)} nowych URL-i do puli.")
        if new_queries:
            sb_insert_queries(new_queries)
            log(f"💾 Zapisano {len(new_queries)} zapytań w cache.")
        # Zaktualizuj licznik
        for _ in range(brave_used):
            sb_inc_brave_count()

    if not candidate_urls:
        log("❌ Brak URL-i do weryfikacji. Koniec.")
        sb_close_run(run_id, reason="no_urls")
        send_tg(f"Lead Finder: Brak URL-i. Limit Brave: {sb_get_brave_count()}/{BRAVE_DAILY_LIMIT}")
        return

    # 3. Weryfikacja - tylko tyle ile potrzeba do targetu
    log(f"🤖 Weryfikuję {len(candidate_urls)} URL-i...")
    found = 0
    processed_ids = []
    rejected_ids = []

    for i, (url, url_id) in enumerate(candidate_urls):
        if found >= target: break

        # Sprawdź pauzę co 3 iteracje
        if i % 3 == 0:
            try:
                stop_flag = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.search_stop_requested")
                if stop_flag and stop_flag.status_code == 200 and stop_flag.json():
                    if stop_flag.json()[0].get("value") == "true":
                        log(f"🛑 Pauza po {i}/{len(candidate_urls)} URL-i. Znaleziono: {found}")
                        sb_mark_urls_processed(processed_ids)
                        sb_mark_urls_rejected(rejected_ids)
                        sb_req("PATCH", f"/rest/v1/lead_finder_config?key=eq.search_stop_requested", [{"value": "false"}])
                        sb_close_run(run_id, reason="paused", found=found)
                        log(f"💾 Zapisano postęp. URL-e {i+1}+ zostaną przy wznowieniu.")
                        return
            except: pass

        log(f"🔍 [{i+1}/{len(candidate_urls)}] {url[:60]}...")
        page = check_page(url)

        if not page:
            log(f"   ❌ Brak maili")
            if url_id: rejected_ids.append(url_id)
            continue

        # Sprawdź maile z bazą gotowych leadów
        new_emails = [e for e in page["emails"] 
                      if e.lower() not in existing 
                      and e.split('@')[-1].lower() not in BLOCKED_EMAIL_DOMAINS]
        
        if not new_emails:
            log(f"   ⏭️ Wszystkie maile już w bazie")
            if url_id: processed_ids.append(url_id)
            continue

        # AI
        log(f"🤖 AI: {page['title'][:50]}...")
        ai = ask_groq(page["title"], page["text"], new_emails)
        
        if not ai or not ai.get("valid"):
            reason = ai.get("reason", "nie z branży") if ai else "brak odpowiedzi"
            log(f"   ❌ AI odrzuciło: {reason}")
            if url_id: rejected_ids.append(url_id)
            continue

        selected = ai.get("email") or new_emails[0]
        if selected.lower() in existing:
            log(f"   ⚠️ Mail już w bazie: {selected}")
            if url_id: processed_ids.append(url_id)
            continue

        # Zapisz leada
        existing.add(selected.lower())
        sb_insert_leads([{
            "name": page["title"][:100] or urlparse(url).hostname,
            "city": "Polska", "email": selected, "url": url, "source": "brave"
        }])
        found += 1
        log(f"✅ Znaleziono: {selected}")
        if url_id: processed_ids.append(url_id)
        sb_update_run(run_id, found=found, api_calls=sb_get_brave_count())

    # Aktualizuj statusy URL-i
    sb_mark_urls_processed(processed_ids)
    sb_mark_urls_rejected(rejected_ids)

    reason = "cel" if found >= target else "brak_urli"
    sb_close_run(run_id, reason=reason)
    log(f"🏁 Done: {found}/{target} leadów.")
    send_tg(f"Lead Finder: Znalezione {found}/{target}\nLimit Brave: {sb_get_brave_count()}/{BRAVE_DAILY_LIMIT}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=int, default=50)
    args = parser.parse_args()
    run_search(target=args.target)

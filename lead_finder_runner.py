#!/usr/bin/env python3
"""
Familiada Lead Finder – Single-run, loop until target or limit.

Usage:
  python3 lead_finder_runner.py 50

Strategy:
  1. Katalogi (równolegle, za darmo) → analiza → ile znaleziono
  2. Pętla Brave: 1 zapytanie → 20 URL-i → analiza → ile znaleziono
     → Jeśli found >= target → STOP
     → Jeśli api_calls >= daily_limit → STOP
     → Inaczej → kolejne zapytanie
  3. Insert do DB + Telegram
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

# Klucze z pliku .env na serwerze (systemd EnvironmentFile)
BRAVE_KEY = os.environ.get("BRAVE_API_KEY")
BRAVE_DAILY_LIMIT = 33  # Taki sam jak na froncie (DAILY_LIMIT)
WORKER_URL = os.environ.get("WORKER_URL", "https://settings.familiada.online")

def _send_telegram_via_worker(message):
    """Wysyła powiadomienie Telegram przez Cloudflare Worker."""
    try:
        resp = httpx.post(f"{WORKER_URL}/_admin_api/lead-finder/notify",
                          json={"message": message}, timeout=10)
        if resp.status_code == 200:
            print("📱 Telegram notification sent via Worker")
        else:
            print(f"⚠️ Telegram failed: {resp.status_code}")
    except Exception as e:
        print(f"⚠️ Telegram error: {e}")

def send_tg(text):
    _send_telegram_via_worker(f"🎯 Lead Finder\n{text}")

# ~350 miast – rotacja po 20/run
ALL_CITIES = """Warszawa,Krakow,Wroclaw,Poznan,Gdansk,Lodz,Katowice,Szczecin,Bydgoszcz,Lublin,
Bialystok,Gdynia,Czestochowa,Radom,Sosnowiec,Torun,Kielce,Rzeszow,Gliwice,Zabrze,Olsztyn,
Bielsko-Biala,Rybnik,Tychy,Opole,Gorzow,Elblag,Plock,Walbrzych,Wloclawek,Tarnow,Chorzow,
Koszalin,Kalisz,Legnica,Grudziadz,Jaworzno,Jastrzebie-Zdroj,Nowy Sacz,Jelenia Gora,Siedlce,
Myslowice,Konin,Piotrkow Trybunalski,Inowroclaw,Lubin,Ostrow Wielkopolski,Stargard,Gniezno,
Tczew,Lomza,Mielec,Przemysl,Elk,Ostroleka,Zamosc,Suwalki,Rumia,Slupsk,Tomaszow Mazowiecki,
Pulawy,Starachowice,Zgierz,Wejherowo,Zawiercie,Pabianice,Kedzierzyn-Kozle,Leszno,Chelm,
Zielona Gora,Oswiecim,Kutno,Swinoujscie,Minsk Mazowiecki,Nowa Sol,Raciborz,Skierniewice,
Ostroda,Wadowice,Sandomierz,Klodzko,Gizycko,Augustow,Otwock,Piaseczno,Pruszkow,Legionowo,
Wolomin,Zary,Zagan,Krosno,Sanok,Jaroslaw,Lubartow,Bilgoraj,Krasnik,Pultusk,Ciechanow,
Sierpc,Lipno,Brodnica,Swiecie,Tuchola,Chojnice,Czluchow,Bytow,Lebork,Kartuzy,Koscierzyna,
Starogard Gdanski,Kwidzyn,Malbork,Sztum,Ilawa,Dzialdowo,Nidzica,Szczytno,
Wegorzewo,Ketrzyn,Bartoszyce,Braniewo,Lidzbark Warminski,Olecko,Goldap,Pisz,Orzysz,
Biala Podlaska,Miedzyrzec Podlaski,Lukow,Radzyn Podlaski,Parczew,Wlodawa,Hrubieszow,
Tomaszow Lubelski,Janow Lubelski,Krasnystaw,Leczna,Swidnik,Opole Lubelskie,Krasnik,
Stalowa Wola,Nisko,Tarnobrzeg,Ropczyce,Debica,Kolbuszowa,Lezajsk,Lancut,Przeworsk,
Lubaczow,Cieszanow,Narol,Ulanow,Bochnia,Wieliczka,Myslenice,Zakopane,Nowy Targ,Limanowa,
Gorlice,Jaslo,Brzozow,Ustrzyki Dolne,Lesko,Andrychow,Skawina,Krzeszowice,Slomniki,
Miechow,Busko-Zdroj,Pinczow,Jedrzejow,Wloszczowa,Suchedniow,Konskie,Przysucha,Szydlowiec,
Ilza,Zwolen,Garwolin,Laskarow,Zelechow,Ryki,Kozienice,Bialobrzegi,Grojec,Warka,
Gora Kalwaria,Tarczyn,Nadarzyn,Grodzisk Mazowiecki,Zyrardow,Sochaczew,Lowicz,Blonie,
Ozarow Mazowiecki,Nowy Dwor Mazowiecki,Zakroczym,Wyszogrod,Czerwinsk,Raciąż,Drobin,
Strzelce,Lasin,Kisielice,Zalewo,Morąg,Miłakowo,Miłomłyn,Olsztynek,Biskupiec,Reszel,
Korsze,Srokowo,Barciany,Górowo Iławeckie,Pieniężno,Orneta,Dobre Miasto,Bisztynek,
Jeziorany,Janowiec Koscielny,Przasnysz,Chorzele,Krasnosielc,Myszyniec,Baranowo""".replace("\n","").split(",")

SEARCH_QUERIES = [
    '"DJ" "wesele" {city} kontakt email',
    '"wodzirej" {city} kontakt',
    '"animator dzieci" {city} kontakt email',
    '"agencja eventowa" {city} kontakt',
    '"event firmowy" {city} organizacja',
    '"team building" {city} firma kontakt',
    '"gry integracyjne" {city} kontakt',
    '"fotobudka" {city} wynajem',
    '"zespół muzyczny" {city} wesele kontakt',
    '"organizacja pikników" {city} kontakt',
]

DIR_URLS = [
    ("oferteo_dj", "https://www.oferteo.pl/dj-na-wesele"),
    ("oferteo_wodzirej", "https://www.oferteo.pl/wodzirej"),
    ("oferteo_animacje", "https://www.oferteo.pl/animacje-dla-dzieci"),
    ("oferteo_event", "https://www.oferteo.pl/organizacja-imprez"),
    ("oferteo_muzyka", "https://www.oferteo.pl/zespol-muzyczny"),
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

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
SKIP = {"google.","youtube.","facebook.com","pinterest.","twitter.com","instagram.com",
        "tiktok.com","linkedin.com","bing.com","duckduckgo.com","onet.","wp.pl",
        "interia.pl","wikipedia.org","reddit.com","oferteo.pl","fixly.pl",
        "panoramafirm.pl","pkt.pl","firmy.info.pl","enyo.pl","firmo.pl",
        "wodzireje.pl","e-wesele.pl","animatorki.pl","klubanimatora.pl",
        "konferansjer.pl","teambuilding.pl","eventy.pl","pikniki-firmowe.pl"}

logs = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    logs.append(line)

# ─── Supabase ───
def sb(path, method="GET", body=None, headers=None):
    h = {"Authorization": f"Bearer {SUPABASE_ANON}", "apikey": SUPABASE_ANON}
    if headers: h.update(headers)
    return httpx.request(method, f"{SUPABASE_URL}{path}", headers=h, json=body, timeout=30)

def sb_get_cached_urls():
    """Pobiera wszystkie URL-e z cache (żeby nie powtarzać zapytań)."""
    urls = set()
    page = 0
    while True:
        r = sb(f"/rest/v1/lead_search_cache?select=url&limit=1000&offset={page*1000}")
        data = r.json()
        if not data: break
        for row in data: urls.add(row["url"])
        if len(data) < 1000: break
        page += 1
    return urls

def sb_cache_urls(urls, city="", source="brave", title=""):
    """Zapisuje URL-e w cache."""
    if not urls: return
    batch = [{"query": "", "url": u, "title": title[:120], "source": source, "city": city} for u in urls[:100]]
    try:
        sb("/rest/v1/lead_search_cache", "POST", batch,
           {"Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates"})
    except: pass

def sb_delete_urls(urls):
    """Usuwa URL-e z cache (gdy lead zostaje usunięty/odrzucony)."""
    if not urls: return
    for u in urls[:50]:
        try:
            sb(f"/rest/v1/lead_search_cache?url=eq.{u}", "DELETE")
        except: pass

def sb_get_emails():
    """Pobiera wszystkie istniejące maile (do deduplikacji)."""
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

def sb_insert(leads):
    if not leads: return 0
    r = sb("/rest/v1/lead_finder", "POST", leads,
           {"Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates"})
    if r.status_code in (200, 201): return len(leads)
    c = 0
    for l in leads:
        rr = sb("/rest/v1/lead_finder", "POST", [l],
                {"Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates"})
        if rr.status_code in (200, 201): c += 1
    return c

def sb_upsert(key, val):
    sb("/rest/v1/lead_finder_config", "POST", [{"key": key, "value": str(val)}],
       {"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})

# ─── Search helpers ───
def skip_url(u):
    l = u.lower()
    return any(s in l for s in SKIP)

def fetch_page(url, t=8):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        s.headers["Accept-Language"] = "pl-PL"
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def get_emails_from_url(url):
    domain = urlparse(url).hostname or ""
    if not domain: return [], False
    scheme = "https" if "https" in url else "http"
    pages = [url, f"{scheme}://{domain}/kontakt", f"{scheme}://{domain}/kontakt.html", f"{scheme}://{domain}/contact"]
    emails, active = set(), False
    for p in pages[:3]:
        st, html = fetch_page(p, 6)
        if 200 <= st < 400:
            active = True
            clean = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.S|re.I)
            emails.update(EMAIL_RE.findall(clean))
        time.sleep(0.15)
    return list(emails), active

def scrape_dir(key, url):
    st, html = fetch_page(url, 10)
    if st != 200 or not html: return []
    results = []
    for m in re.finditer(r'href="([^"]+)"', html):
        href = m.group(1)
        if not href.startswith("http"):
            try: href = urljoin(url, href)
            except: continue
        if not any(p in href for p in ["/firmy/", "/firma/", "/profil/", "/katalog/"]): continue
        ctx = html[max(0,m.start()-80):m.end()+80]
        name = re.sub(r'<[^>]+>', ' ', ctx).strip()
        name = re.sub(r'\s+', ' ', name)[:120]
        if len(name) > 5 and not skip_url(href):
            results.append({"url": href, "title": name, "source": key, "_city": ""})
    time.sleep(0.5 + random.random())
    return results

def send_tg(text):
    _send_telegram_via_worker(f"🎯 Lead Finder\n{text}")

# ─── Analyze URLs → extract emails → return new leads ───
def analyze_urls(urls, existing_emails):
    """Batch-process URLs, extract emails, return new leads."""
    if not urls: return []
    leads = []
    batch_size = 10

    for i in range(0, len(urls), batch_size):
        batch = urls[i:i+batch_size]
        results = []
        with ThreadPoolExecutor(max_workers=10) as ex:
            futs = {ex.submit(get_emails_from_url, item["url"]): item for item in batch}
            for f in as_completed(futs):
                item = futs[f]
                try:
                    emails, active = f.result()
                except: continue
                if not emails: continue

                domain = urlparse(item["url"]).hostname.replace("www.", "")
                primary = next((e for e in emails if e.split("@")[1].lower() == domain), sorted(emails)[0])
                if primary.lower() in existing_emails: continue

                existing_emails.add(primary.lower())
                name = re.sub(r'\s*[|–—].*$', '', item.get("title","")).strip()[:120] or domain
                results.append({
                    "name": name, "city": item.get("_city",""), "email": primary,
                    "url": item["url"], "source": item["source"],
                    "active": "TAK" if active else "NIE",
                    "extra_emails": "; ".join(e for e in emails if e != primary),
                })

        if results:
            leads.extend(results)
            for l in results:
                log(f"  ✉️ {l['email']} – {l['name']} [{l['source']}]")

    return leads

def _check_stop_flag():
    """Checks if user requested stop via UI."""
    try:
        r = httpx.get(f"{SUPABASE_URL}/rest/v1/lead_finder_config?select=value&key=eq.search_stop_requested",
                      headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}"})
        if r.status_code == 200 and r.json() and r.json()[0].get("value") == "true":
            return True
    except: pass
    return False

# ─── MAIN: Loop until target or limit ───
def run(target=50):
    log(f"🎯 Cel: {target} nowych leadów | Dzienny limit Brave: {BRAVE_DAILY_LIMIT}")

    # Reset flagi stopu
    try:
        sb_upsert("search_stop_requested", "false")
    except: pass

    # Oznacz jako uruchomione
    sb_upsert("search_status", json.dumps({
        "running": True, "target": target,
        "started_at": datetime.now().isoformat(), "found": 0, "api_calls": 0,
    }))

    # Cities for this run
    r = sb("/rest/v1/lead_finder_config?select=key,value&key=eq.cities_done")
    data = r.json()
    done = int(data[0]["value"]) if data else 0
    per_run = 20
    cities = ALL_CITIES[done:done+per_run]
    if done >= len(ALL_CITIES):
        done = 0
        cities = ALL_CITIES[:per_run]
        sb_upsert("cities_done", "0")

    log(f"🏙️ Miasta: {cities}")

    if not BRAVE_KEY:
        send_tg("❌ Brak klucza BRAVE_API_KEY")
        return

    # Sprawdzenie dziennego limitu
    r = sb("/rest/v1/lead_finder_config?select=key,value&key=in.(brave_daily_date,brave_daily_count)")
    kv = {x["key"]: x["value"] for x in r.json()} if r.json() else {}
    today = datetime.now().strftime("%Y-%m-%d")
    day_count = int(kv.get("brave_daily_count", "0")) if kv.get("brave_daily_date") == today else 0
    if day_count >= BRAVE_DAILY_LIMIT:
        send_tg(f"⚠️ Dzienny limit wyczerpany ({day_count}/{BRAVE_DAILY_LIMIT})")
        return

    # Istniejące maile (deduplikacja)
    existing = sb_get_emails()
    log(f"📋 Maile w bazie: {len(existing)}")

    # Pobierz URL-e z cache (żeby nie powtarzać zapytań)
    cached_urls = sb_get_cached_urls()
    log(f"💾 URL-e w cache: {len(cached_urls)}")

    found = 0
    api_calls = 0
    all_leads = []
    seen_urls = set(cached_urls)  # Załaduj URL-e z cache

    # ═══════════════════════════════════════════════
    # FAZA 1: KATALOGI (ZA DARMO, RÓWNOLEGLE)
    # ═══════════════════════════════════════════════
    log("📂 Faza 1: Pobieranie katalogów (równolegle)...")
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(scrape_dir, k, u): k for k, u in DIR_URLS}
        for f in as_completed(futs):
            for r in f.result():
                if r["url"] not in seen_urls:
                    seen_urls.add(r["url"])

    dir_urls = [{"url": u, "title": "", "source": "dir", "_city": ""} for u in seen_urls]
    log(f"  ✅ {len(dir_urls)} unikalnych URL-i z katalogów")

    # Zapisz nowe URL-e z katalogów w cache
    sb_cache_urls([u for u in seen_urls][:200], source="dir")

    new_leads = analyze_urls(dir_urls, existing)
    found += len(new_leads)
    if new_leads:
        inserted = sb_insert(new_leads)
        all_leads.extend(new_leads)
        log(f"  ✅ +{inserted} leadów z katalogów (łącznie: {found}/{target})")

    if found >= target:
        log("✅ Cel osiągnięty samymi katalogami!")
    else:
        # ═══════════════════════════════════════════════
        # FAZA 2: BRAVE SEARCH – pętla 1 zapytanie na raz
        # Po każdym: analiza → sprawdź czy cel osiągnięty
        # ═══════════════════════════════════════════════
        log(f"🔍 Faza 2: Pętla Brave (potrzeba jeszcze {target - found}, {BRAVE_DAILY_LIMIT - day_count} zapytań)")

        # Buduj pulę zapytań
        queries = []
        for city in cities:
            for t in SEARCH_QUERIES:
                queries.append((t.replace("{city}", city), city))
        random.shuffle(queries)

        session = curl_requests.Session(impersonate="chrome124")
        query_idx = 0

        while found < target and api_calls < (BRAVE_DAILY_LIMIT - day_count):
            # Sprawdź flagę stopu co 3 zapytania
            if api_calls % 3 == 0 and _check_stop_flag():
                log("🛑 Użytkownik zatrzymał wyszukiwanie!")
                reason = "stopped"
                break
                
            query, city = queries[query_idx % len(queries)]
            query_idx += 1
            api_calls += 1

            log(f"  [{api_calls}/{BRAVE_DAILY_LIMIT - day_count}] {query[:70]}")

            try:
                r = session.get("https://api.search.brave.com/res/v1/web/search",
                                params={"q": query, "count": 20, "cc": "PL", "search_lang": "pl"},
                                headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY},
                                timeout=10)
                new_urls = []
                if r.status_code == 200:
                    for item in r.json().get("web", {}).get("results", []):
                        if item.get("url") and not skip_url(item["url"]) and item["url"] not in seen_urls:
                            seen_urls.add(item["url"])
                            new_urls.append({"url": item["url"], "title": item.get("title",""), "source": "brave", "_city": city})

                # NATYCHMIASTOWA ANALIZA po każdym zapytaniu
                if new_urls:
                    # Zapisz w cache
                    sb_cache_urls([u["url"] for u in new_urls[:100]], source="brave", city=city)
                    
                    new_leads = analyze_urls(new_urls, existing)
                    if new_leads:
                        inserted = sb_insert(new_leads)
                        found += len(new_leads)
                        all_leads.extend(new_leads)
                        log(f"  → +{len(new_leads)} leadów (łącznie: {found}/{target})")

                        # Aktualizuj postęp w DB
                        sb_upsert("search_status", json.dumps({
                            "running": True, "target": target,
                            "started_at": datetime.now().isoformat(),
                            "found": found, "api_calls": api_calls,
                        }))
                    else:
                        log(f"  → 0 nowych leadów z {len(new_urls)} URL-i")

            except Exception as e:
                log(f"  ❌ Błąd: {e}")

            time.sleep(0.3)

    # ═══════════════════════════════════════════════
    # FINALIZACJA
    # ═══════════════════════════════════════════════
    sb_upsert("cities_done", str(done + per_run))
    sb_upsert("brave_daily_date", today)
    sb_upsert("brave_daily_count", str(day_count + api_calls))
    month = datetime.now().strftime("%Y-%m")
    month_count = int(kv.get("brave_monthly_count", "0")) if kv.get("brave_monthly_date") == month else 0
    sb_upsert("brave_monthly_date", month)
    sb_upsert("brave_monthly_count", str(month_count + api_calls))
    sb_upsert("last_search_log", "\n".join(logs)[-5000:])
    
    # Determine final reason
    if 'reason' not in locals() or reason == "target reached":
        reason = "target reached" if found >= target else f"API limit ({api_calls} queries)"
    
    # Save final status
    sb_upsert("search_status", json.dumps({
        "running": False, "done": True,
        "finished_at": datetime.now().isoformat(),
        "found": found, "api_calls": api_calls,
        "reason": reason,
    }))
    
    # Reset stop flag
    try: sb_upsert("search_stop_requested", "false")
    except: pass

    r = sb("/rest/v1/lead_finder?select=id&limit=1", headers={"Prefer": "count=exact"})
    total = r.headers.get("content-range", "?/?").split("/")[1]

    icon = "⏹️" if reason == "stopped" else "✅"
    send_tg(
        f"{icon} <b>Search completed</b>\n"
        f"📊 Found: {found}/{target} new leads\n"
        f"🔍 Brave: {api_calls} queries ({day_count}→{day_count+api_calls}/{BRAVE_DAILY_LIMIT}/day)\n"
        f"📂 Dirs: {len(DIR_URLS)} scraped\n"
        f"📁 Total DB: {total} leads\n"
        f"🛑 Status: {reason}"
    )
    log(f"🏁 Done: {found} leads | {api_calls} API calls | {reason}")

if __name__ == "__main__":
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    run(target)

#!/usr/bin/env python3
"""
Lead Finder Daemon
Obsługuje WSZYSTKO: wyszukiwanie leadów + skanowanie katalogów w tle.
"""
import os, sys, time, json, threading, httpx, subprocess
from datetime import datetime
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", "")
RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lead_finder_runner.py")
PYTHON = "python3"

# Katalogi do skanowania
DIR_URLS = [
    ("oferteo_dj", "https://www.oferteo.pl/dj-na-wesele"),
    ("oferteo_animacje", "https://www.oferteo.pl/animacje-dla-dzieci"),
    ("fixly_dj", "https://www.fixly.pl/kategoria/dj"),
    ("fixly_event", "https://www.fixly.pl/kategoria/organizacja-imprez"),
    ("panoramafirm_dj", "https://www.panoramafirm.pl/szukaj/dj+wesele.html"),
    ("panoramafirm_event", "https://www.panoramafirm.pl/szukaj/agencja+eventowa.html"),
    ("e-wesele_dj", "https://www.e-wesele.pl/kategoria/dj-na-wesele"),
    ("eventy_pl", "https://eventy.pl"),
]

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def sb_req(method, path, json_data=None):
    try:
        return httpx.request(method, f"{SUPABASE_URL}{path}", json=json_data, timeout=10,
                             headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"})
    except Exception as e:
        log(f"⚠️ Błąd DB: {e}")
        return None

def sb_get(key):
    r = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    return r.json()[0].get("value") if r and r.status_code == 200 and r.json() else None

def sb_set(key, val):
    sb_req("POST", "/rest/v1/lead_finder_config", [{"key": key, "value": str(val)}])

def fetch_page(url, t=10):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

# ─── ZADANIE 1: Skanowanie Katalogów (w tle) ───
def run_catalog_scan():
    log("📡 [TŁO] Rozpoczynam skanowanie portali...")
    current = []
    backlog = sb_get("portal_backlog")
    if backlog:
        try: current = json.loads(backlog)
        except: pass
    current_urls = {u[0] for u in current}
    new_links = []

    for key, url in DIR_URLS:
        log(f"🌐 [TŁO] Skanuję: {key}")
        st, html = fetch_page(url, 10)
        if st == 200 and html:
            soup = BeautifulSoup(html, "lxml")
            count = 0
            for a in soup.find_all('a', href=True):
                if any(x in a['href'] for x in ['/oferta/', '/firma/', '/profil/']):
                    full = urljoin(url, a['href'])
                    if full not in current_urls:
                        new_links.append((full, "Portal", "portal"))
                        current_urls.add(full)
                        count += 1
            if count > 0: log(f"   ✅ [TŁO] +{count} linków")
        time.sleep(1)

    if new_links:
        final = current + new_links
        sb_set("portal_backlog", json.dumps(final))
        log(f"💾 [TŁO] Zapisano łącznie {len(final)} linków w backlogu.")
    
    sb_set("scan_request", "idle")
    log("✅ [TŁO] Skanowanie zakończone.")

def check_and_run_scan():
    status = sb_get("scan_request")
    if status == "pending":
        sb_set("scan_request", "running")
        threading.Thread(target=run_catalog_scan, daemon=True).start()

# ─── ZADANIE 2: Wyszukiwanie Leadów ───
def check_and_run_search():
    r = sb_req("GET", "/rest/v1/lead_search_runs?select=*&status=eq.pending&limit=1&order=started_at.asc")
    if r and r.status_code == 200 and r.json():
        job = r.json()[0]
        log(f"▶️ Znaleziono zlecenie #{job['id'][:8]} (cel: {job['target']})")
        sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": "running"}])

        cmd = [PYTHON, RUNNER, "--target", str(job["target"])]
        # Jeśli to wznowienie (np. po Stop), runner sam to ogarnie przez backlogi
        
        result = subprocess.run(cmd, timeout=3600)
        status = "completed" if result.returncode == 0 else "failed"
        sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": status}])

# ─── GŁÓWNA PĘTLA ───
def main():
    log("🤖 Start Daemona. Czekam na zadania...")
    while True:
        try:
            check_and_run_scan()
            check_and_run_search()
        except KeyboardInterrupt:
            log("\n👋 Zatrzymywanie..."); break
        except Exception as e:
            log(f"⚠️ Błąd pętli: {e}")
        time.sleep(5)

if __name__ == "__main__":
    if not SUPABASE_ANON:
        log("❌ Brak SUPABASE_ANON_KEY"); sys.exit(1)
    main()
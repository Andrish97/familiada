#!/usr/bin/env python3
"""
Portal Scanner Daemon
Działa w tle na serwerze. Co minutę sprawdza bazę danych.
Jeśli Supabase (przez pg_cron) zmieni status na 'pending', skrypt odpali skanowanie.
"""

import json, os, re, time, sys
from datetime import datetime
from urllib.parse import urljoin
import httpx
from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", "")

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

# ─── Helpers ───
def sb_get_config(key):
    try:
        r = httpx.get(f"{SUPABASE_URL}/rest/v1/lead_finder_config?select=value&key=eq.{key}",
                      headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}"})
        if r.status_code == 200 and r.json(): return r.json()[0].get('value')
    except: pass
    return None

def sb_upsert(key, val):
    try:
        httpx.post(f"{SUPABASE_URL}/rest/v1/lead_finder_config", 
                   json=[{"key": key, "value": str(val)}],
                   headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", 
                            "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
    except: pass

def fetch_page(url, t=8):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def run_scan():
    log("📡 Rozpoczynam skanowanie portali...")
    
    # Pobierz obecny backlog
    current_backlog = []
    backlog_str = sb_get_config("portal_backlog")
    if backlog_str:
        try: current_backlog = json.loads(backlog_str)
        except: pass
    
    current_urls = {u[0] for u in current_backlog}
    new_links = []
    
    for key, dir_url in DIR_URLS:
        log(f"🌐 Skanuję: {key}...")
        try:
            st, html = fetch_page(dir_url, 10)
            if st != 200 or not html: continue
            soup = BeautifulSoup(html, "lxml")
            count = 0
            for a in soup.find_all('a', href=True):
                href = a['href']
                if any(x in href for x in ['/oferta/', '/firma/', '/profil/']):
                    full_url = urljoin(dir_url, href)
                    if full_url not in current_urls:
                        new_links.append((full_url, "Portal", "portal"))
                        current_urls.add(full_url)
                        count += 1
            if count > 0: log(f"   ✅ +{count} nowych linków")
            time.sleep(1) 
        except Exception as e:
            log(f"   ❌ Błąd: {e}")

    final_backlog = current_backlog + new_links
    log(f"💾 Zapisuję łącznie {len(final_backlog)} linków w backlogu...")
    sb_upsert("portal_backlog", json.dumps(final_backlog))
    log("✅ Skanowanie zakończone.")

# ─── Main Loop ───
def main():
    log("👋 Uruchomiono Portal Scanner Daemon. Czekam na sygnał z bazy...")
    
    while True:
        try:
            status = sb_get_config("scan_status")
            
            if status == 'pending':
                log("🔔 Otrzymano sygnał TRIGGER z bazy!")
                run_scan()
                # Reset statusu po skanowaniu
                sb_upsert("scan_status", "completed")
                log("🔄 Status zresetowany na 'completed'.")
            
        except Exception as e:
            log(f"⚠️ Błąd pętli głównej: {e}")
        
        # Sprawdź bazę co 60 sekund
        time.sleep(60)

if __name__ == "__main__":
    if not SUPABASE_ANON:
        log("❌ Błąd: Brak zmiennej środowiskowej SUPABASE_ANON_KEY")
        sys.exit(1)
    main()

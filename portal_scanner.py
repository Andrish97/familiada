#!/usr/bin/env python3
"""
Portal Scanner – działa w tle (np. z Crona).
Skanuje katalogi (Oferteo, Fixly, Panoramafirm) i zapisuje znalezione linki
do bazy jako 'portal_backlog'.
"""

import json, os, re, time
from datetime import datetime
from urllib.parse import urljoin
import httpx
from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ["SUPABASE_ANON_KEY"]

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
def sb_upsert(key, val):
    httpx.post(f"{SUPABASE_URL}/rest/v1/lead_finder_config", 
               json=[{"key": key, "value": str(val)}],
               headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", 
                        "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})

def fetch_page(url, t=8):
    try:
        s = curl_requests.Session(impersonate="chrome124")
        r = s.get(url, timeout=t, allow_redirects=True)
        return r.status_code, r.text
    except: return 0, ""

def run_scan():
    print(f"📡 [{datetime.now().strftime('%H:%M:%S')}] Rozpoczynam skanowanie portali...")
    
    # Pobierz obecny backlog, żeby nie dublować
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/lead_finder_config?select=value&key=eq.portal_backlog",
                  headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}"})
    current_backlog = []
    if r.status_code == 200 and r.json() and r.json()[0].get('value'):
        try: current_backlog = json.loads(r.json()[0]['value'])
        except: pass
    
    current_urls = {u[0] for u in current_backlog}
    new_links = []
    
    for key, dir_url in DIR_URLS:
        print(f"🌐 Skanuję: {key}...")
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
            print(f"   ✅ +{count} nowych linków")
            time.sleep(1) # Odstęp między portalami
        except Exception as e:
            print(f"   ❌ Błąd: {e}")

    # Zapisz do bazy (łącznie ze starymi, żeby mieć pełną pulę)
    final_backlog = current_backlog + new_links
    print(f"💾 Zapisuję łącznie {len(final_backlog)} linków w backlogu...")
    sb_upsert("portal_backlog", json.dumps(final_backlog))
    print("✅ Zakończono.")

if __name__ == "__main__":
    run_scan()

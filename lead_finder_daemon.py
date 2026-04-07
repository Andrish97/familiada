#!/usr/bin/env python3
"""
Lead Finder Daemon
Prosty strażnik. Sprawdza bazę co 5s.
Jeśli widzi zlecenie 'pending' -> odpala runnera.
Nic więcej.
"""
import os, sys, time, httpx, subprocess
from datetime import datetime

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", "")
RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lead_finder_runner.py")
PYTHON = "python3"

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def sb_req(method, path, json_data=None):
    try:
        return httpx.request(method, f"{SUPABASE_URL}{path}", json=json_data, timeout=10,
                             headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"})
    except Exception as e:
        log(f"⚠️ Błąd DB: {e}")
        return None

# ─── ZADANIE: Wyszukiwanie Leadów ───
def check_and_run_search():
    # Sprawdź czy jest zlecenie w kolejce
    r = sb_req("GET", "/rest/v1/lead_search_runs?select=*&status=eq.pending&limit=1&order=started_at.asc")
    
    if r and r.status_code == 200 and r.json():
        job = r.json()[0]
        log(f"▶️ Znaleziono zlecenie #{job['id'][:8]} (cel: {job['target']})")
        
        # Zmień status na running
        sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": "running"}])

        # Uruchom Runnera
        cmd = [PYTHON, RUNNER, "--target", str(job["target"])]
        try:
            # Timeout 1h na cały proces
            result = subprocess.run(cmd, timeout=3600)
            
            status = "completed" if result.returncode == 0 else "failed"
            sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": status}])
        except Exception as e:
            log(f"❌ Błąd uruchamiania runnera: {e}")
            sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": "failed", "reason": str(e)}])

# ─── GŁÓWNA PĘTLA ───
def main():
    log("🤖 Start Daemona. Czekam na zlecenia...")
    while True:
        try:
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
#!/usr/bin/env python3
"""
Lead Finder Daemon
Nasłuchuje bazy co 5s. Obsługuje:
1. verify -> odpala runnera z AI
2. collect -> odpala runnera z Brave (zbiera URL-e do puli)
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

def sb_get(key):
    r = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    return r.json()[0].get("value") if r and r.status_code == 200 and r.json() else None

def sb_set(key, val):
    sb_req("POST", "/rest/v1/lead_finder_config", [{"key": key, "value": str(val)}])

# ─── ZADANIE 1: COLLECT (Brave) ───
def check_and_run_collect():
    status = sb_get("collect_request")
    if status == "pending":
        log("📡 Otrzymano żądanie COLLECT z bazy. Uruchamiam...")
        sb_set("collect_request", "running")
        cmd = [PYTHON, RUNNER, "--collect-only"]
        try:
            subprocess.run(cmd, timeout=3600) # dziedziczy env z systemd
            log("✅ Collect zakończony.")
        except Exception as e:
            log(f"❌ Błąd Collect: {e}")
        finally:
            sb_set("collect_request", "idle")

# ─── ZADANIE 2: VERIFY (AI) ───
def check_and_run_verify():
    r = sb_req("GET", "/rest/v1/lead_search_runs?select=*&status=eq.pending&limit=1&order=started_at.asc")
    if r and r.status_code == 200 and r.json():
        job = r.json()[0]
        log(f"▶️ Znaleziono zlecenie VERIFY #{job['id'][:8]} (cel: {job['target']})")
        sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": "running"}])

        cmd = [PYTHON, RUNNER, "--target", str(job["target"])]
        try:
            subprocess.run(cmd, timeout=3600)
            sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": "completed"}])
        except Exception as e:
            log(f"❌ Błąd Verify: {e}")
            sb_req("PATCH", f"/rest/v1/lead_search_runs?id=eq.{job['id']}", [{"status": "failed", "reason": str(e)}])

# ─── GŁÓWNA PĘTLA ───
def main():
    log("🤖 Start Daemona. Nasłuchuję COLLECT i VERIFY...")
    while True:
        try:
            check_and_run_collect()
            check_and_run_verify()
        except KeyboardInterrupt:
            log("\n👋 Zatrzymywanie..."); break
        except Exception as e:
            log(f"⚠️ Błąd pętli: {e}")
        time.sleep(5)

if __name__ == "__main__":
    if not SUPABASE_ANON:
        log("❌ Brak SUPABASE_ANON_KEY"); sys.exit(1)
    main()
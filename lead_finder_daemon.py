#!/usr/bin/env python3
"""
Lead Finder Daemon - Strażnik
Nasłuchuje flag w bazie co 5 sekund:
1. collect_request = 'boost' -> odpala skrypt z --collect --boost
2. verify_request = 'pending' -> odpala skrypt z --verify
"""
import os, sys, time, httpx, subprocess, json
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", "")
RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lead_finder_runner.py")
PYTHON = "python3"

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def sb_req(method, path, json_data=None):
    try:
        r = httpx.request(method, f"{SUPABASE_URL}{path}", json=json_data, timeout=10,
                          headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"})
        return r
    except Exception as e:
        log(f"⚠️ Błąd DB: {e}")
        return None

def sb_get(key):
    r = sb_req("GET", f"/rest/v1/lead_finder_config?select=value&key=eq.{key}")
    return r.json()[0].get("value") if r and r.status_code == 200 and r.json() else None

def sb_set(key, val):
    sb_req("POST", "/rest/v1/lead_finder_config", [{"key": key, "value": str(val)}])

def check_and_run():
    # 1. Sprawdź Collect (Boost)
    collect_status = sb_get("collect_request")
    if collect_status == "boost":
        log("🚀 Otrzymano żądanie BOOST (Collect). Uruchamiam...")
        sb_set("collect_request", "running")
        subprocess.run([PYTHON, RUNNER, "--collect", "--boost"], timeout=3600)
        sb_set("collect_request", "idle")
        log("✅ Collect zakończony.")

    # 2. Sprawdź Verify (Weryfikacja)
    verify_raw = sb_get("verify_request")
    if verify_raw and verify_raw.startswith("{"):
        try:
            verify_data = json.loads(verify_raw)
            if verify_data.get("status") == "pending":
                target = verify_data.get("target", 50)
                log(f"🤖 Otrzymano żądanie WERYFIKACJI (Cel: {target}). Uruchamiam...")
                sb_set("verify_request", '{"status": "running"}')
                subprocess.run([PYTHON, RUNNER, "--verify", "--target", str(target)], timeout=3600)
                sb_set("verify_request", '{"status": "idle"}')
                log("✅ Weryfikacja zakończona.")
        except:
            sb_set("verify_request", "idle") # Reset błędnego JSONa

def main():
    log("🤖 Daemon start. Czekam na sygnały...")
    while True:
        try: check_and_run()
        except KeyboardInterrupt: log("\n👋 Stop"); break
        except Exception as e: log(f"❌ Błąd: {e}")
        time.sleep(5)

if __name__ == "__main__":
    if not SUPABASE_ANON: log("❌ Brak klucza"); sys.exit(1)
    main()
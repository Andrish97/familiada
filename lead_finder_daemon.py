#!/usr/bin/env python3
"""
Lead Finder DB Polling Daemon
Sprawdza bazę danych co 10 sekund w poszukiwaniu nowych zleceń ('pending')
i uruchamia lead_finder_runner.py.
"""
import os
import subprocess
import time
import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://api.familiada.online")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lead_finder_groq.py")
PYTHON = "python3"

def check_db():
    """Sprawdza czy jest zlecenie pending."""
    try:
        r = httpx.get(
            f"{SUPABASE_URL}/rest/v1/lead_search_runs?select=*&status=eq.pending&order=started_at.asc&limit=1",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"}
        )
        if r.status_code == 200 and r.json():
            return r.json()[0]
    except Exception as e:
        print(f"⚠️ Błąd bazy: {e}")
    return None

def set_status(run_id, status, msg=""):
    """Aktualizuje status zlecenia."""
    try:
        httpx.patch(
            f"{SUPABASE_URL}/rest/v1/lead_search_runs?id=eq.{run_id}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"},
            json={"status": status, "reason": msg}
        )
    except Exception: pass

def run_job(job):
    """Uruchamia runnera z odpowiednimi parametrami."""
    run_id = job["id"]
    print(f"▶️ Znaleziono zlecenie #{run_id[:8]} (cel: {job['target']})")
    
    # Oznacz jako running
    set_status(run_id, "running")
    
    # Buduj komendę
    cmd = [PYTHON, RUNNER, "--target", str(job["target"])]
    # Sprawdź czy to wznowienie
    if job.get("status") in ["limit_reached", "stopped"] or job.get("found", 0) > 0:
        cmd.append("--resume")
        print("   (Wznawiam wyszukiwanie)")
    else:
        print("   (Nowe wyszukiwanie)")
    
    try:
        result = subprocess.run(cmd, check=False)
        if result.returncode == 0:
            set_status(run_id, "completed")
        else:
            set_status(run_id, "failed", f"Kod błędu: {result.returncode}")
    except Exception as e:
        print(f"❌ Błąd uruchamiania: {e}")
        set_status(run_id, "failed", str(e))

def main():
    print(f"🤖 Lead Finder Daemon uruchomiony. Czekam na zlecenia...")
    while True:
        try:
            job = check_db()
            if job:
                run_job(job)
            else:
                print(".", end="", flush=True)
        except KeyboardInterrupt:
            print("\n👋 Zatrzymywanie daemona...")
            break
        except Exception as e:
            print(f"\n⚠️ Nieoczekiwany błąd pętli: {e}")
        time.sleep(5)

if __name__ == "__main__":
    main()

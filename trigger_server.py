#!/usr/bin/env python3
"""
Lead Finder Trigger Server
Simple HTTP server that triggers the lead finder runner.
No dependencies – Python stdlib only.

Usage:
  python3 trigger_server.py &
  # Or as systemd service

Endpoints:
  POST /search  {"target": 50}  → triggers runner
  GET  /status                  → returns running status
"""

import json
import os
import subprocess
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

RUNNER = "/opt/familiada/lead_finder_runner.py"
PYTHON = "python3"
STATUS_FILE = "/tmp/lead_finder_status.json"

state = {"running": False, "started_at": None, "target": 0, "pid": None}
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/search":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            target = int(body.get("target", 50))
            resume = body.get("resume", False)

            with lock:
                if state["running"]:
                    self._json({"error": "Already running"}, 409)
                    return

                state["running"] = True
                state["started_at"] = time.time()
                state["target"] = target
                state["pid"] = None
                state["resume"] = resume

            # Run in background
            env = os.environ.copy()
            cmd = [PYTHON, RUNNER, "--target", str(target)]
            if resume:
                cmd.append("--resume")
            proc = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            state["pid"] = proc.pid

            # Wait in thread, update status
            def wait():
                proc.wait()
                with lock:
                    state["running"] = False
                    state["pid"] = None
            threading.Thread(target=wait, daemon=True).start()

            self._json({"ok": True, "target": target, "pid": proc.pid, "resume": resume})
        else:
            self._json({"error": "Not found"}, 404)

    def do_GET(self):
        if self.path == "/status":
            with lock:
                self._json(dict(state))
        elif self.path == "/health":
            self._json({"ok": True})
        else:
            self._json({"error": "Not found"}, 404)

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args):
        pass  # Silence logs


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    print(f"🎯 Lead Finder trigger server on :{port}")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()

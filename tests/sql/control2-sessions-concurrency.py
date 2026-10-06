"""Run only after control2-sessions.sql in its isolated disposable database."""
import subprocess

args = ["psql", "-h", "localhost", "-U", "postgres", "-d", "statistics_test", "-qAt", "-v", "ON_ERROR_STOP=1"]


def sql(statement):
    return subprocess.check_output(args + ["-c", statement], text=True).strip()


sql("UPDATE game_state SET rev=20, step='devices_display', detail=jsonb_set(detail,'{locks}','{\"gameStarted\":false}');"
    "UPDATE game_state SET rev=21, step='r_roundStart', detail=jsonb_set(detail,'{locks}','{\"gameStarted\":true}');")

# Hold a telemetry write uncommitted. A concurrent game action must wait,
# then read the new events; reading before the lock loses this observation.
telemetry = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
telemetry.stdin.write("BEGIN;\nSELECT set_config('test.user_id','00000000-0000-0000-0000-000000000002',false);\n"
                      "SELECT control2_session_ping('00000000-0000-0000-0000-000000000001','{\"kind\":\"disconnect\"}');\n"
                      "\\echo TELEMETRY_LOCKED\nSELECT pg_sleep(2);\nCOMMIT;\n")
telemetry.stdin.close()
while True:
    line = telemetry.stdout.readline()
    if not line:
        raise RuntimeError("Telemetry process exited before acquiring lock: " + telemetry.stderr.read())
    if line.strip() == "TELEMETRY_LOCKED":
        break
sql("UPDATE game_state SET rev=22, detail=detail;")
if telemetry.wait(timeout=10) != 0:
    raise RuntimeError(telemetry.stderr.read())
assert sql("SELECT stats_detail#>>'{events,0,kind}' FROM game_sessions WHERE start_rev=21") == "disconnect"
print("Concurrent telemetry and gameplay: event preserved")

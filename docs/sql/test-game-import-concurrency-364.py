"""Disposable database only: imports against imports and parent deletion."""
import json
import os
import shlex
import subprocess
import time

args = shlex.split(os.environ.get("IMPORT_TEST_PSQL", "psql")) + ["-qAt", "-v", "ON_ERROR_STOP=1"]
owner = "aaaaaaaa-3641-1000-0000-000000000001"
request = "bbbbbbbb-3641-1000-0000-000000000001"
packet = '{"game":{"name":"Concurrent364","type":"prepared"},"questions":[{"text":"Co?","answers":[{"text":"Aparat","fixed_points":20}]}]}'
call = f"SELECT public.game_import_package('{packet}','{owner}','{request}');"
identity = f"SELECT set_config('request.jwt.claim.sub','{owner}',false);"


def sql(statement):
    return subprocess.check_output(args + ["-c", statement], text=True).strip()


def rpc():
    return json.loads(sql(identity + call).splitlines()[-1])


def held_transaction(statement):
    proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    proc.stdin.write("BEGIN;" + identity + statement + "\n\\echo LOCKED364\n")
    proc.stdin.flush()
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("Transaction failed before lock: " + proc.stderr.read())
        if line.strip() == "LOCKED364":
            return proc


def commit(proc):
    proc.stdin.write("COMMIT;\n")
    proc.stdin.close()
    if proc.wait(timeout=15) != 0:
        raise RuntimeError(proc.stderr.read())


def wait_for_lock(application):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{application}' AND wait_event_type='Lock'") == '1':
            return
        time.sleep(0.05)
    raise AssertionError(f"{application} did not reach the concurrent lock")


held = None
try:
    sql(f"INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('{owner}','race364@example.invalid',false,now(),'{{\"username\":\"race364\"}}');")
    held = held_transaction(call)
    assert rpc().get("error") == "locked", "Concurrent request bypassed owner serialization"
    commit(held)
    held = None
    result = rpc()
    assert result.get("ok") is True and result.get("already") is True
    gid = result["id"]
    assert sql(f"SELECT count(*) FROM games WHERE owner_id='{owner}'") == "1"
    assert sql(f"SELECT count(*) FROM game_import_receipts WHERE owner_id='{owner}'") == "1"
    print("Import364 concurrent import + retry: one complete game and receipt")

    held = held_transaction(f"DELETE FROM games WHERE id='{gid}';")
    replay = subprocess.Popen(args + ["-c", "SET application_name='import364-replay';SET statement_timeout='10s';" + identity + call], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    wait_for_lock('import364-replay')
    commit(held)
    held = None
    out, err = replay.communicate(timeout=15)
    assert replay.returncode == 0, err
    assert json.loads(out.strip().splitlines()[-1]).get("error") == "previously_removed"
    assert sql(f"SELECT count(*) FROM games WHERE owner_id='{owner}'") == "0"
    print("Import364 concurrent game deletion + replay: no resurrection")

    request = "bbbbbbbb-3641-1000-0000-000000000002"
    call = f"SELECT public.game_import_package('{packet}','{owner}','{request}');"
    held = held_transaction(call)
    deletion = subprocess.Popen(args + ["-c", f"SET application_name='import364-delete';SET statement_timeout='10s';DELETE FROM auth.users WHERE id='{owner}';"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    wait_for_lock('import364-delete')
    commit(held)
    held = None
    _, err = deletion.communicate(timeout=15)
    assert deletion.returncode == 0, err
    assert sql(f"SELECT count(*) FROM games WHERE owner_id='{owner}'") == "0"
    assert sql(f"SELECT count(*) FROM game_import_receipts WHERE owner_id='{owner}'") == "0"
    assert rpc().get("error") == "auth_required"
    print("Import364 concurrent account deletion: no games, receipts or stale import")
finally:
    if held is not None:
        held.kill()
        held.wait(timeout=5)
    sql(f"DELETE FROM auth.users WHERE id='{owner}';")

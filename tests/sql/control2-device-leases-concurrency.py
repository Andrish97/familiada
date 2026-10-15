"""Race 10 device registrations in each of 20 isolated lease slots."""
import concurrent.futures
import json
import os
import shlex
import subprocess
import threading

PSQL = shlex.split(os.environ.get(
    "PSQL_COMMAND",
    "psql -h localhost -U postgres -d device_leases_test -qAt -v ON_ERROR_STOP=1",
))


def sql(statement):
    return subprocess.check_output(PSQL + ["-c", statement], text=True).strip()


for slot in range(1, 21):
    suffix = f"{slot:012d}"
    game_id = f"50000000-0000-0000-0000-{suffix}"
    token = f"70000000-0000-0000-0000-{suffix}"
    barrier = threading.Barrier(10)

    def register(index):
        connection_id = f"80000000-0000-0000-0000-{slot * 100 + index:012d}"
        barrier.wait(timeout=10)
        statement = (
            "SELECT control_device_instance_register("
            f"'{game_id}','display','{token}','{connection_id}'::uuid)::text"
        )
        return json.loads(sql(statement))

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(register, range(10)))

    primary_count = sum(result.get("state") == "primary" for result in results)
    waiting_count = sum(result.get("state") == "waiting" for result in results)
    assert primary_count == 1 and waiting_count == 9, (
        f"slot {slot}: expected 1 primary + 9 waiting, got {primary_count}+{waiting_count}: {results}"
    )
    assert sql(
        "SELECT count(*) FROM public.control_device_connections "
        f"WHERE game_id='{game_id}' AND device_type='display' AND state='primary'"
    ) == "1", f"slot {slot}: database invariant violated"

print("20 slots × 10 concurrent registrations: exactly one primary per slot")

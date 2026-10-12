"""Isolated PG only: conversion vs confirmation, email change and account deletion."""
import os, shlex, subprocess, time
PSQL = shlex.split(os.environ.get('GUEST352_PSQL', 'psql')) + ['-X', '-At', '-v', 'ON_ERROR_STOP=1']
UID = 'bbbbbbbb-3526-0000-0000-000000000002'
def run(sql):
    p = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1800:])
    return p.stdout.strip()
def start(sql, keep=False):
    p = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(sql + '\n'); p.stdin.flush()
    if not keep: p.stdin.close(); p.stdin = None
    return p
def barrier(name, condition):
    until = time.monotonic() + 8
    while time.monotonic() < until:
        if run(f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='{name}' AND {condition}") == '1': return
        time.sleep(.05)
    raise RuntimeError('Missing barrier: ' + name)
def finish(p):
    out, err = p.communicate(timeout=10)
    if p.returncode: raise RuntimeError(err[-1800:])
    return out
assert run('SELECT current_database()') in ('fam', 'fam351faithful'), 'Isolated DB only'
mutations = {
    'confirmation': f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{UID}'",
    'email': f"UPDATE auth.users SET email='changed352race@example.invalid' WHERE id='{UID}'",
    'delete': f"DELETE FROM auth.users WHERE id='{UID}'",
}
for mutation, change in mutations.items():
    for order in ('mutation-first', 'conversion-first'):
        processes = []
        names = [f'guest352_{os.getpid()}_{mutation}_{order}_{i}' for i in (1, 2)]
        try:
            run(f"DELETE FROM auth.users WHERE id='{UID}'; INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) VALUES('{UID}','verified352race@example.invalid',now(),true,'{{\"username\":\"guest352race\",\"is_guest\":true}}');")
            convert = f"SELECT set_config('request.jwt.claim.sub','{UID}',true); SELECT public.guest_convert_account('verified352race@example.invalid')"
            first_sql = change if order == 'mutation-first' else convert
            second_sql = convert if order == 'mutation-first' else change
            first = start(f"SET application_name='{names[0]}'; BEGIN; {first_sql};", keep=True); processes.append(first)
            barrier(names[0], "state='idle in transaction'")
            second = start(f"SET application_name='{names[1]}'; BEGIN; {second_sql}; COMMIT;"); processes.append(second)
            barrier(names[1], "wait_event_type='Lock'")
            first.stdin.write('COMMIT;\n'); first.stdin.close(); first.stdin = None
            first_out, second_out = finish(first), finish(second)
            if order == 'mutation-first':
                expected = 'email_mismatch' if mutation == 'email' else 'not_confirmed'
                assert expected in second_out, second_out
                if mutation != 'delete': assert run(f"SELECT is_guest FROM public.profiles WHERE id='{UID}'") == 't'
            else:
                assert '"ok": true' in first_out, first_out
                if mutation != 'delete': assert run(f"SELECT is_guest FROM public.profiles WHERE id='{UID}'") == 'f'
            print('PASS guest352', mutation, order, flush=True)
        finally:
            run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('" + "','".join(names) + "');")
            for p in processes:
                if p.poll() is None:
                    if p.stdin is not None: p.stdin.close(); p.stdin = None
                    p.communicate(timeout=10)
            run(f"DELETE FROM auth.users WHERE id='{UID}';")

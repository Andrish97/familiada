#!/usr/bin/env python3
"""Sprawdza jednorazowy kod TOTP (RFC 6238: SHA-1, 30 s, 6 cyfr) dla przerwy
technicznej (maintenance.yml). Klucz tylko z sekretu MAINTENANCE_TOTP_SECRET
(base32, jak w aplikacji uwierzytelniającej); kod z wejścia workflow.

Kod jest ważny 5 minut wstecz (+1 krok w przód na różnicę zegarów) i tylko
raz: przyjmowany numer kroku musi być większy od ostatnio użytego (LAST).
Wypisuje numer przyjętego kroku (do zapisania jako ostatnio użyty).
Nigdy nie wypisuje klucza ani oczekiwanych kodów.

Użycie: TOTP_SECRET=... TOTP_CODE=123456 TOTP_LAST=0 scripts/totp-check.py
Kody wyjścia: 0 przyjęty, 2 brak klucza/kodu, 3 zły lub wygasły, 4 już użyty.
"""
import base64
import hashlib
import hmac
import os
import struct
import sys
import time

STEP = 30
BACK = 10  # 5 minut
AHEAD = 1


def totp(key: bytes, counter: int) -> str:
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def decode_secret(raw: str) -> bytes:
    s = "".join(raw.split()).upper().rstrip("=")
    s += "=" * (-len(s) % 8)
    return base64.b32decode(s)


def main() -> int:
    secret = os.environ.get("TOTP_SECRET", "")
    code = "".join(os.environ.get("TOTP_CODE", "").split())
    last = int(os.environ.get("TOTP_LAST", "0") or 0)
    now = int(os.environ.get("TOTP_NOW", "0") or 0) or int(time.time())
    if not secret:
        print("Brak sekretu MAINTENANCE_TOTP_SECRET", file=sys.stderr)
        return 2
    if not (len(code) == 6 and code.isdigit()):
        print("Kod musi mieć 6 cyfr", file=sys.stderr)
        return 2
    try:
        key = decode_secret(secret)
    except Exception:
        print("Sekret nie jest poprawnym base32", file=sys.stderr)
        return 2
    current = now // STEP
    for counter in range(current + AHEAD, max(current - BACK, 0) - 1, -1):
        if hmac.compare_digest(totp(key, counter), code):
            if counter <= last:
                print("Kod już użyty", file=sys.stderr)
                return 4
            print(counter)
            return 0
    print("Zły albo wygasły kod", file=sys.stderr)
    return 3


if __name__ == "__main__":
    sys.exit(main())

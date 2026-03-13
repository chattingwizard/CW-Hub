#!/usr/bin/env python3
"""
CW Hub security smoke check.

Usage:
  python scripts/security_smoke_check.py

Reads:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_KEY
  SUPABASE_ACCESS_TOKEN (optional, for auth config checks)
"""

from __future__ import annotations

import json
import os
import secrets
import sys
from typing import Dict, List, Tuple

import requests


def env(name: str, required: bool = True) -> str:
    value = os.getenv(name, "").strip()
    if required and not value:
        print(f"[FAIL] Missing env var: {name}")
        sys.exit(2)
    return value


def main() -> int:
    supabase_url = env("SUPABASE_URL")
    anon_key = env("SUPABASE_ANON_KEY")
    service_key = env("SUPABASE_SERVICE_KEY")
    access_token = env("SUPABASE_ACCESS_TOKEN", required=False)

    failures: List[str] = []

    # 1) Signup must be disabled
    probe_email = f"security_probe_{secrets.token_hex(4)}@example.com"
    signup_resp = requests.post(
        f"{supabase_url}/auth/v1/signup",
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        json={"email": probe_email, "password": "Tmp123456!", "data": {"full_name": "probe"}},
        timeout=15,
    )
    if signup_resp.status_code != 422 or "signup_disabled" not in signup_resp.text:
        failures.append(f"Signup appears enabled: {signup_resp.status_code} {signup_resp.text[:120]}")
    else:
        print("[OK] Signup disabled")

    # 2) Sensitive tables should not return anonymous data
    anon_headers = {"apikey": anon_key}
    sensitive_tables = ["announcements", "score_config", "score_event_types", "profiles"]
    for table in sensitive_tables:
        r = requests.get(
            f"{supabase_url}/rest/v1/{table}",
            headers=anon_headers,
            params={"select": "*", "limit": "1"},
            timeout=15,
        )
        if r.status_code != 200:
            failures.append(f"{table}: unexpected status {r.status_code}")
            continue
        try:
            payload = r.json()
        except json.JSONDecodeError:
            failures.append(f"{table}: non-JSON response")
            continue
        if isinstance(payload, list) and len(payload) > 0:
            failures.append(f"{table}: anonymous read leak ({len(payload)} rows returned)")
        else:
            print(f"[OK] {table} not leaking to anonymous")

    # 3) Critical RPCs should reject anonymous
    rpc_checks: List[Tuple[str, Dict[str, object]]] = [
        ("generate_invite_code", {"p_role": "recruit"}),
        ("validate_invite_code", {"invite_code": "TEST"}),
        ("save_schedules", {"p_week_start": "2026-03-09", "p_rows": []}),
        ("hub_get_users", {}),
    ]
    for fn, payload in rpc_checks:
        r = requests.post(
            f"{supabase_url}/rest/v1/rpc/{fn}",
            headers={"apikey": anon_key, "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if r.status_code not in (401, 403):
            failures.append(f"RPC {fn} should be blocked for anon: {r.status_code} {r.text[:120]}")
        else:
            print(f"[OK] RPC {fn} blocked for anonymous")

    # 4) Owner list sanity (service role check)
    owners = requests.get(
        f"{supabase_url}/rest/v1/profiles",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        params={"select": "email,role,is_active,created_at", "role": "eq.owner", "order": "created_at.desc"},
        timeout=15,
    )
    if owners.status_code != 200:
        failures.append(f"Could not read owners with service key: {owners.status_code}")
    else:
        data = owners.json()
        print(f"[OK] Owner rows visible for audit: {len(data)}")

    # 5) Optional: auth settings check via management API token
    if access_token:
        # Ref can be derived from https://<ref>.supabase.co
        try:
            ref = supabase_url.split("//", 1)[1].split(".", 1)[0]
            cfg = requests.get(
                f"https://api.supabase.com/v1/projects/{ref}/config/auth",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
            if cfg.status_code == 200:
                payload = cfg.json()
                if payload.get("disable_signup") is not True:
                    failures.append("Auth config: disable_signup is not true")
                if payload.get("mailer_autoconfirm") is not False:
                    failures.append("Auth config: mailer_autoconfirm is not false")
                if not failures:
                    print("[OK] Auth config baseline is secure")
            else:
                failures.append(f"Cannot read auth config with access token: {cfg.status_code}")
        except Exception as exc:  # pragma: no cover
            failures.append(f"Auth config check failed: {exc}")
    else:
        print("[WARN] SUPABASE_ACCESS_TOKEN not set; skipped auth config API check")

    if failures:
        print("\n[FAIL] Security smoke check found issues:")
        for issue in failures:
            print(f"- {issue}")
        return 1

    print("\n[OK] Security smoke check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

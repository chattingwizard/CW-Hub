"""
One-time (or periodic) mapping of Hubstaff user IDs → Supabase chatters.

Fetches all members from active Hubstaff orgs, normalizes names, and
auto-matches them to chatters in Supabase.  Matched IDs are written to
chatters.hubstaff_user_id.  Unmatched users are printed for manual review.

Usage:
  python pipeline/map_hubstaff_users.py              # auto-match + write
  python pipeline/map_hubstaff_users.py --dry-run    # preview only, no writes

Env vars (same as sync_hubstaff.py):
  HUBSTAFF_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import os, sys, unicodedata, requests
from datetime import datetime, timezone

HUBSTAFF_REFRESH_TOKEN = os.environ["HUBSTAFF_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TOKEN_ENDPOINT = "https://account.hubstaff.com/access_tokens"

HEADERS_SB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

SKIP_ORGS = {529677}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def normalize(name: str) -> str:
    return strip_accents(name).lower().strip().replace("  ", " ")


# ── Hubstaff auth (reused from sync_hubstaff.py) ──────────────

def get_stored_refresh_token():
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/app_settings?key=eq.hubstaff_refresh_token&select=value",
        headers=HEADERS_SB,
    )
    if r.status_code == 200:
        rows = r.json()
        if rows and rows[0].get("value"):
            return rows[0]["value"]
    return None


def store_refresh_token(token):
    requests.post(
        f"{SUPABASE_URL}/rest/v1/app_settings?on_conflict=key",
        headers={**HEADERS_SB, "Prefer": "resolution=merge-duplicates"},
        json={"key": "hubstaff_refresh_token", "value": token},
    )


def exchange_for_access_token(refresh_token):
    r = requests.post(TOKEN_ENDPOINT, data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })
    if r.status_code != 200:
        print(f"  Token exchange failed ({r.status_code}): {r.text[:200]}")
        return None, None
    data = r.json()
    return data.get("access_token"), data.get("refresh_token")


def hubstaff_get(path, access_token, params=None):
    r = requests.get(
        f"https://api.hubstaff.com/v2/{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
    )
    r.raise_for_status()
    return r.json()


# ── Collect all Hubstaff users across orgs ─────────────────────

def get_all_hubstaff_users(access_token):
    """Returns dict {user_id: name} across all active orgs."""
    orgs = hubstaff_get("organizations", access_token).get("organizations", [])
    active_orgs = [o for o in orgs if o["id"] not in SKIP_ORGS]
    print(f"  Active orgs: {len(active_orgs)}")

    all_users = {}  # user_id → name

    for org in active_orgs:
        org_id = org["id"]
        org_name = org.get("name", f"Org {org_id}")
        print(f"\n  --- {org_name} (ID: {org_id}) ---")

        user_ids = []
        page_start = None
        while True:
            params = {"page_limit": 100}
            if page_start:
                params["page_start_id"] = page_start
            data = hubstaff_get(f"organizations/{org_id}/members", access_token, params)
            members = data.get("members", [])
            if not members:
                break
            for m in members:
                uid = m.get("user_id")
                if uid:
                    user_ids.append(uid)
            if len(members) < 100:
                break
            page_start = members[-1].get("id")

        for uid in user_ids:
            if uid in all_users:
                continue
            try:
                data = hubstaff_get(f"users/{uid}", access_token)
                name = data.get("user", {}).get("name", "")
                if name:
                    all_users[uid] = name
            except Exception:
                all_users[uid] = f"User {uid}"

        print(f"    Members fetched: {len(user_ids)}")

    return all_users


# ── Main ───────────────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv
    print(f"Hubstaff user mapping {'(DRY RUN)' if dry_run else ''}")
    print(f"Started at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n")

    # Auth
    refresh_token = get_stored_refresh_token() or HUBSTAFF_REFRESH_TOKEN
    access_token, new_refresh = exchange_for_access_token(refresh_token)
    if not access_token:
        if refresh_token != HUBSTAFF_REFRESH_TOKEN:
            access_token, new_refresh = exchange_for_access_token(HUBSTAFF_REFRESH_TOKEN)
        if not access_token:
            print("ERROR: Cannot obtain access token")
            sys.exit(1)
    if new_refresh:
        store_refresh_token(new_refresh)

    # Fetch Hubstaff users
    print("[1/3] Fetching Hubstaff users...")
    hs_users = get_all_hubstaff_users(access_token)
    print(f"\n  Total unique Hubstaff users: {len(hs_users)}")

    # Fetch Supabase chatters
    print("\n[2/3] Fetching Supabase chatters...")
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/chatters?select=id,full_name,hubstaff_user_id,status",
        headers=HEADERS_SB,
    )
    chatters = r.json() if r.status_code == 200 else []
    print(f"  Total chatters: {len(chatters)}")

    already_mapped = {c["hubstaff_user_id"] for c in chatters if c.get("hubstaff_user_id")}
    print(f"  Already mapped: {len(already_mapped)}")

    # Build normalized-name → chatter lookup (only unmapped chatters)
    name_to_chatter = {}
    for c in chatters:
        if c.get("hubstaff_user_id"):
            continue
        key = normalize(c["full_name"])
        name_to_chatter[key] = c

    # Match
    print("\n[3/3] Matching...")
    matched = []      # (hubstaff_user_id, chatter_id, hs_name, sb_name)
    unmatched_hs = []  # (hubstaff_user_id, name)
    skip_already = 0

    for uid, hs_name in sorted(hs_users.items(), key=lambda x: x[1]):
        if uid in already_mapped:
            skip_already += 1
            continue

        norm_hs = normalize(hs_name)
        chatter = name_to_chatter.get(norm_hs)

        if not chatter:
            # Try partial: first+last vs full_name variations
            parts = norm_hs.split()
            if len(parts) >= 2:
                first_last = f"{parts[0]} {parts[-1]}"
                for key, c in name_to_chatter.items():
                    c_parts = key.split()
                    c_first_last = f"{c_parts[0]} {c_parts[-1]}" if len(c_parts) >= 2 else key
                    if first_last == c_first_last:
                        chatter = c
                        break

        if chatter:
            matched.append((uid, chatter["id"], hs_name, chatter["full_name"]))
            del name_to_chatter[normalize(chatter["full_name"])]
        else:
            unmatched_hs.append((uid, hs_name))

    # Report
    print(f"\n{'='*60}")
    print(f"  Already mapped (skipped): {skip_already}")
    print(f"  New auto-matched: {len(matched)}")
    print(f"  Unmatched Hubstaff users: {len(unmatched_hs)}")
    print(f"  Unmapped chatters remaining: {len(name_to_chatter)}")

    if matched:
        print(f"\n  Auto-matched ({len(matched)}):")
        for uid, cid, hs_name, sb_name in matched:
            match_note = "" if hs_name == sb_name else f"  (Hubstaff: {hs_name})"
            print(f"    ✓ {sb_name} → hubstaff_user_id={uid}{match_note}")

    if unmatched_hs:
        print(f"\n  Unmatched Hubstaff users ({len(unmatched_hs)}):")
        for uid, name in unmatched_hs:
            print(f"    ✗ {name} (user_id={uid})")

    if name_to_chatter:
        print(f"\n  Unmapped Supabase chatters ({len(name_to_chatter)}):")
        for key, c in sorted(name_to_chatter.items()):
            print(f"    ? {c['full_name']} (status={c['status']})")

    # Write matches
    if matched and not dry_run:
        print(f"\n  Writing {len(matched)} mappings to Supabase...")
        for uid, cid, _, _ in matched:
            r = requests.patch(
                f"{SUPABASE_URL}/rest/v1/chatters?id=eq.{cid}",
                headers=HEADERS_SB,
                json={"hubstaff_user_id": uid},
            )
            if r.status_code not in (200, 204):
                print(f"    ERROR updating chatter {cid}: {r.status_code} {r.text[:200]}")
        print("  Done!")
    elif dry_run and matched:
        print(f"\n  DRY RUN — would write {len(matched)} mappings")

    print()


if __name__ == "__main__":
    main()

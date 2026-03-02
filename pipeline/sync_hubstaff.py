"""
Sync hours worked from Hubstaff API → Supabase chatter_hours.
Runs every 6 hours via GitHub Actions.

Hubstaff personal access tokens are refresh tokens (90-day expiry).
Must exchange for short-lived access token before each API call.
New refresh token is stored in Supabase for next run.

CW has multiple Hubstaff organizations:
  - Chatting Wizard ESP (580385)
  - Chatting Wizard ENG (643051)
  - Only Elite Angels (529677) — legacy, skip
All must be synced.

Matching strategy (priority order):
  1. chatters.hubstaff_user_id (reliable, set by map_hubstaff_users.py)
  2. Normalized full_name fallback (for unmapped chatters, with warning)
"""
import os, sys, unicodedata, requests
from datetime import datetime, timezone, timedelta

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

SKIP_ORGS = {529677}  # Only Elite Angels — legacy org, not CW

DEFAULT_LOOKBACK_DAYS = 14
MAX_BACKFILL_DAYS = 90


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def normalize(name: str) -> str:
    return strip_accents(name).lower().strip().replace("  ", " ")


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
        print(f"  Warning: Token exchange failed ({r.status_code}): {r.text[:200]}")
        return None, None
    data = r.json()
    access_token = data.get("access_token")
    new_refresh = data.get("refresh_token")
    expires_in = data.get("expires_in", "?")
    print(f"  Access token obtained (expires in {expires_in}s)")
    return access_token, new_refresh

def hubstaff_get(path, access_token, params=None):
    r = requests.get(
        f"https://api.hubstaff.com/v2/{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
    )
    r.raise_for_status()
    return r.json()

def get_user_names(org_id, access_token):
    """Get user_id → name mapping by fetching each user's profile."""
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

    name_map = {}
    for uid in user_ids:
        try:
            data = hubstaff_get(f"users/{uid}", access_token)
            user = data.get("user", {})
            name = user.get("name", "")
            if name:
                name_map[uid] = name
        except Exception:
            name_map[uid] = f"User {uid}"
    return name_map

def get_lookback_days():
    """Parse --backfill N from CLI args, otherwise use default."""
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--backfill" and i + 1 < len(args):
            try:
                days = int(args[i + 1])
                return min(days, MAX_BACKFILL_DAYS)
            except ValueError:
                pass
    return DEFAULT_LOOKBACK_DAYS

def sync_hours():
    lookback_days = get_lookback_days()
    print(f"Syncing Hubstaff hours (last {lookback_days} days)...")

    refresh_token = get_stored_refresh_token() or HUBSTAFF_REFRESH_TOKEN
    access_token, new_refresh = exchange_for_access_token(refresh_token)

    if not access_token:
        if refresh_token != HUBSTAFF_REFRESH_TOKEN:
            print("  Retrying with original env token...")
            access_token, new_refresh = exchange_for_access_token(HUBSTAFF_REFRESH_TOKEN)
        if not access_token:
            print("  ERROR: Cannot obtain access token")
            return

    if new_refresh:
        store_refresh_token(new_refresh)
        print("  New refresh token stored")

    orgs = hubstaff_get("organizations", access_token).get("organizations", [])
    if not orgs:
        print("  ERROR: No organizations found")
        return

    active_orgs = [o for o in orgs if o["id"] not in SKIP_ORGS]
    print(f"  Organizations: {len(active_orgs)} active (skipping {len(SKIP_ORGS)} legacy)")

    # Load chatters from Supabase — prefer hubstaff_user_id, fall back to name
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/chatters?select=id,full_name,hubstaff_user_id&status=eq.Active",
        headers=HEADERS_SB,
    )
    chatters = r.json() if r.status_code == 200 else []

    chatter_by_hsid = {}   # hubstaff_user_id (int) → chatter UUID
    chatter_by_name = {}   # normalized name → chatter UUID
    mapped_count = 0

    for c in chatters:
        if c.get("hubstaff_user_id"):
            chatter_by_hsid[c["hubstaff_user_id"]] = c["id"]
            mapped_count += 1
        key = normalize(c["full_name"])
        chatter_by_name[key] = c["id"]

    print(f"  Supabase chatters loaded: {len(chatters)} ({mapped_count} with hubstaff_user_id)")

    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
    all_rows = []
    seen_keys = set()
    unmatched = {}         # name → hubstaff user_id (for logging)
    matched_by_id = 0
    matched_by_name = 0

    for org in active_orgs:
        org_id = org["id"]
        org_name = org.get("name", f"Org {org_id}")
        print(f"\n  --- {org_name} (ID: {org_id}) ---")

        member_names = get_user_names(org_id, access_token)
        print(f"    Members: {len(member_names)}")

        # Fetch activities
        activities = []
        page_start = None
        while True:
            params = {
                "date[start]": start_date,
                "date[stop]": end_date,
                "page_limit": 500,
            }
            if page_start:
                params["page_start_id"] = page_start
            data = hubstaff_get(f"organizations/{org_id}/activities/daily", access_token, params)
            page_acts = data.get("daily_activities", [])
            activities.extend(page_acts)
            if len(page_acts) < 500:
                break
            page_start = page_acts[-1].get("id")

        print(f"    Activities: {len(activities)} records ({start_date} to {end_date})")

        # Resolve any activity user_ids not in member list
        missing_ids = set()
        for act in activities:
            uid = act.get("user_id")
            if uid and uid not in member_names:
                missing_ids.add(uid)
        for uid in missing_ids:
            try:
                data = hubstaff_get(f"users/{uid}", access_token)
                user = data.get("user", {})
                name = user.get("name", "")
                if name:
                    member_names[uid] = name
            except Exception:
                pass

        for act in activities:
            user_id = act.get("user_id")
            user_name = member_names.get(user_id, "")

            # Strategy 1: match by hubstaff_user_id
            chatter_id = chatter_by_hsid.get(user_id)
            if chatter_id:
                matched_by_id += 1
            else:
                # Strategy 2: fallback to normalized name
                chatter_key = normalize(user_name)
                chatter_id = chatter_by_name.get(chatter_key)
                if chatter_id:
                    matched_by_name += 1

            if not chatter_id:
                if user_name:
                    unmatched[user_name] = user_id
                continue

            tracked_seconds = act.get("tracked", 0)
            hours = round(tracked_seconds / 3600, 2)
            date = act.get("date", "")

            if date and hours > 0:
                dedup_key = f"{chatter_id}:{date}"
                if dedup_key in seen_keys:
                    for row in all_rows:
                        if row["chatter_id"] == chatter_id and row["date"] == date:
                            row["hours_worked"] = round(row["hours_worked"] + hours, 2)
                            break
                else:
                    seen_keys.add(dedup_key)
                    all_rows.append({
                        "chatter_id": chatter_id,
                        "date": date,
                        "hours_worked": hours,
                        "synced_at": datetime.now(timezone.utc).isoformat(),
                    })

    print(f"\n  Total rows to sync: {len(all_rows)}")
    print(f"  Matched by hubstaff_user_id: {matched_by_id}")
    print(f"  Matched by name (fallback): {matched_by_name}")
    if unmatched:
        print(f"  Unmatched Hubstaff users ({len(unmatched)}):")
        for name, uid in sorted(unmatched.items())[:20]:
            print(f"    - {name} (hubstaff_user_id={uid})")
        if len(unmatched) > 20:
            print(f"    ... and {len(unmatched) - 20} more")

    if all_rows:
        for i in range(0, len(all_rows), 100):
            chunk = all_rows[i:i+100]
            r = requests.post(
                f"{SUPABASE_URL}/rest/v1/chatter_hours?on_conflict=chatter_id,date",
                headers={**HEADERS_SB, "Prefer": "resolution=merge-duplicates"},
                json=chunk,
            )
            if r.status_code in (200, 201):
                print(f"  Synced batch {i//100 + 1}: {len(chunk)} records")
            else:
                print(f"  ERROR batch {i//100 + 1}: {r.status_code} {r.text[:300]}")
    else:
        print("  WARNING: No matching hour records found")

if __name__ == "__main__":
    print(f"Hubstaff sync started at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    sync_hours()
    print("Hubstaff sync complete!")

"""
Sync hours worked from Hubstaff API → Supabase chatter_hours.
Runs every 6 hours via GitHub Actions.

Hubstaff personal access tokens are refresh tokens (90-day expiry).
Must exchange for short-lived access token before each API call.
New refresh token is stored in Supabase for next run.
"""
import os, requests, json
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

def get_stored_refresh_token():
    """Try to get the latest refresh token from Supabase (rotated tokens)."""
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
    """Store the new refresh token in Supabase for next run."""
    requests.post(
        f"{SUPABASE_URL}/rest/v1/app_settings?on_conflict=key",
        headers={**HEADERS_SB, "Prefer": "resolution=merge-duplicates"},
        json={"key": "hubstaff_refresh_token", "value": token},
    )

def exchange_for_access_token(refresh_token):
    """Exchange refresh token for access token via Hubstaff OAuth endpoint."""
    r = requests.post(TOKEN_ENDPOINT, data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })
    
    if r.status_code != 200:
        print(f"  ⚠️ Token exchange failed ({r.status_code}): {r.text[:200]}")
        return None, None
    
    data = r.json()
    access_token = data.get("access_token")
    new_refresh = data.get("refresh_token")
    expires_in = data.get("expires_in", "?")
    print(f"  🔑 Access token obtained (expires in {expires_in}s)")
    
    return access_token, new_refresh

def hubstaff_get(path, access_token, params=None):
    """Make an authenticated GET to Hubstaff API v2."""
    r = requests.get(
        f"https://api.hubstaff.com/v2/{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
    )
    r.raise_for_status()
    return r.json()

def sync_hours():
    """Main sync function."""
    print("⏱️ Syncing Hubstaff hours...")
    
    refresh_token = get_stored_refresh_token() or HUBSTAFF_REFRESH_TOKEN
    access_token, new_refresh = exchange_for_access_token(refresh_token)
    
    if not access_token:
        if refresh_token != HUBSTAFF_REFRESH_TOKEN:
            print("  Retrying with original env token...")
            access_token, new_refresh = exchange_for_access_token(HUBSTAFF_REFRESH_TOKEN)
        if not access_token:
            print("  ❌ Cannot obtain access token. Generate new token at:")
            print("     https://developer.hubstaff.com/personal_access_tokens")
            return
    
    if new_refresh:
        store_refresh_token(new_refresh)
        print("  💾 New refresh token stored")
    
    orgs = hubstaff_get("organizations", access_token).get("organizations", [])
    if not orgs:
        print("  ❌ No organizations found")
        return
    org_id = orgs[0]["id"]
    print(f"  Org ID: {org_id}")
    
    members_data = hubstaff_get(f"organizations/{org_id}/members", access_token, {"page_limit": 100})
    members = members_data.get("members", [])
    member_map = {m["user_id"]: m.get("name", f"User {m['user_id']}") for m in members}
    print(f"  Members: {len(member_map)}")
    
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
    
    activities = hubstaff_get(
        f"organizations/{org_id}/activities/daily", access_token,
        {"date[start]": start_date, "date[stop]": end_date, "page_limit": 500},
    ).get("daily_activities", [])
    print(f"  Activities: {len(activities)} records ({start_date} to {end_date})")
    
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/chatters?select=id,full_name&status=eq.Active",
        headers=HEADERS_SB,
    )
    chatters = r.json() if r.status_code == 200 else []
    chatter_name_map = {}
    for c in chatters:
        key = c["full_name"].lower().strip().replace("  ", " ")
        chatter_name_map[key] = c["id"]
    
    rows = []
    for act in activities:
        user_id = act.get("user_id")
        user_name = member_map.get(user_id, "")
        chatter_key = user_name.lower().strip().replace("  ", " ")
        chatter_id = chatter_name_map.get(chatter_key)
        
        if not chatter_id:
            continue
        
        tracked_seconds = act.get("tracked", 0)
        hours = round(tracked_seconds / 3600, 2)
        date = act.get("date", "")
        
        if date and hours > 0:
            rows.append({
                "chatter_id": chatter_id,
                "date": date,
                "hours_worked": hours,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            })
    
    if rows:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/chatter_hours?on_conflict=chatter_id,date",
            headers={**HEADERS_SB, "Prefer": "resolution=merge-duplicates"},
            json=rows,
        )
        if r.status_code in (200, 201):
            print(f"  ✅ {len(rows)} hour records synced")
        else:
            print(f"  ❌ Error: {r.status_code} {r.text[:300]}")
    else:
        print("  ⚠️ No matching hour records found")

if __name__ == "__main__":
    print(f"🔄 Hubstaff sync started at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    sync_hours()
    print("✅ Hubstaff sync complete!")

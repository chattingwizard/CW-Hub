"""
Sync hours worked from Hubstaff API → Supabase chatter_hours.
Runs every 6 hours via GitHub Actions.
"""
import os, requests, json
from datetime import datetime, timezone, timedelta

HUBSTAFF_TOKEN = os.environ["HUBSTAFF_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS_SB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

def get_hubstaff_org_id():
    """Get the organization ID from Hubstaff."""
    r = requests.get(
        "https://api.hubstaff.com/v2/organizations",
        headers={"Authorization": f"Bearer {HUBSTAFF_TOKEN}"},
    )
    if r.status_code == 401:
        print("  ⚠️ Hubstaff token expired or invalid (401). Skipping sync.")
        print("  To fix: generate a new token at https://account.hubstaff.com/developer")
        return None
    r.raise_for_status()
    orgs = r.json().get("organizations", [])
    if not orgs:
        raise Exception("No Hubstaff organizations found")
    return orgs[0]["id"]

def get_hubstaff_members(org_id):
    """Get all members from Hubstaff."""
    r = requests.get(
        f"https://api.hubstaff.com/v2/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {HUBSTAFF_TOKEN}"},
        params={"page_limit": 100},
    )
    r.raise_for_status()
    return r.json().get("members", [])

def get_hubstaff_activities(org_id, start_date, end_date):
    """Get daily activities (hours) from Hubstaff."""
    r = requests.get(
        f"https://api.hubstaff.com/v2/organizations/{org_id}/activities/daily",
        headers={"Authorization": f"Bearer {HUBSTAFF_TOKEN}"},
        params={
            "date[start]": start_date,
            "date[stop]": end_date,
            "page_limit": 500,
        },
    )
    r.raise_for_status()
    return r.json().get("daily_activities", [])

def sync_hours():
    """Main sync function."""
    print("⏱️ Syncing Hubstaff hours...")
    
    org_id = get_hubstaff_org_id()
    if org_id is None:
        return
    print(f"  Org ID: {org_id}")
    
    members = get_hubstaff_members(org_id)
    member_map = {m["user_id"]: m.get("name", f"User {m['user_id']}") for m in members}
    print(f"  Members: {len(member_map)}")
    
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
    
    activities = get_hubstaff_activities(org_id, start_date, end_date)
    print(f"  Activities: {len(activities)} records ({start_date} to {end_date})")
    
    # Match Hubstaff users to Supabase chatters by name
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/chatters?select=id,full_name&status=eq.Active",
        headers={**HEADERS_SB},
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

"""
Sync chatters, models, and teams from Airtable → Supabase.
Runs every 6 hours via GitHub Actions.
"""
import os, json, requests
from datetime import datetime, timezone

AIRTABLE_TOKEN = os.environ["AIRTABLE_TOKEN"]
AIRTABLE_BASE = os.environ.get("AIRTABLE_BASE_ID", "appy0qGaMEfyDz9LZ")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS_AT = {"Authorization": f"Bearer {AIRTABLE_TOKEN}"}
HEADERS_SB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

def fetch_airtable(table_id, fields=None):
    """Fetch all records from an Airtable table, handling pagination."""
    records = []
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE}/{table_id}"
    params = {}
    if fields:
        params["fields[]"] = fields
    
    while True:
        r = requests.get(url, headers=HEADERS_AT, params=params)
        r.raise_for_status()
        data = r.json()
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
        params["offset"] = offset
    
    return records

def upsert_supabase(table, rows, on_conflict="airtable_id"):
    """Upsert rows to Supabase."""
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = {**HEADERS_SB, "Prefer": "resolution=merge-duplicates"}
    r = requests.post(url, headers=headers, json=rows)
    if r.status_code not in (200, 201):
        print(f"  Error upserting {table}: {r.status_code} {r.text[:300]}")
        return 0
    return len(rows)

ACTIVE_STATUSES = {"Active"}

def build_chatter_team_map():
    """Fetch Teams table and build chatter_record_id → team_name mapping.
    The relationship goes Teams.Chatter → linked chatter records (not the other way)."""
    print("🏷️  Building chatter→team mapping...")
    records = fetch_airtable("tblGTOPvVCQTbEHsW", fields=["Equipo", "Chatter"])
    mapping = {}
    for rec in records:
        f = rec.get("fields", {})
        equipo = str(f.get("Equipo", "")).strip()
        if not equipo or equipo == "0":
            continue
        for chatter_id in f.get("Chatter", []):
            mapping[chatter_id] = equipo
    print(f"  Mapped {len(mapping)} chatters to teams")
    return mapping

def sync_chatters():
    """Sync Chatter table from Airtable, respecting ⚡Status field."""
    print("📋 Syncing chatters...")
    chatter_team_map = build_chatter_team_map()
    records = fetch_airtable("tblBrbCZyL5ub48zc")
    
    rows = []
    active_count = 0
    for rec in records:
        f = rec.get("fields", {})
        name = f.get("Name", f.get("Full Name", ""))
        if not name:
            continue
        
        role = f.get("⚡️Rol", "")
        at_status = f.get("\u26a1\ufe0fStatus", f.get("\u26a1Status", ""))
        status = "Active" if at_status in ACTIVE_STATUSES else "Inactive"
        if status == "Active":
            active_count += 1
        
        team_name = chatter_team_map.get(rec["id"])
        
        rows.append({
            "airtable_id": rec["id"],
            "full_name": name.strip(),
            "status": status,
            "airtable_role": role or None,
            "team_name": team_name,
            "favorite_shift": f.get("Favorite Shift", None),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        })
    
    count = upsert_supabase("chatters", rows)
    print(f"  ✅ {count} chatters synced ({active_count} active, {count - active_count} inactive)")

def sync_models():
    """Sync Models table from Airtable."""
    print("🎭 Syncing models...")
    records = fetch_airtable("tbl97sE9V8wbcgjAJ")
    
    rows = []
    for rec in records:
        f = rec.get("fields", {})
        name = f.get("Model Name", f.get("Name", ""))
        if not name:
            continue
        
        status = f.get("Status", "Live")
        if status not in ("Live", "On Hold", "Dead", "Pending Invoice"):
            status = "Live"
        
        niche = f.get("Niche", [])
        if isinstance(niche, str):
            niche = [niche]
        
        traffic = f.get("Traffic Sources", [])
        if isinstance(traffic, str):
            traffic = [traffic]
        
        teams = f.get("Team", [])
        if isinstance(teams, str):
            teams = [teams]
        
        rows.append({
            "airtable_id": rec["id"],
            "name": name.strip(),
            "status": status,
            "page_type": f.get("Page Type", None),
            "niche": niche,
            "traffic_sources": traffic,
            "client_name": f.get("Client", None),
            "team_names": teams,
            "chatbot_active": bool(f.get("Chatbot Active", False)),
            "scripts_url": f.get("Scripts URL", None),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        })
    
    count = upsert_supabase("models", rows)
    print(f"  ✅ {count} models synced")

if __name__ == "__main__":
    print(f"🔄 Airtable sync started at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    sync_chatters()
    sync_models()
    print("✅ Airtable sync complete!")

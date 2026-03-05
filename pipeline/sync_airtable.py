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

# Fields that map to dedicated columns (not stored in details JSONB)
MAPPED_MODEL_FIELDS = {
    "Model Name", "Name", "Status", "Page Type", "Profile Picture",
    "Niche", "Traffic Sources", "Traffic", "Client", "Team",
    "Chatbot Active", "CHATBOT", "Scripts URL", "Scripts",
}

# Standardized template: fixed fields per section, in display order.
# Each entry maps a display label to the Airtable field name(s) to try (first match wins).
STANDARD_TEMPLATE = {
    "personality": [
        ("Bio", ["Bio", "About", "Description"]),
        ("Personality", ["Persona", "Personality", "Character"]),
        ("Tone", ["Tone", "Tone of Voice"]),
        ("Likes", ["Likes", "Interests"]),
        ("Dislikes", ["Dislikes"]),
        ("Boundaries", ["Dos and Don'ts", "Do's", "Boundaries"]),
        ("Kinks", ["Kinks", "Fantasy"]),
        ("Hobbies", ["Hobbies"]),
        ("Favorite Food", ["Favorite Food"]),
        ("Sports", ["Sports"]),
        ("Smoking", ["Smoking"]),
        ("Drinking", ["Drinking"]),
        ("Partner", ["Partner"]),
        ("Children", ["Children"]),
        ("Countries Visited", ["Countries Visited"]),
        ("Notes", ["Notes"]),
    ],
    "services": [
        ("Video Calls", ["Video Calls"]),
        ("Custom", ["Custom"]),
        ("Sexting", ["Sexting"]),
        ("Anal", ["Anal"]),
        ("B/G", ["B/G"]),
        ("G/G", ["G/G"]),
        ("Masturbation", ["Masturbation"]),
        ("Squirting", ["Squirting"]),
        ("Dick Rating", ["Dick Rating", "Dick Rate"]),
        ("GFE", ["GFE"]),
        ("Price Guide", ["Price Guide", "Price", "Sub Price", "Subscription Price"]),
        ("PPV", ["PPV", "PPV Price", "PPV Pricing"]),
        ("Tip Menu", ["Tip Menu", "Tip"]),
        ("Custom Rate", ["Custom Rate"]),
        ("Sexting Rate", ["Sexting Rate"]),
        ("VC Rate", ["VC Rate"]),
        ("GFE Rate", ["GFE Rate"]),
    ],
    "physical": [
        ("Height", ["Height"]),
        ("Weight", ["Weight"]),
        ("Hair", ["Hair Color and Type", "Hair Color"]),
        ("Eye Color", ["Eye Color"]),
        ("Body Type", ["Body Type", "Build"]),
        ("Boobs Size", ["Boobs Size", "Breast Size", "Cup Size"]),
        ("Tattoos", ["Tattoos"]),
        ("Piercings", ["Piercings"]),
        ("Surgeries", ["Surgeries"]),
        ("Shoe Size", ["Shoe Size"]),
        ("Skin Tone", ["Skin Tone"]),
    ],
    "identity": [
        ("Age", ["Age"]),
        ("Birthday", ["Birthday"]),
        ("Nationality", ["Nationality"]),
        ("Location", ["Location", "City", "Country"]),
        ("Languages", ["Languages"]),
        ("Current Job", ["Current Job"]),
        ("Previous Job", ["Previous Job before OnlyFans", "Previous Job"]),
        ("Start Date", ["Start Date"]),
    ],
    "branding": [
        ("Instagram", ["Instagram Link", "Instagram"]),
        ("Telegram ID", ["Telegram ID", "Telegram"]),
        ("TikTok", ["TikTok"]),
        ("Twitter", ["Twitter"]),
        ("Reddit", ["Reddit"]),
        ("Snapchat", ["Snapchat"]),
        ("Branding Guideline", ["Branding Guideline"]),
    ],
    "content": [
        ("Content Type", ["Content Type"]),
        ("Content Schedule", ["Content Schedule", "Posting Schedule"]),
        ("Vault", ["Vault"]),
        ("Mass Message", ["Mass Message", "Mass DM"]),
        ("Wall Posts", ["Wall Posts"]),
        ("Stories", ["Stories"]),
        ("Content Notes", ["Content Notes"]),
    ],
}

# Fields to exclude entirely (metadata, computed, not useful)
EXCLUDED_DETAIL_FIELDS = {
    "Created", "Status (from Cliente)", "Email (from Client)",
    "Notes (from Client)", "Chatter Report", "VC Medium",
    "Client Name",
}

JUNK_VALUES = {".", "..", "-", "--", "N/A", "NA", "n/a", "na", "none", "None", "null", "Null"}

YES_VARIANTS = {"yes", "si", "sí", "y", "true"}
NO_VARIANTS = {"no", "n", "false", "nope"}

def _normalize_value(val):
    """Normalize a value for consistency: capitalize, standardize yes/no."""
    if not isinstance(val, str):
        return val
    stripped = val.strip()
    if not stripped:
        return val
    low = stripped.lower()
    if low in YES_VARIANTS:
        return "Yes"
    if low in NO_VARIANTS:
        return "No"
    if "," in stripped:
        parts = [p.strip() for p in stripped.split(",")]
        parts = [p[:1].upper() + p[1:] if p else p for p in parts]
        return ", ".join(parts)
    return stripped[:1].upper() + stripped[1:]

def _build_standardized_details(fields):
    """Build a standardized details dict from Airtable fields using the fixed template."""
    details = {}
    for section, field_defs in STANDARD_TEMPLATE.items():
        section_data = {}
        for display_label, airtable_keys in field_defs:
            value = None
            for key in airtable_keys:
                v = fields.get(key)
                if v is not None and v != "" and v != []:
                    if isinstance(v, str) and v.strip() in JUNK_VALUES:
                        continue
                    value = v
                    break
            if isinstance(value, str):
                value = _normalize_value(value)
            elif isinstance(value, list):
                value = [_normalize_value(item) if isinstance(item, str) else item for item in value]
            section_data[display_label] = value
        details[section] = section_data
    return details


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

def fetch_supabase(table, select="*", filters=None):
    """Fetch rows from Supabase. Returns list of dicts."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if filters:
        url += "&" + "&".join(f"{k}={v}" for k, v in filters.items())
    headers = {**HEADERS_SB, "Prefer": ""}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        print(f"  Error fetching {table}: {r.status_code} {r.text[:200]}")
        return []
    return r.json()

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

def insert_supabase(table, rows):
    """Insert rows into Supabase (no upsert)."""
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**HEADERS_SB, "Prefer": ""}
    r = requests.post(url, headers=headers, json=rows)
    if r.status_code not in (200, 201):
        print(f"  Error inserting {table}: {r.status_code} {r.text[:300]}")
        return 0
    return len(rows)


def _serialize_value(val):
    """Convert a value to a comparable string for change detection."""
    if val is None:
        return None
    if isinstance(val, bool):
        return str(val)
    if isinstance(val, (list, dict)):
        return json.dumps(val, sort_keys=True, default=str)
    return str(val)


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

def _build_client_name_map():
    """Fetch Clients table and build record_id → client name mapping."""
    print("  📇 Building client name map...")
    records = fetch_airtable("tblkawE86Yxsu5fIr", fields=["Full Name"])
    mapping = {}
    for rec in records:
        name = rec.get("fields", {}).get("Full Name", "")
        if name:
            mapping[rec["id"]] = name.strip()
    print(f"  Mapped {len(mapping)} clients")
    return mapping

def _resolve_linked(val, name_map):
    """Resolve linked record IDs to names using a map. Returns a name or None."""
    if isinstance(val, list):
        resolved = [name_map.get(v, v) for v in val if isinstance(v, str)]
        resolved = [r for r in resolved if not (r.startswith("rec") and len(r) == 17)]
        return resolved[0] if len(resolved) == 1 else ", ".join(resolved) if resolved else None
    if isinstance(val, str) and val.startswith("rec") and len(val) == 17:
        return name_map.get(val)
    return val

def sync_models():
    """Sync Models table from Airtable with change detection and details JSONB."""
    print("🎭 Syncing models...")

    client_map = _build_client_name_map()

    # Fetch current state from Supabase for change detection
    existing = fetch_supabase("models", select="airtable_id,name,status,page_type,niche,traffic_sources,client_name,team_names,chatbot_active,scripts_url,details")
    existing_map = {m["airtable_id"]: m for m in existing}

    records = fetch_airtable("tbl97sE9V8wbcgjAJ")
    
    rows = []
    all_changes = []
    now = datetime.now(timezone.utc).isoformat()

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
        
        traffic = f.get("Traffic Sources", f.get("Traffic", []))
        if isinstance(traffic, str):
            traffic = [traffic]
        
        teams = f.get("Team", [])
        if isinstance(teams, str):
            teams = [teams]

        pic_url = None
        pics = f.get("Profile Picture", [])
        if pics and isinstance(pics, list) and len(pics) > 0:
            first = pics[0]
            if isinstance(first, dict):
                pic_url = first.get("url")

        # Combine "Video Calls" + "VC Medium" into a single field
        vc_answer = f.get("Video Calls", "")
        vc_medium = f.get("VC Medium", "")
        if vc_answer == "Yes" and vc_medium:
            f["Video Calls"] = f"Yes, {vc_medium}"
        elif vc_answer == "Yes":
            f["Video Calls"] = "Yes, ask medium"

        # Build standardized details JSONB from fixed template
        details = _build_standardized_details(f)

        new_row = {
            "airtable_id": rec["id"],
            "name": name.strip(),
            "status": status,
            "page_type": f.get("Page Type", None),
            "profile_picture_url": pic_url,
            "niche": niche,
            "traffic_sources": traffic,
            "client_name": _resolve_linked(f.get("Client"), client_map),
            "team_names": teams,
            "chatbot_active": bool(f.get("Chatbot Active", f.get("CHATBOT") == "Active")),
            "scripts_url": f.get("Scripts URL", f.get("Scripts", None)),
            "details": json.dumps(details),
            "synced_at": now,
        }

        # Change detection against existing data
        old = existing_map.get(rec["id"])
        if old:
            compare_fields = {
                "name": new_row["name"],
                "status": new_row["status"],
                "page_type": new_row["page_type"],
                "niche": new_row["niche"],
                "traffic_sources": new_row["traffic_sources"],
                "client_name": new_row["client_name"],
                "team_names": new_row["team_names"],
                "chatbot_active": new_row["chatbot_active"],
                "scripts_url": new_row["scripts_url"],
            }
            for field_key, new_val in compare_fields.items():
                old_val = old.get(field_key)
                if _serialize_value(old_val) != _serialize_value(new_val):
                    all_changes.append({
                        "airtable_id": rec["id"],
                        "field_name": field_key,
                        "old_value": _serialize_value(old_val),
                        "new_value": _serialize_value(new_val),
                    })

            # Compare details JSONB
            old_details = old.get("details") or {}
            if isinstance(old_details, str):
                try:
                    old_details = json.loads(old_details)
                except (json.JSONDecodeError, TypeError):
                    old_details = {}
            for cat, cat_fields in details.items():
                old_cat = old_details.get(cat, {})
                for dk, dv in cat_fields.items():
                    old_dv = old_cat.get(dk) if isinstance(old_cat, dict) else None
                    if _serialize_value(old_dv) != _serialize_value(dv):
                        all_changes.append({
                            "airtable_id": rec["id"],
                            "field_name": f"{cat}.{dk}",
                            "old_value": _serialize_value(old_dv),
                            "new_value": _serialize_value(dv),
                        })

        rows.append(new_row)
    
    count = upsert_supabase("models", rows)
    print(f"  ✅ {count} models synced")

    # Log detected changes (need to resolve airtable_id → model uuid)
    if all_changes:
        id_map = {m["airtable_id"]: m.get("id") for m in fetch_supabase("models", select="id,airtable_id")}
        change_rows = []
        for ch in all_changes:
            model_uuid = id_map.get(ch["airtable_id"])
            if not model_uuid:
                continue
            change_rows.append({
                "model_id": model_uuid,
                "field_name": ch["field_name"],
                "old_value": ch["old_value"],
                "new_value": ch["new_value"],
                "changed_at": now,
            })
        if change_rows:
            inserted = insert_supabase("model_changes", change_rows)
            print(f"  📝 {inserted} field changes logged")
    else:
        print("  📝 No field changes detected")

if __name__ == "__main__":
    print(f"🔄 Airtable sync started at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    sync_chatters()
    sync_models()
    print("✅ Airtable sync complete!")

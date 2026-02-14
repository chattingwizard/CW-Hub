"""
Fetch models + active chatters from Airtable and generate SQL INSERT statements.
Copies the SQL to clipboard automatically.
"""
import os
import requests
import json
import subprocess

AIRTABLE_TOKEN = os.environ.get("AIRTABLE_TOKEN", "")
BASE_ID = "appy0qGaMEfyDz9LZ"
HEADERS = {"Authorization": f"Bearer {AIRTABLE_TOKEN}"}


def fetch_all(table_id, params=None):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{table_id}"
    records = []
    offset = None
    while True:
        p = dict(params or {})
        if offset:
            p["offset"] = offset
        r = requests.get(url, headers=HEADERS, params=p)
        r.raise_for_status()
        data = r.json()
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
    return records


def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def pg_array(items):
    if not items:
        return "'{}'::TEXT[]"
    escaped = [str(i).replace("'", "''") for i in items]
    return "ARRAY[" + ",".join(f"'{x}'" for x in escaped) + "]::TEXT[]"


def main():
    print("Fetching models from Airtable...")
    models = fetch_all("tbl97sE9V8wbcgjAJ")
    print(f"  Got {len(models)} models")

    print("Fetching active chatters...")
    chatters = fetch_all("tblBrbCZyL5ub48zc", {
        "filterByFormula": "OR({⚡️Status}='Active',{⚡️Status}='Probation')"
    })
    print(f"  Got {len(chatters)} chatters")

    print("Fetching teams...")
    teams = fetch_all("tblGTOPvVCQTbEHsW")
    print(f"  Got {len(teams)} teams")

    # Build team maps
    chatter_team = {}  # airtable_id -> team_name
    model_teams = {}   # airtable_id -> [team_names]
    for t in teams:
        f = t.get("fields", {})
        team_name = f.get("Equipo", "").strip()
        if not team_name:
            continue
        for cid in f.get("Chatter", []):
            chatter_team[cid] = team_name
        for mid in f.get("Creators", []):
            if mid not in model_teams:
                model_teams[mid] = []
            model_teams[mid].append(team_name)

    sql_lines = []
    sql_lines.append("-- CW Hub — Seed Data (auto-generated from Airtable)")
    sql_lines.append("-- Run this in Supabase SQL Editor\n")

    # Models
    sql_lines.append("-- === MODELS ===")
    model_count = 0
    for r in models:
        f = r.get("fields", {})
        name = f.get("Model Name", "").strip()
        if not name:
            continue
        
        status = f.get("Status", "Live")
        page_type = f.get("Page Type")
        niche = f.get("Niche", []) if isinstance(f.get("Niche"), list) else []
        traffic = f.get("Traffic", []) if isinstance(f.get("Traffic"), list) else []
        chatbot = f.get("CHATBOT") == "Active"
        scripts = f.get("Scripts")
        t_names = model_teams.get(r["id"], [])

        pic_url = None
        pics = f.get("Profile Picture", [])
        if pics and isinstance(pics, list) and len(pics) > 0:
            pic_url = pics[0].get("url") if isinstance(pics[0], dict) else None

        sql_lines.append(
            f"INSERT INTO public.models (airtable_id, name, status, page_type, profile_picture_url, niche, traffic_sources, chatbot_active, scripts_url, team_names) "
            f"VALUES ({escape_sql(r['id'])}, {escape_sql(name)}, {escape_sql(status)}, {escape_sql(page_type)}, {escape_sql(pic_url)}, "
            f"{pg_array(niche)}, {pg_array(traffic)}, {str(chatbot).lower()}, {escape_sql(scripts)}, {pg_array(t_names)}) "
            f"ON CONFLICT (airtable_id) DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, page_type=EXCLUDED.page_type, "
            f"profile_picture_url=EXCLUDED.profile_picture_url, niche=EXCLUDED.niche, traffic_sources=EXCLUDED.traffic_sources, "
            f"chatbot_active=EXCLUDED.chatbot_active, scripts_url=EXCLUDED.scripts_url, team_names=EXCLUDED.team_names, synced_at=NOW();"
        )
        model_count += 1

    # Chatters
    sql_lines.append("\n-- === CHATTERS ===")
    chatter_count = 0
    for r in chatters:
        f = r.get("fields", {})
        name = f.get("Full Name", "").strip()
        if not name:
            continue

        status = f.get("⚡️Status", "Active")
        role = f.get("⚡️Rol")
        fav_shift = f.get("Favorite Shift")
        team = chatter_team.get(r["id"])

        sql_lines.append(
            f"INSERT INTO public.chatters (airtable_id, full_name, status, airtable_role, team_name, favorite_shift) "
            f"VALUES ({escape_sql(r['id'])}, {escape_sql(name)}, {escape_sql(status)}, {escape_sql(role)}, "
            f"{escape_sql(team)}, {escape_sql(fav_shift)}) "
            f"ON CONFLICT (airtable_id) DO UPDATE SET full_name=EXCLUDED.full_name, status=EXCLUDED.status, "
            f"airtable_role=EXCLUDED.airtable_role, team_name=EXCLUDED.team_name, favorite_shift=EXCLUDED.favorite_shift, synced_at=NOW();"
        )
        chatter_count += 1

    sql = "\n".join(sql_lines)

    # Write to file
    out_path = os.path.join(os.path.dirname(__file__), "seed_data.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"\nGenerated {model_count} models + {chatter_count} chatters")
    print(f"SQL written to: {out_path}")

    # Copy to clipboard (Windows)
    try:
        process = subprocess.Popen(["clip.exe"], stdin=subprocess.PIPE)
        process.communicate(sql.encode("utf-8"))
        print("SQL copied to clipboard!")
    except Exception as e:
        print(f"Could not copy to clipboard: {e}")
        print("Please copy from the file manually.")


if __name__ == "__main__":
    main()

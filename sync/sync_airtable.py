#!/usr/bin/env python3
"""
CW Hub — Airtable → Supabase Sync Script

Syncs structural data (chatters roster, models list, teams) from Airtable to Supabase.
NOT for metrics — those come via CSV upload by Daniela.

Usage:
    python sync_airtable.py

Environment variables required:
    AIRTABLE_TOKEN         — Airtable personal access token
    SUPABASE_URL           — Supabase project URL
    SUPABASE_SERVICE_KEY   — Supabase service_role key (bypasses RLS)

Designed to run as a GitHub Actions cron job every 6 hours.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone

# --- Config ---
AIRTABLE_TOKEN = os.environ.get("AIRTABLE_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://bnmrdlqqzxenyqjknqhy.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
AIRTABLE_BASE_ID = "appy0qGaMEfyDz9LZ"

# Airtable table IDs
TABLE_CHATTERS = "tblBrbCZyL5ub48zc"
TABLE_MODELS = "tbl97sE9V8wbcgjAJ"
TABLE_TEAMS = "tblGTOPvVCQTbEHsW"

AIRTABLE_HEADERS = {"Authorization": f"Bearer {AIRTABLE_TOKEN}"}
SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def fetch_airtable_records(table_id, fields=None, filter_formula=None):
    """Fetch all records from an Airtable table (handles pagination)."""
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{table_id}"
    params = {}
    if fields:
        params["fields[]"] = fields
    if filter_formula:
        params["filterByFormula"] = filter_formula

    all_records = []
    offset = None

    while True:
        if offset:
            params["offset"] = offset
        resp = requests.get(url, headers=AIRTABLE_HEADERS, params=params)
        resp.raise_for_status()
        data = resp.json()
        all_records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break

    return all_records


def upsert_supabase(table, rows):
    """Upsert rows into Supabase table."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, headers=SUPABASE_HEADERS, json=rows)
    if resp.status_code not in (200, 201):
        print(f"  ERROR upserting {table}: {resp.status_code} {resp.text}")
    else:
        print(f"  OK: {len(rows)} rows upserted into {table}")


def sync_models():
    """Sync Models table from Airtable."""
    print("\n=== Syncing Models ===")
    records = fetch_airtable_records(TABLE_MODELS, fields=[
        "Model Name", "Status", "Page Type", "Profile Picture",
        "Niche", "Traffic", "CHATBOT", "Scripts",
    ])

    rows = []
    for r in records:
        f = r.get("fields", {})
        name = f.get("Model Name", "").strip()
        if not name:
            continue

        pic_url = None
        pics = f.get("Profile Picture", [])
        if pics and isinstance(pics, list) and len(pics) > 0:
            pic_url = pics[0].get("url")

        rows.append({
            "airtable_id": r["id"],
            "name": name,
            "status": f.get("Status", "Live"),
            "page_type": f.get("Page Type"),
            "profile_picture_url": pic_url,
            "niche": f.get("Niche", []) if isinstance(f.get("Niche"), list) else [],
            "traffic_sources": f.get("Traffic", []) if isinstance(f.get("Traffic"), list) else [],
            "chatbot_active": f.get("CHATBOT") == "Active",
            "scripts_url": f.get("Scripts"),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        })

    print(f"  Found {len(rows)} models")
    upsert_supabase("models", rows)


def sync_chatters():
    """Sync active chatters from Airtable."""
    print("\n=== Syncing Chatters ===")
    records = fetch_airtable_records(
        TABLE_CHATTERS,
        fields=["Full Name", "⚡️Status", "⚡️Rol", "Favorite Shift"],
        filter_formula="OR({⚡️Status}='Active',{⚡️Status}='Probation')",
    )

    rows = []
    for r in records:
        f = r.get("fields", {})
        name = f.get("Full Name", "").strip()
        if not name:
            continue

        rows.append({
            "airtable_id": r["id"],
            "full_name": name,
            "status": f.get("⚡️Status", "Active"),
            "airtable_role": f.get("⚡️Rol"),
            "favorite_shift": f.get("Favorite Shift"),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        })

    print(f"  Found {len(rows)} active chatters")
    upsert_supabase("chatters", rows)


def sync_teams():
    """Sync team assignments — update chatters.team_name and models.team_names."""
    print("\n=== Syncing Teams ===")
    records = fetch_airtable_records(TABLE_TEAMS, fields=["Equipo", "Chatter", "Creators"])

    # Build team→chatters and team→models maps
    for r in records:
        f = r.get("fields", {})
        team_name = f.get("Equipo", "").strip()
        if not team_name:
            continue

        chatter_ids = f.get("Chatter", [])
        model_ids = f.get("Creators", [])

        # Update chatters with team_name
        for cid in chatter_ids:
            url = f"{SUPABASE_URL}/rest/v1/chatters?airtable_id=eq.{cid}"
            requests.patch(
                url,
                headers={**SUPABASE_HEADERS, "Prefer": ""},
                json={"team_name": team_name},
            )

    print("  Team assignments synced")


def main():
    if not AIRTABLE_TOKEN:
        print("ERROR: AIRTABLE_TOKEN not set")
        sys.exit(1)
    if not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY not set")
        sys.exit(1)

    print(f"CW Hub Sync — {datetime.now(timezone.utc).isoformat()}")
    sync_models()
    sync_chatters()
    sync_teams()
    print("\n✅ Sync complete")


if __name__ == "__main__":
    main()

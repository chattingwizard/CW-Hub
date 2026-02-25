"""
Migrate historical Chatter Score data from Airtable to Supabase.

Requires:
  - AIRTABLE_TOKEN env var
  - SUPABASE_URL and SUPABASE_SERVICE_KEY env vars (service role for bypassing RLS)

Airtable source table: "Chatter Score" (tbljQun5AMLAfFtzX)

Usage:
  python scripts/migrate_airtable_scores.py [--dry-run]
"""

import os
import sys
import json
import time
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

AIRTABLE_TOKEN = os.environ.get("AIRTABLE_TOKEN")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://bnmrdlqqzxenyqjknqhy.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

AIRTABLE_BASE_ID = "appy0qGaMEfyDz9LZ"
AIRTABLE_TABLE_ID = "tbljQun5AMLAfFtzX"

DRY_RUN = "--dry-run" in sys.argv


def check_env():
    if not AIRTABLE_TOKEN:
        print("ERROR: AIRTABLE_TOKEN env var not set")
        sys.exit(1)
    if not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY env var not set")
        sys.exit(1)


def airtable_get(offset=None):
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}"
    headers = {"Authorization": f"Bearer {AIRTABLE_TOKEN}"}
    params = {"pageSize": 100}
    if offset:
        params["offset"] = offset

    resp = requests.get(url, headers=headers, params=params)
    resp.raise_for_status()
    return resp.json()


def fetch_all_airtable_records():
    records = []
    offset = None
    while True:
        data = airtable_get(offset)
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
        time.sleep(0.25)
    return records


def supabase_request(method, path, body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    resp = requests.request(method, url, headers=headers, json=body)
    if resp.status_code >= 400:
        print(f"  Supabase error {resp.status_code}: {resp.text[:200]}")
    return resp


def fetch_chatters():
    url = f"{SUPABASE_URL}/rest/v1/chatters?select=id,full_name,team_name&status=eq.Active&airtable_role=eq.Chatter"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()


def fetch_event_types():
    url = f"{SUPABASE_URL}/rest/v1/score_event_types?select=id,name,points,category"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()


def normalize_name(name):
    if not name:
        return ""
    return re.sub(r"\s+", " ", name.strip().lower())


def fuzzy_match_chatter(name, chatters_map):
    norm = normalize_name(name)
    if norm in chatters_map:
        return chatters_map[norm]

    best_ratio = 0
    best_match = None
    for key, chatter in chatters_map.items():
        ratio = SequenceMatcher(None, norm, key).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = chatter
    if best_ratio >= 0.75:
        return best_match
    return None


def get_week_key(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def get_week_start(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def main():
    check_env()

    print("Fetching Airtable records...")
    records = fetch_all_airtable_records()
    print(f"  Found {len(records)} records")

    print("Fetching Supabase chatters...")
    chatters = fetch_chatters()
    chatters_map = {normalize_name(c["full_name"]): c for c in chatters}
    print(f"  Found {len(chatters)} active chatters")

    print("Fetching event types...")
    event_types = fetch_event_types()
    others_type = next((t for t in event_types if t["category"] == "custom"), None)
    type_by_name = {normalize_name(t["name"]): t for t in event_types}
    print(f"  Found {len(event_types)} event types")

    unmatched_names = set()
    events_created = 0
    events_skipped = 0

    # System user ID for submitted_by (will use first owner profile or skip)
    system_user_url = f"{SUPABASE_URL}/rest/v1/profiles?select=id&role=eq.owner&limit=1"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    system_resp = requests.get(system_user_url, headers=headers)
    system_profiles = system_resp.json()
    system_user_id = system_profiles[0]["id"] if system_profiles else None

    if not system_user_id:
        print("ERROR: No owner profile found for submitted_by")
        sys.exit(1)

    print(f"\nProcessing {len(records)} records...")
    for rec in records:
        fields = rec.get("fields", {})

        chatter_name = fields.get("Chatter") or fields.get("Name") or fields.get("chatter_name")
        if not chatter_name:
            events_skipped += 1
            continue

        if isinstance(chatter_name, list):
            chatter_name = chatter_name[0] if chatter_name else ""

        chatter = fuzzy_match_chatter(str(chatter_name), chatters_map)
        if not chatter:
            unmatched_names.add(str(chatter_name))
            events_skipped += 1
            continue

        date_str = fields.get("Date") or fields.get("date")
        if not date_str:
            events_skipped += 1
            continue
        date_str = str(date_str)[:10]

        points = fields.get("Points") or fields.get("points") or 0
        if isinstance(points, str):
            try:
                points = int(points)
            except ValueError:
                points = 0

        reason = fields.get("Reason") or fields.get("reason") or fields.get("Event") or ""
        notes = fields.get("Notes") or fields.get("notes") or ""

        matched_type = type_by_name.get(normalize_name(str(reason)))
        if not matched_type and others_type:
            matched_type = others_type

        if not matched_type:
            events_skipped += 1
            continue

        week_key = get_week_key(date_str)

        event_payload = {
            "chatter_id": chatter["id"],
            "submitted_by": system_user_id,
            "date": date_str,
            "event_type_id": matched_type["id"],
            "points": points,
            "custom_points": points if matched_type["category"] == "custom" else None,
            "notes": f"{reason}. {notes}".strip(". ") if notes else (str(reason) if reason else None),
            "week": week_key,
        }

        if DRY_RUN:
            print(f"  [DRY RUN] Would create event: {chatter['full_name']} | {date_str} | {points} pts | {reason}")
        else:
            resp = supabase_request("POST", "score_events", event_payload)
            if resp.status_code < 300:
                events_created += 1
            else:
                events_skipped += 1
            time.sleep(0.1)

        if not DRY_RUN and events_created % 50 == 0 and events_created > 0:
            print(f"  ... {events_created} events created so far")

    print(f"\n=== MIGRATION SUMMARY ===")
    print(f"Total Airtable records: {len(records)}")
    print(f"Events created: {events_created}")
    print(f"Events skipped: {events_skipped}")

    if unmatched_names:
        print(f"\nUnmatched chatter names ({len(unmatched_names)}):")
        for name in sorted(unmatched_names):
            print(f"  - {name}")

    if DRY_RUN:
        print("\n[DRY RUN MODE] No data was written to Supabase.")


if __name__ == "__main__":
    main()

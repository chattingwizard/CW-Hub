"""
Generate daily coaching tasks based on weekly chatter performance.
Runs 3x/day (30 min before each TL shift) via GitHub Actions.
Sends Hub notifications to Team Leaders.

Uses calendar-week (Mon-Sun) aggregated data from chatter_daily_stats
and compares current week vs previous week for trend arrows.
"""
import os, requests, json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

TL_SHIFTS = {
    "danilyn":  {"start": 0,  "end": 8,  "team": "Team Danilyn"},
    "huckle":   {"start": 0,  "end": 8,  "team": "Team Huckle"},
    "ezekiel":  {"start": 8,  "end": 16, "team": "Team Ezekiel"},
}

MIN_WEEKLY_HOURS = 8
COACHING_OVERDUE_DAYS = 2
TREND_THRESHOLD = 2


def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS)
    return r.json() if r.status_code == 200 else []


def sb_post(path, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=data)
    return r.status_code in (200, 201)


def get_week_bounds(today):
    """Return (curr_monday, prev_monday, prev_sunday) as date strings."""
    weekday = today.weekday()  # 0=Mon
    curr_monday = today - timedelta(days=weekday)
    prev_sunday = curr_monday - timedelta(days=1)
    prev_monday = prev_sunday - timedelta(days=6)
    return (
        curr_monday.strftime("%Y-%m-%d"),
        prev_monday.strftime("%Y-%m-%d"),
        prev_sunday.strftime("%Y-%m-%d"),
    )


def get_current_shift_tls():
    """Determine which TLs are about to start their shift."""
    now = datetime.now(timezone.utc)
    current_hour = now.hour

    active_tls = []
    for tl_name, shift in TL_SHIFTS.items():
        shift_start = shift["start"]
        if shift_start == 0 and current_hour == 23:
            active_tls.append((tl_name, shift))
        elif current_hour == shift_start - 1 or current_hour == shift_start:
            active_tls.append((tl_name, shift))

    return active_tls


SUM_FIELDS = [
    "sales", "fans_chatted", "fans_who_spent", "clocked_hours",
    "messages_sent", "ppvs_sent", "ppvs_unlocked",
]


def _aggregate_rows(rows):
    """Group daily rows by employee_name and aggregate into weekly stats."""
    by_chatter = defaultdict(list)
    for row in rows:
        key = row["employee_name"]
        by_chatter[key].append(row)

    result = {}
    for name, days in by_chatter.items():
        totals = {f: sum(float(d.get(f, 0) or 0) for d in days) for f in SUM_FIELDS}

        hours = totals["clocked_hours"]
        ppvs_sent = totals["ppvs_sent"]
        fans_chatted = totals["fans_chatted"]

        result[name] = {
            "employee_name": name,
            "days_with_data": len(days),
            "sales": round(totals["sales"], 2),
            "hours": round(hours, 1),
            "sales_hr": round(totals["sales"] / hours, 2) if hours > 0 else 0,
            "golden": round(totals["ppvs_unlocked"] / ppvs_sent * 100, 1) if ppvs_sent > 0 else 0,
            "cvr": round(totals["fans_who_spent"] / fans_chatted * 100, 1) if fans_chatted > 0 else 0,
            "unlock": round(totals["ppvs_unlocked"] / ppvs_sent * 100, 1) if ppvs_sent > 0 else 0,
            "msg_hr": round(totals["messages_sent"] / hours, 1) if hours > 0 else 0,
        }

    return result


def get_weekly_stats(team_name, start_date, end_date):
    """Fetch chatter_daily_stats for a date range, filter by team, aggregate."""
    stats = sb_get(
        f"chatter_daily_stats?date=gte.{start_date}&date=lte.{end_date}&order=sales.desc"
    )

    chatters = sb_get(
        f"chatters?team_name=eq.{team_name}&status=eq.Active&airtable_role=eq.Chatter&select=full_name"
    )
    chatter_names = {c["full_name"].lower().strip().replace("  ", " ") for c in chatters}
    name_map = {}
    for c in chatters:
        name_map[c["full_name"].lower().strip().replace("  ", " ")] = c["full_name"]

    team_rows = []
    for s in stats:
        key = s["employee_name"].lower().strip().replace("  ", " ")
        if key in chatter_names:
            team_rows.append(s)

    aggregated = _aggregate_rows(team_rows)

    filtered = {}
    for name, agg in aggregated.items():
        if agg["hours"] >= MIN_WEEKLY_HOURS:
            filtered[name] = agg

    return filtered


def get_last_coaching(chatter_name):
    """Get days since last coaching session for this chatter."""
    logs = sb_get(
        f"coaching_logs?chatter_name=eq.{chatter_name}&order=date.desc&limit=1"
    )
    if not logs:
        return 999
    last_date = datetime.strptime(logs[0]["date"], "%Y-%m-%d").date()
    today = datetime.now(timezone.utc).date()
    return (today - last_date).days


def identify_red_flags(stat):
    """Identify performance red flags from weekly aggregated stats."""
    flags = []
    if stat.get("golden", 0) < 4:
        flags.append({"kpi": "Golden Ratio", "value": stat["golden"], "threshold": 4})
    if stat.get("cvr", 0) < 8:
        flags.append({"kpi": "Fan CVR", "value": stat["cvr"], "threshold": 8})
    if stat.get("sales_hr", 0) < 40:
        flags.append({"kpi": "$/hr", "value": stat["sales_hr"], "threshold": 40})
    if stat.get("unlock", 0) < 35:
        flags.append({"kpi": "Unlock Rate", "value": stat["unlock"], "threshold": 35})
    return flags


def generate_talking_points(stat, flags):
    """Generate coaching talking points based on red flags."""
    points = []
    for flag in flags:
        kpi = flag["kpi"]
        if kpi == "Golden Ratio":
            points.append({
                "kpi": "Golden Ratio",
                "target": "≥30%",
                "actions": ["Review PPV sending frequency", "Check message quality", "Analyze top performer scripts"],
            })
        elif kpi == "Fan CVR":
            points.append({
                "kpi": "Fan CVR",
                "target": "≥8%",
                "actions": ["Review fan engagement approach", "Check first-message strategy", "Analyze conversion funnel"],
            })
        elif kpi == "$/hr":
            points.append({
                "kpi": "$/hr",
                "target": "≥$40",
                "actions": ["Review time management", "Check high-value fan prioritization", "Analyze sales techniques"],
            })
        elif kpi == "Unlock Rate":
            points.append({
                "kpi": "Unlock Rate",
                "target": "≥20%",
                "actions": ["Review PPV pricing strategy", "Check content quality", "Analyze successful unlocks"],
            })
    return points


def compute_trend(current_score, prev_stats, chatter_name):
    """Compare current week vs previous week sales_hr."""
    prev = prev_stats.get(chatter_name)
    if not prev:
        return None, "flat", 0

    prev_score = prev.get("sales_hr", 0)
    delta = round(current_score - prev_score, 1)

    if delta > TREND_THRESHOLD:
        arrow = "up"
    elif delta < -TREND_THRESHOLD:
        arrow = "down"
    else:
        arrow = "flat"

    return prev_score, arrow, delta


def send_hub_notification(tl_team, task_count, date):
    """Send a Hub notification to the TL for this team."""
    profiles = sb_get(
        f"profiles?team_name=eq.{tl_team}&role=eq.team_leader&select=id,full_name"
    )

    if not profiles:
        profiles = sb_get(
            f"profiles?role=eq.team_leader&select=id,full_name"
        )
        tl_name = tl_team.replace("Team ", "").lower()
        profiles = [p for p in profiles if tl_name in p.get("full_name", "").lower()]

    for p in profiles:
        sb_post("notifications", {
            "user_id": p["id"],
            "type": "coaching",
            "title": f"🎯 {task_count} coaching tasks for today",
            "message": f"Your coaching queue for {date} is ready. {task_count} chatters need attention.",
            "read": False,
            "action_url": "/coaching-queue",
        })
        print(f"  📬 Notification sent to {p['full_name']}")


def main():
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    today_date = now.date()

    curr_monday, prev_monday, prev_sunday = get_week_bounds(today_date)
    print(f"  📅 Current week: {curr_monday} → {today}")
    print(f"  📅 Previous week: {prev_monday} → {prev_sunday}")

    active_tls = get_current_shift_tls()

    if not active_tls:
        print("  No TL shifts starting now, checking all teams...")
        active_tls = list(TL_SHIFTS.items())

    for tl_name, shift in active_tls:
        team = shift["team"]
        print(f"\n  🏷️ Processing {team} (TL: {tl_name})...")

        curr_stats = get_weekly_stats(team, curr_monday, today)
        prev_stats = get_weekly_stats(team, prev_monday, prev_sunday)
        print(f"    Chatters this week: {len(curr_stats)}, last week: {len(prev_stats)}")

        tasks_created = 0
        for chatter_name, stat in curr_stats.items():
            days_since = get_last_coaching(chatter_name)
            red_flags = identify_red_flags(stat)

            priority = 0
            if days_since >= COACHING_OVERDUE_DAYS:
                priority += 2
            if len(red_flags) >= 2:
                priority += 2
            elif len(red_flags) >= 1:
                priority += 1

            if priority == 0:
                continue

            talking_points = generate_talking_points(stat, red_flags)
            prev_score, trend_arrow, trend_delta = compute_trend(
                stat["sales_hr"], prev_stats, chatter_name,
            )

            task = {
                "date": today,
                "chatter_name": chatter_name,
                "team_tl": tl_name,
                "priority": priority,
                "perf_score": stat["sales_hr"],
                "prev_score": prev_score,
                "trend_arrow": trend_arrow,
                "trend_delta": trend_delta,
                "days_since_coaching": days_since,
                "red_flags": json.dumps(red_flags),
                "talking_points": json.dumps(talking_points),
                "kpis": json.dumps({
                    "sales": stat["sales"],
                    "sales_hr": stat["sales_hr"],
                    "golden": stat["golden"],
                    "cvr": stat["cvr"],
                    "unlock": stat["unlock"],
                    "msg_hr": stat["msg_hr"],
                    "hours": stat["hours"],
                    "days": stat["days_with_data"],
                }),
                "perf_source": "inflow_weekly",
                "status": "pending",
            }

            if sb_post("coaching_tasks", task):
                tasks_created += 1

        print(f"    ✅ {tasks_created} coaching tasks created")

        if tasks_created > 0:
            send_hub_notification(team, tasks_created, today)


if __name__ == "__main__":
    print(f"🧙 Coaching generation started at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    main()
    print("\n✅ Coaching generation complete!")

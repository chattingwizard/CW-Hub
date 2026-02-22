"""
Generate daily coaching tasks based on chatter performance.
Runs 3x/day (30 min before each TL shift) via GitHub Actions.
Sends Hub notifications to Team Leaders instead of Slack.
"""
import os, requests, json
from datetime import datetime, timezone, timedelta

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

MIN_HOURS = 4
COACHING_OVERDUE_DAYS = 2

def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS)
    return r.json() if r.status_code == 200 else []

def sb_post(path, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=data)
    return r.status_code in (200, 201)

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

def get_chatter_performance(team_name, date):
    """Get yesterday's performance for chatters in this team."""
    stats = sb_get(
        f"chatter_daily_stats?date=eq.{date}&order=sales.desc"
    )
    
    chatters = sb_get(
        f"chatters?team_name=eq.{team_name}&status=eq.Active&airtable_role=eq.Chatter&select=full_name"
    )
    chatter_names = {c["full_name"].lower().strip().replace("  ", " ") for c in chatters}
    
    team_stats = []
    for s in stats:
        key = s["employee_name"].lower().strip().replace("  ", " ")
        if key in chatter_names and s.get("clocked_hours", 0) >= MIN_HOURS:
            team_stats.append(s)
    
    return team_stats

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
    """Identify performance red flags for a chatter."""
    flags = []
    
    if stat.get("golden_ratio", 0) < 30:
        flags.append({"kpi": "Golden Ratio", "value": stat["golden_ratio"], "threshold": 30})
    if stat.get("fan_cvr", 0) < 8:
        flags.append({"kpi": "Fan CVR", "value": stat["fan_cvr"], "threshold": 8})
    if stat.get("sales_per_hour", 0) < 40:
        flags.append({"kpi": "$/hr", "value": stat["sales_per_hour"], "threshold": 40})
    if stat.get("unlock_rate", 0) < 20:
        flags.append({"kpi": "Unlock Rate", "value": stat["unlock_rate"], "threshold": 20})
    
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
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    
    active_tls = get_current_shift_tls()
    
    if not active_tls:
        print("  No TL shifts starting now, checking all teams...")
        active_tls = list(TL_SHIFTS.items())
    
    for tl_name, shift in active_tls:
        team = shift["team"]
        print(f"\n  🏷️ Processing {team} (TL: {tl_name})...")
        
        stats = get_chatter_performance(team, yesterday)
        print(f"    Chatters with data: {len(stats)}")
        
        tasks_created = 0
        for stat in stats:
            chatter_name = stat["employee_name"]
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
            
            task = {
                "date": today,
                "chatter_name": chatter_name,
                "team_tl": tl_name.capitalize(),
                "priority": priority,
                "perf_score": stat.get("sales_per_hour"),
                "days_since_coaching": days_since,
                "red_flags": json.dumps(red_flags),
                "talking_points": json.dumps(talking_points),
                "kpis": json.dumps({
                    "sales": stat.get("sales", 0),
                    "sales_per_hour": stat.get("sales_per_hour", 0),
                    "golden_ratio": stat.get("golden_ratio", 0),
                    "fan_cvr": stat.get("fan_cvr", 0),
                    "unlock_rate": stat.get("unlock_rate", 0),
                    "fans_chatted": stat.get("fans_chatted", 0),
                    "clocked_hours": stat.get("clocked_hours", 0),
                }),
                "perf_source": "inflow",
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

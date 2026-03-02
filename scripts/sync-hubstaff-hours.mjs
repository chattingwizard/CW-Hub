#!/usr/bin/env node

// Hubstaff → Supabase daily hours sync
// Usage:
//   node scripts/sync-hubstaff-hours.mjs              # sync yesterday
//   node scripts/sync-hubstaff-hours.mjs --backfill 7  # sync last 7 days
//
// Required env vars:
//   HUBSTAFF_TOKEN        — Personal Access Token from developer.hubstaff.com
//   HUBSTAFF_ORG_ID       — Organization ID (from Hubstaff URL)
//   SUPABASE_URL          — e.g. https://bnmrdlqqzxenyqjknqhy.supabase.co
//   SUPABASE_SERVICE_KEY  — Supabase service_role key

const HUBSTAFF_API = 'https://api.hubstaff.com/v2';

// ── Config from env ──────────────────────────────────────────

const HUBSTAFF_TOKEN = process.env.HUBSTAFF_TOKEN;
const HUBSTAFF_ORG_ID = process.env.HUBSTAFF_ORG_ID;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnmrdlqqzxenyqjknqhy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!HUBSTAFF_TOKEN || !HUBSTAFF_ORG_ID || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: HUBSTAFF_TOKEN, HUBSTAFF_ORG_ID, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// ── Date helpers ─────────────────────────────────────────────

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getDateRange() {
  const args = process.argv.slice(2);
  const backfillIdx = args.indexOf('--backfill');
  const days = backfillIdx !== -1 ? parseInt(args[backfillIdx + 1] || '1', 10) : 1;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const stop = new Date(today);
  stop.setUTCDate(stop.getUTCDate() - 1); // yesterday

  const start = new Date(stop);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return { start: formatDate(start), stop: formatDate(stop), days };
}

// ── Normalize name for matching ──────────────────────────────

function normalize(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// ── Hubstaff API helpers ─────────────────────────────────────

async function hubstaffGet(path) {
  const url = `${HUBSTAFF_API}${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${HUBSTAFF_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hubstaff API ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMembers() {
  const members = [];
  let pageStart = null;

  while (true) {
    const qs = pageStart ? `?page_start_id=${pageStart}` : '';
    const data = await hubstaffGet(`/organizations/${HUBSTAFF_ORG_ID}/members${qs}`);
    const list = data.members || data.users || [];
    if (list.length === 0) break;
    members.push(...list);

    const next = data.pagination?.next_page_start_id;
    if (!next) break;
    pageStart = next;
  }

  return members;
}

async function fetchDailyActivities(startDate, stopDate) {
  const activities = [];
  let pageStart = null;

  while (true) {
    let qs = `?date[start]=${startDate}&date[stop]=${stopDate}`;
    if (pageStart) qs += `&page_start_id=${pageStart}`;
    const data = await hubstaffGet(`/organizations/${HUBSTAFF_ORG_ID}/activities/daily${qs}`);
    const list = data.daily_activities || data.activities || [];
    if (list.length === 0) break;
    activities.push(...list);

    const next = data.pagination?.next_page_start_id;
    if (!next) break;
    pageStart = next;
  }

  return activities;
}

// ── Supabase helpers ─────────────────────────────────────────

async function supabaseGet(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase GET ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function supabaseUpsert(table, rows) {
  if (rows.length === 0) return;
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase UPSERT ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const { start, stop, days } = getDateRange();
  console.log(`\n=== Hubstaff Hours Sync ===`);
  console.log(`Date range: ${start} → ${stop} (${days} day${days > 1 ? 's' : ''})`);

  // 1. Fetch Hubstaff members
  console.log('\n[1/4] Fetching Hubstaff members...');
  const members = await fetchMembers();
  console.log(`  Found ${members.length} members`);

  // 2. Fetch daily activities
  console.log('[2/4] Fetching daily activities...');
  const activities = await fetchDailyActivities(start, stop);
  console.log(`  Found ${activities.length} activity records`);

  // 3. Fetch CW chatters from Supabase
  console.log('[3/4] Fetching CW chatters...');
  const chatters = await supabaseGet('chatters', 'status=eq.Active&airtable_role=eq.Chatter&select=id,full_name');
  console.log(`  Found ${chatters.length} active chatters`);

  // 4. Match and upsert
  console.log('[4/4] Matching and upserting...');

  // Build member name → id map
  const memberById = new Map();
  for (const m of members) {
    memberById.set(m.user_id || m.id, m.name || m.user?.name || '');
  }

  // Build normalized chatter name → id map
  const chatterByName = new Map();
  for (const c of chatters) {
    chatterByName.set(normalize(c.full_name), c.id);
  }

  // Group activities by user_id + date
  const hoursByUserDate = new Map();
  for (const a of activities) {
    const userId = a.user_id || a.id;
    const date = a.date;
    const tracked = a.tracked || 0;
    const key = `${userId}::${date}`;
    hoursByUserDate.set(key, (hoursByUserDate.get(key) || 0) + tracked);
  }

  const rows = [];
  const matched = new Set();
  const unmatchedHubstaff = new Set();

  for (const [key, trackedSeconds] of hoursByUserDate) {
    const [userId, date] = key.split('::');
    const memberName = memberById.get(parseInt(userId, 10)) || memberById.get(userId) || '';
    const normalizedName = normalize(memberName);
    const chatterId = chatterByName.get(normalizedName);

    if (chatterId) {
      matched.add(normalizedName);
      rows.push({
        chatter_id: chatterId,
        date,
        hours_worked: Math.round((trackedSeconds / 3600) * 100) / 100,
        synced_at: new Date().toISOString(),
      });
    } else if (memberName) {
      unmatchedHubstaff.add(memberName);
    }
  }

  if (rows.length > 0) {
    // Upsert in batches of 50
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      await supabaseUpsert('chatter_hours', rows.slice(i, i + BATCH));
    }
  }

  // Summary
  const totalHours = rows.reduce((sum, r) => sum + r.hours_worked, 0).toFixed(1);
  console.log(`\n=== Summary ===`);
  console.log(`  Matched: ${matched.size} chatters`);
  console.log(`  Records upserted: ${rows.length}`);
  console.log(`  Total hours synced: ${totalHours}h`);

  if (unmatchedHubstaff.size > 0) {
    console.log(`\n  ⚠ Unmatched Hubstaff members (${unmatchedHubstaff.size}):`);
    for (const name of [...unmatchedHubstaff].sort()) {
      console.log(`    - ${name}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

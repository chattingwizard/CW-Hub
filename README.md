# CW Hub — Chatting Wizard Operations Center

Centralized web panel for Chatting Wizard. Manages model performance, chatter schedules, assignments, and integrates all CW tools into one unified interface.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS 4 (dark theme with CW blue `#1d9bf0`)
- **State:** Zustand
- **Backend:** Supabase (Auth, Database, RLS, RPCs)
- **Hosting:** GitHub Pages (future: custom domain via Hostinger)
- **Data sync:** Airtable → Supabase (Python script + GitHub Actions)

## Roles

| Role | Access |
|---|---|
| `owner` | Everything + admin management + settings |
| `admin` | Dashboard, Schedules, Assignments, Coaching, School |
| `chatter` | Own dashboard, schedule, team models, Coaching, School |
| `recruit` | School only |

## Views

### Admin/Owner
- **Dashboard** — Model performance metrics, KPI cards, CSV upload for weekly data
- **Schedules** — Weekly schedule grid (3 shifts × 7 days), quick assign, copy previous week
- **Assignments** — Assign chatters to models, filter by team/status
- **Settings** — Generate invite codes, manage user roles

### Chatter
- **My Dashboard** — Hours worked, schedule, team models

### Embedded (all authenticated roles)
- **Coaching** — Coaching dashboard via iframe
- **School** — Training platform via iframe
- **Scripts** — Script manager via iframe (coming soon)

## Development

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build
```

## Supabase Setup

1. Run `supabase/migration_fixed.sql` in the Supabase SQL Editor
2. Seed initial data with `sync/generate_seed_sql.py` or `sync/sync_airtable.py`
3. Set Pau's profile role to `owner` manually in Supabase

## CSV Upload Format

Upload model metrics through the Dashboard. Required columns:

| Column | Required | Description |
|---|---|---|
| `model_name` | Yes | Must match model name in Supabase exactly |
| `date` | Yes | Any date in the week (system auto-calculates week start) |
| `revenue` | Yes | Total revenue for the week |
| `new_subs` | No | New subscribers |
| `messages_revenue` | No | Revenue from messages |
| `tips` | No | Tips received |
| `refunds` | No | Refund amount |

See `sample_data/model_metrics_example.csv` for an example.

## Adding New Modules

Edit `src/lib/modules.ts`:

```typescript
// Internal React page
{
  id: 'new-module',
  name: 'New Module',
  icon: 'IconName', // Lucide icon
  type: 'internal',
  path: '/new-module',
  roles: ['owner', 'admin'],
}

// External iframe
{
  id: 'external-tool',
  name: 'External Tool',
  icon: 'IconName',
  type: 'iframe',
  path: 'https://example.com/tool/',
  roles: ['owner', 'admin', 'chatter'],
}
```

## GitHub Secrets (for automated sync)

| Secret | Description |
|---|---|
| `AIRTABLE_TOKEN` | Airtable API token |
| `SUPABASE_URL` | `https://bnmrdlqqzxenyqjknqhy.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

## Architecture

```
CW Hub (React SPA)
├── Auth (Supabase)
├── Internal Views
│   ├── Dashboard (model metrics, CSV upload)
│   ├── Schedules (weekly grid)
│   ├── Assignments (model ↔ chatter)
│   ├── ChatterDashboard (own stats)
│   └── Settings (users, invite codes)
├── Embedded Modules (iframes)
│   ├── Coaching Dashboard
│   ├── Chatting School
│   └── Script Manager (future)
└── Data Sync
    ├── Airtable → Supabase (Python/GitHub Actions)
    └── CSV Upload (via Dashboard UI)
```

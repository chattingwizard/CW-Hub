# CW Hub — Chatting Wizard Operations Center

Centralized web panel for Chatting Wizard. Manages model performance, chatter schedules, assignments, coaching, scoring, and integrates all CW tools into one unified interface.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS 4 (dark theme with CW blue `#1d9bf0`)
- **State:** Zustand
- **Backend:** Supabase (Auth, Database, RLS, RPCs, Realtime)
- **Hosting:** GitHub Pages via GitHub Actions (auto-deploy on push to `main`)
- **Data sync:** Airtable + Hubstaff → Supabase (Python scripts + GitHub Actions)

## Quick Start

```bash
git clone https://github.com/chattingwizard/CW-Hub.git
cd CW-Hub
npm install
npm run dev
```

The frontend connects to Supabase directly (anon key is in `src/lib/supabase.ts` by design). No `.env` needed for frontend development.

### Pipeline scripts (optional)

If you need to run data sync scripts locally:

```bash
cp .env.example .env
# Fill in the values — ask Pau for credentials via DM (never public channels)
```

## Branch Workflow

**Never push directly to `main`.** All work goes through feature branches + Pull Requests.

```
main (protected — auto-deploys to GitHub Pages)
  |
  +-- yourname/feature-name (your working branch)
```

1. Create a branch: `git checkout -b yourname/feature-description`
2. Make your changes and commit
3. Push: `git push -u origin yourname/feature-description`
4. Open a Pull Request on GitHub
5. Merge to `main` when ready — deploy happens automatically

## Roles

| Role | Access |
|---|---|
| `owner` | Everything + admin management + settings |
| `admin` | Dashboard, Schedules, Assignments, Coaching, School, Score |
| `chatter_manager` | Overview, Dashboard, Coaching, Schedules, Assignments |
| `team_leader` | Dashboard, Coaching Queue, Schedules, Assignments |
| `chatter` | Own dashboard, schedule, team models, School |
| `recruit` | School only |

## Views

| View | Roles | Description |
|---|---|---|
| Overview | owner, admin, chatter_manager | High-level KPIs, alerts, team breakdown |
| Model Performance | owner, admin, chatter_manager, team_leader | Creator Report upload + model revenue/traffic |
| Schedules | owner, admin, chatter_manager, team_leader | Weekly schedule grid (3 shifts x 7 days) |
| Assignments | owner, admin, chatter_manager, team_leader | Model-chatter assignment management |
| Chatter Performance | owner, admin, chatter_manager, team_leader | Daily KPIs from Employee Reports |
| Coaching Queue | owner, admin, chatter_manager, team_leader | Daily coaching task queue for TLs |
| Coaching Overview | owner | Coaching system monitoring |
| Chatter Score | owner, admin, chatter_manager, team_leader | Weekly points, leaderboard, bonuses |
| Upload Center | owner, admin, chatter_manager | Employee + Creator Report upload |
| Knowledge Base | all authenticated | Company documentation, role-filtered |
| Tasks | all authenticated | Task management |
| My Dashboard | chatter | Self-service: schedule, stats, score |
| Settings | owner | User management, invite codes, doc permissions |
| School | all authenticated | Training platform (iframe) |
| Scripts | all authenticated | Script manager (iframe) |

## Project Structure

```
src/
  components/       UI components (reusable)
  pages/            Route-level page components
  hooks/            Custom React hooks
  stores/           Zustand state stores
  lib/              Utilities, Supabase client, modules config
  types/            TypeScript interfaces
pipeline/           Python scripts for data sync (Airtable, Hubstaff)
.cursor/rules/      Cursor AI context rules (auto-loaded)
.github/workflows/  CI/CD (deploy + pipeline schedules)
```

## Cursor AI Context

The `.cursor/rules/` directory contains project context files that Cursor loads automatically:

| File | Content |
|---|---|
| `cw-hub-context.mdc` | Tech stack, roles, views, tables, design system |
| `coaching-system.mdc` | Coaching business rules, data sources, pipeline |
| `airtable-schema.mdc` | Full Airtable schema (36 tables) |
| `security-protocol.mdc` | Security rules, credential storage, pre-commit hooks |

These load automatically when you open the project in Cursor.

## Data Sources

| Data | Source | Sync |
|---|---|---|
| Models, Chatters, Teams | Airtable | `pipeline/sync_airtable.py` (every 6h via GitHub Actions) |
| Model revenue/traffic | Infloww Creator Reports (.xlsx) | Upload via Hub UI |
| Chatter daily KPIs | Inflow Employee Reports (.csv) | Upload via Hub UI |
| Hours worked | Hubstaff API | `pipeline/sync_hubstaff.py` (every 6h via GitHub Actions) |
| Schedules, Assignments | Hub (Supabase) | Created directly in Hub |

## Adding New Modules

Edit `src/lib/modules.ts`:

```typescript
// Internal React page
{
  id: 'new-module',
  name: 'New Module',
  icon: 'IconName', // Lucide icon name
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

Then add the route in `src/App.tsx` and (if internal) create the page component in `src/pages/`.

## GitHub Secrets (for automated pipelines)

| Secret | Description |
|---|---|
| `AIRTABLE_TOKEN` | Airtable API token |
| `SUPABASE_URL` | `https://bnmrdlqqzxenyqjknqhy.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `HUBSTAFF_TOKEN` | Hubstaff API JWT |

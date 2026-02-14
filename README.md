# CW Hub — Chatting Wizard Central Panel

Centralized web panel for Chatting Wizard team. All employees access the Hub with role-based views.

## Roles

| Role | Access |
|---|---|
| **Owner** | Everything: metrics, schedules, assignments, settings, admin management |
| **Admin** | Model metrics, schedules, assignments, coaching, school |
| **Chatter** | Own schedule, team models, hours, coaching, school |
| **Recruit** | School only |

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS 4
- **Backend:** Supabase (Auth, DB, RLS)
- **Hosting:** GitHub Pages (static build)
- **Data Sync:** Airtable → Supabase via GitHub Actions

## Development

```bash
npm install
npm run dev     # Local dev server
npm run build   # Production build → dist/
```

## Deployment

Push to `main` branch. GitHub Actions builds and deploys to GitHub Pages automatically.

## Supabase Setup

Run `supabase/migration.sql` in the Supabase SQL Editor after the CW-ChattingSchool migration.

## Adding New Modules

To add a new tool/page to the Hub, edit `src/lib/modules.ts`:

```typescript
{
  id: 'new-tool',
  name: 'New Tool',
  icon: 'Wrench',        // Lucide icon name
  type: 'iframe',         // 'internal' for React pages, 'iframe' for external
  path: '/path-to-tool/', // Route or URL
  roles: ['admin', 'owner'],
  badge: 'New',           // Optional badge text
}
```

The module appears in the sidebar automatically with proper role-based access.

## CSV Upload Format

Model metrics CSV (uploaded by Daniela from Infloww):

```csv
model_name,date,revenue,new_subs,messages_revenue,tips,refunds
Lia,2026-02-13,4500,120,2100,350,20
```

Required columns: `model_name`, `date`, `revenue`
Optional columns: `new_subs`, `messages_revenue`, `tips`, `refunds`

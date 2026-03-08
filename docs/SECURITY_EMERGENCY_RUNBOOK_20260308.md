# Security Emergency Runbook (CW Hub)

## 1) Immediate containment (first 10 minutes)

1. Disable public signup in Supabase Auth settings.
2. Disable auto-confirm email in Supabase Auth settings.
3. In Supabase SQL Editor, run:
   - `supabase/migrations/security_lockdown_20260308.sql`
4. Rotate sessions:
   - Revoke refresh tokens / force logout active sessions.
5. Remove or deactivate suspicious users immediately.

## 2) Verify owner/admin integrity

```sql
select id, email, full_name, role, is_active, created_at
from public.profiles
where role in ('owner', 'admin')
order by created_at desc;
```

Confirm each row is expected. Downgrade/remove unknown users.

## 3) Detect suspicious recent accounts

```sql
select id, email, full_name, role, is_active, created_at
from public.profiles
where created_at > now() - interval '7 days'
order by created_at desc;
```

## 4) Validate RLS is enabled and forced

```sql
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Expected for sensitive tables: `rowsecurity = true`, `forcerowsecurity = true`.

## 5) Validate no public/anon execute on critical RPCs

```sql
select n.nspname as schema_name,
       p.proname as function_name,
       p.oid::regprocedure as signature,
       pg_get_userbyid(d.grantee) as grantee,
       d.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join information_schema.role_routine_grants d
  on d.routine_schema = n.nspname
 and d.routine_name = p.proname
where n.nspname = 'public'
  and p.proname in (
    'hub_get_users',
    'hub_set_user_role',
    'hub_set_user_active',
    'hub_link_chatter',
    'save_schedules',
    'generate_invite_code',
    'signup_with_invite',
    'validate_invite_code'
  )
order by p.proname, d.grantee;
```

Expected: no grants for `anon` or `public`.

## 6) Verify blocked data access with a recruit account

Using a low-privilege test account, confirm these endpoints fail with 401/403 or empty:
- `profiles` (other users)
- `models` (if role should not have it)
- `documents` admin-only drafts
- `invite_codes`
- admin RPCs (`hub_get_users`, `hub_set_user_role`, etc.)

## 7) Operational follow-up (same day)

1. Enable alerts for:
   - New `owner` or `admin` assignments
   - Burst signups
   - Repeated invite validation failures
2. Create weekly security review:
   - RLS policy diff check
   - RPC grants check
   - owner/admin membership review

## 8) Fast automated smoke test

Run this command after any security/config change:

```bash
python scripts/security_smoke_check.py
```

Required env vars:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

Optional (recommended):
- `SUPABASE_ACCESS_TOKEN` (lets the script verify Auth settings via Management API)

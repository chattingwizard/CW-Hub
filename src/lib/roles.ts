import type { UserRole } from '../types';

// ── Role Hierarchy (higher = more access) ────────────────────

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 100,
  admin: 90,
  chatter_manager: 80,
  team_leader: 70,
  script_manager: 60,
  personal_assistant: 50,
  va: 40,
  chatter: 30,
  recruit: 10,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  chatter_manager: 'Chatter Manager',
  team_leader: 'Team Leader',
  script_manager: 'Script Manager',
  personal_assistant: 'Personal Assistant',
  va: 'VA',
  chatter: 'Chatter',
  recruit: 'Recruit',
};

export const ALL_ROLES: UserRole[] = [
  'owner', 'admin', 'chatter_manager', 'team_leader',
  'script_manager', 'personal_assistant', 'va', 'chatter', 'recruit',
];

// ── Role Groups ──────────────────────────────────────────────

const MANAGEMENT: UserRole[] = ['owner', 'admin', 'chatter_manager', 'team_leader'];
const LEADERSHIP: UserRole[] = ['owner', 'admin', 'chatter_manager'];
const ALL_STAFF: UserRole[] = ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'personal_assistant', 'va', 'chatter'];

export const ROLE_GROUPS = {
  management: MANAGEMENT,
  leadership: LEADERSHIP,
  allStaff: ALL_STAFF,
} as const;

// ── Permission Checks ────────────────────────────────────────

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

export function isManagement(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function isLeadership(role: UserRole): boolean {
  return LEADERSHIP.includes(role);
}

export function isAdminLevel(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canViewTeamData(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function canEditSchedules(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function canEditAssignments(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function canUploadReports(role: UserRole): boolean {
  return ['owner', 'admin', 'chatter_manager', 'personal_assistant'].includes(role);
}

export function canManageCoaching(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function canViewLiveMonitor(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'owner';
}

// ── Team-scoped access ───────────────────────────────────────
// TLs only see their own team; CHM/admin/owner see all

export function getTeamScope(role: UserRole, teamName: string | null): 'all' | 'team' | 'none' {
  if (isLeadership(role)) return 'all';
  if (role === 'team_leader' && teamName) return 'team';
  if (role === 'chatter') return 'none';
  return 'none';
}

// ── Default Landing Pages ────────────────────────────────────

export function getDefaultPath(role: UserRole): string {
  switch (role) {
    case 'owner':
    case 'admin':
    case 'chatter_manager':
      return '/overview';
    case 'team_leader':
      return '/coaching-queue';
    case 'script_manager':
      return '/model-info';
    case 'personal_assistant':
      return '/upload-center';
    case 'va':
      return '/my-dashboard';
    case 'chatter':
      return '/my-dashboard';
    case 'recruit':
      return '/embed/school';
    default:
      return '/login';
  }
}

// ── Shift ↔ TL Mapping ──────────────────────────────────────

export interface TLShift {
  tl: string;
  teamName: string;
  chatterShift: '00:00-08:00' | '08:00-16:00' | '16:00-00:00';
  tlStart: string;
  tlEnd: string;
  color: string;
  colorClass: string;
}

export const TL_SHIFTS: TLShift[] = [
  {
    tl: 'Huckle',
    teamName: 'Team Huckle',
    chatterShift: '00:00-08:00',
    tlStart: '23:00',
    tlEnd: '07:00',
    color: '#f97316',
    colorClass: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  },
  {
    tl: 'Danilyn',
    teamName: 'Team Danilyn',
    chatterShift: '08:00-16:00',
    tlStart: '07:00',
    tlEnd: '15:00',
    color: '#3b82f6',
    colorClass: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  },
  {
    tl: 'Ezekiel',
    teamName: 'Team Ezekiel',
    chatterShift: '16:00-00:00',
    tlStart: '15:00',
    tlEnd: '23:00',
    color: '#a855f7',
    colorClass: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  },
];

export function getTLForShift(shift: string): TLShift | undefined {
  return TL_SHIFTS.find(t => t.chatterShift === shift);
}

export function getTeamColor(teamName: string): string {
  const tl = TL_SHIFTS.find(t => t.teamName === teamName);
  return tl?.colorClass ?? 'text-zinc-400 bg-zinc-500/15 border-zinc-500/30';
}

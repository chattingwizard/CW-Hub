import type { UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  hiring_manager: 'Hiring Manager',
  team_leader: 'Team Leader',
  script_manager: 'Script Manager',
  va: 'VA',
  chatter: 'Chatter',
  recruit: 'Recruit',
};

export const ALL_ROLES: UserRole[] = [
  'owner', 'admin', 'hiring_manager', 'team_leader',
  'script_manager', 'va', 'chatter', 'recruit',
];

const MANAGEMENT: UserRole[] = ['owner', 'admin', 'team_leader'];
const LEADERSHIP: UserRole[] = ['owner', 'admin', 'hiring_manager'];

export function isManagement(role: UserRole): boolean {
  return MANAGEMENT.includes(role);
}

export function isLeadership(role: UserRole): boolean {
  return LEADERSHIP.includes(role);
}

export function isAdminLevel(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

// ── Default Landing Pages ────────────────────────────────────

export function getDefaultPath(role: UserRole): string {
  switch (role) {
    case 'owner':
    case 'admin':
    case 'team_leader':
      return '/coaching-queue';
    case 'hiring_manager':
      return '/hiring-workflow';
    case 'script_manager':
      return '/model-info';
    case 'va':
      return '/my-dashboard';
    case 'chatter':
      return '/my-dashboard';
    case 'recruit':
      return '/school';
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
  const tl = TL_SHIFTS.find(t => t.teamName === teamName || t.tl === teamName);
  return tl?.colorClass ?? 'text-zinc-400 bg-zinc-500/15 border-zinc-500/30';
}

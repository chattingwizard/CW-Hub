import type { HubModule, UserRole } from '../types';
import { getDefaultPath as getRoleDefaultPath } from './roles';


export const modules: HubModule[] = [
  // ── Main ───────────────────────────────────────────────────
  {
    id: 'overview',
    name: 'Overview',
    icon: 'LayoutDashboard',
    type: 'internal',
    path: '/overview',
    roles: ['owner', 'admin'],
    section: 'main',
  },
  {
    id: 'live-monitor',
    name: 'Live Monitor',
    icon: 'Radio',
    type: 'internal',
    path: '/live-monitor',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
    badge: 'Soon',
    disabled: true,
  },
  {
    id: 'dashboard',
    name: 'Model Metrics',
    icon: 'BarChart3',
    type: 'internal',
    path: '/dashboard',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
  },
  {
    id: 'chatter-performance',
    name: 'Chatter Performance',
    icon: 'Activity',
    type: 'internal',
    path: '/chatter-performance',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
  },
  {
    id: 'infloww-kpis',
    name: 'Infloww KPIs',
    icon: 'BarChart3',
    type: 'internal',
    path: '/infloww-kpis',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
  },
  {
    id: 'schedules',
    name: 'Schedules',
    icon: 'Calendar',
    type: 'internal',
    path: '/schedules',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
  },
  {
    id: 'assignments',
    name: 'Assignments',
    icon: 'Users',
    type: 'internal',
    path: '/assignments',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
  },

  {
    id: 'chatter-score',
    name: 'Chatter Score',
    icon: 'Star',
    type: 'internal',
    path: '/chatter-score',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'main',
  },

  {
    id: 'tasks',
    name: 'Tasks',
    icon: 'CheckSquare',
    type: 'internal',
    path: '/tasks',
    roles: ['owner', 'admin', 'team_leader', 'script_manager', 'va'],
    section: 'main',
  },

  // ── Coaching ───────────────────────────────────────────────
  {
    id: 'coaching-queue',
    name: 'Coaching Queue',
    icon: 'ClipboardCheck',
    type: 'internal',
    path: '/coaching-queue',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'coaching',
    dividerBefore: true,
  },
  {
    id: 'coaching-overview',
    name: 'Coaching Overview',
    icon: 'Shield',
    type: 'internal',
    path: '/coaching-overview',
    roles: ['owner', 'admin'],
    section: 'coaching',
  },
  {
    id: 'coaching-analytics',
    name: 'Coaching Analytics',
    icon: 'BarChart3',
    type: 'internal',
    path: '/coaching-analytics',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'coaching',
  },
  {
    id: 'coaching-workflow',
    name: 'How It Works',
    icon: 'Info',
    type: 'internal',
    path: '/coaching-workflow',
    roles: ['owner', 'admin', 'team_leader'],
    section: 'coaching',
  },

  // ── Tools ──────────────────────────────────────────────────
  {
    id: 'upload-center',
    name: 'Upload Center',
    icon: 'Upload',
    type: 'internal',
    path: '/upload-center',
    roles: ['owner', 'admin', 'script_manager', 'va'],
    section: 'tools',
    dividerBefore: true,
  },
  {
    id: 'model-info',
    name: 'Model Info',
    icon: 'BookOpen',
    type: 'internal',
    path: '/model-info',
    roles: ['owner', 'admin', 'team_leader', 'script_manager', 'chatter'],
    section: 'tools',
  },

  {
    id: 'shift-reports',
    name: 'Shift Reports',
    icon: 'ClipboardList',
    type: 'internal',
    path: '/shift-reports',
    roles: ['owner', 'admin', 'team_leader', 'chatter'],
    section: 'tools',
  },
  {
    id: 'hubstaff-issues',
    name: 'Hubstaff Issues',
    icon: 'Bug',
    type: 'internal',
    path: '/hubstaff-issues',
    roles: ['owner', 'admin', 'chatter'],
    section: 'tools',
  },
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    icon: 'BookMarked',
    type: 'internal',
    path: '/knowledge-base',
    roles: ['owner', 'admin', 'team_leader', 'script_manager', 'va', 'chatter'],
    section: 'tools',
  },

  // ── Chatter Self-service ───────────────────────────────────
  {
    id: 'my-dashboard',
    name: 'My Dashboard',
    icon: 'LayoutDashboard',
    type: 'internal',
    path: '/my-dashboard',
    roles: ['chatter', 'va'],
    section: 'main',
  },

  // ── Scripts ──────────────────────────────────────────────────
  {
    id: 'scripts',
    name: 'Scripts',
    icon: 'FileText',
    type: 'internal',
    path: '/scripts',
    roles: ['owner', 'admin', 'team_leader', 'script_manager', 'chatter'],
    section: 'scripts',
    dividerBefore: true,
  },

  // ── Training ──────────────────────────────────────────────
  {
    id: 'school',
    name: 'Chatting School',
    icon: 'GraduationCap',
    type: 'internal',
    path: '/school',
    roles: ['owner', 'admin', 'team_leader', 'chatter', 'recruit'],
    section: 'training',
    dividerBefore: true,
  },

  // ── System ─────────────────────────────────────────────────
  {
    id: 'settings',
    name: 'Settings',
    icon: 'Settings',
    type: 'internal',
    path: '/settings',
    roles: ['owner'],
    section: 'system',
    dividerBefore: true,
  },
];

export function getModulesForRole(role: UserRole): HubModule[] {
  return modules.filter(m => m.roles.includes(role));
}

export function getDefaultPath(role: UserRole): string {
  return getRoleDefaultPath(role);
}

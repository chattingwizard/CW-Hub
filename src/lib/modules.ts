import type { HubModule, UserRole } from '../types';
import { getDefaultPath as getRoleDefaultPath } from './roles';

const GITHUB_PAGES_BASE = 'https://chattingwizard.github.io';

export const modules: HubModule[] = [
  // ── Main ───────────────────────────────────────────────────
  {
    id: 'overview',
    name: 'Overview',
    icon: 'LayoutDashboard',
    type: 'internal',
    path: '/overview',
    roles: ['owner', 'admin', 'chatter_manager'],
    section: 'main',
  },
  {
    id: 'live-monitor',
    name: 'Live Monitor',
    icon: 'Radio',
    type: 'internal',
    path: '/live-monitor',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
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
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'main',
  },
  {
    id: 'chatter-performance',
    name: 'Chatter Performance',
    icon: 'Activity',
    type: 'internal',
    path: '/chatter-performance',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'main',
  },
  {
    id: 'infloww-kpis',
    name: 'Infloww KPIs',
    icon: 'BarChart3',
    type: 'internal',
    path: '/infloww-kpis',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'main',
  },
  {
    id: 'schedules',
    name: 'Schedules',
    icon: 'Calendar',
    type: 'internal',
    path: '/schedules',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'main',
  },
  {
    id: 'assignments',
    name: 'Assignments',
    icon: 'Users',
    type: 'internal',
    path: '/assignments',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'main',
  },

  {
    id: 'chatter-score',
    name: 'Chatter Score',
    icon: 'Star',
    type: 'internal',
    path: '/chatter-score',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'main',
  },

  {
    id: 'tasks',
    name: 'Tasks',
    icon: 'CheckSquare',
    type: 'internal',
    path: '/tasks',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'va', 'personal_assistant'],
    section: 'main',
  },

  // ── Coaching ───────────────────────────────────────────────
  {
    id: 'coaching-queue',
    name: 'Coaching Queue',
    icon: 'ClipboardCheck',
    type: 'internal',
    path: '/coaching-queue',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader'],
    section: 'coaching',
    dividerBefore: true,
  },
  {
    id: 'coaching-overview',
    name: 'Coaching Overview',
    icon: 'Shield',
    type: 'internal',
    path: '/coaching-overview',
    roles: ['owner', 'admin', 'chatter_manager'],
    section: 'coaching',
  },

  // ── Tools ──────────────────────────────────────────────────
  {
    id: 'upload-center',
    name: 'Upload Center',
    icon: 'Upload',
    type: 'internal',
    path: '/upload-center',
    roles: ['owner', 'admin', 'chatter_manager', 'script_manager', 'va', 'personal_assistant'],
    section: 'tools',
    dividerBefore: true,
  },
  {
    id: 'model-info',
    name: 'Model Info',
    icon: 'BookOpen',
    type: 'internal',
    path: '/model-info',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'chatter'],
    section: 'tools',
  },

  {
    id: 'shift-reports',
    name: 'Shift Reports',
    icon: 'ClipboardList',
    type: 'internal',
    path: '/shift-reports',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader', 'chatter'],
    section: 'tools',
  },
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    icon: 'BookMarked',
    type: 'internal',
    path: '/knowledge-base',
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'va', 'personal_assistant', 'chatter', 'recruit'],
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

  // ── Embedded ───────────────────────────────────────────────
  {
    id: 'school',
    name: 'School',
    icon: 'GraduationCap',
    type: 'iframe',
    path: `${GITHUB_PAGES_BASE}/CW-ChattingSchool/`,
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader', 'chatter', 'recruit'],
    section: 'tools',
    dividerBefore: true,
  },
  {
    id: 'scripts',
    name: 'Scripts',
    icon: 'FileText',
    type: 'iframe',
    path: `${GITHUB_PAGES_BASE}/chattingwizard.github.io/`,
    roles: ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager'],
    section: 'tools',
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

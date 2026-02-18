import type { HubModule } from '../types';

// ============================================================
// Module Registry — Add new modules here
// ============================================================
// To add a new module to the Hub:
// 1. Add an entry below with the right type ('internal' or 'iframe')
// 2. For 'internal': create a React component in src/pages/
// 3. For 'iframe': just provide the full URL — it loads in an iframe
// 4. Set 'roles' to control who sees it
// ============================================================

const GITHUB_PAGES_BASE = 'https://chattingwizard.github.io';

export const modules: HubModule[] = [
  // --- Internal modules (React pages) ---
  {
    id: 'overview',
    name: 'Overview',
    icon: 'LayoutDashboard',
    type: 'internal',
    path: '/overview',
    roles: ['owner', 'admin'],
  },
  {
    id: 'dashboard',
    name: 'Model Metrics',
    icon: 'BarChart3',
    type: 'internal',
    path: '/dashboard',
    roles: ['owner', 'admin'],
  },
  {
    id: 'schedules',
    name: 'Schedules',
    icon: 'Calendar',
    type: 'internal',
    path: '/schedules',
    roles: ['owner', 'admin'],
  },
  {
    id: 'assignments',
    name: 'Assignments',
    icon: 'Users',
    type: 'internal',
    path: '/assignments',
    roles: ['owner', 'admin'],
  },
  {
    id: 'chatter-performance',
    name: 'Chatter Performance',
    icon: 'Activity',
    type: 'internal',
    path: '/chatter-performance',
    roles: ['owner', 'admin'],
  },
  {
    id: 'coaching-queue',
    name: 'Coaching Queue',
    icon: 'ClipboardCheck',
    type: 'internal',
    path: '/coaching-queue',
    roles: ['owner', 'admin'],
  },
  {
    id: 'coaching-overview',
    name: 'Coaching Overview',
    icon: 'Shield',
    type: 'internal',
    path: '/coaching-overview',
    roles: ['owner', 'admin'],
  },
  {
    id: 'my-dashboard',
    name: 'My Dashboard',
    icon: 'LayoutDashboard',
    type: 'internal',
    path: '/my-dashboard',
    roles: ['chatter'],
  },

  // --- Embedded modules (iframes) ---
  {
    id: 'coaching',
    name: 'Coaching',
    icon: 'TrendingUp',
    type: 'iframe',
    path: `${GITHUB_PAGES_BASE}/cw-coaching/`,
    roles: ['owner', 'admin', 'chatter'],
    dividerBefore: true,
  },
  {
    id: 'school',
    name: 'School',
    icon: 'GraduationCap',
    type: 'iframe',
    path: `${GITHUB_PAGES_BASE}/CW-ChattingSchool/`,
    roles: ['owner', 'admin', 'chatter', 'recruit'],
  },
  {
    id: 'scripts',
    name: 'Scripts',
    icon: 'FileText',
    type: 'iframe',
    path: `${GITHUB_PAGES_BASE}/CW-ScriptManager/`,
    roles: ['owner', 'admin'],
    badge: 'Soon',
    disabled: true,
  },

  // --- Settings (owner only) ---
  {
    id: 'settings',
    name: 'Settings',
    icon: 'Settings',
    type: 'internal',
    path: '/settings',
    roles: ['owner'],
    dividerBefore: true,
  },
];

export function getModulesForRole(role: string): HubModule[] {
  return modules.filter((m) => m.roles.includes(role as any));
}

export function getDefaultPath(role: string): string {
  switch (role) {
    case 'owner':
    case 'admin':
      return '/overview';
    case 'chatter':
      return '/my-dashboard';
    case 'recruit':
      return '/embed/school';
    default:
      return '/embed/school';
  }
}

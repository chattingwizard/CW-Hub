import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Date Utilities ───────────────────────────────────────────

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0]!;
}

export function getWeekDates(weekStart: string): Date[] {
  const start = new Date(weekStart + 'T00:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

export function formatDate(date: Date | string, format: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : date;
  if (format === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function getDayName(dayOfWeek: number, format: 'short' | 'long' = 'short'): string {
  const days = format === 'short'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days[dayOfWeek] ?? '';
}

export function getCurrentUTCHour(): number {
  return new Date().getUTCHours();
}

export function getCurrentShift(): '00:00-08:00' | '08:00-16:00' | '16:00-00:00' {
  const hour = getCurrentUTCHour();
  if (hour < 8) return '00:00-08:00';
  if (hour < 16) return '08:00-16:00';
  return '16:00-00:00';
}

export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

// ── Shift Constants ──────────────────────────────────────────

export const SHIFTS = ['00:00-08:00', '08:00-16:00', '16:00-00:00'] as const;

export const SHIFT_LABELS: Record<string, string> = {
  '00:00-08:00': 'Night · 00–08 UTC',
  '08:00-16:00': 'Day · 08–16 UTC',
  '16:00-00:00': 'Evening · 16–00 UTC',
};

export const SHIFT_LABELS_SHORT: Record<string, string> = {
  '00:00-08:00': '00–08',
  '08:00-16:00': '08–16',
  '16:00-00:00': '16–00',
};

// ── Status Colors ────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  Live: 'bg-success-muted text-success',
  'On Hold': 'bg-warning-muted text-warning',
  Dead: 'bg-danger-muted text-danger',
  'Pending Invoice': 'bg-cw-muted text-cw',
  Active: 'bg-success-muted text-success',
  Probation: 'bg-warning-muted text-warning',
  Dropped: 'bg-surface-3 text-text-muted',
  Fired: 'bg-danger-muted text-danger',
};

export const ONLINE_STATUS_COLORS: Record<string, string> = {
  online: 'bg-online',
  on_break: 'bg-on-break',
  offline: 'bg-offline',
  absent: 'bg-absent',
};

// Re-export for backward compatibility with existing pages
export { getTeamColor, TL_SHIFTS } from './roles';

export const TEAM_COLORS: Record<string, string> = {
  'Team Danilyn': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Team Huckle': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'Team Ezekiel': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

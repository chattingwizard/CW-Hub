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

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split('T')[0]!;
}

export function getWeekDates(weekStart: string): Date[] {
  const start = new Date(weekStart + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function formatDate(date: Date | string, format: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  if (format === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function getDayName(dayOfWeek: number, format: 'short' | 'long' = 'short'): string {
  const days = format === 'short'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days[dayOfWeek] ?? '';
}

export const SHIFTS = ['00:00-08:00', '08:00-16:00', '16:00-00:00'] as const;

export const SHIFT_LABELS: Record<string, string> = {
  '00:00-08:00': '00:00 – 08:00 UTC',
  '08:00-16:00': '08:00 – 16:00 UTC',
  '16:00-00:00': '16:00 – 00:00 UTC',
};

export const STATUS_COLORS: Record<string, string> = {
  Live: 'bg-success/20 text-success',
  'On Hold': 'bg-warning/20 text-warning',
  Dead: 'bg-danger/20 text-danger',
  'Pending Invoice': 'bg-cw/20 text-cw',
  Active: 'bg-success/20 text-success',
  Probation: 'bg-warning/20 text-warning',
  Dropped: 'bg-text-muted/20 text-text-muted',
  Fired: 'bg-danger/20 text-danger',
};

export const TEAM_COLORS: Record<string, string> = {
  'Team Danilyn': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Team Huckle': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Team Ezekiel': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

import type { ScoreConfig, ScoreStatus, ScoreWeeklyReport } from '../types';

export function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function parseWeekKey(weekKey: string): { year: number; week: number } {
  const [yearStr, weekStr] = weekKey.split('-W');
  return { year: parseInt(yearStr, 10), week: parseInt(weekStr, 10) };
}

export function weekKeyToMonday(weekKey: string): Date {
  const { year, week } = parseWeekKey(weekKey);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

export function getWeekLabel(weekKey: string): string {
  const { week } = parseWeekKey(weekKey);
  const monday = weekKeyToMonday(weekKey);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `Week ${week} · ${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`;
}

export function getPreviousWeekKey(weekKey: string): string {
  const monday = weekKeyToMonday(weekKey);
  monday.setDate(monday.getDate() - 7);
  return getWeekKey(monday);
}

export function getNextWeekKey(weekKey: string): string {
  const monday = weekKeyToMonday(weekKey);
  monday.setDate(monday.getDate() + 7);
  return getWeekKey(monday);
}

export function calculateWeeklyReportPoints(
  report: Pick<ScoreWeeklyReport, 'reply_time_bucket' | 'no_shift_incidence' | 'all_reports_sent'> | null,
  config: ScoreConfig,
): number {
  if (!report) return 0;
  let pts = 0;

  if (report.reply_time_bucket && config.reply_time_points) {
    pts += config.reply_time_points[report.reply_time_bucket] ?? 0;
  }
  if (report.no_shift_incidence) pts += config.no_shift_incidence_pts;
  if (report.all_reports_sent) pts += config.all_reports_sent_pts;

  return pts;
}

export function calculateStatus(total: number, config: ScoreConfig): ScoreStatus {
  if (total >= config.tier_20_threshold) return 'bonus_20';
  if (total >= config.tier_10_threshold) return 'bonus_10';
  if (total >= config.tier_5_threshold) return 'bonus_5';
  if (total >= config.warning_threshold) return 'no_bonus';
  return 'warning';
}

export function getBonusAmount(total: number, config: ScoreConfig): number {
  if (total >= config.tier_20_threshold) return Number(config.tier_20_amount);
  if (total >= config.tier_10_threshold) return Number(config.tier_10_amount);
  if (total >= config.tier_5_threshold) return Number(config.tier_5_amount);
  return 0;
}

export function getStatusBadge(status: ScoreStatus): { label: string; colorClass: string } {
  switch (status) {
    case 'bonus_20':
      return { label: '$20 Bonus', colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
    case 'bonus_10':
      return { label: '$10 Bonus', colorClass: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
    case 'bonus_5':
      return { label: '$5 Bonus', colorClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' };
    case 'no_bonus':
      return { label: 'No Bonus', colorClass: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' };
    case 'warning':
      return { label: 'Warning', colorClass: 'bg-red-500/15 text-red-400 border-red-500/20' };
  }
}

export function getScoreColor(total: number, config: ScoreConfig): string {
  if (total >= config.tier_20_threshold) return 'text-emerald-400';
  if (total >= config.tier_10_threshold) return 'text-blue-400';
  if (total >= config.tier_5_threshold) return 'text-cyan-400';
  if (total >= config.warning_threshold) return 'text-zinc-400';
  return 'text-red-400';
}

export function getProgressPercent(total: number, config: ScoreConfig): number {
  const max = config.tier_20_threshold + 10;
  return Math.min(100, Math.max(0, (total / max) * 100));
}

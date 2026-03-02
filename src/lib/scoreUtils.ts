import type { ScoreConfig, ScoreStatus, ScoreWeeklyReport, KPIRules, KPIRule } from '../types';

// ── Week key helpers ────────────────────────────────────────

export function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
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
  const parts = weekKey.split('-W');
  return { year: parseInt(parts[0] ?? '0', 10), week: parseInt(parts[1] ?? '0', 10) };
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

// ── Weekly report points (legacy manual system) ─────────────

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

// ── Tier system (Diamond → Platinum → Gold → Silver → Neutral → Bronze) ─

const SILVER_THRESHOLD_DEFAULT = 110;
const SILVER_AMOUNT_DEFAULT = 5;

function silverThreshold(config: ScoreConfig): number {
  return config.silver_threshold ?? SILVER_THRESHOLD_DEFAULT;
}

export function calculateStatus(total: number, config: ScoreConfig): ScoreStatus {
  if (total >= config.tier_20_threshold) return 'diamond';
  if (total >= config.tier_10_threshold) return 'platinum';
  if (total >= config.tier_5_threshold) return 'gold';
  if (total >= silverThreshold(config)) return 'silver';
  if (total >= config.warning_threshold) return 'neutral';
  return 'bronze';
}

export function getBonusAmount(total: number, config: ScoreConfig): number {
  if (total >= config.tier_20_threshold) return Number(config.tier_20_amount);
  if (total >= config.tier_10_threshold) return Number(config.tier_10_amount);
  if (total >= config.tier_5_threshold) return Number(config.tier_5_amount);
  if (total >= silverThreshold(config)) return Number(config.silver_amount ?? SILVER_AMOUNT_DEFAULT);
  return 0;
}

export function getStatusBadge(status: ScoreStatus): { label: string; colorClass: string } {
  switch (status) {
    case 'diamond':
      return { label: 'Diamond', colorClass: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/20' };
    case 'platinum':
      return { label: 'Platinum', colorClass: 'bg-violet-500/15 text-violet-400 border-violet-500/20' };
    case 'gold':
      return { label: 'Gold', colorClass: 'bg-amber-500/15 text-amber-400 border-amber-500/20' };
    case 'silver':
      return { label: 'Silver', colorClass: 'bg-slate-400/15 text-slate-300 border-slate-400/20' };
    case 'neutral':
      return { label: 'Neutral', colorClass: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' };
    case 'bronze':
      return { label: 'Bronze', colorClass: 'bg-red-500/15 text-red-400 border-red-500/20' };
  }
}

export function getScoreColor(total: number, config: ScoreConfig): string {
  if (total >= config.tier_20_threshold) return 'text-cyan-300';
  if (total >= config.tier_10_threshold) return 'text-violet-400';
  if (total >= config.tier_5_threshold) return 'text-amber-400';
  if (total >= silverThreshold(config)) return 'text-slate-300';
  if (total >= config.warning_threshold) return 'text-zinc-400';
  return 'text-red-400';
}

export function getProgressPercent(total: number, config: ScoreConfig): number {
  const max = config.tier_20_threshold + 10;
  return Math.min(100, Math.max(0, (total / max) * 100));
}

// ── KPI scoring rules ───────────────────────────────────────

export function parseResponseTime(val: string | null | undefined): number {
  if (val == null || val === '' || val === '-') return NaN;
  const s = val.trim();
  const mSec = s.match(/^(\d+)m\s*(\d+)\s*s$/i);
  if (mSec) return parseInt(mSec[1]!) * 60 + parseInt(mSec[2]!);
  const mOnly = s.match(/^(\d+)m$/i);
  if (mOnly) return parseInt(mOnly[1]!) * 60;
  const sOnly = s.match(/^(\d+)\s*s$/i);
  if (sOnly) return parseInt(sOnly[1]!);
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return parseInt(hms[1]!) * 3600 + parseInt(hms[2]!) * 60 + parseInt(hms[3]!);
  const ms = s.match(/^(\d+):(\d{2})$/);
  if (ms) return parseInt(ms[1]!) * 60 + parseInt(ms[2]!);
  const n = parseFloat(String(val).replace(/,/g, '.'));
  return isNaN(n) ? NaN : n;
}

export function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  if (m === 0) return `${r}s`;
  if (r === 0) return `${m}m`;
  return `${m}m ${r}s`;
}

export const DEFAULT_KPI_RULES: KPIRules = {
  golden_ratio: { t1: { threshold: 5, pts: 20 }, t2: { threshold: 4, pts: 10 }, t3: { threshold: 3, pts: 0 }, below_pts: -20 },
  fan_cvr:      { t1: { threshold: 10, pts: 20 }, t2: { threshold: 8, pts: 10 }, t3: { threshold: 6, pts: 0 }, below_pts: -15 },
  unlock_rate:  { t1: { threshold: 45, pts: 20 }, t2: { threshold: 40, pts: 10 }, t3: { threshold: 35, pts: 0 }, below_pts: -15 },
  reply_time:   { t1: { threshold: 60, pts: 20 }, t2: { threshold: 120, pts: 10 }, t3: { threshold: 180, pts: 0 }, below_pts: -20 },
};

export function getKPIRules(config: ScoreConfig): KPIRules {
  return config.kpi_rules ?? DEFAULT_KPI_RULES;
}

function scoreByRule(value: number, rule: KPIRule, invert = false): number {
  if (isNaN(value)) return 0;
  if (invert) {
    if (value <= rule.t1.threshold) return rule.t1.pts;
    if (value <= rule.t2.threshold) return rule.t2.pts;
    if (value <= rule.t3.threshold) return rule.t3.pts;
  } else {
    if (value >= rule.t1.threshold) return rule.t1.pts;
    if (value >= rule.t2.threshold) return rule.t2.pts;
    if (value >= rule.t3.threshold) return rule.t3.pts;
  }
  return rule.below_pts;
}

export function scoreGoldenRatio(gr: number, config?: ScoreConfig): number {
  const rules = config ? getKPIRules(config) : DEFAULT_KPI_RULES;
  return scoreByRule(gr, rules.golden_ratio);
}

export function scoreFanCVR(cvr: number, config?: ScoreConfig): number {
  const rules = config ? getKPIRules(config) : DEFAULT_KPI_RULES;
  return scoreByRule(cvr, rules.fan_cvr);
}

export function scoreUnlockRate(ur: number, config?: ScoreConfig): number {
  const rules = config ? getKPIRules(config) : DEFAULT_KPI_RULES;
  return scoreByRule(ur, rules.unlock_rate);
}

export function scoreReplyTime(seconds: number, config?: ScoreConfig): number {
  const rules = config ? getKPIRules(config) : DEFAULT_KPI_RULES;
  return scoreByRule(seconds, rules.reply_time, true);
}

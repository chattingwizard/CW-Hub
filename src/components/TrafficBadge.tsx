import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import type { ModelTraffic, TeamTraffic, TrafficLevel, PageType } from '../types';

// ─── Page Type Styles ────────────────────────────────────────
const PAGE_TYPE_CONFIG: Record<string, { label: string; abbr: string; bg: string; text: string; border: string }> = {
  'Free Page': { label: 'Free', abbr: 'F', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Paid Page': { label: 'Paid', abbr: 'P', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  'Mixed':     { label: 'Mix',  abbr: 'M', bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
};

const DEFAULT_PT = { label: '?', abbr: '?', bg: 'bg-surface-2', text: 'text-text-muted', border: 'border-border' };

export function PageTypeBadge({ pageType, size = 'sm' }: { pageType: PageType; size?: 'sm' | 'md' }) {
  const cfg = PAGE_TYPE_CONFIG[pageType ?? ''] ?? DEFAULT_PT;
  if (size === 'sm') {
    return (
      <span className={`text-[9px] font-bold px-1 py-px rounded ${cfg.bg} ${cfg.text}`} title={`${cfg.label} account`}>
        {cfg.abbr}
      </span>
    );
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

// ─── Workload % color helpers ────────────────────────────────
function getWorkloadColor(pct: number): string {
  if (pct >= 70) return 'text-orange-400';
  if (pct >= 30) return 'text-cw';
  if (pct > 0)  return 'text-slate-400';
  return 'text-text-muted';
}

function getWorkloadBarColor(pct: number): string {
  if (pct >= 70) return 'bg-orange-500';
  if (pct >= 30) return 'bg-cw';
  if (pct > 0)  return 'bg-slate-500';
  return 'bg-surface-2';
}

function getCapacityColor(pct: number): { text: string; bg: string } {
  if (pct >= 110) return { text: 'text-danger', bg: 'bg-danger/15' };
  if (pct >= 85)  return { text: 'text-success', bg: 'bg-success/15' };
  if (pct >= 60)  return { text: 'text-warning', bg: 'bg-warning/15' };
  return { text: 'text-slate-400', bg: 'bg-slate-500/15' };
}

// ─── Traffic Level Styles (kept for backward compat) ─────────
const LEVEL_STYLES: Record<TrafficLevel, { bg: string; text: string; bar: string }> = {
  high:   { bg: 'bg-orange-500/15', text: 'text-orange-400', bar: 'bg-orange-500' },
  medium: { bg: 'bg-cw/15',         text: 'text-cw',         bar: 'bg-cw' },
  low:    { bg: 'bg-slate-500/15',   text: 'text-slate-400', bar: 'bg-slate-500' },
  none:   { bg: 'bg-surface-2',     text: 'text-text-muted', bar: 'bg-surface-2' },
};

// ─── TrafficBadge — per-model indicator with % ───────────────
interface TrafficBadgeProps {
  traffic: ModelTraffic | undefined;
  size?: 'sm' | 'md';
  showBar?: boolean;
  showTrend?: boolean;
  showType?: boolean;
  maxValue?: number;
}

export default function TrafficBadge({
  traffic,
  size = 'sm',
  showBar = true,
  showTrend = false,
  showType = true,
}: TrafficBadgeProps) {
  if (!traffic || traffic.workload_pct <= 0) {
    return (
      <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
        No data
      </span>
    );
  }

  const pct = traffic.workload_pct;
  const barColor = getWorkloadBarColor(pct);
  const textColor = getWorkloadColor(pct);

  const TrendIcon =
    traffic.trend === 'up' ? TrendingUp : traffic.trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    traffic.trend === 'up' ? 'text-green-400' : traffic.trend === 'down' ? 'text-red-400' : 'text-text-muted';

  if (size === 'sm') {
    return (
      <div
        className="inline-flex items-center gap-1 group relative"
        title={`${pct}% workload (${traffic.new_fans_avg} fans/day × ${traffic.page_type ?? 'Unknown'} weight) | ${traffic.chatters_assigned} chatters | ${traffic.active_fans.toLocaleString()} active fans`}
      >
        {showType && <PageTypeBadge pageType={traffic.page_type} size="sm" />}
        {showBar && (
          <div className="w-10 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
        <span className={`text-[10px] font-semibold ${textColor}`}>
          {pct}%
        </span>
        {showTrend && traffic.trend !== 'stable' && (
          <TrendIcon className={`w-2.5 h-2.5 ${trendColor}`} />
        )}
      </div>
    );
  }

  // Medium size — more detail
  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${LEVEL_STYLES[traffic.level].bg}`}
      title={`${pct}% workload | ${traffic.new_fans_avg} fans/day (${traffic.page_type ?? 'Unknown'}) | $${traffic.earnings_per_day}/day`}
    >
      {showType && <PageTypeBadge pageType={traffic.page_type} size="md" />}
      {showBar && (
        <div className="w-12 h-2 bg-black/20 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
      <span className={`text-xs font-bold ${textColor}`}>
        {pct}%
      </span>
      {showTrend && (
        <div className={`flex items-center gap-0.5 ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          {traffic.trend_pct !== 0 && (
            <span className="text-[10px]">{traffic.trend_pct > 0 ? '+' : ''}{traffic.trend_pct}%</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WorkloadPctBadge — standalone % badge with color ────────
export function WorkloadPctBadge({ pct, label }: { pct: number; label?: string }) {
  const cap = getCapacityColor(pct);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cap.bg} ${cap.text}`}>
      {pct}%{label && <span className="font-normal text-[10px] opacity-75">{label}</span>}
    </span>
  );
}

// ─── TeamTrafficBar — team workload with % ───────────────────
export function TeamTrafficBar({
  team,
  maxWorkloadPct,
}: {
  team: TeamTraffic;
  maxWorkloadPct?: number;
}) {
  const barMax = maxWorkloadPct ?? team.total_workload_pct;
  const barWidth = barMax > 0 ? Math.min(100, (team.total_workload_pct / barMax) * 100) : 0;
  const capacityColor = getCapacityColor(team.workload_pct_per_chatter);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary font-medium">{team.team_name}</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">
            <Users size={10} className="inline mr-0.5 -mt-0.5" />{team.chatter_count}
          </span>
          <span className={`text-xs font-bold ${capacityColor.text}`}>
            {team.workload_pct_per_chatter}%
          </span>
          <span className="text-[10px] text-text-muted">/chatter</span>
        </div>
      </div>
      {/* Workload bar */}
      <div className="h-3 bg-surface-2 rounded-full overflow-hidden relative">
        <div
          className={`h-full transition-all duration-500 rounded-l-full ${getWorkloadBarColor(team.workload_pct_per_chatter)}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {/* Type composition + total */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-muted">{team.model_count} models:</span>
        <div className="flex gap-1">
          {team.free_count > 0 && (
            <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-400">{team.free_count}F</span>
          )}
          {team.paid_count > 0 && (
            <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400">{team.paid_count}P</span>
          )}
          {team.mixed_count > 0 && (
            <span className="text-[9px] px-1 rounded bg-purple-500/15 text-purple-400">{team.mixed_count}M</span>
          )}
        </div>
        <span className="text-[9px] text-text-muted ml-auto">
          Team total: {team.total_workload_pct}%
        </span>
      </div>
    </div>
  );
}

// ─── ModelTrafficRow — detailed row for ranking tables ────────
export function ModelTrafficRow({
  traffic,
  rank,
}: {
  traffic: ModelTraffic;
  rank: number;
  maxWorkload?: number;
}) {
  const pct = traffic.workload_pct;
  const barColor = getWorkloadBarColor(pct);
  const textColor = getWorkloadColor(pct);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[10px] text-text-muted w-4 text-right shrink-0">{rank}</span>
      <PageTypeBadge pageType={traffic.page_type} size="sm" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white truncate block">{traffic.model_name}</span>
      </div>
      <div className="w-20 h-2 bg-surface-2 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-right min-w-[50px] shrink-0">
        <span className={`text-xs font-bold ${textColor}`}>{pct}%</span>
      </div>
      <div className="text-right min-w-[60px] shrink-0">
        <span className="text-[10px] text-text-muted">{Math.round(traffic.new_fans_avg)} fans/d</span>
      </div>
    </div>
  );
}

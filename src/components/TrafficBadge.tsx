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

// ─── Traffic Level Styles ────────────────────────────────────
const LEVEL_STYLES: Record<TrafficLevel, { bg: string; text: string; bar: string }> = {
  high:   { bg: 'bg-orange-500/15', text: 'text-orange-400', bar: 'bg-orange-500' },
  medium: { bg: 'bg-cw/15',         text: 'text-cw',         bar: 'bg-cw' },
  low:    { bg: 'bg-slate-500/15',   text: 'text-slate-400', bar: 'bg-slate-500' },
  none:   { bg: 'bg-surface-2',     text: 'text-text-muted', bar: 'bg-surface-2' },
};

// ─── TrafficBadge — per-model indicator ──────────────────────
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
  maxValue,
}: TrafficBadgeProps) {
  if (!traffic || traffic.level === 'none') {
    return (
      <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
        No data
      </span>
    );
  }

  const style = LEVEL_STYLES[traffic.level];
  const barWidth = maxValue && maxValue > 0
    ? Math.min(100, Math.max(5, (traffic.workload / maxValue) * 100))
    : 50;

  const TrendIcon =
    traffic.trend === 'up' ? TrendingUp : traffic.trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    traffic.trend === 'up' ? 'text-green-400' : traffic.trend === 'down' ? 'text-red-400' : 'text-text-muted';

  if (size === 'sm') {
    return (
      <div
        className="inline-flex items-center gap-1 group relative"
        title={`${traffic.new_fans_avg} fans/day (${traffic.page_type ?? 'Unknown'}) | Workload: ${traffic.workload} | ${traffic.chatters_assigned} chatters | ${traffic.active_fans.toLocaleString()} active`}
      >
        {showType && <PageTypeBadge pageType={traffic.page_type} size="sm" />}
        {showBar && (
          <div className="w-8 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${barWidth}%` }} />
          </div>
        )}
        <span className={`text-[10px] font-medium ${style.text}`}>
          {Math.round(traffic.new_fans_avg)}
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
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${style.bg}`}
      title={`${traffic.new_fans_avg} fans/day (${traffic.page_type ?? 'Unknown'}) | Workload: ${traffic.workload} | ${traffic.chatters_assigned} chatters | $${traffic.earnings_per_day}/day`}
    >
      {showType && <PageTypeBadge pageType={traffic.page_type} size="md" />}
      {showBar && (
        <div className="w-12 h-2 bg-black/20 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${barWidth}%` }} />
        </div>
      )}
      <span className={`text-xs font-semibold ${style.text}`}>
        {Math.round(traffic.new_fans_avg)}/d
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

// ─── TeamTrafficBar — team workload comparison ───────────────
export function TeamTrafficBar({
  team,
  maxWorkload,
}: {
  team: TeamTraffic;
  maxWorkload: number;
}) {
  const barWidth = maxWorkload > 0 ? Math.min(100, (team.total_workload / maxWorkload) * 100) : 0;
  const freeRatio = team.model_count > 0 ? team.free_count / team.model_count : 0;
  const paidRatio = team.model_count > 0 ? team.paid_count / team.model_count : 0;
  const mixedRatio = team.model_count > 0 ? team.mixed_count / team.model_count : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary font-medium">{team.team_name}</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">
            <Users size={10} className="inline mr-0.5 -mt-0.5" />{team.chatter_count}
          </span>
          <span className="text-xs font-semibold text-white">{Math.round(team.total_workload)}</span>
          <span className="text-[10px] text-text-muted">
            ({Math.round(team.workload_per_chatter)}/chatter)
          </span>
        </div>
      </div>
      {/* Workload bar */}
      <div className="h-3 bg-surface-2 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-cw transition-all duration-500 rounded-l-full"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {/* Type composition dots */}
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
          {Math.round(team.total_new_fans_avg)} fans/d raw
        </span>
      </div>
    </div>
  );
}

// ─── ModelTrafficRow — detailed row for ranking tables ───────
export function ModelTrafficRow({
  traffic,
  rank,
  maxWorkload,
}: {
  traffic: ModelTraffic;
  rank: number;
  maxWorkload: number;
}) {
  const style = LEVEL_STYLES[traffic.level];
  const barWidth = maxWorkload > 0 ? Math.min(100, (traffic.workload / maxWorkload) * 100) : 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[10px] text-text-muted w-4 text-right shrink-0">{rank}</span>
      <PageTypeBadge pageType={traffic.page_type} size="sm" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white truncate block">{traffic.model_name}</span>
      </div>
      <div className="w-20 h-2 bg-surface-2 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="text-right min-w-[80px] shrink-0">
        <span className={`text-xs font-semibold ${style.text}`}>{Math.round(traffic.new_fans_avg)}</span>
        <span className="text-[10px] text-text-muted ml-0.5">fans/d</span>
      </div>
      <div className="text-right min-w-[55px] shrink-0">
        <span className="text-[10px] text-text-muted">wl </span>
        <span className={`text-[11px] font-semibold ${style.text}`}>{Math.round(traffic.workload)}</span>
      </div>
    </div>
  );
}

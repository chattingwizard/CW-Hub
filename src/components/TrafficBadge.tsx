import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ModelTraffic, TrafficLevel } from '../types';

interface TrafficBadgeProps {
  traffic: ModelTraffic | undefined;
  size?: 'sm' | 'md';
  showBar?: boolean;
  showTrend?: boolean;
  maxValue?: number;
}

const LEVEL_STYLES: Record<TrafficLevel, { bg: string; text: string; bar: string }> = {
  high: { bg: 'bg-orange-500/15', text: 'text-orange-400', bar: 'bg-orange-500' },
  medium: { bg: 'bg-cw/15', text: 'text-cw', bar: 'bg-cw' },
  low: { bg: 'bg-slate-500/15', text: 'text-slate-400', bar: 'bg-slate-500' },
  none: { bg: 'bg-surface-2', text: 'text-text-muted', bar: 'bg-surface-2' },
};

export default function TrafficBadge({
  traffic,
  size = 'sm',
  showBar = true,
  showTrend = false,
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
    ? Math.min(100, Math.max(5, (traffic.new_fans_avg / maxValue) * 100))
    : 50;

  const TrendIcon =
    traffic.trend === 'up' ? TrendingUp : traffic.trend === 'down' ? TrendingDown : Minus;

  const trendColor =
    traffic.trend === 'up'
      ? 'text-green-400'
      : traffic.trend === 'down'
        ? 'text-red-400'
        : 'text-text-muted';

  if (size === 'sm') {
    return (
      <div
        className="inline-flex items-center gap-1.5 group relative"
        title={`${traffic.new_fans_avg} new fans/day avg | ${traffic.active_fans} active | ${traffic.chatters_assigned} chatters | ${traffic.trend_pct > 0 ? '+' : ''}${traffic.trend_pct}% trend`}
      >
        {showBar && (
          <div className="w-10 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${style.bar}`}
              style={{ width: `${barWidth}%` }}
            />
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

  // Medium size
  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${style.bg}`}
      title={`${traffic.new_fans_avg} new fans/day avg | ${traffic.active_fans} active fans | ${traffic.chatters_assigned} chatters assigned | ${traffic.fans_per_chatter} fans/chatter | ${traffic.trend_pct > 0 ? '+' : ''}${traffic.trend_pct}% trend`}
    >
      {showBar && (
        <div className="w-14 h-2 bg-black/20 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${style.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      )}
      <span className={`text-xs font-semibold ${style.text}`}>
        {Math.round(traffic.new_fans_avg)}/day
      </span>
      {showTrend && (
        <div className={`flex items-center gap-0.5 ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          <span className="text-[10px]">
            {traffic.trend_pct > 0 ? '+' : ''}
            {traffic.trend_pct}%
          </span>
        </div>
      )}
    </div>
  );
}

// Compact traffic label for team summaries
export function TeamTrafficBar({
  teamName,
  totalFans,
  chatters,
  maxFans,
}: {
  teamName: string;
  totalFans: number;
  chatters: number;
  maxFans: number;
}) {
  const barWidth = maxFans > 0 ? Math.min(100, (totalFans / maxFans) * 100) : 0;
  const perChatter = chatters > 0 ? Math.round(totalFans / chatters) : totalFans;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-24 truncate">{teamName}</span>
      <div className="flex-1 h-3 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-cw transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="text-right min-w-[90px]">
        <span className="text-xs font-semibold text-text-primary">{Math.round(totalFans)}</span>
        <span className="text-[10px] text-text-muted ml-1">
          ({perChatter}/chatter)
        </span>
      </div>
    </div>
  );
}

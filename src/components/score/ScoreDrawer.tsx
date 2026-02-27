import { getWeekLabel, getStatusBadge, getScoreColor, getProgressPercent } from '../../lib/scoreUtils';
import type { ScoreConfig, ScoreEvent, ChatterWeeklyScore } from '../../types';
import { X, Plus, Star, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  chatterId: string;
  weekKey: string;
  config: ScoreConfig;
  scores: ChatterWeeklyScore[];
  events: ScoreEvent[];
  onClose: () => void;
  onLogEvent: () => void;
}

export default function ScoreDrawer({ chatterId, weekKey, config, scores, events, onClose, onLogEvent }: Props) {
  const score = scores.find(s => s.chatter_id === chatterId);
  if (!score) return null;

  const badge = getStatusBadge(score.status);
  const progress = getProgressPercent(score.total, config);
  const chatterEvents = events
    .filter(e => e.chatter_id === chatterId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const silverTh = config.silver_threshold ?? 110;
  const tiers = [
    { label: '$5', threshold: silverTh, color: 'bg-slate-400' },
    { label: '$10', threshold: config.tier_5_threshold, color: 'bg-amber-400' },
    { label: '$15', threshold: config.tier_10_threshold, color: 'bg-violet-400' },
    { label: '$20', threshold: config.tier_20_threshold, color: 'bg-cyan-400' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-surface-1 border-l border-border z-50 flex flex-col animate-slide-in-right shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cw/15 flex items-center justify-center ring-1 ring-cw/20">
              <span className="text-cw text-sm font-bold">
                {score.chatter_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">{score.chatter_name}</h3>
              <p className="text-[10px] text-text-muted">
                <span className={
                  score.team_name?.includes('Huckle') ? 'text-orange-400' :
                  score.team_name?.includes('Danilyn') ? 'text-blue-400' :
                  score.team_name?.includes('Ezekiel') ? 'text-purple-400' : ''
                }>{score.team_name ?? 'No team'}</span> · {getWeekLabel(weekKey)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Big score */}
          <div className="text-center py-3">
            <div className={`text-5xl font-extrabold ${getScoreColor(score.total, config)}`}>
              {score.total}
            </div>
            <div className="mt-1.5">
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${badge.colorClass}`}>
                {badge.label}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="relative h-3 bg-surface-3 rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                  score.status === 'bronze' ? 'bg-red-500' :
                  score.status === 'neutral' ? 'bg-zinc-500' :
                  score.status === 'silver' ? 'bg-slate-400' :
                  score.status === 'gold' ? 'bg-amber-400' :
                  score.status === 'platinum' ? 'bg-violet-400' : 'bg-cyan-400'
                }`}
                style={{ width: `${progress}%` }}
              />
              {/* Tier markers */}
              {tiers.map(tier => {
                const pct = (tier.threshold / (config.tier_20_threshold + 10)) * 100;
                return (
                  <div
                    key={tier.label}
                    className="absolute top-0 h-full w-px bg-white/20"
                    style={{ left: `${pct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-text-muted">
              <span>0</span>
              {tiers.map(tier => (
                <span key={tier.label}>{tier.threshold} ({tier.label})</span>
              ))}
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-surface-2 rounded-xl border border-border p-3 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Breakdown</h4>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Base Score</span>
              <span className="font-medium text-text-primary">{score.base_score}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Event Points</span>
              <span className={`font-medium ${score.event_points > 0 ? 'text-emerald-400' : score.event_points < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                {score.event_points > 0 ? '+' : ''}{score.event_points}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Weekly Report</span>
              <span className={`font-medium ${score.weekly_report_points > 0 ? 'text-emerald-400' : 'text-text-muted'}`}>
                {score.weekly_report_points > 0 ? '+' : ''}{score.weekly_report_points}
              </span>
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-text-primary">Total</span>
              <span className={`font-bold ${getScoreColor(score.total, config)}`}>{score.total}</span>
            </div>
          </div>

          {/* Weekly Report summary */}
          {score.weekly_report && (
            <div className="bg-surface-2 rounded-xl border border-border p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Weekly Report</h4>
              <div className="space-y-1.5 text-xs">
                {score.weekly_report.reply_time_bucket && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Reply Time</span>
                    <span className="text-text-primary font-medium">{score.weekly_report.reply_time_bucket}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-secondary">No Shift Incidence</span>
                  <span className={score.weekly_report.no_shift_incidence ? 'text-emerald-400' : 'text-text-muted'}>
                    {score.weekly_report.no_shift_incidence ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">All Reports Sent</span>
                  <span className={score.weekly_report.all_reports_sent ? 'text-emerald-400' : 'text-text-muted'}>
                    {score.weekly_report.all_reports_sent ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Event history */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Event History</h4>
            {chatterEvents.length === 0 ? (
              <p className="text-xs text-text-muted py-3 text-center">No events this week</p>
            ) : (
              <div className="space-y-1.5">
                {chatterEvents.map(ev => (
                  <div key={ev.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-border">
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                      ev.points > 0 ? 'bg-emerald-500/15' : ev.points < 0 ? 'bg-red-500/15' : 'bg-zinc-500/15'
                    }`}>
                      {ev.points > 0 ? <TrendingUp size={11} className="text-emerald-400" /> :
                       ev.points < 0 ? <TrendingDown size={11} className="text-red-400" /> :
                       <Minus size={11} className="text-zinc-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-text-primary truncate">
                        {ev.event_type?.name ?? 'Event'}
                      </p>
                      <p className="text-[9px] text-text-muted">{ev.date}{ev.notes ? ` · ${ev.notes}` : ''}</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${
                      ev.points > 0 ? 'text-emerald-400' : ev.points < 0 ? 'text-red-400' : 'text-text-muted'
                    }`}>
                      {ev.points > 0 ? '+' : ''}{ev.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border p-4 shrink-0 flex gap-2">
          <button
            onClick={onLogEvent}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-cw text-white text-xs font-medium hover:bg-cw/90 transition-all"
          >
            <Plus size={13} />
            Add Event
          </button>
        </div>
      </div>
    </>
  );
}

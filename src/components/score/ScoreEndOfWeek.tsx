import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import {
  weekKeyToMonday, parseResponseTime, formatSeconds,
  scoreGoldenRatio, scoreFanCVR, scoreUnlockRate, scoreReplyTime,
  calculateStatus, getBonusAmount, getStatusBadge, getKPIRules,
} from '../../lib/scoreUtils';
import type { Chatter, ScoreEvent, ScoreEventType, ChatterDailyStat, ChatterWeeklyScore, ScoreConfig } from '../../types';
import { Gift, Check, X, AlertTriangle, Undo2, Info } from 'lucide-react';

interface Props {
  weekKey: string;
  chatters: Chatter[];
  events: ScoreEvent[];
  eventTypes: ScoreEventType[];
  scores: ChatterWeeklyScore[];
  config: ScoreConfig;
  onDataChange: () => void;
}

const REPORTS_PTS = 5;
const NO_INCIDENTS_PTS = 5;
const EOW_EVENT_NAME = 'End of Week Bonus';

interface ChatterEOWStatus {
  chatter_id: string;
  chatter_name: string;
  team_name: string | null;
  scheduledDays: number;
  reportedDays: number;
  allReportsSent: boolean;
  negativeEventCount: number;
  noIncidents: boolean;
  reportsPts: number;
  incidentPts: number;
  hasKPIData: boolean;
  goldenRatio: number;
  fanCvr: number;
  unlockRate: number;
  replyTimeSec: number;
  grPts: number;
  cvrPts: number;
  urPts: number;
  rtPts: number;
  kpiPts: number;
  totalPts: number;
  currentTotal: number;
  projectedTotal: number;
  alreadyApplied: boolean;
  notScheduled: boolean;
}

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export default function ScoreEndOfWeek({ weekKey, chatters, events, eventTypes, scores, config, onDataChange }: Props) {
  const { profile } = useAuthStore();
  const [statuses, setStatuses] = useState<ChatterEOWStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [teamFilter, setTeamFilter] = useState('all');

  const eowEventType = eventTypes.find(t => t.name === EOW_EVENT_NAME) ?? null;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const monday = weekKeyToMonday(weekKey);
      const weekStart = monday.toISOString().slice(0, 10);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const weekEnd = sunday.toISOString().slice(0, 10);

      const [schedulesRes, reportsRes, kpiRes] = await Promise.all([
        supabase
          .from('schedules')
          .select('chatter_id, day_of_week')
          .eq('week_start', weekStart),
        supabase
          .from('shift_reports')
          .select('chatter_id, date')
          .gte('date', weekStart)
          .lte('date', weekEnd),
        supabase
          .from('chatter_daily_stats')
          .select('employee_name, golden_ratio, unlock_rate, fan_cvr, response_time_clocked, messages_sent, ppvs_sent, ppvs_unlocked, fans_chatted, fans_who_spent')
          .gte('date', weekStart)
          .lte('date', weekEnd),
      ]);

      const schedules = schedulesRes.data ?? [];
      const shiftReports = reportsRes.data ?? [];
      const kpiRows = (kpiRes.data ?? []) as ChatterDailyStat[];

      // Schedules per chatter
      const scheduledDaysMap: Record<string, number> = {};
      for (const s of schedules) {
        scheduledDaysMap[s.chatter_id] = (scheduledDaysMap[s.chatter_id] ?? 0) + 1;
      }

      // Shift reports per chatter (unique dates)
      const reportedDaysMap: Record<string, Set<string>> = {};
      for (const r of shiftReports) {
        if (!reportedDaysMap[r.chatter_id]) reportedDaysMap[r.chatter_id] = new Set();
        reportedDaysMap[r.chatter_id]!.add(r.date as string);
      }

      // Negative events per chatter
      const negativeCountMap: Record<string, number> = {};
      for (const ev of events) {
        if (ev.event_type?.category === 'negative') {
          negativeCountMap[ev.chatter_id] = (negativeCountMap[ev.chatter_id] ?? 0) + 1;
        }
      }

      // Already applied EOW
      const eowAppliedSet = new Set<string>();
      if (eowEventType) {
        for (const ev of events) {
          if (ev.event_type_id === eowEventType.id) eowAppliedSet.add(ev.chatter_id);
        }
      }

      // Aggregate KPI data by employee name (weekly totals for ratio recalculation)
      const kpiMap = new Map<string, {
        totalMsgs: number; totalPpvsSent: number; totalUnlocked: number;
        totalFansChatted: number; totalFansSpent: number;
        rtWeightedSum: number; rtWeightTotal: number;
      }>();

      for (const row of kpiRows) {
        const key = normalizeKey(row.employee_name);
        let agg = kpiMap.get(key);
        if (!agg) {
          agg = { totalMsgs: 0, totalPpvsSent: 0, totalUnlocked: 0, totalFansChatted: 0, totalFansSpent: 0, rtWeightedSum: 0, rtWeightTotal: 0 };
          kpiMap.set(key, agg);
        }
        agg.totalMsgs += Number(row.messages_sent) || 0;
        agg.totalPpvsSent += Number(row.ppvs_sent) || 0;
        agg.totalUnlocked += Number(row.ppvs_unlocked) || 0;
        agg.totalFansChatted += Number(row.fans_chatted) || 0;
        agg.totalFansSpent += Number(row.fans_who_spent) || 0;

        const rt = parseResponseTime(row.response_time_clocked);
        const weight = Number(row.messages_sent) || 0;
        if (!isNaN(rt) && rt > 0 && weight > 0) {
          agg.rtWeightedSum += rt * weight;
          agg.rtWeightTotal += weight;
        }
      }

      // Build chatter name → normalized key map
      const chatterKeyMap = new Map<string, string>();
      for (const c of chatters) {
        chatterKeyMap.set(c.id, normalizeKey(c.full_name));
      }

      // Build statuses
      const result: ChatterEOWStatus[] = chatters.map(c => {
        const scheduled = scheduledDaysMap[c.id] ?? 0;
        const reported = reportedDaysMap[c.id]?.size ?? 0;
        const notScheduled = scheduled === 0;
        const allReportsSent = notScheduled ? false : reported >= scheduled;
        const negativeEventCount = negativeCountMap[c.id] ?? 0;
        const noIncidents = negativeEventCount === 0;
        const reportsPts = allReportsSent ? REPORTS_PTS : 0;
        const incidentPts = noIncidents ? NO_INCIDENTS_PTS : 0;

        // KPI data
        const nameKey = chatterKeyMap.get(c.id) ?? '';
        const kpi = kpiMap.get(nameKey);
        const hasKPIData = !!kpi && kpi.totalMsgs > 0;

        let goldenRatio = NaN, fanCvr = NaN, unlockRate = NaN, replyTimeSec = NaN;
        if (kpi && hasKPIData) {
          goldenRatio = kpi.totalMsgs > 0 ? (kpi.totalPpvsSent / kpi.totalMsgs) * 100 : NaN;
          unlockRate = kpi.totalPpvsSent > 0 ? (kpi.totalUnlocked / kpi.totalPpvsSent) * 100 : NaN;
          fanCvr = kpi.totalFansChatted > 0 ? (kpi.totalFansSpent / kpi.totalFansChatted) * 100 : NaN;
          replyTimeSec = kpi.rtWeightTotal > 0 ? kpi.rtWeightedSum / kpi.rtWeightTotal : NaN;
        }

        const grPts = hasKPIData ? scoreGoldenRatio(goldenRatio, config) : 0;
        const cvrPts = hasKPIData ? scoreFanCVR(fanCvr, config) : 0;
        const urPts = hasKPIData ? scoreUnlockRate(unlockRate, config) : 0;
        const rtPts = hasKPIData ? scoreReplyTime(replyTimeSec, config) : 0;
        const kpiPts = grPts + cvrPts + urPts + rtPts;
        const totalPts = notScheduled ? 0 : reportsPts + incidentPts + kpiPts;

        const currentScore = scores.find(s => s.chatter_id === c.id);
        const currentTotal = currentScore?.total ?? config.base_score;
        const projectedTotal = currentTotal + (eowAppliedSet.has(c.id) ? 0 : totalPts);

        return {
          chatter_id: c.id, chatter_name: c.full_name, team_name: c.team_name,
          scheduledDays: scheduled, reportedDays: reported, allReportsSent,
          negativeEventCount, noIncidents, reportsPts, incidentPts,
          hasKPIData, goldenRatio, fanCvr, unlockRate, replyTimeSec,
          grPts, cvrPts, urPts, rtPts, kpiPts, totalPts,
          currentTotal, projectedTotal,
          alreadyApplied: eowAppliedSet.has(c.id), notScheduled,
        };
      });

      result.sort((a, b) => {
        if (a.alreadyApplied !== b.alreadyApplied) return a.alreadyApplied ? 1 : -1;
        if (a.notScheduled !== b.notScheduled) return a.notScheduled ? 1 : -1;
        if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
        return a.chatter_name.localeCompare(b.chatter_name);
      });

      setStatuses(result);
    } catch (err) {
      console.error('Failed to load EOW data:', err);
    } finally {
      setLoading(false);
    }
  }, [weekKey, chatters, events, eowEventType]);

  useEffect(() => { loadData(); }, [loadData]);

  async function ensureEventType(): Promise<string> {
    if (eowEventType) return eowEventType.id;
    const { data, error } = await supabase
      .from('score_event_types')
      .insert({ name: EOW_EVENT_NAME, points: 20, category: 'positive' as const, is_active: true, sort_order: 999 })
      .select('id').single();
    if (error) throw error;
    return data.id as string;
  }

  async function handleApply() {
    if (!profile) return;
    setApplying(true);
    try {
      const eventTypeId = await ensureEventType();
      const monday = weekKeyToMonday(weekKey);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const date = sunday.toISOString().slice(0, 10);

      const toInsert = statuses
        .filter(s => !s.alreadyApplied && !s.notScheduled)
        .map(s => ({
          chatter_id: s.chatter_id,
          submitted_by: profile.id,
          date,
          event_type_id: eventTypeId,
          points: s.totalPts,
          custom_points: null,
          notes: buildNote(s),
          week: weekKey,
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from('score_events').insert(toInsert);
        if (error) throw error;
      }
      onDataChange();
    } catch (err) {
      console.error('Failed to apply EOW bonus:', err);
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo() {
    if (!eowEventType) return;
    setUndoing(true);
    try {
      const { error } = await supabase.from('score_events').delete().eq('week', weekKey).eq('event_type_id', eowEventType.id);
      if (error) throw error;
      onDataChange();
    } catch (err) {
      console.error('Failed to undo EOW:', err);
    } finally {
      setUndoing(false);
    }
  }

  function buildNote(s: ChatterEOWStatus): string {
    const parts: string[] = [];
    if (s.allReportsSent) parts.push(`Reports ✓ +${REPORTS_PTS}`);
    if (s.noIncidents) parts.push(`No incidents ✓ +${NO_INCIDENTS_PTS}`);
    if (s.hasKPIData) {
      parts.push(`GR ${s.goldenRatio.toFixed(1)}% ${fmtPts(s.grPts)}`);
      parts.push(`CVR ${s.fanCvr.toFixed(1)}% ${fmtPts(s.cvrPts)}`);
      parts.push(`UR ${s.unlockRate.toFixed(1)}% ${fmtPts(s.urPts)}`);
      parts.push(`RT ${formatSeconds(s.replyTimeSec)} ${fmtPts(s.rtPts)}`);
    }
    return parts.join(' | ');
  }

  const filtered = statuses.filter(s => teamFilter === 'all' || s.team_name === teamFilter);
  const teams = [...new Set(chatters.map(c => c.team_name).filter(Boolean))] as string[];
  const anyApplied = statuses.some(s => s.alreadyApplied);
  const eligible = statuses.filter(s => !s.notScheduled && !s.alreadyApplied);
  const withKPI = eligible.filter(s => s.hasKPIData).length;
  const withoutKPI = eligible.filter(s => !s.hasKPIData).length;
  const totalPoints = eligible.reduce((sum, s) => sum + s.totalPts, 0);
  const pendingCount = eligible.length;
  const kpiR = getKPIRules(config);

  if (loading) {
    return <div className="text-sm text-text-muted text-center py-16">Loading end of week data...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Chatters" value={eligible.length} color="text-text-primary" />
        <SummaryCard label="With KPI Data" value={withKPI} color="text-emerald-400" />
        <SummaryCard label="No KPI Data" value={withoutKPI} color={withoutKPI > 0 ? 'text-amber-400' : 'text-text-muted'} />
        <SummaryCard label="Total Points" value={totalPoints > 0 ? `+${totalPoints}` : String(totalPoints)} color="text-cw" />
      </div>

      {/* KPI data warning */}
      {withoutKPI > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p>{withoutKPI} chatter{withoutKPI > 1 ? 's' : ''} without KPI data this week. Their KPI points will be 0. Make sure Infloww employee reports have been uploaded.</p>
        </div>
      )}

      {/* Filters + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary"
        >
          <option value="all">All Teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex gap-2">
          {anyApplied && (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 disabled:opacity-40 transition-all border border-red-500/20"
            >
              <Undo2 size={13} />
              {undoing ? 'Undoing...' : 'Undo All'}
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={applying || pendingCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Gift size={13} />
            {applying ? 'Applying...' : `Apply End of Week (${pendingCount})`}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th align="left">Name</Th>
                <Th align="left">Team</Th>
                <Th>Rpts</Th>
                <Th>Inc</Th>
                <Th>GR ({kpiR.golden_ratio.t2.threshold}%)</Th>
                <Th>CVR ({kpiR.fan_cvr.t2.threshold}%)</Th>
                <Th>UR ({kpiR.unlock_rate.t2.threshold}%)</Th>
                <Th>RT ({Math.floor(kpiR.reply_time.t2.threshold / 60)}m)</Th>
                <Th align="right">EOW</Th>
                <Th align="right">Projected</Th>
                <Th>Tier</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr
                  key={s.chatter_id}
                  className={`border-b border-border/50 transition-colors ${
                    s.alreadyApplied ? 'opacity-50' : s.notScheduled ? 'opacity-30' : 'hover:bg-surface-2/50'
                  }`}
                >
                  {/* Name */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                        s.team_name?.includes('Huckle') ? 'bg-team-huckle' :
                        s.team_name?.includes('Danilyn') ? 'bg-team-danilyn' :
                        s.team_name?.includes('Ezekiel') ? 'bg-team-ezekiel' : 'bg-text-muted'
                      }`} />
                      <span className="text-xs font-medium text-text-primary whitespace-nowrap">{s.chatter_name}</span>
                    </div>
                  </td>
                  {/* Team */}
                  <td className="px-3 py-2">
                    {s.team_name && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        s.team_name.includes('Huckle') ? 'bg-orange-500/15 text-orange-400' :
                        s.team_name.includes('Danilyn') ? 'bg-blue-500/15 text-blue-400' :
                        s.team_name.includes('Ezekiel') ? 'bg-purple-500/15 text-purple-400' :
                        'bg-surface-3 text-text-muted'
                      }`}>
                        {s.team_name.replace('Team ', '')}
                      </span>
                    )}
                  </td>
                  {/* Reports */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? <Dash /> : (
                      <div className="flex flex-col items-center">
                        {s.allReportsSent
                          ? <Check size={14} className="text-emerald-400" />
                          : <X size={14} className="text-red-400" />}
                        <span className="text-[9px] text-text-muted">{s.reportedDays}/{s.scheduledDays}</span>
                      </div>
                    )}
                  </td>
                  {/* Incidents */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? <Dash /> : s.noIncidents
                      ? <Check size={14} className="text-emerald-400 mx-auto" />
                      : <div className="flex flex-col items-center">
                          <X size={14} className="text-red-400" />
                          <span className="text-[9px] text-red-400">{s.negativeEventCount}</span>
                        </div>
                    }
                  </td>
                  {/* GR */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? <Dash /> : !s.hasKPIData ? <NoData /> : (
                      <KPICell value={`${s.goldenRatio.toFixed(1)}%`} pts={s.grPts} />
                    )}
                  </td>
                  {/* CVR */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? <Dash /> : !s.hasKPIData ? <NoData /> : (
                      <KPICell value={`${s.fanCvr.toFixed(1)}%`} pts={s.cvrPts} />
                    )}
                  </td>
                  {/* UR */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? <Dash /> : !s.hasKPIData ? <NoData /> : (
                      <KPICell value={`${s.unlockRate.toFixed(1)}%`} pts={s.urPts} />
                    )}
                  </td>
                  {/* RT */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? <Dash /> : !s.hasKPIData ? <NoData /> : (
                      <KPICell value={formatSeconds(s.replyTimeSec)} pts={s.rtPts} />
                    )}
                  </td>
                  {/* EOW pts */}
                  <td className={`px-3 py-2 text-xs text-right font-bold ${ptsColor(s.totalPts)}`}>
                    {s.notScheduled ? '—' : fmtPts(s.totalPts)}
                  </td>
                  {/* Projected total */}
                  <td className="px-3 py-2 text-right">
                    {s.notScheduled ? (
                      <span className="text-xs text-text-muted">—</span>
                    ) : (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-sm font-bold text-text-primary">{s.projectedTotal}</span>
                        <span className="text-[9px] text-text-muted">{s.currentTotal} {s.totalPts >= 0 ? '+' : ''}{s.totalPts}</span>
                      </div>
                    )}
                  </td>
                  {/* Tier */}
                  <td className="px-3 py-2 text-center">
                    {s.notScheduled ? (
                      <StatusPill className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20">N/A</StatusPill>
                    ) : (() => {
                      const tier = calculateStatus(s.projectedTotal, config);
                      const badge = getStatusBadge(tier);
                      const bonus = getBonusAmount(s.projectedTotal, config);
                      return (
                        <div className="flex flex-col items-center leading-tight">
                          <StatusPill className={badge.colorClass}>{badge.label}</StatusPill>
                          {bonus > 0 && <span className="text-[9px] text-emerald-400 mt-0.5">+${bonus}</span>}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">
                    No chatters match the selected filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reference cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Tier reference */}
        <div className="bg-surface-1 rounded-xl border border-border p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Tier Bonuses</h4>
          <div className="space-y-1.5">
            {[
              { label: 'Diamond', min: config.tier_20_threshold, bonus: config.tier_20_amount, color: 'text-cyan-300' },
              { label: 'Platinum', min: config.tier_10_threshold, bonus: config.tier_10_amount, color: 'text-violet-400' },
              { label: 'Gold', min: config.tier_5_threshold, bonus: config.tier_5_amount, color: 'text-amber-400' },
              { label: 'Silver', min: config.silver_threshold ?? 110, bonus: config.silver_amount ?? 5, color: 'text-slate-300' },
              { label: 'Neutral', min: config.warning_threshold, bonus: 0, color: 'text-zinc-400' },
              { label: 'Bronze', min: 0, bonus: 0, color: 'text-red-400' },
            ].map(t => (
              <div key={t.label} className="flex items-center justify-between text-[11px]">
                <span className={`font-medium ${t.color}`}>{t.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted">{t.label === 'Bronze' ? `<${config.warning_threshold}` : `≥${t.min}`} pts</span>
                  {t.bonus > 0
                    ? <span className="text-emerald-400 font-bold w-8 text-right">+${t.bonus}</span>
                    : <span className="text-text-muted w-8 text-right">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KPI rules */}
        <div className="bg-surface-1 rounded-xl border border-border p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">KPI Scoring Rules</h4>
          <div className="space-y-2 text-[11px]">
            {(() => {
              const r = getKPIRules(config);
              const fmtPct = (v: number) => `${v}%`;
              const fmtTime = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
              return (
                <>
                  <RuleRow label="Golden Ratio" target={fmtPct(r.golden_ratio.t2.threshold)}
                    rules={`≥${fmtPct(r.golden_ratio.t1.threshold)} ${r.golden_ratio.t1.pts > 0 ? '+' : ''}${r.golden_ratio.t1.pts} | ≥${fmtPct(r.golden_ratio.t2.threshold)} ${r.golden_ratio.t2.pts > 0 ? '+' : ''}${r.golden_ratio.t2.pts} | ≥${fmtPct(r.golden_ratio.t3.threshold)} ${r.golden_ratio.t3.pts} | <${fmtPct(r.golden_ratio.t3.threshold)} ${r.golden_ratio.below_pts}`} />
                  <RuleRow label="Fan CVR" target={fmtPct(r.fan_cvr.t2.threshold)}
                    rules={`≥${fmtPct(r.fan_cvr.t1.threshold)} ${r.fan_cvr.t1.pts > 0 ? '+' : ''}${r.fan_cvr.t1.pts} | ≥${fmtPct(r.fan_cvr.t2.threshold)} ${r.fan_cvr.t2.pts > 0 ? '+' : ''}${r.fan_cvr.t2.pts} | ≥${fmtPct(r.fan_cvr.t3.threshold)} ${r.fan_cvr.t3.pts} | <${fmtPct(r.fan_cvr.t3.threshold)} ${r.fan_cvr.below_pts}`} />
                  <RuleRow label="Unlock Rate" target={fmtPct(r.unlock_rate.t2.threshold)}
                    rules={`≥${fmtPct(r.unlock_rate.t1.threshold)} ${r.unlock_rate.t1.pts > 0 ? '+' : ''}${r.unlock_rate.t1.pts} | ≥${fmtPct(r.unlock_rate.t2.threshold)} ${r.unlock_rate.t2.pts > 0 ? '+' : ''}${r.unlock_rate.t2.pts} | ≥${fmtPct(r.unlock_rate.t3.threshold)} ${r.unlock_rate.t3.pts} | <${fmtPct(r.unlock_rate.t3.threshold)} ${r.unlock_rate.below_pts}`} />
                  <RuleRow label="Reply Time" target={fmtTime(r.reply_time.t2.threshold)}
                    rules={`≤${fmtTime(r.reply_time.t1.threshold)} ${r.reply_time.t1.pts > 0 ? '+' : ''}${r.reply_time.t1.pts} | ≤${fmtTime(r.reply_time.t2.threshold)} ${r.reply_time.t2.pts > 0 ? '+' : ''}${r.reply_time.t2.pts} | ≤${fmtTime(r.reply_time.t3.threshold)} ${r.reply_time.t3.pts} | >${fmtTime(r.reply_time.t3.threshold)} ${r.reply_time.below_pts}`} />
                </>
              );
            })()}
          </div>
        </div>

        {/* Attendance */}
        <div className="bg-surface-1 rounded-xl border border-border p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Attendance Bonus</h4>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-text-secondary">
              <span>All shift reports submitted</span>
              <span className="text-emerald-400 font-bold">+{REPORTS_PTS}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>No incidents (late login, AFK, no show…)</span>
              <span className="text-emerald-400 font-bold">+{NO_INCIDENTS_PTS}</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-border text-[10px] text-text-muted">
            Max EOW: +{REPORTS_PTS + NO_INCIDENTS_PTS + 80} pts (attendance {REPORTS_PTS + NO_INCIDENTS_PTS} + KPI 80)
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helper components ────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-surface-1 rounded-xl border border-border p-4">
      <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Th({ children, align = 'center' }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
  return (
    <th className={`text-${align} text-[10px] font-bold uppercase tracking-wider text-text-muted px-3 py-2.5 whitespace-nowrap`}>
      {children}
    </th>
  );
}

function KPICell({ value, pts }: { value: string; pts: number }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-[11px] text-text-secondary">{value}</span>
      <span className={`text-[10px] font-bold ${ptsColor(pts)}`}>{fmtPts(pts)}</span>
    </div>
  );
}

function Dash() {
  return <span className="text-[10px] text-text-muted">—</span>;
}

function NoData() {
  return <span className="text-[9px] text-text-muted italic">n/a</span>;
}

function StatusPill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function RuleRow({ label, target, rules }: { label: string; target: string; rules: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-text-primary font-medium">
        <span>{label}</span>
        <span className="text-[9px] text-text-muted">(meta: {target})</span>
      </div>
      <p className="text-text-muted text-[10px]">{rules}</p>
    </div>
  );
}

function fmtPts(pts: number): string {
  return pts > 0 ? `+${pts}` : String(pts);
}

function ptsColor(pts: number): string {
  if (pts > 0) return 'text-emerald-400';
  if (pts < 0) return 'text-red-400';
  return 'text-text-muted';
}

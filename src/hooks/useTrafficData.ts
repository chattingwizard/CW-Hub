import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  ModelDailyStat,
  ModelTraffic,
  TeamTraffic,
  TrafficLevel,
  TrafficTrend,
  Model,
  ModelChatterAssignment,
  PageType,
} from '../types';
import { WORKLOAD_WEIGHTS } from '../types';

interface UseTrafficDataReturn {
  modelTraffic: ModelTraffic[];
  teamTraffic: TeamTraffic[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  getModelTraffic: (modelId: string) => ModelTraffic | undefined;
  globalAvg: number;
}

function getWorkloadWeight(pageType: PageType): number {
  return WORKLOAD_WEIGHTS[pageType ?? ''] ?? 0.7;
}

// ── Statistical helpers ──────────────────────────────────────
// Median: ignores extreme spikes (e.g., Putri going from 100 to 5000 for 2 days)
// With 1 value: returns that value. With multiple: returns the middle value.
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// Percentile: returns the value at a given percentile (0-100)
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (idx - lower);
}

export function useTrafficData(): UseTrafficDataReturn {
  const [modelTraffic, setModelTraffic] = useState<ModelTraffic[]>([]);
  const [teamTraffic, setTeamTraffic] = useState<TeamTraffic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalAvg, setGlobalAvg] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const dateStr = fourteenDaysAgo.toISOString().split('T')[0];

      const [statsRes, modelsRes, assignRes] = await Promise.all([
        supabase
          .from('model_daily_stats')
          .select('*')
          .gte('date', dateStr)
          .order('date', { ascending: false }),
        supabase.from('models').select('id, name, status, team_names, page_type'),
        supabase
          .from('model_chatter_assignments')
          .select('model_id, chatter_id')
          .eq('active', true),
      ]);

      if (statsRes.error) throw statsRes.error;
      if (modelsRes.error) throw modelsRes.error;
      if (assignRes.error) throw assignRes.error;

      const stats = (statsRes.data ?? []) as ModelDailyStat[];
      const models = (modelsRes.data ?? []) as Model[];
      const assignments = (assignRes.data ?? []) as ModelChatterAssignment[];

      const modelMap = new Map(models.map((m) => [m.id, m]));

      const chattersPerModel = new Map<string, number>();
      for (const a of assignments) {
        chattersPerModel.set(a.model_id, (chattersPerModel.get(a.model_id) ?? 0) + 1);
      }

      const statsByModel = new Map<string, ModelDailyStat[]>();
      for (const s of stats) {
        const arr = statsByModel.get(s.model_id) ?? [];
        arr.push(s);
        statsByModel.set(s.model_id, arr);
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDayStr = sevenDaysAgo.toISOString().split('T')[0]!;

      const traffics: ModelTraffic[] = [];

      for (const [modelId, modelStats] of statsByModel) {
        const model = modelMap.get(modelId);
        if (!model) continue;

        const recent = modelStats.filter((s) => s.date >= sevenDayStr);
        const previous = modelStats.filter((s) => s.date < sevenDayStr);

        // ── MEDIAN instead of MEAN ──
        // Median resists spikes: [100, 100, 5000, 100, 100] → median=100 (mean=1080)
        // With 1 data point: median = that value (can't improve further)
        const recentFansMedian = median(recent.map((s) => s.new_fans));
        const previousFansMedian = median(previous.map((s) => s.new_fans));

        const latestStat = modelStats[0];
        const activeFans = latestStat?.active_fans ?? 0;

        // Financial medians (from recent 7-day window)
        const recentEarningsMedian = median(recent.map((s) => s.total_earnings));
        const previousEarningsMedian = median(previous.map((s) => s.total_earnings));
        const recentTipsMedian = median(recent.map((s) => s.tips_earnings));
        const recentMsgMedian = median(recent.map((s) => s.message_earnings));
        const recentSubMedian = median(recent.map((s) => s.subscription_earnings));
        const renewPct = latestStat?.renew_pct ?? 0;
        const avgSpend = latestStat?.avg_spend_per_spender ?? 0;

        // Traffic trend (comparing medians)
        let trend: TrafficTrend = 'stable';
        let trendPct = 0;
        if (previousFansMedian > 0) {
          trendPct = ((recentFansMedian - previousFansMedian) / previousFansMedian) * 100;
          if (trendPct > 10) trend = 'up';
          else if (trendPct < -10) trend = 'down';
        }

        // Earnings trend
        let earningsTrendPct = 0;
        if (previousEarningsMedian > 0) {
          earningsTrendPct = ((recentEarningsMedian - previousEarningsMedian) / previousEarningsMedian) * 100;
        }

        const chatters = chattersPerModel.get(modelId) ?? 0;
        const pageType = (model.page_type as PageType) ?? null;
        const weight = getWorkloadWeight(pageType);
        const workload = recentFansMedian * weight;

        traffics.push({
          model_id: modelId,
          model_name: model.name,
          model_status: model.status ?? 'Live',
          page_type: pageType,
          new_fans_avg: Math.round(recentFansMedian * 10) / 10,
          active_fans: activeFans,
          chatters_assigned: chatters,
          fans_per_chatter: chatters > 0 ? Math.round((recentFansMedian / chatters) * 10) / 10 : recentFansMedian,
          workload: Math.round(workload * 10) / 10,
          workload_pct: 0, // Normalized below
          workload_per_chatter: chatters > 0 ? Math.round((workload / chatters) * 10) / 10 : workload,
          trend,
          trend_pct: Math.round(trendPct),
          level: 'none',
          team_names: model.team_names ?? [],
          earnings_per_day: Math.round(recentEarningsMedian * 100) / 100,
          tips_per_day: Math.round(recentTipsMedian * 100) / 100,
          message_earnings_per_day: Math.round(recentMsgMedian * 100) / 100,
          subscription_earnings_per_day: Math.round(recentSubMedian * 100) / 100,
          earnings_trend_pct: Math.round(earningsTrendPct),
          renew_pct: Math.round(renewPct * 10) / 10,
          avg_spend_per_spender: Math.round(avgSpend * 100) / 100,
        });
      }

      // Add models with NO stats
      const modelsWithStats = new Set(statsByModel.keys());
      for (const model of models) {
        if (modelsWithStats.has(model.id)) continue;
        const chatters = chattersPerModel.get(model.id) ?? 0;
        traffics.push({
          model_id: model.id,
          model_name: model.name,
          model_status: model.status ?? 'Live',
          page_type: (model.page_type as PageType) ?? null,
          new_fans_avg: 0, active_fans: 0,
          chatters_assigned: chatters, fans_per_chatter: 0,
          workload: 0, workload_pct: 0, workload_per_chatter: 0,
          trend: 'stable', trend_pct: 0, level: 'none',
          team_names: model.team_names ?? [],
          earnings_per_day: 0, tips_per_day: 0,
          message_earnings_per_day: 0, subscription_earnings_per_day: 0,
          earnings_trend_pct: 0, renew_pct: 0, avg_spend_per_spender: 0,
        });
      }

      // ── Normalize workload to 0-100% using P90 reference ──
      // P90 = 100%: the 90th percentile model represents a full chatter load
      // Models above P90 get >100% (they need special attention or multiple chatters)
      // This prevents one extreme outlier from compressing the entire scale
      const workloads = traffics.map((t) => t.workload).filter((w) => w > 0);
      const p90 = workloads.length > 0 ? percentile(workloads, 90) : 0.01;
      const referenceWorkload = Math.max(p90, 0.01);

      for (const t of traffics) {
        t.workload_pct = Math.round((t.workload / referenceWorkload) * 100);
      }

      // Classify levels
      for (const t of traffics) {
        if (t.workload_pct <= 0) t.level = 'none';
        else if (t.workload_pct >= 70) t.level = 'high';
        else if (t.workload_pct >= 30) t.level = 'medium';
        else t.level = 'low';
      }

      // Global average
      const avgValues = traffics.filter((t) => t.workload > 0);
      const avg = avgValues.length > 0
        ? avgValues.reduce((sum, t) => sum + t.workload_pct, 0) / avgValues.length
        : 0;
      setGlobalAvg(Math.round(avg));

      // Sort by workload_pct descending
      traffics.sort((a, b) => b.workload_pct - a.workload_pct);
      setModelTraffic(traffics);

      // ── Team traffic ──
      const teamMap = new Map<
        string,
        {
          fans: number;
          active: number;
          workload: number;
          workloadPct: number;
          chatters: Set<string>;
          models: Set<string>;
          free: number;
          paid: number;
          mixed: number;
        }
      >();

      for (const t of traffics) {
        for (const teamName of t.team_names) {
          if (!teamName || teamName === '0') continue;
          const team = teamMap.get(teamName) ?? {
            fans: 0, active: 0, workload: 0, workloadPct: 0,
            chatters: new Set<string>(), models: new Set<string>(),
            free: 0, paid: 0, mixed: 0,
          };
          team.fans += t.new_fans_avg;
          team.active += t.active_fans;
          team.workload += t.workload;
          team.workloadPct += t.workload_pct;
          team.models.add(t.model_id);
          if (t.page_type === 'Free Page') team.free++;
          else if (t.page_type === 'Paid Page') team.paid++;
          else team.mixed++;
          teamMap.set(teamName, team);
        }
      }

      for (const a of assignments) {
        const model = modelMap.get(a.model_id);
        if (!model) continue;
        for (const teamName of model.team_names ?? []) {
          const team = teamMap.get(teamName);
          if (team) team.chatters.add(a.chatter_id);
        }
      }

      const teams: TeamTraffic[] = [];
      for (const [name, data] of teamMap) {
        const chatterCount = data.chatters.size || 1;
        teams.push({
          team_name: name,
          total_new_fans_avg: Math.round(data.fans * 10) / 10,
          total_active_fans: data.active,
          total_workload: Math.round(data.workload * 10) / 10,
          total_workload_pct: Math.round(data.workloadPct),
          chatter_count: data.chatters.size,
          model_count: data.models.size,
          fans_per_chatter: Math.round((data.fans / chatterCount) * 10) / 10,
          workload_per_chatter: Math.round((data.workload / chatterCount) * 10) / 10,
          workload_pct_per_chatter: Math.round(data.workloadPct / chatterCount),
          free_count: data.free,
          paid_count: data.paid,
          mixed_count: data.mixed,
        });
      }
      teams.sort((a, b) => b.total_workload_pct - a.total_workload_pct);
      setTeamTraffic(teams);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load traffic data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await fetchData();
      if (cancelled) return;
    };
    load();
    return () => { cancelled = true; };
  }, [fetchData]);

  const getModelTraffic = useCallback(
    (modelId: string) => modelTraffic.find((t) => t.model_id === modelId),
    [modelTraffic],
  );

  return { modelTraffic, teamTraffic, loading, error, refresh: fetchData, getModelTraffic, globalAvg };
}

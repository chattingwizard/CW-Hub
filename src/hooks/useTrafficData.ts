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

        const recentAvg =
          recent.length > 0
            ? recent.reduce((sum, s) => sum + s.new_fans, 0) / recent.length
            : 0;
        const previousAvg =
          previous.length > 0
            ? previous.reduce((sum, s) => sum + s.new_fans, 0) / previous.length
            : 0;

        const latestStat = modelStats[0];
        const activeFans = latestStat?.active_fans ?? 0;
        const earningsPerDay = latestStat?.total_earnings ?? 0;

        let trend: TrafficTrend = 'stable';
        let trendPct = 0;
        if (previousAvg > 0) {
          trendPct = ((recentAvg - previousAvg) / previousAvg) * 100;
          if (trendPct > 10) trend = 'up';
          else if (trendPct < -10) trend = 'down';
        }

        const chatters = chattersPerModel.get(modelId) ?? 0;
        const pageType = (model.page_type as PageType) ?? null;
        const weight = getWorkloadWeight(pageType);
        const workload = recentAvg * weight;

        traffics.push({
          model_id: modelId,
          model_name: model.name,
          page_type: pageType,
          new_fans_avg: Math.round(recentAvg * 10) / 10,
          active_fans: activeFans,
          chatters_assigned: chatters,
          fans_per_chatter: chatters > 0 ? Math.round((recentAvg / chatters) * 10) / 10 : recentAvg,
          workload: Math.round(workload * 10) / 10,
          workload_per_chatter: chatters > 0 ? Math.round((workload / chatters) * 10) / 10 : workload,
          trend,
          trend_pct: Math.round(trendPct),
          level: 'none',
          team_names: model.team_names ?? [],
          earnings_per_day: Math.round(earningsPerDay * 100) / 100,
        });
      }

      // Classify levels based on workload (not raw fans)
      const avgValues = traffics.filter((t) => t.workload > 0);
      const avg =
        avgValues.length > 0
          ? avgValues.reduce((sum, t) => sum + t.workload, 0) / avgValues.length
          : 0;
      setGlobalAvg(Math.round(avg * 10) / 10);

      for (const t of traffics) {
        t.level = classifyTraffic(t.workload, avg);
      }

      // Sort by workload descending (effective load, not raw fans)
      traffics.sort((a, b) => b.workload - a.workload);
      setModelTraffic(traffics);

      // Team traffic with type breakdown
      const teamMap = new Map<
        string,
        {
          fans: number;
          active: number;
          workload: number;
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
            fans: 0,
            active: 0,
            workload: 0,
            chatters: new Set<string>(),
            models: new Set<string>(),
            free: 0,
            paid: 0,
            mixed: 0,
          };
          team.fans += t.new_fans_avg;
          team.active += t.active_fans;
          team.workload += t.workload;
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
        teams.push({
          team_name: name,
          total_new_fans_avg: Math.round(data.fans * 10) / 10,
          total_active_fans: data.active,
          total_workload: Math.round(data.workload * 10) / 10,
          chatter_count: data.chatters.size,
          model_count: data.models.size,
          fans_per_chatter:
            data.chatters.size > 0
              ? Math.round((data.fans / data.chatters.size) * 10) / 10
              : data.fans,
          workload_per_chatter:
            data.chatters.size > 0
              ? Math.round((data.workload / data.chatters.size) * 10) / 10
              : data.workload,
          free_count: data.free,
          paid_count: data.paid,
          mixed_count: data.mixed,
        });
      }
      teams.sort((a, b) => b.total_workload - a.total_workload);
      setTeamTraffic(teams);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load traffic data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getModelTraffic = useCallback(
    (modelId: string) => modelTraffic.find((t) => t.model_id === modelId),
    [modelTraffic],
  );

  return { modelTraffic, teamTraffic, loading, error, refresh: fetchData, getModelTraffic, globalAvg };
}

function classifyTraffic(value: number, average: number): TrafficLevel {
  if (value <= 0 || average <= 0) return 'none';
  const ratio = value / average;
  if (ratio > 1.5) return 'high';
  if (ratio < 0.75) return 'low';
  return 'medium';
}

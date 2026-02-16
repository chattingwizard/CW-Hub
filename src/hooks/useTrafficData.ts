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
} from '../types';

interface UseTrafficDataReturn {
  modelTraffic: ModelTraffic[];
  teamTraffic: TeamTraffic[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  getModelTraffic: (modelId: string) => ModelTraffic | undefined;
  globalAvg: number;
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
      // Get last 14 days of data for trend calculation
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const dateStr = fourteenDaysAgo.toISOString().split('T')[0];

      const [statsRes, modelsRes, assignRes] = await Promise.all([
        supabase
          .from('model_daily_stats')
          .select('*')
          .gte('date', dateStr)
          .order('date', { ascending: false }),
        supabase.from('models').select('id, name, status, team_names'),
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

      // Build model lookup
      const modelMap = new Map(models.map((m) => [m.id, m]));

      // Count chatters per model
      const chattersPerModel = new Map<string, number>();
      for (const a of assignments) {
        chattersPerModel.set(a.model_id, (chattersPerModel.get(a.model_id) ?? 0) + 1);
      }

      // Group stats by model
      const statsByModel = new Map<string, ModelDailyStat[]>();
      for (const s of stats) {
        const arr = statsByModel.get(s.model_id) ?? [];
        arr.push(s);
        statsByModel.set(s.model_id, arr);
      }

      // Calculate traffic for each model
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDayStr = sevenDaysAgo.toISOString().split('T')[0]!;

      const traffics: ModelTraffic[] = [];

      for (const [modelId, modelStats] of statsByModel) {
        const model = modelMap.get(modelId);
        if (!model) continue;

        // Split into recent 7 days and previous 7 days
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

        // Latest day active fans
        const latestStat = modelStats[0]; // Already sorted desc
        const activeFans = latestStat?.active_fans ?? 0;

        // Trend
        let trend: TrafficTrend = 'stable';
        let trendPct = 0;
        if (previousAvg > 0) {
          trendPct = ((recentAvg - previousAvg) / previousAvg) * 100;
          if (trendPct > 10) trend = 'up';
          else if (trendPct < -10) trend = 'down';
        }

        const chatters = chattersPerModel.get(modelId) ?? 0;

        traffics.push({
          model_id: modelId,
          model_name: model.name,
          new_fans_avg: Math.round(recentAvg * 10) / 10,
          active_fans: activeFans,
          chatters_assigned: chatters,
          fans_per_chatter: chatters > 0 ? Math.round((recentAvg / chatters) * 10) / 10 : recentAvg,
          trend,
          trend_pct: Math.round(trendPct),
          level: 'none', // Calculated below
          team_names: model.team_names ?? [],
        });
      }

      // Calculate global average and assign levels
      const avgValues = traffics.filter((t) => t.new_fans_avg > 0);
      const avg =
        avgValues.length > 0
          ? avgValues.reduce((sum, t) => sum + t.new_fans_avg, 0) / avgValues.length
          : 0;
      setGlobalAvg(Math.round(avg * 10) / 10);

      for (const t of traffics) {
        t.level = classifyTraffic(t.new_fans_avg, avg);
      }

      // Sort by traffic descending
      traffics.sort((a, b) => b.new_fans_avg - a.new_fans_avg);
      setModelTraffic(traffics);

      // Calculate team traffic
      const teamMap = new Map<string, { fans: number; active: number; chatters: Set<string>; models: Set<string> }>();

      for (const t of traffics) {
        for (const teamName of t.team_names) {
          if (!teamName || teamName === '0') continue;
          const team = teamMap.get(teamName) ?? {
            fans: 0,
            active: 0,
            chatters: new Set<string>(),
            models: new Set<string>(),
          };
          team.fans += t.new_fans_avg;
          team.active += t.active_fans;
          team.models.add(t.model_id);
          teamMap.set(teamName, team);
        }
      }

      // Add chatter counts from assignments
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
          chatter_count: data.chatters.size,
          model_count: data.models.size,
          fans_per_chatter:
            data.chatters.size > 0
              ? Math.round((data.fans / data.chatters.size) * 10) / 10
              : data.fans,
        });
      }
      teams.sort((a, b) => b.total_new_fans_avg - a.total_new_fans_avg);
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

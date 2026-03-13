import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { ModelDailyStat, ChatterDailyStat, Model } from '../types';

interface DailyRevenue {
  date: string;
  total: number;
  messages: number;
  subscriptions: number;
  tips: number;
}

export interface ModelRevenue {
  model_id: string;
  model_name: string;
  page_type: string | null;
  avatar_url: string | null;
  status: string;
  total_revenue: number;
  revenue_per_day: number;
  message_revenue: number;
  subscription_revenue: number;
  tips_revenue: number;
  pct_of_total: number;
  new_fans_per_day: number;
  active_fans: number;
  of_ranking: string | null;
  team_number: number | null;
  base_ltv: number;
  team_multiplier: number;
  adjusted_ltv: number;
  expected_daily_value: number;
  performance_ratio: number;
  daily: DailyRevenue[];
  daily_rankings: { date: string; ranking: number | null }[];
  daily_fans: { date: string; new_fans: number; active_fans: number }[];
}

interface ChatterRevenue {
  employee_name: string;
  team: string;
  total_sales: number;
  sales_per_hour: number;
  cvr: number;
  unlock_rate: number;
  hours_worked: number;
  daily_sales: { date: string; sales: number; sales_per_hour: number }[];
}

interface TeamRevenue {
  team: string;
  total_sales: number;
  avg_sales_per_hour: number;
  chatter_count: number;
  daily_sales: { date: string; sales: number; avg_sph: number }[];
}

interface ForecastPoint {
  date: string;
  actual_revenue: number | null;
  forecast_revenue: number;
  actual_fans: number | null;
  forecast_fans: number;
  actual_subs: number | null;
  forecast_subs: number;
  is_future: boolean;
}

interface RevenueData {
  totalRevenue: number;
  avgRevenuePerDay: number;
  growthPct: number;
  topModelName: string;
  dailyRevenue: DailyRevenue[];
  revenueBySource: { name: string; value: number; color: string }[];
  topModels: ModelRevenue[];
  topChatters: ChatterRevenue[];
  modelRevenues: ModelRevenue[];
  teamRevenues: TeamRevenue[];
  chatterRevenues: ChatterRevenue[];
  forecastData: ForecastPoint[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const SOURCE_COLORS = {
  Messages: '#1d9bf0',
  Subscriptions: '#22c55e',
  Tips: '#f59e0b',
};

const BASE_LTV: Record<string, number> = {
  'Free Page': 2,
  'Paid Page': 20,
  'Mixed': 8,
};
const DEFAULT_BASE_LTV = 5;

const TEAM_MULTIPLIERS: Record<number, number> = {
  1: 2.0,
  2: 1.5,
  3: 1.2,
  4: 1.0,
  5: 1.0,
  6: 0.85,
  7: 0.7,
  8: 0.7,
};
const DEFAULT_TEAM_MULTIPLIER = 1.0;

function getBestTeam(teamNames: string[]): number | null {
  const nums = teamNames
    .map(t => parseInt(t, 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  return nums[0] ?? null;
}

function getTeamMultiplier(teamNumber: number | null): number {
  if (teamNumber === null) return DEFAULT_TEAM_MULTIPLIER;
  return TEAM_MULTIPLIERS[teamNumber] ?? DEFAULT_TEAM_MULTIPLIER;
}

function getBaseLtv(pageType: string | null): number {
  if (!pageType) return DEFAULT_BASE_LTV;
  return BASE_LTV[pageType] ?? DEFAULT_BASE_LTV;
}

// Holt's double exponential smoothing — adapts to both level shifts and trends.
// When actual data deviates from forecast, subsequent forecasts self-correct.
function holtForecast(
  values: number[],
  futureDays: number,
  alpha = 0.3,
  beta = 0.2,
): number[] {
  if (values.length === 0) return Array(futureDays).fill(0) as number[];
  if (values.length === 1) return Array(values.length + futureDays).fill(values[0]) as number[];

  let level = values[0]!;
  let trend = values[1]! - values[0]!;

  const fitted: number[] = [Math.max(0, Math.round(level))];
  for (let i = 1; i < values.length; i++) {
    const actual = values[i]!;
    const prevLevel = level;
    level = alpha * actual + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(Math.max(0, Math.round(level)));
  }
  for (let k = 1; k <= futureDays; k++) {
    fitted.push(Math.max(0, Math.round(level + k * trend)));
  }
  return fitted;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0]!;
}

export function useRevenueData(days: number = 7): RevenueData {
  const [modelStats, setModelStats] = useState<ModelDailyStat[]>([]);
  const [chatterStats, setChatterStats] = useState<ChatterDailyStat[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0]!;
  }, [days]);

  const previousCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days * 2);
    return d.toISOString().split('T')[0]!;
  }, [days]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, chatterRes, modelsRes] = await Promise.all([
        supabase
          .from('model_daily_stats')
          .select('*')
          .gte('date', previousCutoff)
          .order('date', { ascending: true }),
        supabase
          .from('chatter_daily_stats')
          .select('*')
          .gte('date', previousCutoff)
          .order('date', { ascending: true }),
        supabase
          .from('models')
          .select('id, name, status, page_type, profile_picture_url, team_names'),
      ]);

      if (statsRes.error) throw statsRes.error;
      if (chatterRes.error) throw chatterRes.error;
      if (modelsRes.error) throw modelsRes.error;

      setModelStats((statsRes.data ?? []) as ModelDailyStat[]);
      setChatterStats((chatterRes.data ?? []) as ChatterDailyStat[]);
      setModels((modelsRes.data ?? []) as Model[]);
    } catch (err) {
      console.error('Revenue data fetch failed:', err);
      setError('Could not load revenue data.');
    } finally {
      setLoading(false);
    }
  }, [previousCutoff]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return useMemo(() => {
    if (loading || error || modelStats.length === 0) {
      return {
        totalRevenue: 0, avgRevenuePerDay: 0, growthPct: 0, topModelName: '—',
        dailyRevenue: [], revenueBySource: [], topModels: [], topChatters: [],
        modelRevenues: [], teamRevenues: [], chatterRevenues: [], forecastData: [],
        loading, error, refresh: fetchData,
      };
    }

    const modelMap = new Map(models.map(m => [m.id, m]));

    const currentStats = modelStats.filter(s => s.date >= currentCutoff);
    const previousStats = modelStats.filter(s => s.date < currentCutoff);

    // --- Daily revenue + fans (all models summed per day) ---
    const dailyMap = new Map<string, DailyRevenue & { new_fans: number; subs: number }>();
    for (const s of currentStats) {
      const existing = dailyMap.get(s.date) ?? { date: s.date, total: 0, messages: 0, subscriptions: 0, tips: 0, new_fans: 0, subs: 0 };
      existing.total += s.total_earnings;
      existing.messages += s.message_earnings;
      existing.subscriptions += s.subscription_earnings;
      existing.tips += s.tips_earnings;
      existing.new_fans += s.new_fans;
      existing.subs += s.subscription_earnings > 0 ? 1 : 0;
      dailyMap.set(s.date, existing);
    }
    const dailyAggregated = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const dailyRevenue: DailyRevenue[] = dailyAggregated.map(d => ({
      date: d.date, total: d.total, messages: d.messages, subscriptions: d.subscriptions, tips: d.tips,
    }));

    const totalRevenue = dailyRevenue.reduce((sum, d) => sum + d.total, 0);
    const uniqueDays = dailyRevenue.length || 1;
    const avgRevenuePerDay = totalRevenue / uniqueDays;

    const previousTotal = previousStats.reduce((sum, s) => sum + s.total_earnings, 0);
    const growthPct = previousTotal > 0 ? ((totalRevenue - previousTotal) / previousTotal) * 100 : 0;

    const totalMessages = dailyRevenue.reduce((sum, d) => sum + d.messages, 0);
    const totalSubs = dailyRevenue.reduce((sum, d) => sum + d.subscriptions, 0);
    const totalTips = dailyRevenue.reduce((sum, d) => sum + d.tips, 0);

    const revenueBySource = [
      { name: 'Messages', value: Math.round(totalMessages), color: SOURCE_COLORS.Messages },
      { name: 'Subscriptions', value: Math.round(totalSubs), color: SOURCE_COLORS.Subscriptions },
      { name: 'Tips', value: Math.round(totalTips), color: SOURCE_COLORS.Tips },
    ];

    // --- Per-model revenue ---
    const modelStatsMap = new Map<string, ModelDailyStat[]>();
    for (const s of currentStats) {
      const arr = modelStatsMap.get(s.model_id) ?? [];
      arr.push(s);
      modelStatsMap.set(s.model_id, arr);
    }

    const modelRevenues: ModelRevenue[] = [];
    for (const [modelId, stats] of modelStatsMap) {
      const model = modelMap.get(modelId);
      if (!model) continue;

      const rev = stats.reduce((sum, s) => sum + s.total_earnings, 0);
      const msgRev = stats.reduce((sum, s) => sum + s.message_earnings, 0);
      const subRev = stats.reduce((sum, s) => sum + s.subscription_earnings, 0);
      const tipsRev = stats.reduce((sum, s) => sum + s.tips_earnings, 0);
      const newFans = stats.reduce((sum, s) => sum + s.new_fans, 0);
      const statDays = new Set(stats.map(s => s.date)).size || 1;

      const latestStat = [...stats].sort((a, b) => b.date.localeCompare(a.date))[0];

      const dailyByDate = new Map<string, DailyRevenue>();
      const dailyRankings: { date: string; ranking: number | null }[] = [];
      const dailyFans: { date: string; new_fans: number; active_fans: number }[] = [];
      for (const s of stats) {
        const ex = dailyByDate.get(s.date) ?? { date: s.date, total: 0, messages: 0, subscriptions: 0, tips: 0 };
        ex.total += s.total_earnings;
        ex.messages += s.message_earnings;
        ex.subscriptions += s.subscription_earnings;
        ex.tips += s.tips_earnings;
        dailyByDate.set(s.date, ex);

        const rankNum = s.of_ranking ? parseInt(s.of_ranking.replace(/[^0-9]/g, ''), 10) : null;
        dailyRankings.push({ date: s.date, ranking: (rankNum && !isNaN(rankNum)) ? rankNum : null });
        dailyFans.push({ date: s.date, new_fans: s.new_fans, active_fans: s.active_fans });
      }
      dailyRankings.sort((a, b) => a.date.localeCompare(b.date));
      dailyFans.sort((a, b) => a.date.localeCompare(b.date));

      const latestActiveFans = latestStat?.active_fans ?? 0;

      const teamNumber = getBestTeam(model.team_names ?? []);
      const teamMult = getTeamMultiplier(teamNumber);
      const baseLtv = getBaseLtv(model.page_type);
      const adjustedLtv = Math.round(baseLtv * teamMult * 100) / 100;
      const fansPerDay = newFans / statDays;
      const expectedDaily = Math.round(fansPerDay * adjustedLtv * 100) / 100;
      const actualDaily = rev / statDays;
      const perfRatio = expectedDaily > 0 ? Math.round((actualDaily / expectedDaily) * 100) / 100 : 0;

      modelRevenues.push({
        model_id: modelId,
        model_name: model.name,
        page_type: model.page_type,
        avatar_url: model.profile_picture_url,
        status: model.status ?? 'Live',
        total_revenue: Math.round(rev * 100) / 100,
        revenue_per_day: Math.round((rev / statDays) * 100) / 100,
        message_revenue: Math.round(msgRev * 100) / 100,
        subscription_revenue: Math.round(subRev * 100) / 100,
        tips_revenue: Math.round(tipsRev * 100) / 100,
        pct_of_total: totalRevenue > 0 ? Math.round((rev / totalRevenue) * 1000) / 10 : 0,
        new_fans_per_day: Math.round(fansPerDay * 10) / 10,
        active_fans: latestActiveFans,
        of_ranking: latestStat?.of_ranking ?? null,
        team_number: teamNumber,
        base_ltv: baseLtv,
        team_multiplier: teamMult,
        adjusted_ltv: adjustedLtv,
        expected_daily_value: expectedDaily,
        performance_ratio: perfRatio,
        daily: [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        daily_rankings: dailyRankings,
        daily_fans: dailyFans,
      });
    }
    modelRevenues.sort((a, b) => b.total_revenue - a.total_revenue);

    const liveModelRevenues = modelRevenues.filter(m => m.status === 'Live');
    const topModelName = liveModelRevenues[0]?.model_name ?? '—';
    const topModels = liveModelRevenues.slice(0, 5);

    // --- Per-chatter revenue ---
    const currentChatterStats = chatterStats.filter(s => s.date >= currentCutoff);
    const chatterMap = new Map<string, ChatterDailyStat[]>();
    for (const s of currentChatterStats) {
      const arr = chatterMap.get(s.employee_name) ?? [];
      arr.push(s);
      chatterMap.set(s.employee_name, arr);
    }

    const chatterRevenues: ChatterRevenue[] = [];
    for (const [name, stats] of chatterMap) {
      const totalSalesVal = stats.reduce((sum, s) => sum + s.sales, 0);
      const totalHours = stats.reduce((sum, s) => sum + s.clocked_hours, 0);
      const avgSph = totalHours > 0 ? totalSalesVal / totalHours : 0;

      const cvrValues = stats.filter(s => s.fan_cvr > 0).map(s => s.fan_cvr);
      const avgCvr = cvrValues.length > 0 ? cvrValues.reduce((a, b) => a + b, 0) / cvrValues.length : 0;

      const urValues = stats.filter(s => s.unlock_rate > 0).map(s => s.unlock_rate);
      const avgUr = urValues.length > 0 ? urValues.reduce((a, b) => a + b, 0) / urValues.length : 0;

      const team = stats[0]?.team ?? '';

      const dailySales = stats.map(s => ({
        date: s.date,
        sales: s.sales,
        sales_per_hour: s.sales_per_hour,
      })).sort((a, b) => a.date.localeCompare(b.date));

      chatterRevenues.push({
        employee_name: name,
        team,
        total_sales: Math.round(totalSalesVal * 100) / 100,
        sales_per_hour: Math.round(avgSph * 100) / 100,
        cvr: Math.round(avgCvr * 10) / 10,
        unlock_rate: Math.round(avgUr * 10) / 10,
        hours_worked: Math.round(totalHours * 10) / 10,
        daily_sales: dailySales,
      });
    }
    chatterRevenues.sort((a, b) => b.total_sales - a.total_sales);

    const topChatters = chatterRevenues.slice(0, 5);

    // --- Per-team revenue ---
    const teamMap = new Map<string, { sales: number; hours: number; chatters: Set<string>; dailyMap: Map<string, { sales: number; hours: number; count: number }> }>();
    for (const s of currentChatterStats) {
      const t = s.team || 'Unknown';
      const existing = teamMap.get(t) ?? { sales: 0, hours: 0, chatters: new Set<string>(), dailyMap: new Map() };
      existing.sales += s.sales;
      existing.hours += s.clocked_hours;
      existing.chatters.add(s.employee_name);

      const dayEntry = existing.dailyMap.get(s.date) ?? { sales: 0, hours: 0, count: 0 };
      dayEntry.sales += s.sales;
      dayEntry.hours += s.clocked_hours;
      dayEntry.count++;
      existing.dailyMap.set(s.date, dayEntry);

      teamMap.set(t, existing);
    }

    const teamRevenues: TeamRevenue[] = [];
    for (const [team, data] of teamMap) {
      const avgSph = data.hours > 0 ? data.sales / data.hours : 0;
      const dailySales = [...data.dailyMap.entries()]
        .map(([date, d]) => ({
          date,
          sales: Math.round(d.sales * 100) / 100,
          avg_sph: d.hours > 0 ? Math.round((d.sales / d.hours) * 100) / 100 : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      teamRevenues.push({
        team,
        total_sales: Math.round(data.sales * 100) / 100,
        avg_sales_per_hour: Math.round(avgSph * 100) / 100,
        chatter_count: data.chatters.size,
        daily_sales: dailySales,
      });
    }
    teamRevenues.sort((a, b) => b.total_sales - a.total_sales);

    // --- Adaptive Forecast (Holt's exponential smoothing) ---
    // Uses ALL available data (current + previous period) to train the model
    const allDailyMap = new Map<string, { total: number; fans: number; subs: number }>();
    for (const s of modelStats) {
      const existing = allDailyMap.get(s.date) ?? { total: 0, fans: 0, subs: 0 };
      existing.total += s.total_earnings;
      existing.fans += s.new_fans;
      existing.subs += s.subscription_earnings > 0 ? 1 : 0;
      allDailyMap.set(s.date, existing);
    }
    const allDailySorted = [...allDailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b));

    const revValues = allDailySorted.map(([, d]) => d.total);
    const fanValues = allDailySorted.map(([, d]) => d.fans);
    const subValues = allDailySorted.map(([, d]) => d.subs);

    const forecastDays = 3;
    const revForecast = holtForecast(revValues, forecastDays);
    const fanForecast = holtForecast(fanValues, forecastDays);
    const subForecast = holtForecast(subValues, forecastDays);

    const lastDate = allDailySorted.length > 0 ? allDailySorted[allDailySorted.length - 1]![0] : '';

    // Only output data within the current period + future
    const currentDates = dailyAggregated.map(d => d.date);
    const futureDates: string[] = [];
    if (lastDate) {
      for (let i = 1; i <= forecastDays; i++) {
        futureDates.push(addDays(lastDate, i));
      }
    }

    const forecastData: ForecastPoint[] = [];
    const prevPeriodLen = allDailySorted.length - dailyAggregated.length;

    for (let i = 0; i < dailyAggregated.length; i++) {
      const d = dailyAggregated[i]!;
      const fi = prevPeriodLen + i;
      forecastData.push({
        date: d.date,
        actual_revenue: Math.round(d.total),
        forecast_revenue: revForecast[fi] ?? Math.round(d.total),
        actual_fans: d.new_fans,
        forecast_fans: fanForecast[fi] ?? d.new_fans,
        actual_subs: d.subs,
        forecast_subs: subForecast[fi] ?? d.subs,
        is_future: false,
      });
    }

    for (let i = 0; i < forecastDays; i++) {
      const fi = allDailySorted.length + i;
      forecastData.push({
        date: futureDates[i] ?? '',
        actual_revenue: null,
        forecast_revenue: revForecast[fi] ?? 0,
        actual_fans: null,
        forecast_fans: fanForecast[fi] ?? 0,
        actual_subs: null,
        forecast_subs: subForecast[fi] ?? 0,
        is_future: true,
      });
    }

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgRevenuePerDay: Math.round(avgRevenuePerDay * 100) / 100,
      growthPct: Math.round(growthPct * 10) / 10,
      topModelName,
      dailyRevenue,
      revenueBySource,
      topModels,
      topChatters,
      modelRevenues,
      teamRevenues,
      chatterRevenues,
      forecastData,
      loading,
      error,
      refresh: fetchData,
    };
  }, [modelStats, chatterStats, models, loading, error, fetchData, currentCutoff]);
}

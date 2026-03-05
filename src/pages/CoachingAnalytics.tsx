import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { ChatterDailyStat } from '../types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw, TrendingUp,
  Users, DollarSign, BarChart3,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';

const TEAM_KEYS = ['huckle', 'danilyn', 'ezekiel'] as const;

const TEAM_CONFIG: Record<string, { name: string; color: string; bg: string }> = {
  huckle: { name: 'Huckle', color: '#f97316', bg: 'bg-orange-500' },
  danilyn: { name: 'Danilyn', color: '#3b82f6', bg: 'bg-blue-500' },
  ezekiel: { name: 'Ezekiel', color: '#a855f7', bg: 'bg-purple-500' },
};

type KpiKey = 'sales_per_hour' | 'fan_cvr' | 'sales' | 'fans_chatted' | 'clocked_hours';

const KPI_OPTIONS: { key: KpiKey; label: string; format: (v: number) => string }[] = [
  { key: 'sales_per_hour', label: 'Sales/hr', format: v => `$${v.toFixed(0)}` },
  { key: 'fan_cvr', label: 'CVR %', format: v => `${v.toFixed(1)}%` },
  { key: 'sales', label: 'Total Sales', format: v => `$${v.toFixed(0)}` },
  { key: 'fans_chatted', label: 'Total Fans', format: v => v.toFixed(0) },
  { key: 'clocked_hours', label: 'Total Hours', format: v => `${v.toFixed(1)}h` },
];

function getWeekRange(date: Date): { start: string; end: string; label: string } {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().split('T')[0]!;
  const label = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return { start: fmt(monday), end: fmt(sunday), label };
}

function normalizeTeam(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('huckle')) return 'huckle';
  if (lower.includes('danilyn')) return 'danilyn';
  if (lower.includes('ezekiel')) return 'ezekiel';
  return 'unknown';
}

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#888', fontSize: '11px' },
};

export default function CoachingAnalytics() {
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]!);
  const [data, setData] = useState<ChatterDailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareKpi, setCompareKpi] = useState<KpiKey>('sales_per_hour');

  const week = useMemo(() => getWeekRange(new Date(selectedDate + 'T00:00:00Z')), [selectedDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('chatter_daily_stats').select('*');
      if (mode === 'daily') {
        query = query.eq('date', selectedDate);
      } else {
        query = query.gte('date', week.start).lte('date', week.end);
      }
      const { data: rows, error: err } = await query.order('date');
      if (err) throw new Error(err.message);
      setData((rows ?? []) as ChatterDailyStat[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [mode, selectedDate, week.start, week.end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    if (mode === 'daily') {
      d.setUTCDate(d.getUTCDate() + dir);
    } else {
      d.setUTCDate(d.getUTCDate() + dir * 7);
    }
    setSelectedDate(d.toISOString().split('T')[0]!);
  };

  const activeChatters = useMemo(
    () => data.filter(r => r.clocked_hours >= 1),
    [data],
  );

  const teamAggregates = useMemo(() => {
    const map: Record<string, { sales: number; hours: number; fans: number; count: number; totalCvr: number; cvrN: number }> = {};
    for (const tk of TEAM_KEYS) map[tk] = { sales: 0, hours: 0, fans: 0, count: 0, totalCvr: 0, cvrN: 0 };

    for (const r of activeChatters) {
      const tk = normalizeTeam(r.team);
      const agg = map[tk];
      if (!agg) continue;
      agg.sales += r.sales;
      agg.hours += r.clocked_hours;
      agg.fans += r.fans_chatted;
      agg.count++;
      if (r.fan_cvr > 0) { agg.totalCvr += r.fan_cvr; agg.cvrN++; }
    }
    return map;
  }, [activeChatters]);

  // Team comparison chart data
  const teamCompareData = useMemo(() => {
    return TEAM_KEYS.map(tk => {
      const agg = teamAggregates[tk]!;
      const kpiOpt = KPI_OPTIONS.find(o => o.key === compareKpi)!;
      let value = 0;
      if (compareKpi === 'sales_per_hour') value = agg.hours > 0 ? agg.sales / agg.hours : 0;
      else if (compareKpi === 'fan_cvr') value = agg.cvrN > 0 ? agg.totalCvr / agg.cvrN : 0;
      else if (compareKpi === 'sales') value = agg.sales;
      else if (compareKpi === 'fans_chatted') value = agg.fans;
      else if (compareKpi === 'clocked_hours') value = agg.hours;
      return { name: TEAM_CONFIG[tk]!.name, value: +value.toFixed(2), fill: TEAM_CONFIG[tk]!.color, _fmt: kpiOpt.format };
    });
  }, [teamAggregates, compareKpi]);

  // Top chatters by sales/hr
  const topChatters = useMemo(() => {
    if (mode === 'daily') {
      return [...activeChatters]
        .filter(r => r.sales_per_hour > 0)
        .sort((a, b) => b.sales_per_hour - a.sales_per_hour)
        .slice(0, 15)
        .map(r => ({
          name: r.employee_name.split(' ')[0] ?? r.employee_name,
          value: +r.sales_per_hour.toFixed(1),
          team: normalizeTeam(r.team),
        }));
    }
    const chatterMap: Record<string, { sales: number; hours: number; team: string }> = {};
    for (const r of activeChatters) {
      if (!chatterMap[r.employee_name]) chatterMap[r.employee_name] = { sales: 0, hours: 0, team: r.team };
      chatterMap[r.employee_name]!.sales += r.sales;
      chatterMap[r.employee_name]!.hours += r.clocked_hours;
    }
    return Object.entries(chatterMap)
      .map(([name, agg]) => ({ name: name.split(' ')[0] ?? name, value: +(agg.hours > 0 ? agg.sales / agg.hours : 0).toFixed(1), team: normalizeTeam(agg.team) }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [activeChatters, mode]);

  // Sales timeline for weekly mode — daily totals per team
  const timelineData = useMemo(() => {
    if (mode !== 'weekly') return [];
    const dateMap: Record<string, Record<string, number>> = {};
    for (const r of activeChatters) {
      if (!dateMap[r.date]) dateMap[r.date] = {};
      const tk = normalizeTeam(r.team);
      dateMap[r.date]![tk] = (dateMap[r.date]![tk] ?? 0) + r.sales;
    }
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, teams]) => ({
        date: new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        huckle: +(teams.huckle ?? 0).toFixed(0),
        danilyn: +(teams.danilyn ?? 0).toFixed(0),
        ezekiel: +(teams.ezekiel ?? 0).toFixed(0),
      }));
  }, [activeChatters, mode]);

  // Donut data for daily mode — sales by team
  const donutData = useMemo(() => {
    if (mode !== 'daily') return [];
    return TEAM_KEYS.map(tk => ({
      name: TEAM_CONFIG[tk]!.name,
      value: +(teamAggregates[tk]?.sales ?? 0).toFixed(0),
      color: TEAM_CONFIG[tk]!.color,
    })).filter(d => d.value > 0);
  }, [teamAggregates, mode]);

  const totalSales = activeChatters.reduce((s, r) => s + r.sales, 0);
  const totalHours = activeChatters.reduce((s, r) => s + r.clocked_hours, 0);
  const avgSalesHr = totalHours > 0 ? totalSales / totalHours : 0;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Coaching Analytics</h1>
          <p className="text-text-secondary text-sm mt-1">
            Performance trends and team insights.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-2 rounded-lg p-0.5">
            <button
              onClick={() => setMode('daily')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'daily' ? 'bg-cw text-white' : 'text-text-secondary hover:text-white'}`}
            >
              Daily
            </button>
            <button
              onClick={() => setMode('weekly')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'weekly' ? 'bg-cw text-white' : 'text-text-secondary hover:text-white'}`}
            >
              Weekly
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigateDate(-1)} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted"><ChevronLeft size={16} /></button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 rounded-lg">
              <Calendar size={13} className="text-text-muted" />
              <span className="text-xs text-white font-medium">
                {mode === 'daily' ? selectedDate : week.label}
              </span>
            </div>
            <button onClick={() => navigateDate(1)} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted"><ChevronRight size={16} /></button>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary"><RefreshCw size={15} /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-cw" size={24} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : activeChatters.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl p-12 text-center">
          <BarChart3 size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">No performance data for this period.</p>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Users size={15} />} label="Active Chatters" value={activeChatters.length.toString()} />
            <StatCard icon={<DollarSign size={15} />} label="Total Sales" value={`$${totalSales.toFixed(0)}`} />
            <StatCard icon={<TrendingUp size={15} />} label="Avg Sales/hr" value={`$${avgSalesHr.toFixed(1)}`} accent />
            <StatCard icon={<BarChart3 size={15} />} label="Total Hours" value={`${totalHours.toFixed(0)}h`} />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales Timeline (weekly) / Donut (daily) */}
            <div className="bg-surface-1 border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold text-text-primary mb-4">
                {mode === 'weekly' ? 'Sales Timeline' : 'Sales by Team'}
              </h3>
              {mode === 'weekly' && timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                    <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#666', fontSize: 11 }} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {TEAM_KEYS.map(tk => (
                      <Line key={tk} type="monotone" dataKey={tk} stroke={TEAM_CONFIG[tk]!.color} strokeWidth={2} dot={{ r: 3 }} name={TEAM_CONFIG[tk]!.name} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : mode === 'daily' && donutData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {donutData.map(d => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="text-xs text-text-secondary">{d.name}</span>
                        <span className="text-xs font-bold text-white">${d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-text-muted text-xs py-8 text-center">No data available</p>
              )}
            </div>

            {/* Team KPI Comparison */}
            <div className="bg-surface-1 border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-primary">Team Comparison</h3>
                <select
                  value={compareKpi}
                  onChange={e => setCompareKpi(e.target.value as KpiKey)}
                  className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs text-white focus:border-cw outline-none"
                >
                  {KPI_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamCompareData} layout="vertical" barCategoryGap={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252525" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#666', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#999', fontSize: 12 }} width={65} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number) => {
                      const kpi = KPI_OPTIONS.find(o => o.key === compareKpi);
                      return kpi ? kpi.format(value) : value;
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {teamCompareData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top Chatters Ranking */}
            <div className="bg-surface-1 border border-border rounded-xl p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-text-primary mb-4">Top Chatters by Sales/hr</h3>
              {topChatters.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, topChatters.length * 28)}>
                  <BarChart data={topChatters} layout="vertical" barCategoryGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#252525" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#666', fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#999', fontSize: 11 }} width={70} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => `$${v}/hr`} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topChatters.map((d, i) => (
                        <Cell key={i} fill={TEAM_CONFIG[d.team]?.color ?? '#666'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-text-muted text-xs py-8 text-center">No sales data available</p>
              )}
            </div>
          </div>

          {/* Per-team breakdown cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEAM_KEYS.map(tk => {
              const agg = teamAggregates[tk]!;
              const shr = agg.hours > 0 ? agg.sales / agg.hours : 0;
              const cfg = TEAM_CONFIG[tk]!;
              return (
                <div key={tk} className="bg-surface-1 border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-1.5 h-6 rounded-full ${cfg.bg}`} />
                    <span className="text-sm font-bold text-white">{cfg.name}</span>
                    <span className="text-[10px] text-text-muted ml-auto">{agg.count} chatters</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-text-muted">Sales</p>
                      <p className="text-white font-bold">${agg.sales.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Sales/hr</p>
                      <p className="font-bold" style={{ color: cfg.color }}>${shr.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Hours</p>
                      <p className="text-white font-bold">{agg.hours.toFixed(0)}h</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Fans</p>
                      <p className="text-white font-bold">{agg.fans}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-text-muted">{icon}</span>
        <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">{label}</p>
      </div>
      <p className={`text-xl font-bold ${accent ? 'text-cw' : 'text-white'}`}>{value}</p>
    </div>
  );
}

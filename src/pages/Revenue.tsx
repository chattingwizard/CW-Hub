import { useState } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Crown, BarChart3,
  RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter,
  ComposedChart,
  CartesianGrid,
} from 'recharts';
import { useRevenueData, type ModelRevenue } from '../hooks/useRevenueData';
import { formatCurrency } from '../lib/utils';

type Tab = 'overview' | 'models' | 'teams' | 'compare';
type TimeRange = 7 | 14 | 30;

const COMPARE_COLORS = ['#1d9bf0', '#f59e0b', '#a855f7'];

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#e5e5e5' },
  labelStyle: { color: '#888', marginBottom: 4 },
};

const AXIS_TICK = { fill: '#888888', fontSize: 10 };

const SOURCE_COLORS = ['#1d9bf0', '#22c55e', '#f59e0b'];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, trend }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: number;
}) {
  return (
    <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#888] font-medium uppercase tracking-wide">{label}</span>
        <Icon size={14} className="text-[#555]" />
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {(sub || trend !== undefined) && (
        <div className="flex items-center gap-1.5">
          {trend !== undefined && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
          )}
          {sub && <span className="text-xs text-[#666]">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────

function ForecastChart({ title, data, valuePrefix = '', gradientId, color, yFormatter, compact }: {
  title: string;
  data: { label: string; actual: number | null; forecast: number }[];
  valuePrefix?: string;
  gradientId: string;
  color: string;
  yFormatter?: (v: number) => string;
  compact?: boolean;
}) {
  const defaultFormatter = (v: number) => {
    if (valuePrefix === '$') return `$${(v / 1000).toFixed(0)}k`;
    return `${v}`;
  };
  const fmt = yFormatter ?? defaultFormatter;

  return (
    <div className={`bg-[#111111] rounded-xl border border-[#1e1e1e] p-4 ${compact ? '' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-[#888]">
            <div className="w-3 h-0.5 rounded" style={{ background: color }} />
            Actual
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#888]">
            <div className="w-3 h-0.5 rounded" style={{ background: color, opacity: 0.5, borderTop: '1px dashed' }} />
            Forecast
          </div>
        </div>
      </div>
      <div className={compact ? 'h-44' : 'h-56'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmt} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | null, name: string) => {
              if (v === null) return ['—', name];
              const label = name === 'forecast' ? 'Forecast' : 'Actual';
              return [`${valuePrefix}${v.toLocaleString()}`, label];
            }} />
            <Area type="monotone" dataKey="actual" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
            <Line type="monotone" dataKey="forecast" stroke={color} strokeWidth={2} strokeDasharray="6 4" dot={false} strokeOpacity={0.6} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: ReturnType<typeof useRevenueData> }) {
  const fc = data.forecastData;
  const nextForecast = fc.find(f => f.is_future);
  const chartRevenue = fc.map(f => ({
    label: formatDateLabel(f.date),
    actual: f.actual_revenue,
    forecast: f.forecast_revenue,
  }));
  const chartFans = fc.map(f => ({
    label: formatDateLabel(f.date),
    actual: f.actual_fans,
    forecast: f.forecast_fans,
  }));
  const chartSubs = fc.map(f => ({
    label: formatDateLabel(f.date),
    actual: f.actual_subs,
    forecast: f.forecast_subs,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Revenue" value={formatCurrency(data.totalRevenue)} icon={DollarSign} trend={data.growthPct} sub="vs prev period" />
        <KpiCard label="Avg / Day" value={formatCurrency(data.avgRevenuePerDay)} icon={BarChart3} />
        <KpiCard label="Top Model" value={data.topModelName} icon={Crown} />
        <KpiCard label="Next Day Forecast" value={nextForecast ? formatCurrency(nextForecast.forecast_revenue) : '—'} icon={TrendingUp} sub="adaptive forecast" />
      </div>

      {/* Forecast vs Reality — Revenue */}
      <ForecastChart
        title="Revenue — Forecast vs Reality"
        data={chartRevenue}
        valuePrefix="$"
        gradientId="revFcGrad"
        color="#1d9bf0"
        yFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Forecast vs Reality — New Fans */}
        <ForecastChart
          title="New Fans — Forecast vs Reality"
          data={chartFans}
          gradientId="fansFcGrad"
          color="#22c55e"
          compact
        />

        {/* Forecast vs Reality — Subscriptions */}
        <ForecastChart
          title="Subscriptions — Forecast vs Reality"
          data={chartSubs}
          gradientId="subsFcGrad"
          color="#f59e0b"
          compact
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue by source donut — unchanged, kept below forecasts */}

        {/* Revenue by source donut */}
        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Revenue by Source</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.revenueBySource}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.revenueBySource.map((entry, i) => (
                    <Cell key={entry.name} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]!} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 mt-2">
            {data.revenueBySource.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                  <span className="text-[#aaa]">{s.name}</span>
                </div>
                <span className="text-white font-medium">${s.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Top 5 Models by Revenue</h3>
          <div className="space-y-2">
            {data.topModels.map((m, i) => (
              <div key={m.model_id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#555] w-4">{i + 1}</span>
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] text-[#555] font-bold">{m.model_name[0]}</div>
                  )}
                  <span className="text-sm text-white font-medium truncate max-w-[140px]">{m.model_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-white">{formatCurrency(m.total_revenue)}</span>
                  <span className="text-[10px] text-[#666] ml-1.5">{m.pct_of_total}%</span>
                </div>
              </div>
            ))}
            {data.topModels.length === 0 && <p className="text-xs text-[#555] text-center py-4">No data yet</p>}
          </div>
        </div>

        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Top 5 Chatters by Sales</h3>
          <div className="space-y-2">
            {data.topChatters.map((c, i) => (
              <div key={c.employee_name} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#555] w-4">{i + 1}</span>
                  <div className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] text-[#555] font-bold">{c.employee_name[0]}</div>
                  <div>
                    <span className="text-sm text-white font-medium truncate max-w-[120px] block">{c.employee_name}</span>
                    <span className="text-[10px] text-[#555]">{c.team}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-white">{formatCurrency(c.total_sales)}</span>
                  <span className="text-[10px] text-[#666] ml-1.5">${c.sales_per_hour}/hr</span>
                </div>
              </div>
            ))}
            {data.topChatters.length === 0 && <p className="text-xs text-[#555] text-center py-4">No data yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Models Tab ────────────────────────────────────────────────

function ModelsTab({ data }: { data: ReturnType<typeof useRevenueData> }) {
  const [sortBy, setSortBy] = useState<'revenue' | 'name' | 'fans'>('revenue');
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const filtered = data.modelRevenues
    .filter(m => filterType === 'all' || m.page_type === filterType)
    .sort((a, b) => {
      if (sortBy === 'name') return a.model_name.localeCompare(b.model_name);
      if (sortBy === 'fans') return b.new_fans_per_day - a.new_fans_per_day;
      return b.total_revenue - a.total_revenue;
    });

  const stackedData = data.dailyRevenue.map(d => ({
    label: formatDateLabel(d.date),
    Messages: Math.round(d.messages),
    Subscriptions: Math.round(d.subscriptions),
    Tips: Math.round(d.tips),
  }));

  const barData = filtered.slice(0, 15).map(m => ({
    name: m.model_name.length > 12 ? m.model_name.slice(0, 12) + '…' : m.model_name,
    revenue: Math.round(m.total_revenue),
  }));

  return (
    <div className="space-y-6">
      {/* Stacked area chart */}
      <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Revenue by Source Over Time</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stackedData}>
              <defs>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d9bf0" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#1d9bf0" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="tipGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name]} />
              <Area type="monotone" dataKey="Messages" stackId="1" stroke="#1d9bf0" fill="url(#msgGrad)" />
              <Area type="monotone" dataKey="Subscriptions" stackId="1" stroke="#22c55e" fill="url(#subGrad)" />
              <Area type="monotone" dataKey="Tips" stackId="1" stroke="#f59e0b" fill="url(#tipGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar chart ranking */}
      <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Model Revenue Ranking</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#1d9bf0" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* LTV Performance */}
      <LtvPerformanceSection models={filtered} />

      {/* OF Ranking Tracker */}
      <OfRankingChart models={filtered} />

      {/* Filters + Table */}
      <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">All Models</h3>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-white rounded-lg px-2 py-1.5 outline-none"
            >
              <option value="all">All Types</option>
              <option value="Free Page">Free Page</option>
              <option value="Paid Page">Paid Page</option>
              <option value="Mixed">Mixed</option>
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-white rounded-lg px-2 py-1.5 outline-none"
            >
              <option value="revenue">Sort: Revenue</option>
              <option value="fans">Sort: New Fans</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e1e1e] text-[#666]">
                <th className="text-left py-2 pr-3 font-medium">Model</th>
                <th className="text-right py-2 px-2 font-medium">Revenue</th>
                <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Rev/Day</th>
                <th className="text-right py-2 px-2 font-medium hidden md:table-cell">% Total</th>
                <th className="text-center py-2 px-2 font-medium hidden md:table-cell">Team</th>
                <th className="text-right py-2 px-2 font-medium hidden lg:table-cell">Adj LTV</th>
                <th className="text-right py-2 px-2 font-medium hidden lg:table-cell">Perf</th>
                <th className="text-right py-2 px-2 font-medium hidden lg:table-cell">Fans/Day</th>
                <th className="text-right py-2 pl-2 font-medium hidden xl:table-cell">OF Rank</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <ModelRow key={m.model_id} model={m} expanded={expandedModel === m.model_id} onToggle={() => setExpandedModel(expandedModel === m.model_id ? null : m.model_id)} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-xs text-[#555] text-center py-6">No models match the current filters</p>}
        </div>
      </div>
    </div>
  );
}

function ModelRow({ model: m, expanded, onToggle }: { model: ModelRevenue; expanded: boolean; onToggle: () => void }) {
  const miniData = m.daily.map(d => ({ label: formatDateLabel(d.date), revenue: Math.round(d.total) }));

  return (
    <>
      <tr className="border-b border-[#1e1e1e]/50 hover:bg-[#1a1a1a] cursor-pointer transition-colors" onClick={onToggle}>
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2">
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] text-[#555] font-bold flex-shrink-0">{m.model_name[0]}</div>
            )}
            <div>
              <span className="text-white font-medium text-xs">{m.model_name}</span>
              {m.page_type && <span className="text-[10px] text-[#555] ml-1.5">{m.page_type.replace(' Page', '')}</span>}
            </div>
          </div>
        </td>
        <td className="text-right py-2.5 px-2 text-white font-semibold">{formatCurrency(m.total_revenue)}</td>
        <td className="text-right py-2.5 px-2 text-[#aaa] hidden sm:table-cell">{formatCurrency(m.revenue_per_day)}</td>
        <td className="text-right py-2.5 px-2 text-[#aaa] hidden md:table-cell">{m.pct_of_total}%</td>
        <td className="text-center py-2.5 px-2 hidden md:table-cell">
          {m.team_number !== null ? (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.team_number <= 2 ? 'bg-green-500/15 text-green-400' : m.team_number <= 4 ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'}`}>
              T{m.team_number}
            </span>
          ) : <span className="text-[#444]">—</span>}
        </td>
        <td className="text-right py-2.5 px-2 text-[#aaa] hidden lg:table-cell">${m.adjusted_ltv}</td>
        <td className="text-right py-2.5 px-2 hidden lg:table-cell">
          {m.performance_ratio > 0 ? (
            <span className={`text-xs font-semibold ${m.performance_ratio >= 1.2 ? 'text-green-400' : m.performance_ratio >= 0.8 ? 'text-blue-400' : m.performance_ratio >= 0.5 ? 'text-orange-400' : 'text-red-400'}`}>
              {m.performance_ratio}x
            </span>
          ) : <span className="text-[#444]">—</span>}
        </td>
        <td className="text-right py-2.5 px-2 text-[#aaa] hidden lg:table-cell">{m.new_fans_per_day}</td>
        <td className="text-right py-2.5 pl-2 text-[#aaa] hidden xl:table-cell">{m.of_ranking ?? '—'}</td>
        <td className="py-2.5 pl-1">
          {expanded ? <ChevronUp size={12} className="text-[#555]" /> : <ChevronDown size={12} className="text-[#555]" />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className="pb-4 pt-1 px-2">
            <div className="bg-[#0d0d0d] rounded-lg border border-[#1e1e1e] p-3">
              <p className="text-[10px] text-[#666] mb-2 font-medium uppercase tracking-wide">Daily Breakdown — {m.model_name}</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={miniData}>
                    <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']} />
                    <Bar dataKey="revenue" fill="#1d9bf0" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── LTV Performance Section ───────────────────────────────────

const PERF_LABEL: Record<string, { text: string; color: string }> = {
  star: { text: 'Star', color: 'text-green-400' },
  good: { text: 'Good', color: 'text-blue-400' },
  average: { text: 'Average', color: 'text-[#888]' },
  under: { text: 'Under', color: 'text-orange-400' },
  poor: { text: 'Poor', color: 'text-red-400' },
};

function getPerfLabel(ratio: number): { text: string; color: string } {
  if (ratio >= 2) return PERF_LABEL.star!;
  if (ratio >= 1.2) return PERF_LABEL.good!;
  if (ratio >= 0.8) return PERF_LABEL.average!;
  if (ratio >= 0.5) return PERF_LABEL.under!;
  return PERF_LABEL.poor!;
}

function LtvPerformanceSection({ models }: { models: ModelRevenue[] }) {
  const withLtv = models.filter(m => m.expected_daily_value > 0 && m.performance_ratio > 0);

  if (withLtv.length === 0) return null;

  const scatterData = withLtv.map(m => ({
    x: m.expected_daily_value,
    y: m.revenue_per_day,
    name: m.model_name,
    team: m.team_number !== null ? `Team ${m.team_number}` : '—',
    pageType: m.page_type?.replace(' Page', '') ?? '—',
    ratio: m.performance_ratio,
  }));

  const barData = [...withLtv]
    .sort((a, b) => b.performance_ratio - a.performance_ratio)
    .slice(0, 15)
    .map(m => ({
      name: m.model_name.length > 10 ? m.model_name.slice(0, 10) + '…' : m.model_name,
      ratio: m.performance_ratio,
      fill: m.performance_ratio >= 1.2 ? '#22c55e' : m.performance_ratio >= 0.8 ? '#1d9bf0' : m.performance_ratio >= 0.5 ? '#f59e0b' : '#ef4444',
    }));

  return (
    <div className="space-y-4">
      <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
        <h3 className="text-sm font-semibold text-white mb-1">LTV Performance Analysis</h3>
        <p className="text-[10px] text-[#666] mb-4">
          Adjusted LTV = Base LTV (Free $2 / Paid $20 / Mixed $8) x Team Multiplier (Team 1: x2.0, Team 2: x1.5, Team 3: x1.2, Teams 4-5: x1.0, Teams 6+: x0.7).
          Performance ratio = Actual Rev/Day / Expected Rev/Day. Above 1.0 = overperforming.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Scatter: expected vs actual */}
          <div>
            <p className="text-xs text-[#888] font-medium mb-2">Expected vs Actual Revenue/Day</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis type="number" dataKey="x" name="Expected" tick={AXIS_TICK} axisLine={false} tickLine={false}
                    label={{ value: 'Expected $/day', position: 'insideBottom', offset: -2, style: { fill: '#555', fontSize: 10 } }}
                    tickFormatter={(v: number) => `$${v}`} />
                  <YAxis type="number" dataKey="y" name="Actual" tick={AXIS_TICK} axisLine={false} tickLine={false}
                    label={{ value: 'Actual $/day', angle: -90, position: 'insideLeft', style: { fill: '#555', fontSize: 10 } }}
                    tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]?.payload as typeof scatterData[number] | undefined;
                      if (!p) return null;
                      const perf = getPerfLabel(p.ratio);
                      return (
                        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
                          <p className="text-white font-medium">{p.name}</p>
                          <p className="text-[#888]">{p.team} · {p.pageType}</p>
                          <p className="text-[#aaa] mt-1">Expected: ${p.x.toFixed(0)}/day</p>
                          <p className="text-[#aaa]">Actual: ${p.y.toFixed(0)}/day</p>
                          <p className={`mt-1 font-semibold ${perf.color}`}>Ratio: {p.ratio}x — {perf.text}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fillOpacity={0.7} r={8}>
                    {scatterData.map((entry, i) => {
                      const color = entry.ratio >= 1.2 ? '#22c55e' : entry.ratio >= 0.8 ? '#1d9bf0' : entry.ratio >= 0.5 ? '#f59e0b' : '#ef4444';
                      return <Cell key={i} fill={color} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance ratio bars */}
          <div>
            <p className="text-xs text-[#888] font-medium mb-2">Performance Ratio (Actual / Expected)</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}x`} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={80} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}x`, 'Ratio']} />
                  <Bar dataKey="ratio" radius={[0, 3, 3, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-[10px]"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-green-400">Star (2x+)</span></div>
          <div className="flex items-center gap-1.5 text-[10px]"><div className="w-2 h-2 rounded-full bg-[#1d9bf0]" /><span className="text-blue-400">Good (1.2x+)</span></div>
          <div className="flex items-center gap-1.5 text-[10px]"><div className="w-2 h-2 rounded-full bg-[#f59e0b]" /><span className="text-orange-400">Under (0.5-0.8x)</span></div>
          <div className="flex items-center gap-1.5 text-[10px]"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-red-400">Poor (&lt;0.5x)</span></div>
        </div>
      </div>
    </div>
  );
}

// ── OF Ranking Chart ──────────────────────────────────────────

function OfRankingChart({ models }: { models: ModelRevenue[] }) {
  const modelsWithRankings = models.filter(m =>
    m.daily_rankings.some(r => r.ranking !== null)
  );
  const top8 = modelsWithRankings.slice(0, 8);

  if (top8.length === 0) return null;

  const allDates = [...new Set(top8.flatMap(m => m.daily_rankings.map(r => r.date)))].sort();

  const chartData = allDates.map(date => {
    const entry: Record<string, string | number | null> = { label: formatDateLabel(date) };
    for (const m of top8) {
      const r = m.daily_rankings.find(d => d.date === date);
      entry[m.model_name] = r?.ranking ?? null;
    }
    return entry;
  });

  const rankColors = ['#1d9bf0', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
      <h3 className="text-sm font-semibold text-white mb-1">OF Ranking Tracker</h3>
      <p className="text-[10px] text-[#666] mb-3">Lower = better ranking. Top 8 models with ranking data.</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} reversed domain={['dataMin', 'dataMax']} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | null, name: string) => [v !== null ? `#${v}` : '—', name]} />
            {top8.map((m, i) => (
              <Line
                key={m.model_id}
                type="monotone"
                dataKey={m.model_name}
                stroke={rankColors[i % rankColors.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        {top8.map((m, i) => (
          <div key={m.model_id} className="flex items-center gap-1.5 text-[10px] text-[#aaa]">
            <div className="w-2 h-2 rounded-full" style={{ background: rankColors[i % rankColors.length] }} />
            {m.model_name}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compare Tab ───────────────────────────────────────────────

function CompareTab({ data }: { data: ReturnType<typeof useRevenueData> }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleModel = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const selected = selectedIds
    .map(id => data.modelRevenues.find(m => m.model_id === id))
    .filter((m): m is ModelRevenue => m !== undefined);

  const allDates = [...new Set(selected.flatMap(m => m.daily.map(d => d.date)))].sort();

  const revenueChartData = allDates.map(date => {
    const entry: Record<string, string | number | null> = { label: formatDateLabel(date) };
    for (const m of selected) {
      const day = m.daily.find(d => d.date === date);
      entry[m.model_name] = day ? Math.round(day.total) : null;
    }
    return entry;
  });

  const fansChartData = allDates.map(date => {
    const entry: Record<string, string | number | null> = { label: formatDateLabel(date) };
    for (const m of selected) {
      const day = m.daily_fans.find(d => d.date === date);
      entry[m.model_name] = day?.new_fans ?? null;
    }
    return entry;
  });

  const sourceData = selected.map(m => ({
    name: m.model_name.length > 10 ? m.model_name.slice(0, 10) + '…' : m.model_name,
    Messages: Math.round(m.message_revenue),
    Subscriptions: Math.round(m.subscription_revenue),
    Tips: Math.round(m.tips_revenue),
  }));

  return (
    <div className="space-y-6">
      {/* Model selector */}
      <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Select Models to Compare</h3>
          <span className="text-[10px] text-[#555]">{selectedIds.length}/3 selected</span>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {data.modelRevenues.filter(m => m.total_revenue > 0).map(m => {
            const isSelected = selectedIds.includes(m.model_id);
            const colorIdx = selectedIds.indexOf(m.model_id);
            return (
              <button
                key={m.model_id}
                onClick={() => toggleModel(m.model_id)}
                disabled={!isSelected && selectedIds.length >= 3}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-cw/15 text-white border border-cw/40'
                    : selectedIds.length >= 3
                      ? 'bg-[#1a1a1a] text-[#444] border border-[#1e1e1e] cursor-not-allowed'
                      : 'bg-[#1a1a1a] text-[#aaa] border border-[#1e1e1e] hover:border-[#333] hover:text-white'
                }`}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full" style={{ background: COMPARE_COLORS[colorIdx] ?? '#1d9bf0' }} />
                )}
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-[#222] flex items-center justify-center text-[8px] text-[#555] font-bold">{m.model_name[0]}</div>
                )}
                {m.model_name}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-8 text-center">
          <p className="text-sm text-[#555]">Select up to 3 models above to compare them side by side</p>
        </div>
      ) : (
        <>
          {/* KPI comparison cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {selected.map((m, i) => (
              <div key={m.model_id} className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] text-[#555] font-bold">{m.model_name[0]}</div>
                  )}
                  <span className="text-sm font-semibold text-white truncate">{m.model_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#666]">Revenue</span>
                    <p className="text-white font-semibold">{formatCurrency(m.total_revenue)}</p>
                  </div>
                  <div>
                    <span className="text-[#666]">Rev/Day</span>
                    <p className="text-white font-semibold">{formatCurrency(m.revenue_per_day)}</p>
                  </div>
                  <div>
                    <span className="text-[#666]">Fans/Day</span>
                    <p className="text-white font-semibold">{m.new_fans_per_day}</p>
                  </div>
                  <div>
                    <span className="text-[#666]">Active Fans</span>
                    <p className="text-white font-semibold">{m.active_fans.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-[#666]">OF Rank</span>
                    <p className="text-white font-semibold">{m.of_ranking ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-[#666]">% Total</span>
                    <p className="text-white font-semibold">{m.pct_of_total}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue over time comparison */}
          <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Revenue Over Time</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | null, name: string) => [v !== null ? `$${v.toLocaleString()}` : '—', name]} />
                  {selected.map((m, i) => (
                    <Line key={m.model_id} type="monotone" dataKey={m.model_name} stroke={COMPARE_COLORS[i]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* New fans over time comparison */}
          <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">New Fans / Day</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fansChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | null, name: string) => [v !== null ? v.toLocaleString() : '—', name]} />
                  {selected.map((m, i) => (
                    <Line key={m.model_id} type="monotone" dataKey={m.model_name} stroke={COMPARE_COLORS[i]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue by source stacked bars comparison */}
          <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Revenue by Source</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
                  <Bar dataKey="Messages" stackId="1" fill="#1d9bf0" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Subscriptions" stackId="1" fill="#22c55e" />
                  <Bar dataKey="Tips" stackId="1" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5 text-[10px] text-[#aaa]"><div className="w-2 h-2 rounded-full bg-[#1d9bf0]" />Messages</div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#aaa]"><div className="w-2 h-2 rounded-full bg-[#22c55e]" />Subscriptions</div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#aaa]"><div className="w-2 h-2 rounded-full bg-[#f59e0b]" />Tips</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Teams Tab ─────────────────────────────────────────────────

function TeamsTab({ data }: { data: ReturnType<typeof useRevenueData> }) {
  const teamColors: Record<string, string> = {
    'Team Danilyn': '#3b82f6',
    'Team Huckle': '#f97316',
    'Team Ezekiel': '#a855f7',
  };

  const teamBarData = data.teamRevenues.map(t => ({
    name: t.team,
    sales: Math.round(t.total_sales),
    fill: teamColors[t.team] ?? '#1d9bf0',
  }));

  // Sales/hr per team over time
  const allDates = [...new Set(data.teamRevenues.flatMap(t => t.daily_sales.map(d => d.date)))].sort();
  const sphData = allDates.map(date => {
    const entry: Record<string, string | number> = { label: formatDateLabel(date) };
    for (const t of data.teamRevenues) {
      const day = t.daily_sales.find(d => d.date === date);
      entry[t.team] = day?.avg_sph ?? 0;
    }
    return entry;
  });

  // Scatter: sales/hr vs hours
  const scatterData = data.chatterRevenues
    .filter(c => c.hours_worked > 0 && c.sales_per_hour > 0)
    .map(c => ({
      x: c.hours_worked,
      y: c.sales_per_hour,
      name: c.employee_name,
      team: c.team,
    }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team sales bar */}
        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Total Sales by Team</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Sales']} />
                <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                  {teamBarData.map(entry => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales/hr over time */}
        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Sales/hr Trend by Team</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sphData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [`$${v.toFixed(2)}/hr`, name]} />
                {data.teamRevenues.map(t => (
                  <Line
                    key={t.team}
                    type="monotone"
                    dataKey={t.team}
                    stroke={teamColors[t.team] ?? '#1d9bf0'}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2">
            {data.teamRevenues.map(t => (
              <div key={t.team} className="flex items-center gap-1.5 text-[10px] text-[#aaa]">
                <div className="w-2 h-2 rounded-full" style={{ background: teamColors[t.team] ?? '#1d9bf0' }} />
                {t.team}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scatter plot */}
      {scatterData.length > 0 && (
        <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
          <h3 className="text-sm font-semibold text-white mb-1">Efficiency Map</h3>
          <p className="text-[10px] text-[#666] mb-3">Sales/hr vs Hours Worked — top-right = high efficiency + high volume</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                <XAxis type="number" dataKey="x" name="Hours" tick={AXIS_TICK} axisLine={false} tickLine={false} label={{ value: 'Hours worked', position: 'insideBottom', offset: -2, style: { fill: '#555', fontSize: 10 } }} />
                <YAxis type="number" dataKey="y" name="Sales/hr" tick={AXIS_TICK} axisLine={false} tickLine={false} label={{ value: '$/hr', angle: -90, position: 'insideLeft', style: { fill: '#555', fontSize: 10 } }} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => {
                    if (name === 'Hours') return [`${v.toFixed(1)}h`, 'Hours'];
                    return [`$${v.toFixed(2)}`, 'Sales/hr'];
                  }}
                  labelFormatter={() => ''}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as typeof scatterData[number] | undefined;
                    if (!p) return null;
                    return (
                      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
                        <p className="text-white font-medium">{p.name}</p>
                        <p className="text-[#888]">{p.team}</p>
                        <p className="text-[#aaa] mt-1">${p.y.toFixed(2)}/hr · {p.x.toFixed(1)}h</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill="#1d9bf0" fillOpacity={0.7} r={4} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top chatters table */}
      <div className="bg-[#111111] rounded-xl border border-[#1e1e1e] p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Top Chatters by Sales</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e1e1e] text-[#666]">
                <th className="text-left py-2 pr-2 font-medium w-6">#</th>
                <th className="text-left py-2 pr-3 font-medium">Chatter</th>
                <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Team</th>
                <th className="text-right py-2 px-2 font-medium">Sales</th>
                <th className="text-right py-2 px-2 font-medium">$/hr</th>
                <th className="text-right py-2 px-2 font-medium hidden md:table-cell">CVR</th>
                <th className="text-right py-2 px-2 font-medium hidden md:table-cell">Unlock %</th>
                <th className="text-right py-2 pl-2 font-medium hidden lg:table-cell">Hours</th>
              </tr>
            </thead>
            <tbody>
              {data.chatterRevenues.slice(0, 15).map((c, i) => (
                <tr key={c.employee_name} className="border-b border-[#1e1e1e]/50 hover:bg-[#1a1a1a] transition-colors">
                  <td className="py-2.5 pr-2 text-[#555] font-bold">{i + 1}</td>
                  <td className="py-2.5 pr-3 text-white font-medium">{c.employee_name}</td>
                  <td className="py-2.5 px-2 text-[#aaa] hidden sm:table-cell">{c.team}</td>
                  <td className="text-right py-2.5 px-2 text-white font-semibold">{formatCurrency(c.total_sales)}</td>
                  <td className="text-right py-2.5 px-2 text-[#aaa]">${c.sales_per_hour}</td>
                  <td className="text-right py-2.5 px-2 text-[#aaa] hidden md:table-cell">{c.cvr}%</td>
                  <td className="text-right py-2.5 px-2 text-[#aaa] hidden md:table-cell">{c.unlock_rate}%</td>
                  <td className="text-right py-2.5 pl-2 text-[#aaa] hidden lg:table-cell">{c.hours_worked}h</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.chatterRevenues.length === 0 && <p className="text-xs text-[#555] text-center py-6">No chatter data for this period</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function Revenue() {
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState<TimeRange>(7);
  const data = useRevenueData(days);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'models', label: 'Models' },
    { id: 'teams', label: 'Teams' },
    { id: 'compare', label: 'Compare' },
  ];

  const ranges: TimeRange[] = [7, 14, 30];

  if (data.loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex items-center gap-2 text-[#888]">
            <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading revenue data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <p className="text-[#888] text-sm">{data.error}</p>
          <button onClick={data.refresh} className="px-4 py-2 rounded-lg bg-cw text-white text-sm font-medium hover:bg-cw/90 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Revenue</h1>
          <p className="text-xs text-[#666] mt-0.5">Financial performance across models and teams</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#111111] border border-[#1e1e1e] rounded-lg overflow-hidden">
            {ranges.map(r => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === r ? 'bg-cw text-white' : 'text-[#888] hover:text-white'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <button onClick={data.refresh} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-[#666] hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#1e1e1e]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.id ? 'text-white' : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            {t.label}
            {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cw rounded-t" />}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'models' && <ModelsTab data={data} />}
      {tab === 'teams' && <TeamsTab data={data} />}
      {tab === 'compare' && <CompareTab data={data} />}
    </div>
  );
}

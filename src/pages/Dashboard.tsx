import { useState } from 'react';
import { formatCurrency, formatNumber } from '../lib/utils';
import {
  DollarSign, Users, TrendingUp, MessageSquare,
  Upload, X, Filter,
  ArrowUpRight, ArrowDownRight, Minus, Heart,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ModelAvatar from '../components/ModelAvatar';
import TrafficBadge from '../components/TrafficBadge';
import { PageTypeBadge } from '../components/TrafficBadge';
import CreatorReportUpload from '../components/CreatorReportUpload';
import { useTrafficData } from '../hooks/useTrafficData';

export default function Dashboard() {
  const [showCreatorUpload, setShowCreatorUpload] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Live');
  const [sortBy, setSortBy] = useState<'revenue' | 'name' | 'fans' | 'workload'>('workload');
  const { modelTraffic, loading, refresh: refreshTraffic } = useTrafficData();

  // Filter and sort
  const tableData = modelTraffic
    .filter((t) => statusFilter === 'all' || t.model_status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'revenue') return b.earnings_per_day - a.earnings_per_day;
      if (sortBy === 'fans') return b.new_fans_avg - a.new_fans_avg;
      if (sortBy === 'workload') return b.workload_pct - a.workload_pct;
      return a.model_name.localeCompare(b.model_name);
    });

  // Aggregate KPIs from Live models only
  const liveModels = modelTraffic.filter((t) => t.model_status === 'Live');
  const totalRevenuePerDay = liveModels.reduce((sum, t) => sum + t.earnings_per_day, 0);
  const totalTipsPerDay = liveModels.reduce((sum, t) => sum + t.tips_per_day, 0);
  const totalNewFansPerDay = liveModels.reduce((sum, t) => sum + t.new_fans_avg, 0);
  const activeModelCount = liveModels.length;
  const modelsWithRevenue = liveModels.filter((t) => t.earnings_per_day > 0).length;

  // Status options from actual data
  const statuses = [...new Set(modelTraffic.map((t) => t.model_status))].sort();

  // Chart data: top 15 by revenue
  const chartData = tableData
    .filter((t) => t.earnings_per_day > 0)
    .slice(0, 15)
    .map((t) => ({
      name: t.model_name.length > 12 ? t.model_name.slice(0, 12) + '…' : t.model_name,
      revenue: Math.round(t.earnings_per_day),
    }));

  const statusBadge = (status: string) => {
    const c: Record<string, string> = {
      Live: 'bg-success/15 text-success border-success/30',
      'On Hold': 'bg-warning/15 text-warning border-warning/30',
      Dead: 'bg-danger/15 text-danger border-danger/30',
      'Pending Invoice': 'bg-cw/15 text-cw border-cw/30',
    };
    return c[status] ?? 'bg-surface-3 text-text-secondary border-border';
  };

  const TrendBadge = ({ pct }: { pct: number }) => {
    if (Math.abs(pct) < 1) return <span className="text-text-muted text-[10px] flex items-center gap-0.5"><Minus size={10} /> —</span>;
    const isUp = pct > 0;
    return (
      <span className={`text-[10px] flex items-center gap-0.5 ${isUp ? 'text-success' : 'text-danger'}`}>
        {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(pct).toFixed(0)}%
      </span>
    );
  };

  const kpiCards = [
    { label: 'Revenue / day', value: formatCurrency(totalRevenuePerDay), icon: DollarSign, color: 'text-cw', bgColor: 'bg-cw/10' },
    { label: 'Live Models', value: `${activeModelCount}`, sub: `${modelsWithRevenue} reporting`, icon: Users, color: 'text-success', bgColor: 'bg-success/10' },
    { label: 'New Fans / day', value: formatNumber(Math.round(totalNewFansPerDay)), icon: TrendingUp, color: 'text-cw-light', bgColor: 'bg-cw-light/10' },
    { label: 'Tips / day', value: formatCurrency(totalTipsPerDay), icon: Heart, color: 'text-warning', bgColor: 'bg-warning/10' },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Performance</h1>
          <p className="text-sm text-text-secondary mt-1">
            Daily averages from Creator Reports &middot; {modelsWithRevenue} models reporting
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowCreatorUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium">
            <Upload size={16} /> Upload Creator Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-surface-1 border border-border rounded-xl p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs lg:text-sm text-text-secondary">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                <card.icon size={16} className={card.color} />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-white">{loading ? '—' : card.value}</p>
            {'sub' in card && card.sub && <p className="text-[10px] text-text-muted mt-1">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      {!loading && chartData.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue / day by Model</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: '#888888', fontSize: 10 }}
                axisLine={{ stroke: '#2a2a2a' }}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: '#555555', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
              />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                formatter={(value: number) => [`$${value.toLocaleString()}/day`, 'Revenue']}
                cursor={{ fill: 'rgba(29, 155, 240, 0.08)' }}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#1d9bf0' : i < 3 ? '#1680c7' : '#1a5a8a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-text-muted" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:border-cw focus:outline-none">
            <option value="all">All Status</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:border-cw focus:outline-none">
            <option value="revenue">Sort: Revenue</option>
            <option value="fans">Sort: New Fans</option>
            <option value="workload">Sort: Workload</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
        <span className="text-xs text-text-muted">{tableData.length} models</span>
      </div>

      {/* Models Table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Model', 'Type', 'Revenue/day', 'Trend', 'New Fans/day', 'Tips/day', 'Msg Rev/day', 'Workload'].map((h) => (
                  <th key={h} className="text-left px-4 py-3.5 text-text-secondary font-medium text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-text-secondary">
                  <div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />Loading...</div>
                </td></tr>
              ) : tableData.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-text-secondary">No models found. Upload a Creator Report to see performance data.</td></tr>
              ) : (
                tableData.map((t) => (
                  <tr key={t.model_id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <ModelAvatar name={t.model_name} size="sm" />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-1 ${t.model_status === 'Live' ? 'bg-success' : t.model_status === 'On Hold' ? 'bg-warning' : 'bg-danger'}`} />
                        </div>
                        <div>
                          <span className="text-white font-medium">{t.model_name}</span>
                          {t.team_names.length > 0 && <p className="text-[10px] text-text-muted">{t.team_names.join(', ')}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PageTypeBadge pageType={t.page_type} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">
                        {t.earnings_per_day > 0 ? formatCurrency(t.earnings_per_day) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TrendBadge pct={t.earnings_trend_pct} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-text-secondary">
                        {t.new_fans_avg > 0 ? formatNumber(Math.round(t.new_fans_avg)) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-text-secondary">
                        {t.tips_per_day > 0 ? formatCurrency(t.tips_per_day) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-text-secondary">
                        {t.message_earnings_per_day > 0 ? formatCurrency(t.message_earnings_per_day) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TrafficBadge traffic={t} showTrend />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* No Data Hint */}
      {!loading && modelsWithRevenue === 0 && (
        <div className="mt-4 bg-surface-1 border border-cw/30 rounded-xl p-5 text-center">
          <MessageSquare size={24} className="text-cw mx-auto mb-2" />
          <p className="text-white font-medium mb-1">No performance data yet</p>
          <p className="text-sm text-text-secondary mb-3">
            Upload a Creator Report (.xlsx) from Infloww to populate revenue, fans, and tips data.
          </p>
          <button onClick={() => setShowCreatorUpload(true)} className="px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium">
            Upload Creator Report
          </button>
        </div>
      )}

      {/* Creator Report Upload Modal */}
      {showCreatorUpload && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCreatorUpload(false)}>
          <div className="bg-surface-1 border border-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Upload Creator Report</h2>
              <button onClick={() => setShowCreatorUpload(false)} className="text-text-secondary hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Upload the Creator Report (.xlsx) from Infloww. Creator names must match model names in the system.
            </p>
            <CreatorReportUpload onUploadComplete={() => { refreshTraffic(); setShowCreatorUpload(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}

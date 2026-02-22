import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import type { ChatterDailyStat } from '../types';
import {
  Search, ChevronDown, ChevronUp, ArrowUpDown,
  DollarSign, Unlock, Target, MessageSquare, Clock, Users as UsersIcon,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────
const MIN_HOURS_FULL_SHIFT = 4;

const TEAM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Team Danilyn': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Team Huckle': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  'Team Ezekiel': { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
};

// ── KPI thresholds ──────────────────────────────────────────
function getKPIColor(metric: string, value: number): string {
  switch (metric) {
    case 'fan_cvr':
      return value >= 12 ? 'text-success' : value >= 8 ? 'text-warning' : 'text-danger';
    case 'golden_ratio':
      return value >= 4 ? 'text-success' : value >= 2.5 ? 'text-warning' : 'text-danger';
    case 'unlock_rate':
      return value >= 40 ? 'text-success' : value >= 25 ? 'text-warning' : 'text-danger';
    case 'sales_per_hour':
      return value >= 80 ? 'text-success' : value >= 50 ? 'text-warning' : 'text-danger';
    case 'messages_per_hour':
      return value >= 100 ? 'text-success' : value >= 60 ? 'text-warning' : 'text-danger';
    default:
      return 'text-white';
  }
}

type SortField = 'employee_name' | 'sales' | 'fan_cvr' | 'golden_ratio' | 'unlock_rate' | 'sales_per_hour' | 'messages_per_hour' | 'fans_chatted' | 'clocked_hours' | 'response_time_clocked';
type SortDir = 'asc' | 'desc';

export default function ChatterPerformance() {
  const [stats, setStats] = useState<ChatterDailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('sales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedChatter, setExpandedChatter] = useState<string | null>(null);
  const [chatterTeamMap, setChatterTeamMap] = useState<Map<string, string>>(new Map());

  // ── Load canonical chatter→team mapping from Supabase ─────
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('chatters')
        .select('full_name, team_name')
        .eq('status', 'Active')
        .eq('airtable_role', 'Chatter');
      if (data) {
        const map = new Map<string, string>();
        for (const c of data as { full_name: string; team_name: string | null }[]) {
          const key = c.full_name.toLowerCase().trim().replace(/\s+/g, ' ');
          map.set(key, c.team_name ?? '');
        }
        setChatterTeamMap(map);
      }
    })();
  }, []);

  // ── Fetch available dates ─────────────────────────────────
  const fetchDates = useCallback(async () => {
    const { data } = await supabase
      .from('chatter_daily_stats')
      .select('date')
      .order('date', { ascending: false });

    if (data) {
      const unique = [...new Set(data.map((d: { date: string }) => d.date))];
      setDates(unique);
      if (unique.length > 0 && !selectedDate) {
        setSelectedDate(unique[0]!);
      }
    }
  }, [selectedDate]);

  // ── Fetch stats for selected date ─────────────────────────
  const fetchStats = useCallback(async () => {
    if (!selectedDate || chatterTeamMap.size === 0) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('chatter_daily_stats')
      .select('*')
      .eq('date', selectedDate)
      .order('sales', { ascending: false });

    if (!error && data) {
      const raw = data as ChatterDailyStat[];
      const enriched = raw
        .map((s) => {
          const key = s.employee_name.toLowerCase().trim().replace(/\s+/g, ' ');
          const realTeam = chatterTeamMap.get(key);
          if (realTeam === undefined) return null;
          return { ...s, team: realTeam || s.team };
        })
        .filter((s): s is ChatterDailyStat => s !== null);
      setStats(enriched);
    }
    setLoading(false);
  }, [selectedDate, chatterTeamMap]);

  useEffect(() => { fetchDates(); }, [fetchDates]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Derived data ──────────────────────────────────────────
  const teams = useMemo(() => {
    const t = new Set(stats.map((s) => s.team).filter(Boolean));
    return ['all', ...Array.from(t).sort()];
  }, [stats]);

  const filtered = useMemo(() => {
    let result = stats;
    if (teamFilter !== 'all') {
      result = result.filter((s) => s.team === teamFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.employee_name.toLowerCase().includes(q) ||
          (s.creators || '').toLowerCase().includes(q)
      );
    }
    result = result.filter((s) => s.clocked_hours >= MIN_HOURS_FULL_SHIFT);

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortField === 'employee_name') {
        aVal = a.employee_name.toLowerCase();
        bVal = b.employee_name.toLowerCase();
        return sortDir === 'asc'
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      
      if (sortField === 'response_time_clocked') {
        aVal = parseResponseTime(a.response_time_clocked);
        bVal = parseResponseTime(b.response_time_clocked);
      } else {
        aVal = (a as any)[sortField] ?? 0;
        bVal = (b as any)[sortField] ?? 0;
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [stats, teamFilter, search, sortField, sortDir]);

  // ── Team aggregates ───────────────────────────────────────
  const teamAggs = useMemo(() => {
    const map: Record<string, { sales: number; chatters: number; fans: number; hours: number; salesHrValues: number[] }> = {};
    for (const s of stats.filter((s) => s.clocked_hours >= MIN_HOURS_FULL_SHIFT)) {
      if (!s.team) continue;
      if (!map[s.team]) map[s.team] = { sales: 0, chatters: 0, fans: 0, hours: 0, salesHrValues: [] };
      map[s.team]!.sales += s.sales;
      map[s.team]!.chatters += 1;
      map[s.team]!.fans += s.fans_chatted;
      map[s.team]!.hours += s.clocked_hours;
      if (s.sales_per_hour > 0) map[s.team]!.salesHrValues.push(s.sales_per_hour);
    }
    return Object.entries(map)
      .map(([team, d]) => ({
        team,
        sales: d.sales,
        chatters: d.chatters,
        fans: d.fans,
        hours: d.hours,
        avgSalesHr: d.salesHrValues.length ? d.salesHrValues.reduce((a, b) => a + b, 0) / d.salesHrValues.length : 0,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [stats]);

  // ── Global totals ─────────────────────────────────────────
  const totals = useMemo(() => {
    const working = stats.filter((s) => s.clocked_hours >= MIN_HOURS_FULL_SHIFT);
    return {
      totalSales: working.reduce((s, c) => s + c.sales, 0),
      totalChatters: working.length,
      totalFans: working.reduce((s, c) => s + c.fans_chatted, 0),
      avgCVR:
        working.length > 0
          ? working.reduce((s, c) => s + c.fan_cvr, 0) / working.length
          : 0,
      avgSalesHr:
        working.length > 0
          ? working.reduce((s, c) => s + c.sales_per_hour, 0) / working.length
          : 0,
    };
  }, [stats]);

  // ── Sort handler ──────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-text-muted" />;
    return sortDir === 'desc' ? (
      <ChevronDown size={12} className="text-cw" />
    ) : (
      <ChevronUp size={12} className="text-cw" />
    );
  };

  return (
    <div className="min-h-screen bg-surface-0 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Chatter Performance</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Daily KPIs from Inflow Employee Reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date selector */}
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-surface-2 border border-border text-white text-sm rounded-lg px-3 py-2 focus:border-cw focus:outline-none"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KPICard icon={DollarSign} label="Total Sales" value={formatCurrency(totals.totalSales)} color="text-success" />
        <KPICard icon={UsersIcon} label="Active Chatters" value={String(totals.totalChatters)} color="text-cw" />
        <KPICard icon={MessageSquare} label="Total Fans" value={String(totals.totalFans)} color="text-blue-400" />
        <KPICard icon={Target} label="Avg CVR" value={`${totals.avgCVR.toFixed(1)}%`} color={totals.avgCVR >= 10 ? 'text-success' : 'text-warning'} />
        <KPICard icon={TrendingUp} label="Avg $/hr" value={formatCurrency(totals.avgSalesHr)} color={totals.avgSalesHr >= 70 ? 'text-success' : 'text-warning'} />
      </div>

      {/* Team Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {teamAggs.map((t) => {
          const colors = TEAM_COLORS[t.team] ?? { bg: 'bg-surface-2', text: 'text-white', border: 'border-border' };
          return (
            <div key={t.team} className={`${colors.bg} border ${colors.border} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-semibold ${colors.text}`}>{t.team}</span>
                <span className="text-xs text-text-muted">{t.chatters} chatters</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{formatCurrency(t.sales)}</p>
                  <p className="text-xs text-text-secondary">{t.fans} fans chatted</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${t.avgSalesHr >= 70 ? 'text-success' : 'text-warning'}`}>
                    {formatCurrency(t.avgSalesHr)}/hr
                  </p>
                  <p className="text-xs text-text-muted">{t.hours.toFixed(0)}h total</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search chatter or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-2 border border-border text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:border-cw focus:outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {teams.map((t) => {
            const isActive = teamFilter === t;
            const colors = t !== 'all' ? TEAM_COLORS[t] : null;
            return (
              <button
                key={t}
                onClick={() => setTeamFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  isActive
                    ? colors
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-cw/15 text-cw border-cw/30'
                    : 'bg-surface-2 text-text-secondary border-border hover:border-text-muted'
                }`}
              >
                {t === 'all' ? 'All Teams' : t.replace('Team ', '')}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-text-muted self-center ml-auto">
          {filtered.length} chatters
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="text-text-secondary text-sm">Loading...</div>
        </div>
      ) : (
        <div className="bg-surface-1 rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border">
                <SortHeader field="employee_name" label="Chatter" onSort={handleSort} current={sortField} dir={sortDir} className="w-[200px]" />
                <th className="px-3 py-3 text-left text-xs text-text-muted font-medium">Team</th>
                <SortHeader field="sales" label="Sales" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="fan_cvr" label="CVR" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="golden_ratio" label="G.Ratio" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="unlock_rate" label="Unlock%" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="sales_per_hour" label="$/hr" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="messages_per_hour" label="Msg/hr" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="fans_chatted" label="Fans" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="clocked_hours" label="Hours" onSort={handleSort} current={sortField} dir={sortDir} />
                <SortHeader field="response_time_clocked" label="Reply" onSort={handleSort} current={sortField} dir={sortDir} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((s, idx) => {
                const isExpanded = expandedChatter === s.employee_name;
                return (
                  <ChatterRow
                    key={`${s.date}-${s.employee_name}`}
                    stat={s}
                    rank={idx + 1}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedChatter(isExpanded ? null : s.employee_name)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SortHeader({
  field,
  label,
  onSort,
  current,
  dir,
  className = '',
}: {
  field: SortField;
  label: string;
  onSort: (f: SortField) => void;
  current: SortField;
  dir: SortDir;
  className?: string;
}) {
  const isActive = current === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-3 py-3 text-left text-xs font-medium cursor-pointer hover:text-white transition-colors select-none ${
        isActive ? 'text-cw' : 'text-text-muted'
      } ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          dir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
        ) : (
          <ArrowUpDown size={10} className="opacity-40" />
        )}
      </div>
    </th>
  );
}

function ChatterRow({
  stat: s,
  rank,
  isExpanded,
  onToggle,
}: {
  stat: ChatterDailyStat;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const teamColors = TEAM_COLORS[s.team] ?? { bg: 'bg-surface-2', text: 'text-text-muted', border: 'border-border' };

  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-surface-2/50 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted w-5 text-right">{rank}</span>
            <div>
              <p className="text-sm text-white font-medium">{s.employee_name}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-xs px-2 py-0.5 rounded-full ${teamColors.bg} ${teamColors.text} border ${teamColors.border}`}>
            {s.team ? s.team.replace('Team ', '') : '-'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-sm font-medium text-white">
          {formatCurrency(s.sales)}
        </td>
        <td className={`px-3 py-2.5 text-sm font-medium ${getKPIColor('fan_cvr', s.fan_cvr)}`}>
          {s.fan_cvr.toFixed(1)}%
        </td>
        <td className={`px-3 py-2.5 text-sm font-medium ${getKPIColor('golden_ratio', s.golden_ratio)}`}>
          {s.golden_ratio.toFixed(1)}%
        </td>
        <td className={`px-3 py-2.5 text-sm font-medium ${getKPIColor('unlock_rate', s.unlock_rate)}`}>
          {s.unlock_rate.toFixed(0)}%
        </td>
        <td className={`px-3 py-2.5 text-sm font-medium ${getKPIColor('sales_per_hour', s.sales_per_hour)}`}>
          {formatCurrency(s.sales_per_hour)}
        </td>
        <td className={`px-3 py-2.5 text-sm font-medium ${getKPIColor('messages_per_hour', s.messages_per_hour)}`}>
          {Math.round(s.messages_per_hour)}
        </td>
        <td className="px-3 py-2.5 text-sm text-text-secondary">
          {s.fans_chatted}
        </td>
        <td className="px-3 py-2.5 text-sm text-text-secondary">
          {s.clocked_hours.toFixed(1)}h
        </td>
        <td className="px-3 py-2.5 text-sm text-text-secondary">
          {s.response_time_clocked || '-'}
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="bg-surface-2/30">
          <td colSpan={11} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <DetailItem label="PPV Sales" value={formatCurrency(s.ppv_sales)} />
              <DetailItem label="Tips" value={formatCurrency(s.tips)} />
              <DetailItem label="DM Sales" value={formatCurrency(s.dm_sales)} />
              <DetailItem label="PPVs Sent" value={String(s.ppvs_sent)} />
              <DetailItem label="PPVs Unlocked" value={String(s.ppvs_unlocked)} />
              <DetailItem label="Messages Sent" value={String(s.messages_sent)} />
              <DetailItem label="Fans Who Spent" value={`${s.fans_who_spent} of ${s.fans_chatted}`} />
              <DetailItem label="Avg $/Spender" value={formatCurrency(s.avg_earnings_per_spender)} />
              <DetailItem label="Fans/hr" value={s.fans_per_hour.toFixed(1)} />
              <DetailItem label="Characters" value={s.character_count.toLocaleString()} />
              <DetailItem label="Mass Msg $" value={formatCurrency(s.mass_msg_sales)} />
              <DetailItem
                label="Models"
                value={s.creators || '-'}
                wide
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 md:col-span-4 lg:col-span-6' : ''}>
      <p className="text-[11px] text-text-muted mb-0.5">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

function parseResponseTime(val: string | null): number {
  if (!val || val === '-') return 999999;
  let total = 0;
  const m = val.match(/(\d+)m/);
  const s = val.match(/(\d+)s/);
  if (m) total += parseInt(m[1]!) * 60;
  if (s) total += parseInt(s[1]!);
  return total || 999999;
}

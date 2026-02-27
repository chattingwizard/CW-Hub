import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import type { ChatterDailyStat } from '../types';
import {
  Search, ChevronDown, ChevronUp, ArrowUpDown,
  DollarSign, Target, MessageSquare, Users as UsersIcon,
  TrendingUp, AlertTriangle, UserPlus,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────
const MIN_HOURS_FULL_SHIFT = 4;

const VALID_TEAMS = ['Team Danilyn', 'Team Huckle', 'Team Ezekiel'] as const;
type ValidTeam = typeof VALID_TEAMS[number];

const TEAM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Team Danilyn': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Team Huckle': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  'Team Ezekiel': { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
};

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeTeam(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/^team\s+/i, '').trim().toLowerCase();
  for (const valid of VALID_TEAMS) {
    if (valid.toLowerCase().endsWith(cleaned)) return valid;
  }
  return raw;
}

function resolveChatterTeam(key: string, map: Map<string, string>): string | null {
  const exact = map.get(key);
  if (exact !== undefined) return exact || null;

  const keyParts = key.split(' ');
  const keyFirst = keyParts[0]!;
  const keyLast = keyParts[keyParts.length - 1]!;

  for (const [mapName, team] of map) {
    if (mapName.includes(key) || key.includes(mapName)) return team || null;
    const mapParts = mapName.split(' ');
    if (mapParts[0] === keyFirst && mapParts[mapParts.length - 1] === keyLast) return team || null;
  }
  return null;
}

function isValidTeam(t: string): t is ValidTeam {
  return VALID_TEAMS.includes(t as ValidTeam);
}

function persistOverrides(map: Map<string, string>) {
  try {
    localStorage.setItem('cw_team_overrides', JSON.stringify(Object.fromEntries(map)));
  } catch { /* storage full, ignore */ }
}

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
type ViewMode = 'day' | 'week';

function getMondayUTC(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return mon.toISOString().slice(0, 10);
}

function aggregateByEmployee(rows: ChatterDailyStat[]): ChatterDailyStat[] {
  const grouped = new Map<string, ChatterDailyStat[]>();
  for (const r of rows) {
    const key = r.employee_name.toLowerCase().trim();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const result: ChatterDailyStat[] = [];
  for (const [, days] of grouped) {
    const first = days[0]!;
    const totalHours = days.reduce((s, d) => s + d.clocked_hours, 0);
    const totalSales = days.reduce((s, d) => s + d.sales, 0);
    const totalFans = days.reduce((s, d) => s + d.fans_chatted, 0);
    const totalMsgs = days.reduce((s, d) => s + d.messages_sent, 0);
    const totalFansSpent = days.reduce((s, d) => s + d.fans_who_spent, 0);
    const n = days.length;

    result.push({
      ...first,
      date: `${days[days.length - 1]!.date}`,
      sales: totalSales,
      ppv_sales: days.reduce((s, d) => s + d.ppv_sales, 0),
      tips: days.reduce((s, d) => s + d.tips, 0),
      dm_sales: days.reduce((s, d) => s + d.dm_sales, 0),
      mass_msg_sales: days.reduce((s, d) => s + d.mass_msg_sales, 0),
      messages_sent: days.reduce((s, d) => s + d.messages_sent, 0),
      ppvs_sent: days.reduce((s, d) => s + d.ppvs_sent, 0),
      ppvs_unlocked: days.reduce((s, d) => s + d.ppvs_unlocked, 0),
      character_count: days.reduce((s, d) => s + d.character_count, 0),
      golden_ratio: days.reduce((s, d) => s + d.golden_ratio, 0) / n,
      unlock_rate: days.reduce((s, d) => s + d.unlock_rate, 0) / n,
      fan_cvr: days.reduce((s, d) => s + d.fan_cvr, 0) / n,
      fans_chatted: totalFans,
      fans_who_spent: totalFansSpent,
      avg_earnings_per_spender: totalFansSpent > 0 ? totalSales / totalFansSpent : 0,
      clocked_hours: totalHours,
      sales_per_hour: totalHours > 0 ? totalSales / totalHours : 0,
      messages_per_hour: totalHours > 0 ? totalMsgs / totalHours : 0,
      fans_per_hour: totalHours > 0 ? totalFans / totalHours : 0,
      response_time_clocked: days[days.length - 1]!.response_time_clocked,
      creators: [...new Set(days.map(d => d.creators).filter(Boolean))].join(', '),
      team: first.team,
    });
  }
  return result;
}

export default function ChatterPerformance() {
  const [allStats, setAllStats] = useState<ChatterDailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('sales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedChatter, setExpandedChatter] = useState<string | null>(null);
  const [chatterTeamMap, setChatterTeamMap] = useState<Map<string, string>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [lostBoxOpen, setLostBoxOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState<string | null>(null);

  // ── Load canonical chatter→team mapping from Supabase ─────
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('chatters')
        .select('full_name, team_name')
        .eq('status', 'Active')
        .eq('airtable_role', 'Chatter');
      if (error) {
        console.warn('[ChatterPerf] chatters table query failed:', error.message);
        return;
      }
      if (data) {
        const map = new Map<string, string>();
        let withTeam = 0;
        for (const c of data as { full_name: string; team_name: string | null }[]) {
          map.set(normalizeKey(c.full_name), c.team_name ?? '');
          if (c.team_name) withTeam++;
        }
        console.log(`[ChatterPerf] Loaded ${map.size} chatters from DB (${withTeam} with team_name)`);
        setChatterTeamMap(map);
      }
    })();
  }, []);

  // ── Load team overrides (localStorage + Supabase fallback) ─
  useEffect(() => {
    // 1. Load from localStorage immediately
    try {
      const stored = localStorage.getItem('cw_team_overrides');
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>;
        setOverrides(new Map(Object.entries(parsed)));
      }
    } catch { /* ignore */ }

    // 2. Try Supabase as well (merge, Supabase wins on conflict)
    (async () => {
      const { data } = await supabase
        .from('chatter_team_overrides')
        .select('employee_name, team');
      if (data && data.length > 0) {
        setOverrides(prev => {
          const merged = new Map(prev);
          for (const row of data as { employee_name: string; team: string }[]) {
            merged.set(row.employee_name, row.team);
          }
          persistOverrides(merged);
          return merged;
        });
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

  // ── Resolve team for a stat row ───────────────────────────
  const resolveTeam = useCallback((s: ChatterDailyStat): string => {
    const key = normalizeKey(s.employee_name);

    // 1. Manual/upload override (highest priority)
    const override = overrides.get(key);
    if (override === '_dismissed') return '_dismissed';
    if (override && isValidTeam(override)) return override;

    // 2. Chatters table (Airtable sync)
    if (chatterTeamMap.size > 0) {
      const fromChatters = resolveChatterTeam(key, chatterTeamMap);
      if (fromChatters) {
        const normalized = normalizeTeam(fromChatters);
        if (isValidTeam(normalized)) return normalized;
      }
    }

    // 3. CSV group field, normalized
    const fromCsv = normalizeTeam(s.team);
    if (isValidTeam(fromCsv)) return fromCsv;

    return '';
  }, [overrides, chatterTeamMap]);

  // ── Fetch stats for selected date or week ────────────────
  const fetchStats = useCallback(async () => {
    if (!selectedDate && viewMode === 'day') return;
    setLoading(true);

    let query = supabase
      .from('chatter_daily_stats')
      .select('*')
      .order('sales', { ascending: false });

    if (viewMode === 'week') {
      const monday = getMondayUTC();
      const nextMonday = new Date(new Date(monday + 'T00:00:00Z').getTime() + 7 * 86400000)
        .toISOString().slice(0, 10);
      query = query.gte('date', monday).lt('date', nextMonday);
    } else {
      query = query.eq('date', selectedDate);
    }

    const { data, error } = await query;

    if (!error && data) {
      const raw = data as ChatterDailyStat[];
      console.log(`[ChatterPerf] ${viewMode === 'week' ? 'week' : selectedDate}: ${raw.length} rows, ${new Set(raw.map(r => r.employee_name)).size} unique employees`);
      setAllStats(viewMode === 'week' ? aggregateByEmployee(raw) : raw);
    }
    setLoading(false);
  }, [selectedDate, viewMode]);

  useEffect(() => { fetchDates(); }, [fetchDates]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Split into assigned / lost / dismissed ──────────────
  const { assigned, lost } = useMemo(() => {
    const a: ChatterDailyStat[] = [];
    const l: ChatterDailyStat[] = [];
    for (const s of allStats) {
      const team = resolveTeam(s);
      if (team === '_dismissed') continue;
      if (isValidTeam(team)) {
        a.push({ ...s, team });
      } else {
        l.push(s);
      }
    }
    return { assigned: a, lost: l };
  }, [allStats, resolveTeam]);

  // ── Save team override ────────────────────────────────────
  const saveTeamOverride = async (employeeName: string, team: ValidTeam | '_dismissed') => {
    const key = normalizeKey(employeeName);
    setSavingOverride(key);

    // Update state + localStorage immediately
    setOverrides(prev => {
      const next = new Map(prev).set(key, team);
      persistOverrides(next);
      return next;
    });
    setEditingTeam(null);

    // Also persist to Supabase (best-effort, table may not exist)
    supabase
      .from('chatter_team_overrides')
      .upsert({
        employee_name: key,
        display_name: employeeName,
        team,
        source: 'manual',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'employee_name' })
      .then(({ error }) => {
        if (error) console.warn('[ChatterPerf] Supabase override save skipped:', error.message);
      });

    setSavingOverride(null);
  };

  // ── Derived data (only from assigned chatters) ─────────────
  const teams = useMemo(() => {
    const t = new Set(assigned.map((s) => s.team).filter(Boolean));
    return ['all', ...Array.from(t).sort()];
  }, [assigned]);

  const filtered = useMemo(() => {
    let result = assigned;
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
    const minHours = viewMode === 'week' ? 1 : MIN_HOURS_FULL_SHIFT;
    result = result.filter((s) => s.clocked_hours >= minHours);

    result = [...result].sort((a, b) => {
      if (sortField === 'employee_name') {
        const aVal = a.employee_name.toLowerCase();
        const bVal = b.employee_name.toLowerCase();
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (sortField === 'response_time_clocked') {
        const aVal = parseResponseTime(a.response_time_clocked);
        const bVal = parseResponseTime(b.response_time_clocked);
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aVal = (a as any)[sortField] ?? 0;
      const bVal = (b as any)[sortField] ?? 0;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [assigned, teamFilter, search, sortField, sortDir]);

  // ── Team aggregates (only assigned) ────────────────────────
  const minHoursGlobal = viewMode === 'week' ? 1 : MIN_HOURS_FULL_SHIFT;
  const teamAggs = useMemo(() => {
    const map: Record<string, { sales: number; chatters: number; fans: number; hours: number; salesHrValues: number[] }> = {};
    for (const s of assigned.filter((s) => s.clocked_hours >= minHoursGlobal)) {
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
  }, [assigned]);

  // ── Global totals (only assigned) ──────────────────────────
  const totals = useMemo(() => {
    const working = assigned.filter((s) => s.clocked_hours >= minHoursGlobal);
    return {
      totalSales: working.reduce((s, c) => s + c.sales, 0),
      totalChatters: working.length,
      totalFans: working.reduce((s, c) => s + c.fans_chatted, 0),
      avgCVR: working.length > 0 ? working.reduce((s, c) => s + c.fan_cvr, 0) / working.length : 0,
      avgSalesHr: working.length > 0 ? working.reduce((s, c) => s + c.sales_per_hour, 0) / working.length : 0,
    };
  }, [assigned]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Chatter Performance</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {viewMode === 'week' ? 'Weekly aggregated KPIs' : 'Daily KPIs'} from Inflow Employee Reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Day / Week toggle */}
          <div className="flex bg-surface-2 border border-border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'week' ? 'bg-cw text-white' : 'text-text-muted hover:text-white'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'day' ? 'bg-cw text-white' : 'text-text-muted hover:text-white'
              }`}
            >
              Day
            </button>
          </div>
          {/* Date selector — only for day mode */}
          {viewMode === 'day' && (
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
          )}
        </div>
      </div>

      {/* Data status */}
      {!loading && allStats.length > 0 && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-surface-1 border border-border rounded-lg text-xs text-text-muted">
          <span>{allStats.length} employees in DB for this date</span>
          <span className="text-border">|</span>
          <span className="text-cw">{assigned.length} assigned to teams</span>
          {lost.length > 0 && (
            <>
              <span className="text-border">|</span>
              <span className="text-amber-400">{lost.length} unassigned</span>
            </>
          )}
          {chatterTeamMap.size > 0 && (
            <>
              <span className="text-border">|</span>
              <span>{chatterTeamMap.size} chatters in roster</span>
            </>
          )}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard icon={DollarSign} label="Total Sales" value={formatCurrency(totals.totalSales)} color="text-success" />
        <KPICard icon={UsersIcon} label="Active Chatters" value={String(totals.totalChatters)} color="text-cw" />
        <KPICard icon={MessageSquare} label="Total Fans" value={String(totals.totalFans)} color="text-blue-400" />
        <KPICard icon={Target} label="Avg CVR" value={`${totals.avgCVR.toFixed(1)}%`} color={totals.avgCVR >= 10 ? 'text-success' : 'text-warning'} />
        <KPICard icon={TrendingUp} label="Avg $/hr" value={formatCurrency(totals.avgSalesHr)} color={totals.avgSalesHr >= 70 ? 'text-success' : 'text-warning'} />
      </div>

      {/* Team Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
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
                    editingTeam={editingTeam}
                    onEditTeam={setEditingTeam}
                    onSaveTeam={saveTeamOverride}
                    saving={savingOverride === normalizeKey(s.employee_name)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Lost Box ─────────────────────────────────────────── */}
      {!loading && lost.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setLostBoxOpen(!lostBoxOpen)}
            className="flex items-center gap-2 w-full text-left px-4 py-3 bg-amber-950/30 border border-amber-800/40 rounded-xl hover:bg-amber-950/40 transition-colors"
          >
            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-300">
              {lost.length} unassigned chatter{lost.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-amber-400/60 ml-1">
              — not counted in stats. Assign a team to include them.
            </span>
            <ChevronDown size={14} className={`ml-auto text-amber-400/60 transition-transform ${lostBoxOpen ? 'rotate-180' : ''}`} />
          </button>

          {lostBoxOpen && (
            <div className="mt-2 bg-surface-1 border border-amber-800/30 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/50">
                {lost.map((s) => {
                  const key = normalizeKey(s.employee_name);
                  const isSaving = savingOverride === key;
                  return (
                    <div key={`lost-${s.employee_name}`} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{s.employee_name}</p>
                        <p className="text-[11px] text-text-muted">
                          {formatCurrency(s.sales)} sales · {s.clocked_hours.toFixed(1)}h · CSV group: {s.team || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {VALID_TEAMS.map((t) => {
                          const colors = TEAM_COLORS[t]!;
                          return (
                            <button
                              key={t}
                              disabled={isSaving}
                              onClick={(e) => { e.stopPropagation(); saveTeamOverride(s.employee_name, t); }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80 disabled:opacity-40`}
                            >
                              <UserPlus size={10} className="inline mr-1" />
                              {t.replace('Team ', '')}
                            </button>
                          );
                        })}
                        <button
                          disabled={isSaving}
                          onClick={(e) => { e.stopPropagation(); saveTeamOverride(s.employee_name, '_dismissed'); }}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium text-text-muted border border-border hover:text-red-400 hover:border-red-800/50 transition-colors disabled:opacity-40"
                          title="Dismiss — not a chatter"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KPICard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<any>; label: string; value: string; color: string;
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

function SortHeader({ field, label, onSort, current, dir, className = '' }: {
  field: SortField; label: string; onSort: (f: SortField) => void;
  current: SortField; dir: SortDir; className?: string;
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

function ChatterRow({ stat: s, rank, isExpanded, onToggle, editingTeam, onEditTeam, onSaveTeam, saving }: {
  stat: ChatterDailyStat; rank: number; isExpanded: boolean; onToggle: () => void;
  editingTeam: string | null; onEditTeam: (name: string | null) => void;
  onSaveTeam: (name: string, team: ValidTeam | '_dismissed') => void; saving: boolean;
}) {
  const teamColors = TEAM_COLORS[s.team] ?? { bg: 'bg-surface-2', text: 'text-text-muted', border: 'border-border' };
  const isEditing = editingTeam === s.employee_name;

  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-surface-2/50 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted w-5 text-right">{rank}</span>
            <p className="text-sm text-white font-medium">{s.employee_name}</p>
          </div>
        </td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          {isEditing ? (
            <div className="flex gap-1">
              {VALID_TEAMS.map((t) => {
                const c = TEAM_COLORS[t]!;
                return (
                  <button
                    key={t}
                    disabled={saving}
                    onClick={(e) => { e.stopPropagation(); onSaveTeam(s.employee_name, t); }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                      s.team === t
                        ? `${c.bg} ${c.text} ${c.border} ring-1 ring-white/30`
                        : `${c.bg} ${c.text} ${c.border} opacity-50 hover:opacity-100`
                    } disabled:opacity-30`}
                  >
                    {t.replace('Team ', '')}
                  </button>
                );
              })}
              <button
                onClick={(e) => { e.stopPropagation(); onEditTeam(null); }}
                className="text-[10px] text-text-muted hover:text-text-primary ml-1"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onEditTeam(s.employee_name); }}
              className={`text-xs px-2 py-0.5 rounded-full ${teamColors.bg} ${teamColors.text} border ${teamColors.border} hover:ring-1 hover:ring-white/20 transition-all`}
              title="Click to change team"
            >
              {s.team ? s.team.replace('Team ', '') : '-'}
            </button>
          )}
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

      {isExpanded && (
        <tr className="bg-surface-2/30">
          <td colSpan={11} className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
              <DetailItem label="Models" value={s.creators || '-'} wide />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4' : ''}>
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

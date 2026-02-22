import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TEAM_COLORS, SHIFT_LABELS, SHIFTS, formatCurrency, getCurrentShift } from '../lib/utils';
import { getTeamColor, getTLForShift } from '../lib/roles';
import { Users, Monitor, Calendar, Clock, AlertTriangle, TrendingUp, ChevronRight, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import ModelAvatar from '../components/ModelAvatar';
import { TeamTrafficBar, ModelTrafficRow, PageTypeBadge } from '../components/TrafficBadge';
import { AnnouncementBanner, AnnouncementComposer } from '../components/Announcements';
import { useTrafficData } from '../hooks/useTrafficData';
import type { Model, Chatter, ModelChatterAssignment, Schedule } from '../types';

export default function Overview() {
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [assignments, setAssignments] = useState<ModelChatterAssignment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const { modelTraffic, teamTraffic, getModelTraffic, globalAvg } = useTrafficData();

  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0]!;
  };

  const weekStart = getWeekStart();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [modelsRes, chattersRes, assignRes, schedRes] = await Promise.all([
      supabase.from('models').select('*'),
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter'),
      supabase.from('model_chatter_assignments').select('*').eq('active', true),
      supabase.from('schedules').select('*').eq('week_start', weekStart),
    ]);
    setModels((modelsRes.data ?? []) as Model[]);
    setChatters((chattersRes.data ?? []) as Chatter[]);
    setAssignments((assignRes.data ?? []) as ModelChatterAssignment[]);
    setSchedules((schedRes.data ?? []) as Schedule[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculations
  const liveModels = models.filter((m) => m.status === 'Live');
  const activeChatters = chatters.length;
  const totalRevenuePerDay = modelTraffic.filter((t) => t.model_status === 'Live').reduce((s, t) => s + t.earnings_per_day, 0);

  // Team breakdown
  const teams = [...new Set(chatters.map((c) => c.team_name).filter(Boolean))] as string[];
  const teamStats = teams.map((team) => {
    const members = chatters.filter((c) => c.team_name === team);
    const memberIds = new Set(members.map((m) => m.id));
    const teamAssignments = assignments.filter((a) => memberIds.has(a.chatter_id));
    const teamModels = new Set(teamAssignments.map((a) => a.model_id));
    const teamSchedules = schedules.filter((s) => memberIds.has(s.chatter_id));
    return { team, members: members.length, models: teamModels.size, shifts: teamSchedules.length };
  });

  // Shift coverage
  const shiftCoverage = SHIFTS.map((shift) => {
    const counts = Array.from({ length: 7 }, (_, dayIdx) =>
      schedules.filter((s) => s.day_of_week === dayIdx && s.shift === shift).length
    );
    return { shift, counts, total: counts.reduce((a, b) => a + b, 0) };
  });

  // Unassigned
  const chattersWithNoModels = chatters.filter((c) => !assignments.some((a) => a.chatter_id === c.id));
  const chattersWithNoSchedule = chatters.filter((c) => !schedules.some((s) => s.chatter_id === c.id));
  const modelsWithNoChatters = liveModels.filter((m) => !assignments.some((a) => a.model_id === m.id));

  // Alerts
  const alerts: { type: 'warning' | 'danger'; message: string; action: string; path: string }[] = [];
  if (modelsWithNoChatters.length > 0) alerts.push({ type: 'danger', message: `${modelsWithNoChatters.length} live model${modelsWithNoChatters.length > 1 ? 's' : ''} with no chatters assigned`, action: 'Fix', path: '/assignments' });
  if (chattersWithNoSchedule.length > 0) alerts.push({ type: 'warning', message: `${chattersWithNoSchedule.length} chatter${chattersWithNoSchedule.length > 1 ? 's' : ''} with no schedule this week`, action: 'Fix', path: '/schedules' });
  if (chattersWithNoModels.length > 0) alerts.push({ type: 'warning', message: `${chattersWithNoModels.length} chatter${chattersWithNoModels.length > 1 ? 's' : ''} not assigned to any model`, action: 'Fix', path: '/assignments' });

  // Today
  const todayDayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayShiftCounts = SHIFTS.map((shift) => ({
    shift,
    count: schedules.filter((s) => s.day_of_week === todayDayIdx && s.shift === shift).length,
    chatters: schedules.filter((s) => s.day_of_week === todayDayIdx && s.shift === shift)
      .map((s) => chatters.find((c) => c.id === s.chatter_id)?.full_name)
      .filter(Boolean),
  }));

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-text-secondary">
          <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
          Loading overview...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-text-primary">Overview</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          <span className="text-text-muted ml-2">·</span>
          <span className="text-cw ml-2 font-semibold">{getTLForShift(getCurrentShift())?.tl || 'Night'} shift active</span>
        </p>
      </div>

      {/* Announcements */}
      <AnnouncementBanner />
      <AnnouncementComposer />

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
              alert.type === 'danger' ? 'bg-danger/10 border-danger/30' : 'bg-warning/10 border-warning/30'
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className={alert.type === 'danger' ? 'text-danger' : 'text-warning'} />
                <span className={`text-sm ${alert.type === 'danger' ? 'text-danger' : 'text-warning'}`}>{alert.message}</span>
              </div>
              <button onClick={() => navigate(alert.path)}
                className={`text-xs font-medium px-3 py-1 rounded-lg ${
                  alert.type === 'danger' ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-warning/20 text-warning hover:bg-warning/30'
                }`}>
                {alert.action} <ChevronRight size={12} className="inline -mt-0.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-secondary">Live Models</span>
            <div className="w-8 h-8 rounded-lg bg-cw/10 flex items-center justify-center"><Monitor size={16} className="text-cw" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{liveModels.length}</p>
          <p className="text-[10px] text-text-muted mt-1">{models.length} total ({models.filter((m) => m.status === 'On Hold').length} on hold)</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-secondary">Active Chatters</span>
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center"><Users size={16} className="text-success" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{activeChatters}</p>
          <p className="text-[10px] text-text-muted mt-1">{teams.length} teams</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-secondary">Revenue / day</span>
            <div className="w-8 h-8 rounded-lg bg-cw/10 flex items-center justify-center"><TrendingUp size={16} className="text-cw" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{totalRevenuePerDay > 0 ? formatCurrency(totalRevenuePerDay) : '—'}</p>
          <p className="text-[10px] text-text-muted mt-1">{modelTraffic.filter((t) => t.earnings_per_day > 0).length} models reporting</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-secondary">Total Assignments</span>
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center"><Calendar size={16} className="text-warning" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{assignments.length}</p>
          <p className="text-[10px] text-text-muted mt-1">chatter-model pairs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Today's Shifts */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-cw" />
            <h2 className="text-sm font-semibold text-white">Today's Coverage</h2>
          </div>
          <div className="space-y-3">
            {todayShiftCounts.map(({ shift, count, chatters: names }) => (
              <div key={shift}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">{SHIFT_LABELS[shift]}</span>
                  <span className="text-sm font-semibold text-white">{count} chatters</span>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-2 mb-1">
                  <div className="h-2 rounded-full bg-cw transition-all" style={{ width: `${Math.min((count / Math.max(activeChatters * 0.4, 1)) * 100, 100)}%` }} />
                </div>
                {names.length > 0 && (
                  <p className="text-[10px] text-text-muted truncate">{names.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Team Breakdown */}
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-cw" />
            <h2 className="text-sm font-semibold text-white">Team Breakdown</h2>
          </div>
          <div className="space-y-3">
            {teamStats.map(({ team, members, models: modelCount, shifts }) => (
              <div key={team} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${TEAM_COLORS[team] ?? 'bg-surface-3 text-text-secondary'}`}>
                  {team.replace('Team ', '').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{team}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-text-muted">{members} chatters</span>
                    <span className="text-[10px] text-text-muted">{modelCount} models</span>
                    <span className="text-[10px] text-text-muted">{shifts} shifts/wk</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Traffic & Workload Distribution */}
      {modelTraffic.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Team Workload */}
          <div className="bg-surface-1 border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={16} className="text-cw" />
              <h2 className="text-sm font-semibold text-white">Team Workload</h2>
            </div>
            <p className="text-[10px] text-text-muted mb-4">
              Weighted by account type: <span className="text-emerald-400">Free</span>=1.0x <span className="text-purple-400">Mix</span>=0.7x <span className="text-amber-400">Paid</span>=0.4x
            </p>
            {teamTraffic.length > 0 ? (
              <div className="space-y-3">
                {teamTraffic.map((team) => (
                  <TeamTrafficBar
                    key={team.team_name}
                    team={team}
                    maxWorkloadPct={teamTraffic[0]!.total_workload_pct}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">No traffic data yet</p>
            )}
          </div>

          {/* Top Workload Models */}
          <div className="bg-surface-1 border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-orange-400" />
              <h2 className="text-sm font-semibold text-white">Highest Workload Models</h2>
            </div>
            <div className="space-y-0.5">
              {modelTraffic.slice(0, 10).map((t, i) => (
                <ModelTrafficRow key={t.model_id} traffic={t} rank={i + 1} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Revenue Models (from Creator Reports) */}
      {modelTraffic.some((t) => t.earnings_per_day > 0) && (
        <div className="bg-surface-1 border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-cw" />
            <h2 className="text-sm font-semibold text-white">Top Revenue / day</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-[200px] sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modelTraffic
                    .filter((t) => t.earnings_per_day > 0)
                    .slice(0, 8)
                    .map((t) => ({ name: t.model_name.slice(0, 10), revenue: Math.round(t.earnings_per_day) }))}
                  margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                >
                  <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}/day`, 'Revenue']}
                    cursor={{ fill: 'rgba(29, 155, 240, 0.08)' }}
                  />
                  <Bar dataKey="revenue" fill="#1d9bf0" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {modelTraffic
                .filter((t) => t.earnings_per_day > 0)
                .sort((a, b) => b.earnings_per_day - a.earnings_per_day)
                .slice(0, 5)
                .map((t, i) => (
                  <div key={t.model_id} className="flex items-center gap-3">
                    <span className="text-[10px] text-text-muted w-4 text-right">{i + 1}</span>
                    <PageTypeBadge pageType={t.page_type} size="sm" />
                    <span className="text-sm text-white flex-1 truncate">{t.model_name}</span>
                    <span className="text-sm text-cw font-semibold">${Math.round(t.earnings_per_day).toLocaleString()}/d</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Models without chatters */}
      {modelsWithNoChatters.length > 0 && (
        <div className="bg-surface-1 border border-danger/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-danger" />
            <h2 className="text-sm font-semibold text-danger">Live Models Without Chatters</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {modelsWithNoChatters.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20">
                <ModelAvatar name={m.name} pictureUrl={m.profile_picture_url} size="xs" />
                <span className="text-xs text-danger">{m.name}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/assignments')} className="mt-3 text-xs text-cw hover:text-cw-light">
            Go to Assignments <ChevronRight size={12} className="inline -mt-0.5" />
          </button>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import {
  getWeekKey, getWeekLabel, getPreviousWeekKey, getNextWeekKey,
  calculateStatus, getBonusAmount, getStatusBadge, getScoreColor,
} from '../lib/scoreUtils';
import type {
  ScoreEventType, ScoreEvent, ScoreWeeklyReport, ScoreConfig as ScoreConfigType,
  Chatter, ChatterWeeklyScore,
} from '../types';
import ScoreLogEvent from '../components/score/ScoreLogEvent';
import ScoreWeeklyReports from '../components/score/ScoreWeeklyReports';
import ScoreConfigPanel from '../components/score/ScoreConfig';
import ScoreDrawer from '../components/score/ScoreDrawer';
import { Star, ChevronLeft, ChevronRight, Plus, Trophy, AlertTriangle, FileText, DollarSign } from 'lucide-react';

type Tab = 'leaderboard' | 'log-event' | 'weekly-reports' | 'config';

export default function ChatterScore() {
  const { profile } = useAuthStore();
  const [weekKey, setWeekKey] = useState(() => getWeekKey(new Date()));
  const [tab, setTab] = useState<Tab>('leaderboard');

  const [config, setConfig] = useState<ScoreConfigType | null>(null);
  const [eventTypes, setEventTypes] = useState<ScoreEventType[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<ScoreWeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const [scores, setScores] = useState<ChatterWeeklyScore[]>([]);
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [drawerChatterId, setDrawerChatterId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  const loadData = useCallback(async () => {
    setLoading(true);
    const [configRes, typesRes, chattersRes, eventsRes, reportsRes] = await Promise.all([
      supabase.from('score_config').select('*').eq('id', 1).single(),
      supabase.from('score_event_types').select('*').order('sort_order'),
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter').order('full_name'),
      supabase.from('score_events').select('*, event_type:score_event_types(*)').eq('week', weekKey),
      supabase.from('score_weekly_reports').select('*').eq('week', weekKey),
    ]);

    const cfg = configRes.data as ScoreConfigType;
    const types = (typesRes.data || []) as ScoreEventType[];
    const chts = (chattersRes.data || []) as Chatter[];
    const evts = (eventsRes.data || []) as ScoreEvent[];
    const rpts = (reportsRes.data || []) as ScoreWeeklyReport[];

    setConfig(cfg);
    setEventTypes(types);
    setChatters(chts);
    setEvents(evts);
    setWeeklyReports(rpts);

    if (cfg) {
      const computed = chts.map(c => {
        const chatterEvents = evts.filter(e => e.chatter_id === c.id);
        const eventPoints = chatterEvents.reduce((sum, e) => sum + e.points, 0);
        const report = rpts.find(r => r.chatter_id === c.id) || null;
        const reportPoints = report?.weekly_points ?? 0;
        const total = cfg.base_score + eventPoints + reportPoints;

        return {
          chatter_id: c.id,
          chatter_name: c.full_name,
          team_name: c.team_name,
          base_score: cfg.base_score,
          event_points: eventPoints,
          weekly_report_points: reportPoints,
          total,
          status: calculateStatus(total, cfg),
          bonus_amount: getBonusAmount(total, cfg),
          events: chatterEvents,
          weekly_report: report,
        };
      });
      computed.sort((a, b) => b.total - a.total);
      setScores(computed);
    }

    setLoading(false);
  }, [weekKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredScores = scores.filter(s => {
    if (teamFilter !== 'all' && s.team_name !== teamFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    return true;
  });

  const bonusEarners = scores.filter(s => s.bonus_amount > 0).length;
  const warnings = scores.filter(s => s.status === 'warning').length;
  const pendingReports = chatters.length - weeklyReports.length;
  const totalBonuses = scores.reduce((sum, s) => sum + s.bonus_amount, 0);

  const teams = [...new Set(chatters.map(c => c.team_name).filter(Boolean))] as string[];

  const TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'log-event', label: 'Log Event' },
    { id: 'weekly-reports', label: 'Weekly Reports' },
    { id: 'config', label: 'Score Config', adminOnly: true },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Star size={18} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary">Chatter Score</h1>
            <p className="text-xs text-text-muted">Track performance points & weekly bonuses</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Week selector */}
          <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-lg px-1 py-1">
            <button
              onClick={() => setWeekKey(getPreviousWeekKey(weekKey))}
              className="p-1.5 rounded-md hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-text-primary px-2 min-w-[200px] text-center">
              {getWeekLabel(weekKey)}
            </span>
            <button
              onClick={() => setWeekKey(getNextWeekKey(weekKey))}
              className="p-1.5 rounded-md hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            onClick={() => { setTab('log-event'); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cw text-white text-xs font-medium hover:bg-cw/90 transition-all"
          >
            <Plus size={13} />
            Log Event
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Trophy size={15} />} label="Bonus Earners" value={bonusEarners} color="text-emerald-400" bg="bg-emerald-500/10" />
        <StatCard icon={<AlertTriangle size={15} />} label="Warnings" value={warnings} color="text-red-400" bg="bg-red-500/10" />
        <StatCard icon={<FileText size={15} />} label="Pending Reports" value={pendingReports} color="text-amber-400" bg="bg-amber-500/10" />
        <StatCard icon={<DollarSign size={15} />} label="Total Bonuses" value={`$${totalBonuses}`} color="text-cw" bg="bg-cw/10" />
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-0.5">
          {TABS.filter(t => !t.adminOnly || isAdmin).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
                tab === t.id
                  ? 'border-cw text-cw'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="text-sm text-text-muted text-center py-16">Loading score data...</div>
      ) : (
        <>
          {tab === 'leaderboard' && config && (
            <div>
              {/* Filters */}
              <div className="flex gap-2 mb-4">
                <select
                  value={teamFilter}
                  onChange={e => setTeamFilter(e.target.value)}
                  className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary"
                >
                  <option value="all">All Teams</option>
                  {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary"
                >
                  <option value="all">All Status</option>
                  <option value="bonus_20">$20 Bonus</option>
                  <option value="bonus_10">$10 Bonus</option>
                  <option value="bonus_5">$5 Bonus</option>
                  <option value="no_bonus">No Bonus</option>
                  <option value="warning">Warning</option>
                </select>
              </div>

              {/* Table */}
              <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3 w-10">#</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Name</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Team</th>
                        <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Events</th>
                        <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Weekly</th>
                        <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Total</th>
                        <th className="text-center text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Status</th>
                        <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-muted px-4 py-3">Bonus</th>
                        <th className="px-4 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredScores.map((s, i) => {
                        const badge = getStatusBadge(s.status);
                        return (
                          <tr key={s.chatter_id} className="border-b border-border/50 hover:bg-surface-2/50 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-text-muted font-medium">{i + 1}</td>
                            <td className="px-4 py-2.5 text-xs font-medium text-text-primary">{s.chatter_name}</td>
                            <td className="px-4 py-2.5">
                              {s.team_name && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-text-muted font-medium">
                                  {s.team_name.replace('Team ', '')}
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 text-xs text-right font-medium ${s.event_points > 0 ? 'text-emerald-400' : s.event_points < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                              {s.event_points > 0 ? '+' : ''}{s.event_points}
                            </td>
                            <td className={`px-4 py-2.5 text-xs text-right font-medium ${s.weekly_report_points > 0 ? 'text-emerald-400' : 'text-text-muted'}`}>
                              {s.weekly_report_points > 0 ? '+' : ''}{s.weekly_report_points}
                            </td>
                            <td className={`px-4 py-2.5 text-sm text-right font-bold ${getScoreColor(s.total, config)}`}>
                              {s.total}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${badge.colorClass}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-right font-bold text-text-primary">
                              {s.bonus_amount > 0 ? `$${s.bonus_amount}` : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => setDrawerChatterId(s.chatter_id)}
                                className="text-[10px] px-2.5 py-1 rounded-md bg-surface-3 text-text-muted hover:text-cw hover:bg-cw/10 font-medium transition-all"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredScores.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-sm text-text-muted">
                            No chatters match the selected filters
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'log-event' && (
            <ScoreLogEvent weekKey={weekKey} eventTypes={eventTypes} chatters={chatters} />
          )}

          {tab === 'weekly-reports' && config && (
            <ScoreWeeklyReports weekKey={weekKey} chatters={chatters} config={config} onDataChange={loadData} />
          )}

          {tab === 'config' && isAdmin && config && (
            <ScoreConfigPanel config={config} eventTypes={eventTypes} onSave={loadData} />
          )}
        </>
      )}

      {/* Drawer */}
      {drawerChatterId && config && (
        <ScoreDrawer
          chatterId={drawerChatterId}
          weekKey={weekKey}
          config={config}
          scores={scores}
          events={events}
          onClose={() => setDrawerChatterId(null)}
          onLogEvent={() => { setDrawerChatterId(null); setTab('log-event'); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="bg-surface-1 rounded-xl border border-border p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

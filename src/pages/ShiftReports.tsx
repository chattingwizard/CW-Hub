import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { isAdminLevel } from '../lib/roles';
import { getWeekKey } from '../lib/scoreUtils';
import { TL_SHIFTS } from '../lib/roles';
import type { Chatter, ShiftReport, ShiftReportAlert, Schedule } from '../types';
import {
  ClipboardList,
  Send,
  FileText,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  ShieldAlert,
  ArrowLeftRight,
  StickyNote,
} from 'lucide-react';

const TEAMS = ['Team Danilyn', 'Team Huckle', 'Team Ezekiel'] as const;
const MODEL_TEAMS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TRAFFIC_LEVELS = ['low', 'moderate', 'high'] as const;

const TRAFFIC_CONFIG = {
  low: { label: 'Low', icon: SignalLow, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  moderate: { label: 'Moderate', icon: SignalMedium, color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' },
  high: { label: 'High', icon: SignalHigh, color: 'text-red-400 bg-red-500/15 border-red-500/30' },
} as const;

type Tab = 'submit' | 'reports' | 'alerts';

export default function ShiftReports() {
  const { profile } = useAuthStore();
  const isAdmin = profile ? isAdminLevel(profile.role) : false;

  const [activeTab, setActiveTab] = useState<Tab>('submit');
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChatters();
  }, []);

  async function loadChatters() {
    const { data } = await supabase
      .from('chatters')
      .select('*')
      .eq('status', 'Active')
      .eq('airtable_role', 'Chatter')
      .order('full_name');
    setChatters(data || []);
    setLoading(false);
  }

  const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
    { id: 'submit', label: 'Submit Report', icon: Send },
    { id: 'reports', label: 'Reports', icon: FileText },
    ...(isAdmin ? [{ id: 'alerts' as Tab, label: 'Alerts', icon: AlertTriangle }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <ClipboardList size={22} className="text-cw" />
          Shift Reports
        </h1>
        <p className="text-sm text-text-muted mt-1">Submit your end-of-shift report</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-1 rounded-xl p-1 border border-border w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-cw text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-cw" />
        </div>
      ) : (
        <>
          {activeTab === 'submit' && <SubmitTab chatters={chatters} />}
          {activeTab === 'reports' && <ReportsTab chatters={chatters} />}
          {activeTab === 'alerts' && isAdmin && <AlertsTab chatters={chatters} />}
        </>
      )}
    </div>
  );
}

// ── Submit Report Tab ────────────────────────────────────────

function SubmitTab({ chatters }: { chatters: Chatter[] }) {
  const { profile } = useAuthStore();

  const chatterProfile = useMemo(() => {
    if (profile?.role === 'chatter') {
      return chatters.find(c => c.profile_id === profile.id);
    }
    return null;
  }, [chatters, profile]);

  const [selectedChatter, setSelectedChatter] = useState(chatterProfile?.id || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [team, setTeam] = useState<string>(chatterProfile?.team_name || '');
  const [modelTeam, setModelTeam] = useState<number>(1);
  const [trafficLevel, setTrafficLevel] = useState<typeof TRAFFIC_LEVELS[number]>('moderate');
  const [hasIncident, setHasIncident] = useState(false);
  const [incidentNotes, setIncidentNotes] = useState('');
  const [hasCover, setHasCover] = useState(false);
  const [coverNotes, setCoverNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (chatterProfile) {
      setSelectedChatter(chatterProfile.id);
      if (chatterProfile.team_name) setTeam(chatterProfile.team_name);
    }
  }, [chatterProfile]);

  async function handleSubmit() {
    if (!selectedChatter || !team || !profile) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const { error } = await supabase.from('shift_reports').insert({
        chatter_id: selectedChatter,
        date,
        team,
        model_team: modelTeam,
        traffic_level: trafficLevel,
        has_incident: hasIncident,
        incident_notes: hasIncident ? incidentNotes || null : null,
        has_cover: hasCover,
        cover_notes: hasCover ? coverNotes || null : null,
        notes: notes || null,
        submitted_by: profile.id,
      });

      if (error) {
        if (error.code === '23505') {
          setSubmitResult({ ok: false, msg: 'A shift report already exists for this chatter on this date.' });
        } else {
          throw error;
        }
      } else {
        setSubmitResult({ ok: true, msg: 'Shift report submitted successfully!' });
        setHasIncident(false);
        setIncidentNotes('');
        setHasCover(false);
        setCoverNotes('');
        setNotes('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit report';
      setSubmitResult({ ok: false, msg: message });
    } finally {
      setSubmitting(false);
    }
  }

  const isChatter = profile?.role === 'chatter';

  return (
    <div className="bg-surface-1 rounded-xl border border-border p-6 max-w-2xl">
      <h3 className="text-sm font-semibold text-text-primary mb-5">New Shift Report</h3>

      <div className="space-y-5">
        {/* Chatter Name */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Chatter Name</label>
          <select
            value={selectedChatter}
            onChange={e => setSelectedChatter(e.target.value)}
            disabled={isChatter && !!chatterProfile}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary disabled:opacity-60"
          >
            <option value="">Select chatter...</option>
            {chatters.map(c => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.team_name ? `(${c.team_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary"
          />
        </div>

        {/* Team + Model Team (side by side) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Team</label>
            <select
              value={team}
              onChange={e => setTeam(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary"
            >
              <option value="">Select team...</option>
              {TEAMS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Model Team</label>
            <select
              value={modelTeam}
              onChange={e => setModelTeam(parseInt(e.target.value))}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary"
            >
              {MODEL_TEAMS.map(n => (
                <option key={n} value={n}>Team {n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Traffic Level */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Traffic Level</label>
          <div className="flex gap-2">
            {TRAFFIC_LEVELS.map(level => {
              const cfg = TRAFFIC_CONFIG[level];
              const selected = trafficLevel === level;
              return (
                <button
                  key={level}
                  onClick={() => setTrafficLevel(level)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    selected ? cfg.color : 'bg-surface-2 text-text-secondary border-border hover:border-zinc-600'
                  }`}
                >
                  <cfg.icon size={16} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Incidents Toggle */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Incidents</label>
          <div className="flex gap-2">
            <button
              onClick={() => setHasIncident(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                !hasIncident
                  ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:border-zinc-600'
              }`}
            >
              <Check size={16} />
              No Incidents
            </button>
            <button
              onClick={() => setHasIncident(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                hasIncident
                  ? 'text-red-400 bg-red-500/15 border-red-500/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:border-zinc-600'
              }`}
            >
              <X size={16} />
              Had Incidents
            </button>
          </div>
          {hasIncident && (
            <textarea
              value={incidentNotes}
              onChange={e => setIncidentNotes(e.target.value)}
              rows={3}
              className="w-full mt-2 bg-surface-2 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-text-primary resize-none focus:border-red-500/40 focus:outline-none"
              placeholder="Describe the incident(s)..."
            />
          )}
        </div>

        {/* Covers Toggle */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Covers</label>
          <div className="flex gap-2">
            <button
              onClick={() => setHasCover(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                !hasCover
                  ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:border-zinc-600'
              }`}
            >
              <Check size={16} />
              No Cover
            </button>
            <button
              onClick={() => setHasCover(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                hasCover
                  ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:border-zinc-600'
              }`}
            >
              <ArrowLeftRight size={16} />
              Covered Shift
            </button>
          </div>
          {hasCover && (
            <textarea
              value={coverNotes}
              onChange={e => setCoverNotes(e.target.value)}
              rows={3}
              className="w-full mt-2 bg-surface-2 border border-amber-500/20 rounded-lg px-3 py-2.5 text-sm text-text-primary resize-none focus:border-amber-500/40 focus:outline-none"
              placeholder="Explain the cover (e.g., 'Covered for Ana on Ezekiel shift')..."
            />
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary resize-none focus:border-cw/40 focus:outline-none"
            placeholder="Anything relevant about this shift..."
          />
        </div>

        {/* Submit Result */}
        {submitResult && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
            submitResult.ok
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {submitResult.msg}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!selectedChatter || !team || submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-cw text-white text-sm font-semibold hover:bg-cw/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          {submitting ? 'Submitting...' : 'Submit Shift Report'}
        </button>
      </div>
    </div>
  );
}

// ── Reports Tab ──────────────────────────────────────────────

function ReportsTab({ chatters }: { chatters: Chatter[] }) {
  const { profile } = useAuthStore();
  const isChatter = profile?.role === 'chatter';

  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    let query = supabase
      .from('shift_reports')
      .select('*, chatter:chatters(*)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (isChatter && profile) {
      const myChatter = chatters.find(c => c.profile_id === profile.id);
      if (myChatter) {
        query = query.eq('chatter_id', myChatter.id);
      }
    }

    const { data } = await query;
    setReports(data || []);
    setLoading(false);
  }

  const filtered = teamFilter === 'all' ? reports : reports.filter(r => r.team === teamFilter);

  const chatterMap = useMemo(() => {
    const map: Record<string, Chatter> = {};
    chatters.forEach(c => { map[c.id] = c; });
    return map;
  }, [chatters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-cw" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary"
        >
          <option value="all">All Teams</option>
          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-text-muted">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface-1 rounded-xl border border-border p-8 text-center">
          <FileText size={32} className="text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">No shift reports found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(report => {
            const chatter = report.chatter || chatterMap[report.chatter_id];
            const expanded = expandedId === report.id;
            const trafficCfg = TRAFFIC_CONFIG[report.traffic_level];
            const dateStr = new Date(report.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            });

            return (
              <div
                key={report.id}
                className="bg-surface-1 rounded-xl border border-border overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : report.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {chatter?.full_name ?? 'Unknown'}
                      </span>
                      <span className="text-[10px] text-text-muted">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-text-muted">{report.team}</span>
                      <span className="text-[10px] text-text-muted">Model Team {report.model_team}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Traffic pill */}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${trafficCfg.color}`}>
                      {trafficCfg.label}
                    </span>
                    {report.has_incident && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-red-400 bg-red-500/15 border-red-500/30">
                        Incident
                      </span>
                    )}
                    {report.has_cover && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-amber-400 bg-amber-500/15 border-amber-500/30">
                        Cover
                      </span>
                    )}
                    {expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
                    {report.has_incident && report.incident_notes && (
                      <div className="flex gap-2">
                        <ShieldAlert size={14} className="text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/70 mb-0.5">Incident Details</p>
                          <p className="text-sm text-text-secondary">{report.incident_notes}</p>
                        </div>
                      </div>
                    )}
                    {report.has_cover && report.cover_notes && (
                      <div className="flex gap-2">
                        <ArrowLeftRight size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70 mb-0.5">Cover Details</p>
                          <p className="text-sm text-text-secondary">{report.cover_notes}</p>
                        </div>
                      </div>
                    )}
                    {report.notes && (
                      <div className="flex gap-2">
                        <StickyNote size={14} className="text-text-muted shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/70 mb-0.5">Notes</p>
                          <p className="text-sm text-text-secondary">{report.notes}</p>
                        </div>
                      </div>
                    )}
                    {!report.incident_notes && !report.cover_notes && !report.notes && (
                      <p className="text-xs text-text-muted italic">No additional details</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Alerts Tab (Admin Only) ──────────────────────────────────

interface MissingReport {
  chatter_id: string;
  chatter_name: string;
  date: string;
  shift: string;
  team: string;
}

function AlertsTab({ chatters }: { chatters: Chatter[] }) {
  const { profile } = useAuthStore();
  const [missing, setMissing] = useState<MissingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    detectMissing();
  }, [chatters]);

  async function detectMissing() {
    setLoading(true);

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const startDate = sevenDaysAgo.toISOString().slice(0, 10);
    const endDate = today.toISOString().slice(0, 10);

    const [schedulesRes, reportsRes, alertsRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('chatter_id, day_of_week, shift, week_start')
        .gte('week_start', getWeekStartForDate(sevenDaysAgo))
        .lte('week_start', getWeekStartForDate(today)),
      supabase
        .from('shift_reports')
        .select('chatter_id, date')
        .gte('date', startDate)
        .lte('date', endDate),
      supabase
        .from('shift_report_alerts')
        .select('chatter_id, date')
        .gte('date', startDate)
        .lte('date', endDate),
    ]);

    const schedules = schedulesRes.data || [];
    const reports = reportsRes.data || [];
    const alerts = alertsRes.data || [];

    const reportSet = new Set(reports.map(r => `${r.chatter_id}|${r.date}`));
    const alertSet = new Set(alerts.map(a => `${a.chatter_id}|${a.date}`));

    const chatterMap: Record<string, Chatter> = {};
    chatters.forEach(c => { chatterMap[c.id] = c; });

    const missingList: MissingReport[] = [];

    for (const sched of schedules) {
      const schedDate = computeScheduleDate(sched.week_start, sched.day_of_week);
      if (!schedDate || schedDate > endDate || schedDate >= endDate) continue;

      const key = `${sched.chatter_id}|${schedDate}`;
      if (reportSet.has(key) || alertSet.has(key)) continue;

      const chatter = chatterMap[sched.chatter_id];
      if (!chatter) continue;

      const teamForShift = TL_SHIFTS.find(t => t.chatterShift === sched.shift);

      if (!missingList.some(m => m.chatter_id === sched.chatter_id && m.date === schedDate)) {
        missingList.push({
          chatter_id: sched.chatter_id,
          chatter_name: chatter.full_name,
          date: schedDate,
          shift: sched.shift,
          team: teamForShift?.teamName || chatter.team_name || 'Unknown',
        });
      }
    }

    missingList.sort((a, b) => b.date.localeCompare(a.date) || a.chatter_name.localeCompare(b.chatter_name));
    setMissing(missingList);
    setLoading(false);
  }

  async function handleAction(item: MissingReport, action: 'accepted' | 'dismissed') {
    if (!profile) return;
    const key = `${item.chatter_id}|${item.date}`;
    setProcessing(key);
    setActionResult(null);

    try {
      const { error: alertError } = await supabase.from('shift_report_alerts').insert({
        chatter_id: item.chatter_id,
        chatter_name: item.chatter_name,
        date: item.date,
        shift: item.shift,
        action,
        resolved_by: profile.id,
      });

      if (alertError) throw alertError;

      if (action === 'accepted') {
        const { data: eventTypes } = await supabase
          .from('score_event_types')
          .select('id, points')
          .eq('name', 'Missing Shift Report')
          .eq('is_active', true)
          .limit(1);

        const eventType = eventTypes?.[0];
        if (!eventType) {
          setActionResult({ key, ok: false, msg: 'Score event type "Missing Shift Report" not found. Create it in Chatter Score config first.' });
          setProcessing(null);
          return;
        }

        const eventDate = item.date;
        const eventWeek = getWeekKey(new Date(eventDate));

        const { error: scoreError } = await supabase.from('score_events').insert({
          chatter_id: item.chatter_id,
          submitted_by: profile.id,
          date: eventDate,
          event_type_id: eventType.id,
          points: eventType.points,
          custom_points: null,
          notes: `Missing shift report for ${item.date}`,
          week: eventWeek,
        });

        if (scoreError) throw scoreError;
      }

      setMissing(prev => prev.filter(m => !(m.chatter_id === item.chatter_id && m.date === item.date)));
      setActionResult({
        key,
        ok: true,
        msg: action === 'accepted' ? `${item.chatter_name}: -5 points applied` : `Alert dismissed`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setActionResult({ key, ok: false, msg: message });
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-cw" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Showing missing shift reports for the last 7 days
        </p>
        <button
          onClick={detectMissing}
          className="text-xs text-cw hover:text-cw/80 font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      {actionResult && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          actionResult.ok
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {actionResult.msg}
        </div>
      )}

      {missing.length === 0 ? (
        <div className="bg-surface-1 rounded-xl border border-border p-8 text-center">
          <Check size={32} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-text-muted">No missing shift reports</p>
        </div>
      ) : (
        <div className="space-y-2">
          {missing.map(item => {
            const key = `${item.chatter_id}|${item.date}`;
            const isProcessing = processing === key;
            const dateStr = new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            });

            return (
              <div
                key={key}
                className="bg-surface-1 rounded-xl border border-red-500/20 p-4 flex items-center gap-4"
              >
                <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    Missing Shift Report
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {item.chatter_name} &middot; {item.shift} &middot; {dateStr} &middot; {item.team}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(item, 'dismissed')}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 border border-border text-text-secondary hover:text-text-primary hover:border-zinc-600 disabled:opacity-40 transition-all"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleAction(item, 'accepted')}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-all flex items-center gap-1"
                  >
                    {isProcessing ? <Loader2 size={12} className="animate-spin" /> : null}
                    Accept (-5 pts)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function getWeekStartForDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function computeScheduleDate(weekStart: string, dayOfWeek: number): string | null {
  try {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + dayOfWeek);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

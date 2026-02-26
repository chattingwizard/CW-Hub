import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { CoachingTask, CoachingLog, CoachingRedFlag } from '../types';
import {
  CheckCircle2, XCircle, Clock, Users, AlertTriangle, TrendingUp,
  Loader2, RefreshCw, BarChart3, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';

const TLS = [
  { key: 'huckle', name: 'Huckle', shift: '00:00–08:00', color: 'bg-orange-500' },
  { key: 'danilyn', name: 'Danilyn', shift: '08:00–16:00', color: 'bg-blue-500' },
  { key: 'ezekiel', name: 'Ezekiel', shift: '16:00–00:00', color: 'bg-purple-500' },
];

function parseJson<T>(val: unknown, fb: T): T {
  if (val === null || val === undefined) return fb;
  if (typeof val === 'string') { try { return JSON.parse(val) as T; } catch { return fb; } }
  return val as T;
}

function CompletionRing({ rate, size = 56 }: { rate: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - rate / 100);
  const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#eab308' : '#ef4444';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#252525" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700"
      />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill={color} fontSize={size * 0.28} fontWeight="bold">
        {rate}%
      </text>
    </svg>
  );
}

interface TlCardProps {
  tl: typeof TLS[number];
  tasks: CoachingTask[];
  logs: CoachingLog[];
  expanded: boolean;
  onToggle: () => void;
}

function TlCard({ tl, tasks, logs, expanded, onToggle }: TlCardProps) {
  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'completed');
  const skipped = tasks.filter((t) => t.status === 'skipped');
  const actionable = tasks.length - skipped.length;
  const rate = actionable > 0 ? Math.round((completed.length / actionable) * 100) : 100;

  const redFlagCount = tasks.reduce((sum, t) => {
    const flags = parseJson<CoachingRedFlag[]>(t.red_flags, []);
    return sum + flags.length;
  }, 0);

  const avgScore = (() => {
    const scores = tasks.map((t) => t.perf_score).filter((s): s is number => s !== null && s > 0);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  })();

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-2/50" onClick={onToggle}>
        <div className={`w-1 h-10 rounded-full ${tl.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{tl.name}</span>
            <span className="text-xs text-text-muted">{tl.shift} UTC</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-text-secondary">
            <span className="flex items-center gap-1"><Users size={11} />{actionable} chatters</span>
            {redFlagCount > 0 && (
              <span className="flex items-center gap-1 text-danger"><AlertTriangle size={11} />{redFlagCount} flags</span>
            )}
            {avgScore !== null && (
              <span className={`flex items-center gap-1 ${avgScore >= 60 ? 'text-success' : avgScore >= 40 ? 'text-warning' : 'text-danger'}`}>
                <BarChart3 size={11} />Avg: {avgScore}
              </span>
            )}
          </div>
        </div>

        <CompletionRing rate={rate} />

        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-success">{completed.length} done</span>
          <span className="text-xs text-warning">{pending.length} pending</span>
          {skipped.length > 0 && <span className="text-xs text-text-muted">{skipped.length} skipped</span>}
        </div>

        {expanded ? <ChevronUp size={14} className="text-text-muted ml-1" /> : <ChevronDown size={14} className="text-text-muted ml-1" />}
      </div>

      {expanded && (
        <div className="border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted text-left">
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Chatter</th>
                <th className="px-3 py-2 font-medium text-center">Score</th>
                <th className="px-3 py-2 font-medium text-center">Days</th>
                <th className="px-3 py-2 font-medium text-center">Flags</th>
                <th className="px-3 py-2 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {tasks
                .filter((t) => t.status !== 'skipped')
                .sort((a, b) => b.priority - a.priority)
                .map((task) => {
                  const flags = parseJson<CoachingRedFlag[]>(task.red_flags, []);
                  const log = logs.find((l) => l.task_id === task.id);
                  return (
                    <tr key={task.id} className="border-t border-border/50 hover:bg-surface-2/30">
                      <td className="px-5 py-2.5">
                        {task.status === 'completed' ? (
                          <CheckCircle2 size={16} className="text-success" />
                        ) : (
                          <XCircle size={16} className="text-text-muted" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-white font-medium">{task.chatter_name}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-bold ${
                          task.perf_score === null ? 'text-text-muted'
                          : task.perf_score >= 70 ? 'text-success'
                          : task.perf_score >= 40 ? 'text-warning'
                          : 'text-danger'
                        }`}>
                          {task.perf_score ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={
                          task.days_since_coaching >= 999 ? 'text-danger font-bold'
                          : task.days_since_coaching >= 4 ? 'text-danger'
                          : task.days_since_coaching >= 2 ? 'text-warning'
                          : 'text-text-secondary'
                        }>
                          {task.days_since_coaching >= 999 ? 'Never' : `${task.days_since_coaching}d`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {flags.length > 0 ? (
                          <span className="text-danger" title={flags.map(f => f.kpi).join(', ')}>{flags.length}</span>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {log ? (
                          <span className="text-success">{log.focus_kpi || 'General'}{log.notes ? ` — ${log.notes.slice(0, 40)}` : ''}</span>
                        ) : task.status === 'completed' ? (
                          <span className="text-success">Done</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CoachingOverview() {
  const [tasks, setTasks] = useState<CoachingTask[]>([]);
  const [logs, setLogs] = useState<CoachingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string[]>(TLS.map((t) => t.key));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    const [tasksRes, logsRes] = await Promise.all([
      supabase
        .from('coaching_tasks')
        .select('*')
        .eq('date', selectedDate)
        .order('priority', { ascending: false }),
      supabase
        .from('coaching_logs')
        .select('*')
        .eq('date', selectedDate),
    ]);

    if (tasksRes.data) {
      setTasks(tasksRes.data.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          ...r,
          red_flags: parseJson(r.red_flags, []),
          talking_points: parseJson(r.talking_points, []),
          kpis: parseJson(r.kpis, {}),
          active_goal: parseJson(r.active_goal, null),
          goal_progress: parseJson(r.goal_progress, null),
          recent_reports: parseJson(r.recent_reports, []),
        } as unknown as CoachingTask;
      }));
    }
    if (logsRes.data) setLogs(logsRes.data as CoachingLog[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedDate]);

  const globalStats = useMemo(() => {
    const actionable = tasks.filter((t) => t.status !== 'skipped');
    const completed = actionable.filter((t) => t.status === 'completed');
    const totalFlags = tasks.reduce((s, t) => s + parseJson<CoachingRedFlag[]>(t.red_flags, []).length, 0);
    return {
      total: actionable.length,
      completed: completed.length,
      rate: actionable.length > 0 ? Math.round((completed.length / actionable.length) * 100) : 100,
      flags: totalFlags,
    };
  }, [tasks]);

  const toggleTl = (key: string) => {
    setExpanded((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Coaching Overview</h1>
          <p className="text-text-secondary text-sm mt-1">Monitor coaching compliance across all teams.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw outline-none"
          />
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-white">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-1 border border-border rounded-xl px-4 py-3">
          <p className="text-xs text-text-muted">Completion Rate</p>
          <p className={`text-2xl font-bold ${globalStats.rate >= 80 ? 'text-success' : globalStats.rate >= 50 ? 'text-warning' : 'text-danger'}`}>
            {globalStats.rate}%
          </p>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl px-4 py-3">
          <p className="text-xs text-text-muted">Completed</p>
          <p className="text-2xl font-bold text-success">{globalStats.completed}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl px-4 py-3">
          <p className="text-xs text-text-muted">Total Required</p>
          <p className="text-2xl font-bold text-white">{globalStats.total}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl px-4 py-3">
          <p className="text-xs text-text-muted">Red Flags</p>
          <p className={`text-2xl font-bold ${globalStats.flags > 0 ? 'text-danger' : 'text-text-muted'}`}>{globalStats.flags}</p>
        </div>
      </div>

      {/* TL Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-cw" size={24} />
        </div>
      ) : (
        <div className="space-y-3">
          {TLS.map((tl) => (
            <TlCard
              key={tl.key}
              tl={tl}
              tasks={tasks.filter((t) => t.team_tl === tl.key)}
              logs={logs.filter((l) => l.team_tl === tl.key)}
              expanded={expanded.includes(tl.key)}
              onToggle={() => toggleTl(tl.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

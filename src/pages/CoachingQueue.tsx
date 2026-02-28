import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { CoachingTask, CoachingRedFlag, CoachingTalkingPoint, CoachingGoalProgress } from '../types';
import {
  CheckCircle2, Circle, AlertTriangle, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Target, MessageSquare, Clock, BarChart3,
  Phone, Loader2, RefreshCw, Filter,
} from 'lucide-react';

const TL_OPTIONS = [
  { key: 'huckle', name: 'Huckle', shift: '00:00 – 08:00 UTC' },
  { key: 'danilyn', name: 'Danilyn', shift: '08:00 – 16:00 UTC' },
  { key: 'ezekiel', name: 'Ezekiel', shift: '16:00 – 00:00 UTC' },
];

const KPI_LABELS: Record<string, string> = {
  sales_hr: 'Sales/hr', cvr: 'CVR', unlock: 'Unlock',
  golden: 'Golden', msg_hr: 'Msg/hr', reply_time: 'Reply',
  sales: 'Sales', hours: 'Hours',
};

const KPI_FORMATS: Record<string, (v: number | string) => string> = {
  sales_hr: (v) => `$${Number(v).toFixed(0)}`,
  cvr: (v) => `${Number(v).toFixed(1)}%`,
  unlock: (v) => `${Number(v).toFixed(0)}%`,
  golden: (v) => `${Number(v).toFixed(1)}%`,
  msg_hr: (v) => `${Number(v).toFixed(0)}`,
  reply_time: (v) => `${v}`,
  sales: (v) => `$${Number(v).toFixed(0)}`,
  hours: (v) => `${Number(v).toFixed(1)}h`,
};

const FOCUS_KPI_OPTIONS = ['Sales/hr', 'CVR', 'Unlock Rate', 'Golden Ratio', 'Msg/hr', 'Reply Time'];

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return val as T;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-text-muted text-xs">N/A</span>;
  const color = score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-danger';
  return <span className={`font-bold text-sm ${color}`}>{score}</span>;
}

function TrendIcon({ arrow, delta }: { arrow: string; delta: number }) {
  if (arrow === 'up') return <span className="text-success flex items-center gap-0.5 text-xs"><TrendingUp size={12} />+{delta}</span>;
  if (arrow === 'down') return <span className="text-danger flex items-center gap-0.5 text-xs"><TrendingDown size={12} />{delta}</span>;
  return <span className="text-text-muted flex items-center gap-0.5 text-xs"><Minus size={12} />0</span>;
}

function PriorityBar({ priority }: { priority: number }) {
  const pct = Math.min(100, priority);
  const color = priority >= 70 ? 'bg-danger' : priority >= 40 ? 'bg-warning' : 'bg-cw';
  return (
    <div className="w-14 h-1.5 bg-surface-3 rounded-full overflow-hidden" title={`Priority: ${priority}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function GoalStatus({ progress }: { progress: CoachingGoalProgress | null }) {
  if (!progress) return null;
  const statusMap: Record<string, { label: string; color: string }> = {
    reached: { label: 'Reached', color: 'text-success' },
    improving: { label: 'Improving', color: 'text-cw' },
    declined: { label: 'Declined', color: 'text-danger' },
    unknown: { label: 'Unknown', color: 'text-text-muted' },
  };
  const s = statusMap[progress.status] ?? { label: 'Unknown', color: 'text-text-muted' };
  return (
    <div className="flex items-center gap-2 text-xs">
      <Target size={12} className={s.color} />
      <span className="text-text-secondary">{progress.kpi}:</span>
      <span className={s.color}>{s.label}</span>
      <span className="text-text-muted">
        ({progress.baseline != null ? `${progress.baseline} → ` : ''}{typeof progress.current === 'number' ? progress.current.toFixed(1) : progress.current} / {progress.target})
      </span>
    </div>
  );
}

interface CompletionFormProps {
  task: CoachingTask;
  onSubmit: (data: { focus_kpi: string; target_value: string; notes: string }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function CompletionForm({ task, onSubmit, onCancel, loading }: CompletionFormProps) {
  const [focusKpi, setFocusKpi] = useState(task.active_goal?.kpi || '');
  const [targetValue, setTargetValue] = useState(task.active_goal?.target?.toString() || '');
  const [notes, setNotes] = useState('');

  return (
    <div className="mt-3 p-4 bg-surface-2 rounded-lg border border-border space-y-3">
      <p className="text-xs font-medium text-cw uppercase tracking-wide">Log Coaching Session</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-secondary mb-1 block">Focus KPI</label>
          <select
            value={focusKpi}
            onChange={(e) => setFocusKpi(e.target.value)}
            className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw outline-none"
          >
            <option value="">Select KPI...</option>
            {FOCUS_KPI_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1 block">Target Value</label>
          <input
            type="number"
            step="any"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="e.g. 30"
            className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-text-secondary mb-1 block">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Quick notes about the session..."
          className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw outline-none resize-none"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-secondary hover:text-white rounded-lg hover:bg-surface-3">
          Cancel
        </button>
        <button
          onClick={() => onSubmit({ focus_kpi: focusKpi, target_value: targetValue, notes })}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-medium bg-cw text-white rounded-lg hover:bg-cw-dark disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Mark Complete
        </button>
      </div>
    </div>
  );
}

export default function CoachingQueue() {
  const { profile } = useAuthStore();
  const [tasks, setTasks] = useState<CoachingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTl, setSelectedTl] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [formLoadingId, setFormLoadingId] = useState<number | null>(null);
  const [showFilter, setShowFilter] = useState<'all' | 'pending' | 'completed'>('all');

  // Auto-detect TL based on profile name
  useEffect(() => {
    if (!profile) return;
    const name = profile.full_name?.toLowerCase() || '';
    const match = TL_OPTIONS.find((tl) => name.includes(tl.key));
    setSelectedTl(match?.key ?? TL_OPTIONS[0]?.key ?? 'huckle');
  }, [profile]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('coaching_tasks')
      .select('*')
      .eq('date', today)
      .order('priority', { ascending: false });

    if (!error && data) {
      setTasks(data.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          ...r,
          red_flags: parseJsonField<CoachingRedFlag[]>(r.red_flags, []),
          talking_points: parseJsonField<CoachingTalkingPoint[]>(r.talking_points, []),
          kpis: parseJsonField<Record<string, number | string>>(r.kpis, {}),
          active_goal: parseJsonField(r.active_goal, null),
          goal_progress: parseJsonField<CoachingGoalProgress | null>(r.goal_progress, null),
          recent_reports: parseJsonField(r.recent_reports, []),
        } as unknown as CoachingTask;
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const filtered = useMemo(() => {
    let list = tasks.filter((t) => t.team_tl === selectedTl);
    if (showFilter === 'pending') list = list.filter((t) => t.status === 'pending');
    if (showFilter === 'completed') list = list.filter((t) => t.status === 'completed');
    return list;
  }, [tasks, selectedTl, showFilter]);

  const stats = useMemo(() => {
    const tl = tasks.filter((t) => t.team_tl === selectedTl);
    const pending = tl.filter((t) => t.status === 'pending');
    const completed = tl.filter((t) => t.status === 'completed');
    const skipped = tl.filter((t) => t.status === 'skipped');
    return { total: tl.length, pending: pending.length, completed: completed.length, skipped: skipped.length };
  }, [tasks, selectedTl]);

  const completionRate = stats.total - stats.skipped > 0
    ? Math.round((stats.completed / (stats.total - stats.skipped)) * 100)
    : 0;

  const handleComplete = async (taskId: number, formData: { focus_kpi: string; target_value: string; notes: string }) => {
    setFormLoadingId(taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Update task status
    await supabase
      .from('coaching_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: profile?.id })
      .eq('id', taskId);

    // Create coaching log
    await supabase.from('coaching_logs').insert({
      task_id: taskId,
      date: task.date,
      chatter_name: task.chatter_name,
      team_tl: task.team_tl,
      completed_by: profile?.id,
      focus_kpi: formData.focus_kpi || null,
      target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      notes: formData.notes || null,
      perf_score: task.perf_score,
      kpis: task.kpis,
    });

    setFormLoadingId(null);
    setCompletingId(null);
    setExpandedId(null);
    fetchTasks();
  };

  const handleUndo = async (taskId: number) => {
    await supabase
      .from('coaching_tasks')
      .update({ status: 'pending', completed_at: null, completed_by: null })
      .eq('id', taskId);

    // Remove the log too
    await supabase.from('coaching_logs').delete().eq('task_id', taskId);
    fetchTasks();
  };

  const currentTl = TL_OPTIONS.find((t) => t.key === selectedTl);

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary">Coaching Queue</h1>
        <p className="text-text-secondary text-sm mt-1">
          Daily coaching checklist. Complete each session and log the focus area.
        </p>
      </div>

      {/* TL Selector + Stats */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border">
          {TL_OPTIONS.map((tl) => {
            const tlPending = tasks.filter((t) => t.team_tl === tl.key && t.status === 'pending').length;
            return (
              <button
                key={tl.key}
                onClick={() => setSelectedTl(tl.key)}
                className={`px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm rounded-md font-medium transition-colors relative ${
                  selectedTl === tl.key
                    ? 'bg-cw text-white'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {tl.name}
                {tlPending > 0 && selectedTl !== tl.key && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-[10px] text-white flex items-center justify-center font-bold">
                    {tlPending}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="text-text-muted">{currentTl?.shift}</span>
        </div>

        <button
          onClick={fetchTasks}
          className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-white"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{completionRate}%</p>
              <p className="text-[10px] text-text-muted uppercase">Completion</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex gap-4 text-xs">
              <button
                onClick={() => setShowFilter('all')}
                className={`flex flex-col items-center ${showFilter === 'all' ? 'text-white' : 'text-text-secondary hover:text-white'}`}
              >
                <span className="font-bold text-base">{stats.total - stats.skipped}</span>
                <span>Total</span>
              </button>
              <button
                onClick={() => setShowFilter('pending')}
                className={`flex flex-col items-center ${showFilter === 'pending' ? 'text-warning' : 'text-text-secondary hover:text-warning'}`}
              >
                <span className="font-bold text-base">{stats.pending}</span>
                <span>Pending</span>
              </button>
              <button
                onClick={() => setShowFilter('completed')}
                className={`flex flex-col items-center ${showFilter === 'completed' ? 'text-success' : 'text-text-secondary hover:text-success'}`}
              >
                <span className="font-bold text-base">{stats.completed}</span>
                <span>Done</span>
              </button>
            </div>
          </div>
          {stats.skipped > 0 && (
            <span className="text-xs text-text-muted">{stats.skipped} on track (skipped)</span>
          )}
        </div>
        <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cw to-success rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-cw" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <Phone size={32} className="mx-auto mb-3 opacity-30" />
          <p>No coaching tasks for this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const isExpanded = expandedId === task.id;
            const isCompleting = completingId === task.id;
            const isDone = task.status === 'completed';

            return (
              <div
                key={task.id}
                className={`bg-surface-1 border rounded-xl overflow-hidden transition-all ${
                  isDone ? 'border-success/30 opacity-75' : 'border-border hover:border-border-light'
                }`}
              >
                {/* Main Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                >
                  {/* Status Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDone) {
                        handleUndo(task.id);
                      } else {
                        setCompletingId(task.id);
                        setExpandedId(task.id);
                      }
                    }}
                    className={`shrink-0 ${isDone ? 'text-success hover:text-success/70' : 'text-text-muted hover:text-cw'}`}
                  >
                    {isDone ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                  </button>

                  {/* Chatter Name + Days */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${isDone ? 'line-through text-text-muted' : 'text-white'}`}>
                        {task.chatter_name}
                      </span>
                      {task.days_since_coaching >= 999 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/20 text-danger font-medium">Never coached</span>
                      ) : task.days_since_coaching >= 4 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/20 text-danger font-medium">{task.days_since_coaching}d overdue</span>
                      ) : task.days_since_coaching >= 2 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning font-medium">{task.days_since_coaching}d ago</span>
                      ) : null}
                    </div>
                    {/* Red flags inline */}
                    {task.red_flags.length > 0 && !isExpanded && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <AlertTriangle size={10} className="text-danger shrink-0" />
                        <span className="text-[11px] text-danger truncate">
                          {task.red_flags.map((f) => f.kpi).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Score + Trend */}
                  <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={task.perf_score} />
                    <TrendIcon arrow={task.trend_arrow} delta={task.trend_delta} />
                    <PriorityBar priority={task.priority} />
                    {isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {/* KPIs Grid */}
                    {Object.keys(task.kpis).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                        {Object.entries(task.kpis).map(([key, val]) => {
                          const keyBase = key.split('_')[0] ?? key;
                          const isRed = task.red_flags.some((f) => f.kpi.toLowerCase().includes(keyBase));
                          return (
                            <div key={key} className={`px-2 py-1.5 rounded-lg text-center ${isRed ? 'bg-danger/10 border border-danger/30' : 'bg-surface-2'}`}>
                              <p className="text-[10px] text-text-muted uppercase">{KPI_LABELS[key] || key}</p>
                              <p className={`text-sm font-medium ${isRed ? 'text-danger' : 'text-white'}`}>
                                {key in KPI_FORMATS ? KPI_FORMATS[key]!(val) : String(val)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Goal Progress */}
                    <GoalStatus progress={task.goal_progress} />

                    {/* Talking Points */}
                    {task.talking_points.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-medium text-cw uppercase tracking-wide flex items-center gap-1">
                          <MessageSquare size={10} /> Talking Points
                        </p>
                        {task.talking_points.map((tp, i) => (
                          <div key={i} className="bg-surface-2 rounded-lg p-3">
                            <p className="text-xs font-medium text-warning mb-1">{tp.kpi} (target: {tp.target})</p>
                            <ul className="space-y-0.5">
                              {tp.actions.map((a, j) => (
                                <li key={j} className="text-xs text-text-secondary pl-3 relative before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-text-muted">
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recent Reports */}
                    {task.recent_reports.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Clock size={10} /> Recent Reports
                        </p>
                        {task.recent_reports.map((r, i) => (
                          <p key={i} className="text-xs text-text-secondary">
                            <span className="text-text-muted">{r.date}:</span> {r.resolution || 'No resolution'}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Completion Form */}
                    {isCompleting && !isDone && (
                      <CompletionForm
                        task={task}
                        onSubmit={(data) => handleComplete(task.id, data)}
                        onCancel={() => setCompletingId(null)}
                        loading={formLoadingId === task.id}
                      />
                    )}

                    {/* Action Buttons */}
                    {!isCompleting && !isDone && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => setCompletingId(task.id)}
                          className="px-4 py-2 text-xs font-medium bg-cw text-white rounded-lg hover:bg-cw-dark flex items-center gap-1.5"
                        >
                          <Phone size={12} /> Log Coaching Call
                        </button>
                      </div>
                    )}

                    {isDone && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-success flex items-center gap-1">
                          <CheckCircle2 size={12} /> Completed {task.completed_at ? new Date(task.completed_at).toLocaleTimeString() : ''}
                        </span>
                        <button
                          onClick={() => handleUndo(task.id)}
                          className="text-xs text-text-muted hover:text-danger"
                        >
                          Undo
                        </button>
                      </div>
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

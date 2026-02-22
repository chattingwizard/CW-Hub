import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Task, TaskStatus, TaskPriority, TaskCategory, Profile } from '../types';
import {
  Plus, X, Calendar, Flag, Tag, User, Search,
  LayoutGrid, List, ChevronDown, MessageSquare,
  Clock, MoreHorizontal, Check, AlertCircle,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  backlog:     { label: 'Backlog',     color: 'text-text-muted',   bgColor: 'bg-surface-2' },
  todo:        { label: 'To Do',       color: 'text-blue-400',     bgColor: 'bg-blue-500/10' },
  in_progress: { label: 'In Progress', color: 'text-yellow-400',   bgColor: 'bg-yellow-500/10' },
  review:      { label: 'Review',      color: 'text-purple-400',   bgColor: 'bg-purple-500/10' },
  done:        { label: 'Done',        color: 'text-green-400',    bgColor: 'bg-green-500/10' },
  cancelled:   { label: 'Cancelled',   color: 'text-text-muted',   bgColor: 'bg-surface-2' },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-400',    icon: '🔴' },
  high:   { label: 'High',   color: 'text-orange-400', icon: '🟠' },
  medium: { label: 'Medium', color: 'text-yellow-400', icon: '🟡' },
  low:    { label: 'Low',    color: 'text-text-muted',  icon: '⚪' },
};

const CATEGORY_CONFIG: Record<TaskCategory, { label: string; color: string }> = {
  operations:  { label: 'Operations',  color: 'bg-blue-500/20 text-blue-400' },
  coaching:    { label: 'Coaching',    color: 'bg-green-500/20 text-green-400' },
  content:     { label: 'Content',     color: 'bg-pink-500/20 text-pink-400' },
  recruitment: { label: 'Recruitment', color: 'bg-purple-500/20 text-purple-400' },
  technical:   { label: 'Technical',   color: 'bg-cyan-500/20 text-cyan-400' },
  admin:       { label: 'Admin',       color: 'bg-orange-500/20 text-orange-400' },
  other:       { label: 'Other',       color: 'bg-surface-3 text-text-secondary' },
};

const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function isDueSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff >= 0 && diff < 2 * 24 * 60 * 60 * 1000;
}

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

// ── Component ────────────────────────────────────────────────

export default function Tasks() {
  const { profile } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // ── Fetch ────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role, avatar_url), creator:profiles!tasks_creator_id_fkey(id, full_name, email, role)')
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false });

    if (data) setTasks(data as Task[]);
    setLoading(false);
  }, []);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url')
      .eq('is_active', true)
      .order('full_name');
    if (data) setMembers(data as Profile[]);
  }, []);

  useEffect(() => { fetchTasks(); fetchMembers(); }, [fetchTasks, fetchMembers]);

  // ── Filters ──────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = tasks;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    if (filterAssignee === 'me') {
      result = result.filter(t => t.assignee_id === profile?.id);
    } else if (filterAssignee !== 'all') {
      result = result.filter(t => t.assignee_id === filterAssignee);
    }
    if (filterPriority !== 'all') result = result.filter(t => t.priority === filterPriority);
    if (filterCategory !== 'all') result = result.filter(t => t.category === filterCategory);
    return result;
  }, [tasks, search, filterAssignee, filterPriority, filterCategory, profile?.id]);

  const boardTasks = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [], todo: [], in_progress: [], review: [], done: [], cancelled: [],
    };
    for (const t of filtered) {
      map[t.status]?.push(t);
    }
    return map;
  }, [filtered]);

  // ── Actions ──────────────────────────────────────────────

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, status } : null);
  }

  async function deleteTask(taskId: string) {
    await supabase.from('tasks').delete().eq('id', taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);
  }

  // ── Create Task ──────────────────────────────────────────

  function CreateModal() {
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [priority, setPriority] = useState<TaskPriority>('medium');
    const [category, setCategory] = useState<TaskCategory>('operations');
    const [assigneeId, setAssigneeId] = useState<string>('');
    const [dueDate, setDueDate] = useState('');
    const [saving, setSaving] = useState(false);

    async function handleCreate() {
      if (!title.trim() || !profile) return;
      setSaving(true);
      const { data } = await supabase.from('tasks').insert({
        title: title.trim(),
        description: desc.trim(),
        priority,
        category,
        assignee_id: assigneeId || null,
        creator_id: profile.id,
        due_date: dueDate || null,
        team: profile.team_name,
      }).select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role, avatar_url), creator:profiles!tasks_creator_id_fkey(id, full_name, email, role)').single();

      if (data) {
        setTasks(prev => [data as Task, ...prev]);
        setShowCreate(false);
      }
      setSaving(false);
    }

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]" onClick={() => setShowCreate(false)}>
        <div className="bg-surface-1 border border-border rounded-2xl w-[calc(100%-2rem)] sm:max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-base font-bold text-white">New Task</h2>
            <button onClick={() => setShowCreate(false)} className="text-text-muted hover:text-white"><X size={18} /></button>
          </div>

          <div className="p-4 space-y-4">
            <input
              autoFocus
              placeholder="Task title..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-transparent text-white text-lg font-semibold placeholder:text-text-muted outline-none"
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
            />

            <textarea
              placeholder="Description (optional)"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              className="w-full bg-surface-2 border border-border rounded-lg p-3 text-sm text-text-secondary placeholder:text-text-muted outline-none resize-none focus:border-cw/50"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white outline-none">
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value as TaskCategory)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white outline-none">
                  {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Assignee</label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white outline-none">
                  <option value="">Unassigned</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Due date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white outline-none" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={!title.trim() || saving}
              className="px-4 py-2 text-sm font-medium bg-cw text-white rounded-lg hover:bg-cw/90 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Task Detail ──────────────────────────────────────────

  function TaskDetail({ task }: { task: Task }) {
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const [editDesc, setEditDesc] = useState(task.description || '');
    const [isEditingDesc, setIsEditingDesc] = useState(false);

    useEffect(() => {
      supabase.from('task_comments')
        .select('*, author:profiles!task_comments_author_id_fkey(id, full_name)')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true })
        .then(({ data }) => { if (data) setComments(data); });
    }, [task.id]);

    async function addComment() {
      if (!newComment.trim() || !profile) return;
      const { data } = await supabase.from('task_comments').insert({
        task_id: task.id,
        author_id: profile.id,
        content: newComment.trim(),
      }).select('*, author:profiles!task_comments_author_id_fkey(id, full_name)').single();
      if (data) { setComments(prev => [...prev, data]); setNewComment(''); }
    }

    async function saveDescription() {
      await supabase.from('tasks').update({ description: editDesc }).eq('id', task.id);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description: editDesc } : t));
      setIsEditingDesc(false);
    }

    const pc = PRIORITY_CONFIG[task.priority];
    const cc = CATEGORY_CONFIG[task.category];

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh]" onClick={() => setSelectedTask(null)}>
        <div className="bg-surface-1 border border-border rounded-2xl w-[calc(100%-2rem)] sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-border">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-lg font-bold text-white leading-tight">{task.title}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${cc.color}`}>{cc.label}</span>
                <span className={`text-xs ${pc.color}`}>{pc.icon} {pc.label}</span>
                {task.due_date && (
                  <span className={`text-xs flex items-center gap-1 ${isOverdue(task.due_date) ? 'text-red-400' : isDueSoon(task.due_date) ? 'text-yellow-400' : 'text-text-muted'}`}>
                    <Calendar size={12} /> {task.due_date}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedTask(null)} className="text-text-muted hover:text-white"><X size={18} /></button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Status + Assignee */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted mb-1 block">Status</label>
                <select
                  value={task.status}
                  onChange={e => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white outline-none"
                >
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-text-muted mb-1 block">Assignee</label>
                <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2">
                  <User size={14} className="text-text-muted" />
                  <span className="text-sm text-white">{(task.assignee as any)?.full_name || 'Unassigned'}</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-muted">Description</label>
                {!isEditingDesc && (
                  <button onClick={() => setIsEditingDesc(true)} className="text-xs text-cw hover:underline">Edit</button>
                )}
              </div>
              {isEditingDesc ? (
                <div>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    rows={4} className="w-full bg-surface-2 border border-border rounded-lg p-3 text-sm text-text-secondary outline-none resize-none focus:border-cw/50" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveDescription} className="px-3 py-1 text-xs font-medium bg-cw text-white rounded-lg">Save</button>
                    <button onClick={() => setIsEditingDesc(false)} className="px-3 py-1 text-xs text-text-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-secondary whitespace-pre-wrap bg-surface-2 rounded-lg p-3 min-h-[60px]">
                  {task.description || 'No description'}
                </p>
              )}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-text-muted">
              <div className="flex items-center gap-1"><User size={12} /> Created by {(task.creator as any)?.full_name}</div>
              <div className="flex items-center gap-1"><Clock size={12} /> {timeAgo(task.created_at)} ago</div>
              <div className="flex items-center gap-1"><MessageSquare size={12} /> {comments.length} comments</div>
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Comments</h3>
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white">{c.author?.full_name}</span>
                      <span className="text-xs text-text-muted">{timeAgo(c.created_at)} ago</span>
                    </div>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment..." onKeyDown={e => e.key === 'Enter' && addComment()}
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted outline-none focus:border-cw/50" />
                <button onClick={addComment} disabled={!newComment.trim()}
                  className="px-3 py-2 text-sm font-medium bg-cw/20 text-cw rounded-lg hover:bg-cw/30 disabled:opacity-50">
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex justify-between p-4 border-t border-border">
            <button onClick={() => { if (confirm('Delete this task?')) deleteTask(task.id); }}
              className="text-xs text-red-400 hover:text-red-300">Delete task</button>
            {task.status !== 'done' && (
              <button onClick={() => updateTaskStatus(task.id, 'done')}
                className="px-3 py-1.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 flex items-center gap-1">
                <Check size={14} /> Mark Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Task Card ────────────────────────────────────────────

  function TaskCard({ task }: { task: Task }) {
    const pc = PRIORITY_CONFIG[task.priority];
    const cc = CATEGORY_CONFIG[task.category];
    const overdue = isOverdue(task.due_date);
    const dueSoon = isDueSoon(task.due_date);

    return (
      <div
        onClick={() => setSelectedTask(task)}
        className="bg-surface-1 border border-border rounded-xl p-3 cursor-pointer hover:border-cw/30 hover:shadow-lg hover:shadow-cw/5 transition-all group"
      >
        <div className="flex items-start justify-between mb-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${cc.color}`}>{cc.label}</span>
          <span className={`text-xs ${pc.color}`}>{pc.icon}</span>
        </div>

        <h3 className="text-sm font-medium text-white leading-snug mb-2 group-hover:text-cw transition-colors">{task.title}</h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {task.due_date && (
              <span className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-400' : dueSoon ? 'text-yellow-400' : 'text-text-muted'}`}>
                <Calendar size={11} />
                {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          {task.assignee && (
            <div className="w-6 h-6 rounded-full bg-cw/20 flex items-center justify-center" title={(task.assignee as any).full_name}>
              <span className="text-xs font-medium text-cw">
                {(task.assignee as any).full_name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Board View ───────────────────────────────────────────

  function BoardView() {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-[calc(100vh-220px)] overflow-hidden">
        {BOARD_COLUMNS.map(status => {
          const config = STATUS_CONFIG[status];
          const columnTasks = boardTasks[status];
          return (
            <div key={status} className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={`w-2 h-2 rounded-full ${config.bgColor}`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${config.color}`}>{config.label}</span>
                <span className="text-xs text-text-muted ml-auto">{columnTasks.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {columnTasks.map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {columnTasks.length === 0 && (
                  <div className="flex items-center justify-center h-24 border border-dashed border-border rounded-xl">
                    <span className="text-xs text-text-muted">No tasks</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── List View ────────────────────────────────────────────

  function ListView() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider border-b border-border">
              <th className="pb-3 pl-3">Priority</th>
              <th className="pb-3">Title</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Category</th>
              <th className="pb-3">Assignee</th>
              <th className="pb-3">Due</th>
              <th className="pb-3 pr-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(task => {
              const pc = PRIORITY_CONFIG[task.priority];
              const sc = STATUS_CONFIG[task.status];
              const cc = CATEGORY_CONFIG[task.category];
              const overdue = isOverdue(task.due_date);
              return (
                <tr key={task.id} onClick={() => setSelectedTask(task)}
                  className="border-b border-border/50 cursor-pointer hover:bg-surface-2 transition-colors">
                  <td className="py-3 pl-3"><span className={pc.color}>{pc.icon}</span></td>
                  <td className="py-3 font-medium text-white max-w-[300px] truncate">{task.title}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sc.bgColor} ${sc.color}`}>{sc.label}</span>
                  </td>
                  <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${cc.color}`}>{cc.label}</span></td>
                  <td className="py-3 text-text-secondary">{(task.assignee as any)?.full_name || '—'}</td>
                  <td className={`py-3 text-xs ${overdue ? 'text-red-400' : 'text-text-muted'}`}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="py-3 pr-3 text-xs text-text-muted">{timeAgo(task.created_at)} ago</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <AlertCircle size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No tasks match your filters</p>
          </div>
        )}
      </div>
    );
  }

  // ── Main Render ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-white">Tasks</h1>
          <p className="text-sm text-text-secondary mt-0.5">{filtered.length} tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-2 rounded-lg p-0.5">
            <button onClick={() => setView('board')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${view === 'board' ? 'bg-surface-3 text-white' : 'text-text-muted hover:text-white'}`}>
              <LayoutGrid size={14} /> Board
            </button>
            <button onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${view === 'list' ? 'bg-surface-3 text-white' : 'text-text-muted hover:text-white'}`}>
              <List size={14} /> List
            </button>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-cw text-white text-sm font-medium rounded-lg hover:bg-cw/90 transition-colors">
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-text-muted outline-none focus:border-cw/50" />
        </div>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-white outline-none">
          <option value="all">All Members</option>
          <option value="me">My Tasks</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-white outline-none">
          <option value="all">All Priorities</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>

        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-white outline-none">
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Content */}
      {view === 'board' ? <BoardView /> : <ListView />}

      {/* Modals */}
      {showCreate && <CreateModal />}
      {selectedTask && <TaskDetail task={selectedTask} />}
    </div>
  );
}

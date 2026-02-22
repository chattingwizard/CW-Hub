import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DndContext, DragOverlay, closestCenter, useSensor, useSensors, PointerSensor,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { SHIFTS, SHIFT_LABELS, getDayName, formatDate } from '../lib/utils';
import { getTLForShift, getTeamColor } from '../lib/roles';
import { cn } from '../lib/utils';
import {
  ChevronLeft, ChevronRight, Save, X, Copy, Plus,
  AlertTriangle, GripVertical, Search, Filter,
} from 'lucide-react';
import type { Chatter, Schedule, ShiftSlot } from '../types';

// ── Draggable Chip ───────────────────────────────────────────

function ChatterChip({ chatter, onRemove, isDragging }: {
  chatter?: Chatter;
  onRemove?: () => void;
  isDragging?: boolean;
}) {
  const teamColor = chatter?.team_name ? getTeamColor(chatter.team_name) : '';
  const dotColor = chatter?.team_name?.includes('Huckle') ? 'bg-orange-400'
    : chatter?.team_name?.includes('Danilyn') ? 'bg-blue-400'
    : chatter?.team_name?.includes('Ezekiel') ? 'bg-purple-400'
    : 'bg-zinc-500';

  return (
    <div className={cn(
      'group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all border',
      isDragging ? 'opacity-50 scale-95' : '',
      teamColor || 'bg-surface-2 text-text-secondary border-border',
    )}>
      <div className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} />
      <span className="truncate flex-1">{chatter?.full_name ?? '?'}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 shrink-0 hover:text-danger transition-opacity"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ── Schedule Cell ────────────────────────────────────────────

function ScheduleCell({ schedules, dayIdx, shift, onAdd, onRemove, isToday }: {
  schedules: Schedule[];
  dayIdx: number;
  shift: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  isToday: boolean;
}) {
  return (
    <div className={cn(
      'min-h-[120px] rounded-xl border p-2 flex flex-col gap-1 transition-colors',
      isToday ? 'bg-cw/[0.03] border-cw/20' : 'bg-surface-1 border-border hover:border-border-light',
    )}>
      {schedules.map((s) => (
        <ChatterChip
          key={s.id}
          chatter={s.chatter}
          onRemove={() => onRemove(s.id)}
        />
      ))}
      <button
        onClick={onAdd}
        className="mt-auto flex items-center justify-center py-1 rounded-lg text-text-muted hover:text-cw hover:bg-cw/5 transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

// ── Chatter Picker Modal ─────────────────────────────────────

function ChatterPicker({ chatters, existingIds, onSelect, onClose }: {
  chatters: Chatter[];
  existingIds: Set<string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  const teams = useMemo(() =>
    [...new Set(chatters.map(c => c.team_name).filter(Boolean))] as string[],
    [chatters]
  );

  const filtered = chatters.filter(c => {
    if (existingIds.has(c.id)) return false;
    if (search && !c.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (teamFilter !== 'all' && c.team_name !== teamFilter) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-1 border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-text-primary">Add Chatter</h3>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search chatters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cw/50"
              autoFocus
            />
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            <button
              onClick={() => setTeamFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
                teamFilter === 'all' ? 'bg-cw/15 text-cw' : 'bg-surface-2 text-text-muted hover:text-text-secondary'
              )}
            >
              All
            </button>
            {teams.map(t => (
              <button
                key={t}
                onClick={() => setTeamFilter(t)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
                  teamFilter === t ? 'bg-cw/15 text-cw' : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                )}
              >
                {t.replace('Team ', '')}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-text-muted text-sm py-6">No chatters available</p>
          ) : (
            filtered.map(c => {
              const dotColor = c.team_name?.includes('Huckle') ? 'bg-orange-400'
                : c.team_name?.includes('Danilyn') ? 'bg-blue-400'
                : c.team_name?.includes('Ezekiel') ? 'bg-purple-400'
                : 'bg-zinc-500';

              return (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c.id); onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left"
                >
                  <div className={cn('w-2.5 h-2.5 rounded-full', dotColor)} />
                  <span className="text-sm text-text-primary font-medium flex-1">{c.full_name}</span>
                  <span className="text-[10px] text-text-muted">{c.team_name?.replace('Team ', '')}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function Schedules() {
  const { profile } = useAuthStore();
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [pickerTarget, setPickerTarget] = useState<{ dayIdx: number; shift: string } | null>(null);

  const getWeekStart = (offset: number) => {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) + offset * 7;
    d.setUTCDate(diff);
    return d.toISOString().split('T')[0]!;
  };

  const weekStart = getWeekStart(weekOffset);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  }), [weekStart]);

  const weekLabel = useMemo(() => {
    const s = weekDates[0]!;
    const e = weekDates[6]!;
    return `${formatDate(s, 'short')} – ${formatDate(e, 'short')}`;
  }, [weekDates]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [chattersRes, schedulesRes] = await Promise.all([
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter').order('full_name'),
      supabase.from('schedules').select('*, chatter:chatters!schedules_chatter_id_fkey(*)').eq('week_start', weekStart),
    ]);
    setChatters((chattersRes.data ?? []) as Chatter[]);
    setSchedules((schedulesRes.data ?? []) as Schedule[]);
    setLoading(false);
    setDirty(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSchedulesForCell = (dayIdx: number, shift: string) =>
    schedules.filter(s => s.day_of_week === dayIdx && s.shift === shift);

  const addToCell = (dayIdx: number, shift: string, chatterId: string) => {
    if (schedules.some(s => s.chatter_id === chatterId && s.day_of_week === dayIdx && s.shift === shift)) return;
    setSchedules(prev => [...prev, {
      id: crypto.randomUUID(),
      chatter_id: chatterId,
      week_start: weekStart,
      day_of_week: dayIdx,
      shift: shift as ShiftSlot,
      created_by: profile?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      chatter: chatters.find(c => c.id === chatterId),
    }]);
    setDirty(true);
  };

  const removeFromCell = (scheduleId: string) => {
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
    setDirty(true);
  };

  const handleCopyPreviousWeek = async () => {
    const prevWeekStart = getWeekStart(weekOffset - 1);
    const { data } = await supabase.from('schedules').select('*, chatter:chatters!schedules_chatter_id_fkey(*)').eq('week_start', prevWeekStart);
    if (!data || data.length === 0) {
      setSaveMsg('No schedules in previous week');
      setTimeout(() => setSaveMsg(''), 2000);
      return;
    }
    const existing = new Set(schedules.map(s => `${s.chatter_id}-${s.day_of_week}-${s.shift}`));
    const newEntries = (data as Schedule[])
      .filter(s => !existing.has(`${s.chatter_id}-${s.day_of_week}-${s.shift}`))
      .map(s => ({
        ...s,
        id: crypto.randomUUID(),
        week_start: weekStart,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    setSchedules(prev => [...prev, ...newEntries]);
    setDirty(true);
    setSaveMsg(`Copied ${newEntries.length} entries`);
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('schedules').delete().eq('week_start', weekStart);
      const rows = schedules.map(s => ({
        chatter_id: s.chatter_id,
        week_start: s.week_start,
        day_of_week: s.day_of_week,
        shift: s.shift,
        created_by: profile?.id,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('schedules').insert(rows);
        if (error) throw error;
      }
      setSaveMsg('Saved!');
      setDirty(false);
      setTimeout(() => setSaveMsg(''), 2000);
      fetchData();
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Stats
  const totalSlots = schedules.length;
  const uniqueChatters = new Set(schedules.map(s => s.chatter_id)).size;
  const assignedIds = new Set(schedules.map(s => s.chatter_id));
  const unassignedChatters = chatters.filter(c => !assignedIds.has(c.id));

  const shiftStats = SHIFTS.map(shift => {
    const count = schedules.filter(s => s.shift === shift).length;
    return { shift, count, avg: (count / 7).toFixed(1) };
  });

  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-text-secondary">
          <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
          Loading schedules...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Weekly Schedule</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {uniqueChatters} chatters · {totalSlots} shifts assigned
            {unassignedChatters.length > 0 && (
              <span className="text-warning ml-2">
                <AlertTriangle size={12} className="inline -mt-0.5 mr-0.5" />
                {unassignedChatters.length} unassigned
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saveMsg && (
            <span className={cn(
              'text-sm font-medium px-3 py-1 rounded-lg',
              saveMsg.startsWith('Error') ? 'bg-danger-muted text-danger' : 'bg-success-muted text-success'
            )}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleCopyPreviousWeek}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-2 hover:text-text-primary text-sm font-medium"
          >
            <Copy size={14} />
            <span className="hidden sm:inline">Copy Prev Week</span>
          </button>
          <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-lg px-2 py-1.5">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 hover:text-cw text-text-muted rounded-md hover:bg-surface-2">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-text-primary font-semibold min-w-[170px] text-center">{weekLabel}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 hover:text-cw text-text-muted rounded-md hover:bg-surface-2">
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-5">
        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Column headers */}
            <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-1.5 mb-1.5">
              <div /> {/* spacer */}
              {weekDates.map((date, i) => {
                const dateStr = date.toISOString().split('T')[0];
                const isToday = dateStr === today;
                return (
                  <div key={i} className={cn(
                    'text-center py-2 rounded-lg',
                    isToday ? 'bg-cw/10' : ''
                  )}>
                    <div className={cn('text-[11px] font-bold uppercase tracking-wider', isToday ? 'text-cw' : 'text-text-muted')}>
                      {getDayName(i)}
                    </div>
                    <div className={cn('text-lg font-extrabold', isToday ? 'text-cw' : 'text-text-secondary')}>
                      {date.getUTCDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shift rows */}
            {SHIFTS.map((shift) => {
              const tl = getTLForShift(shift);
              const stat = shiftStats.find(s => s.shift === shift);

              return (
                <div key={shift} className="grid grid-cols-[100px_repeat(7,1fr)] gap-1.5 mb-1.5">
                  {/* Row label */}
                  <div className="flex flex-col justify-center px-2 py-3">
                    <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                      {SHIFT_LABELS[shift]?.split('·')[0]?.trim()}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {shift}
                    </div>
                    {tl && (
                      <div className={cn('text-[10px] font-bold mt-1', tl.colorClass.split(' ')[0])}>
                        {tl.tl}
                      </div>
                    )}
                    <div className="text-[9px] text-text-muted mt-0.5">
                      avg {stat?.avg}/day
                    </div>
                  </div>

                  {/* Day cells */}
                  {weekDates.map((date, dayIdx) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const isToday = dateStr === today;
                    const cellSchedules = getSchedulesForCell(dayIdx, shift);

                    return (
                      <ScheduleCell
                        key={`${dayIdx}-${shift}`}
                        schedules={cellSchedules}
                        dayIdx={dayIdx}
                        shift={shift}
                        isToday={isToday}
                        onAdd={() => setPickerTarget({ dayIdx, shift })}
                        onRemove={removeFromCell}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="xl:w-64 shrink-0 space-y-4">
          {/* Shift Balance */}
          <div className="bg-surface-1 border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Shift Balance</h3>
            <div className="space-y-3">
              {shiftStats.map(({ shift, count, avg }) => {
                const tl = getTLForShift(shift);
                const pct = Math.min((count / Math.max(totalSlots, 1)) * 300, 100);
                return (
                  <div key={shift}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-text-secondary">
                        {tl?.tl || shift}
                      </span>
                      <span className="text-xs font-bold text-text-primary">{count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: tl?.color || '#1a90c8',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unassigned */}
          {unassignedChatters.length > 0 && (
            <div className="bg-surface-1 border border-warning/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-warning" />
                <h3 className="text-xs font-bold text-warning uppercase tracking-wider">
                  Unassigned ({unassignedChatters.length})
                </h3>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {unassignedChatters.map(c => {
                  const dotColor = c.team_name?.includes('Huckle') ? 'bg-orange-400'
                    : c.team_name?.includes('Danilyn') ? 'bg-blue-400'
                    : c.team_name?.includes('Ezekiel') ? 'bg-purple-400'
                    : 'bg-zinc-500';

                  return (
                    <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', dotColor)} />
                      <span className="text-text-primary font-medium flex-1 truncate">{c.full_name}</span>
                      <span className="text-[9px] text-text-muted">{c.team_name?.replace('Team ', '')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Team Legend */}
          <div className="bg-surface-1 border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Teams</h3>
            {['Team Huckle', 'Team Danilyn', 'Team Ezekiel'].map(team => {
              const tl = getTLForShift(
                team.includes('Huckle') ? '00:00-08:00'
                  : team.includes('Danilyn') ? '08:00-16:00'
                  : '16:00-00:00'
              );
              const dotColor = team.includes('Huckle') ? 'bg-orange-400'
                : team.includes('Danilyn') ? 'bg-blue-400'
                : 'bg-purple-400';
              const count = chatters.filter(c => c.team_name === team).length;

              return (
                <div key={team} className="flex items-center gap-2 py-1">
                  <div className={cn('w-2.5 h-2.5 rounded-full', dotColor)} />
                  <span className="text-xs text-text-secondary flex-1">{team}</span>
                  <span className="text-[10px] text-text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chatter Picker Modal */}
      {pickerTarget && (
        <ChatterPicker
          chatters={chatters}
          existingIds={new Set(
            getSchedulesForCell(pickerTarget.dayIdx, pickerTarget.shift).map(s => s.chatter_id)
          )}
          onSelect={(id) => addToCell(pickerTarget.dayIdx, pickerTarget.shift, id)}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

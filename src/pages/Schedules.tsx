import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { SHIFTS, SHIFT_LABELS, getDayName, TEAM_COLORS } from '../lib/utils';
import { ChevronLeft, ChevronRight, Save, X, Copy, UserPlus } from 'lucide-react';
import type { Chatter, Schedule } from '../types';

export default function Schedules() {
  const { profile } = useAuthStore();
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Quick assign state
  const [qaChatter, setQaChatter] = useState('');
  const [qaShift, setQaShift] = useState<string>(SHIFTS[1]);
  const [qaDays, setQaDays] = useState<boolean[]>([true, true, true, true, true, false, false]);

  // Dropdown state for inline add
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLTableCellElement>(null);

  const getWeekStart = (offset: number) => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
    d.setDate(diff);
    return d.toISOString().split('T')[0]!;
  };

  const weekStart = getWeekStart(weekOffset);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekLabel = (() => {
    const s = weekDates[0]!;
    const e = weekDates[6]!;
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  })();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [chattersRes, schedulesRes] = await Promise.all([
      supabase.from('chatters').select('*').eq('status', 'Active').order('full_name'),
      supabase.from('schedules').select('*, chatter:chatters(*)').eq('week_start', weekStart),
    ]);
    setChatters((chattersRes.data ?? []) as Chatter[]);
    setSchedules((schedulesRes.data ?? []) as Schedule[]);
    setLoading(false);
    setDirty(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
        setDropdownSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const getSchedulesForCell = (dayIdx: number, shift: string) =>
    schedules.filter((s) => s.day_of_week === dayIdx && s.shift === shift);

  const addToCell = (dayIdx: number, shift: string, chatterId: string) => {
    const exists = schedules.some(
      (s) => s.chatter_id === chatterId && s.day_of_week === dayIdx && s.shift === shift && s.week_start === weekStart
    );
    if (exists) return;

    const newSchedule: Schedule = {
      id: crypto.randomUUID(),
      chatter_id: chatterId,
      week_start: weekStart,
      day_of_week: dayIdx,
      shift: shift as any,
      created_by: profile?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      chatter: chatters.find((c) => c.id === chatterId),
    };
    setSchedules((prev) => [...prev, newSchedule]);
    setDirty(true);
    setActiveDropdown(null);
    setDropdownSearch('');
  };

  const removeFromCell = (scheduleId: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    setDirty(true);
  };

  const handleQuickAssign = () => {
    if (!qaChatter) return;
    qaDays.forEach((selected, dayIdx) => {
      if (selected) addToCell(dayIdx, qaShift, qaChatter);
    });
  };

  const handleCopyPreviousWeek = async () => {
    const prevWeekStart = getWeekStart(weekOffset - 1);
    const { data } = await supabase
      .from('schedules')
      .select('*, chatter:chatters(*)')
      .eq('week_start', prevWeekStart);

    if (!data || data.length === 0) {
      setSaveMsg('No schedules in previous week');
      setTimeout(() => setSaveMsg(''), 2000);
      return;
    }

    const copied = (data as Schedule[]).map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      week_start: weekStart,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    setSchedules((prev) => {
      // Merge: don't duplicate existing entries
      const existing = new Set(prev.map((s) => `${s.chatter_id}-${s.day_of_week}-${s.shift}`));
      const newEntries = copied.filter((s) => !existing.has(`${s.chatter_id}-${s.day_of_week}-${s.shift}`));
      return [...prev, ...newEntries];
    });
    setDirty(true);
    setSaveMsg(`Copied ${data.length} entries`);
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('schedules').delete().eq('week_start', weekStart);

      const rows = schedules.map((s) => ({
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

  const getChatterColor = (chatter?: Chatter) => {
    if (!chatter?.team_name) return 'bg-surface-3 text-white border-border';
    return TEAM_COLORS[chatter.team_name] ?? 'bg-cw/15 text-cw border-cw/30';
  };

  // Stats
  const totalAssigned = schedules.length;
  const uniqueChatters = new Set(schedules.map((s) => s.chatter_id)).size;

  return (
    <div className="p-4 lg:p-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Weekly Schedule</h1>
          <p className="text-sm text-text-secondary mt-1">
            {uniqueChatters} chatters &middot; {totalAssigned} shift slots
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saveMsg && (
            <span className={`text-sm ${saveMsg.startsWith('Error') ? 'text-danger' : 'text-success'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleCopyPreviousWeek}
            className="flex items-center gap-2 px-3 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-2 hover:text-white text-sm"
            title="Copy from previous week"
          >
            <Copy size={14} />
            <span className="hidden sm:inline">Copy Prev Week</span>
          </button>
          <div className="flex items-center gap-2 bg-surface-1 border border-border rounded-lg px-3 py-1.5">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="p-0.5 hover:text-cw text-text-secondary">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-white min-w-[180px] text-center">{weekLabel}</span>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="p-0.5 hover:text-cw text-text-secondary">
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Schedule Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden min-w-[800px]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-36 px-3 py-3 text-left text-xs text-text-secondary font-medium">Shift</th>
                  {weekDates.map((date, i) => {
                    const isToday = new Date().toDateString() === date.toDateString();
                    return (
                      <th key={i} className={`px-2 py-3 text-center text-xs font-medium ${isToday ? 'text-cw' : 'text-text-secondary'}`}>
                        <div className={isToday ? 'font-bold' : ''}>{getDayName(i)}</div>
                        <div className={`text-[11px] ${isToday ? 'text-cw' : 'text-text-muted'}`}>
                          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map((shift) => (
                  <tr key={shift} className="border-b border-border/50">
                    <td className="px-3 py-4 text-xs text-text-secondary font-medium whitespace-nowrap align-top">
                      {SHIFT_LABELS[shift]}
                    </td>
                    {weekDates.map((_, dayIdx) => {
                      const cellSchedules = getSchedulesForCell(dayIdx, shift);
                      const cellKey = `${dayIdx}-${shift}`;
                      const isDropdownActive = activeDropdown === cellKey;

                      return (
                        <td key={dayIdx} className="px-1.5 py-2 align-top" ref={isDropdownActive ? dropdownRef : undefined}>
                          <div className="min-h-[60px] space-y-1 relative">
                            {cellSchedules.map((s) => (
                              <div
                                key={s.id}
                                className={`group flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border ${getChatterColor(s.chatter)}`}
                              >
                                <span className="truncate flex-1">{s.chatter?.full_name ?? '?'}</span>
                                <button
                                  onClick={() => removeFromCell(s.id)}
                                  className="opacity-0 group-hover:opacity-100 shrink-0 hover:text-danger"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                            {/* Add button */}
                            <button
                              onClick={() => {
                                setActiveDropdown(isDropdownActive ? null : cellKey);
                                setDropdownSearch('');
                              }}
                              className="w-full flex items-center justify-center py-1 rounded-md text-text-muted hover:text-cw hover:bg-cw/5 transition-colors"
                            >
                              <UserPlus size={13} />
                            </button>
                            {/* Dropdown */}
                            {isDropdownActive && (
                              <div className="absolute top-full left-0 z-30 mt-1 w-48 bg-surface-2 border border-border rounded-lg shadow-2xl overflow-hidden">
                                <input
                                  type="text"
                                  value={dropdownSearch}
                                  onChange={(e) => setDropdownSearch(e.target.value)}
                                  placeholder="Search..."
                                  className="w-full px-3 py-2 bg-surface-2 border-b border-border text-xs text-white placeholder-text-muted focus:outline-none"
                                  autoFocus
                                />
                                <div className="max-h-40 overflow-y-auto">
                                  {chatters
                                    .filter((c) =>
                                      !cellSchedules.some((s) => s.chatter_id === c.id) &&
                                      (!dropdownSearch || c.full_name.toLowerCase().includes(dropdownSearch.toLowerCase()))
                                    )
                                    .map((c) => (
                                      <button
                                        key={c.id}
                                        onClick={() => addToCell(dayIdx, shift, c.id)}
                                        className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-3 hover:text-white truncate flex items-center gap-2"
                                      >
                                        <span className="truncate flex-1">{c.full_name}</span>
                                        {c.team_name && (
                                          <span className="text-[9px] text-text-muted shrink-0">{c.team_name.replace('Team ', '')}</span>
                                        )}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Assign Panel */}
        <div className="xl:w-64 shrink-0">
          <div className="bg-surface-1 border border-border rounded-xl p-4 xl:sticky xl:top-6">
            <h3 className="text-sm font-semibold text-white mb-4">Quick Assign</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Chatter</label>
                <select
                  value={qaChatter}
                  onChange={(e) => setQaChatter(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none"
                >
                  <option value="">Choose...</option>
                  {chatters.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-text-secondary mb-1 block">Shift</label>
                <select
                  value={qaShift}
                  onChange={(e) => setQaShift(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none"
                >
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>{SHIFT_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-text-secondary mb-1 block">Days</label>
                <div className="flex gap-1.5">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const next = [...qaDays];
                        next[i] = !next[i];
                        setQaDays(next);
                      }}
                      className={`flex-1 aspect-square rounded-lg text-xs font-medium transition-colors ${
                        qaDays[i]
                          ? 'bg-cw text-white'
                          : 'bg-surface-2 text-text-muted border border-border hover:border-cw/30'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleQuickAssign}
                disabled={!qaChatter}
                className="w-full bg-cw hover:bg-cw-dark text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Assign to Selected Days
              </button>
            </div>

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-border space-y-2">
              <p className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Teams</p>
              {Object.entries(TEAM_COLORS).map(([team, color]) => (
                <div key={team} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm border ${color}`} />
                  <span className="text-xs text-text-secondary">{team}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { getDayName, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import {
  ChevronLeft, ChevronRight, Save, Copy, Users, AlertTriangle, X, GripVertical, ChevronDown,
} from 'lucide-react';
import type { Chatter, Schedule, ShiftSlot, AssignmentGroup, AssignmentGroupChatter, AssignmentGroupModel, Model } from '../types';

/* ── TL config ────────────────────────────────────────────────── */

const TL_CONFIG = [
  { key: 'huckle',  label: 'Huckle',  shift: '00:00-08:00' as ShiftSlot, hours: '12AM – 8AM',  dot: 'bg-orange-400', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/25', activeBg: 'bg-orange-500/15', ring: 'ring-orange-400/20', cell: 'bg-orange-500/8',  chipBg: 'bg-orange-500/12', chipBorder: 'border-orange-500/20' },
  { key: 'danilyn', label: 'Danilyn', shift: '08:00-16:00' as ShiftSlot, hours: '8AM – 4PM',   dot: 'bg-blue-400',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/25',   activeBg: 'bg-blue-500/15',   ring: 'ring-blue-400/20',   cell: 'bg-blue-500/8',    chipBg: 'bg-blue-500/12',   chipBorder: 'border-blue-500/20' },
  { key: 'ezekiel', label: 'Ezekiel', shift: '16:00-00:00' as ShiftSlot, hours: '4PM – 12AM',  dot: 'bg-purple-400', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/25', activeBg: 'bg-purple-500/15', ring: 'ring-purple-400/20', cell: 'bg-purple-500/8',  chipBg: 'bg-purple-500/12', chipBorder: 'border-purple-500/20' },
] as const;

/* ── main component ──────────────────────────────────────────── */

export default function Schedules() {
  const { profile } = useAuthStore();
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [groupChatters, setGroupChatters] = useState<AssignmentGroupChatter[]>([]);
  const [groupModels, setGroupModels] = useState<AssignmentGroupModel[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [activeTL, setActiveTL] = useState(TL_CONFIG[0]!.key);
  const [modelPopover, setModelPopover] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const weekPickerRef = useRef<HTMLDivElement>(null);

  // Coverage map: `${groupId}-${dayIdx}` → chatterId (overrides defaults)
  const [coverageMap, setCoverageMap] = useState<Map<string, string>>(new Map());
  // Canonical shift reference: chatter→shift from the latest available week
  const [shiftRef, setShiftRef] = useState<Map<string, ShiftSlot>>(new Map());

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

  const today = new Date().toISOString().split('T')[0];

  /* ── fetch ──────────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [chattersRes, modelsRes, schedulesRes, groupsRes, gcRes, gmRes, shiftRefRes] = await Promise.all([
      supabase.from('chatters').select('*').eq('status', 'Active').order('full_name'),
      supabase.from('models').select('*').eq('status', 'Live').order('name'),
      supabase.from('schedules').select('*, chatter:chatters!schedules_chatter_id_fkey(*)').eq('week_start', weekStart),
      supabase.from('assignment_groups').select('*').eq('active', true).order('sort_order'),
      supabase.from('assignment_group_chatters').select('*'),
      supabase.from('assignment_group_models').select('*'),
      // Fetch shifts from ALL weeks to build canonical chatter→shift mapping
      supabase.from('schedules').select('chatter_id, shift').order('week_start', { ascending: false }).limit(500),
    ]);
    setChatters((chattersRes.data ?? []) as Chatter[]);
    setModels((modelsRes.data ?? []) as Model[]);
    setSchedules((schedulesRes.data ?? []) as Schedule[]);
    setGroups((groupsRes.data ?? []) as AssignmentGroup[]);
    setGroupChatters((gcRes.data ?? []) as AssignmentGroupChatter[]);
    setGroupModels((gmRes.data ?? []) as AssignmentGroupModel[]);

    // Build canonical shift reference (most recent entry wins)
    const refMap = new Map<string, ShiftSlot>();
    for (const r of (shiftRefRes.data ?? []) as { chatter_id: string; shift: ShiftSlot }[]) {
      if (!refMap.has(r.chatter_id)) refMap.set(r.chatter_id, r.shift);
    }
    setShiftRef(refMap);

    setCoverageMap(new Map());
    setLoading(false);
    setDirty(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setModelPopover(null);
      }
    }
    if (modelPopover) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [modelPopover]);

  // Close week picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (weekPickerRef.current && !weekPickerRef.current.contains(e.target as Node)) {
        setWeekPickerOpen(false);
      }
    }
    if (weekPickerOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [weekPickerOpen]);

  // Generate week options: 4 past + current + 8 future
  const weekOptions = useMemo(() => {
    const options: { offset: number; label: string; isCurrent: boolean }[] = [];
    for (let o = -4; o <= 8; o++) {
      const ws = getWeekStart(o);
      const d = new Date(ws + 'T00:00:00Z');
      const end = new Date(d);
      end.setUTCDate(end.getUTCDate() + 6);
      const label = `${formatDate(d, 'short')} – ${formatDate(end, 'short')}`;
      options.push({ offset: o, label, isCurrent: o === 0 });
    }
    return options;
  }, []);

  /* ── derived ────────────────────────────────────────────────── */

  const chatterShiftMap = useMemo(() => {
    const map = new Map<string, ShiftSlot>();
    // 1. Current week schedules (highest priority)
    for (const s of schedules) {
      if (!map.has(s.chatter_id)) map.set(s.chatter_id, s.shift);
    }
    // 2. Canonical reference from any week
    for (const [id, shift] of shiftRef) {
      if (!map.has(id)) map.set(id, shift);
    }
    return map;
  }, [schedules, shiftRef]);

  const chatterMap = useMemo(() => {
    const m = new Map<string, Chatter>();
    for (const c of chatters) m.set(c.id, c);
    return m;
  }, [chatters]);

  const modelMap = useMemo(() => {
    const m = new Map<string, Model>();
    for (const md of models) m.set(md.id, md);
    return m;
  }, [models]);

  const currentTL = TL_CONFIG.find(t => t.key === activeTL)!;

  const groupDefaultForTL = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const g of groups) {
      const gcForGroup = groupChatters.filter(gc => gc.group_id === g.id);
      const match = gcForGroup.find(gc => chatterShiftMap.get(gc.chatter_id) === currentTL.shift);
      map.set(g.id, match?.chatter_id ?? null);
    }
    return map;
  }, [groups, groupChatters, chatterShiftMap, currentTL]);

  const tlChatters = useMemo(() => {
    const ids = new Set<string>();
    // From current week schedules
    for (const s of schedules) {
      if (s.shift === currentTL.shift) ids.add(s.chatter_id);
    }
    // From canonical shift reference (covers future weeks with no schedules)
    for (const [id, shift] of chatterShiftMap) {
      if (shift === currentTL.shift) ids.add(id);
    }
    return [...ids].map(id => chatterMap.get(id)).filter(Boolean) as Chatter[];
  }, [schedules, currentTL, chatterMap, chatterShiftMap]);

  const isChatterScheduled = useCallback((chatterId: string, dayIdx: number) => {
    return schedules.some(s => s.chatter_id === chatterId && s.day_of_week === dayIdx && s.shift === currentTL.shift);
  }, [schedules, currentTL]);

  const modelsForGroup = useCallback((groupId: string) => {
    return groupModels
      .filter(gm => gm.group_id === groupId)
      .map(gm => modelMap.get(gm.model_id))
      .filter(Boolean) as Model[];
  }, [groupModels, modelMap]);

  // Reverse map: chatterId → their default groupId (for this TL)
  const chatterDefaultGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const [groupId, chatterId] of groupDefaultForTL) {
      if (chatterId) map.set(chatterId, groupId);
    }
    return map;
  }, [groupDefaultForTL]);

  // Does this week have any schedule entries for the current TL?
  const weekHasScheduleData = useMemo(
    () => schedules.some(s => s.shift === currentTL.shift),
    [schedules, currentTL],
  );

  // Get who covers a cell: manual override > default > day off
  type CellState = 'default' | 'cover' | 'dayoff';
  const getCoverChatter = useCallback((groupId: string, dayIdx: number): { chatter: Chatter | null; state: CellState } => {
    const key = `${groupId}-${dayIdx}`;

    // 1. Manual override (drag & drop)
    const overrideId = coverageMap.get(key);
    if (overrideId === '__clear__') {
      return { chatter: null, state: 'dayoff' };
    }
    if (overrideId) {
      const c = chatterMap.get(overrideId);
      const isTheirDefault = chatterDefaultGroup.get(overrideId) === groupId;
      return { chatter: c ?? null, state: isTheirDefault ? 'default' : 'cover' };
    }

    // 2. Check default chatter for this group+TL
    const defaultId = groupDefaultForTL.get(groupId);
    if (!defaultId) return { chatter: null, state: 'dayoff' };

    const c = chatterMap.get(defaultId);
    if (!c) return { chatter: null, state: 'dayoff' };

    // 3. If week has schedule data → only show on scheduled days
    if (weekHasScheduleData) {
      if (isChatterScheduled(defaultId, dayIdx)) {
        return { chatter: c, state: 'default' };
      }
      return { chatter: null, state: 'dayoff' };
    }

    // 4. No schedule data for this week → auto-populate all 7 days
    return { chatter: c, state: 'default' };
  }, [coverageMap, groupDefaultForTL, isChatterScheduled, chatterMap, chatterDefaultGroup, weekHasScheduleData]);

  /* ── drag & drop ────────────────────────────────────────────── */

  const [dragging, setDragging] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, chatterId: string, sourceKey: string) => {
    e.dataTransfer.setData('chatterId', chatterId);
    e.dataTransfer.setData('sourceKey', sourceKey);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(sourceKey);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // If dropped outside any valid target (dropEffect is 'none'), remove from source
    if (e.dataTransfer.dropEffect === 'none' && dragging && dragging !== 'panel') {
      setCoverageMap(prev => {
        const next = new Map(prev);
        // Set a special "cleared" marker to force the cell back to default/dayoff
        next.set(dragging, '__clear__');
        return next;
      });
      setDirty(true);
    }
    setDragging(null);
    setDragOver(null);
  }, [dragging]);

  const handleDragOver = useCallback((e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(targetKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetGroupId: string, targetDay: number) => {
    e.preventDefault();
    setDragOver(null);
    const chatterId = e.dataTransfer.getData('chatterId');
    const sourceKey = e.dataTransfer.getData('sourceKey');
    if (!chatterId) return;

    const targetKey = `${targetGroupId}-${targetDay}`;
    if (sourceKey === targetKey) return;

    // Get current occupant of target cell
    const targetCover = getCoverChatter(targetGroupId, targetDay);
    const targetChatterId = targetCover.chatter?.id;

    setCoverageMap(prev => {
      const next = new Map(prev);
      // Place dragged chatter in target
      next.set(targetKey, chatterId);
      // If source had this chatter, swap: put target's chatter in source (or clear)
      if (sourceKey && targetChatterId) {
        next.set(sourceKey, targetChatterId);
      } else if (sourceKey) {
        // Source becomes empty/default
        next.delete(sourceKey);
      }
      return next;
    });
    setDirty(true);
  }, [getCoverChatter]);

  // Drop from bottom panel (no source cell)
  const handleDropFromPanel = useCallback((e: React.DragEvent, targetGroupId: string, targetDay: number) => {
    e.preventDefault();
    setDragOver(null);
    const chatterId = e.dataTransfer.getData('chatterId');
    if (!chatterId) return;

    const targetKey = `${targetGroupId}-${targetDay}`;
    setCoverageMap(prev => {
      const next = new Map(prev);
      next.set(targetKey, chatterId);
      return next;
    });
    setDirty(true);
  }, []);

  /* ── save ────────────────────────────────────────────────────── */

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
      // Save schedules
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

      // Save overrides
      if (coverageMap.size > 0) {
        const overrideRows: { group_id: string; chatter_id: string; date: string; created_by: string | undefined }[] = [];
        for (const [key, chatterId] of coverageMap) {
          const [groupId, dayIdxStr] = key.split('-');
          if (!groupId || !dayIdxStr) continue;
          const dayIdx = parseInt(dayIdxStr, 10);
          const date = weekDates[dayIdx];
          if (!date) continue;
          overrideRows.push({
            group_id: groupId,
            chatter_id: chatterId,
            date: date.toISOString().split('T')[0]!,
            created_by: profile?.id,
          });
        }
        if (overrideRows.length > 0) {
          for (const row of overrideRows) {
            await supabase.from('assignment_group_overrides')
              .upsert(row, { onConflict: 'chatter_id,date' });
          }
        }
      }

      setSaveMsg('Saved!');
      setDirty(false);
      setTimeout(() => setSaveMsg(''), 2000);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setSaveMsg(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  /* ── render ─────────────────────────────────────────────────── */

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

  const tlScheduleCount = schedules.filter(s => s.shift === currentTL.shift).length;

  return (
    <div className="p-4 lg:p-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Weekly Schedule</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {tlChatters.length} chatters · {tlScheduleCount} shifts · {groups.length} teams
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
          <div className="relative">
            <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-lg px-2 py-1.5">
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 hover:text-cw text-text-muted rounded-md hover:bg-surface-2">
                <ChevronLeft size={16} />
              </button>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setWeekPickerOpen(p => !p)}
                className={cn(
                  'text-sm font-semibold min-w-[170px] text-center px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5',
                  weekPickerOpen
                    ? 'bg-cw/10 text-cw'
                    : 'text-text-primary hover:bg-surface-2 hover:text-cw',
                )}
              >
                {weekLabel}
                <ChevronDown size={11} className={cn(
                  'transition-transform duration-200',
                  weekPickerOpen && 'rotate-180',
                )} />
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 hover:text-cw text-text-muted rounded-md hover:bg-surface-2">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Week picker dropdown */}
            {weekPickerOpen && (
              <div
                ref={weekPickerRef}
                className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 z-50 w-64 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-border">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Select Week</span>
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {weekOptions.map(opt => {
                    const isSelected = opt.offset === weekOffset;
                    return (
                      <button
                        key={opt.offset}
                        onClick={() => { setWeekOffset(opt.offset); setWeekPickerOpen(false); }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between',
                          isSelected
                            ? 'bg-cw/15 text-cw font-bold'
                            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                        )}
                      >
                        <span>{opt.label}</span>
                        <div className="flex items-center gap-1.5">
                          {opt.isCurrent && (
                            <span className={cn(
                              'text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase',
                              isSelected ? 'bg-cw/20 text-cw' : 'bg-surface-2 text-text-muted',
                            )}>
                              Now
                            </span>
                          )}
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-cw" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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

      {/* TL Tabs */}
      <div className="flex gap-2 mb-5">
        {TL_CONFIG.map(tl => {
          const isActive = activeTL === tl.key;
          const count = schedules.filter(s => s.shift === tl.shift).length;
          return (
            <button
              key={tl.key}
              onClick={() => { setActiveTL(tl.key); setCoverageMap(new Map()); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border',
                isActive
                  ? `${tl.activeBg} ${tl.text} ${tl.border} ring-1 ${tl.ring}`
                  : 'bg-surface-1 text-text-muted border-border hover:text-text-secondary hover:bg-surface-2',
              )}
            >
              <div className={cn('w-2.5 h-2.5 rounded-full', tl.dot)} />
              <span>{tl.label}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md', isActive ? `${tl.bg}` : 'bg-surface-2')}>
                {tl.hours}
              </span>
              <span className={cn('text-[10px] ml-auto', isActive ? tl.text : 'text-text-muted')}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Schedule Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-[160px] text-left px-3 py-3">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Team</span>
                </th>
                {weekDates.map((date, i) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const isToday = dateStr === today;
                  return (
                    <th key={i} className={cn('text-center px-2 py-2', isToday && 'bg-cw/5 rounded-t-xl')}>
                      <div className={cn('text-[10px] font-bold uppercase tracking-wider', isToday ? 'text-cw' : 'text-text-muted')}>
                        {getDayName(i).slice(0, 3)}
                      </div>
                      <div className={cn('text-base font-extrabold', isToday ? 'text-cw' : 'text-text-secondary')}>
                        {date.getUTCDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((group, gIdx) => {
                const groupModelsList = modelsForGroup(group.id);
                const isPopoverOpen = modelPopover === group.id;

                return (
                  <tr key={group.id} className={cn(gIdx % 2 === 0 ? 'bg-surface-1/50' : '')}>
                    {/* Team label with model popover */}
                    <td className="px-3 py-2.5 border-b border-border/50 relative">
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setModelPopover(isPopoverOpen ? null : group.id)}
                        className={cn(
                          'w-full flex items-center gap-2.5 group/team rounded-lg px-1.5 py-1 -mx-1.5 transition-all cursor-pointer',
                          isPopoverOpen
                            ? `${currentTL.activeBg} ring-1 ${currentTL.ring}`
                            : 'hover:bg-surface-2',
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold shrink-0 transition-all',
                          isPopoverOpen
                            ? `${currentTL.activeBg} ${currentTL.text} ring-2 ${currentTL.ring}`
                            : `${currentTL.bg} ${currentTL.text} group-hover/team:ring-1 ${currentTL.ring}`,
                        )}>
                          {group.sort_order}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-xs font-bold text-text-primary">{group.name}</div>
                          <div className={cn(
                            'text-[10px] flex items-center gap-1 transition-colors',
                            isPopoverOpen ? currentTL.text : 'text-text-muted group-hover/team:text-text-secondary',
                          )}>
                            <Users size={9} />
                            <span className={cn(isPopoverOpen ? '' : 'group-hover/team:underline')}>
                              {groupModelsList.length} models
                            </span>
                          </div>
                        </div>
                        <ChevronDown size={12} className={cn(
                          'shrink-0 transition-all duration-200',
                          isPopoverOpen
                            ? `${currentTL.text} rotate-180`
                            : 'text-text-muted/40 group-hover/team:text-text-muted',
                        )} />
                      </button>

                      {/* Models popover */}
                      {isPopoverOpen && (
                        <div
                          ref={popoverRef}
                          className="absolute left-2 top-full mt-1 z-50 w-56 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
                        >
                          <div className={cn('px-3 py-2 flex items-center justify-between', currentTL.bg)}>
                            <span className={cn('text-[11px] font-bold uppercase tracking-wider', currentTL.text)}>
                              {group.name} — Models
                            </span>
                            <button onClick={() => setModelPopover(null)} className="text-text-muted hover:text-text-primary">
                              <X size={12} />
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto p-1.5">
                            {groupModelsList.length === 0 ? (
                              <p className="text-xs text-text-muted text-center py-3">No models assigned</p>
                            ) : (
                              groupModelsList.map(m => (
                                <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors">
                                  {m.profile_picture_url ? (
                                    <img src={m.profile_picture_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center text-[8px] font-bold text-text-muted">
                                      {m.name[0]}
                                    </div>
                                  )}
                                  <span className="text-xs text-text-primary font-medium truncate">{m.name}</span>
                                  {m.page_type && (
                                    <span className="text-[9px] text-text-muted ml-auto shrink-0">{m.page_type}</span>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Day cells */}
                    {weekDates.map((date, dayIdx) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const isToday = dateStr === today;
                      const isPast = dateStr! < today!;
                      const cellKey = `${group.id}-${dayIdx}`;
                      const isDragTarget = dragOver === cellKey;

                      const { chatter: coverChatter, state: cellState } = getCoverChatter(group.id, dayIdx);
                      const firstName = coverChatter?.full_name.split(' ')[0] ?? '';

                      return (
                        <td
                          key={dayIdx}
                          className={cn(
                            'text-center px-1 py-1.5 border-b border-border/50 transition-all',
                            isToday && 'bg-cw/5',
                            isDragTarget && 'bg-cw/10 ring-1 ring-inset ring-cw/30',
                          )}
                          onDragOver={(e) => handleDragOver(e, cellKey)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, group.id, dayIdx)}
                        >
                          {coverChatter ? (
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, coverChatter.id, cellKey)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                'mx-auto px-2 py-1.5 rounded-lg text-xs font-semibold transition-all max-w-[110px] truncate cursor-grab active:cursor-grabbing flex items-center gap-1 justify-center border',
                                cellState === 'default'
                                  ? isToday
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 ring-1 ring-emerald-400/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : isToday
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/25 ring-1 ring-amber-400/20'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20',
                              )}
                            >
                              <GripVertical size={8} className="shrink-0 opacity-30" />
                              {firstName}
                            </div>
                          ) : cellState === 'dayoff' ? (
                            <div
                              className="mx-auto px-2 py-1.5 rounded-lg text-[11px] font-medium max-w-[110px] bg-amber-500/10 text-amber-400 border border-dashed border-amber-500/25"
                            >
                              Day off
                            </div>
                          ) : (
                            <div className="mx-auto px-2 py-1.5 rounded-lg text-[11px] text-text-muted/30 max-w-[110px]">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chatters panel — draggable */}
      <div className="mt-6">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
          {currentTL.label}'s Chatters — drag to assign
        </h3>
        <div className="flex flex-wrap gap-2">
          {tlChatters.map(c => {
            const gc = groupChatters.find(gc2 => gc2.chatter_id === c.id);
            const group = gc ? groups.find(g => g.id === gc.group_id) : null;
            const daysWorking = schedules.filter(s => s.chatter_id === c.id && s.shift === currentTL.shift).length;
            const isDefault = !!gc;

            return (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => handleDragStart(e, c.id, 'panel')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-grab active:cursor-grabbing select-none transition-all hover:ring-1',
                  isDefault
                    ? `${currentTL.bg} ${currentTL.border} ${currentTL.ring}`
                    : `bg-surface-1 border-border hover:ring-zinc-500/20`,
                )}
              >
                <GripVertical size={10} className="text-text-muted/40 shrink-0" />
                <div className={cn('w-2 h-2 rounded-full', currentTL.dot)} />
                <span className="font-semibold text-text-primary">{c.full_name.split(' ')[0]}</span>
                {group && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded', currentTL.bg, currentTL.text)}>
                    T{group.sort_order}
                  </span>
                )}
                {!isDefault && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                    Sub
                  </span>
                )}
                <span className="text-text-muted">{daysWorking}d</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

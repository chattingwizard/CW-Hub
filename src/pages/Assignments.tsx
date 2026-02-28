import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { TEAM_COLORS } from '../lib/utils';
import {
  Plus, X, Search, Users, ChevronLeft, ChevronRight,
  Monitor, Calendar, Trash2, GripVertical, AlertTriangle,
  Layers, CalendarDays, UserPlus, Check,
} from 'lucide-react';
import ModelAvatar from '../components/ModelAvatar';
import TrafficBadge, { PageTypeBadge } from '../components/TrafficBadge';
import { useTrafficData } from '../hooks/useTrafficData';
import type {
  Model, Chatter, Schedule,
  AssignmentGroup, AssignmentGroupModel,
  AssignmentGroupChatter, AssignmentGroupOverride,
} from '../types';

type Tab = 'groups' | 'weekly';

export default function Assignments() {
  const { profile } = useAuthStore();
  const [tab, setTab] = useState<Tab>('groups');
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [groupModels, setGroupModels] = useState<AssignmentGroupModel[]>([]);
  const [groupChatters, setGroupChatters] = useState<AssignmentGroupChatter[]>([]);
  const [overrides, setOverrides] = useState<AssignmentGroupOverride[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { getModelTraffic } = useTrafficData();

  // ── Week navigation ──
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff + weekOffset * 7);
    return d.toISOString().split('T')[0]!;
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    const d = new Date(weekStart + 'T00:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(d);
      date.setDate(d.getDate() + i);
      return date.toISOString().split('T')[0]!;
    });
  }, [weekStart]);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [modelsRes, chattersRes, groupsRes, gmRes, gcRes, overRes, schedRes] = await Promise.all([
      supabase.from('models').select('*').order('name'),
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter').order('full_name'),
      supabase.from('assignment_groups').select('*').eq('active', true).order('sort_order'),
      supabase.from('assignment_group_models').select('*'),
      supabase.from('assignment_group_chatters').select('*'),
      supabase.from('assignment_group_overrides').select('*').gte('date', weekStart).lte('date', weekDates[6]!),
      supabase.from('schedules').select('*').eq('week_start', weekStart),
    ]);
    setModels((modelsRes.data ?? []) as Model[]);
    setChatters((chattersRes.data ?? []) as Chatter[]);
    setGroups((groupsRes.data ?? []) as AssignmentGroup[]);
    setGroupModels((gmRes.data ?? []) as AssignmentGroupModel[]);
    setGroupChatters((gcRes.data ?? []) as AssignmentGroupChatter[]);
    setOverrides((overRes.data ?? []) as AssignmentGroupOverride[]);
    setSchedules((schedRes.data ?? []) as Schedule[]);
    setLoading(false);
  }, [weekStart, weekDates]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ──
  const liveModels = useMemo(() => models.filter((m) => m.status === 'Live'), [models]);

  const assignedModelIds = useMemo(
    () => new Set(groupModels.map((gm) => gm.model_id)),
    [groupModels],
  );

  const unassignedModels = useMemo(
    () => liveModels.filter((m) => !assignedModelIds.has(m.id)),
    [liveModels, assignedModelIds],
  );

  const assignedChatterIds = useMemo(
    () => new Set(groupChatters.map((gc) => gc.chatter_id)),
    [groupChatters],
  );

  const unassignedChatters = useMemo(
    () => chatters.filter((c) => !assignedChatterIds.has(c.id)),
    [chatters, assignedChatterIds],
  );

  const getModelsForGroup = useCallback(
    (groupId: string) => {
      const ids = groupModels.filter((gm) => gm.group_id === groupId).map((gm) => gm.model_id);
      return models
        .filter((m) => ids.includes(m.id))
        .sort((a, b) => {
          const ta = getModelTraffic(a.id);
          const tb = getModelTraffic(b.id);
          return (tb?.workload_pct ?? 0) - (ta?.workload_pct ?? 0);
        });
    },
    [groupModels, models, getModelTraffic],
  );

  const getChattersForGroup = useCallback(
    (groupId: string) => {
      const ids = groupChatters.filter((gc) => gc.group_id === groupId).map((gc) => gc.chatter_id);
      return chatters.filter((c) => ids.includes(c.id));
    },
    [groupChatters, chatters],
  );

  // ── Group CRUD ──
  const handleCreateGroup = async () => {
    setSaving(true);
    const nextOrder = groups.length > 0 ? Math.max(...groups.map((g) => g.sort_order)) + 1 : 1;
    const { data, error } = await supabase
      .from('assignment_groups')
      .insert({ name: `Equipo ${nextOrder}`, sort_order: nextOrder, created_by: profile?.id })
      .select()
      .single();
    if (!error && data) setGroups((prev) => [...prev, data as AssignmentGroup]);
    setSaving(false);
  };

  const handleRenameGroup = async (groupId: string, newName: string) => {
    await supabase.from('assignment_groups').update({ name: newName }).eq('id', groupId);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g)));
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Delete this group? Models and chatters will be unassigned.')) return;
    setSaving(true);
    await supabase.from('assignment_groups').update({ active: false }).eq('id', groupId);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setGroupModels((prev) => prev.filter((gm) => gm.group_id !== groupId));
    setGroupChatters((prev) => prev.filter((gc) => gc.group_id !== groupId));
    setOverrides((prev) => prev.filter((o) => o.group_id !== groupId));
    setSaving(false);
  };

  // ── Model assignment ──
  const handleAssignModel = async (groupId: string, modelId: string) => {
    setSaving(true);
    const { data, error } = await supabase
      .from('assignment_group_models')
      .insert({ group_id: groupId, model_id: modelId, assigned_by: profile?.id })
      .select()
      .single();
    if (!error && data) setGroupModels((prev) => [...prev, data as AssignmentGroupModel]);
    setSaving(false);
  };

  const handleUnassignModel = async (gmId: string) => {
    setSaving(true);
    await supabase.from('assignment_group_models').delete().eq('id', gmId);
    setGroupModels((prev) => prev.filter((gm) => gm.id !== gmId));
    setSaving(false);
  };

  const handleMoveModel = async (modelId: string, fromGroupId: string, toGroupId: string) => {
    if (fromGroupId === toGroupId) return;
    setSaving(true);
    const existing = groupModels.find((gm) => gm.model_id === modelId && gm.group_id === fromGroupId);
    if (existing) {
      await supabase.from('assignment_group_models').delete().eq('id', existing.id);
      setGroupModels((prev) => prev.filter((gm) => gm.id !== existing.id));
    }
    const { data, error } = await supabase
      .from('assignment_group_models')
      .insert({ group_id: toGroupId, model_id: modelId, assigned_by: profile?.id })
      .select()
      .single();
    if (!error && data) setGroupModels((prev) => [...prev, data as AssignmentGroupModel]);
    setSaving(false);
  };

  // ── Chatter default assignment ──
  const handleAssignChatter = async (groupId: string, chatterId: string) => {
    setSaving(true);
    // Remove existing default if any (unique constraint on chatter_id)
    const existing = groupChatters.find((gc) => gc.chatter_id === chatterId);
    if (existing) {
      await supabase.from('assignment_group_chatters').delete().eq('id', existing.id);
      setGroupChatters((prev) => prev.filter((gc) => gc.id !== existing.id));
    }
    const { data, error } = await supabase
      .from('assignment_group_chatters')
      .insert({ group_id: groupId, chatter_id: chatterId, assigned_by: profile?.id })
      .select()
      .single();
    if (!error && data) setGroupChatters((prev) => [...prev, data as AssignmentGroupChatter]);
    setSaving(false);
  };

  const handleUnassignChatter = async (gcId: string) => {
    setSaving(true);
    await supabase.from('assignment_group_chatters').delete().eq('id', gcId);
    setGroupChatters((prev) => prev.filter((gc) => gc.id !== gcId));
    setSaving(false);
  };

  // ── Override (coverage) ──
  const handleAddOverride = async (groupId: string, chatterId: string, date: string) => {
    setSaving(true);
    const existing = overrides.find((o) => o.chatter_id === chatterId && o.date === date);
    if (existing) {
      await supabase.from('assignment_group_overrides').delete().eq('id', existing.id);
      setOverrides((prev) => prev.filter((o) => o.id !== existing.id));
    }
    const { data, error } = await supabase
      .from('assignment_group_overrides')
      .insert({ group_id: groupId, chatter_id: chatterId, date, assigned_by: profile?.id })
      .select()
      .single();
    if (!error && data) setOverrides((prev) => [...prev, data as AssignmentGroupOverride]);
    setSaving(false);
  };

  const handleRemoveOverride = async (overrideId: string) => {
    setSaving(true);
    await supabase.from('assignment_group_overrides').delete().eq('id', overrideId);
    setOverrides((prev) => prev.filter((o) => o.id !== overrideId));
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-text-secondary">
          <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
          Loading assignments...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-56px)] lg:h-screen flex flex-col">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Assignments</h1>
          <p className="text-sm text-text-secondary">
            {groups.length} equipos · {liveModels.length} live models · {chatters.length} chatters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-2 rounded-lg p-0.5">
            <button
              onClick={() => setTab('groups')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'groups' ? 'bg-cw/15 text-cw' : 'text-text-muted hover:text-white'
              }`}
            >
              <Layers size={13} /> Equipos
            </button>
            <button
              onClick={() => setTab('weekly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'weekly' ? 'bg-cw/15 text-cw' : 'text-text-muted hover:text-white'
              }`}
            >
              <CalendarDays size={13} /> Weekly View
            </button>
          </div>
        </div>
      </div>

      {tab === 'groups' ? (
        <GroupsTab
          groups={groups}
          models={models}
          liveModels={liveModels}
          chatters={chatters}
          groupModels={groupModels}
          groupChatters={groupChatters}
          unassignedModels={unassignedModels}
          unassignedChatters={unassignedChatters}
          getModelsForGroup={getModelsForGroup}
          getChattersForGroup={getChattersForGroup}
          getModelTraffic={getModelTraffic}
          saving={saving}
          onCreateGroup={handleCreateGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onAssignModel={handleAssignModel}
          onUnassignModel={handleUnassignModel}
          onMoveModel={handleMoveModel}
          onAssignChatter={handleAssignChatter}
          onUnassignChatter={handleUnassignChatter}
        />
      ) : (
        <WeeklyTab
          groups={groups}
          chatters={chatters}
          groupChatters={groupChatters}
          overrides={overrides}
          schedules={schedules}
          weekStart={weekStart}
          weekDates={weekDates}
          weekOffset={weekOffset}
          dayNames={dayNames}
          saving={saving}
          onWeekChange={setWeekOffset}
          onAddOverride={handleAddOverride}
          onRemoveOverride={handleRemoveOverride}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tab 1: Groups Setup
// ════════════════════════════════════════════════════════════════

interface GroupsTabProps {
  groups: AssignmentGroup[];
  models: Model[];
  liveModels: Model[];
  chatters: Chatter[];
  groupModels: AssignmentGroupModel[];
  groupChatters: AssignmentGroupChatter[];
  unassignedModels: Model[];
  unassignedChatters: Chatter[];
  getModelsForGroup: (groupId: string) => Model[];
  getChattersForGroup: (groupId: string) => Chatter[];
  getModelTraffic: ReturnType<typeof useTrafficData>['getModelTraffic'];
  saving: boolean;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onAssignModel: (groupId: string, modelId: string) => void;
  onUnassignModel: (gmId: string) => void;
  onMoveModel: (modelId: string, fromGroupId: string, toGroupId: string) => void;
  onAssignChatter: (groupId: string, chatterId: string) => void;
  onUnassignChatter: (gcId: string) => void;
}

function GroupsTab({
  groups, models, liveModels, chatters,
  groupModels, groupChatters,
  unassignedModels, unassignedChatters,
  getModelsForGroup, getChattersForGroup, getModelTraffic,
  saving,
  onCreateGroup, onRenameGroup, onDeleteGroup,
  onAssignModel, onUnassignModel, onMoveModel,
  onAssignChatter, onUnassignChatter,
}: GroupsTabProps) {
  const [modelPickerGroup, setModelPickerGroup] = useState<string | null>(null);
  const [chatterPickerGroup, setChatterPickerGroup] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, modelId: string, sourceGroupId: string) => {
    e.dataTransfer.setData('modelId', modelId);
    e.dataTransfer.setData('sourceGroupId', sourceGroupId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverGroupId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    setDragOverGroupId(null);
    const modelId = e.dataTransfer.getData('modelId');
    const sourceGroupId = e.dataTransfer.getData('sourceGroupId');
    if (modelId && sourceGroupId && sourceGroupId !== targetGroupId) {
      onMoveModel(modelId, sourceGroupId, targetGroupId);
    }
  }, [onMoveModel]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* Add Group Button */}
      <div className="mb-4">
        <button
          onClick={onCreateGroup}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cw/10 text-cw text-sm font-semibold hover:bg-cw/20 transition-colors disabled:opacity-50"
        >
          <Plus size={16} /> Add Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl p-12 text-center">
          <Layers size={40} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-muted text-sm">No groups yet. Create your first group to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {groups.map((group) => {
            const gModels = getModelsForGroup(group.id);
            const gChatters = getChattersForGroup(group.id);
            return (
              <GroupCard
                key={group.id}
                group={group}
                models={gModels}
                chatters={gChatters}
                groupModels={groupModels}
                groupChatters={groupChatters}
                getModelTraffic={getModelTraffic}
                saving={saving}
                isDragOver={dragOverGroupId === group.id}
                onDragStart={handleDragStart}
                onDragOver={(e) => handleDragOver(e, group.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, group.id)}
                isModelPickerOpen={modelPickerGroup === group.id}
                isChatterPickerOpen={chatterPickerGroup === group.id}
                onToggleModelPicker={() => {
                  setModelPickerGroup(modelPickerGroup === group.id ? null : group.id);
                  setChatterPickerGroup(null);
                  setPickerSearch('');
                }}
                onToggleChatterPicker={() => {
                  setChatterPickerGroup(chatterPickerGroup === group.id ? null : group.id);
                  setModelPickerGroup(null);
                  setPickerSearch('');
                }}
                onRename={(name) => onRenameGroup(group.id, name)}
                onDelete={() => onDeleteGroup(group.id)}
                onAssignModel={(modelId) => {
                  onAssignModel(group.id, modelId);
                }}
                onUnassignModel={onUnassignModel}
                onAssignChatter={(chatterId) => {
                  onAssignChatter(group.id, chatterId);
                }}
                onUnassignChatter={onUnassignChatter}
                unassignedModels={unassignedModels}
                unassignedChatters={unassignedChatters}
                pickerSearch={pickerSearch}
                onPickerSearch={setPickerSearch}
              />
            );
          })}
        </div>
      )}

      {/* Unassigned models with assign/dismiss actions */}
      {unassignedModels.length > 0 && (
        <UnassignedModelsSection
          models={unassignedModels}
          groups={groups}
          saving={saving}
          onAssignModel={onAssignModel}
        />
      )}

      {/* Unassigned chatters with assign actions */}
      {unassignedChatters.length > 0 && (
        <UnassignedChattersSection
          chatters={unassignedChatters}
          groups={groups}
          saving={saving}
          onAssignChatter={onAssignChatter}
        />
      )}
    </div>
  );
}

// ── Group Card Component ──

interface GroupCardProps {
  group: AssignmentGroup;
  models: Model[];
  chatters: Chatter[];
  groupModels: AssignmentGroupModel[];
  groupChatters: AssignmentGroupChatter[];
  getModelTraffic: ReturnType<typeof useTrafficData>['getModelTraffic'];
  saving: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, modelId: string, sourceGroupId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  isModelPickerOpen: boolean;
  isChatterPickerOpen: boolean;
  onToggleModelPicker: () => void;
  onToggleChatterPicker: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAssignModel: (modelId: string) => void;
  onUnassignModel: (gmId: string) => void;
  onAssignChatter: (chatterId: string) => void;
  onUnassignChatter: (gcId: string) => void;
  unassignedModels: Model[];
  unassignedChatters: Chatter[];
  pickerSearch: string;
  onPickerSearch: (s: string) => void;
}

function GroupCard({
  group, models, chatters,
  groupModels, groupChatters,
  getModelTraffic, saving,
  isDragOver, onDragStart, onDragOver, onDragLeave, onDrop,
  isModelPickerOpen, isChatterPickerOpen,
  onToggleModelPicker, onToggleChatterPicker,
  onRename, onDelete,
  onAssignModel, onUnassignModel,
  onAssignChatter, onUnassignChatter,
  unassignedModels, unassignedChatters,
  pickerSearch, onPickerSearch,
}: GroupCardProps) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);

  const filteredPickerModels = unassignedModels.filter(
    (m) => !pickerSearch || m.name.toLowerCase().includes(pickerSearch.toLowerCase()),
  );
  const filteredPickerChatters = unassignedChatters.filter(
    (c) => !pickerSearch || c.full_name.toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  const getTeamColor = (team?: string | null) => {
    if (!team) return '';
    return TEAM_COLORS[team] ?? '';
  };

  return (
    <div
      className={`bg-surface-1 border rounded-xl flex flex-col transition-colors ${
        isDragOver ? 'border-cw ring-2 ring-cw/20 bg-cw/5' : 'border-border'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Group Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <GripVertical size={14} className="text-text-muted shrink-0" />
        {editing ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => {
              if (nameInput.trim() && nameInput !== group.name) onRename(nameInput.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (nameInput.trim() && nameInput !== group.name) onRename(nameInput.trim());
                setEditing(false);
              }
              if (e.key === 'Escape') {
                setNameInput(group.name);
                setEditing(false);
              }
            }}
            className="flex-1 bg-surface-2 border border-cw/50 rounded px-2 py-1 text-sm text-white font-bold focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm font-bold text-white hover:text-cw transition-colors"
          >
            {group.name}
          </button>
        )}
        <span className="text-[10px] text-text-muted shrink-0">{models.length}M · {chatters.length}C</span>
        <button
          onClick={onDelete}
          disabled={saving}
          className="p-1 rounded hover:bg-danger/15 text-text-muted hover:text-danger transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Models Section */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Monitor size={12} className="text-cw" />
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Models</span>
          </div>
          <button
            onClick={onToggleModelPicker}
            disabled={saving}
            className="flex items-center gap-1 text-[10px] text-cw hover:text-cw-light transition-colors disabled:opacity-50"
          >
            <Plus size={11} /> Add
          </button>
        </div>
        {models.length === 0 ? (
          <p className="text-[11px] text-text-muted py-2 text-center">No models assigned</p>
        ) : (
          <div>
            {models.map((model) => {
              const gm = groupModels.find((g) => g.model_id === model.id && g.group_id === group.id);
              const t = getModelTraffic(model.id);
              return (
                <div
                  key={model.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, model.id, group.id)}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cw/10 hover:border-cw/30 border border-transparent transition-colors cursor-grab active:cursor-grabbing"
                >
                  <GripVertical size={10} className="text-text-muted/40 shrink-0" />
                  <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="xs" />
                  <span className="text-xs text-white flex-1 truncate">{model.name}</span>
                  <PageTypeBadge pageType={model.page_type as 'Free Page' | 'Paid Page' | 'Mixed' | null} size="sm" />
                  {t && t.new_fans_avg > 0 && (
                    <span className="text-[9px] text-text-muted">{Math.round(t.new_fans_avg)}f/d</span>
                  )}
                  {gm && (
                    <button
                      onClick={() => onUnassignModel(gm.id)}
                      disabled={saving}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-danger/15 text-text-muted hover:text-danger transition-all"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Model Picker Inline */}
        {isModelPickerOpen && (
          <div className="mt-2 bg-surface-2 border border-border rounded-lg p-2 max-h-48 overflow-y-auto">
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                autoFocus
                value={pickerSearch}
                onChange={(e) => onPickerSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full bg-surface-3 border border-border rounded pl-7 pr-2 py-1 text-[11px] text-white placeholder-text-muted focus:outline-none focus:border-cw"
              />
            </div>
            {filteredPickerModels.length === 0 ? (
              <p className="text-[10px] text-text-muted text-center py-2">
                {unassignedModels.length === 0 ? 'All models assigned' : 'No match'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredPickerModels.slice(0, 15).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onAssignModel(m.id)}
                    disabled={saving}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-3 text-left transition-colors disabled:opacity-50"
                  >
                    <ModelAvatar name={m.name} pictureUrl={m.profile_picture_url} size="xs" />
                    <span className="text-[11px] text-white truncate flex-1">{m.name}</span>
                    <PageTypeBadge pageType={m.page_type as 'Free Page' | 'Paid Page' | 'Mixed' | null} size="sm" />
                    <Plus size={12} className="text-cw shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chatters Section */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Users size={12} className="text-emerald-400" />
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Default Chatters</span>
          </div>
          <button
            onClick={onToggleChatterPicker}
            disabled={saving}
            className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
          >
            <UserPlus size={11} /> Add
          </button>
        </div>
        {chatters.length === 0 ? (
          <p className="text-[11px] text-text-muted py-2 text-center">No chatters assigned</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chatters.map((chatter) => {
              const gc = groupChatters.find((g) => g.chatter_id === chatter.id);
              return (
                <div
                  key={chatter.id}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                    getTeamColor(chatter.team_name) || 'bg-surface-2 text-text-secondary border-border'
                  }`}
                >
                  <span className="font-medium">{chatter.full_name}</span>
                  {gc && (
                    <button
                      onClick={() => onUnassignChatter(gc.id)}
                      disabled={saving}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-danger/15 text-current hover:text-danger transition-all"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Chatter Picker Inline */}
        {isChatterPickerOpen && (
          <div className="mt-2 bg-surface-2 border border-border rounded-lg p-2 max-h-48 overflow-y-auto">
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                autoFocus
                value={pickerSearch}
                onChange={(e) => onPickerSearch(e.target.value)}
                placeholder="Search chatters..."
                className="w-full bg-surface-3 border border-border rounded pl-7 pr-2 py-1 text-[11px] text-white placeholder-text-muted focus:outline-none focus:border-cw"
              />
            </div>
            {filteredPickerChatters.length === 0 ? (
              <p className="text-[10px] text-text-muted text-center py-2">
                {unassignedChatters.length === 0 ? 'All chatters assigned' : 'No match'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredPickerChatters.slice(0, 15).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onAssignChatter(c.id)}
                    disabled={saving}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-3 text-left transition-colors disabled:opacity-50"
                  >
                    <span className="text-[11px] text-white truncate flex-1">{c.full_name}</span>
                    {c.team_name && (
                      <span className="text-[9px] text-text-muted">{c.team_name.replace('Team ', '')}</span>
                    )}
                    <Plus size={12} className="text-emerald-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tab 2: Weekly View
// ════════════════════════════════════════════════════════════════

interface WeeklyTabProps {
  groups: AssignmentGroup[];
  chatters: Chatter[];
  groupChatters: AssignmentGroupChatter[];
  overrides: AssignmentGroupOverride[];
  schedules: Schedule[];
  weekStart: string;
  weekDates: string[];
  weekOffset: number;
  dayNames: string[];
  saving: boolean;
  onWeekChange: (offset: number) => void;
  onAddOverride: (groupId: string, chatterId: string, date: string) => void;
  onRemoveOverride: (overrideId: string) => void;
}

function WeeklyTab({
  groups, chatters, groupChatters, overrides, schedules,
  weekStart, weekDates, weekOffset, dayNames, saving,
  onWeekChange, onAddOverride, onRemoveOverride,
}: WeeklyTabProps) {
  const [coverPicker, setCoverPicker] = useState<{ groupId: string; dayIdx: number } | null>(null);
  const [coverSearch, setCoverSearch] = useState('');

  const chatterMap = useMemo(
    () => new Map(chatters.map((c) => [c.id, c])),
    [chatters],
  );

  const isScheduled = useCallback(
    (chatterId: string, dayIdx: number) => {
      return schedules.some((s) => s.chatter_id === chatterId && s.day_of_week === dayIdx);
    },
    [schedules],
  );

  const getDefaultChattersForGroup = useCallback(
    (groupId: string) => {
      return groupChatters
        .filter((gc) => gc.group_id === groupId)
        .map((gc) => chatterMap.get(gc.chatter_id))
        .filter(Boolean) as Chatter[];
    },
    [groupChatters, chatterMap],
  );

  const getOverridesForCell = useCallback(
    (groupId: string, date: string) => {
      return overrides.filter((o) => o.group_id === groupId && o.date === date);
    },
    [overrides],
  );

  const getTeamColor = (team?: string | null) => {
    if (!team) return '';
    return TEAM_COLORS[team] ?? '';
  };

  const formatWeekLabel = (ws: string) => {
    const d = new Date(ws + 'T00:00:00');
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
  };

  return (
    <div className="flex-1 overflow-auto min-h-0">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onWeekChange(weekOffset - 1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-1 border border-border text-xs text-text-secondary hover:text-white transition-colors"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <div className="text-center">
          <h3 className="text-sm font-bold text-white">{formatWeekLabel(weekStart)}</h3>
          {weekOffset === 0 && <span className="text-[10px] text-cw">Current week</span>}
        </div>
        <button
          onClick={() => onWeekChange(weekOffset + 1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-1 border border-border text-xs text-text-secondary hover:text-white transition-colors"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl p-12 text-center">
          <Calendar size={40} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-muted text-sm">Create groups in the "Equipos" tab first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const defaultChatters = getDefaultChattersForGroup(group.id);
            return (
              <div key={group.id} className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                {/* Group Row Header */}
                <div className="px-4 py-2.5 bg-surface-2/50 border-b border-border flex items-center gap-2">
                  <Layers size={13} className="text-cw" />
                  <span className="text-sm font-bold text-white">{group.name}</span>
                  <span className="text-[10px] text-text-muted">{defaultChatters.length} default</span>
                </div>

                {/* Day Grid */}
                <div className="grid grid-cols-7 divide-x divide-border">
                  {weekDates.map((date, dayIdx) => {
                    const cellOverrides = getOverridesForCell(group.id, date);
                    const today = new Date().toISOString().split('T')[0];
                    const isToday = date === today;

                    const scheduledDefaults = defaultChatters.filter((c) => isScheduled(c.id, dayIdx));
                    const offDefaults = defaultChatters.filter((c) => !isScheduled(c.id, dayIdx));

                    const activeCount = scheduledDefaults.length + cellOverrides.length;
                    const hasWarning = activeCount === 0 && defaultChatters.length > 0;

                    return (
                      <div
                        key={date}
                        className={`p-2 min-h-[120px] ${isToday ? 'bg-cw/5' : ''} ${hasWarning ? 'bg-danger/5' : ''}`}
                      >
                        {/* Day Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[10px] font-semibold ${isToday ? 'text-cw' : 'text-text-muted'}`}>
                            {dayNames[dayIdx]}
                          </span>
                          <span className={`text-[9px] ${isToday ? 'text-cw' : 'text-text-muted'}`}>
                            {new Date(date + 'T00:00:00').getDate()}
                          </span>
                        </div>

                        {/* Active count */}
                        <div className={`text-[9px] mb-1.5 font-medium ${
                          hasWarning ? 'text-danger' : activeCount > 0 ? 'text-success' : 'text-text-muted'
                        }`}>
                          {activeCount} active
                        </div>

                        {/* Default chatters scheduled */}
                        {scheduledDefaults.map((c) => (
                          <div
                            key={c.id}
                            className={`mb-1 px-1.5 py-0.5 rounded text-[10px] truncate border ${
                              getTeamColor(c.team_name) || 'bg-success/10 text-success border-success/20'
                            }`}
                            title={`${c.full_name} (default)`}
                          >
                            {c.full_name.split(' ')[0]}
                          </div>
                        ))}

                        {/* Default chatters OFF */}
                        {offDefaults.map((c) => (
                          <div
                            key={c.id}
                            className="mb-1 px-1.5 py-0.5 rounded text-[10px] truncate bg-surface-2 text-text-muted line-through border border-transparent"
                            title={`${c.full_name} (off)`}
                          >
                            {c.full_name.split(' ')[0]}
                          </div>
                        ))}

                        {/* Overrides (covers) */}
                        {cellOverrides.map((ov) => {
                          const c = chatterMap.get(ov.chatter_id);
                          if (!c) return null;
                          return (
                            <div
                              key={ov.id}
                              className="mb-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 group"
                              title={`${c.full_name} (cover)`}
                            >
                              <span className="truncate flex-1">{c.full_name.split(' ')[0]}</span>
                              <button
                                onClick={() => onRemoveOverride(ov.id)}
                                disabled={saving}
                                className="p-0 opacity-0 group-hover:opacity-100 hover:text-danger transition-all shrink-0"
                              >
                                <X size={9} />
                              </button>
                            </div>
                          );
                        })}

                        {/* Add cover button */}
                        <button
                          onClick={() => {
                            setCoverPicker(
                              coverPicker?.groupId === group.id && coverPicker?.dayIdx === dayIdx
                                ? null
                                : { groupId: group.id, dayIdx },
                            );
                            setCoverSearch('');
                          }}
                          className="w-full mt-1 py-0.5 rounded text-[9px] text-text-muted hover:text-cw hover:bg-cw/10 transition-colors"
                        >
                          + cover
                        </button>

                        {/* Cover picker */}
                        {coverPicker?.groupId === group.id && coverPicker.dayIdx === dayIdx && (
                          <CoverPicker
                            chatters={chatters}
                            groupChatters={groupChatters}
                            currentGroupId={group.id}
                            date={date}
                            search={coverSearch}
                            onSearch={setCoverSearch}
                            saving={saving}
                            onSelect={(chatterId) => {
                              onAddOverride(group.id, chatterId, date);
                              setCoverPicker(null);
                            }}
                            onClose={() => setCoverPicker(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Cover Picker Dropdown ──

function CoverPicker({
  chatters, groupChatters, currentGroupId, date,
  search, onSearch, saving, onSelect, onClose,
}: {
  chatters: Chatter[];
  groupChatters: AssignmentGroupChatter[];
  currentGroupId: string;
  date: string;
  search: string;
  onSearch: (s: string) => void;
  saving: boolean;
  onSelect: (chatterId: string) => void;
  onClose: () => void;
}) {
  const availableChatters = chatters.filter((c) => {
    const defaultGroup = groupChatters.find((gc) => gc.chatter_id === c.id);
    if (defaultGroup?.group_id === currentGroupId) return false;
    if (search && !c.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mt-1 bg-surface-2 border border-border rounded-lg p-1.5 max-h-36 overflow-y-auto shadow-lg z-10 relative">
      <div className="relative mb-1">
        <input
          autoFocus
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-surface-3 border border-border rounded pl-2 pr-2 py-0.5 text-[10px] text-white placeholder-text-muted focus:outline-none focus:border-cw"
        />
      </div>
      {availableChatters.length === 0 ? (
        <p className="text-[9px] text-text-muted text-center py-1">No chatters available</p>
      ) : (
        availableChatters.slice(0, 10).map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            disabled={saving}
            className="w-full flex items-center gap-1 px-1.5 py-1 rounded hover:bg-surface-3 text-left transition-colors text-[10px] text-white disabled:opacity-50"
          >
            <span className="truncate flex-1">{c.full_name}</span>
            {c.team_name && (
              <span className="text-[8px] text-text-muted shrink-0">{c.team_name.replace('Team ', '')}</span>
            )}
          </button>
        ))
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Unassigned Models Section
// ════════════════════════════════════════════════════════════════

function UnassignedModelsSection({
  models, groups, saving, onAssignModel,
}: {
  models: Model[];
  groups: AssignmentGroup[];
  saving: boolean;
  onAssignModel: (groupId: string, modelId: string) => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = models.filter((m) => !dismissed.has(m.id));
  if (visible.length === 0) return null;

  return (
    <div className="mt-6 bg-surface-1 border border-warning/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} className="text-warning" />
        <h3 className="text-xs font-semibold text-warning uppercase tracking-wider">
          Unassigned Live Models ({visible.length})
        </h3>
      </div>
      <div className="space-y-1.5">
        {visible.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-warning/5 border border-warning/15">
            <ModelAvatar name={m.name} pictureUrl={m.profile_picture_url} size="xs" />
            <span className="text-sm text-white flex-1">{m.name}</span>
            <PageTypeBadge pageType={m.page_type as 'Free Page' | 'Paid Page' | 'Mixed' | null} size="sm" />

            {/* Assign dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === m.id ? null : m.id)}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cw/10 text-cw text-[11px] font-medium hover:bg-cw/20 transition-colors disabled:opacity-50"
              >
                <Plus size={11} /> Assign
              </button>
              {openDropdown === m.id && (
                <div className="absolute right-0 top-full mt-1 bg-surface-2 border border-border rounded-lg shadow-lg z-20 min-w-[140px] py-1">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        onAssignModel(g.id, m.id);
                        setOpenDropdown(null);
                      }}
                      disabled={saving}
                      className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-surface-3 transition-colors disabled:opacity-50"
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(m.id))}
              className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text-secondary transition-colors"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Unassigned Chatters Section
// ════════════════════════════════════════════════════════════════

function UnassignedChattersSection({
  chatters, groups, saving, onAssignChatter,
}: {
  chatters: Chatter[];
  groups: AssignmentGroup[];
  saving: boolean;
  onAssignChatter: (groupId: string, chatterId: string) => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = chatters.filter((c) => !dismissed.has(c.id));
  if (visible.length === 0) return null;

  return (
    <div className="mt-4 bg-surface-1 border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-text-muted" />
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Chatters Without Group ({visible.length})
        </h3>
      </div>
      <div className="space-y-1.5">
        {visible.map((c) => {
          const teamColor = TEAM_COLORS[c.team_name ?? ''] ?? '';
          return (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2/50 border border-border">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 ${
                teamColor || 'bg-surface-3 text-text-secondary'
              }`}>
                {c.full_name.charAt(0)}
              </div>
              <span className="text-sm text-white flex-1">{c.full_name}</span>
              {c.team_name && (
                <span className="text-[10px] text-text-muted">{c.team_name}</span>
              )}

              {/* Assign dropdown */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === c.id ? null : c.id)}
                  disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  <Plus size={11} /> Assign
                </button>
                {openDropdown === c.id && (
                  <div className="absolute right-0 top-full mt-1 bg-surface-2 border border-border rounded-lg shadow-lg z-20 min-w-[140px] py-1">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          onAssignChatter(g.id, c.id);
                          setOpenDropdown(null);
                        }}
                        disabled={saving}
                        className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-surface-3 transition-colors disabled:opacity-50"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dismiss */}
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(c.id))}
                className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text-secondary transition-colors"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

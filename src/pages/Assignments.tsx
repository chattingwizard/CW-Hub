import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { TEAM_COLORS } from '../lib/utils';
import { Plus, X, Search, Users, ChevronRight, Monitor, Clock, Calendar, Activity } from 'lucide-react';
import ModelAvatar from '../components/ModelAvatar';
import TrafficBadge, { TeamTrafficBar, PageTypeBadge } from '../components/TrafficBadge';
import { useTrafficData } from '../hooks/useTrafficData';
import type { Model, Chatter, ModelChatterAssignment, Schedule } from '../types';

export default function Assignments() {
  const { profile } = useAuthStore();
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [assignments, setAssignments] = useState<ModelChatterAssignment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedChatter, setSelectedChatter] = useState<Chatter | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [chatterSearch, setChatterSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { modelTraffic, teamTraffic, getModelTraffic, globalAvg } = useTrafficData();

  // Current week start
  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0]!;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [modelsRes, chattersRes, assignRes, schedRes] = await Promise.all([
      supabase.from('models').select('*').order('name'),
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter').order('full_name'),
      supabase.from('model_chatter_assignments').select('*').eq('active', true),
      supabase.from('schedules').select('*').eq('week_start', getWeekStart()),
    ]);
    const mods = (modelsRes.data ?? []) as Model[];
    const chats = (chattersRes.data ?? []) as Chatter[];
    setModels(mods);
    setChatters(chats);
    setAssignments((assignRes.data ?? []) as ModelChatterAssignment[]);
    setSchedules((schedRes.data ?? []) as Schedule[]);
    if (!selectedChatter && chats.length > 0) setSelectedChatter(chats[0]!);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Models assigned to selected chatter
  const assignedModels = selectedChatter
    ? assignments
        .filter((a) => a.chatter_id === selectedChatter.id)
        .map((a) => ({ assignment: a, model: models.find((m) => m.id === a.model_id) }))
        .filter((a) => a.model)
    : [];

  // Available models (not yet assigned to this chatter)
  const availableModels = selectedChatter
    ? models
        .filter((m) => m.status === 'Live')
        .filter((m) => !assignments.some((a) => a.model_id === m.id && a.chatter_id === selectedChatter.id))
        .filter((m) => !modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
    : [];

  // Filtered chatters
  const filteredChatters = chatters.filter((c) => {
    if (teamFilter !== 'all' && c.team_name !== teamFilter) return false;
    if (chatterSearch && !c.full_name.toLowerCase().includes(chatterSearch.toLowerCase())) return false;
    return true;
  });

  // Group chatters by team
  const teams = [...new Set(chatters.map((c) => c.team_name).filter(Boolean))] as string[];
  const chattersByTeam = teams.reduce((acc, team) => {
    acc[team] = filteredChatters.filter((c) => c.team_name === team);
    return acc;
  }, {} as Record<string, Chatter[]>);
  const unteamedChatters = filteredChatters.filter((c) => !c.team_name);

  // Chatter schedule for this week
  const chatterScheduleDays = selectedChatter
    ? schedules.filter((s) => s.chatter_id === selectedChatter.id)
    : [];

  // Counts
  const getModelCount = (chatterId: string) =>
    assignments.filter((a) => a.chatter_id === chatterId).length;

  const getChatterCountForModel = (modelId: string) =>
    assignments.filter((a) => a.model_id === modelId).length;

  const handleAssign = async (modelId: string) => {
    if (!selectedChatter) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('model_chatter_assignments')
      .insert({ model_id: modelId, chatter_id: selectedChatter.id, assigned_by: profile?.id })
      .select()
      .single();
    if (!error && data) {
      setAssignments((prev) => [...prev, data as ModelChatterAssignment]);
    }
    setSaving(false);
  };

  const handleUnassign = async (assignmentId: string) => {
    setSaving(true);
    await supabase.from('model_chatter_assignments').delete().eq('id', assignmentId);
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    setSaving(false);
  };

  const statusBadge = (status: string) => {
    const c: Record<string, string> = {
      Live: 'bg-success/15 text-success',
      'On Hold': 'bg-warning/15 text-warning',
      Dead: 'bg-danger/15 text-danger',
    };
    return c[status] ?? 'bg-surface-3 text-text-secondary';
  };

  const getTeamColor = (team?: string | null) => {
    if (!team) return '';
    return TEAM_COLORS[team] ?? '';
  };

  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-56px)] lg:h-screen flex flex-col">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Assignments</h1>
          <p className="text-sm text-text-secondary">
            {chatters.length} chatters &middot; {models.filter((m) => m.status === 'Live').length} live models &middot; {assignments.length} assignments
          </p>
        </div>
      </div>

      {/* Team Traffic / Workload Comparison */}
      {teamTraffic.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 mb-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-cw" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Team Workload Balance</h3>
            {(() => {
              const values = teamTraffic.map((t) => t.workload_per_chatter).filter((v) => v > 0);
              if (values.length < 2) return null;
              const maxVal = Math.max(...values);
              const minVal = Math.min(...values);
              const ratio = minVal > 0 ? maxVal / minVal : 0;
              if (ratio > 3)
                return <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger ml-2">Critical imbalance ({ratio.toFixed(1)}x)</span>;
              if (ratio > 2)
                return <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning ml-2">Imbalance ({ratio.toFixed(1)}x)</span>;
              return <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success ml-2">Balanced</span>;
            })()}
            <span className="text-[9px] text-text-muted ml-auto">weighted: <span className="text-emerald-400">F</span>=1.0x <span className="text-purple-400">M</span>=0.7x <span className="text-amber-400">P</span>=0.4x</span>
          </div>
          <div className="space-y-3">
            {teamTraffic.map((team) => (
              <TeamTrafficBar
                key={team.team_name}
                team={team}
                maxWorkload={teamTraffic[0]!.total_workload}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Chatters Panel (Left) */}
        <div className="w-72 shrink-0 flex-col bg-surface-1 border border-border rounded-xl overflow-hidden hidden lg:flex">
          {/* Search + Filter */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={chatterSearch}
                onChange={(e) => setChatterSearch(e.target.value)}
                placeholder="Search chatters..."
                className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw"
              />
            </div>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:border-cw focus:outline-none"
            >
              <option value="all">All Teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Chatter List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-text-muted text-sm">Loading...</div>
            ) : (
              <>
                {Object.entries(chattersByTeam).map(([team, members]) => (
                  members.length > 0 && (
                    <div key={team}>
                      <div className="px-3 py-2 bg-surface-2/50 border-b border-border">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{team}</span>
                      </div>
                      {members.map((chatter) => {
                        const modelCount = getModelCount(chatter.id);
                        const isSelected = selectedChatter?.id === chatter.id;
                        return (
                          <button
                            key={chatter.id}
                            onClick={() => setSelectedChatter(chatter)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2 ${
                              isSelected
                                ? 'bg-cw/10 border-l-cw'
                                : 'border-l-transparent hover:bg-surface-2'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                              getTeamColor(chatter.team_name) || 'bg-surface-3 text-text-secondary'
                            }`}>
                              {chatter.full_name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{chatter.full_name}</p>
                              <p className="text-[10px] text-text-muted">
                                {modelCount} model{modelCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                            {isSelected && <ChevronRight size={14} className="text-cw shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )
                ))}
                {unteamedChatters.length > 0 && (
                  <div>
                    <div className="px-3 py-2 bg-surface-2/50 border-b border-border">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">No Team</span>
                    </div>
                    {unteamedChatters.map((chatter) => {
                      const modelCount = getModelCount(chatter.id);
                      const isSelected = selectedChatter?.id === chatter.id;
                      return (
                        <button
                          key={chatter.id}
                          onClick={() => setSelectedChatter(chatter)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2 ${
                            isSelected ? 'bg-cw/10 border-l-cw' : 'border-l-transparent hover:bg-surface-2'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-xs font-medium text-text-secondary shrink-0">
                            {chatter.full_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{chatter.full_name}</p>
                            <p className="text-[10px] text-text-muted">{modelCount} models</p>
                          </div>
                          {isSelected && <ChevronRight size={14} className="text-cw shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chatter Detail Panel (Right) */}
        {selectedChatter ? (
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            {/* Mobile chatter selector */}
            <div className="lg:hidden">
              <select
                value={selectedChatter.id}
                onChange={(e) => {
                  const c = chatters.find((c) => c.id === e.target.value);
                  if (c) setSelectedChatter(c);
                }}
                className="w-full bg-surface-1 border border-border rounded-xl px-4 py-3 text-white text-sm focus:border-cw focus:outline-none"
              >
                {chatters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} — {getModelCount(c.id)} models {c.team_name ? `(${c.team_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Chatter Header Card */}
            <div className="bg-surface-1 border border-border rounded-xl p-5 shrink-0">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${
                  getTeamColor(selectedChatter.team_name) || 'bg-cw/15 text-cw'
                }`}>
                  {selectedChatter.full_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-white">{selectedChatter.full_name}</h2>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {selectedChatter.team_name && (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border ${getTeamColor(selectedChatter.team_name)}`}>
                        {selectedChatter.team_name}
                      </span>
                    )}
                    {selectedChatter.airtable_role && (
                      <span className="text-xs text-text-muted">{selectedChatter.airtable_role}</span>
                    )}
                  </div>
                </div>
                {/* Quick stats */}
                <div className="hidden lg:flex items-center gap-5">
                  <div className="text-center">
                    <p className="text-xl font-bold text-cw">{assignedModels.length}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Models</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-white">{chatterScheduleDays.length}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Shifts/wk</p>
                  </div>
                  {(() => {
                    const totalWl = assignedModels.reduce((sum, { model }) => {
                      const t = getModelTraffic(model!.id);
                      return sum + (t?.workload_per_chatter ?? 0);
                    }, 0);
                    const freeCount = assignedModels.filter(({ model }) => model!.page_type === 'Free Page').length;
                    const paidCount = assignedModels.filter(({ model }) => model!.page_type === 'Paid Page').length;
                    return (
                      <div className="text-center pl-4 border-l border-border">
                        <p className="text-xl font-bold text-orange-400">{Math.round(totalWl)}</p>
                        <p className="text-[10px] text-text-muted uppercase tracking-wider">Workload</p>
                        <div className="flex gap-1 justify-center mt-0.5">
                          {freeCount > 0 && <span className="text-[8px] text-emerald-400">{freeCount}F</span>}
                          {paidCount > 0 && <span className="text-[8px] text-amber-400">{paidCount}P</span>}
                          {assignedModels.length - freeCount - paidCount > 0 && <span className="text-[8px] text-purple-400">{assignedModels.length - freeCount - paidCount}M</span>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* This week schedule mini-view */}
              {chatterScheduleDays.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={12} className="text-text-muted" />
                    <span className="text-[10px] text-text-muted uppercase tracking-wider">This week's schedule</span>
                  </div>
                  <div className="flex gap-1.5">
                    {dayNames.map((day, i) => {
                      const sched = chatterScheduleDays.find((s) => s.day_of_week === i);
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-lg py-1.5 text-center text-[10px] ${
                            sched ? 'bg-cw/15 text-cw border border-cw/30' : 'bg-surface-2 text-text-muted border border-border'
                          }`}
                          title={sched ? sched.shift : 'Off'}
                        >
                          <div className="font-medium">{day}</div>
                          {sched && <div className="text-[8px] mt-0.5 opacity-70">{sched.shift.split('-')[0]}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Assigned Models */}
            <div className="bg-surface-1 border border-border rounded-xl p-5 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Monitor size={14} className="text-cw" />
                  <h3 className="text-sm font-semibold text-white">Assigned Models ({assignedModels.length})</h3>
                </div>
              </div>
              {assignedModels.length === 0 ? (
                <p className="text-sm text-text-muted py-3 text-center">No models assigned. Add from below.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedModels.map(({ assignment, model }) => {
                    const t = getModelTraffic(model!.id);
                    return (
                      <div
                        key={assignment.id}
                        className="group flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-2 border border-border hover:border-cw/30 transition-colors"
                      >
                        <ModelAvatar name={model!.name} pictureUrl={model!.profile_picture_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-white font-medium">{model!.name}</p>
                            <PageTypeBadge pageType={model!.page_type as 'Free Page' | 'Paid Page' | 'Mixed' | null} size="sm" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-text-muted">{getChatterCountForModel(model!.id)} chatters</span>
                            {t && (
                              <span className="text-[9px] text-text-muted">{Math.round(t.new_fans_avg)} fans/d</span>
                            )}
                          </div>
                        </div>
                        <TrafficBadge
                          traffic={t}
                          size="sm"
                          showTrend
                          showType={false}
                          maxValue={modelTraffic.length > 0 ? modelTraffic[0]!.workload : 1}
                        />
                        <button
                          onClick={() => handleUnassign(assignment.id)}
                          disabled={saving}
                          className="ml-1 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-danger/15 text-text-muted hover:text-danger transition-all disabled:opacity-30"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Available Models to Add */}
            <div className="bg-surface-1 border border-border rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white shrink-0">Add Models</h3>
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search live models..."
                      className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw"
                    />
                  </div>
                  <span className="text-xs text-text-muted shrink-0">{availableModels.length} available</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {availableModels.map((model) => {
                    const t = getModelTraffic(model.id);
                    return (
                      <button
                        key={model.id}
                        onClick={() => handleAssign(model.id)}
                        disabled={saving}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2 border border-border hover:border-cw/40 hover:bg-cw/5 text-left transition-all group disabled:opacity-50"
                      >
                        <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-white truncate">{model.name}</p>
                            <PageTypeBadge pageType={model.page_type as 'Free Page' | 'Paid Page' | 'Mixed' | null} size="sm" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-text-muted">{getChatterCountForModel(model.id)} chatters</span>
                            {t && <span className="text-[9px] text-text-muted">{Math.round(t.new_fans_avg)} fans/d</span>}
                          </div>
                        </div>
                        <Plus size={16} className="text-cw opacity-0 group-hover:opacity-100 shrink-0" />
                      </button>
                    );
                  })}
                  {availableModels.length === 0 && (
                    <p className="col-span-full text-sm text-text-muted py-6 text-center">
                      {modelSearch ? 'No models match your search.' : 'All live models are assigned.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Users size={40} className="text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">Select a chatter to manage assignments</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

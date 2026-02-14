import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { TEAM_COLORS } from '../lib/utils';
import { Plus, X, Search, Filter } from 'lucide-react';
import type { Model, Chatter, ModelChatterAssignment } from '../types';

export default function Assignments() {
  const { profile } = useAuthStore();
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [assignments, setAssignments] = useState<ModelChatterAssignment[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [search, setSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('Live');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [modelsRes, chattersRes, assignRes] = await Promise.all([
      supabase.from('models').select('*').order('name'),
      supabase.from('chatters').select('*').eq('status', 'Active').order('full_name'),
      supabase.from('model_chatter_assignments').select('*').eq('active', true),
    ]);
    const mods = (modelsRes.data ?? []) as Model[];
    setChatters((chattersRes.data ?? []) as Chatter[]);
    setAssignments((assignRes.data ?? []) as ModelChatterAssignment[]);
    setModels(mods);
    if (!selectedModel && mods.length > 0) {
      const liveMods = mods.filter((m) => m.status === 'Live');
      setSelectedModel(liveMods[0] || mods[0] || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const assignedChattersForModel = (modelId: string) =>
    assignments.filter((a) => a.model_id === modelId).map((a) => ({
      assignment: a,
      chatter: chatters.find((c) => c.id === a.chatter_id),
    }));

  const filteredModels = models.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (modelSearch && !m.name.toLowerCase().includes(modelSearch.toLowerCase())) return false;
    return true;
  });

  const availableChatters = selectedModel
    ? chatters.filter(
        (c) =>
          !assignments.some((a) => a.model_id === selectedModel.id && a.chatter_id === c.id) &&
          (teamFilter === 'all' || c.team_name === teamFilter) &&
          (!search || c.full_name.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  const handleAssign = async (chatterId: string) => {
    if (!selectedModel) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('model_chatter_assignments')
      .insert({
        model_id: selectedModel.id,
        chatter_id: chatterId,
        assigned_by: profile?.id,
      })
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

  const teams = [...new Set(chatters.map((c) => c.team_name).filter(Boolean))];
  const statuses = [...new Set(models.map((m) => m.status))];

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Live: 'bg-success/15 text-success border-success/30',
      'On Hold': 'bg-warning/15 text-warning border-warning/30',
      Dead: 'bg-danger/15 text-danger border-danger/30',
      'Pending Invoice': 'bg-cw/15 text-cw border-cw/30',
    };
    return colors[status] ?? 'bg-surface-3 text-text-secondary border-border';
  };

  const getChatterTeamColor = (chatter?: Chatter) => {
    if (!chatter?.team_name) return 'bg-surface-3 text-text-secondary border-border';
    return TEAM_COLORS[chatter.team_name] ?? 'bg-cw/15 text-cw border-cw/30';
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Model-Chatter Assignments</h1>
          <p className="text-sm text-text-secondary mt-1">
            {filteredModels.length} models &middot; {assignments.length} total assignments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-text-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none"
            >
              <option value="all">All Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none"
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t} value={t!}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Models List */}
        <div className="lg:w-72 shrink-0">
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw"
                />
              </div>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
              {loading ? (
                <div className="px-4 py-8 text-center text-text-secondary text-sm">Loading...</div>
              ) : filteredModels.length === 0 ? (
                <div className="px-4 py-8 text-center text-text-muted text-sm">No models found</div>
              ) : (
                filteredModels.map((model) => {
                  const assignedCount = assignments.filter((a) => a.model_id === model.id).length;
                  return (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors border-l-2 ${
                        selectedModel?.id === model.id ? 'bg-cw/10 border-l-cw' : 'border-l-transparent'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center text-cw text-xs font-medium shrink-0">
                        {model.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{model.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusBadge(model.status)}`}>
                            {model.status}
                          </span>
                          <span className="text-[10px] text-text-muted">{assignedCount} chatters</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Assignment Panel */}
        {selectedModel ? (
          <div className="flex-1">
            <div className="bg-surface-1 border border-border rounded-xl p-6">
              {/* Model Header */}
              <div className="flex items-center gap-4 mb-6 pb-5 border-b border-border">
                <div className="w-14 h-14 rounded-xl bg-cw/15 flex items-center justify-center text-cw text-xl font-bold shrink-0">
                  {selectedModel.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white">{selectedModel.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border ${statusBadge(selectedModel.status)}`}>
                      {selectedModel.status}
                    </span>
                    {selectedModel.traffic_sources.length > 0 && (
                      <div className="flex gap-1">
                        {selectedModel.traffic_sources.slice(0, 3).map((src) => (
                          <span key={src} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">
                            {src}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Assigned Chatters */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Assigned Chatters ({assignedChattersForModel(selectedModel.id).length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {assignedChattersForModel(selectedModel.id).length === 0 ? (
                    <p className="text-sm text-text-muted py-2">No chatters assigned yet. Add from the list below.</p>
                  ) : (
                    assignedChattersForModel(selectedModel.id).map(({ assignment, chatter }) => (
                      <div
                        key={assignment.id}
                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${getChatterTeamColor(chatter)}`}
                      >
                        <span>{chatter?.full_name ?? 'Unknown'}</span>
                        {chatter?.team_name && (
                          <span className="text-[10px] opacity-60">({chatter.team_name.replace('Team ', '')})</span>
                        )}
                        <button
                          onClick={() => handleUnassign(assignment.id)}
                          disabled={saving}
                          className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger disabled:opacity-30"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Available Chatters */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-white">Add Chatters</h3>
                  <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search chatters..."
                      className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {availableChatters.map((chatter) => (
                    <button
                      key={chatter.id}
                      onClick={() => handleAssign(chatter.id)}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-left transition-colors disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-full bg-cw/10 flex items-center justify-center text-cw text-[10px] font-medium shrink-0">
                        {chatter.full_name.charAt(0)}
                      </div>
                      <span className="text-sm text-white flex-1 truncate">{chatter.full_name}</span>
                      {chatter.team_name && (
                        <span className="text-[10px] text-text-muted shrink-0">{chatter.team_name.replace('Team ', '')}</span>
                      )}
                      <Plus size={14} className="text-cw shrink-0" />
                    </button>
                  ))}
                  {availableChatters.length === 0 && (
                    <p className="col-span-2 text-sm text-text-muted py-4 text-center">
                      {search ? 'No chatters match your search.' : 'All chatters are assigned to this model.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Select a model to manage assignments</p>
          </div>
        )}
      </div>
    </div>
  );
}

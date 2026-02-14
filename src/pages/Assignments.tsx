import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { TEAM_COLORS } from '../lib/utils';
import { Plus, X, Search } from 'lucide-react';
import type { Model, Chatter, ModelChatterAssignment } from '../types';

export default function Assignments() {
  const { profile } = useAuthStore();
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [assignments, setAssignments] = useState<ModelChatterAssignment[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [loading, setLoading] = useState(true);

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
    if (!selectedModel && mods.length > 0) setSelectedModel(mods[0]!);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const assignedChattersForModel = (modelId: string) =>
    assignments.filter((a) => a.model_id === modelId).map((a) => ({
      assignment: a,
      chatter: chatters.find((c) => c.id === a.chatter_id),
    }));

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
  };

  const handleUnassign = async (assignmentId: string) => {
    await supabase.from('model_chatter_assignments').delete().eq('id', assignmentId);
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  };

  const teams = [...new Set(chatters.map((c) => c.team_name).filter(Boolean))];

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Live: 'bg-success/15 text-success',
      'On Hold': 'bg-warning/15 text-warning',
      Dead: 'bg-danger/15 text-danger',
    };
    return colors[status] ?? 'bg-surface-3 text-text-secondary';
  };

  const getChatterTeamColor = (chatter?: Chatter) => {
    if (!chatter?.team_name) return 'bg-surface-3 text-text-secondary border-border';
    return TEAM_COLORS[chatter.team_name] ?? 'bg-cw/15 text-cw border-cw/30';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Model-Chatter Assignments</h1>
        <div className="flex items-center gap-3">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t} value={t!}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Models List */}
        <div className="w-72 shrink-0">
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-white">Models</h3>
            </div>
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
              {models.map((model) => {
                const assignedCount = assignments.filter((a) => a.model_id === model.id).length;
                return (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors ${
                      selectedModel?.id === model.id ? 'bg-cw/10 border-l-2 border-l-cw' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center text-cw text-xs font-medium shrink-0">
                      {model.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{model.name}</p>
                      <p className="text-[11px] text-text-muted">{assignedCount} chatters</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge(model.status)}`}>
                      {model.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Assignment Panel */}
        {selectedModel && (
          <div className="flex-1">
            <div className="bg-surface-1 border border-border rounded-xl p-6">
              {/* Model Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-xl bg-cw/15 flex items-center justify-center text-cw text-xl font-bold">
                  {selectedModel.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedModel.name}</h2>
                  <span className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full ${statusBadge(selectedModel.status)}`}>
                    {selectedModel.status}
                  </span>
                </div>
              </div>

              {/* Assigned Chatters */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Assigned Chatters ({assignedChattersForModel(selectedModel.id).length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {assignedChattersForModel(selectedModel.id).length === 0 ? (
                    <p className="text-sm text-text-muted">No chatters assigned yet.</p>
                  ) : (
                    assignedChattersForModel(selectedModel.id).map(({ assignment, chatter }) => (
                      <div
                        key={assignment.id}
                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${getChatterTeamColor(chatter)}`}
                      >
                        <span>{chatter?.full_name ?? 'Unknown'}</span>
                        {chatter?.team_name && (
                          <span className="text-[10px] opacity-60">({chatter.team_name})</span>
                        )}
                        <button
                          onClick={() => handleUnassign(assignment.id)}
                          className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger"
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
                  <h3 className="text-sm font-semibold text-white">Available Chatters</h3>
                  <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search chatters..."
                      className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {availableChatters.map((chatter) => (
                    <button
                      key={chatter.id}
                      onClick={() => handleAssign(chatter.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-left transition-colors"
                    >
                      <span className="text-sm text-white flex-1 truncate">{chatter.full_name}</span>
                      {chatter.team_name && (
                        <span className="text-[10px] text-text-muted shrink-0">{chatter.team_name}</span>
                      )}
                      <Plus size={14} className="text-cw shrink-0" />
                    </button>
                  ))}
                  {availableChatters.length === 0 && (
                    <p className="col-span-2 text-sm text-text-muted py-4 text-center">
                      {search ? 'No chatters match your search.' : 'All chatters are assigned.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, BookOpen, Users, DollarSign, TrendingUp,
  ExternalLink, X, Monitor, Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { cn, formatCurrency, STATUS_COLORS } from '../lib/utils';
import { useTrafficData } from '../hooks/useTrafficData';
import ModelAvatar from '../components/ModelAvatar';
import { PageTypeBadge } from '../components/TrafficBadge';
import type { Model, Chatter, ModelChatterAssignment } from '../types';

export default function ModelInfo() {
  const { profile } = useAuthStore();
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [assignments, setAssignments] = useState<ModelChatterAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Live');
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const { modelTraffic, getModelTraffic } = useTrafficData();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [modelsRes, chattersRes, assignRes] = await Promise.all([
      supabase.from('models').select('*').order('name'),
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter'),
      supabase.from('model_chatter_assignments').select('*').eq('active', true),
    ]);
    setModels((modelsRes.data as Model[]) ?? []);
    setChatters((chattersRes.data as Chatter[]) ?? []);
    setAssignments((assignRes.data as ModelChatterAssignment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statuses = useMemo(() =>
    [...new Set(models.map(m => m.status))].sort(),
    [models]
  );

  const filtered = useMemo(() => {
    let result = models;
    if (statusFilter !== 'all') result = result.filter(m => m.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.niche?.some(n => n.toLowerCase().includes(q)) ||
        m.client_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [models, statusFilter, search]);

  const getAssignedChatters = (modelId: string) => {
    const ids = assignments.filter(a => a.model_id === modelId).map(a => a.chatter_id);
    return chatters.filter(c => ids.includes(c.id));
  };

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-56px)] lg:h-screen flex flex-col">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-extrabold text-text-primary">Model Info</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          {filtered.length} models · Profiles, chatters, revenue, and scripts
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name, niche, or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-surface-1 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cw/50"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              statusFilter === 'all' ? 'bg-cw/15 text-cw border-cw/30' : 'bg-surface-1 text-text-secondary border-border hover:border-text-muted'
            )}
          >
            All ({models.length})
          </button>
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                statusFilter === s
                  ? (STATUS_COLORS[s] || 'bg-cw/15 text-cw') + ' border-transparent'
                  : 'bg-surface-1 text-text-secondary border-border hover:border-text-muted'
              )}
            >
              {s} ({models.filter(m => m.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Model List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="bg-surface-1 border border-border rounded-xl p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-3" />
                    <div className="flex-1">
                      <div className="h-4 bg-surface-3 rounded w-24" />
                      <div className="h-3 bg-surface-3 rounded w-16 mt-1.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-surface-1 border border-border rounded-xl p-12 text-center">
              <BookOpen size={32} className="mx-auto text-text-muted mb-3" />
              <p className="text-text-muted text-sm">
                {search ? 'No models match your search' : 'No models available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {filtered.map((model) => {
                const traffic = getModelTraffic(model.id);
                const chatterCount = assignments.filter(a => a.model_id === model.id).length;
                const isSelected = selectedModel?.id === model.id;

                return (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model)}
                    className={cn(
                      'bg-surface-1 border rounded-xl p-4 text-left transition-all',
                      isSelected ? 'border-cw/50 ring-1 ring-cw/20' : 'border-border hover:border-border-light'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-text-primary text-sm truncate">{model.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                            STATUS_COLORS[model.status] || 'bg-surface-3 text-text-muted'
                          )}>
                            {model.status}
                          </span>
                          <PageTypeBadge pageType={model.page_type as any} size="sm" />
                        </div>
                      </div>
                    </div>

                    {/* Quick stats row */}
                    <div className="flex items-center gap-3 text-[10px] text-text-muted">
                      <span className="flex items-center gap-1">
                        <Users size={10} />
                        {chatterCount} chatters
                      </span>
                      {traffic && traffic.earnings_per_day > 0 && (
                        <span className="flex items-center gap-1 text-success">
                          <DollarSign size={10} />
                          {formatCurrency(traffic.earnings_per_day)}/d
                        </span>
                      )}
                      {traffic && traffic.new_fans_avg > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp size={10} />
                          {Math.round(traffic.new_fans_avg)} fans/d
                        </span>
                      )}
                    </div>

                    {/* Niche tags */}
                    {model.niche?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {model.niche.slice(0, 3).map(n => (
                          <span key={n} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">
                            {n}
                          </span>
                        ))}
                        {model.niche.length > 3 && (
                          <span className="text-[9px] text-text-muted">+{model.niche.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedModel && (
          <div className="hidden lg:block w-96 shrink-0 bg-surface-1 border border-border rounded-xl overflow-y-auto">
            <ModelDetailPanel
              model={selectedModel}
              traffic={getModelTraffic(selectedModel.id)}
              chatters={getAssignedChatters(selectedModel.id)}
              onClose={() => setSelectedModel(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile detail panel */}
      {selectedModel && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedModel(null)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-surface-1 border-l border-border overflow-y-auto">
            <ModelDetailPanel
              model={selectedModel}
              traffic={getModelTraffic(selectedModel.id)}
              chatters={getAssignedChatters(selectedModel.id)}
              onClose={() => setSelectedModel(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ModelDetailPanel({ model, traffic, chatters, onClose }: {
  model: Model;
  traffic: ReturnType<ReturnType<typeof useTrafficData>['getModelTraffic']>;
  chatters: Chatter[];
  onClose: () => void;
}) {
  return (
    <div>
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="lg" />
            <div>
              <h2 className="text-lg font-extrabold text-text-primary">{model.name}</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {model.client_name || 'No client'} · {model.page_type || 'Unknown type'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted">
            <X size={16} />
          </button>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            STATUS_COLORS[model.status] || 'bg-surface-3 text-text-muted'
          )}>
            {model.status}
          </span>
          <PageTypeBadge pageType={model.page_type as any} size="sm" />
          {model.chatbot_active && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">
              Chatbot ON
            </span>
          )}
        </div>
      </div>

      {/* Revenue & Traffic */}
      {traffic && (
        <div className="p-5 border-b border-border">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Revenue & Traffic</h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Revenue/day" value={traffic.earnings_per_day > 0 ? formatCurrency(traffic.earnings_per_day) : '—'} color={traffic.earnings_per_day > 0 ? 'text-success' : ''} />
            <Stat label="Tips/day" value={traffic.tips_per_day > 0 ? formatCurrency(traffic.tips_per_day) : '—'} />
            <Stat label="New fans/day" value={traffic.new_fans_avg > 0 ? String(Math.round(traffic.new_fans_avg)) : '—'} />
            <Stat label="Active fans" value={traffic.active_fans > 0 ? String(traffic.active_fans) : '—'} />
            <Stat label="Renew rate" value={traffic.renew_pct > 0 ? `${traffic.renew_pct.toFixed(1)}%` : '—'} />
            <Stat label="Avg $/spender" value={traffic.avg_spend_per_spender > 0 ? formatCurrency(traffic.avg_spend_per_spender) : '—'} />
          </div>
        </div>
      )}

      {/* Assigned Chatters */}
      <div className="p-5 border-b border-border">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
          Assigned Chatters ({chatters.length})
        </h3>
        {chatters.length === 0 ? (
          <p className="text-xs text-text-muted py-2">No chatters assigned</p>
        ) : (
          <div className="space-y-1.5">
            {chatters.map(c => {
              const dotColor = c.team_name?.includes('Huckle') ? 'bg-orange-400'
                : c.team_name?.includes('Danilyn') ? 'bg-blue-400'
                : c.team_name?.includes('Ezekiel') ? 'bg-purple-400'
                : 'bg-zinc-500';

              return (
                <div key={c.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2">
                  <div className={cn('w-2 h-2 rounded-full', dotColor)} />
                  <span className="text-sm text-text-primary font-medium flex-1">{c.full_name}</span>
                  <span className="text-[10px] text-text-muted">{c.team_name?.replace('Team ', '')}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Teams */}
      {model.team_names?.length > 0 && (
        <div className="p-5 border-b border-border">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Teams</h3>
          <div className="flex flex-wrap gap-1.5">
            {model.team_names.map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 text-text-secondary font-medium">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Niche & Details */}
      <div className="p-5 border-b border-border">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Details</h3>
        {model.niche?.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] text-text-muted mb-1.5">Niche</p>
            <div className="flex flex-wrap gap-1">
              {model.niche.map(n => (
                <span key={n} className="text-xs px-2 py-0.5 rounded-md bg-surface-2 text-text-secondary">{n}</span>
              ))}
            </div>
          </div>
        )}
        {model.traffic_sources?.length > 0 && (
          <div>
            <p className="text-[11px] text-text-muted mb-1.5">Traffic Sources</p>
            <div className="flex flex-wrap gap-1">
              {model.traffic_sources.map(s => (
                <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-surface-2 text-text-secondary">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-5">
        {model.scripts_url && (
          <a
            href={model.scripts_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-cw/10 text-cw text-sm font-bold rounded-lg hover:bg-cw/20 transition-colors"
          >
            <BookOpen size={16} />
            View Scripts
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2.5">
      <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-bold mt-0.5', color || 'text-text-primary')}>{value}</p>
    </div>
  );
}

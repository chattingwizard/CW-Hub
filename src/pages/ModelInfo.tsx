import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, BookOpen, Users, DollarSign, TrendingUp, Sparkles, AlertTriangle, CheckCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { cn, formatCurrency, STATUS_COLORS } from '../lib/utils';
import { useTrafficData } from '../hooks/useTrafficData';
import ModelAvatar from '../components/ModelAvatar';
import { PageTypeBadge } from '../components/TrafficBadge';
import ErrorState from '../components/ErrorState';
import type { Model, Chatter, AssignmentGroupModel, AssignmentGroupChatter, AssignmentGroup, ModelChange, ModelProfileView, PageType, ImportantNote } from '../types';

export default function ModelInfo() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const [models, setModels] = useState<Model[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [groupModels, setGroupModels] = useState<AssignmentGroupModel[]>([]);
  const [groupChatters, setGroupChatters] = useState<AssignmentGroupChatter[]>([]);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Live');

  const [profileViews, setProfileViews] = useState<ModelProfileView[]>([]);
  const [recentChanges, setRecentChanges] = useState<ModelChange[]>([]);
  const [importantNotes, setImportantNotes] = useState<ImportantNote[]>([]);

  const { getModelTraffic } = useTrafficData();

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, chattersRes, gmRes, gcRes, groupsRes, viewsRes, changesRes, notesRes] = await Promise.all([
        supabase.from('models').select('*').neq('status', 'Dead').order('name'),
        supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter'),
        supabase.from('assignment_group_models').select('*'),
        supabase.from('assignment_group_chatters').select('*'),
        supabase.from('assignment_groups').select('*').eq('active', true),
        supabase.from('model_profile_views').select('*').eq('user_id', user.id),
        supabase.from('model_changes').select('*').order('changed_at', { ascending: false }).limit(500),
        supabase.from('model_important_notes').select('*').eq('active', true),
      ]);
      const err = modelsRes.error || chattersRes.error || gmRes.error || gcRes.error || groupsRes.error;
      if (err) throw new Error(err.message);
      setModels((modelsRes.data as Model[]) ?? []);
      setChatters((chattersRes.data as Chatter[]) ?? []);
      setGroupModels((gmRes.data as AssignmentGroupModel[]) ?? []);
      setGroupChatters((gcRes.data as AssignmentGroupChatter[]) ?? []);
      setGroups((groupsRes.data as AssignmentGroup[]) ?? []);
      setProfileViews((viewsRes.data as ModelProfileView[]) ?? []);
      setRecentChanges((changesRes.data as ModelChange[]) ?? []);
      setImportantNotes((notesRes.data as ImportantNote[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load model data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statuses = useMemo(() =>
    [...new Set(models.map(m => m.status))].sort(),
    [models],
  );

  const filtered = useMemo(() => {
    let result = models;
    if (statusFilter !== 'all') result = result.filter(m => m.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.niche?.some(n => n.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [models, statusFilter, search]);

  const unseenCountMap = useMemo(() => {
    const map = new Map<string, number>();
    const viewMap = new Map(profileViews.map(v => [v.model_id, v.last_viewed_at]));

    for (const ch of recentChanges) {
      const lastViewed = viewMap.get(ch.model_id);
      if (!lastViewed || new Date(ch.changed_at) > new Date(lastViewed)) {
        map.set(ch.model_id, (map.get(ch.model_id) ?? 0) + 1);
      }
    }

    for (const n of importantNotes) {
      const lastViewed = viewMap.get(n.model_id);
      const noteTime = n.updated_at || n.created_at;
      if (!lastViewed || new Date(noteTime) > new Date(lastViewed)) {
        map.set(n.model_id, (map.get(n.model_id) ?? 0) + 1);
      }
    }

    return map;
  }, [recentChanges, profileViews, importantNotes]);

  const modelsWithNotes = useMemo(() => {
    const set = new Set<string>();
    for (const n of importantNotes) set.add(n.model_id);
    return set;
  }, [importantNotes]);

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aUnseen = unseenCountMap.get(a.id) ?? 0;
      const bUnseen = unseenCountMap.get(b.id) ?? 0;
      if (aUnseen > 0 && bUnseen === 0) return -1;
      if (bUnseen > 0 && aUnseen === 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, unseenCountMap]);

  const getChatterCount = (modelId: string) => {
    const gm = groupModels.find(g => g.model_id === modelId);
    if (!gm) return 0;
    return groupChatters.filter(gc => gc.group_id === gm.group_id).length;
  };

  const totalUnseen = useMemo(() => {
    let count = 0;
    for (const v of unseenCountMap.values()) count += v > 0 ? 1 : 0;
    return count;
  }, [unseenCountMap]);

  const ADMIN_ROLES = new Set(['owner', 'admin']);
  const isAdmin = profile?.role ? ADMIN_ROLES.has(profile.role) : false;

  const [markingAllSeen, setMarkingAllSeen] = useState(false);
  const markAllAsSeen = useCallback(async () => {
    if (!user || totalUnseen === 0) return;
    setMarkingAllSeen(true);
    const now = new Date().toISOString();
    const rows = models.map(m => ({ user_id: user.id, model_id: m.id, last_viewed_at: now }));
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      await supabase.from('model_profile_views').upsert(
        rows.slice(i, i + batchSize),
        { onConflict: 'user_id,model_id' },
      );
    }
    setProfileViews(rows.map(r => ({ ...r, id: r.model_id })) as unknown as ModelProfileView[]);
    setMarkingAllSeen(false);
  }, [user, models, totalUnseen]);

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-52px)] flex flex-col">
      {/* Header */}
      <div className="mb-4 shrink-0 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Model Info</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {filtered.length} models &middot; Click any model for full details
            {totalUnseen > 0 && (
              <span className="ml-2 text-cw font-medium">
                &middot; {totalUnseen} with updates
              </span>
            )}
          </p>
        </div>
        {isAdmin && totalUnseen > 0 && (
          <button
            onClick={markAllAsSeen}
            disabled={markingAllSeen}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-2 border border-border text-text-secondary hover:text-text-primary hover:border-cw/30 transition-colors disabled:opacity-50 shrink-0"
          >
            <CheckCheck size={13} />
            {markingAllSeen ? 'Marking...' : 'Mark all as seen'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name or niche..."
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
              statusFilter === 'all' ? 'bg-cw/15 text-cw border-cw/30' : 'bg-surface-1 text-text-secondary border-border hover:border-text-muted',
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
                  : 'bg-surface-1 text-text-secondary border-border hover:border-text-muted',
              )}
            >
              {s} ({models.filter(m => m.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-surface-1 border border-border rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-3" />
                  <div className="flex-1">
                    <div className="h-4 bg-surface-3 rounded w-28" />
                    <div className="h-3 bg-surface-3 rounded w-20 mt-2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : sortedFiltered.length === 0 ? (
          <div className="bg-surface-1 border border-border rounded-xl p-12 text-center">
            <BookOpen size={32} className="mx-auto text-text-muted mb-3" />
            <p className="text-text-muted text-sm">
              {search ? 'No models match your search' : 'No models available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sortedFiltered.map((model) => {
              const traffic = getModelTraffic(model.id);
              const chatterCount = getChatterCount(model.id);
              const unseenCount = unseenCountMap.get(model.id) ?? 0;

              const hasNotes = modelsWithNotes.has(model.id);

              return (
                <button
                  key={model.id}
                  onClick={() => navigate(`/model-info/${model.id}`)}
                  className={cn(
                    'bg-surface-1 border rounded-xl p-4 text-left transition-all hover:border-cw/30 hover:shadow-lg hover:shadow-cw/5',
                    unseenCount > 0 ? 'border-cw/40 ring-1 ring-cw/10' : 'border-border',
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-text-primary text-sm truncate">{model.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          STATUS_COLORS[model.status] || 'bg-surface-3 text-text-muted',
                        )}>
                          {model.status}
                        </span>
                        <PageTypeBadge pageType={model.page_type as PageType} size="sm" />
                        {hasNotes && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-500/15 text-red-400 flex items-center gap-0.5">
                            <AlertTriangle size={9} />
                            Instructions
                          </span>
                        )}
                        {unseenCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-cw/15 text-cw flex items-center gap-0.5 animate-pulse">
                            <Sparkles size={9} />
                            {unseenCount} new
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick stats row */}
                  <div className="flex items-center gap-3 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {chatterCount}
                    </span>
                    {traffic && traffic.earnings_per_day > 0 && (
                      <span className="flex items-center gap-1 text-success">
                        <DollarSign size={11} />
                        {formatCurrency(traffic.earnings_per_day)}/d
                      </span>
                    )}
                    {traffic && traffic.new_fans_avg > 0 && (
                      <span className="flex items-center gap-1">
                        <TrendingUp size={11} />
                        {Math.round(traffic.new_fans_avg)} fans/d
                      </span>
                    )}
                  </div>

                  {/* Niche tags */}
                  {model.niche?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {model.niche.slice(0, 3).map(n => (
                        <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">
                          {n}
                        </span>
                      ))}
                      {model.niche.length > 3 && (
                        <span className="text-[10px] text-text-muted">+{model.niche.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

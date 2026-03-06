import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, ExternalLink, Users, DollarSign,
  TrendingUp, TrendingDown, Minus, Monitor, Sparkles,
  Globe, User, Heart, Palette, FileText, ShoppingBag, Bell,
  Pencil, Save, X, Loader2, AlertTriangle, Plus, Trash2, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { cn, formatCurrency, STATUS_COLORS } from '../lib/utils';
import { useTrafficData } from '../hooks/useTrafficData';
import ModelAvatar from '../components/ModelAvatar';
import { PageTypeBadge } from '../components/TrafficBadge';
import type {
  Model, Chatter, ModelChange, AssignmentGroupModel,
  AssignmentGroupChatter, AssignmentGroup, PageType, ImportantNote,
} from '../types';

const SECTION_ICONS: Record<string, typeof User> = {
  personality: Palette,
  services: ShoppingBag,
  identity: User,
  physical: Heart,
  branding: Globe,
  content: FileText,
};

const SECTION_LABELS: Record<string, string> = {
  personality: 'Personality & Lifestyle',
  services: 'Services & Pricing',
  identity: 'Identity',
  physical: 'Physical Appearance',
  branding: 'Branding & Social Links',
  content: 'Content',
};

const SECTION_ORDER = ['personality', 'services', 'physical', 'identity', 'branding', 'content'];

const LONG_TEXT_FIELDS = new Set(['Bio', 'Personality', 'Tone', 'Boundaries', 'Notes', 'Price Guide', 'Branding Guideline', 'Likes', 'Dislikes', 'Kinks', 'Content Notes']);

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatFieldName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\./g, ' > ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}

function formatDate(val: string): string {
  const d = new Date(val + 'T00:00:00');
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const DATE_FIELDS = new Set(['Birthday', 'Start Date']);

function renderValue(val: unknown, fieldName?: string): React.ReactNode {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  const str = String(val);
  if (fieldName && DATE_FIELDS.has(fieldName) && /^\d{4}-\d{2}-\d{2}/.test(str)) return formatDate(str);
  const lower = str.toLowerCase();
  if (lower === 'yes') return <span className="text-emerald-400 font-semibold">Yes</span>;
  if (lower === 'no') return <span className="text-red-400 font-semibold">No</span>;
  if (lower.startsWith('yes,') || lower.startsWith('yes ')) return <span className="text-emerald-400 font-semibold">{str}</span>;
  return str;
}

export default function ModelProfile() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();

  const HIDDEN_SECTIONS = new Set(['branding']);
  const EDITOR_ROLES = new Set(['owner', 'admin', 'chatter_manager']);
  const canEdit = profile?.role ? EDITOR_ROLES.has(profile.role) : false;

  const [model, setModel] = useState<Model | null>(null);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [changes, setChanges] = useState<ModelChange[]>([]);
  const [groupModels, setGroupModels] = useState<AssignmentGroupModel[]>([]);
  const [groupChatters, setGroupChatters] = useState<AssignmentGroupChatter[]>([]);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [changesDismissed, setChangesDismissed] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  const [importantNotes, setImportantNotes] = useState<ImportantNote[]>([]);
  const [newNote, setNewNote] = useState('');

  const { getModelTraffic } = useTrafficData();

  const details: Record<string, Record<string, unknown>> = useMemo(() => {
    if (!model?.details) return {};
    if (typeof model.details === 'string') {
      try { return JSON.parse(model.details) as Record<string, Record<string, unknown>>; }
      catch { return {}; }
    }
    return model.details;
  }, [model]);

  const fetchData = useCallback(async () => {
    if (!modelId || !user) return;
    setLoading(true);

    const [modelRes, chattersRes, gmRes, gcRes, groupsRes, viewRes] = await Promise.all([
      supabase.from('models').select('*').eq('id', modelId).single(),
      supabase.from('chatters').select('*').eq('status', 'Active').eq('airtable_role', 'Chatter'),
      supabase.from('assignment_group_models').select('*'),
      supabase.from('assignment_group_chatters').select('*'),
      supabase.from('assignment_groups').select('*').eq('active', true),
      supabase.from('model_profile_views')
        .select('last_viewed_at')
        .eq('user_id', user.id)
        .eq('model_id', modelId)
        .maybeSingle(),
    ]);

    if (modelRes.data) setModel(modelRes.data as Model);
    setChatters((chattersRes.data as Chatter[]) ?? []);
    setGroupModels((gmRes.data as AssignmentGroupModel[]) ?? []);
    setGroupChatters((gcRes.data as AssignmentGroupChatter[]) ?? []);
    setGroups((groupsRes.data as AssignmentGroup[]) ?? []);

    const notesRes = await supabase
      .from('model_important_notes')
      .select('*')
      .eq('model_id', modelId)
      .order('sort_order', { ascending: true });
    setImportantNotes((notesRes.data as ImportantNote[]) ?? []);

    const lastViewed = (viewRes.data as { last_viewed_at: string } | null)?.last_viewed_at;

    // Fetch changes since last visit
    let changesQuery = supabase
      .from('model_changes')
      .select('*')
      .eq('model_id', modelId)
      .order('changed_at', { ascending: false })
      .limit(50);

    if (lastViewed) {
      changesQuery = changesQuery.gt('changed_at', lastViewed);
    }

    const changesRes = await changesQuery;
    setChanges((changesRes.data as ModelChange[]) ?? []);

    // Mark as viewed (upsert)
    await supabase.from('model_profile_views').upsert(
      { user_id: user.id, model_id: modelId, last_viewed_at: new Date().toISOString() },
      { onConflict: 'user_id,model_id' },
    );

    setLoading(false);
  }, [modelId, user]);

  const addImportantNote = useCallback(async () => {
    if (!modelId || !newNote.trim()) return;
    const { data, error } = await supabase
      .from('model_important_notes')
      .insert({ model_id: modelId, note: newNote.trim(), active: true, sort_order: importantNotes.length })
      .select()
      .single();
    if (!error && data) {
      setImportantNotes(prev => [...prev, data as ImportantNote]);
      setNewNote('');
    }
  }, [modelId, newNote, importantNotes.length]);

  const toggleNote = useCallback(async (noteId: string, active: boolean) => {
    await supabase.from('model_important_notes').update({ active, updated_at: new Date().toISOString() }).eq('id', noteId);
    setImportantNotes(prev => prev.map(n => n.id === noteId ? { ...n, active } : n));
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    await supabase.from('model_important_notes').delete().eq('id', noteId);
    setImportantNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEditing = useCallback(() => {
    const draft: Record<string, Record<string, string>> = {};
    for (const [cat, fields] of Object.entries(details)) {
      draft[cat] = {};
      for (const [key, val] of Object.entries(fields)) {
        draft[cat]![key] = val === null || val === undefined ? '' : String(val);
      }
    }
    setEditDraft(draft);
    setEditing(true);
  }, [details]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditDraft({});
  }, []);

  const updateDraft = useCallback((category: string, field: string, value: string) => {
    setEditDraft(prev => ({
      ...prev,
      [category]: { ...prev[category], [field]: value },
    }));
  }, []);

  const saveEdits = useCallback(async () => {
    if (!model || !modelId) return;
    setSaving(true);

    const newDetails: Record<string, Record<string, unknown>> = {};
    const changeLog: { field_name: string; old_value: string | null; new_value: string | null }[] = [];

    for (const [cat, fields] of Object.entries(editDraft)) {
      newDetails[cat] = {};
      for (const [key, newVal] of Object.entries(fields)) {
        const cleanVal = newVal.trim() || null;
        newDetails[cat]![key] = cleanVal;

        const oldVal = details[cat]?.[key];
        const oldStr = oldVal === null || oldVal === undefined ? null : String(oldVal);
        const newStr = cleanVal;
        if (oldStr !== newStr) {
          changeLog.push({
            field_name: `${cat}.${key}`,
            old_value: oldStr,
            new_value: newStr,
          });
        }
      }
    }

    const { error } = await supabase
      .from('models')
      .update({ details: newDetails })
      .eq('id', modelId);

    if (error) {
      console.error('Failed to save:', error);
      setSaving(false);
      return;
    }

    if (changeLog.length > 0) {
      const now = new Date().toISOString();
      await supabase.from('model_changes').insert(
        changeLog.map(ch => ({
          model_id: modelId,
          field_name: ch.field_name,
          old_value: ch.old_value,
          new_value: ch.new_value,
          changed_at: now,
        })),
      );
    }

    setModel(prev => prev ? { ...prev, details: newDetails } : prev);
    setEditing(false);
    setEditDraft({});
    setSaving(false);
  }, [model, modelId, editDraft, details]);

  const assignedChatters = useMemo(() => {
    if (!model) return [];
    const gm = groupModels.find(g => g.model_id === model.id);
    if (!gm) return [];
    const ids = groupChatters.filter(gc => gc.group_id === gm.group_id).map(gc => gc.chatter_id);
    return chatters.filter(c => ids.includes(c.id));
  }, [model, groupModels, groupChatters, chatters]);

  const assignedGroup = useMemo(() => {
    if (!model) return null;
    const gm = groupModels.find(g => g.model_id === model.id);
    if (!gm) return null;
    return groups.find(g => g.id === gm.group_id) ?? null;
  }, [model, groupModels, groups]);

  const traffic = model ? getModelTraffic(model.id) : undefined;

  const detailSections = useMemo(() => {
    return SECTION_ORDER
      .filter(cat => {
        if (HIDDEN_SECTIONS.has(cat)) return false;
        const section = details[cat];
        if (!section) return false;
        return Object.values(section).some(v => v !== null && v !== undefined && v !== '' && v !== '—');
      })
      .map(cat => [cat, details[cat] ?? {}] as [string, Record<string, unknown>]);
  }, [details]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-32 bg-surface-2 rounded" />
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-surface-2" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-48 bg-surface-2 rounded" />
              <div className="h-4 w-32 bg-surface-2 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-surface-1 border border-border rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <p className="text-text-muted">Model not found</p>
        <button onClick={() => navigate('/model-info')} className="text-cw text-sm font-medium hover:underline">
          Back to Model Info
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/model-info')}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm font-medium transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Models
      </button>

      {/* Changes Banner */}
      {changes.length > 0 && !changesDismissed && (
        <div className="relative overflow-hidden rounded-xl border border-cw/30 bg-gradient-to-r from-cw/20 via-cw/10 to-blue-600/20 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(29,155,240,0.15),transparent_70%)]" />
          <div className="relative p-4 lg:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-cw/20 flex items-center justify-center shrink-0">
                  <Sparkles size={18} className="text-cw" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">
                    Profile Updated
                    <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-cw/20 text-cw">
                      {changes.length} {changes.length === 1 ? 'change' : 'changes'}
                    </span>
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Since your last visit
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChangesDismissed(true)}
                className="text-xs text-text-muted hover:text-text-primary transition-colors shrink-0 px-2 py-1 rounded hover:bg-white/5"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
              {changes.map(ch => (
                <div key={ch.id} className="flex items-start gap-2 text-xs bg-white/5 rounded-lg px-3 py-2">
                  <Bell size={12} className="text-cw mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-text-primary">{formatFieldName(ch.field_name)}</span>
                    {ch.old_value && (
                      <span className="text-text-muted ml-1">
                        <span className="line-through opacity-60">{ch.old_value}</span>
                        <span className="mx-1 text-text-muted">&rarr;</span>
                      </span>
                    )}
                    <span className="text-cw font-medium">{ch.new_value ?? 'set'}</span>
                  </div>
                  <span className="text-text-muted shrink-0">{timeAgo(ch.changed_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-surface-1 border border-border rounded-xl p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <ModelAvatar name={model.name} pictureUrl={model.profile_picture_url} size="lg" className="!w-20 !h-20 !text-2xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-text-primary">{model.name}</h1>
            <p className="text-sm text-text-secondary mt-1">
              {model.page_type || 'Unknown type'}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className={cn(
                'text-xs px-2.5 py-1 rounded-full font-semibold',
                STATUS_COLORS[model.status] || 'bg-surface-3 text-text-muted',
              )}>
                {model.status}
              </span>
              <PageTypeBadge pageType={model.page_type as PageType} size="md" />
              {model.chatbot_active && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-400 font-semibold flex items-center gap-1">
                  <Monitor size={12} /> Chatbot ON
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {model.scripts_url && (
              <a
                href={model.scripts_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-cw/10 text-cw text-sm font-bold rounded-lg hover:bg-cw/20 transition-colors"
              >
                <BookOpen size={16} />
                View Scripts
                <ExternalLink size={12} />
              </a>
            )}
            {canEdit && !editing && (
              <button
                onClick={startEditing}
                className="flex items-center gap-2 px-4 py-2.5 bg-surface-2 text-text-secondary text-sm font-bold rounded-lg hover:bg-surface-3 hover:text-text-primary transition-colors"
              >
                <Pencil size={14} />
                Edit
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/15 text-emerald-400 text-sm font-bold rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditing}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 text-red-400 text-sm font-bold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Important Notes — impossible to miss */}
      {(importantNotes.filter(n => n.active).length > 0 || (canEdit && editing)) && (
        <div className="relative rounded-xl border-2 border-red-500/60 bg-gradient-to-br from-red-950/80 via-red-900/40 to-orange-950/60 overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.15)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(239,68,68,0.12),transparent_60%)]" />
          <div className="relative px-5 py-4 bg-red-500/10 border-b border-red-500/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 animate-pulse">
              <AlertTriangle size={22} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-red-300 uppercase tracking-wider">Important Instructions</h2>
              <p className="text-[11px] text-red-400/70 mt-0.5">Read before chatting</p>
            </div>
          </div>
          <div className="relative p-5 space-y-3">
            {importantNotes
              .filter(n => editing || n.active)
              .map(note => (
              <div
                key={note.id}
                className={cn(
                  'flex items-start gap-3 px-4 py-3.5 rounded-lg',
                  note.active ? 'bg-red-500/10 border border-red-500/25' : 'bg-surface-2/50 border border-border opacity-50',
                )}
              >
                <span className={cn('mt-0.5 shrink-0 text-lg', note.active ? 'text-red-400' : 'text-text-muted')}>⚠️</span>
                <p className={cn('text-[15px] font-semibold flex-1 whitespace-pre-line leading-relaxed', note.active ? 'text-white' : 'text-text-muted')}>
                  {note.note}
                </p>
                {canEdit && editing && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleNote(note.id, !note.active)}
                      className={cn(
                        'p-1.5 rounded transition-colors',
                        note.active ? 'text-red-300 hover:bg-red-500/20' : 'text-text-muted hover:bg-white/5',
                      )}
                      title={note.active ? 'Deactivate' : 'Activate'}
                    >
                      {note.active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1.5 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {canEdit && editing && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addImportantNote()}
                  placeholder="Add an important instruction..."
                  className="flex-1 bg-surface-3 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-red-500/50"
                />
                <button
                  onClick={addImportantNote}
                  disabled={!newNote.trim()}
                  className="px-3 py-2 bg-red-500/15 text-red-300 text-sm font-bold rounded-lg hover:bg-red-500/25 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standardized Detail Sections */}
      {detailSections.length > 0 && (
        <div className="space-y-4">
          {detailSections.map(([category, fields]) => {
            const Icon = SECTION_ICONS[category] ?? FileText;
            const label = SECTION_LABELS[category] ?? formatFieldName(category);
            const changedFields = new Set(
              changes
                .filter(ch => ch.field_name.startsWith(`${category}.`))
                .map(ch => ch.field_name.replace(`${category}.`, '')),
            );

            const entries = Object.entries(fields);
            const longFields = entries.filter(([key]) => LONG_TEXT_FIELDS.has(key));
            const shortFields = entries.filter(([key]) => !LONG_TEXT_FIELDS.has(key));

            return (
              <div key={category} className="bg-surface-1 border border-border rounded-xl p-5">
                <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                  <Icon size={16} className="text-cw" />
                  {label}
                  {changedFields.size > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cw/20 text-cw font-medium animate-pulse">
                      {changedFields.size} updated
                    </span>
                  )}
                </h2>

                {/* Long text fields rendered full-width */}
                {longFields.map(([key, val]) => {
                  const isChanged = changedFields.has(key);
                  const displayed = renderValue(val, key);
                  if (!editing && displayed === '—') return null;
                  return (
                    <div
                      key={key}
                      className={cn(
                        'mb-4 py-3 px-4 rounded-lg transition-colors',
                        isChanged && !editing ? 'bg-cw/10 border border-cw/20' : 'bg-surface-2/50',
                      )}
                    >
                      <p className="text-[11px] text-text-muted uppercase tracking-wide flex items-center gap-1 mb-1.5">
                        {key}
                        {isChanged && !editing && <Sparkles size={10} className="text-cw" />}
                      </p>
                      {editing ? (
                        <textarea
                          value={editDraft[category]?.[key] ?? ''}
                          onChange={e => updateDraft(category, key, e.target.value)}
                          rows={4}
                          className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cw/50 resize-y"
                          placeholder={`Enter ${key}...`}
                        />
                      ) : (
                        <p className={cn(
                          'text-sm font-medium whitespace-pre-line break-words leading-relaxed',
                          isChanged ? 'text-cw' : 'text-text-primary',
                        )}>
                          {displayed}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Short fields in grid */}
                {(editing ? shortFields : shortFields.filter(([, v]) => v !== null && v !== undefined && v !== '')).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5">
                    {(editing ? shortFields : shortFields.filter(([, v]) => v !== null && v !== undefined && v !== ''))
                      .map(([key, val]) => {
                      const isChanged = changedFields.has(key);
                      return (
                        <div
                          key={key}
                          className={cn(
                            'py-2 px-3 rounded-lg transition-colors',
                            isChanged && !editing ? 'bg-cw/10 border border-cw/20' : 'bg-surface-2/50',
                          )}
                        >
                          <p className="text-[11px] text-text-muted uppercase tracking-wide flex items-center gap-1">
                            {key}
                            {isChanged && !editing && <Sparkles size={10} className="text-cw" />}
                          </p>
                          {editing ? (
                            <input
                              type="text"
                              value={editDraft[category]?.[key] ?? ''}
                              onChange={e => updateDraft(category, key, e.target.value)}
                              className="w-full mt-0.5 bg-surface-3 border border-border rounded px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cw/50"
                              placeholder="—"
                            />
                          ) : (
                            <p className={cn(
                              'text-sm font-medium mt-0.5 break-words',
                              isChanged ? 'text-cw' : 'text-text-primary',
                            )}>
                              {renderValue(val, key)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Revenue & Traffic Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Revenue/day"
          value={traffic?.earnings_per_day ? formatCurrency(traffic.earnings_per_day) : '—'}
          icon={DollarSign}
          color={traffic?.earnings_per_day ? 'text-success' : undefined}
        />
        <StatCard
          label="Tips/day"
          value={traffic?.tips_per_day ? formatCurrency(traffic.tips_per_day) : '—'}
          icon={DollarSign}
        />
        <StatCard
          label="New fans/day"
          value={traffic?.new_fans_avg ? String(Math.round(traffic.new_fans_avg)) : '—'}
          icon={TrendingUp}
        />
        <StatCard
          label="Active fans"
          value={traffic?.active_fans ? String(traffic.active_fans) : '—'}
          icon={Users}
        />
        <StatCard
          label="Renew rate"
          value={traffic?.renew_pct ? `${traffic.renew_pct.toFixed(1)}%` : '—'}
          icon={traffic?.earnings_trend_pct && traffic.earnings_trend_pct > 0 ? TrendingUp : traffic?.earnings_trend_pct && traffic.earnings_trend_pct < 0 ? TrendingDown : Minus}
        />
        <StatCard
          label="Avg $/spender"
          value={traffic?.avg_spend_per_spender ? formatCurrency(traffic.avg_spend_per_spender) : '—'}
          icon={DollarSign}
        />
      </div>

      {/* Assigned Chatters + Overview — at the bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Users size={16} className="text-cw" />
              Assigned Chatters ({assignedChatters.length})
            </h2>
            {assignedGroup && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cw/15 text-cw font-medium">
                {assignedGroup.name}
              </span>
            )}
          </div>
          {assignedChatters.length === 0 ? (
            <p className="text-xs text-text-muted py-4 text-center">No chatters assigned</p>
          ) : (
            <div className="space-y-1.5">
              {assignedChatters.map(c => {
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

        <div className="bg-surface-1 border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
            <FileText size={16} className="text-cw" />
            Overview
          </h2>
          <div className="space-y-3">
            <InfoRow label="Page Type" value={model.page_type ?? '—'} />
            <InfoRow label="Chatbot" value={model.chatbot_active ? 'Active' : 'Inactive'} />
            {model.niche?.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1.5">Niche</p>
                <div className="flex flex-wrap gap-1">
                  {model.niche.map(n => (
                    <span key={n} className="text-xs px-2 py-0.5 rounded-md bg-surface-2 text-text-secondary">{n}</span>
                  ))}
                </div>
              </div>
            )}
            {model.traffic_sources?.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1.5">Traffic Sources</p>
                <div className="flex flex-wrap gap-1">
                  {model.traffic_sources.map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-surface-2 text-text-secondary">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {model.team_names?.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1.5">Teams</p>
                <div className="flex flex-wrap gap-1">
                  {model.team_names.map(t => (
                    <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 text-text-secondary font-medium">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Last synced */}
      <p className="text-[10px] text-text-muted text-center pb-4">
        Last synced: {model.synced_at ? new Date(model.synced_at).toLocaleString() : 'Unknown'}
      </p>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color?: string;
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-text-muted" />
        <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn('text-lg font-bold', color || 'text-text-primary')}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-sm text-text-primary font-medium">{value}</span>
    </div>
  );
}

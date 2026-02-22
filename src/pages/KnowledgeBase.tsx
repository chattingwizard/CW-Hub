import { useState, useEffect, useCallback, useMemo, type ComponentPropsWithoutRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Document, DocCategory, UserRole } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search, Plus, X, Edit3, Save, Trash2, Eye, EyeOff,
  Building2, Users, ClipboardList, GraduationCap, Shield, BookOpen,
  ChevronRight, FileText, ArrowLeft,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<DocCategory, { label: string; icon: typeof Building2; color: string }> = {
  company:       { label: 'Company',        icon: Building2,     color: 'text-cw' },
  role_overview:  { label: 'Role Overviews', icon: Users,         color: 'text-purple-400' },
  workflow:      { label: 'Workflows',      icon: ClipboardList, color: 'text-green-400' },
  training:      { label: 'Training',       icon: GraduationCap, color: 'text-yellow-400' },
  policy:        { label: 'Policies',       icon: Shield,        color: 'text-red-400' },
  guide:         { label: 'Guides',         icon: BookOpen,      color: 'text-blue-400' },
};

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner', admin: 'Admin', chatter_manager: 'Chatter Manager',
  team_leader: 'Team Leader', script_manager: 'Script Manager',
  va: 'VA', personal_assistant: 'PA', chatter: 'Chatter', recruit: 'Recruit',
};

const ALL_ROLES: UserRole[] = ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'va', 'personal_assistant', 'chatter', 'recruit'];

// ── Content pre-processing (Notion plain text → Markdown) ───

function normalizeContent(raw: string): string {
  return raw
    .replace(/^• /gm, '- ')
    .replace(/^  • /gm, '  - ')
    .replace(/^☐ /gm, '- [ ] ')
    .replace(/^✅ /gm, '- [x] ')
    .replace(/^▸ /gm, '**')
    .replace(/^> /gm, '> ')
    .replace(/^---$/gm, '\n---\n');
}

// ── Markdown styled components ───────────────────────────────

const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-2xl font-extrabold text-white mt-8 mb-4 pb-2 border-b border-border first:mt-0" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="text-xl font-bold text-white mt-7 mb-3 flex items-center gap-2" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-base font-bold text-cw mt-5 mb-2" {...props} />
  ),
  h4: (props: ComponentPropsWithoutRef<'h4'>) => (
    <h4 className="text-sm font-bold text-text-secondary mt-4 mb-2 uppercase tracking-wider" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="text-sm text-text-secondary leading-relaxed mb-3" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="space-y-1.5 mb-4 ml-1" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="space-y-1.5 mb-4 ml-1 list-decimal list-inside" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => (
    <li className="text-sm text-text-secondary leading-relaxed flex items-start gap-2">
      <span className="text-cw mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-cw/60" />
      <span {...props} />
    </li>
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-white" {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<'em'>) => (
    <em className="text-cw/80 not-italic font-medium" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="border-l-3 border-cw/50 bg-cw/5 rounded-r-lg pl-4 pr-3 py-3 my-4 text-sm text-text-secondary italic" {...props} />
  ),
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'> & { className?: string }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <pre className="bg-surface-2 border border-border rounded-xl p-4 my-4 overflow-x-auto">
          <code className="text-xs font-mono text-green-400 leading-relaxed" {...props}>{children}</code>
        </pre>
      );
    }
    return <code className="px-1.5 py-0.5 bg-cw/10 text-cw text-xs font-mono rounded" {...props}>{children}</code>;
  },
  hr: () => <hr className="border-border my-6" />,
  a: (props: ComponentPropsWithoutRef<'a'>) => (
    <a className="text-cw hover:text-cw/80 underline underline-offset-2" target="_blank" rel="noopener" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<'thead'>) => (
    <thead className="bg-surface-2" {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th className="text-left text-xs font-semibold text-white px-4 py-2.5 border-b border-border" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td className="text-xs text-text-secondary px-4 py-2 border-b border-border/50" {...props} />
  ),
  tr: (props: ComponentPropsWithoutRef<'tr'>) => (
    <tr className="hover:bg-surface-2/50 transition-colors" {...props} />
  ),
  img: (props: ComponentPropsWithoutRef<'img'>) => (
    <img className="rounded-xl border border-border max-w-full my-4" {...props} />
  ),
};

// ── Component ────────────────────────────────────────────────

export default function KnowledgeBase() {
  const { profile } = useAuthStore();
  const isEditor = profile && ['owner', 'admin', 'chatter_manager'].includes(profile.role);

  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<DocCategory | 'all'>('all');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // ── Fetch ────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('*, author:profiles!documents_author_id_fkey(id, full_name)')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    if (data) {
      let filtered = data as Document[];
      if (profile && !isEditor) {
        filtered = filtered.filter(d =>
          d.target_roles.length === 0 || d.target_roles.includes(profile.role)
        );
      }
      setDocs(filtered);
    }
    setLoading(false);
  }, [profile, isEditor]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Derived ──────────────────────────────────────────────

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length };
    for (const d of docs) {
      counts[d.category] = (counts[d.category] || 0) + 1;
    }
    return counts;
  }, [docs]);

  const filteredDocs = useMemo(() => {
    let result = docs;
    if (selectedCategory !== 'all') {
      result = result.filter(d => d.category === selectedCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [docs, selectedCategory, search]);

  // ── Actions ──────────────────────────────────────────────

  async function deleteDoc(docId: string) {
    if (!confirm('Delete this document?')) return;
    await supabase.from('documents').delete().eq('id', docId);
    setDocs(prev => prev.filter(d => d.id !== docId));
    setSelectedDoc(null);
  }

  async function togglePublish(doc: Document) {
    const newVal = !doc.is_published;
    await supabase.from('documents').update({ is_published: newVal }).eq('id', doc.id);
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_published: newVal } : d));
    if (selectedDoc?.id === doc.id) setSelectedDoc({ ...doc, is_published: newVal });
  }

  // ── Create Modal ─────────────────────────────────────────

  function CreateModal() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState<DocCategory>('guide');
    const [icon, setIcon] = useState('📄');
    const [targetRoles, setTargetRoles] = useState<UserRole[]>([]);
    const [saving, setSaving] = useState(false);

    function toggleRole(role: UserRole) {
      setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    }

    async function handleCreate() {
      if (!title.trim() || !profile) return;
      setSaving(true);
      const { data } = await supabase.from('documents').insert({
        title: title.trim(),
        content: content,
        category,
        icon,
        target_roles: targetRoles,
        author_id: profile.id,
      }).select('*, author:profiles!documents_author_id_fkey(id, full_name)').single();

      if (data) {
        setDocs(prev => [...prev, data as Document]);
        setShowCreate(false);
        setSelectedDoc(data as Document);
      }
      setSaving(false);
    }

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]" onClick={() => setShowCreate(false)}>
        <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-base font-bold text-white">New Document</h2>
            <button onClick={() => setShowCreate(false)} className="text-text-muted hover:text-white"><X size={18} /></button>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2}
                className="w-12 h-12 bg-surface-2 border border-border rounded-xl text-center text-2xl outline-none" />
              <input autoFocus placeholder="Document title..." value={title} onChange={e => setTitle(e.target.value)}
                className="flex-1 bg-transparent text-white text-lg font-semibold placeholder:text-text-muted outline-none" />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as DocCategory)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white outline-none">
                {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-text-muted mb-2 block">Visible to (empty = everyone)</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map(role => (
                  <button key={role} onClick={() => toggleRole(role)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      targetRoles.includes(role) ? 'bg-cw/20 border-cw/50 text-cw' : 'border-border text-text-muted hover:text-white'
                    }`}>
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>

            <textarea placeholder="Start writing..." value={content} onChange={e => setContent(e.target.value)}
              rows={8} className="w-full bg-surface-2 border border-border rounded-lg p-3 text-sm text-text-secondary placeholder:text-text-muted outline-none resize-none focus:border-cw/50" />
          </div>

          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-white">Cancel</button>
            <button onClick={handleCreate} disabled={!title.trim() || saving}
              className="px-4 py-2 text-sm font-medium bg-cw text-white rounded-lg hover:bg-cw/90 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Document'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Doc Viewer / Editor ──────────────────────────────────

  function DocViewer({ doc }: { doc: Document }) {
    const [editTitle, setEditTitle] = useState(doc.title);
    const [editContent, setEditContent] = useState(doc.content);
    const cc = CATEGORY_CONFIG[doc.category];
    const CatIcon = cc.icon;

    async function handleSave() {
      await supabase.from('documents').update({
        title: editTitle,
        content: editContent,
      }).eq('id', doc.id);
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: editTitle, content: editContent } : d));
      setSelectedDoc({ ...doc, title: editTitle, content: editContent });
      setEditing(false);
    }

    return (
      <div className="flex flex-col h-full">
        {/* Doc header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button onClick={() => { setSelectedDoc(null); setEditing(false); }}
              className="mt-1 text-text-muted hover:text-white lg:hidden">
              <ArrowLeft size={18} />
            </button>
            <span className="text-3xl">{doc.icon}</span>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="text-lg font-bold text-white bg-transparent outline-none border-b border-cw/50 w-full" />
              ) : (
                <h2 className="text-lg font-bold text-white">{doc.title}</h2>
              )}
              <div className="flex items-center gap-2 mt-1">
                <CatIcon size={12} className={cc.color} />
                <span className={`text-xs ${cc.color}`}>{cc.label}</span>
                {!doc.is_published && <span className="text-xs px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 rounded">Draft</span>}
                <span className="text-xs text-text-muted">by {(doc.author as any)?.full_name}</span>
              </div>
              {doc.target_roles.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {doc.target_roles.map(r => (
                    <span key={r} className="text-xs px-1.5 py-0.5 bg-surface-3 text-text-muted rounded">{ROLE_LABELS[r as UserRole] || r}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isEditor && (
            <div className="flex items-center gap-1.5">
              {editing ? (
                <>
                  <button onClick={handleSave} className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg" title="Save"><Save size={16} /></button>
                  <button onClick={() => { setEditing(false); setEditTitle(doc.title); setEditContent(doc.content); }}
                    className="p-2 text-text-muted hover:bg-surface-3 rounded-lg" title="Cancel"><X size={16} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditing(true)} className="p-2 text-text-muted hover:bg-surface-3 rounded-lg" title="Edit"><Edit3 size={16} /></button>
                  <button onClick={() => togglePublish(doc)} className="p-2 text-text-muted hover:bg-surface-3 rounded-lg"
                    title={doc.is_published ? 'Unpublish' : 'Publish'}>
                    {doc.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button onClick={() => deleteDoc(doc.id)} className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:px-10">
          {editing ? (
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              className="w-full h-full min-h-[400px] bg-surface-2 border border-border rounded-xl p-4 text-sm text-text-secondary leading-relaxed outline-none resize-none focus:border-cw/50 font-mono"
              placeholder="Write your content here (Markdown supported)..." />
          ) : (
            <div className="max-w-3xl">
              {doc.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {normalizeContent(doc.content)}
                </ReactMarkdown>
              ) : (
                <p className="text-text-muted italic">No content yet. Click Edit to start writing.</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main Render ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-100px)] overflow-hidden">
      {/* Sidebar */}
      <div className={`w-64 shrink-0 border-r border-border flex flex-col ${selectedDoc ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-extrabold text-white">Knowledge Base</h1>
            {isEditor && (
              <button onClick={() => setShowCreate(true)} className="p-1.5 text-cw hover:bg-cw/10 rounded-lg" title="New document">
                <Plus size={18} />
              </button>
            )}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search docs..."
              className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-text-muted outline-none focus:border-cw/50" />
          </div>
        </div>

        {/* Categories */}
        <div className="px-3 space-y-0.5">
          <button
            onClick={() => { setSelectedCategory('all'); setSelectedDoc(null); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
              selectedCategory === 'all' ? 'bg-cw/10 text-cw' : 'text-text-secondary hover:bg-surface-2 hover:text-white'
            }`}>
            <span className="font-medium">All Documents</span>
            <span className="text-text-muted">{categoryCounts.all || 0}</span>
          </button>

          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            const count = categoryCounts[key] || 0;
            return (
              <button key={key}
                onClick={() => { setSelectedCategory(key as DocCategory); setSelectedDoc(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedCategory === key ? 'bg-cw/10 text-cw' : 'text-text-secondary hover:bg-surface-2 hover:text-white'
                }`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className={selectedCategory === key ? 'text-cw' : config.color} />
                  <span className="font-medium">{config.label}</span>
                </div>
                <span className="text-text-muted">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto mt-4 px-3 pb-4 space-y-1">
          {filteredDocs.map(doc => {
            const cc = CATEGORY_CONFIG[doc.category];
            return (
              <button key={doc.id}
                onClick={() => { setSelectedDoc(doc); setEditing(false); }}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  selectedDoc?.id === doc.id ? 'bg-surface-3 border border-border' : 'hover:bg-surface-2'
                }`}>
                <span className="text-base mt-0.5">{doc.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${selectedDoc?.id === doc.id ? 'text-white' : 'text-text-secondary'}`}>{doc.title}</p>
                  <p className={`text-xs mt-0.5 ${cc.color} opacity-70`}>{cc.label}</p>
                </div>
                {!doc.is_published && <span className="text-xs text-yellow-400/50 mt-0.5">Draft</span>}
              </button>
            );
          })}
          {filteredDocs.length === 0 && (
            <div className="text-center py-8">
              <FileText size={24} className="mx-auto text-text-muted/50 mb-2" />
              <p className="text-xs text-text-muted">No documents found</p>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className={`flex-1 ${!selectedDoc ? 'hidden lg:flex' : 'flex'} flex-col`}>
        {selectedDoc ? (
          <DocViewer doc={selectedDoc} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
            <BookOpen size={48} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">Select a document to view</p>
            <p className="text-xs mt-1">Or create a new one to get started</p>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && <CreateModal />}
    </div>
  );
}

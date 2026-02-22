import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Document, DocCategory, UserRole } from '../types';
import { Search, Shield, Check, X, Filter } from 'lucide-react';

const ALL_ROLES: UserRole[] = ['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'va', 'personal_assistant', 'chatter', 'recruit'];

const ROLE_SHORT: Record<UserRole, string> = {
  owner: 'OWN', admin: 'ADM', chatter_manager: 'CHM', team_leader: 'TL',
  script_manager: 'SM', va: 'VA', personal_assistant: 'PA', chatter: 'CHT', recruit: 'REC',
};

const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-cw', admin: 'bg-purple-500', chatter_manager: 'bg-blue-500', team_leader: 'bg-orange-500',
  script_manager: 'bg-pink-500', va: 'bg-indigo-500', personal_assistant: 'bg-teal-500',
  chatter: 'bg-green-500', recruit: 'bg-yellow-500',
};

const CAT_LABELS: Record<DocCategory, string> = {
  company: 'Company', role_overview: 'Role Overviews', workflow: 'Workflows',
  training: 'Training', policy: 'Policies', guide: 'Guides',
};

export default function DocPermissions() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, title, category, target_roles, icon, is_published')
      .order('category')
      .order('title');
    if (data) setDocs(data as Document[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const filtered = useMemo(() => {
    let result = docs;
    if (catFilter !== 'all') result = result.filter(d => d.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d => d.title.toLowerCase().includes(q));
    }
    return result;
  }, [docs, catFilter, search]);

  const categories = useMemo(() => {
    const cats = new Set(docs.map(d => d.category));
    return ['all', ...Array.from(cats).sort()];
  }, [docs]);

  async function toggleRole(docId: string, role: UserRole) {
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;

    setSaving(docId);
    const current = doc.target_roles || [];
    let newRoles: string[];

    if (current.length === 0) {
      newRoles = ALL_ROLES.filter(r => r !== role);
    } else if (current.includes(role)) {
      newRoles = current.filter(r => r !== role);
      if (newRoles.length === 0) newRoles = [];
    } else {
      newRoles = [...current, role];
      if (newRoles.length === ALL_ROLES.length) newRoles = [];
    }

    await supabase.from('documents').update({ target_roles: newRoles }).eq('id', docId);
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, target_roles: newRoles } : d));
    setSaving(null);
  }

  function setAllOpen(docId: string) {
    setSaving(docId);
    supabase.from('documents').update({ target_roles: [] }).eq('id', docId).then(() => {
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, target_roles: [] } : d));
      setSaving(null);
    });
  }

  function setRestricted(docId: string, roles: string[]) {
    setSaving(docId);
    supabase.from('documents').update({ target_roles: roles }).eq('id', docId).then(() => {
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, target_roles: roles } : d));
      setSaving(null);
    });
  }

  function isRoleActive(doc: Document, role: UserRole): boolean {
    if (!doc.target_roles || doc.target_roles.length === 0) return true;
    return doc.target_roles.includes(role);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Shield size={20} className="text-cw" /> Document Permissions
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Control which roles can see each document. Empty = visible to everyone.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-text-muted outline-none focus:border-cw/50" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-white outline-none">
          <option value="all">All Categories</option>
          {categories.filter(c => c !== 'all').map(c => (
            <option key={c} value={c}>{CAT_LABELS[c as DocCategory] || c}</option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-cw/20 border border-cw/40 flex items-center justify-center"><Check size={10} className="text-cw" /></span>
          Can view
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-surface-2 border border-border flex items-center justify-center"><X size={10} className="text-text-muted/30" /></span>
          No access
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded text-xs">ALL</span>
          Visible to everyone
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="text-left text-xs font-semibold text-text-muted px-4 py-3 min-w-[280px] sticky left-0 bg-surface-2 z-10">
                Document
              </th>
              {ALL_ROLES.map(role => (
                <th key={role} className="text-center px-1 py-3 min-w-[50px]">
                  <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${ROLE_COLORS[role]}/20`}>
                    <span className={`text-xs font-bold ${ROLE_COLORS[role].replace('bg-', 'text-')}`}>
                      {ROLE_SHORT[role]}
                    </span>
                  </div>
                </th>
              ))}
              <th className="text-center px-3 py-3 min-w-[60px]">
                <span className="text-xs text-text-muted">Quick</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((doc, i) => {
              const isOpen = !doc.target_roles || doc.target_roles.length === 0;
              const prevCat = i > 0 ? filtered[i - 1].category : null;
              const showCatHeader = doc.category !== prevCat;

              return [
                showCatHeader && (
                  <tr key={`cat-${doc.category}`}>
                    <td colSpan={ALL_ROLES.length + 2} className="bg-surface-1 px-4 py-2">
                      <span className="text-xs font-bold text-cw uppercase tracking-wider">
                        {CAT_LABELS[doc.category as DocCategory] || doc.category}
                      </span>
                    </td>
                  </tr>
                ),
                <tr key={doc.id} className={`border-b border-border/30 hover:bg-surface-2/50 transition-colors ${saving === doc.id ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5 sticky left-0 bg-surface-1 z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{doc.icon}</span>
                      <span className="text-xs font-medium text-white truncate max-w-[220px]" title={doc.title}>{doc.title}</span>
                      {isOpen && <span className="px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded text-xs shrink-0">ALL</span>}
                    </div>
                  </td>
                  {ALL_ROLES.map(role => {
                    const active = isRoleActive(doc, role);
                    return (
                      <td key={role} className="text-center px-1 py-2.5">
                        <button
                          onClick={() => toggleRole(doc.id, role)}
                          disabled={saving === doc.id}
                          className={`w-7 h-7 rounded-md border transition-all ${
                            active
                              ? 'bg-cw/15 border-cw/40 hover:bg-cw/25'
                              : 'bg-surface-2 border-border/50 hover:border-border'
                          }`}
                        >
                          {active ? (
                            <Check size={12} className="text-cw mx-auto" />
                          ) : (
                            <X size={10} className="text-text-muted/20 mx-auto" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-2.5">
                    {isOpen ? (
                      <button onClick={() => setRestricted(doc.id, ['owner'])}
                        className="text-xs text-text-muted hover:text-yellow-400 transition-colors" title="Restrict to owner only">
                        🔒
                      </button>
                    ) : (
                      <button onClick={() => setAllOpen(doc.id)}
                        className="text-xs text-text-muted hover:text-green-400 transition-colors" title="Make visible to all">
                        🌍
                      </button>
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <p className="text-sm">No documents match your search</p>
        </div>
      )}
    </div>
  );
}

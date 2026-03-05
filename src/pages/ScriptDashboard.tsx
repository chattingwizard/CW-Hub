import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Model } from '../types';
import { Search, Filter, Loader2, FileText, Download, ExternalLink } from 'lucide-react';
import ErrorState from '../components/ErrorState';

const PAGE_FILTERS = ['All', 'Free Page', 'Paid Page'] as const;
const TRAFFIC_FILTERS = ['All Traffic', 'Reddit', 'IG/TikTok', 'Dating Apps', 'Twitter/X', 'Social Media', 'OFTV'] as const;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function ScriptDashboard() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pageFilter, setPageFilter] = useState<string>('All');
  const [trafficFilter, setTrafficFilter] = useState<string>('All Traffic');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('models')
        .select('*')
        .eq('status', 'Live')
        .order('name');
      if (err) { setError(err.message); setLoading(false); return; }
      setModels((data ?? []) as Model[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return models.filter(m => {
      const q = search.toLowerCase();
      if (q && !m.name.toLowerCase().includes(q) && !m.niche.some(n => n.toLowerCase().includes(q))) return false;
      if (pageFilter !== 'All' && m.page_type !== pageFilter) return false;
      if (trafficFilter !== 'All Traffic') {
        const tf = trafficFilter.toLowerCase();
        if (!m.traffic_sources.some(t => t.toLowerCase().includes(tf))) return false;
      }
      return true;
    });
  }, [models, search, pageFilter, trafficFilter]);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary">Scripts</h1>
        <p className="text-text-secondary text-sm mt-1">
          Model guides, journey scripts, and objection handling — {models.length} models
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or niche..."
            className="w-full bg-surface-1 border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-text-muted focus:border-cw/40 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {PAGE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setPageFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                pageFilter === f
                  ? 'bg-cw text-white'
                  : 'bg-surface-1 text-text-secondary hover:bg-surface-2'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Traffic filters */}
      <div className="flex gap-1.5 overflow-x-auto">
        <Filter size={13} className="text-text-muted mt-1.5 shrink-0" />
        {TRAFFIC_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setTrafficFilter(f)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
              trafficFilter === f
                ? 'bg-surface-3 text-white'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-cw" size={24} />
        </div>
      ) : error ? (
        <ErrorState message={error} />
      ) : filtered.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl p-12 text-center">
          <FileText size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">No models match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(model => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model }: { model: Model }) {
  const slug = slugify(model.name);
  const initials = model.name.slice(0, 2).toUpperCase();

  return (
    <Link
      to={`/scripts/${model.id}`}
      className="group bg-surface-1 border border-border rounded-xl overflow-hidden hover:border-cw/30 hover:shadow-lg hover:shadow-cw/5 transition-all"
    >
      {/* Photo */}
      <div className="aspect-[4/3] bg-surface-2 relative overflow-hidden">
        {model.profile_picture_url ? (
          <img src={model.profile_picture_url} alt={model.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-extrabold text-text-muted/30">{initials}</span>
          </div>
        )}
        {model.page_type && (
          <span className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${
            model.page_type === 'Free Page' ? 'bg-emerald-500/80 text-white' : 'bg-cw/80 text-white'
          }`}>
            {model.page_type === 'Free Page' ? 'FREE' : 'PAID'}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-bold text-white group-hover:text-cw transition-colors truncate">{model.name}</h3>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {model.traffic_sources.slice(0, 2).map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">{t}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}

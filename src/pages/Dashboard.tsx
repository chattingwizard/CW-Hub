import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { formatCurrency, formatNumber } from '../lib/utils';
import { BarChart3, Users, TrendingUp, DollarSign, Upload, X, ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react';
import Papa from 'papaparse';
import type { Model, ModelMetric, ModelMetricCSVRow } from '../types';

interface AggMetrics {
  totalRevenue: number;
  activeModels: number;
  totalNewSubs: number;
  totalTips: number;
}

export default function Dashboard() {
  const { profile } = useAuthStore();
  const [models, setModels] = useState<Model[]>([]);
  const [metrics, setMetrics] = useState<(ModelMetric & { model?: Model })[]>([]);
  const [agg, setAgg] = useState<AggMetrics>({ totalRevenue: 0, activeModels: 0, totalNewSubs: 0, totalTips: 0 });
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'revenue' | 'name' | 'subs'>('revenue');
  const [uploading, setUploading] = useState(false);

  const getWeekStart = (offset: number) => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
    d.setDate(diff);
    return d.toISOString().split('T')[0]!;
  };

  const weekStart = getWeekStart(weekOffset);
  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0]!;
  })();

  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00');
    const e = new Date(weekEnd + 'T00:00:00');
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  })();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [modelsRes, metricsRes] = await Promise.all([
      supabase.from('models').select('*').order('name'),
      supabase.from('model_metrics').select('*, model:models(*)').eq('week_start', weekStart),
    ]);

    const mods = (modelsRes.data ?? []) as Model[];
    const mets = (metricsRes.data ?? []) as (ModelMetric & { model?: Model })[];

    setModels(mods);
    setMetrics(mets);

    const activeCount = mods.filter((m) => m.status === 'Live').length;
    const totals = mets.reduce(
      (acc, m) => ({
        totalRevenue: acc.totalRevenue + (m.total_revenue || 0),
        totalNewSubs: acc.totalNewSubs + (m.new_subs || 0),
        totalTips: acc.totalTips + (m.tips || 0),
      }),
      { totalRevenue: 0, totalNewSubs: 0, totalTips: 0 }
    );

    setAgg({ ...totals, activeModels: activeCount });
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // CSV Upload
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    Papa.parse<ModelMetricCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          if (!rows.length) throw new Error('CSV is empty');

          const required = ['model_name', 'date', 'revenue'];
          const headers = Object.keys(rows[0]!);
          const missing = required.filter((r) => !headers.includes(r));
          if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);

          const { data: allModels } = await supabase.from('models').select('id, name');
          const modelMap = new Map((allModels ?? []).map((m: any) => [m.name.toLowerCase().trim(), m.id]));

          let matchedCount = 0;
          let unmatchedNames: string[] = [];

          const toInsert = rows
            .map((row) => {
              const modelId = modelMap.get(row.model_name?.toLowerCase().trim());
              if (!modelId) {
                if (row.model_name && !unmatchedNames.includes(row.model_name)) {
                  unmatchedNames.push(row.model_name);
                }
                return null;
              }
              matchedCount++;

              const date = new Date(row.date + 'T00:00:00');
              const day = date.getDay();
              const mondayOffset = day === 0 ? -6 : 1 - day;
              const monday = new Date(date);
              monday.setDate(date.getDate() + mondayOffset);
              const sunday = new Date(monday);
              sunday.setDate(monday.getDate() + 6);

              return {
                model_id: modelId,
                week_start: monday.toISOString().split('T')[0],
                week_end: sunday.toISOString().split('T')[0],
                total_revenue: parseFloat(row.revenue) || 0,
                new_subs: parseInt(row.new_subs) || 0,
                messages_revenue: parseFloat(row.messages_revenue) || 0,
                tips: parseFloat(row.tips) || 0,
                refunds: parseFloat(row.refunds) || 0,
              };
            })
            .filter(Boolean);

          if (!toInsert.length) throw new Error('No valid rows found. Check model names match exactly.');

          const { error } = await supabase
            .from('model_metrics')
            .upsert(toInsert as any[], { onConflict: 'model_id,week_start' });

          if (error) throw error;

          await supabase.from('csv_uploads').insert({
            uploaded_by: profile!.id,
            file_name: file.name,
            row_count: toInsert.length,
            upload_type: 'model_metrics',
          });

          let msg = `Uploaded ${matchedCount} rows successfully.`;
          if (unmatchedNames.length > 0) {
            msg += ` ${unmatchedNames.length} models not found: ${unmatchedNames.slice(0, 3).join(', ')}${unmatchedNames.length > 3 ? '...' : ''}`;
          }

          setUploadStatus({ type: 'success', message: msg });
          setShowUpload(false);
          fetchData();
        } catch (err: any) {
          setUploadStatus({ type: 'error', message: err.message || 'Upload failed' });
        } finally {
          setUploading(false);
        }
      },
      error: (err) => {
        setUploadStatus({ type: 'error', message: err.message });
        setUploading(false);
      },
    });

    e.target.value = '';
  };

  // Build and sort table data
  const tableData = models
    .filter((m) => statusFilter === 'all' || m.status === statusFilter)
    .map((model) => {
      const metric = metrics.find((m) => m.model_id === model.id);
      return { model, metric };
    })
    .sort((a, b) => {
      if (sortBy === 'revenue') return (b.metric?.total_revenue ?? 0) - (a.metric?.total_revenue ?? 0);
      if (sortBy === 'subs') return (b.metric?.new_subs ?? 0) - (a.metric?.new_subs ?? 0);
      return a.model.name.localeCompare(b.model.name);
    });

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Live: 'bg-success/15 text-success border-success/30',
      'On Hold': 'bg-warning/15 text-warning border-warning/30',
      Dead: 'bg-danger/15 text-danger border-danger/30',
      'Pending Invoice': 'bg-cw/15 text-cw border-cw/30',
    };
    return colors[status] ?? 'bg-surface-3 text-text-secondary border-border';
  };

  const handleDownloadTemplate = () => {
    const csv = 'model_name,date,revenue,new_subs,messages_revenue,tips,refunds\nExample Model,2026-02-14,1500,25,800,200,50';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cw_hub_metrics_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const statuses = [...new Set(models.map((m) => m.status))];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Performance</h1>
          <p className="text-sm text-text-secondary mt-1">
            {models.filter((m) => m.status === 'Live').length} live models &middot; {metrics.length} with data this week
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium"
          >
            <Upload size={16} />
            Upload CSV
          </button>
          <div className="flex items-center gap-2 bg-surface-1 border border-border rounded-lg px-3 py-1.5">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="p-0.5 hover:text-cw text-text-secondary">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-white min-w-[180px] text-center">{weekLabel}</span>
            <button
              onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
              disabled={weekOffset >= 0}
              className="p-0.5 hover:text-cw text-text-secondary disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Upload status toast */}
      {uploadStatus && (
        <div
          className={`mb-4 flex items-center justify-between px-4 py-3 rounded-lg border ${
            uploadStatus.type === 'success'
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          <span className="text-sm">{uploadStatus.message}</span>
          <button onClick={() => setUploadStatus(null)} className="shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {[
          { label: 'Total Revenue', value: formatCurrency(agg.totalRevenue), icon: DollarSign, color: 'text-cw', bgColor: 'bg-cw/10' },
          { label: 'Active Models', value: String(agg.activeModels), icon: Users, color: 'text-success', bgColor: 'bg-success/10' },
          { label: 'New Subs', value: formatNumber(agg.totalNewSubs), icon: TrendingUp, color: 'text-cw-light', bgColor: 'bg-cw-light/10' },
          { label: 'Total Tips', value: formatCurrency(agg.totalTips), icon: BarChart3, color: 'text-warning', bgColor: 'bg-warning/10' },
        ].map((card) => (
          <div key={card.label} className="bg-surface-1 border border-border rounded-xl p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs lg:text-sm text-text-secondary">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                <card.icon size={16} className={card.color} />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-white">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      {/* Table controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:border-cw focus:outline-none"
          >
            <option value="all">All Status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:border-cw focus:outline-none"
          >
            <option value="revenue">Sort by Revenue</option>
            <option value="name">Sort by Name</option>
            <option value="subs">Sort by Subs</option>
          </select>
        </div>
        <span className="text-xs text-text-muted">{tableData.length} models</span>
      </div>

      {/* Models Table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Model Name', 'Status', 'Revenue', 'New Subs', 'Tips', 'Refunds', 'Traffic'].map((h) => (
                  <th key={h} className="text-left px-4 lg:px-5 py-3.5 text-text-secondary font-medium text-xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-secondary">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
                      Loading models...
                    </div>
                  </td>
                </tr>
              ) : tableData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-secondary">
                    No models found. Upload a CSV or sync from Airtable.
                  </td>
                </tr>
              ) : (
                tableData.map(({ model, metric }, idx) => (
                  <tr key={model.id} className={`border-b border-border/50 hover:bg-surface-2/50 ${idx === 0 && metric ? 'bg-cw/5' : ''}`}>
                    <td className="px-4 lg:px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center text-cw text-xs font-medium shrink-0">
                          {model.name.charAt(0)}
                        </div>
                        <div>
                          <span className="text-white font-medium">{model.name}</span>
                          {model.team_names.length > 0 && (
                            <p className="text-[10px] text-text-muted">{model.team_names.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] border ${statusBadge(model.status)}`}>
                        {model.status}
                      </span>
                    </td>
                    <td className="px-4 lg:px-5 py-3.5 text-white font-medium">{metric ? formatCurrency(metric.total_revenue) : '—'}</td>
                    <td className="px-4 lg:px-5 py-3.5 text-text-secondary">{metric?.new_subs ?? '—'}</td>
                    <td className="px-4 lg:px-5 py-3.5 text-text-secondary">{metric ? formatCurrency(metric.tips) : '—'}</td>
                    <td className="px-4 lg:px-5 py-3.5 text-text-secondary">{metric ? formatCurrency(metric.refunds) : '—'}</td>
                    <td className="px-4 lg:px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {model.traffic_sources.length > 0 ? (
                          model.traffic_sources.slice(0, 3).map((src) => (
                            <span key={src} className="text-[10px] px-1.5 py-0.5 rounded-full bg-cw/10 text-cw border border-cw/20">
                              {src}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-muted text-[10px]">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !uploading && setShowUpload(false)}>
          <div className="bg-surface-1 border border-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Upload Model Metrics</h2>
              <button onClick={() => !uploading && setShowUpload(false)} className="text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-text-secondary mb-4">
              Upload a CSV file with model performance data. Model names must match exactly.
            </p>

            <div className="bg-surface-2 border border-border rounded-lg p-4 mb-4">
              <p className="text-xs text-text-muted mb-2 font-medium">Required columns:</p>
              <code className="text-xs text-cw">model_name, date, revenue</code>
              <p className="text-xs text-text-muted mt-2">Optional columns:</p>
              <code className="text-xs text-text-secondary">new_subs, messages_revenue, tips, refunds</code>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 mt-3 text-xs text-cw hover:text-cw-light"
              >
                <Download size={12} />
                Download template CSV
              </button>
            </div>

            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              uploading
                ? 'border-cw/50 bg-cw/5'
                : 'border-border hover:border-cw/50 hover:bg-cw/5'
            }`}>
              {uploading ? (
                <>
                  <div className="w-6 h-6 border-2 border-cw/30 border-t-cw rounded-full animate-spin mb-2" />
                  <span className="text-sm text-cw">Processing...</span>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-text-muted mb-2" />
                  <span className="text-sm text-text-secondary">Click to select CSV file</span>
                  <span className="text-[10px] text-text-muted mt-1">.csv files only</span>
                </>
              )}
              <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

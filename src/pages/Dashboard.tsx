import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { formatCurrency, formatNumber } from '../lib/utils';
import { BarChart3, Users, TrendingUp, AlertTriangle, Upload, X, ChevronLeft, ChevronRight } from 'lucide-react';
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

  // Current week
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

    Papa.parse<ModelMetricCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          if (!rows.length) throw new Error('CSV is empty');

          // Validate columns
          const required = ['model_name', 'date', 'revenue'];
          const headers = Object.keys(rows[0]!);
          const missing = required.filter((r) => !headers.includes(r));
          if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);

          // Match model names to IDs
          const { data: allModels } = await supabase.from('models').select('id, name');
          const modelMap = new Map((allModels ?? []).map((m: any) => [m.name.toLowerCase(), m.id]));

          const toInsert = rows
            .map((row) => {
              const modelId = modelMap.get(row.model_name?.toLowerCase());
              if (!modelId) return null;

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

          if (!toInsert.length) throw new Error('No valid rows found. Check model names match.');

          const { error } = await supabase
            .from('model_metrics')
            .upsert(toInsert as any[], { onConflict: 'model_id,week_start' });

          if (error) throw error;

          // Log the upload
          await supabase.from('csv_uploads').insert({
            uploaded_by: profile!.id,
            file_name: file.name,
            row_count: toInsert.length,
            upload_type: 'model_metrics',
          });

          setUploadStatus({ type: 'success', message: `Uploaded ${toInsert.length} rows successfully.` });
          setShowUpload(false);
          fetchData();
        } catch (err: any) {
          setUploadStatus({ type: 'error', message: err.message || 'Upload failed' });
        }
      },
      error: (err) => {
        setUploadStatus({ type: 'error', message: err.message });
      },
    });

    e.target.value = '';
  };

  // Build table data: models with their metrics
  const tableData = models.map((model) => {
    const metric = metrics.find((m) => m.model_id === model.id);
    return { model, metric };
  }).sort((a, b) => (b.metric?.total_revenue ?? 0) - (a.metric?.total_revenue ?? 0));

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Live: 'bg-success/15 text-success border-success/30',
      'On Hold': 'bg-warning/15 text-warning border-warning/30',
      Dead: 'bg-danger/15 text-danger border-danger/30',
      'Pending Invoice': 'bg-cw/15 text-cw border-cw/30',
    };
    return colors[status] ?? 'bg-surface-3 text-text-secondary';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Model Performance</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 border border-cw/30 text-cw rounded-lg hover:bg-cw/10 text-sm"
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
          <button onClick={() => setUploadStatus(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Revenue', value: formatCurrency(agg.totalRevenue), icon: BarChart3, color: 'text-cw' },
          { label: 'Active Models', value: String(agg.activeModels), icon: Users, color: 'text-success' },
          { label: 'New Subs', value: formatNumber(agg.totalNewSubs), icon: TrendingUp, color: 'text-cw-light' },
          { label: 'Total Tips', value: formatCurrency(agg.totalTips), icon: AlertTriangle, color: 'text-warning' },
        ].map((card) => (
          <div key={card.label} className="bg-surface-1 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-secondary">{card.label}</span>
              <card.icon size={18} className={card.color} />
            </div>
            <p className="text-2xl font-bold text-white">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      {/* Models Table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Model Name', 'Status', 'Revenue', 'New Subs', 'Tips', 'Refunds', 'Traffic'].map((h) => (
                  <th key={h} className="text-left px-5 py-3.5 text-text-secondary font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-secondary">
                    Loading...
                  </td>
                </tr>
              ) : tableData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-secondary">
                    No models found. Sync data from Airtable or upload a CSV.
                  </td>
                </tr>
              ) : (
                tableData.map(({ model, metric }) => (
                  <tr key={model.id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center text-cw text-xs font-medium shrink-0">
                          {model.name.charAt(0)}
                        </div>
                        <span className="text-white font-medium">{model.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${statusBadge(model.status)}`}>
                        {model.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-white">{metric ? formatCurrency(metric.total_revenue) : '—'}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{metric?.new_subs ?? '—'}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{metric ? formatCurrency(metric.tips) : '—'}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{metric ? formatCurrency(metric.refunds) : '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {model.traffic_sources.slice(0, 3).map((src) => (
                          <span key={src} className="text-[11px] px-2 py-0.5 rounded-full bg-cw/10 text-cw border border-cw/20">
                            {src}
                          </span>
                        ))}
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-surface-1 border border-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Upload Model Metrics CSV</h2>
              <button onClick={() => setShowUpload(false)} className="text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-text-secondary mb-4">
              Upload a CSV file exported from Infloww with model performance data.
            </p>

            <div className="bg-surface-2 border border-border rounded-lg p-4 mb-4">
              <p className="text-xs text-text-muted mb-2 font-medium">Required columns:</p>
              <code className="text-xs text-cw">model_name, date, revenue</code>
              <p className="text-xs text-text-muted mt-2">Optional columns:</p>
              <code className="text-xs text-text-secondary">new_subs, messages_revenue, tips, refunds</code>
            </div>

            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-cw/50 hover:bg-cw/5 transition-colors">
              <Upload size={24} className="text-text-muted mb-2" />
              <span className="text-sm text-text-secondary">Click to select CSV file</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

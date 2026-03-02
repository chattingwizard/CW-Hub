import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import {
  FileSpreadsheet, Users, BarChart3, Upload,
  CheckCircle, Clock, ChevronDown, ChevronUp,
  ArrowUpDown, Calendar, ArrowUp, ArrowDown,
  Trash2, Loader2,
} from 'lucide-react';
import CreatorReportUpload from '../components/CreatorReportUpload';
import EmployeeReportUpload from '../components/EmployeeReportUpload';

interface CsvUpload {
  id: string;
  uploaded_by: string;
  file_name: string;
  row_count: number;
  upload_type: string;
  uploaded_at: string;
  report_date: string | null;
  uploader?: { full_name: string | null };
}

type SortField = 'uploaded_at' | 'report_date';
type SortDir = 'desc' | 'asc';

const UPLOAD_TYPES = [
  {
    id: 'creator_report' as const,
    title: 'Creator Report',
    description: 'Infloww Creator Reports (.xlsx) — model revenue, fans, traffic, OF ranking',
    icon: FileSpreadsheet,
    format: '.xlsx',
    frequency: 'Daily',
    source: 'Infloww → Creator Statistics → Export',
    color: 'text-cw',
    bgColor: 'bg-cw/10',
  },
  {
    id: 'employee_report' as const,
    title: 'Employee Report',
    description: 'Inflow Employee Reports (.csv/.xlsx) — chatter KPIs, sales, CVR, messages',
    icon: Users,
    format: '.csv / .xlsx',
    frequency: 'Daily',
    source: 'Inflow → Employee Statistics → Export',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
] as const;

export default function UploadCenter() {
  const { profile } = useAuthStore();
  const [activeUpload, setActiveUpload] = useState<string | null>(null);
  const [uploads, setUploads] = useState<CsvUpload[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sortField, setSortField] = useState<SortField>('uploaded_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);

    const [uploadsRes, creatorDatesRes, employeeDatesRes] = await Promise.all([
      supabase
        .from('csv_uploads')
        .select('*, uploader:profiles!csv_uploads_uploaded_by_fkey(full_name)')
        .order('uploaded_at', { ascending: false })
        .limit(50),
      supabase.from('model_daily_stats').select('date'),
      supabase.from('chatter_daily_stats').select('date'),
    ]);

    const raw = (uploadsRes.data ?? []) as CsvUpload[];

    // Count rows per date in each stats table
    const countByDate = (rows: { date: string }[]) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        map.set(r.date, (map.get(r.date) ?? 0) + 1);
      }
      return Array.from(map.entries()).map(([date, cnt]) => ({ date, cnt }));
    };

    const creatorDateCounts = countByDate((creatorDatesRes.data ?? []) as { date: string }[]);
    const employeeDateCounts = countByDate((employeeDatesRes.data ?? []) as { date: string }[]);

    const enriched = raw.map(u => {
      if (u.report_date) return u;

      const dateCounts = u.upload_type === 'creator_report' ? creatorDateCounts
        : u.upload_type === 'employee_report' ? employeeDateCounts
        : [];

      const candidates = dateCounts.filter(dc => dc.cnt === u.row_count);
      if (candidates.length === 1) {
        return { ...u, report_date: candidates[0]!.date };
      }
      if (candidates.length > 1) {
        const uploadTs = new Date(u.uploaded_at).getTime();
        candidates.sort((a, b) => {
          const diffA = Math.abs(uploadTs - new Date(a.date + 'T12:00:00Z').getTime());
          const diffB = Math.abs(uploadTs - new Date(b.date + 'T12:00:00Z').getTime());
          return diffA - diffB;
        });
        return { ...u, report_date: candidates[0]!.date };
      }

      // Fallback: parse from filename (DDMMYY pattern)
      const digits = u.file_name.replace(/[^0-9]/g, '');
      if (digits.length >= 6) {
        const dd = digits.slice(0, 2);
        const mm = digits.slice(2, 4);
        const yy = digits.slice(4, 6);
        const year = parseInt(yy) + 2000;
        const parsed = new Date(year, parseInt(mm) - 1, parseInt(dd));
        if (!isNaN(parsed.getTime())) {
          return { ...u, report_date: `${year}-${mm}-${dd}` };
        }
      }

      return u;
    });

    setUploads(enriched);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleUploadComplete = () => {
    setActiveUpload(null);
    fetchHistory();
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (upload: CsvUpload) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      if (upload.report_date) {
        if (upload.upload_type === 'creator_report') {
          const { error } = await supabase.from('model_daily_stats').delete().eq('date', upload.report_date);
          if (error) throw new Error(`Failed to delete stats data: ${error.message}`);
        } else if (upload.upload_type === 'employee_report') {
          const { error } = await supabase.from('chatter_daily_stats').delete().eq('date', upload.report_date);
          if (error) throw new Error(`Failed to delete stats data: ${error.message}`);
        }
      }
      const { error } = await supabase.from('csv_uploads').delete().eq('id', upload.id);
      if (error) throw new Error(`Failed to delete upload record: ${error.message}`);
      setConfirmDeleteId(null);
      fetchHistory();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    setDeleteError(null);
    try {
      const { error: e1 } = await supabase.from('chatter_daily_stats').delete().gte('date', '1900-01-01');
      if (e1) throw new Error(`chatter_daily_stats: ${e1.message}`);
      const { error: e2 } = await supabase.from('model_daily_stats').delete().gte('date', '1900-01-01');
      if (e2) throw new Error(`model_daily_stats: ${e2.message}`);
      const { error: e3 } = await supabase.from('csv_uploads').delete().gte('uploaded_at', '1900-01-01');
      if (e3) throw new Error(`csv_uploads: ${e3.message}`);
      setConfirmClearAll(false);
      fetchHistory();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Clear failed');
      setConfirmClearAll(false);
    } finally {
      setClearing(false);
    }
  };

  const creatorUploads = useMemo(() =>
    uploads.filter(u => u.upload_type === 'creator_report'),
  [uploads]);

  const employeeUploads = useMemo(() =>
    uploads.filter(u => u.upload_type === 'employee_report'),
  [uploads]);

  const sortUploads = useCallback((list: CsvUpload[]) => {
    return [...list].sort((a, b) => {
      let valA: string, valB: string;
      if (sortField === 'report_date') {
        valA = a.report_date || '0000-00-00';
        valB = b.report_date || '0000-00-00';
      } else {
        valA = a.uploaded_at;
        valB = b.uploaded_at;
      }
      const cmp = valA.localeCompare(valB);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [sortField, sortDir]);

  const sortedCreator = useMemo(() => sortUploads(creatorUploads), [sortUploads, creatorUploads]);
  const sortedEmployee = useMemo(() => sortUploads(employeeUploads), [sortUploads, employeeUploads]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const renderSortButton = (field: SortField, label: string) => {
    const isActive = sortField === field;
    return (
      <button
        key={field}
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
          isActive
            ? 'bg-cw/10 text-cw font-semibold'
            : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
        }`}
      >
        {isActive ? (
          sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />
        ) : (
          <ArrowUpDown size={12} />
        )}
        {label}
      </button>
    );
  };

  const renderUploadTable = (items: CsvUpload[], emptyLabel: string) => {
    if (items.length === 0) {
      return (
        <div className="py-8 text-center">
          <Upload size={20} className="text-text-muted mx-auto mb-2 opacity-50" />
          <p className="text-text-muted text-xs">{emptyLabel}</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs text-text-muted font-medium">File</th>
              <th className="text-left px-4 py-2.5 text-xs text-text-muted font-medium">Rows</th>
              <th className="text-left px-4 py-2.5 text-xs text-text-muted font-medium">Report Date</th>
              <th className="text-left px-4 py-2.5 text-xs text-text-muted font-medium">Uploaded</th>
              <th className="text-left px-4 py-2.5 text-xs text-text-muted font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => {
              const isConfirming = confirmDeleteId === u.id;
              return (
                <tr key={u.id} className="border-b border-border/50 hover:bg-surface-2/30 group">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-primary font-medium truncate max-w-[180px]">
                        {u.file_name}
                      </span>
                      {isConfirming ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={deleting}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-50"
                          >
                            {deleting ? <Loader2 size={10} className="animate-spin" /> : 'Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deleting}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted hover:bg-surface-2"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(u.id)}
                          className="p-0.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger transition-colors shrink-0"
                          title="Delete upload and its data"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-text-secondary">{u.row_count}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.report_date ? (
                      <span className="text-text-secondary text-xs flex items-center gap-1.5">
                        <Calendar size={12} className="text-text-muted" />
                        {formatDate(u.report_date + 'T00:00:00')}
                      </span>
                    ) : (
                      <span className="text-text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-text-muted text-xs"
                      title={new Date(u.uploaded_at).toLocaleString()}
                    >
                      {formatTimeAgo(u.uploaded_at)}
                    </span>
                    <span className="text-text-muted text-[10px] block">
                      {formatDate(u.uploaded_at)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-text-secondary text-xs">
                      {u.uploader?.full_name ?? 'Unknown'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-text-primary">Upload Center</h1>
        <p className="text-text-secondary text-sm mt-1">
          Upload daily reports. Data syncs automatically to all dashboards.
        </p>
      </div>

      {/* Upload Cards */}
      <div className="grid gap-3 mb-8">
        {UPLOAD_TYPES.map((type) => {
          const isActive = activeUpload === type.id;

          return (
            <div
              key={type.id}
              className={`bg-surface-1 border rounded-xl overflow-hidden transition-all ${
                isActive ? 'border-cw/40' : 'border-border hover:border-border-light'
              }`}
            >
              <div
                className="flex items-center gap-4 p-5 cursor-pointer"
                onClick={() => setActiveUpload(isActive ? null : type.id)}
              >
                <div className={`w-11 h-11 rounded-xl ${type.bgColor} flex items-center justify-center shrink-0`}>
                  <type.icon size={22} className={type.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-text-primary">{type.title}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-text-muted font-semibold">
                      {type.frequency}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5">{type.description}</p>
                  <p className="text-[11px] text-text-muted mt-1">
                    Source: {type.source} · Format: {type.format}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {!isActive && (
                    <div className="w-10 h-10 rounded-xl border border-dashed border-border-light flex items-center justify-center hover:border-cw/40 hover:bg-cw/5">
                      <Upload size={16} className="text-text-muted" />
                    </div>
                  )}
                  {isActive ? (
                    <ChevronUp size={16} className="text-text-muted" />
                  ) : (
                    <ChevronDown size={16} className="text-text-muted" />
                  )}
                </div>
              </div>

              {isActive && (
                <div className="px-5 pb-5 border-t border-border pt-4">
                  {type.id === 'creator_report' && (
                    <CreatorReportUpload onUploadComplete={handleUploadComplete} />
                  )}
                  {type.id === 'employee_report' && (
                    <EmployeeReportUpload onUploadComplete={handleUploadComplete} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-text-muted" />
          <h2 className="text-lg font-bold text-text-primary">Recent Uploads</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted mr-1">Sort by</span>
          {renderSortButton('uploaded_at', 'Upload date')}
          {renderSortButton('report_date', 'Report date')}
          <div className="w-px h-4 bg-border mx-1" />
          {confirmClearAll ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-danger">Delete ALL data?</span>
              <button
                onClick={handleClearAll}
                disabled={clearing}
                className="text-[10px] px-2 py-1 rounded bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-50 font-medium"
              >
                {clearing ? <Loader2 size={10} className="animate-spin" /> : 'Yes, clear everything'}
              </button>
              <button
                onClick={() => setConfirmClearAll(false)}
                disabled={clearing}
                className="text-[10px] px-2 py-1 rounded bg-surface-3 text-text-muted hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={10} />
              Clear all
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 flex items-start gap-2">
          <span className="text-danger text-sm">{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-auto text-danger/60 hover:text-danger text-xs shrink-0">dismiss</button>
        </div>
      )}

      {loadingHistory ? (
        <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
            Loading history...
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Creator Reports Section */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-7 h-7 rounded-lg bg-cw/10 flex items-center justify-center">
                <FileSpreadsheet size={14} className="text-cw" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Creator Reports</h3>
              <span className="text-[10px] text-text-muted ml-auto">
                {creatorUploads.length} {creatorUploads.length === 1 ? 'upload' : 'uploads'}
              </span>
            </div>
            {renderUploadTable(sortedCreator, 'No Creator Reports uploaded yet')}
          </div>

          {/* Employee Reports Section */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
                <Users size={14} className="text-success" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Employee Reports</h3>
              <span className="text-[10px] text-text-muted ml-auto">
                {employeeUploads.length} {employeeUploads.length === 1 ? 'upload' : 'uploads'}
              </span>
            </div>
            {renderUploadTable(sortedEmployee, 'No Employee Reports uploaded yet')}
          </div>
        </div>
      )}
    </div>
  );
}

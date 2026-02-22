import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import {
  FileSpreadsheet, Users, BarChart3, Upload,
  CheckCircle, Clock, ChevronDown, ChevronUp, X,
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
  uploader?: { full_name: string | null };
}

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

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('csv_uploads')
      .select('*, uploader:profiles!csv_uploads_uploaded_by_fkey(full_name)')
      .order('uploaded_at', { ascending: false })
      .limit(25);

    setUploads((data ?? []) as CsvUpload[]);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleUploadComplete = () => {
    setActiveUpload(null);
    fetchHistory();
  };

  const getTypeLabel = (type: string) => {
    const t = UPLOAD_TYPES.find(u => u.id === type);
    return t?.title ?? type;
  };

  const getTypeIcon = (type: string) => {
    if (type === 'creator_report') return <FileSpreadsheet size={14} className="text-cw" />;
    if (type === 'employee_report') return <Users size={14} className="text-success" />;
    return <BarChart3 size={14} className="text-text-muted" />;
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

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
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
              {/* Header */}
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

              {/* Expanded Upload Area */}
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

      {/* Upload History */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-text-muted" />
          <h2 className="text-lg font-bold text-text-primary">Recent Uploads</h2>
          <span className="text-xs text-text-muted ml-auto">{uploads.length} records</span>
        </div>

        {loadingHistory ? (
          <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-text-secondary">
              <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
              Loading history...
            </div>
          </div>
        ) : uploads.length === 0 ? (
          <div className="bg-surface-1 border border-border rounded-xl p-8 text-center">
            <Upload size={24} className="text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No uploads yet. Start by uploading a report above.</p>
          </div>
        ) : (
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">File</th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">Rows</th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">Uploaded by</th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-surface-2/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(u.upload_type)}
                        <span className="text-text-secondary text-xs font-medium">{getTypeLabel(u.upload_type)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-primary font-medium truncate max-w-[200px] block">{u.file_name}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-secondary">{u.row_count}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-secondary">
                        {u.uploader?.full_name ?? 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-text-muted text-xs" title={new Date(u.uploaded_at).toLocaleString()}>
                        {formatTimeAgo(u.uploaded_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

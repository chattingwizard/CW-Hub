import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { readSpreadsheet } from '../lib/spreadsheet';

interface UploadResult {
  type: 'success' | 'error';
  message: string;
  details?: string[];
}

const COLUMN_MAP: Record<string, string> = {
  'employee': 'employee_name',
  'employees': 'employee_name',
  'group': 'team_from_report',
  'team': 'team_from_report',
  'creators': 'creators',
  'creator': 'creators',
  'sales': 'sales',
  'ppv sales': 'ppv_sales',
  'tips': 'tips',
  'dm sales': 'dm_sales',
  'mass message sales': 'mass_msg_sales',
  'of mass message sales': 'of_mass_msg_sales',
  'messages sent': 'messages_sent',
  'ppvs sent': 'ppvs_sent',
  'ppvs unlocked': 'ppvs_unlocked',
  'character count': 'character_count',
  'golden ratio': 'golden_ratio',
  'unlock rate': 'unlock_rate',
  'fan cvr': 'fan_cvr',
  'fans chatted': 'fans_chatted',
  'fans who spent': 'fans_who_spent',
  'average earnings per spender': 'avg_earnings_per_spender',
  'avg earnings per spender': 'avg_earnings_per_spender',
  'response time (scheduled)': 'response_time_scheduled',
  'response time (clocked)': 'response_time_clocked',
  'scheduled hours': 'scheduled_hours',
  'clocked hours': 'clocked_hours',
  'sales per hour': 'sales_per_hour',
  'messages per hour': 'messages_per_hour',
  'fans per hour': 'fans_per_hour',
};

function mapHeader(normalized: string): string | undefined {
  if (COLUMN_MAP[normalized]) return COLUMN_MAP[normalized];
  if (normalized.startsWith('date/time') || normalized.startsWith('date')) return 'date_range';
  for (const [key, val] of Object.entries(COLUMN_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) return val;
  }
  return undefined;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[$,%]/g, '').trim();
  return parseFloat(str) || 0;
}

function parseDateRange(val: unknown): { date: string; days: number } | null {
  if (!val) return null;
  const str = String(val);
  const matches = str.match(/\d{4}-\d{2}-\d{2}/g);
  if (matches && matches.length >= 2) {
    const d1 = new Date(matches[0]! + 'T00:00:00');
    const d2 = new Date(matches[1]! + 'T00:00:00');
    const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
    return { date: matches[1]!, days };
  }
  if (matches && matches.length === 1) return { date: matches[0]!, days: 1 };
  return null;
}

interface Props {
  onUploadComplete?: () => void;
}

export default function EmployeeReportUpload({ onUploadComplete }: Props) {
  const { profile } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = async (file: File) => {
    setUploading(true);
    setResult(null);

    try {
      const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
      if (file.size > MAX_SIZE) {
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
      }
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
        throw new Error('Invalid file type. Please upload .xlsx, .xls, or .csv files only.');
      }

      const rawData = await readSpreadsheet(file);
      if (!rawData.length) throw new Error('Sheet is empty');
      if (rawData.length > 10000) throw new Error(`Too many rows (${rawData.length}). Maximum is 10,000.`);

      const firstRow = rawData[0]!;
      const headerMap = new Map<string, string>();
      for (const key of Object.keys(firstRow)) {
        const normalized = key.toLowerCase().trim();
        const mapped = mapHeader(normalized);
        if (mapped) headerMap.set(key, mapped);
      }

      const mappedCols = new Set(headerMap.values());
      if (!mappedCols.has('employee_name')) throw new Error('Missing "Employee" column');
      if (!mappedCols.has('sales')) throw new Error('Missing "Sales" column');

      // Get chatters for team matching
      const { data: chatters } = await supabase
        .from('chatters')
        .select('full_name, team_name')
        .eq('status', 'Active')
        .eq('airtable_role', 'Chatter');

      const chatterTeamMap = new Map<string, string>();
      for (const c of (chatters ?? []) as { full_name: string; team_name: string | null }[]) {
        chatterTeamMap.set(c.full_name.toLowerCase().trim(), c.team_name ?? '');
      }

      let reportDate: string | null = null;
      let rangeDays = 1;
      const rows: Array<Record<string, unknown>> = [];
      const skippedInactive: string[] = [];

      for (const raw of rawData) {
        const mapped: Record<string, unknown> = {};
        for (const [originalKey, mappedKey] of headerMap) {
          mapped[mappedKey] = raw[originalKey];
        }

        const employeeName = String(mapped.employee_name ?? '').trim();
        if (!employeeName) continue;

        if (!reportDate && mapped.date_range) {
          const parsed = parseDateRange(mapped.date_range);
          if (parsed) {
            reportDate = parsed.date;
            rangeDays = parsed.days;
          }
        }

        const normalizedName = employeeName.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!chatterTeamMap.has(normalizedName)) {
          if (!skippedInactive.includes(employeeName)) skippedInactive.push(employeeName);
          continue;
        }
        const team = chatterTeamMap.get(normalizedName) ?? '';

        const clockedHours = parseNum(mapped.clocked_hours);
        if (clockedHours < 0.5) continue;

        rows.push({
          date: reportDate || new Date().toISOString().split('T')[0],
          employee_name: employeeName,
          team: team,
          creators: String(mapped.creators ?? ''),
          sales: parseNum(mapped.sales),
          ppv_sales: parseNum(mapped.ppv_sales),
          tips: parseNum(mapped.tips),
          dm_sales: parseNum(mapped.dm_sales),
          mass_msg_sales: parseNum(mapped.mass_msg_sales),
          of_mass_msg_sales: parseNum(mapped.of_mass_msg_sales),
          messages_sent: Math.round(parseNum(mapped.messages_sent)),
          ppvs_sent: Math.round(parseNum(mapped.ppvs_sent)),
          ppvs_unlocked: Math.round(parseNum(mapped.ppvs_unlocked)),
          character_count: Math.round(parseNum(mapped.character_count)),
          golden_ratio: parseNum(mapped.golden_ratio),
          unlock_rate: parseNum(mapped.unlock_rate),
          fan_cvr: parseNum(mapped.fan_cvr),
          fans_chatted: Math.round(parseNum(mapped.fans_chatted)),
          fans_who_spent: Math.round(parseNum(mapped.fans_who_spent)),
          avg_earnings_per_spender: parseNum(mapped.avg_earnings_per_spender),
          response_time_scheduled: mapped.response_time_scheduled ? String(mapped.response_time_scheduled) : null,
          response_time_clocked: mapped.response_time_clocked ? String(mapped.response_time_clocked) : null,
          scheduled_hours: parseNum(mapped.scheduled_hours),
          clocked_hours: clockedHours,
          sales_per_hour: parseNum(mapped.sales_per_hour),
          messages_per_hour: parseNum(mapped.messages_per_hour),
          fans_per_hour: parseNum(mapped.fans_per_hour),
        });
      }

      if (!rows.length) {
        throw new Error(
          `No active chatters found with >= 0.5 clocked hours. ${skippedInactive.length > 0 ? `Skipped (not active): ${skippedInactive.slice(0, 5).join(', ')}` : ''}`
        );
      }

      const { error } = await supabase.from('chatter_daily_stats').upsert(rows, {
        onConflict: 'date,employee_name',
      });
      if (error) throw error;

      if (profile) {
        await supabase.from('csv_uploads').insert({
          uploaded_by: profile.id,
          file_name: file.name,
          row_count: rows.length,
          upload_type: 'employee_report',
        });
      }

      const details: string[] = [];
      details.push(`Date: ${reportDate || 'today'}`);
      if (rangeDays > 1) details.push(`${rangeDays}-day range detected`);
      details.push(`${rows.length} active chatters uploaded`);
      if (skippedInactive.length > 0) {
        details.push(`${skippedInactive.length} skipped (not active): ${skippedInactive.slice(0, 5).join(', ')}${skippedInactive.length > 5 ? '...' : ''}`);
      }

      setResult({ type: 'success', message: 'Employee Report uploaded!', details });
      onUploadComplete?.();
    } catch (err: unknown) {
      setResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-3">
      <label
        className={`flex flex-col items-center justify-center w-full h-28 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
          dragOver ? 'border-cw bg-cw/10' : 'border-border hover:border-cw/50 hover:bg-surface-2/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex items-center gap-2 text-cw">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Processing Employee Report...</span>
          </div>
        ) : (
          <>
            <FileSpreadsheet className="w-8 h-8 text-text-muted mb-1" />
            <span className="text-sm text-text-secondary">
              Drop Employee Report (.csv / .xlsx) or <span className="text-cw">browse</span>
            </span>
            <span className="text-[10px] text-text-muted mt-0.5">
              From Inflow &gt; Employee Statistics
            </span>
          </>
        )}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>

      {result && (
        <div className={`rounded-lg p-3 text-sm ${
          result.type === 'success' ? 'bg-success/10 border border-success/20' : 'bg-danger/10 border border-danger/20'
        }`}>
          <div className="flex items-start gap-2">
            {result.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            )}
            <div>
              <p className={result.type === 'success' ? 'text-success' : 'text-danger'}>{result.message}</p>
              {result.details?.map((d, i) => (
                <p key={i} className="text-text-muted text-xs mt-0.5">{d}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

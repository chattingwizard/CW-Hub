import { useState, useRef } from 'react';
import { FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { readSpreadsheet } from '../lib/spreadsheet';

interface FileResult {
  fileName: string;
  type: 'success' | 'error' | 'pending' | 'processing';
  message: string;
  details?: string[];
  reportDate?: string | null;
}

// Anchored patterns to prevent partial matches against longer Infloww column names.
// e.g. "Fans chatted per hour" must NOT match the "fans_chatted" pattern.
const COLUMN_PATTERNS: [RegExp, string][] = [
  [/^employees?$/,                                              'employee_name'],
  [/^duration$|^date\/?time|^date$/,                            'date_range'],
  [/^groups?$|^teams?$/,                                        'team_from_report'],
  [/^creators?$/,                                               'creators'],
  [/^sales\s*per\s*hour$/,                                      'sales_per_hour'],
  [/^sales$/,                                                    'sales'],
  [/^messages?\s*sent\s*per\s*hour$/,                           'messages_per_hour'],
  [/^direct\s*messages?\s*sent$/,                               'messages_sent'],
  [/^direct\s*ppvs?\s*sent$|^ppvs?\s*sent$/,                   'ppvs_sent'],
  [/^ppvs?\s*unlocked$/,                                        'ppvs_unlocked'],
  [/^golden\s*ratio$/,                                           'golden_ratio'],
  [/^unlock\s*rate$/,                                            'unlock_rate'],
  [/^fans?\s*chatted$/,                                          'fans_chatted'],
  [/^fans?\s*who\s*spent(\s*money)?$/,                           'fans_who_spent'],
  [/^fan\s*cvr$/,                                                'fan_cvr'],
  [/^response\s*time(?!.*scheduled)/,                            'response_time_clocked'],
  [/^clocked\s*hours$/,                                          'clocked_hours'],
  [/^character\s*count$/,                                        'character_count'],
];

function mapHeader(normalized: string): string | undefined {
  for (const [pattern, field] of COLUMN_PATTERNS) {
    if (pattern.test(normalized)) return field;
  }
  return undefined;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[$,%]/g, '').trim();
  return parseFloat(str) || 0;
}

function parseHoursValue(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).trim();
  const hmin = str.match(/^(\d+)h\s*(\d+)\s*min/i);
  if (hmin) return parseInt(hmin[1]!) + parseInt(hmin[2]!) / 60;
  const hOnly = str.match(/^(\d+)h$/i);
  if (hOnly) return parseInt(hOnly[1]!);
  const minOnly = str.match(/^(\d+)\s*min/i);
  if (minOnly) return parseInt(minOnly[1]!) / 60;
  const hm = str.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hm) return parseInt(hm[1]!) + parseInt(hm[2]!) / 60 + (hm[3] ? parseInt(hm[3]) / 3600 : 0);
  return parseFloat(str.replace(/[$,%]/g, '')) || 0;
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

function extractDateFromName(name: string): string {
  const digits = name.replace(/[^0-9]/g, '');
  if (digits.length >= 6) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yy = digits.slice(4, 6);
    return `20${yy}-${mm}-${dd}`;
  }
  return '9999-99-99';
}

function sortFilesByDate(files: File[]): File[] {
  return [...files].sort((a, b) =>
    extractDateFromName(a.name).localeCompare(extractDateFromName(b.name))
  );
}

const VALID_TEAMS = ['Team Danilyn', 'Team Huckle', 'Team Ezekiel'] as const;

function normalizeTeamName(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/^team\s+/i, '').trim().toLowerCase();
  for (const valid of VALID_TEAMS) {
    if (valid.toLowerCase().endsWith(cleaned)) return valid;
  }
  return raw;
}

async function loadTeamReferences(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // 1. localStorage overrides (always available)
  try {
    const stored = localStorage.getItem('cw_team_overrides');
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v !== '_dismissed') map.set(k, v);
      }
    }
  } catch { /* ignore */ }

  // 2. Supabase overrides (merge, Supabase wins)
  const { data: overrides } = await supabase
    .from('chatter_team_overrides')
    .select('employee_name, team');
  if (overrides) {
    for (const row of overrides as { employee_name: string; team: string }[]) {
      if (row.team && row.team !== '_dismissed') map.set(row.employee_name, row.team);
    }
  }

  // 3. Most recent date's assignments (only for employees not yet in map)
  const { data: latest } = await supabase
    .from('chatter_daily_stats')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  if (latest && latest.length > 0) {
    const latestDate = (latest[0] as { date: string }).date;
    const { data: recent } = await supabase
      .from('chatter_daily_stats')
      .select('employee_name, team')
      .eq('date', latestDate);
    if (recent) {
      for (const row of recent as { employee_name: string; team: string }[]) {
        const key = row.employee_name.toLowerCase().trim().replace(/\s+/g, ' ');
        if (map.has(key)) continue;
        const normalized = normalizeTeamName(row.team);
        if (VALID_TEAMS.includes(normalized as typeof VALID_TEAMS[number])) {
          map.set(key, normalized);
        }
      }
    }
  }

  return map;
}

interface Props {
  onUploadComplete?: () => void;
}

export default function EmployeeReportUpload({ onUploadComplete }: Props) {
  const { profile } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const teamRefsRef = useRef<Map<string, string> | null>(null);

  const processFile = async (file: File): Promise<FileResult> => {
    try {
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
      }
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
        throw new Error('Invalid file type.');
      }

      const rawData = await readSpreadsheet(file);
      if (!rawData.length) throw new Error('Sheet is empty');
      if (rawData.length > 10000) throw new Error(`Too many rows (${rawData.length}).`);

      const firstRow = rawData[0]!;
      const headerMap = new Map<string, string>();
      const unmappedHeaders: string[] = [];
      for (const key of Object.keys(firstRow)) {
        const normalized = key.toLowerCase().trim();
        if (!normalized) continue;
        const mapped = mapHeader(normalized);
        if (mapped) {
          headerMap.set(key, mapped);
        } else {
          unmappedHeaders.push(key);
        }
      }

      const mappedCols = new Set(headerMap.values());
      if (!mappedCols.has('employee_name')) {
        throw new Error(`Missing "Employee" column. Found: ${Object.keys(firstRow).join(', ')}`);
      }
      if (!mappedCols.has('sales')) {
        throw new Error(`Missing "Sales" column. Found: ${Object.keys(firstRow).join(', ')}`);
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

        const clockedHours = parseHoursValue(mapped.clocked_hours);
        const sales = parseNum(mapped.sales);
        const msgsSent = parseNum(mapped.messages_sent);
        if (clockedHours <= 0 && sales <= 0 && msgsSent <= 0) {
          if (!skippedInactive.includes(employeeName)) skippedInactive.push(employeeName);
          continue;
        }

        const csvTeam = String(mapped.team_from_report ?? '').trim();
        const empKey = employeeName.toLowerCase().trim().replace(/\s+/g, ' ');
        const refs = teamRefsRef.current;
        const resolvedTeam = refs?.get(empKey) ?? normalizeTeamName(csvTeam);

        rows.push({
          date: reportDate || new Date().toISOString().split('T')[0],
          employee_name: employeeName,
          team: resolvedTeam,
          creators: String(mapped.creators ?? ''),
          sales: parseNum(mapped.sales),
          messages_sent: Math.round(parseNum(mapped.messages_sent)),
          ppvs_sent: Math.round(parseNum(mapped.ppvs_sent)),
          ppvs_unlocked: Math.round(parseNum(mapped.ppvs_unlocked)),
          golden_ratio: parseNum(mapped.golden_ratio),
          unlock_rate: parseNum(mapped.unlock_rate),
          fans_chatted: Math.round(parseNum(mapped.fans_chatted)),
          fans_who_spent: Math.round(parseNum(mapped.fans_who_spent)),
          fan_cvr: parseNum(mapped.fan_cvr),
          response_time_clocked: mapped.response_time_clocked ? String(mapped.response_time_clocked) : null,
          clocked_hours: clockedHours,
          sales_per_hour: parseNum(mapped.sales_per_hour),
          character_count: Math.round(parseNum(mapped.character_count)),
          messages_per_hour: parseNum(mapped.messages_per_hour),
        });
      }

      if (!rows.length) {
        throw new Error(
          `No employees with clocked hours > 0. ${skippedInactive.length > 0 ? `Skipped (0h): ${skippedInactive.slice(0, 5).join(', ')}${skippedInactive.length > 5 ? '...' : ''}` : ''}`
        );
      }

      const { error } = await supabase.from('chatter_daily_stats').upsert(rows, {
        onConflict: 'date,employee_name',
      });
      if (error) throw error;

      // Save team resolutions to localStorage (+ Supabase best-effort)
      const refs = teamRefsRef.current;
      const lsOverrides: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('cw_team_overrides');
        if (stored) Object.assign(lsOverrides, JSON.parse(stored));
      } catch { /* ignore */ }

      const newOverrides: Array<{
        employee_name: string; display_name: string;
        team: string; source: string; updated_at: string;
      }> = [];
      for (const row of rows) {
        const team = String(row.team);
        const key = String(row.employee_name).toLowerCase().trim().replace(/\s+/g, ' ');
        if (VALID_TEAMS.includes(team as typeof VALID_TEAMS[number]) && !refs?.has(key)) {
          lsOverrides[key] = team;
          newOverrides.push({
            employee_name: key,
            display_name: String(row.employee_name),
            team,
            source: 'upload',
            updated_at: new Date().toISOString(),
          });
          refs?.set(key, team);
        }
      }
      try {
        localStorage.setItem('cw_team_overrides', JSON.stringify(lsOverrides));
      } catch { /* storage full */ }

      if (newOverrides.length > 0) {
        supabase.from('chatter_team_overrides')
          .upsert(newOverrides, { onConflict: 'employee_name', ignoreDuplicates: true })
          .then(({ error: overrideErr }) => {
            if (overrideErr) console.warn('[Upload] Supabase overrides skipped:', overrideErr.message);
          });
      }

      if (profile) {
        await supabase.from('csv_uploads').insert({
          uploaded_by: profile.id,
          file_name: file.name,
          row_count: rows.length,
          upload_type: 'employee_report',
          report_date: reportDate || null,
        });
      }

      // Build debug info: show header mapping + first row raw vs parsed
      const debugMapping = Array.from(headerMap.entries())
        .map(([orig, mapped]) => `${orig} → ${mapped}`)
        .join(' | ');

      const sampleRow = rows[0];
      const sampleDebug = sampleRow
        ? `Sample (${sampleRow.employee_name}): sales=${sampleRow.sales}, msgs=${sampleRow.messages_sent}, ppvs_sent=${sampleRow.ppvs_sent}, golden=${sampleRow.golden_ratio}, unlocked=${sampleRow.ppvs_unlocked}, unlock%=${sampleRow.unlock_rate}, fans=${sampleRow.fans_chatted}, spent=${sampleRow.fans_who_spent}, cvr=${sampleRow.fan_cvr}, hours=${sampleRow.clocked_hours}, $/hr=${sampleRow.sales_per_hour}, chars=${sampleRow.character_count}, msg/hr=${sampleRow.messages_per_hour}`
        : '';

      const firstRaw = rawData[0];
      const rawDebug = firstRaw
        ? `Raw values: ${Object.entries(firstRaw).slice(0, 8).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`
        : '';

      const totalSalesUpserted = rows.reduce((s, r) => s + (Number(r.sales) || 0), 0);

      const details: string[] = [];
      details.push(`Date: ${reportDate || 'today'} · ${rows.length} employees · Total sales: $${totalSalesUpserted.toFixed(2)}`);
      details.push(`Mapping: ${debugMapping}`);
      if (sampleDebug) details.push(sampleDebug);
      if (rawDebug) details.push(rawDebug);
      if (skippedInactive.length > 0) {
        details.push(`${skippedInactive.length} skipped: ${skippedInactive.slice(0, 3).join(', ')}${skippedInactive.length > 3 ? '...' : ''}`);
      }
      if (unmappedHeaders.length > 0) {
        details.push(`Skipped columns: ${unmappedHeaders.join(', ')}`);
      }

      return { fileName: file.name, type: 'success', message: 'Uploaded', details, reportDate };
    } catch (err: unknown) {
      return {
        fileName: file.name,
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      };
    }
  };

  const processFiles = async (files: File[]) => {
    const sorted = sortFilesByDate(files);
    setUploading(true);
    setResults(sorted.map(f => ({ fileName: f.name, type: 'pending' as const, message: 'Waiting...' })));

    // Load team references once before processing all files
    try {
      teamRefsRef.current = await loadTeamReferences();
    } catch {
      teamRefsRef.current = new Map();
    }

    for (let i = 0; i < sorted.length; i++) {
      setResults(prev => prev.map((r, j) =>
        j === i ? { ...r, type: 'processing', message: 'Processing...' } : r
      ));

      const result = await processFile(sorted[i]!);

      setResults(prev => prev.map((r, j) => j === i ? result : r));
    }

    setResults(prev => {
      const salesPerFile = prev
        .filter(r => r.type === 'success' && r.details)
        .map(r => {
          const match = r.details?.find(d => d.includes('Total sales:'))?.match(/\$([\d,.]+)/);
          return match ? parseFloat(match[1]!.replace(/,/g, '')) : 0;
        });
      const grandTotal = salesPerFile.reduce((s, v) => s + v, 0);
      if (salesPerFile.length > 1) {
        return [...prev, {
          fileName: '📊 GRAND TOTAL',
          type: 'success' as const,
          message: `$${grandTotal.toFixed(2)}`,
          details: [`${salesPerFile.length} files · Combined sales: $${grandTotal.toFixed(2)}`],
        }];
      }
      return prev;
    });

    setUploading(false);
    onUploadComplete?.();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  };

  const clearResults = () => setResults([]);

  const successCount = results.filter(r => r.type === 'success').length;
  const errorCount = results.filter(r => r.type === 'error').length;

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
            <span className="text-sm">
              Processing {results.filter(r => r.type === 'success' || r.type === 'error').length + 1}/{results.length}...
            </span>
          </div>
        ) : (
          <>
            <FileSpreadsheet className="w-8 h-8 text-text-muted mb-1" />
            <span className="text-sm text-text-secondary">
              Drop Employee Reports (.csv / .xlsx) or <span className="text-cw">browse</span>
            </span>
            <span className="text-[10px] text-text-muted mt-0.5">
              Select multiple files — they'll be processed by date order
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>

      {results.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-surface-2/50 border-b border-border">
            <span className="text-xs text-text-secondary font-medium">
              {uploading
                ? `Processing ${results.filter(r => r.type === 'success' || r.type === 'error').length}/${results.length}...`
                : `Done — ${successCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ''}`
              }
            </span>
            {!uploading && (
              <button onClick={clearResults} className="text-text-muted hover:text-text-secondary">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
            {results.map((r, i) => (
              <div key={i} className="px-3 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  {r.type === 'success' && <CheckCircle size={13} className="text-success shrink-0" />}
                  {r.type === 'error' && <AlertCircle size={13} className="text-danger shrink-0" />}
                  {r.type === 'processing' && <Loader2 size={13} className="text-cw animate-spin shrink-0" />}
                  {r.type === 'pending' && <div className="w-[13px] h-[13px] rounded-full border border-border shrink-0" />}
                  <span className="text-text-primary truncate flex-1">{r.fileName}</span>
                  {r.reportDate && (
                    <span className="text-text-muted shrink-0">{r.reportDate}</span>
                  )}
                  <span className={`shrink-0 ${
                    r.type === 'success' ? 'text-success' :
                    r.type === 'error' ? 'text-danger' :
                    'text-text-muted'
                  }`}>
                    {r.message}
                  </span>
                </div>
                {r.details && r.details.length > 0 && (
                  <div className="mt-1 ml-5 space-y-0.5">
                    {r.details.map((d, j) => (
                      <p key={j} className="text-text-muted text-[10px] break-all">{d}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

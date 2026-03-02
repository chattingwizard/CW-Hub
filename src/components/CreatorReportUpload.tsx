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

const COLUMN_PATTERNS: [RegExp, string][] = [
  [/^creators?$/,                              'creator_name'],
  [/date\/?time/,                              'date_range'],
  [/new\s*fans/,                               'new_fans_net'],
  [/active\s*fans/,                            'active_fans'],
  [/fans\s*with\s*renew/,                      'fans_renew_on'],
  [/renew\s*on\s*%|renew.*percent/,            'renew_pct'],
  [/change.*expired|expired.*change/,          'expired_change'],
  [/total\s*earn/,                             'total_earnings'],
  [/^message|message.*(?:net|earn)/,           'message_earnings'],
  [/subscript.*(?:net|earn)|^subscription/,    'subscription_earnings'],
  [/^tips|tips.*(?:net|earn)/,                 'tips_earnings'],
  [/avg.*spend.*spender|spend.*per.*spender/,  'avg_spend_per_spender'],
  [/avg.*sub.*length|subscription.*length/,    'avg_sub_length'],
  [/of\s*ranking|ranking/,                     'of_ranking'],
  [/^following$/,                              'following'],
  [/new\s*subscript/,                          'new_subs_earnings'],
  [/chargebacks?/,                             'chargebacks'],
  [/post.*earn|earning.*post/,                 'post_earnings'],
  [/stream.*earn|earning.*stream/,             'stream_earnings'],
];

function mapCreatorHeader(normalized: string): string | undefined {
  for (const [pattern, field] of COLUMN_PATTERNS) {
    if (pattern.test(normalized)) return field;
  }
  return undefined;
}

function parseMoneyValue(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[$,]/g, '').trim();
  return parseFloat(str) || 0;
}

function parseDays(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = String(val).match(/(\d+)/);
  return match ? parseInt(match[1]!) : 0;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val);
  const matches = str.match(/\d{4}-\d{2}-\d{2}/g);
  if (matches && matches.length >= 2) return matches[1]!;
  if (matches && matches.length === 1) return matches[0]!;
  return null;
}

function parsePercentage(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/%/g, '').trim();
  return parseFloat(str) || 0;
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

export default function CreatorReportUpload({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const { profile } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        const mapped = mapCreatorHeader(normalized);
        if (mapped) {
          headerMap.set(key, mapped);
        } else {
          unmappedHeaders.push(key);
        }
      }

      const mappedCols = new Set(headerMap.values());
      if (!mappedCols.has('creator_name')) {
        throw new Error(`Missing "Creator" column. Found headers: ${Object.keys(firstRow).join(', ')}`);
      }
      if (!mappedCols.has('new_fans_net')) {
        throw new Error(`Missing "New fans" column. Found headers: ${Object.keys(firstRow).join(', ')}`);
      }
      if (!mappedCols.has('expired_change')) {
        throw new Error(`Missing "Change in expired fan count" column. Found headers: ${Object.keys(firstRow).join(', ')}`);
      }

      const { data: allModels } = await supabase.from('models').select('id, name');
      const modelLookup = new Map(
        (allModels ?? []).map((m: { id: string; name: string }) => [m.name.toLowerCase().trim(), m.id]),
      );

      const unmatchedNames: string[] = [];
      const rows: Array<Record<string, unknown>> = [];
      let dateStr: string | null = null;
      let rangeDays = 1;

      const firstMapped: Record<string, unknown> = {};
      for (const [originalKey, mappedKey] of headerMap) {
        firstMapped[mappedKey] = rawData[0]![originalKey];
      }
      if (firstMapped.date_range) {
        const dateVal = String(firstMapped.date_range);
        const allDates = dateVal.match(/\d{4}-\d{2}-\d{2}/g);
        if (allDates && allDates.length >= 2 && allDates[0] !== allDates[1]) {
          const d1 = new Date(allDates[0]! + 'T00:00:00');
          const d2 = new Date(allDates[1]! + 'T00:00:00');
          rangeDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
        }
      }

      for (const raw of rawData) {
        const mapped: Record<string, unknown> = {};
        for (const [originalKey, mappedKey] of headerMap) {
          mapped[mappedKey] = raw[originalKey];
        }

        const creatorName = String(mapped.creator_name ?? '').trim();
        if (!creatorName) continue;

        const modelId = modelLookup.get(creatorName.toLowerCase());
        if (!modelId) {
          if (!unmatchedNames.includes(creatorName)) unmatchedNames.push(creatorName);
          continue;
        }

        if (!dateStr) {
          dateStr = parseDate(mapped.date_range);
        }
        const rowDate = parseDate(mapped.date_range) ?? dateStr;
        if (!rowDate) continue;

        const netNew = parseInt(String(mapped.new_fans_net ?? 0)) || 0;
        const expired = parseInt(String(mapped.expired_change ?? 0)) || 0;
        const grossNew = Math.max(0, netNew + expired);

        const d = rangeDays;
        rows.push({
          model_id: modelId,
          date: rowDate,
          new_fans: Math.round(grossNew / d),
          active_fans: parseInt(String(mapped.active_fans ?? 0)) || 0,
          fans_renew_on: parseInt(String(mapped.fans_renew_on ?? 0)) || 0,
          renew_pct: parsePercentage(mapped.renew_pct),
          expired_change: Math.round(expired / d),
          total_earnings: Math.round((parseMoneyValue(mapped.total_earnings) / d) * 100) / 100,
          message_earnings: Math.round((parseMoneyValue(mapped.message_earnings) / d) * 100) / 100,
          subscription_earnings: Math.round((parseMoneyValue(mapped.subscription_earnings) / d) * 100) / 100,
          tips_earnings: Math.round((parseMoneyValue(mapped.tips_earnings) / d) * 100) / 100,
          avg_spend_per_spender: parseMoneyValue(mapped.avg_spend_per_spender),
          avg_sub_length_days: parseDays(mapped.avg_sub_length),
          of_ranking: mapped.of_ranking ? String(mapped.of_ranking) : null,
          following: parseInt(String(mapped.following ?? 0)) || 0,
        });
      }

      if (!rows.length) {
        throw new Error(
          `No models matched. Unmatched: ${unmatchedNames.slice(0, 5).join(', ')}`,
        );
      }

      const { error } = await supabase.from('model_daily_stats').upsert(rows, {
        onConflict: 'model_id,date',
      });
      if (error) throw error;

      if (profile) {
        await supabase.from('csv_uploads').insert({
          uploaded_by: profile.id,
          file_name: file.name,
          row_count: rows.length,
          upload_type: 'creator_report',
          report_date: dateStr || null,
        });
      }

      const details: string[] = [];
      details.push(`Date: ${dateStr}`);
      if (rangeDays > 1) details.push(`${rangeDays}-day range — values divided to daily averages`);
      details.push(`${rows.length} models · ${mappedCols.size} columns mapped`);
      if (unmatchedNames.length > 0) {
        details.push(`${unmatchedNames.length} unmatched models: ${unmatchedNames.join(', ')}`);
      }
      if (unmappedHeaders.length > 0) {
        details.push(`Skipped columns: ${unmappedHeaders.join(', ')}`);
      }

      return { fileName: file.name, type: 'success', message: 'Uploaded', details, reportDate: dateStr };
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

    for (let i = 0; i < sorted.length; i++) {
      setResults(prev => prev.map((r, j) =>
        j === i ? { ...r, type: 'processing', message: 'Processing...' } : r
      ));

      const result = await processFile(sorted[i]!);

      setResults(prev => prev.map((r, j) => j === i ? result : r));
    }

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
          dragOver
            ? 'border-cw bg-cw/10'
            : 'border-border hover:border-cw/50 hover:bg-surface-2/50'
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
              Drop Creator Reports (.xlsx) or <span className="text-cw">browse</span>
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
          <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import * as XLSX from 'xlsx';

interface UploadResult {
  type: 'success' | 'error';
  message: string;
  details?: string[];
}

// Column mapping from Infloww Creator Report to our schema
const COLUMN_MAP: Record<string, string> = {
  'creator': 'creator_name',
  'new fans': 'new_fans',
  'active fans': 'active_fans',
  'fans with renew on': 'fans_renew_on',
  'renew on %': 'renew_pct',
  'change in expired fan count': 'expired_change',
  'total earnings net': 'total_earnings',
  'message net': 'message_earnings',
  'subscription net': 'subscription_earnings',
  'tips net': 'tips_earnings',
  'avg spend per spender net': 'avg_spend_per_spender',
  'avg subscription length': 'avg_sub_length',
  'of ranking': 'of_ranking',
  'following': 'following',
  'date/time africa/monrovia': 'date_range',
};

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
  // Format: "2026-02-15 - 2026-02-15" — take first date
  const match = str.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : null;
}

function parsePercentage(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/%/g, '').trim();
  return parseFloat(str) || 0;
}

export default function CreatorReportUpload({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const { profile } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = async (file: File) => {
    setUploading(true);
    setResult(null);

    try {
      // Read Excel file
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Use first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Excel file has no sheets');

      const sheet = workbook.Sheets[sheetName]!;
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      if (!rawData.length) throw new Error('Sheet is empty');

      // Normalize headers
      const firstRow = rawData[0]!;
      const headerMap = new Map<string, string>();
      for (const key of Object.keys(firstRow)) {
        const normalized = key.toLowerCase().trim();
        const mapped = COLUMN_MAP[normalized];
        if (mapped) headerMap.set(key, mapped);
      }

      // Validate required columns
      const mappedCols = new Set(headerMap.values());
      if (!mappedCols.has('creator_name')) throw new Error('Missing "Creator" column');
      if (!mappedCols.has('new_fans')) throw new Error('Missing "New fans" column');

      // Get model list for matching
      const { data: allModels } = await supabase.from('models').select('id, name');
      const modelLookup = new Map(
        (allModels ?? []).map((m: { id: string; name: string }) => [m.name.toLowerCase().trim(), m.id]),
      );

      // Parse rows
      const unmatchedNames: string[] = [];
      const rows: Array<Record<string, unknown>> = [];
      let dateStr: string | null = null;

      for (const raw of rawData) {
        // Get mapped values
        const mapped: Record<string, unknown> = {};
        for (const [originalKey, mappedKey] of headerMap) {
          mapped[mappedKey] = raw[originalKey];
        }

        // Get creator name
        const creatorName = String(mapped.creator_name ?? '').trim();
        if (!creatorName) continue;

        // Match to model
        const modelId = modelLookup.get(creatorName.toLowerCase());
        if (!modelId) {
          if (!unmatchedNames.includes(creatorName)) unmatchedNames.push(creatorName);
          continue;
        }

        // Parse date (from first row)
        if (!dateStr) {
          dateStr = parseDate(mapped.date_range);
        }
        const rowDate = parseDate(mapped.date_range) ?? dateStr;
        if (!rowDate) continue;

        rows.push({
          model_id: modelId,
          date: rowDate,
          new_fans: parseInt(String(mapped.new_fans ?? 0)) || 0,
          active_fans: parseInt(String(mapped.active_fans ?? 0)) || 0,
          fans_renew_on: parseInt(String(mapped.fans_renew_on ?? 0)) || 0,
          renew_pct: parsePercentage(mapped.renew_pct),
          expired_change: parseInt(String(mapped.expired_change ?? 0)) || 0,
          total_earnings: parseMoneyValue(mapped.total_earnings),
          message_earnings: parseMoneyValue(mapped.message_earnings),
          subscription_earnings: parseMoneyValue(mapped.subscription_earnings),
          tips_earnings: parseMoneyValue(mapped.tips_earnings),
          avg_spend_per_spender: parseMoneyValue(mapped.avg_spend_per_spender),
          avg_sub_length_days: parseDays(mapped.avg_sub_length),
          of_ranking: mapped.of_ranking ? String(mapped.of_ranking) : null,
          following: parseInt(String(mapped.following ?? 0)) || 0,
        });
      }

      if (!rows.length) {
        throw new Error(
          `No models matched. Unmatched names: ${unmatchedNames.slice(0, 5).join(', ')}`,
        );
      }

      // Upsert to Supabase
      const { error } = await supabase.from('model_daily_stats').upsert(rows, {
        onConflict: 'model_id,date',
      });
      if (error) throw error;

      // Log upload
      await supabase.from('csv_uploads').insert({
        uploaded_by: profile!.id,
        file_name: file.name,
        row_count: rows.length,
        upload_type: 'creator_report',
      });

      const details: string[] = [];
      details.push(`Date: ${dateStr}`);
      details.push(`${rows.length} models uploaded`);
      if (unmatchedNames.length > 0) {
        details.push(`${unmatchedNames.length} unmatched: ${unmatchedNames.join(', ')}`);
      }

      setResult({ type: 'success', message: `Creator Report uploaded successfully!`, details });
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
      {/* Drop zone */}
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
            <span className="text-sm">Processing...</span>
          </div>
        ) : (
          <>
            <FileSpreadsheet className="w-8 h-8 text-text-muted mb-1" />
            <span className="text-sm text-text-secondary">
              Drop Creator Report (.xlsx) or <span className="text-cw">browse</span>
            </span>
            <span className="text-[10px] text-text-muted mt-0.5">
              From Infloww &gt; Creator Statistics
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

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${
            result.type === 'success'
              ? 'bg-success/10 border border-success/20'
              : 'bg-danger/10 border border-danger/20'
          }`}
        >
          <div className="flex items-start gap-2">
            {result.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            )}
            <div>
              <p className={result.type === 'success' ? 'text-success' : 'text-danger'}>
                {result.message}
              </p>
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

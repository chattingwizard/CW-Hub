import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart3,
  Upload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SortAsc,
  Trash2,
  Database,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import {
  COLUMNS,
  migrateHistory,
  readUploadedFile,
  mergeIntoHistory,
  saveHubstaffData,
  loadHubstaffData,
  processData,
  sortData,
  formatValue,
  computeAverages,
  getDateRange,
  getHistoryStats,
  clearAllHistory,
  formatDateRange,
  type ParsedCSV,
  type EmployeeMetrics,
  type PeriodType,
  type SortDir,
} from '../lib/inflowwUtils';

const PERIODS: { id: PeriodType; label: string }[] = [
  { id: 'current', label: 'Current Week' },
  { id: 'previous', label: 'Previous Week' },
  { id: 'all', label: 'All Data' },
];

export default function InflowwKPIs() {
  const [hubstaffRaw, setHubstaffRaw] = useState<ParsedCSV | null>(null);
  const [period, setPeriod] = useState<PeriodType>('current');
  const [sortKey, setSortKey] = useState('sales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hideInactive, setHideInactive] = useState(false);
  const [showAvg, setShowAvg] = useState(true);
  const [uploadingInfloww, setUploadingInfloww] = useState(false);
  const [uploadingHubstaff, setUploadingHubstaff] = useState(false);
  const [inflowwLabel, setInflowwLabel] = useState('Upload CSV / Excel');
  const [hubstaffLabel, setHubstaffLabel] = useState('Upload CSV / Excel');
  const [confirmClear, setConfirmClear] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const inflowwRef = useRef<HTMLInputElement>(null);
  const hubstaffRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    migrateHistory();
    const saved = loadHubstaffData();
    if (saved) setHubstaffRaw(saved);
  }, []);

  const reload = useCallback(() => setDataVersion(v => v + 1), []);

  async function handleInflowwUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInfloww(true);
    try {
      const parsed = await readUploadedFile(file);
      const count = mergeIntoHistory(parsed);
      setInflowwLabel(`${file.name.slice(0, 20)}${file.name.length > 20 ? '...' : ''} (${count} rows)`);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingInfloww(false);
      if (inflowwRef.current) inflowwRef.current.value = '';
    }
  }

  async function handleHubstaffUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHubstaff(true);
    try {
      const parsed = await readUploadedFile(file);
      setHubstaffRaw(parsed);
      saveHubstaffData(parsed);
      setHubstaffLabel(`${file.name.slice(0, 20)}${file.name.length > 20 ? '...' : ''}`);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingHubstaff(false);
      if (hubstaffRef.current) hubstaffRef.current.value = '';
    }
  }

  function handleClearHistory() {
    clearAllHistory();
    setHubstaffRaw(null);
    setInflowwLabel('Upload CSV / Excel');
    setHubstaffLabel('Upload CSV / Excel');
    setConfirmClear(false);
    reload();
  }

  function handleHeaderClick(key: string) {
    if (key === 'employee') {
      setSortDir('alpha');
    } else if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => processData(period, null, null, hubstaffRaw), [period, hubstaffRaw, dataVersion]);
  const filtered = useMemo(() => hideInactive ? data.filter(r => !isNaN(Number(r.directMessagesSent)) && Number(r.directMessagesSent) > 0) : data, [data, hideInactive]);
  const sorted = useMemo(() => sortData(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const averages = useMemo(() => computeAverages(filtered), [filtered]);
  const stats = useMemo(() => getHistoryStats(), [dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = useMemo(() => getDateRange(period), [period]);
  const hasData = (stats && stats.totalRecords > 0) || hubstaffRaw;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <BarChart3 size={22} className="text-cw" />
          Infloww KPIs
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Upload Infloww + Hubstaff files to view employee performance
        </p>
      </div>

      {/* Upload Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="bg-surface-1 border border-border rounded-xl p-4 cursor-pointer hover:border-cw/30 transition-colors">
          <input ref={inflowwRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleInflowwUpload} className="hidden" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/60 mb-1.5">1. Infloww (Marketing Analytics)</p>
          <div className="flex items-center gap-2">
            {uploadingInfloww ? <Loader2 size={14} className="animate-spin text-cw" /> : <Upload size={14} className="text-cw" />}
            <span className="text-sm text-text-primary font-medium truncate">{inflowwLabel}</span>
          </div>
        </label>
        <label className="bg-surface-1 border border-border rounded-xl p-4 cursor-pointer hover:border-cw/30 transition-colors">
          <input ref={hubstaffRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleHubstaffUpload} className="hidden" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/60 mb-1.5">2. Hubstaff (Timesheets)</p>
          <div className="flex items-center gap-2">
            {uploadingHubstaff ? <Loader2 size={14} className="animate-spin text-cw" /> : <Upload size={14} className="text-cw" />}
            <span className="text-sm text-text-primary font-medium truncate">{hubstaffLabel}</span>
          </div>
        </label>
      </div>

      {/* History info */}
      {stats && (
        <div className="flex items-center justify-between bg-surface-1 border border-border rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Database size={13} className="text-text-muted" />
            <span className="text-xs text-text-muted">
              {stats.totalRecords} records &middot; {stats.periodCount} period{stats.periodCount !== 1 ? 's' : ''}
              {stats.earliest && stats.latest && (
                <> &middot; {new Date(stats.earliest + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — {new Date(stats.latest + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</>
              )}
            </span>
          </div>
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Clear all data?</span>
              <button onClick={handleClearHistory} className="text-xs text-red-400 font-medium hover:text-red-300">Yes</button>
              <button onClick={() => setConfirmClear(false)} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="flex items-center gap-1 text-xs text-text-muted hover:text-red-400 transition-colors">
              <Trash2 size={11} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Controls */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Period */}
          <div className="flex gap-1 bg-surface-1 rounded-lg p-0.5 border border-border">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p.id
                    ? 'bg-cw text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Sort direction */}
          <div className="flex gap-1 bg-surface-1 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setSortDir('desc')}
              className={`p-1.5 rounded-md transition-all ${sortDir === 'desc' ? 'bg-cw text-white' : 'text-text-muted hover:text-text-primary'}`}
              title="Highest first"
            >
              <ArrowDown size={13} />
            </button>
            <button
              onClick={() => setSortDir('asc')}
              className={`p-1.5 rounded-md transition-all ${sortDir === 'asc' ? 'bg-cw text-white' : 'text-text-muted hover:text-text-primary'}`}
              title="Lowest first"
            >
              <ArrowUp size={13} />
            </button>
            <button
              onClick={() => setSortDir('alpha')}
              className={`p-1.5 rounded-md transition-all ${sortDir === 'alpha' ? 'bg-cw text-white' : 'text-text-muted hover:text-text-primary'}`}
              title="A-Z"
            >
              <SortAsc size={13} />
            </button>
          </div>

          {/* Toggles */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideInactive} onChange={e => setHideInactive(e.target.checked)} className="accent-cw w-3.5 h-3.5" />
            <span className="text-xs text-text-muted">Hide inactive</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showAvg} onChange={e => setShowAvg(e.target.checked)} className="accent-cw w-3.5 h-3.5" />
            <span className="text-xs text-text-muted">Show averages</span>
          </label>

          {/* Period info */}
          {range && (
            <span className="text-xs text-cw font-medium ml-auto">{formatDateRange(range)}</span>
          )}
        </div>
      )}

      {/* Table or Empty */}
      {!hasData ? (
        <div className="bg-surface-1 border border-dashed border-border rounded-xl p-10 text-center">
          <BarChart3 size={40} className="text-text-muted mx-auto mb-3 opacity-50" />
          <h2 className="text-base font-semibold text-text-primary mb-1">No data yet</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Upload the <strong>Infloww CSV</strong> and the <strong>Hubstaff CSV</strong> to see employee performance stats.
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-surface-1 border border-dashed border-border rounded-xl p-10 text-center">
          <Info size={32} className="text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">No data for this period. Try a different range or upload more files.</p>
        </div>
      ) : (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                {/* Averages row */}
                {showAvg && (
                  <tr className="border-b-2 border-cw/20">
                    {COLUMNS.map(col => (
                      <th key={`avg-${col.key}`} className="px-3 py-2 text-left font-semibold bg-surface-2/50">
                        {col.key === 'employee' ? (
                          <span className="text-cw uppercase text-[10px] tracking-wider">Average</span>
                        ) : col.hasAvg && averages[col.key] != null ? (
                          <span className={col.type === 'currency' ? 'text-emerald-400' : 'text-text-primary'}>
                            {formatValue(averages[col.key], col.type)}
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                )}
                {/* Header row */}
                <tr className="border-b border-border">
                  {COLUMNS.map(col => {
                    const isActive = sortKey === col.key && sortDir !== 'alpha';
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleHeaderClick(col.key)}
                        className={`px-3 py-2.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap transition-colors hover:text-text-primary ${
                          isActive ? 'text-cw' : 'text-text-muted'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          {isActive && (
                            sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />
                          )}
                          {!isActive && col.key !== 'employee' && <ArrowUpDown size={9} className="opacity-30" />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const hasActivity = !isNaN(Number(row.directMessagesSent)) && Number(row.directMessagesSent) > 0;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-2/50 ${
                        !hasActivity ? 'opacity-40' : ''
                      }`}
                    >
                      {COLUMNS.map(col => {
                        const val = row[col.key];
                        const display = col.type === 'text' ? String(val || '') : formatValue(val, col.type);
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2 whitespace-nowrap ${
                              col.key === 'employee' ? 'font-medium text-text-primary' :
                              col.type === 'currency' ? 'text-emerald-400 font-semibold' :
                              'text-text-secondary'
                            }`}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted">
            {sorted.length} employee{sorted.length !== 1 ? 's' : ''} shown
          </div>
        </div>
      )}
    </div>
  );
}

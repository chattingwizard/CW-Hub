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
  ChevronLeft,
  ChevronRight,
  Info,
  Calendar,
  FileSpreadsheet,
  Settings2,
  ExternalLink,
  Trophy,
  List,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
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
  getCompactRanking,
  getTotalSales,
  COMPACT_BONUS,
  COMPACT_JACKPOT,
  RANK_MEDALS,
  COMPACT_VISIBLE,
  getGsheetClientId,
  saveGsheetClientId,
  getGsheetUrl,
  exportToGoogleSheets,
  buildCalendarMonth,
  addDays,
  type ParsedCSV,
  type EmployeeMetrics,
  type PeriodType,
  type SortDir,
} from '../lib/inflowwUtils';

const PERIODS: { id: PeriodType; label: string }[] = [
  { id: 'current', label: 'Current Week' },
  { id: 'previous', label: 'Previous Week' },
  { id: 'custom', label: 'Custom' },
  { id: 'all', label: 'All Data' },
];

export default function InflowwKPIs() {
  const [hubstaffRaw, setHubstaffRaw] = useState<ParsedCSV | null>(null);
  const [period, setPeriod] = useState<PeriodType>('current');
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState('sales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hideInactive, setHideInactive] = useState(false);
  const [showAvg, setShowAvg] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);
  const [uploadingInfloww, setUploadingInfloww] = useState(false);
  const [uploadingHubstaff, setUploadingHubstaff] = useState(false);
  const [inflowwLabel, setInflowwLabel] = useState('Upload CSV / Excel');
  const [hubstaffLabel, setHubstaffLabel] = useState('Upload CSV / Excel');
  const [confirmClear, setConfirmClear] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  // Calendar state
  const [calOpen, setCalOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => { const now = new Date(); return now.getUTCFullYear(); });
  const [calMonth, setCalMonth] = useState(() => { const now = new Date(); return now.getUTCMonth() - 1 < 0 ? 11 : now.getUTCMonth() - 1; });
  const [pickPhase, setPickPhase] = useState(0);
  const [pickStart, setPickStart] = useState<string | null>(null);
  const calRef = useRef<HTMLDivElement>(null);

  // Google Sheets state
  const [showGsheetSetup, setShowGsheetSetup] = useState(false);
  const [gsheetCid, setGsheetCid] = useState('');
  const [gsheetUrl, setGsheetUrl] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);

  // Active chatters from Supabase (for red/normal sorting in export)
  const [activeChatters, setActiveChatters] = useState<Set<string>>(new Set());

  const inflowwRef = useRef<HTMLInputElement>(null);
  const hubstaffRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    migrateHistory();
    const saved = loadHubstaffData();
    if (saved) setHubstaffRaw(saved);
    setGsheetCid(getGsheetClientId());
    setGsheetUrl(getGsheetUrl());

    (async () => {
      const { data } = await supabase
        .from('chatters')
        .select('full_name')
        .eq('status', 'Active')
        .eq('airtable_role', 'Chatter');
      if (data && data.length > 0) {
        const names = new Set<string>();
        for (const c of data) {
          const full = c.full_name.toLowerCase().trim().replace(/\s+/g, ' ');
          names.add(full);
          const parts = full.split(' ');
          if (parts.length >= 2) {
            names.add(parts[0] + ' ' + parts[parts.length - 1]);
          }
          names.add(parts[0]);
        }
        setActiveChatters(names);
      }
    })();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calOpen && calRef.current && !calRef.current.contains(e.target as Node)) {
        setCalOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [calOpen]);

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

  function handlePeriodChange(p: PeriodType) {
    setPeriod(p);
    if (p === 'custom') {
      setCalOpen(true);
      setPickPhase(0);
      setPickStart(null);
    } else {
      setCalOpen(false);
    }
  }

  function handleCalDayClick(date: string) {
    if (period !== 'custom') {
      setPeriod('custom');
    }
    if (pickPhase === 0) {
      setPickStart(date);
      setPickPhase(1);
    } else {
      let from = pickStart!, to = date;
      if (from > to) { const tmp = from; from = to; to = tmp; }
      setCustomFrom(from);
      setCustomTo(to);
      setPickPhase(0);
      setPickStart(null);
      setCalOpen(false);
      reload();
    }
  }

  function calPrev() {
    setCalMonth(m => { if (m === 0) { setCalYear(y => y - 1); return 11; } return m - 1; });
  }
  function calNext() {
    setCalMonth(m => { if (m === 11) { setCalYear(y => y + 1); return 0; } return m + 1; });
  }

  function handleSaveGsheetCid() {
    if (!gsheetCid.trim()) return;
    saveGsheetClientId(gsheetCid.trim());
    setShowGsheetSetup(false);
  }

  async function handleExport() {
    const cid = getGsheetClientId();
    if (!cid) { setShowGsheetSetup(true); return; }
    setExporting(true);
    try {
      const url = await exportToGoogleSheets(data, hubstaffRaw, period, customFrom, customTo, activeChatters, setExportStatus);
      setGsheetUrl(url);
      window.open(url, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => processData(period, customFrom, customTo, hubstaffRaw), [period, customFrom, customTo, hubstaffRaw, dataVersion]);
  const filtered = useMemo(() => hideInactive ? data.filter(r => !isNaN(Number(r.directMessagesSent)) && Number(r.directMessagesSent) > 0) : data, [data, hideInactive]);
  const sorted = useMemo(() => sortData(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const averages = useMemo(() => computeAverages(filtered), [filtered]);
  const stats = useMemo(() => getHistoryStats(), [dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const hasData = (stats && stats.totalRecords > 0) || hubstaffRaw;

  // Compact view data
  const compactRanked = useMemo(() => getCompactRanking(filtered), [filtered]);
  const totalSales = useMemo(() => getTotalSales(filtered), [filtered]);

  // Calendar data
  const calRange = pickPhase === 1 && pickStart ? { from: pickStart, to: addDays(pickStart, 1) } : range;
  const month0 = buildCalendarMonth(calYear, calMonth, calRange);
  const nextMonth = calMonth === 11 ? 0 : calMonth + 1;
  const nextYear = calMonth === 11 ? calYear + 1 : calYear;
  const month1 = buildCalendarMonth(nextYear, nextMonth, calRange);

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

      {/* Google Sheets Export */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleExport}
          disabled={exporting || !hasData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 hover:bg-emerald-900/60 disabled:opacity-40 transition-colors"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
          {exporting ? exportStatus || 'Exporting...' : 'Export to Google Sheets'}
        </button>
        <button
          onClick={() => setShowGsheetSetup(!showGsheetSetup)}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary border border-border hover:border-border transition-colors"
          title="Configure Client ID"
        >
          <Settings2 size={13} />
        </button>
        {gsheetUrl && (
          <a href={gsheetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <ExternalLink size={11} />
            Open Sheet
          </a>
        )}
      </div>

      {/* GSheet Setup Panel */}
      {showGsheetSetup && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-2">
            To export you need a <strong>Google OAuth2 Client ID</strong>. Create one in{' '}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-cw hover:underline">
              Google Cloud Console
            </a>{' '}
            (enable the Google Sheets API first).
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={gsheetCid}
              onChange={e => setGsheetCid(e.target.value)}
              placeholder="Your Client ID (e.g. 123456.apps.googleusercontent.com)"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50"
            />
            <button onClick={handleSaveGsheetCid} className="px-3 py-2 rounded-lg text-xs font-medium bg-cw text-white hover:bg-cw/80 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

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
                onClick={() => handlePeriodChange(p.id)}
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

          {/* Calendar toggle */}
          <div className="relative" ref={calRef}>
            <button
              onClick={() => setCalOpen(!calOpen)}
              className={`p-1.5 rounded-lg border transition-colors ${calOpen ? 'bg-cw text-white border-cw' : 'text-text-muted border-border hover:text-text-primary'}`}
              title="Calendar"
            >
              <Calendar size={14} />
            </button>

            {calOpen && (
              <div className="absolute top-full left-0 z-30 mt-2 bg-surface-1 border border-border rounded-xl p-3 shadow-xl shadow-black/30" style={{ width: '540px' }}>
                {pickPhase === 1 && (
                  <p className="text-center text-xs text-cw font-medium mb-2">
                    Start: {new Date(pickStart + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} &middot; Select end date
                  </p>
                )}
                {pickPhase === 0 && period === 'custom' && (
                  <p className="text-center text-xs text-cw font-medium mb-2">Select start date</p>
                )}
                <div className="flex items-start gap-2">
                  <button onClick={calPrev} className="mt-6 p-1 rounded border border-border text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors flex-shrink-0">
                    <ChevronLeft size={14} />
                  </button>
                  {/* Month 0 */}
                  <div className="flex-1">
                    <p className="text-center text-xs font-semibold text-text-primary capitalize mb-1">{month0.title}</p>
                    <div className="grid grid-cols-7 gap-0">
                      {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                        <div key={d} className="text-center text-[10px] text-text-muted font-medium py-1">{d}</div>
                      ))}
                      {Array.from({ length: month0.blanks }).map((_, i) => <div key={`b${i}`} className="h-7" />)}
                      {month0.days.map(d => (
                        <button
                          key={d.date}
                          onClick={() => handleCalDayClick(d.date)}
                          className={`h-7 flex items-center justify-center text-[11px] transition-colors rounded-sm ${
                            d.isSingle ? 'bg-cw text-white font-bold' :
                            d.isStart ? 'bg-cw text-white rounded-l-full' :
                            d.isEnd ? 'bg-cw text-white rounded-r-full' :
                            d.inRange ? 'bg-cw/15 text-text-primary' :
                            'text-text-secondary hover:bg-surface-2'
                          } ${d.isToday && !d.isSingle && !d.isStart && !d.isEnd ? 'ring-1 ring-cw/50 ring-inset' : ''}`}
                        >
                          {d.day}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Month 1 */}
                  <div className="flex-1">
                    <p className="text-center text-xs font-semibold text-text-primary capitalize mb-1">{month1.title}</p>
                    <div className="grid grid-cols-7 gap-0">
                      {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                        <div key={d} className="text-center text-[10px] text-text-muted font-medium py-1">{d}</div>
                      ))}
                      {Array.from({ length: month1.blanks }).map((_, i) => <div key={`b${i}`} className="h-7" />)}
                      {month1.days.map(d => (
                        <button
                          key={d.date}
                          onClick={() => handleCalDayClick(d.date)}
                          className={`h-7 flex items-center justify-center text-[11px] transition-colors rounded-sm ${
                            d.isSingle ? 'bg-cw text-white font-bold' :
                            d.isStart ? 'bg-cw text-white rounded-l-full' :
                            d.isEnd ? 'bg-cw text-white rounded-r-full' :
                            d.inRange ? 'bg-cw/15 text-text-primary' :
                            'text-text-secondary hover:bg-surface-2'
                          } ${d.isToday && !d.isSingle && !d.isStart && !d.isEnd ? 'ring-1 ring-cw/50 ring-inset' : ''}`}
                        >
                          {d.day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={calNext} className="mt-6 p-1 rounded border border-border text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors flex-shrink-0">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
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

          {/* View toggle */}
          <div className="flex gap-1 bg-surface-1 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setCompactView(false)}
              className={`p-1.5 rounded-md transition-all ${!compactView ? 'bg-cw text-white' : 'text-text-muted hover:text-text-primary'}`}
              title="Full table"
            >
              <List size={13} />
            </button>
            <button
              onClick={() => setCompactView(true)}
              className={`p-1.5 rounded-md transition-all ${compactView ? 'bg-cw text-white' : 'text-text-muted hover:text-text-primary'}`}
              title="Compact ranking"
            >
              <Trophy size={13} />
            </button>
          </div>

          {/* Toggles */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideInactive} onChange={e => setHideInactive(e.target.checked)} className="accent-cw w-3.5 h-3.5" />
            <span className="text-xs text-text-muted">Hide inactive</span>
          </label>
          {!compactView && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showAvg} onChange={e => setShowAvg(e.target.checked)} className="accent-cw w-3.5 h-3.5" />
              <span className="text-xs text-text-muted">Show averages</span>
            </label>
          )}

          {/* Period info */}
          {range && (
            <span className="text-xs text-cw font-medium ml-auto">{formatDateRange(range)}</span>
          )}
        </div>
      )}

      {/* Table / Compact / Empty */}
      {!hasData ? (
        <div className="bg-surface-1 border border-dashed border-border rounded-xl p-10 text-center">
          <BarChart3 size={40} className="text-text-muted mx-auto mb-3 opacity-50" />
          <h2 className="text-base font-semibold text-text-primary mb-1">No data yet</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Upload the <strong>Infloww CSV</strong> and the <strong>Hubstaff CSV</strong> to see employee performance stats.
          </p>
        </div>
      ) : sorted.length === 0 && !compactView ? (
        <div className="bg-surface-1 border border-dashed border-border rounded-xl p-10 text-center">
          <Info size={32} className="text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">No data for this period. Try a different range or upload more files.</p>
        </div>
      ) : compactView ? (
        /* ═══ COMPACT RANKING VIEW ═══ */
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden max-w-xl mx-auto">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                {/* Total Sales banner */}
                <tr>
                  <th colSpan={5} className="px-3 py-2 text-center text-sm font-bold border-b-2 border-cw/20">
                    TOTAL SALES{' '}
                    <span className="text-base inline-block border-b-2 border-emerald-400 pb-px" style={{
                      background: 'linear-gradient(90deg, #166534, #4ade80, #bbf7d0)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}>
                      ${Math.round(totalSales * 100) / 100}
                    </span>
                  </th>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-center font-semibold text-text-muted w-12">Rank</th>
                  <th className="px-2 py-1.5 text-center font-semibold text-text-muted">Top Chatters</th>
                  <th className="px-2 py-1.5 text-center font-semibold text-text-muted">Sales</th>
                  <th className="px-2 py-1.5 text-center font-semibold text-emerald-400">$$ BONUS $$</th>
                  <th className="px-2 py-1.5 text-center font-semibold text-amber-400">JACKPOT +$50k total sales BONUS $$</th>
                </tr>
              </thead>
              <tbody>
                {compactRanked.slice(0, showExpanded ? undefined : COMPACT_VISIBLE).map((r, i) => {
                  const hasBonus = i < COMPACT_BONUS.length;
                  const firstName = String(r.employee || '').split(' ')[0];
                  return (
                    <tr key={i} className="border-b border-border last:border-b-0 hover:bg-surface-2/50 transition-colors">
                      <td className="px-2 py-1 text-center font-bold text-text-muted text-xs">
                        {i + 1}{i < RANK_MEDALS.length ? ' ' + RANK_MEDALS[i] : ''}
                      </td>
                      <td className="px-2 py-1 text-center font-semibold text-text-primary">{firstName}</td>
                      <td className="px-2 py-1 text-center text-emerald-400 font-semibold">{formatValue(r.sales, 'currency')}</td>
                      <td className={`px-2 py-1 text-center font-bold ${hasBonus ? 'text-emerald-400' : 'text-text-muted/40 italic'}`}>
                        {hasBonus ? `$${COMPACT_BONUS[i].toFixed(2)}` : 'Keep pushing'}
                      </td>
                      <td className={`px-2 py-1 text-center font-bold ${hasBonus ? 'text-amber-400' : 'text-text-muted/40 italic'}`}>
                        {hasBonus ? `$${COMPACT_JACKPOT[i].toFixed(2)}` : 'Keep pushing'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {compactRanked.length > COMPACT_VISIBLE && (
            <button
              onClick={() => setShowExpanded(!showExpanded)}
              className="w-full py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-surface-2/50 border-t border-border transition-colors"
            >
              {showExpanded ? `Hide ${compactRanked.length - COMPACT_VISIBLE} more` : `Show ${compactRanked.length - COMPACT_VISIBLE} more`}
            </button>
          )}

          <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted">
            {compactRanked.length} employee{compactRanked.length !== 1 ? 's' : ''} ranked
          </div>
        </div>
      ) : (
        /* ═══ FULL TABLE VIEW ═══ */
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
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
                  const empName = String(row.employee).toLowerCase().trim().replace(/\s+/g, ' ');
                  const empParts = empName.split(' ');
                  const isActive = activeChatters.size === 0
                    || activeChatters.has(empName)
                    || (empParts.length >= 2 && activeChatters.has(empParts[0] + ' ' + empParts[empParts.length - 1]))
                    || activeChatters.has(empParts[0]);
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-2/50 ${
                        !isActive ? 'opacity-30' : ''
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

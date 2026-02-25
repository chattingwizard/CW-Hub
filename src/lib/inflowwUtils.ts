// Infloww + Hubstaff CSV processing utilities
// Ported from chattingwizard/infloww-kpi-dashboard

const HISTORY_KEY = 'infloww_history';
const HUBSTAFF_KEY = 'infloww_hubstaff';
const HISTORY_VER_KEY = 'infloww_history_ver';
const HISTORY_VER = 4;

export interface InflowwColumn {
  key: string;
  label: string;
  type: 'text' | 'currency' | 'number' | 'decimal' | 'percent' | 'hours' | 'time';
  hasAvg?: boolean;
}

export const COLUMNS: InflowwColumn[] = [
  { key: 'employee', label: 'Employees', type: 'text' },
  { key: 'duration', label: 'Duration', type: 'hours', hasAvg: true },
  { key: 'sales', label: 'Sales', type: 'currency', hasAvg: true },
  { key: 'directMessagesSent', label: 'DMs Sent', type: 'number' },
  { key: 'directPpvsSent', label: 'PPVs Sent', type: 'number' },
  { key: 'goldenRatio', label: 'Golden Ratio', type: 'percent', hasAvg: true },
  { key: 'ppvsUnlocked', label: 'PPVs Unlocked', type: 'number' },
  { key: 'unlockRate', label: 'Unlock Rate', type: 'percent' },
  { key: 'fansChatted', label: 'Fans Chatted', type: 'number' },
  { key: 'fansWhoSpentMoney', label: 'Fans Spent', type: 'number' },
  { key: 'fanCvr', label: 'Fan CVR', type: 'percent', hasAvg: true },
  { key: 'responseTime', label: 'Resp. Time', type: 'time', hasAvg: true },
  { key: 'clockedHours', label: 'Clocked Hrs', type: 'hours' },
  { key: 'salesPerHour', label: '$/hr', type: 'currency', hasAvg: true },
  { key: 'characterCount', label: 'Char Count', type: 'number' },
  { key: 'messagesSentPerHour', label: 'Msg/hr', type: 'decimal', hasAvg: true },
];

const DATA_KEYS = [
  'sales', 'directMessagesSent', 'directPpvsSent', 'goldenRatio',
  'ppvsUnlocked', 'unlockRate', 'fansChatted', 'fansWhoSpentMoney',
  'fanCvr', 'responseTime', 'clockedHours', 'salesPerHour',
  'characterCount', 'messagesSentPerHour',
];

const SUM_KEYS = ['sales', 'directMessagesSent', 'directPpvsSent', 'ppvsUnlocked',
  'fansChatted', 'fansWhoSpentMoney', 'characterCount', 'clockedHours'];
const DERIVED_RATE_KEYS = ['goldenRatio', 'unlockRate', 'fanCvr', 'responseTime',
  'salesPerHour', 'messagesSentPerHour'];

const INFLOWW_ALIASES: Record<string, string[]> = {
  employee: ['employee', 'employees', 'name', 'chatter', 'model', 'empleado', 'nombre'],
  date: ['date', 'fecha', 'day', 'dia', 'period', 'periodo'],
  sales: ['sales', 'revenue', 'earnings', 'ingresos', 'ventas', 'total sales', 'net', 'gross'],
  directMessagesSent: ['direct messages sent', 'dm sent', 'mensajes directos', 'mensajes enviados'],
  directPpvsSent: ['direct ppvs sent', 'ppvs sent', 'ppv sent', 'ppvs directos enviados'],
  goldenRatio: ['golden ratio', 'ratio dorado', 'gr'],
  ppvsUnlocked: ['ppvs unlocked', 'ppv unlocked', 'ppvs desbloqueados', 'unlocked ppvs', 'unlocked'],
  unlockRate: ['unlock rate', 'tasa de desbloqueo', 'tasa desbloqueo'],
  fansChatted: ['fans chatted', 'fans chateados', 'chatted fans', 'chatted'],
  fansWhoSpentMoney: ['fans who spent money', 'fans que gastaron', 'spending fans', 'fans who spent', 'spent money'],
  fanCvr: ['fan cvr', 'cvr', 'fan conversion', 'tasa conversion'],
  responseTime: ['response time', 'tiempo de respuesta', 'avg response time', 'response', 'resp time'],
  clockedHours: ['clocked hours', 'horas clockeadas', 'logged hours', 'horas registradas'],
  characterCount: ['character count', 'caracteres', 'char count', 'characters', 'total characters'],
  messagesSentPerHour: ['messages sent per hour', 'mensajes por hora', 'msg per hour', 'messages/hour', 'msg/hr'],
  salesPerHour: ['sales per hour', 'ventas por hora', 'revenue per hour', '$/hr'],
  group: ['group', 'grupo', 'team', 'equipo'],
};

const HUBSTAFF_ALIASES: Record<string, string[]> = {
  employee: ['member', 'user', 'employee', 'name', 'usuario', 'miembro', 'employees'],
  date: ['date', 'fecha', 'day', 'start date'],
  hours: ['hours', 'time', 'duration', 'tracked', 'time tracked', 'total time', 'hours worked', 'horas', 'tiempo'],
};

export interface HistoryRecord {
  periodStart: string;
  periodEnd: string;
  uploadedAt: string;
  employee: string;
  group: string;
  values: Record<string, string>;
}

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

export interface EmployeeMetrics {
  employee: string;
  group: string;
  [key: string]: number | string;
}

export type PeriodType = 'current' | 'previous' | 'all' | 'custom';
export type SortDir = 'desc' | 'asc' | 'alpha';

// ── CSV Parsing ──

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === delimiter) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ';' : ',';
  const headers = parseLine(lines[0], delimiter);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) rows.push(parseLine(lines[i], delimiter));
  return { headers, rows };
}

export async function readUploadedFile(file: File): Promise<ParsedCSV> {
  const isCSV = /\.csv$/i.test(file.name);
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (isCSV) {
          resolve(parseCSV(e.target?.result as string));
        } else if (isExcel) {
          const XLSX = await import('exceljs');
          const workbook = new XLSX.Workbook();
          await workbook.xlsx.load(e.target?.result as ArrayBuffer);
          const sheet = workbook.worksheets[0];
          const rows: string[][] = [];
          sheet.eachRow((row) => {
            rows.push(row.values.slice(1).map((v: unknown) => String(v ?? '')));
          });
          if (rows.length === 0) { resolve({ headers: [], rows: [] }); return; }
          resolve({ headers: rows[0], rows: rows.slice(1) });
        } else {
          reject(new Error('Unsupported file format'));
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    isExcel ? reader.readAsArrayBuffer(file) : reader.readAsText(file, 'UTF-8');
  });
}

// ── Header Matching ──

function normalizeHeader(h: string): string {
  return String(h || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCol(headers: string[], aliases: string[], used: Set<number>): number {
  const norm = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const i = norm.findIndex((h, idx) => h === alias && !used.has(idx));
    if (i !== -1) return i;
  }
  for (const alias of aliases) {
    const i = norm.findIndex((h, idx) => (h.includes(alias) || alias.includes(h)) && !used.has(idx));
    if (i !== -1) return i;
  }
  return -1;
}

function buildMap(headers: string[], aliasesObj: Record<string, string[]>): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  for (const [key, aliases] of Object.entries(aliasesObj)) {
    const idx = findCol(headers, aliases, used);
    if (idx !== -1) { map[key] = idx; used.add(idx); }
  }
  return map;
}

// ── Number Parsing ──

function parseNum(v: unknown): number {
  if (v == null || v === '' || v === '-') return NaN;
  const s = String(v).replace(/[$%,]/g, '').replace(/\s/g, '').replace(',', '.');
  return parseFloat(s);
}

function parseHours(v: unknown): number {
  if (v == null || v === '' || v === '-') return NaN;
  const s = String(v).trim().replace(/,/g, '.');
  const hmin = s.match(/^(\d+)h\s*(\d+)\s*min/i);
  if (hmin) return parseInt(hmin[1]) + parseInt(hmin[2]) / 60;
  const hOnly = s.match(/^(\d+)h$/i);
  if (hOnly) return parseInt(hOnly[1]);
  const minOnly = s.match(/^(\d+)\s*min$/i);
  if (minOnly) return parseInt(minOnly[1]) / 60;
  const hm = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60 + (hm[3] ? parseInt(hm[3]) / 3600 : 0);
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function parseResponseTime(v: unknown): number {
  if (v == null || v === '' || v === '-') return NaN;
  const s = String(v).trim();
  const mSec = s.match(/^(\d+)m\s*(\d+)\s*s$/i);
  if (mSec) return parseInt(mSec[1]) * 60 + parseInt(mSec[2]);
  const mOnly = s.match(/^(\d+)m$/i);
  if (mOnly) return parseInt(mOnly[1]) * 60;
  const sOnly = s.match(/^(\d+)\s*s$/i);
  if (sOnly) return parseInt(sOnly[1]);
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return parseInt(hms[1]) * 3600 + parseInt(hms[2]) * 60 + parseInt(hms[3]);
  const ms = s.match(/^(\d+):(\d{2})$/);
  if (ms) return parseInt(ms[1]) * 60 + parseInt(ms[2]);
  const n = parseFloat(String(v).replace(/,/g, '.'));
  return isNaN(n) ? NaN : n;
}

// ── Date Utilities ──

function parseDate(s: string): string | null {
  if (!s) return null;
  const str = String(s).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return str.slice(0, 10);
  const dmy = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (dmy) {
    const a = parseInt(dmy[1]), b = parseInt(dmy[2]), y = dmy[3];
    if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

function parseFullDatetime(s: string): string | null {
  if (!s) return null;
  const str = String(s).trim();
  const m = str.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (m) return m[1] + 'T' + m[2];
  return parseDate(str);
}

function parsePeriodString(str: string): { start: string; end: string } | null {
  if (!str) return null;
  const s = String(str).trim();
  const parts = s.split(/\s+-\s+/);
  if (parts.length === 2) {
    const start = parseFullDatetime(parts[0]);
    const end = parseFullDatetime(parts[1]);
    if (start && end) return { start, end };
  }
  const single = parseFullDatetime(s);
  if (single) return { start: single, end: single };
  return null;
}

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(dateStr: string, n: number): string {
  return toDateStr(new Date(new Date(dateStr + 'T00:00:00Z').getTime() + n * 86400000));
}

function getMondayUTC(offsetWeeks: number): Date {
  const now = new Date();
  const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utcToday.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(utcToday.getTime() - diff * 86400000 + offsetWeeks * 7 * 86400000);
}

export function getDateRange(period: PeriodType, customFrom?: string | null, customTo?: string | null): { from: string; to: string } | null {
  if (period === 'current') {
    const mon = getMondayUTC(0);
    const nextMon = new Date(mon.getTime() + 7 * 86400000);
    return { from: toDateStr(mon), to: toDateStr(nextMon) };
  }
  if (period === 'previous') {
    const mon = getMondayUTC(-1);
    const nextMon = new Date(mon.getTime() + 7 * 86400000);
    return { from: toDateStr(mon), to: toDateStr(nextMon) };
  }
  if (period === 'custom' && customFrom && customTo) {
    if (customFrom === customTo) return { from: customFrom, to: addDays(customTo, 1) };
    return { from: customFrom, to: customTo };
  }
  return null;
}

// ── History Storage ──

export function loadHistory(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(records: HistoryRecord[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      alert('Local storage is full. Consider clearing old data.');
    }
  }
}

export function mergeIntoHistory(parsedData: ParsedCSV): number {
  const map = buildMap(parsedData.headers, INFLOWW_ALIASES);
  const dateIdx = map.date;
  const employeeIdx = map.employee;
  if (employeeIdx == null) return 0;

  const now = new Date().toISOString();
  const newRecords: HistoryRecord[] = [];

  for (const row of parsedData.rows) {
    const name = (row[employeeIdx] || '').trim();
    if (!name) continue;

    let period = dateIdx != null ? parsePeriodString(row[dateIdx]) : null;
    if (!period) period = { start: 'unknown', end: 'unknown' };

    const values: Record<string, string> = {};
    for (const key of DATA_KEYS) {
      if (map[key] != null) values[key] = row[map[key]] || '';
    }
    const grp = map.group != null ? (row[map.group] || '').trim() : '';

    newRecords.push({
      periodStart: period.start,
      periodEnd: period.end,
      uploadedAt: now,
      employee: name,
      group: grp,
      values,
    });
  }

  const history = loadHistory();
  for (const rec of newRecords) {
    const idx = history.findIndex(
      r => r.employee === rec.employee && r.periodStart === rec.periodStart && r.periodEnd === rec.periodEnd
    );
    if (idx !== -1) {
      if (rec.uploadedAt >= history[idx].uploadedAt) history[idx] = rec;
    } else {
      history.push(rec);
    }
  }

  saveHistory(history);
  return newRecords.length;
}

export function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(HUBSTAFF_KEY);
}

export function getHistoryStats() {
  const history = loadHistory();
  if (!history.length) return null;
  const periods = new Set(history.map(r => `${r.periodStart}_${r.periodEnd}`));
  const dates = history.map(r => r.periodStart).filter(d => d !== 'unknown').sort();
  return {
    totalRecords: history.length,
    periodCount: periods.size,
    earliest: dates[0] || null,
    latest: dates[dates.length - 1] || null,
  };
}

// ── Hubstaff Storage ──

export function saveHubstaffData(data: ParsedCSV) {
  try { localStorage.setItem(HUBSTAFF_KEY, JSON.stringify(data)); } catch {}
}

export function loadHubstaffData(): ParsedCSV | null {
  try {
    const raw = localStorage.getItem(HUBSTAFF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Data Processing ──

function filterRows(rows: string[][], dateIdx: number, range: { from: string; to: string }): string[][] {
  if (dateIdx < 0) return rows;
  return rows.filter(r => {
    const d = parseDate(r[dateIdx]);
    return d && d >= range.from && d < range.to;
  });
}

function computeMetrics(emp: { name: string; group: string; inflowwRows: { row: string[]; map: Record<string, number> }[]; hubstaffHours: number }): EmployeeMetrics {
  const m: EmployeeMetrics = { employee: emp.name, group: emp.group || '' };
  const sums: Record<string, { total: number; count: number }> = {};
  for (const k of SUM_KEYS) sums[k] = { total: 0, count: 0 };
  const rateVals: Record<string, number[]> = {};
  for (const k of DERIVED_RATE_KEYS) rateVals[k] = [];

  for (const { row, map } of emp.inflowwRows) {
    for (const k of SUM_KEYS) {
      if (map[k] == null) continue;
      const v = k === 'clockedHours' ? parseHours(row[map[k]]) : parseNum(row[map[k]]);
      if (!isNaN(v)) { sums[k].total += v; sums[k].count++; }
    }
    for (const k of DERIVED_RATE_KEYS) {
      if (map[k] == null) continue;
      const v = k === 'responseTime' ? parseResponseTime(row[map[k]]) : parseNum(row[map[k]]);
      if (!isNaN(v)) rateVals[k].push(v);
    }
  }

  m.duration = emp.hubstaffHours || NaN;
  for (const k of SUM_KEYS) m[k] = sums[k].count ? sums[k].total : NaN;
  for (const k of DERIVED_RATE_KEYS) m[k] = rateVals[k].length === 1 ? rateVals[k][0] : NaN;

  return m;
}

export function processData(period: PeriodType, customFrom?: string | null, customTo?: string | null, hubstaffRaw?: ParsedCSV | null): EmployeeMetrics[] {
  const range = getDateRange(period, customFrom, customTo);
  const employees: Record<string, { name: string; group: string; inflowwRows: { row: string[]; map: Record<string, number> }[]; hubstaffHours: number }> = {};

  const records = range ? loadHistory().filter(r => r.periodEnd >= range.from && r.periodEnd < range.to) : loadHistory();

  for (const rec of records) {
    const key = rec.employee.toLowerCase();
    if (!employees[key]) employees[key] = { name: rec.employee, group: '', inflowwRows: [], hubstaffHours: 0 };
    if (rec.group) employees[key].group = rec.group;
    const synRow: string[] = [];
    const synMap: Record<string, number> = {};
    let i = 0;
    for (const [k, v] of Object.entries(rec.values)) {
      synRow.push(v);
      synMap[k] = i++;
    }
    employees[key].inflowwRows.push({ row: synRow, map: synMap });
  }

  if (hubstaffRaw) {
    const map = buildMap(hubstaffRaw.headers, HUBSTAFF_ALIASES);
    const dateIdx = map.date;
    const rows = range && dateIdx != null ? filterRows(hubstaffRaw.rows, dateIdx, range) : hubstaffRaw.rows;

    for (const row of rows) {
      const name = map.employee != null ? (row[map.employee] || '').trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (!employees[key]) employees[key] = { name, group: '', inflowwRows: [], hubstaffHours: 0 };
      const h = parseHours(row[map.hours]);
      if (!isNaN(h)) employees[key].hubstaffHours += h;
    }
  }

  return Object.values(employees).map(computeMetrics);
}

// ── Sorting ──

export function sortData(data: EmployeeMetrics[], sortKey: string, sortDir: SortDir): EmployeeMetrics[] {
  const copy = [...data];
  if (sortDir === 'alpha') {
    copy.sort((a, b) => String(a.employee).localeCompare(String(b.employee)));
    return copy;
  }
  const mult = sortDir === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    const va = Number(a[sortKey]);
    const vb = Number(b[sortKey]);
    const na = isNaN(va) ? -Infinity : va;
    const nb = isNaN(vb) ? -Infinity : vb;
    return (na - nb) * mult;
  });
  return copy;
}

// ── Formatting ──

function roundDisplay(n: number, dp: number): string {
  const factor = Math.pow(10, dp);
  return String(Math.round(n * factor) / factor);
}

function fmtHours(h: number): string {
  if (isNaN(h)) return '—';
  const totalMin = Math.floor(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function fmtTime(totalSeconds: number): string {
  if (isNaN(totalSeconds)) return '—';
  const total = Math.floor(totalSeconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatValue(value: unknown, type: string): string {
  const n = Number(value);
  if (value == null || isNaN(n)) return '—';
  switch (type) {
    case 'currency': return '$' + roundDisplay(n, 2);
    case 'number': return Math.round(n).toLocaleString('en-US');
    case 'decimal': return roundDisplay(n, 2);
    case 'percent': return roundDisplay(n, 2) + '%';
    case 'hours': return fmtHours(n);
    case 'time': return fmtTime(n);
    default: return String(value);
  }
}

export function computeAverages(data: EmployeeMetrics[]): Record<string, number | null> {
  const avgs: Record<string, number | null> = {};
  for (const col of COLUMNS) {
    if (!col.hasAvg) continue;
    const vals = data.map(r => Number(r[col.key])).filter(v => !isNaN(v));
    avgs[col.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return avgs;
}

export function formatDateRange(range: { from: string; to: string }): string {
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const inclEnd = addDays(range.to, -1);
  if (range.from === inclEnd) return fmt(range.from);
  return `${fmt(range.from)} — ${fmt(inclEnd)}`;
}

// ── Init ──

export function migrateHistory() {
  const ver = parseInt(localStorage.getItem(HISTORY_VER_KEY) || '0');
  if (ver < HISTORY_VER) {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.setItem(HISTORY_VER_KEY, String(HISTORY_VER));
  }
}

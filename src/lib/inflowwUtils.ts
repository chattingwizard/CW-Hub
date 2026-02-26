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

// ── Compact View Data ──

export const COMPACT_BONUS = [60, 40, 30, 20, 15, 12, 10, 6, 4, 3];
export const COMPACT_JACKPOT = [75, 50, 37, 25, 19, 14, 11, 8, 6, 5];
export const RANK_MEDALS = ['🥇', '🥈', '🥉'];
export const COMPACT_VISIBLE = 12;

export function getCompactRanking(data: EmployeeMetrics[]) {
  return [...data].sort((a, b) => {
    const va = isNaN(Number(a.sales)) ? -Infinity : Number(a.sales);
    const vb = isNaN(Number(b.sales)) ? -Infinity : Number(b.sales);
    return vb - va;
  });
}

export function getTotalSales(data: EmployeeMetrics[]): number {
  return data.reduce((s, r) => s + (isNaN(Number(r.sales)) ? 0 : Number(r.sales)), 0);
}

// ── Google Sheets Export ──

const GSHEET_CID_KEY = 'infloww_gsheet_client_id';
const GSHEET_ID_KEY = 'infloww_gsheet_id';

export function getGsheetClientId(): string {
  return localStorage.getItem(GSHEET_CID_KEY) || '';
}

export function saveGsheetClientId(cid: string) {
  localStorage.setItem(GSHEET_CID_KEY, cid);
}

export function getGsheetUrl(): string | null {
  const sid = localStorage.getItem(GSHEET_ID_KEY);
  return sid ? `https://docs.google.com/spreadsheets/d/${sid}` : null;
}

function numOrDash(v: number) { return isNaN(v) ? '-' : v; }
function intOrDash(v: number) { return isNaN(v) ? '-' : Math.round(v); }
function pctOrDash(v: number) { return isNaN(v) ? '-' : v / 100; }
function hoursToSerial(h: number) { return isNaN(h) || h === 0 ? '-' : h / 24; }
function secsToSerial(s: number) { return isNaN(s) ? '-' : s / 86400; }

function fmtClockedExport(hours: number): string {
  if (isNaN(hours)) return '-';
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
}

function buildEmployeeRow(r: EmployeeMetrics): (string | number)[] {
  return [
    String(r.employee),
    hoursToSerial(Number(r.duration)),
    numOrDash(Number(r.sales)),
    intOrDash(Number(r.directMessagesSent)),
    intOrDash(Number(r.directPpvsSent)),
    pctOrDash(Number(r.goldenRatio)),
    intOrDash(Number(r.ppvsUnlocked)),
    pctOrDash(Number(r.unlockRate)),
    intOrDash(Number(r.fansChatted)),
    intOrDash(Number(r.fansWhoSpentMoney)),
    pctOrDash(Number(r.fanCvr)),
    secsToSerial(Number(r.responseTime)),
    fmtClockedExport(Number(r.clockedHours)),
    numOrDash(Number(r.salesPerHour)),
    intOrDash(Number(r.characterCount)),
    numOrDash(Number(r.messagesSentPerHour)),
  ];
}

function extractTeamName(group: string): string {
  if (!group) return '';
  return group.replace(/^team\s+/i, '').trim().toUpperCase();
}

async function sheetsApi(path: string, method: string, body?: unknown, token?: string) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets';
  const res = await fetch(base + path, {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Sheets API error ' + res.status + ': ' + t);
  }
  return res.json();
}

function rgb(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

const EXPORT_VER_KEY = 'infloww_export_ver';
const EXPORT_DATE_KEY = 'infloww_export_date';

function getExportTitle(range: { from: string; to: string } | null): string {
  const fmtD = (s: string) => {
    const d = new Date(s + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  let name = 'KPIs';
  if (range) {
    const inclEnd = addDays(range.to, -1);
    name += ' ' + fmtD(range.from) + ' - ' + fmtD(inclEnd);
  } else {
    name += ' ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const today = new Date().toLocaleDateString();
  const lastDate = localStorage.getItem(EXPORT_DATE_KEY);
  let ver = parseInt(localStorage.getItem(EXPORT_VER_KEY) || '0', 10);
  if (lastDate === today) {
    ver++;
  } else {
    ver = 0;
  }
  localStorage.setItem(EXPORT_DATE_KEY, today);
  localStorage.setItem(EXPORT_VER_KEY, String(ver));
  if (ver > 0) name += ' - v' + ver;

  return name;
}

const COL_WIDTHS = [160, 90, 85, 100, 90, 80, 85, 80, 85, 100, 70, 130, 85, 85, 100, 100];

const COL_FORMATS: ({ col: number; fmt: string } | null)[] = [
  { col: 1, fmt: '[h]:mm:ss' },
  { col: 2, fmt: '$#,##0.00' },
  { col: 3, fmt: '#,##0' },
  { col: 4, fmt: '#,##0' },
  { col: 5, fmt: '0.00%' },
  { col: 6, fmt: '#,##0' },
  { col: 7, fmt: '0.00%' },
  { col: 8, fmt: '#,##0' },
  { col: 9, fmt: '#,##0' },
  { col: 10, fmt: '0.00%' },
  { col: 11, fmt: '[h]:mm:ss' },
  null,
  { col: 13, fmt: '$#,##0.00' },
  { col: 14, fmt: '#,##0' },
  { col: 15, fmt: '0.00' },
];

export async function exportToGoogleSheets(
  data: EmployeeMetrics[],
  hubstaffRaw: ParsedCSV | null,
  period: PeriodType,
  customFrom: string | null,
  customTo: string | null,
  activeChatters: Set<string>,
  chatterTeamMap: Map<string, string>,
  onProgress: (msg: string) => void
): Promise<string> {
  const cid = getGsheetClientId();
  if (!cid) throw new Error('No Client ID configured');

  if (typeof google === 'undefined' || !google.accounts) {
    throw new Error('Google Identity Services not loaded. Reload the page.');
  }

  onProgress('Authenticating...');
  const accessToken = await new Promise<string>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      callback: (resp: { error?: string; access_token?: string }) => {
        if (resp.error) reject(new Error('Auth error: ' + resp.error));
        else resolve(resp.access_token!);
      },
      error_callback: () => reject(new Error('Authentication failed')),
    });
    tokenClient.requestAccessToken();
  });

  if (!data.length) throw new Error('No data to export');

  onProgress('Preparing data...');
  function isActiveChatter(r: EmployeeMetrics): boolean {
    const hasActivity = !isNaN(Number(r.directMessagesSent)) && Number(r.directMessagesSent) > 0;
    if (activeChatters.size === 0) return hasActivity;
    const name = String(r.employee).toLowerCase().trim().replace(/\s+/g, ' ');
    if (activeChatters.has(name)) return true;
    const parts = name.split(' ');
    if (parts.length >= 2 && activeChatters.has(parts[0] + ' ' + parts[parts.length - 1])) return true;
    if (activeChatters.has(parts[0])) return true;
    return hasActivity;
  }
  const sorted = [...data].sort((a, b) => {
    const aa = isActiveChatter(a), ba = isActiveChatter(b);
    if (aa !== ba) return aa ? -1 : 1;
    return String(a.employee).localeCompare(String(b.employee));
  });
  const firstInactiveIdx = sorted.findIndex(r => !isActiveChatter(r));

  const TL_TEAMS = ['DANILYN', 'HUCKLE', 'EZEKIEL'] as const;
  const teams: Record<string, EmployeeMetrics[]> = {};
  for (const tl of TL_TEAMS) teams[tl] = [];
  const miscEmployees: EmployeeMetrics[] = [];

  function resolveTeam(r: EmployeeMetrics): string | null {
    const name = String(r.employee).toLowerCase().trim().replace(/\s+/g, ' ');
    if (chatterTeamMap.has(name)) return chatterTeamMap.get(name)!;
    const parts = name.split(' ');
    if (parts.length >= 2) {
      const fl = parts[0] + ' ' + parts[parts.length - 1];
      if (chatterTeamMap.has(fl)) return chatterTeamMap.get(fl)!;
    }
    if (chatterTeamMap.has(parts[0])) return chatterTeamMap.get(parts[0])!;
    const csvTeam = extractTeamName(String(r.group));
    if (csvTeam && TL_TEAMS.includes(csvTeam as typeof TL_TEAMS[number])) return csvTeam;
    return null;
  }

  for (const r of sorted) {
    const tn = resolveTeam(r);
    if (tn && teams[tn]) {
      teams[tn].push(r);
    } else if (!isActiveChatter(r)) {
      miscEmployees.push(r);
    }
  }
  const teamNames = [...TL_TEAMS];

  const HEADERS = [
    'Employees', 'Duration', 'Sales', 'Direct messages sent', 'Direct PPVs sent',
    'Golden ratio', 'PPVs unlocked', 'Unlock rate', 'Fans chatted',
    'Fans who spent money', 'Fan CVR', 'Response time (based on clocked hours)',
    'Clocked hours', 'Sales per hour', 'Character count', 'Messages sent per hour',
  ];

  const sheetTitles = ['By employee', 'TL BONUSES', ...teamNames, 'MISCELLANEOUS', 'HUBSTAFF HOURS'];

  onProgress('Creating spreadsheet...');
  const range = getDateRange(period, customFrom, customTo);
  const title = getExportTitle(range);
  const createBody = {
    properties: { title },
    sheets: sheetTitles.map(t => ({ properties: { title: t } })),
  };
  const created = await sheetsApi('', 'POST', createBody, accessToken);
  const spreadsheetId = created.spreadsheetId;
  localStorage.setItem(GSHEET_ID_KEY, spreadsheetId);

  onProgress('Writing data...');

  const dataStart = 4;
  const dataEnd = dataStart + sorted.length - 1;
  const avgCols: Record<string, boolean> = { B: true, C: true, F: true, K: true, L: true, N: true, P: true };

  const byEmpRows: (string | number)[][] = [];
  byEmpRows.push(HEADERS);
  const avgRow: (string | number)[] = ['AVERAGE'];
  for (let c = 1; c < HEADERS.length; c++) {
    const col = String.fromCharCode(65 + c);
    avgRow.push(avgCols[col] ? '=AVERAGE(' + col + dataStart + ':' + col + dataEnd + ')' : '');
  }
  byEmpRows.push(avgRow);

  const scoreRow = ['SCORE POINTS', '', '', '', '',
    '=IF(F2>=4%,1,0)', '', '=IF(H2>=45%,1,0)', '', '',
    '=IF(K2>=10%,3,IF(K2>=9%,2,IF(K2>=8%,1,0)))', '2', '', '1', '', ''];
  byEmpRows.push(scoreRow);

  for (const r of sorted) byEmpRows.push(buildEmployeeRow(r));

  const valueRanges: { range: string; values: (string | number)[][] }[] = [];
  valueRanges.push({ range: "'By employee'!A1", values: byEmpRows });

  const tlRows: (string | number)[][] = [];
  let tlRow = 1;
  for (const tn of teamNames) {
    const activeTeam = teams[tn].filter(r => isActiveChatter(r));
    const sphData = activeTeam.filter(r => !isNaN(Number(r.salesPerHour)));
    const teamAvgSph = sphData.length ? sphData.reduce((s, r) => s + Number(r.salesPerHour), 0) / sphData.length : 0;
    const cvrs = activeTeam.filter(r => !isNaN(Number(r.fanCvr)) && Number(r.fanCvr) > 0);
    const teamAvgCvr = cvrs.length ? cvrs.reduce((s, r) => s + Number(r.fanCvr), 0) / cvrs.length / 100 : 0;
    const rts = activeTeam.filter(r => !isNaN(Number(r.responseTime)) && Number(r.responseTime) > 0);
    const avgRtSec = rts.length ? rts.reduce((s, r) => s + Number(r.responseTime), 0) / rts.length : 0;
    const teamAvgRt: string | number = rts.length ? secsToSerial(avgRtSec) : '-';

    tlRows.push([tn, '', '']);
    tlRows.push(['METRICS', 'CURRENT', 'BONUS']);
    tlRows.push(['Team Avg. $/hr', Math.round(teamAvgSph * 100) / 100, 0]);
    tlRows.push(['Fan CVR', teamAvgCvr, 0]);
    tlRows.push(['Avg. Reply Time', teamAvgRt, 0]);
    tlRows.push(['TOTAL:', '', '=SUM(D' + (tlRow + 1) + ':D' + (tlRow + 3) + ')']);
    tlRows.push([]);
    tlRow += 7;
  }
  valueRanges.push({ range: "'TL BONUSES'!B2", values: tlRows });

  const teamFirstInactive: Record<string, number> = {};
  for (const tn of teamNames) {
    const teamData = [...teams[tn]].sort((a, b) => {
      const aa = isActiveChatter(a), ba = isActiveChatter(b);
      if (aa !== ba) return aa ? -1 : 1;
      return (isNaN(Number(b.sales)) ? -Infinity : Number(b.sales)) - (isNaN(Number(a.sales)) ? -Infinity : Number(a.sales));
    });
    teams[tn] = teamData;
    teamFirstInactive[tn] = teamData.findIndex(r => !isActiveChatter(r));
    const teamRows: (string | number)[][] = [];
    teamRows.push(HEADERS);
    for (const r of teamData) teamRows.push(buildEmployeeRow(r));
    const lastRow = teamData.length + 1;
    const avgTeam: (string | number)[] = [];
    for (let c = 0; c < HEADERS.length; c++) {
      const col = String.fromCharCode(65 + c);
      if (col === 'K' || col === 'N' || col === 'P') {
        avgTeam.push('=AVERAGE(' + col + '2:' + col + lastRow + ')');
      } else {
        avgTeam.push('');
      }
    }
    teamRows.push(avgTeam);
    valueRanges.push({ range: "'" + tn + "'!A1", values: teamRows });
  }

  // MISCELLANEOUS sheet — unverified / inactive employees
  const miscRows: (string | number)[][] = [];
  miscRows.push(HEADERS);
  const miscSorted = [...miscEmployees].sort((a, b) =>
    (isNaN(Number(b.sales)) ? -Infinity : Number(b.sales)) - (isNaN(Number(a.sales)) ? -Infinity : Number(a.sales))
  );
  for (const r of miscSorted) miscRows.push(buildEmployeeRow(r));
  if (miscSorted.length === 0) miscRows.push(['(No unverified employees)']);
  valueRanges.push({ range: "'MISCELLANEOUS'!A1", values: miscRows });

  if (hubstaffRaw) {
    const hMap = buildMap(hubstaffRaw.headers, HUBSTAFF_ALIASES);
    const hRows: (string | number)[][] = [['Organization', 'Time Zone', 'Member', 'TOTAL HOURS', 'Activity', 'Spent total', 'Currency']];
    const dateIdx = hMap.date;
    const hRange = getDateRange(period, customFrom, customTo);
    const rows = hRange && dateIdx != null ? hubstaffRaw.rows.filter(r => {
      const d = r[dateIdx] ? String(r[dateIdx]).trim().slice(0, 10) : null;
      return d && d >= hRange.from && d < hRange.to;
    }) : hubstaffRaw.rows;
    for (const row of rows) {
      const name = hMap.employee != null ? (row[hMap.employee] || '').trim() : '';
      if (!name) continue;
      hRows.push(['Chatting Wizard ENG', 'UTC', name, fmtClockedExport(parseHoursExport(row[hMap.hours])), row[4] || '', row[5] || '', row[6] || 'USD']);
    }
    valueRanges.push({ range: "'HUBSTAFF HOURS'!A1", values: hRows });
  } else {
    valueRanges.push({
      range: "'HUBSTAFF HOURS'!A1",
      values: [['Organization', 'Time Zone', 'Member', 'TOTAL HOURS', 'Activity', 'Spent total', 'Currency'],
      ['(No Hubstaff data loaded)']],
    });
  }

  await sheetsApi('/' + spreadsheetId + '/values:batchUpdate', 'POST', {
    valueInputOption: 'USER_ENTERED',
    data: valueRanges,
  }, accessToken);

  onProgress('Applying formatting...');

  const meta = await sheetsApi('/' + spreadsheetId + '?fields=sheets.properties', 'GET', undefined, accessToken);
  const sheetIdMap: Record<string, number> = {};
  for (const s of meta.sheets) sheetIdMap[s.properties.title] = s.properties.sheetId;

  const fmtReqs: unknown[] = [];
  const WHITE = { red: 1, green: 1, blue: 1 };
  const BLACK = { red: 0, green: 0, blue: 0 };
  const defaultFont = { fontFamily: 'Montserrat', fontSize: 10 };

  function cellFmt(sid: number, r1: number, r2: number, c1: number, c2: number, fmt: Record<string, unknown>) {
    const fields = Object.keys(fmt).map(k => 'userEnteredFormat.' + k).join(',');
    fmtReqs.push({ repeatCell: {
      range: { sheetId: sid, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 },
      cell: { userEnteredFormat: fmt }, fields,
    }});
  }

  function applyNumberFormats(sid: number, totalRows: number) {
    for (const cf of COL_FORMATS) {
      if (!cf) continue;
      const fmtType = cf.fmt.includes('$') ? 'CURRENCY' : cf.fmt.includes('%') ? 'PERCENT' : cf.fmt.includes(':') ? 'TIME' : 'NUMBER';
      cellFmt(sid, 1, totalRows, cf.col, cf.col + 1, {
        numberFormat: { type: fmtType, pattern: cf.fmt },
      });
    }
  }

  function setColumnWidths(sid: number, widths: number[]) {
    for (let i = 0; i < widths.length; i++) {
      fmtReqs.push({ updateDimensionProperties: {
        range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: widths[i] }, fields: 'pixelSize',
      }});
    }
  }

  function applyMainSheetFormat(sid: number, headerRow: number, avgRow: number, scoreRow: number, dStart: number, dEnd: number, totalCols: number) {
    cellFmt(sid, 0, dEnd, 0, totalCols, {
      textFormat: { ...defaultFont, foregroundColor: BLACK },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'MIDDLE',
      wrapStrategy: 'CLIP',
    });

    cellFmt(sid, headerRow, headerRow + 1, 0, totalCols, {
      backgroundColor: rgb('F1C232'),
      textFormat: { ...defaultFont, bold: true, foregroundColor: rgb('5B0F00'), fontSize: 9 },
      horizontalAlignment: 'CENTER',
      wrapStrategy: 'WRAP',
    });

    if (avgRow >= 0) {
      cellFmt(sid, avgRow, avgRow + 1, 0, 1, {
        backgroundColor: rgb('FF9900'),
        textFormat: { ...defaultFont, bold: true, foregroundColor: WHITE },
      });
      cellFmt(sid, avgRow, avgRow + 1, 1, totalCols, {
        backgroundColor: rgb('FFFF00'),
        textFormat: { ...defaultFont, bold: true },
      });
    }

    if (scoreRow >= 0) {
      cellFmt(sid, scoreRow, scoreRow + 1, 0, 1, {
        backgroundColor: rgb('1155CC'),
        textFormat: { ...defaultFont, bold: true, foregroundColor: WHITE },
      });
      cellFmt(sid, scoreRow, scoreRow + 1, 1, totalCols, {
        backgroundColor: rgb('00FFFF'),
        textFormat: { ...defaultFont, bold: true },
      });
    }

    cellFmt(sid, dStart, dEnd, 0, 1, {
      textFormat: { ...defaultFont, bold: false },
      horizontalAlignment: 'LEFT',
    });

    cellFmt(sid, dStart, dEnd, 1, 2, {
      backgroundColor: rgb('EFEFEF'),
      textFormat: { ...defaultFont, bold: true, foregroundColor: rgb('B45F06') },
    });

    const cyanCols = [10, 13, 15];
    for (const ci of cyanCols) {
      cellFmt(sid, headerRow, headerRow + 1, ci, ci + 1, {
        backgroundColor: rgb('00FFFF'),
        textFormat: { ...defaultFont, bold: true, foregroundColor: rgb('5B0F00') },
      });
    }

    cellFmt(sid, dStart, dEnd, 2, 3, { backgroundColor: rgb('D9EAD3') });

    fmtReqs.push({ updateBorders: {
      range: { sheetId: sid, startRowIndex: headerRow, endRowIndex: dEnd, startColumnIndex: 0, endColumnIndex: totalCols },
      top: { style: 'SOLID', width: 1, color: rgb('999999') },
      bottom: { style: 'SOLID', width: 1, color: rgb('999999') },
      left: { style: 'SOLID', width: 1, color: rgb('999999') },
      right: { style: 'SOLID', width: 1, color: rgb('999999') },
      innerHorizontal: { style: 'SOLID', width: 1, color: rgb('D9D9D9') },
      innerVertical: { style: 'SOLID', width: 1, color: rgb('D9D9D9') },
    }});

    setColumnWidths(sid, COL_WIDTHS);

    fmtReqs.push({ updateDimensionProperties: {
      range: { sheetId: sid, dimension: 'ROWS', startIndex: headerRow, endIndex: headerRow + 1 },
      properties: { pixelSize: 50 }, fields: 'pixelSize',
    }});
    fmtReqs.push({ updateDimensionProperties: {
      range: { sheetId: sid, dimension: 'ROWS', startIndex: dStart, endIndex: dEnd },
      properties: { pixelSize: 24 }, fields: 'pixelSize',
    }});
  }

  // Format "By employee" sheet
  const byEmpSid = sheetIdMap['By employee'];
  if (byEmpSid != null) {
    const totalRows = 3 + sorted.length;
    applyNumberFormats(byEmpSid, totalRows);
    applyMainSheetFormat(byEmpSid, 0, 1, 2, 3, totalRows, 16);

    if (firstInactiveIdx >= 0) {
      const inactiveStart = 3 + firstInactiveIdx;
      cellFmt(byEmpSid, inactiveStart, totalRows, 0, 16, {
        backgroundColor: rgb('F4CCCC'),
        textFormat: { ...defaultFont, foregroundColor: rgb('990000') },
      });
    }
  }

  // Format team sheets
  for (const tn of teamNames) {
    const sid = sheetIdMap[tn];
    if (sid == null) continue;
    const cnt = teams[tn].length;
    const totalRows = 1 + cnt + 1;
    applyNumberFormats(sid, totalRows);
    applyMainSheetFormat(sid, 0, -1, -1, 1, 1 + cnt, 16);

    cellFmt(sid, 1 + cnt, 1 + cnt + 1, 10, 16, {
      backgroundColor: rgb('FFFF00'),
      textFormat: { ...defaultFont, bold: true },
    });

    const tfi = teamFirstInactive[tn];
    if (tfi >= 0) {
      const inactiveStart = 1 + tfi;
      cellFmt(sid, inactiveStart, 1 + cnt, 0, 16, {
        backgroundColor: rgb('F4CCCC'),
        textFormat: { ...defaultFont, foregroundColor: rgb('990000') },
      });
    }
  }

  // Format MISCELLANEOUS sheet
  const miscSid = sheetIdMap['MISCELLANEOUS'];
  if (miscSid != null && miscSorted.length > 0) {
    const miscTotal = 1 + miscSorted.length;
    applyNumberFormats(miscSid, miscTotal);
    applyMainSheetFormat(miscSid, 0, -1, -1, 1, miscTotal, 16);
    cellFmt(miscSid, 1, miscTotal, 0, 16, {
      backgroundColor: rgb('F4CCCC'),
      textFormat: { ...defaultFont, foregroundColor: rgb('990000') },
    });
  }

  // Format TL BONUSES sheet
  const tlSid = sheetIdMap['TL BONUSES'];
  if (tlSid != null) {
    let offset = 1;
    for (let ti = 0; ti < teamNames.length; ti++) {
      cellFmt(tlSid, offset, offset + 1, 1, 4, {
        backgroundColor: rgb('D9D2E9'),
        textFormat: { ...defaultFont, bold: true, foregroundColor: rgb('20124D') },
      });
      cellFmt(tlSid, offset + 1, offset + 2, 1, 4, {
        backgroundColor: rgb('8E7CC3'),
        textFormat: { ...defaultFont, bold: true, foregroundColor: WHITE },
      });
      // $/hr row — currency format
      fmtReqs.push({ repeatCell: {
        range: { sheetId: tlSid, startRowIndex: offset + 2, endRowIndex: offset + 3, startColumnIndex: 2, endColumnIndex: 3 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' } } },
        fields: 'userEnteredFormat.numberFormat',
      }});
      // CVR row — percentage format
      fmtReqs.push({ repeatCell: {
        range: { sheetId: tlSid, startRowIndex: offset + 3, endRowIndex: offset + 4, startColumnIndex: 2, endColumnIndex: 3 },
        cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.00%' } } },
        fields: 'userEnteredFormat.numberFormat',
      }});
      // Reply Time row — time format
      fmtReqs.push({ repeatCell: {
        range: { sheetId: tlSid, startRowIndex: offset + 4, endRowIndex: offset + 5, startColumnIndex: 2, endColumnIndex: 3 },
        cell: { userEnteredFormat: { numberFormat: { type: 'TIME', pattern: 'mm:ss' } } },
        fields: 'userEnteredFormat.numberFormat',
      }});
      cellFmt(tlSid, offset + 5, offset + 6, 1, 4, {
        backgroundColor: rgb('FFE599'),
        textFormat: { ...defaultFont, bold: true },
      });
      fmtReqs.push({ updateBorders: {
        range: { sheetId: tlSid, startRowIndex: offset, endRowIndex: offset + 6, startColumnIndex: 1, endColumnIndex: 4 },
        top: { style: 'SOLID', width: 1, color: rgb('999999') },
        bottom: { style: 'SOLID', width: 1, color: rgb('999999') },
        left: { style: 'SOLID', width: 1, color: rgb('999999') },
        right: { style: 'SOLID', width: 1, color: rgb('999999') },
        innerHorizontal: { style: 'SOLID', width: 1, color: rgb('D9D9D9') },
        innerVertical: { style: 'SOLID', width: 1, color: rgb('D9D9D9') },
      }});
      offset += 7;
    }
    fmtReqs.push({ autoResizeDimensions: { dimensions: { sheetId: tlSid, dimension: 'COLUMNS', startIndex: 0, endIndex: 5 } } });
  }

  // Format HUBSTAFF HOURS sheet
  const hSid = sheetIdMap['HUBSTAFF HOURS'];
  if (hSid != null) {
    cellFmt(hSid, 0, 1, 0, 7, {
      backgroundColor: rgb('F1C232'),
      textFormat: { ...defaultFont, bold: true, foregroundColor: rgb('5B0F00') },
      horizontalAlignment: 'CENTER',
    });
    fmtReqs.push({ updateBorders: {
      range: { sheetId: hSid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 7 },
      bottom: { style: 'SOLID', width: 2, color: rgb('B45F06') },
    }});
    fmtReqs.push({ autoResizeDimensions: { dimensions: { sheetId: hSid, dimension: 'COLUMNS', startIndex: 0, endIndex: 7 } } });
  }

  if (fmtReqs.length > 0) {
    await sheetsApi('/' + spreadsheetId + ':batchUpdate', 'POST', { requests: fmtReqs }, accessToken);
  }

  const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId;
  return sheetUrl;
}

function parseHoursExport(v: unknown): number {
  if (v == null || v === '' || v === '-') return NaN;
  const s = String(v).trim().replace(/,/g, '.');
  const hmin = s.match(/^(\d+)h\s*(\d+)\s*min/i);
  if (hmin) return parseInt(hmin[1]) + parseInt(hmin[2]) / 60;
  const hm = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60 + (hm[3] ? parseInt(hm[3]) / 3600 : 0);
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

// ── Calendar helpers ──

export function buildCalendarMonth(year: number, month: number, range: { from: string; to: string } | null): {
  title: string;
  days: { date: string; day: number; isToday: boolean; inRange: boolean; isStart: boolean; isEnd: boolean; isSingle: boolean }[];
  blanks: number;
} {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dow = (first.getUTCDay() + 6) % 7;
  const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const now = new Date();
  const todayStr = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    let inRange = false, isStart = false, isEnd = false, isSingle = false;
    if (range) {
      const inclEnd = addDays(range.to, -1);
      if (range.from === inclEnd && ds === range.from) isSingle = true;
      else if (ds === range.from) isStart = true;
      else if (ds === inclEnd) isEnd = true;
      else if (ds > range.from && ds < inclEnd) inRange = true;
    }
    days.push({ date: ds, day: d, isToday: ds === todayStr, inRange, isStart, isEnd, isSingle });
  }

  return { title, days, blanks: dow };
}

// ── Init ──

export function migrateHistory() {
  const ver = parseInt(localStorage.getItem(HISTORY_VER_KEY) || '0');
  if (ver < HISTORY_VER) {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.setItem(HISTORY_VER_KEY, String(HISTORY_VER));
  }
}

// Google Identity Services type declarations
declare global {
  const google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (resp: { error?: string; access_token?: string }) => void;
          error_callback: () => void;
        }) => { requestAccessToken: () => void };
      };
    };
  };
}

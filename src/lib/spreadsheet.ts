function normalizeCellValue(val: unknown): unknown {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString().split('T')[0];

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('result' in obj && 'formula' in obj) return obj.result ?? '';
    if ('richText' in obj && Array.isArray(obj.richText)) return (obj.richText as { text: string }[]).map(r => r.text).join('');
    if ('hyperlink' in obj && 'text' in obj) return obj.text ?? '';
    if ('error' in obj) return '';
  }

  return String(val);
}

/**
 * Parse a CSV string into an array of row objects keyed by header names.
 * Handles quoted fields, commas inside quotes, and CRLF/LF line endings.
 */
function parseCSV(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        current.push(field);
        if (current.some(f => f.trim())) rows.push(current);
        current = [];
        field = '';
      } else { field += ch; }
    }
  }
  if (field || current.length) { current.push(field); if (current.some(f => f.trim())) rows.push(current); }

  if (rows.length < 2) return [];

  const headers = rows[0]!;
  return rows.slice(1).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (row[idx] ?? '').trim();
    });
    return obj;
  });
}

/**
 * Read a spreadsheet file (.xlsx or .csv) and return rows as objects
 * with header names as keys — same format as the old XLSX.utils.sheet_to_json().
 */
export async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer);
    return parseCSV(text);
  }

  if (ext === 'xls') {
    throw new Error('The .xls format is not supported. Please export as .xlsx or .csv.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) throw new Error('File has no data');

  const headerRow = worksheet.getRow(1);
  const headers: Map<number, string> = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const val = normalizeCellValue(cell.value);
    if (val) headers.set(colNumber, String(val));
  });

  if (headers.size === 0) throw new Error('No headers found in first row');

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let hasData = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers.get(colNumber);
      if (header) {
        obj[header] = normalizeCellValue(cell.value);
        hasData = true;
      }
    });
    if (hasData) rows.push(obj);
  });

  return rows;
}

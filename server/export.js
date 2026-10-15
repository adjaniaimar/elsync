const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const COLUMNS = [
  { key: 'recorded_at', label: 'Timestamp' },
  { key: 'tegangan_r', label: 'Tegangan R (V)' },
  { key: 'tegangan_s', label: 'Tegangan S (V)' },
  { key: 'tegangan_t', label: 'Tegangan T (V)' },
  { key: 'arus_r', label: 'Arus R (A)' },
  { key: 'arus_s', label: 'Arus S (A)' },
  { key: 'arus_t', label: 'Arus T (A)' },
  { key: 'daya_r', label: 'Daya R (W)' },
  { key: 'daya_s', label: 'Daya S (W)' },
  { key: 'daya_t', label: 'Daya T (W)' },
  { key: 'daya_total', label: 'Daya Total (W)' },
  { key: 'pf', label: 'PF' },
  { key: 'frekuensi', label: 'Frekuensi (Hz)' },
  { key: 'kwh', label: 'KWH (kWh)' },
];

// FORMAT DATE
function formatTimestamp(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function prepareRows(rows) {
  return rows.map(row => ({
    ...row,
    recorded_at: formatTimestamp(row.recorded_at),
  }));
}

// JSON
function toJSON(rows) {
  return JSON.stringify(prepareRows(rows), null, 2);
}

// CSV
function csvCell(value) {
  let s = value == null ? '' : String(value);
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(s);
  if (!isPlainNumber && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(rows) {
  const formatted = prepareRows(rows);
  const header = COLUMNS.map(c => csvCell(c.label)).join(',');
  const lines = formatted.map(row =>
    COLUMNS.map(c => csvCell(row[c.key])).join(',')
  );
  return [header, ...lines].join('\n');
}

// EXCEL
async function toExcel(rows) {
  const formatted = prepareRows(rows);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Log Polling');

  sheet.columns = COLUMNS.map(c => ({ header: c.label, key: c.key, width: 16 }));
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6E0D12' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  formatted.forEach(row => sheet.addRow(row));

  return workbook.xlsx.writeBuffer();
}

// PDF
function toPDF(rows) {
  const formatted = prepareRows(rows);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#6E0D12').text('ELSYNC — Log Polling Export', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#444').text(`Generated: ${formatTimestamp(new Date())}`);
    doc.moveDown(1);

    const startX = 30;
    let y = doc.y;
    const colWidths = [104, ...Array(COLUMNS.length - 1).fill(52)];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    // HEADER
    const HEADER_H = 28;
    doc.fontSize(8).fillColor('#fff');
    doc.rect(startX, y, totalWidth, HEADER_H).fill('#6E0D12');
    doc.fillColor('#fff');
    let x = startX;
    COLUMNS.forEach((c, i) => {
      doc.text(c.label, x + 4, y + 5, { width: colWidths[i] - 8 });
      x += colWidths[i];
    });
    y += HEADER_H;

    // ROWS
    doc.fontSize(8);
    formatted.forEach((row, idx) => {
      if (y > 550) {
        doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
        y = 30;
      }
      if (idx % 2 === 0) {
        doc.rect(startX, y, totalWidth, 18).fill('#F7F2F1');
      }
      doc.fillColor('#000');
      x = startX;
      COLUMNS.forEach((c, i) => {
        doc.text(String(row[c.key]), x + 4, y + 4, { width: colWidths[i] - 8, lineBreak: false });
        x += colWidths[i];
      });
      y += 18;
    });

    doc.end();
  });
}

module.exports = { toJSON, toCSV, toExcel, toPDF };
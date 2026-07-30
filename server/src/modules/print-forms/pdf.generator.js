import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const regularFont = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const boldFont = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawHeader(doc, data) {
  doc.font('Bold').fontSize(13).text(data.title, { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Regular').fontSize(8);
  const lines = [
    `Заказчик: ${data.dpo.fullName || data.dpo.name}`,
    `ДПО: ${data.dpo.name}`,
    `Период: ${data.from} - ${data.to}`,
    `Договор: ${[data.dpo.contractNumber, data.dpo.contractDate].filter(Boolean).join(' от ') || '-'}`,
    `Руководитель: ${data.dpo.directorFullName || '-'}`,
  ];
  lines.forEach((line) => doc.text(line));
  doc.moveDown(0.5);
}

function computeWidths(columns, availableWidth) {
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  return columns.map((column) => (column.width / total) * availableWidth);
}

function formatValue(column, value) {
  if (value == null || value === '') return '';
  if (!column.numeric || !Number.isFinite(Number(value))) return String(value);
  const decimals = column.numberFormat?.includes('0000') ? 4 : 0;
  return Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function rowHeight(doc, values, widths, fontSize, padding = 3) {
  doc.fontSize(fontSize);
  return (
    Math.max(
      18,
      ...values.map((value, index) =>
        doc.heightOfString(String(value ?? ''), {
          width: Math.max(8, widths[index] - padding * 2),
          align: 'left',
        }),
      ),
    ) +
    padding * 2
  );
}

function drawRow(doc, values, widths, y, { bold = false, fill = null, fontSize = 7 } = {}) {
  const xStart = doc.page.margins.left;
  const height = rowHeight(doc, values, widths, fontSize);
  let x = xStart;
  doc.font(bold ? 'Bold' : 'Regular').fontSize(fontSize);
  values.forEach((value, index) => {
    if (fill) doc.save().fillColor(fill).rect(x, y, widths[index], height).fill().restore();
    doc.rect(x, y, widths[index], height).strokeColor('#666666').lineWidth(0.5).stroke();
    doc.fillColor('#111111').text(String(value ?? ''), x + 3, y + 3, {
      width: widths[index] - 6,
      height: height - 6,
      align: index === 0 ? 'left' : 'center',
    });
    x += widths[index];
  });
  return height;
}

export async function generatePdf(data) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 24, right: 24, bottom: 28, left: 24 },
    bufferPages: true,
  });
  doc.registerFont('Regular', regularFont);
  doc.registerFont('Bold', boldFont);
  const output = collectPdf(doc);
  const widths = computeWidths(data.columns, doc.page.width - 48);
  const contentBottom = () => doc.page.height - doc.page.margins.bottom - 54;

  const drawTableHeader = () =>
    drawRow(
      doc,
      data.columns.map((column) => column.label),
      widths,
      doc.y,
      {
        bold: true,
        fill: '#D9EAF7',
        fontSize: 6.5,
      },
    );

  drawHeader(doc, data);
  let y = doc.y;
  y += drawTableHeader();

  for (const row of data.rows) {
    const values = data.columns.map((column) => formatValue(column, row[column.key]));
    const height = rowHeight(doc, values, widths, 6.5);
    if (y + height > contentBottom()) {
      doc.addPage();
      drawHeader(doc, data);
      y = doc.y;
      y += drawTableHeader();
    }
    y += drawRow(doc, values, widths, y, { fontSize: 6.5 });
  }
  const totalValues = data.columns.map((column, index) =>
    index === 0 ? 'ИТОГО' : column.total ? formatValue(column, data.totals[column.key]) : '',
  );
  if (y + 70 > contentBottom()) {
    doc.addPage();
    drawHeader(doc, data);
    y = doc.y;
    y += drawTableHeader();
  }
  y += drawRow(doc, totalValues, widths, y, { bold: true, fill: '#E2F0D9' });
  doc.y = y + 14;
  doc.font('Regular').fontSize(8);
  doc.text('ИСПОЛНИТЕЛЬ __________________ / __________________', 24, doc.y, {
    width: (doc.page.width - 48) / 2,
  });
  doc.text(
    `ЗАКАЗЧИК __________________ / ${data.dpo.directorFullName || '__________________'}`,
    doc.page.width / 2,
    doc.y - 10,
    { width: (doc.page.width - 48) / 2 },
  );

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font('Regular')
      .fontSize(7)
      .text(
        `Страница ${index + 1} из ${range.count}`,
        24,
        doc.page.height - doc.page.margins.bottom - 9,
        { width: doc.page.width - 48, align: 'center', lineBreak: false },
      );
  }
  doc.end();
  return output;
}

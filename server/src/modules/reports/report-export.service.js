import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import { ApiError } from '../../utils/api-error.js';
import { reportsService } from './reports.service.js';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const REPORTS = {
  'stock-balances': {
    method: 'stockBalances',
    title: 'Остатки по складам',
    columns: [
      ['warehouse.name', 'Склад', 24],
      ['model.name', 'Модель', 38],
      ['size.value', 'Размер', 12],
      ['heightSize.value', 'Рост', 10],
      ['quantity', 'Количество', 14, 'number'],
      ['totalCost', 'Стоимость', 18, 'money'],
    ],
    totals: { quantity: 'quantity', totalCost: 'totalCost' },
  },
  'property-cost': {
    method: 'propertyCost',
    title: 'Стоимость выданного имущества',
    columns: [
      ['employeeName', 'Работник', 34],
      ['dpoName', 'ДПО', 24],
      ['itemsCount', 'Предметов', 12, 'number'],
      ['cost', 'Стоимость', 18, 'money'],
      ['employeeCost', 'Для работника', 18, 'money'],
    ],
    totals: { itemsCount: 'itemsCount', cost: 'cost', employeeCost: 'employeeCost' },
  },
  purchases: {
    method: 'purchases',
    title: 'Закупки за период',
    columns: [
      ['number', 'Номер', 18],
      ['documentDate', 'Дата', 13, 'date'],
      ['supplierName', 'Поставщик', 28],
      ['warehouseName', 'Склад', 24],
      ['quantity', 'Количество', 13, 'number'],
      ['cost', 'Стоимость', 18, 'money'],
      ['employeeCost', 'Для работника', 18, 'money'],
    ],
    totals: { quantity: 'quantity', cost: 'cost', employeeCost: 'employeeCost' },
  },
  suppliers: {
    method: 'suppliers',
    title: 'Закупки по поставщикам',
    columns: [
      ['supplierName', 'Поставщик', 38],
      ['documentsCount', 'Документов', 14, 'number'],
      ['quantity', 'Количество', 14, 'number'],
      ['cost', 'Стоимость', 20, 'money'],
    ],
    totals: { documentsCount: 'documentsCount', quantity: 'quantity', cost: 'cost' },
  },
  writeoffs: {
    method: 'writeoffs',
    title: 'Списания за период',
    columns: [
      ['number', 'Номер', 18],
      ['documentDate', 'Дата', 13, 'date'],
      ['warehouseName', 'Склад', 24],
      ['itemsCount', 'Позиций', 12, 'number'],
      ['reasons', 'Причины', 34, 'list'],
      ['cost', 'Стоимость', 18, 'money'],
    ],
    totals: { itemsCount: 'itemsCount', cost: 'cost' },
  },
  repairs: {
    method: 'repairs',
    title: 'Завершённые ремонты',
    columns: [
      ['number', 'Номер', 18],
      ['completedAt', 'Завершён', 18, 'datetime'],
      ['warehouseName', 'Склад', 26],
      ['itemsCount', 'Позиций', 12, 'number'],
      ['cost', 'Стоимость ремонта', 20, 'money'],
    ],
    totals: { itemsCount: 'itemsCount', cost: 'cost' },
  },
  warehouses: {
    method: 'warehouses',
    title: 'Движения и остатки по складам',
    columns: [
      ['warehouseName', 'Склад', 30],
      ['incoming', 'Поступления', 15, 'number'],
      ['outgoing', 'Выбытия', 15, 'number'],
      ['balanceQuantity', 'Остаток, шт.', 15, 'number'],
      ['balanceCost', 'Остаток, стоимость', 22, 'money'],
    ],
    totals: {
      incoming: 'incoming',
      outgoing: 'outgoing',
      balanceQuantity: 'balanceQuantity',
      balanceCost: 'balanceCost',
    },
  },
  employees: {
    method: 'employees',
    title: 'Работники',
    columns: [
      ['fullName', 'ФИО', 34],
      ['dpoName', 'ДПО', 24],
      ['hireDate', 'Дата приёма', 13, 'date'],
      ['terminationDate', 'Дата увольнения', 15, 'date'],
      ['tenureDays', 'Стаж, дн.', 12, 'number'],
      ['coverageDaysInPeriod', 'Дни обеспечения', 16, 'number'],
      ['propertyCost', 'Стоимость имущества', 20, 'money'],
    ],
    totals: {
      coverageDaysInPeriod: 'coverageDaysInPeriod',
      propertyCost: 'propertyCost',
    },
  },
  dpo: {
    method: 'dpo',
    title: 'Отчёт по ДПО',
    columns: [
      ['dpoName', 'ДПО', 32],
      ['employeesCount', 'Работников', 14, 'number'],
      ['issuedQuantityInPeriod', 'Выдано, шт.', 14, 'number'],
      ['coverageDaysInPeriod', 'Дни обеспечения', 18, 'number'],
      ['propertyCost', 'Стоимость имущества', 22, 'money'],
    ],
    totals: {
      employeesCount: 'employeesCount',
      issuedQuantityInPeriod: 'issuedQuantityInPeriod',
      coverageDaysInPeriod: 'coverageDaysInPeriod',
      propertyCost: 'propertyCost',
    },
  },
};

function valueAt(row, path) {
  return path.split('.').reduce((value, key) => value?.[key], row);
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

function dateLabel(value) {
  const [year, month, day] = isoDate(value).split('-');
  return year && month && day ? `${day}.${month}.${year}` : '—';
}

function displayValue(value, type) {
  if (value == null || value === '') return '—';
  if (type === 'list') return Array.isArray(value) ? value.join(', ') : String(value);
  if (type === 'date') return dateLabel(value);
  if (type === 'datetime') return new Date(value).toLocaleDateString('ru-RU');
  if (type === 'money') {
    return Number(value).toLocaleString('ru-RU', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  }
  return String(value);
}

function periodText(result) {
  return result.from && result.to
    ? `Период: ${dateLabel(result.from)} — ${dateLabel(result.to)}`
    : 'На текущий момент';
}

async function generateExcel(config, result) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Система учёта спецодежды';
  const sheet = workbook.addWorksheet('Отчёт', {
    pageSetup: {
      orientation: config.columns.length > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  const lastColumn = config.columns.length;
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = config.title;
  sheet.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true };
  sheet.getCell(1, 1).alignment = { horizontal: 'center' };
  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = periodText(result);
  sheet.getCell(2, 1).alignment = { horizontal: 'center' };

  const header = sheet.getRow(4);
  config.columns.forEach(([, label, width], index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2457A7' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getColumn(index + 1).width = width;
  });
  header.height = 30;

  for (const rowData of result.rows) {
    const row = sheet.addRow(
      config.columns.map(([key, , , type]) => {
        const value = valueAt(rowData, key);
        if (type === 'list') return Array.isArray(value) ? value.join(', ') : value;
        if ((type === 'date' || type === 'datetime') && value) return dateLabel(value);
        return value ?? null;
      }),
    );
    row.alignment = { vertical: 'top', wrapText: true };
    config.columns.forEach(([, , , type], index) => {
      if (type === 'money') row.getCell(index + 1).numFmt = '# ##0.000';
      if (type === 'number') row.getCell(index + 1).numFmt = '# ##0';
    });
  }

  const totalRow = sheet.addRow(
    config.columns.map(([key], index) => {
      if (index === 0) return 'Итого';
      const totalKey = config.totals[key];
      return totalKey ? (result.totals?.[totalKey] ?? null) : null;
    }),
  );
  totalRow.font = { name: 'Arial', bold: true };
  config.columns.forEach(([, , , type], index) => {
    if (type === 'money') totalRow.getCell(index + 1).numFmt = '# ##0.000';
    if (type === 'number') totalRow.getCell(index + 1).numFmt = '# ##0';
  });

  for (let rowNumber = 4; rowNumber <= totalRow.number; rowNumber += 1) {
    for (let column = 1; column <= lastColumn; column += 1) {
      sheet.getCell(rowNumber, column).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: lastColumn } };
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(lastColumn).letter}${totalRow.number}`;
  sheet.pageSetup.printTitlesRow = '1:4';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function generatePdf(config, result) {
  const landscape = config.columns.length > 5;
  const doc = new PDFDocument({
    size: 'A4',
    layout: landscape ? 'landscape' : 'portrait',
    margin: 28,
    compress: true,
    bufferPages: true,
  });
  doc.registerFont('Regular', FONT);
  doc.registerFont('Bold', FONT_BOLD);
  const output = collectPdf(doc);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = config.columns.reduce((sum, column) => sum + column[2], 0);
  const widths = config.columns.map((column) => (column[2] / totalWeight) * pageWidth);
  const rowHeight = 24;

  const drawCell = (
    text,
    x,
    y,
    width,
    height,
    { bold = false, fill = null, align = 'left' } = {},
  ) => {
    if (fill) doc.rect(x, y, width, height).fill(fill);
    doc.rect(x, y, width, height).lineWidth(0.45).stroke('#1f2937');
    doc
      .fillColor(fill ? '#ffffff' : '#111827')
      .font(bold ? 'Bold' : 'Regular')
      .fontSize(6.5)
      .text(String(text ?? ''), x + 3, y + 4, {
        width: width - 6,
        height: height - 6,
        align,
        ellipsis: true,
      });
  };

  const drawHeading = () => {
    doc.font('Bold').fontSize(13).fillColor('#111827').text(config.title, { align: 'center' });
    doc.font('Regular').fontSize(8).text(periodText(result), { align: 'center' });
    doc.moveDown(0.7);
  };

  const drawHeader = (y) => {
    let x = doc.page.margins.left;
    config.columns.forEach((column, index) => {
      drawCell(column[1], x, y, widths[index], 30, {
        bold: true,
        fill: '#2457a7',
        align: 'center',
      });
      x += widths[index];
    });
    return y + 30;
  };

  drawHeading();
  let y = drawHeader(doc.y);
  for (const row of result.rows) {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 28) {
      doc.addPage();
      drawHeading();
      y = drawHeader(doc.y);
    }
    let x = doc.page.margins.left;
    config.columns.forEach(([key, , , type], index) => {
      drawCell(displayValue(valueAt(row, key), type), x, y, widths[index], rowHeight, {
        align: type === 'money' || type === 'number' ? 'right' : 'left',
      });
      x += widths[index];
    });
    y += rowHeight;
  }

  if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    drawHeading();
    y = drawHeader(doc.y);
  }
  let x = doc.page.margins.left;
  config.columns.forEach(([key, , , type], index) => {
    const totalKey = config.totals[key];
    const value = index === 0 ? 'Итого' : totalKey ? result.totals?.[totalKey] : '';
    drawCell(totalKey ? displayValue(value, type) : value, x, y, widths[index], rowHeight, {
      bold: true,
      align: type === 'money' || type === 'number' ? 'right' : 'left',
    });
    x += widths[index];
  });

  const pageCount = doc.bufferedPageRange?.().count;
  if (pageCount) {
    for (let index = 0; index < pageCount; index += 1) {
      doc.switchToPage(index);
      doc
        .font('Regular')
        .fontSize(7)
        .fillColor('#6b7280')
        .text(
          `Страница ${index + 1} из ${pageCount}`,
          28,
          doc.page.height - doc.page.margins.bottom - 18,
          {
            width: doc.page.width - 56,
            align: 'right',
            lineBreak: false,
          },
        );
    }
  }
  doc.end();
  return output;
}

export const reportExportService = {
  async generate(report, query) {
    const config = REPORTS[report];
    if (!config) throw ApiError.notFound('Отчёт не найден');
    const format = query.format || 'xlsx';
    if (!['xlsx', 'pdf'].includes(format)) {
      throw ApiError.badRequest('Поддерживаются форматы xlsx и pdf');
    }
    const result = await reportsService[config.method](query);
    const buffer =
      format === 'pdf' ? await generatePdf(config, result) : await generateExcel(config, result);
    const periodSuffix =
      result.from && result.to ? `_${isoDate(result.from)}_${isoDate(result.to)}` : '';
    return {
      buffer,
      fileName: `${report}${periodSuffix}.${format}`,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  },
};

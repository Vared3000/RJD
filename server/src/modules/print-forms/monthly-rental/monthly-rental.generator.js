import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sans = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const sansBold = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const columns = [
  ['employeeName', 'Работник', 28],
  ['personnelNumber', 'Таб. №', 12],
  ['positionName', 'Должность', 22],
  ['modelName', 'Наименование одежды', 26],
  ['sizeValue', 'Размер', 9],
  ['heightValue', 'Рост', 8],
  ['inventoryNumber', 'Инв. №', 16],
  ['issuedDate', 'Дата выдачи', 12],
  ['returnedDate', 'Дата возврата', 12],
  ['intervalStart', 'Начало', 12],
  ['intervalEnd', 'Окончание', 12],
  ['rentalDays', 'Дней', 8],
  ['monthlyPriceWithoutVat', 'Ставка без НДС', 15],
  ['costWithoutVat', 'Стоимость без НДС', 16],
  ['vatRate', 'НДС, %', 9],
  ['vatAmount', 'НДС', 13],
  ['totalWithVat', 'Итого с НДС', 16],
  ['dataSourceLabel', 'Источник', 16],
];

function partiesText(parties) {
  const executor = parties?.executor;
  const customer = parties?.customer;
  return [
    executor
      ? `Исполнитель: ${executor.fullName}, ИНН ${executor.inn}${executor.kpp ? `, КПП ${executor.kpp}` : ''}`
      : null,
    customer
      ? `Заказчик: ${customer.fullName}, ИНН ${customer.inn}${customer.kpp ? `, КПП ${customer.kpp}` : ''}`
      : null,
  ].filter(Boolean);
}

function money(value) {
  return Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export async function generateMonthlyRentalExcel(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Система учёта спецодежды';
  workbook.created = new Date(data.generatedAt);
  workbook.subject = `Зафиксированный акт ${data.actId ?? 'предпросмотр'}; источники: ${data.dataSources.join(', ')}`;
  const sheet = workbook.addWorksheet('Ежемесячный акт', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 8,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell('A1').value = data.title;
  sheet.getCell('A1').font = { bold: true, size: 16 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell('A2').value =
    `${data.dpo.name} · период ${data.from} — ${data.to} · ${data.daysInMonth} календ. дней`;
  sheet.getCell('A2').alignment = { horizontal: 'center' };
  let rowNumber = 3;
  for (const text of partiesText(data.parties)) {
    sheet.mergeCells(rowNumber, 1, rowNumber, columns.length);
    sheet.getCell(rowNumber, 1).value = text;
    rowNumber += 1;
  }
  sheet.mergeCells(rowNumber, 1, rowNumber, columns.length);
  sheet.getCell(rowNumber, 1).value =
    `Расчёт: ${data.calculationRule}. Акт зафиксирован ${new Date(data.generatedAt).toLocaleString('ru-RU')}.`;
  sheet.getCell(rowNumber, 1).font = { italic: true, size: 9 };
  rowNumber += 2;

  const headerRow = rowNumber;
  columns.forEach(([_key, label, width], index) => {
    sheet.getColumn(index + 1).width = width;
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF365F91' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  sheet.getRow(headerRow).height = 38;
  rowNumber += 1;

  for (const group of data.employeeGroups) {
    for (const item of group.rows) {
      columns.forEach(([key], index) => {
        const cell = sheet.getCell(rowNumber, index + 1);
        cell.value = item[key] ?? '';
        cell.alignment = { vertical: 'top', wrapText: true };
        if (
          [
            'monthlyPriceWithoutVat',
            'costWithoutVat',
            'vatRate',
            'vatAmount',
            'totalWithVat',
          ].includes(key)
        ) {
          cell.numFmt = '#,##0.0000';
        }
      });
      if (item.warnings.length > 0) sheet.getCell(rowNumber, 1).note = item.warnings.join('\n');
      rowNumber += 1;
    }
    sheet.mergeCells(rowNumber, 1, rowNumber, 13);
    sheet.getCell(rowNumber, 1).value = `Итого по работнику ${group.employeeName}`;
    sheet.getCell(rowNumber, 1).font = { bold: true };
    [group.totals.costWithoutVat, group.totals.vatAmount, group.totals.totalWithVat].forEach(
      (value, index) => {
        const column = [14, 16, 17][index];
        sheet.getCell(rowNumber, column).value = value;
        sheet.getCell(rowNumber, column).numFmt = '#,##0.0000';
        sheet.getCell(rowNumber, column).font = { bold: true };
      },
    );
    rowNumber += 1;
  }

  sheet.mergeCells(rowNumber, 1, rowNumber, 13);
  sheet.getCell(rowNumber, 1).value = `ИТОГО ПО ДПО ${data.dpo.name}`;
  sheet.getCell(rowNumber, 1).font = { bold: true, size: 12 };
  [data.totals.costWithoutVat, data.totals.vatAmount, data.totals.totalWithVat].forEach(
    (value, index) => {
      const column = [14, 16, 17][index];
      sheet.getCell(rowNumber, column).value = value;
      sheet.getCell(rowNumber, column).numFmt = '#,##0.0000';
      sheet.getCell(rowNumber, column).font = { bold: true, size: 12 };
    },
  );

  for (let row = headerRow; row <= rowNumber; row += 1) {
    for (let column = 1; column <= columns.length; column += 1) {
      sheet.getCell(row, column).border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } },
      };
    }
  }
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 4 }];
  sheet.headerFooter.oddFooter = `&LАкт ${data.actId ?? ''}&CСтраница &P из &N&R${data.dataSources.join(', ')}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function collectPdf(document) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
}

export async function generateMonthlyRentalPdf(data) {
  const document = new PDFDocument({
    size: 'A3',
    layout: 'landscape',
    margin: 28,
    bufferPages: true,
  });
  const result = collectPdf(document);
  document.registerFont('sans', sans);
  document.registerFont('bold', sansBold);
  document.font('bold').fontSize(15).text(data.title, { align: 'center' });
  document
    .font('sans')
    .fontSize(9)
    .text(`${data.dpo.name} · ${data.from} — ${data.to}`, { align: 'center' });
  partiesText(data.parties).forEach((text) => document.text(text));
  document
    .fontSize(7)
    .text(
      `Расчёт: ${data.calculationRule}. Зафиксирован: ${new Date(data.generatedAt).toLocaleString('ru-RU')}.`,
    );
  document.moveDown(0.5);

  const widths = [125, 62, 110, 55, 68, 58, 58, 35, 65, 70, 42, 58, 68];
  const labels = [
    'Работник / должность',
    'Таб. №',
    'Одежда / размер',
    'Инв. №',
    'Выдано',
    'Возврат',
    'Интервал',
    'Дней',
    'Ставка',
    'Без НДС',
    'НДС %',
    'НДС',
    'С НДС',
  ];
  const keys = [
    'employee',
    'personnelNumber',
    'model',
    'inventoryNumber',
    'issuedDate',
    'returnedDate',
    'interval',
    'rentalDays',
    'monthlyPriceWithoutVat',
    'costWithoutVat',
    'vatRate',
    'vatAmount',
    'totalWithVat',
  ];
  const startX = document.x;
  const drawRow = (values, bold = false, fill = false) => {
    const height = 26;
    if (document.y + height > document.page.height - 40) {
      document.addPage();
    }
    const y = document.y;
    let x = startX;
    if (fill)
      document
        .rect(
          startX,
          y,
          widths.reduce((sum, width) => sum + width, 0),
          height,
        )
        .fill('#365f91');
    document
      .font(bold ? 'bold' : 'sans')
      .fontSize(6.5)
      .fillColor(fill ? 'white' : 'black');
    values.forEach((value, index) => {
      document.rect(x, y, widths[index], height).stroke('#808080');
      document.text(String(value ?? ''), x + 2, y + 3, {
        width: widths[index] - 4,
        height: height - 5,
        ellipsis: true,
      });
      x += widths[index];
    });
    document.y = y + height;
    document.fillColor('black');
  };
  drawRow(labels, true, true);
  for (const row of data.rows) {
    const values = {
      employee: `${row.employeeName}\n${row.positionName || ''}`,
      personnelNumber: row.personnelNumber,
      model: `${row.modelName}\n${[row.sizeValue, row.heightValue].filter(Boolean).join(' / ')}`,
      inventoryNumber: row.inventoryNumber,
      issuedDate: row.issuedDate,
      returnedDate: row.returnedDate,
      interval: `${row.intervalStart}\n${row.intervalEnd}`,
      rentalDays: row.rentalDays,
      monthlyPriceWithoutVat: money(row.monthlyPriceWithoutVat),
      costWithoutVat: money(row.costWithoutVat),
      vatRate: money(row.vatRate),
      vatAmount: money(row.vatAmount),
      totalWithVat: money(row.totalWithVat),
    };
    drawRow(keys.map((key) => values[key]));
  }
  drawRow(
    [
      'ИТОГО ПО ДПО',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      money(data.totals.costWithoutVat),
      '',
      money(data.totals.vatAmount),
      money(data.totals.totalWithVat),
    ],
    true,
  );
  if (data.warnings.length > 0) {
    document.moveDown().font('bold').fontSize(8).text('Предупреждения:');
    document.font('sans').text(data.warnings.map((warning) => `• ${warning}`).join('\n'));
  }
  const pages = document.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    document.switchToPage(index);
    document
      .font('sans')
      .fontSize(7)
      .text(
        `Акт ${data.actId ?? ''} · ${data.dataSources.join(', ')} · страница ${index + 1} из ${pages.count}`,
        28,
        document.page.height - 24,
        { align: 'center' },
      );
  }
  document.end();
  return result;
}

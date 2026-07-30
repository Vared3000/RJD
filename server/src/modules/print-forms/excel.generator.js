import ExcelJS from 'exceljs';

const COLORS = {
  border: '666666',
  header: 'D9EAF7',
  total: 'E2F0D9',
};

function applyBorder(cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
}

function writeDocumentHeader(sheet, data, columnCount) {
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell(1, 1).value = data.title;
  sheet.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true };
  sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  const details = [
    ['Заказчик', data.dpo.fullName || data.dpo.name],
    ['ДПО', data.dpo.name],
    ['Период', `${data.from} - ${data.to}`],
    ['Договор', [data.dpo.contractNumber, data.dpo.contractDate].filter(Boolean).join(' от ')],
    [
      'Доп. соглашение',
      [data.dpo.additionalAgreementNumber, data.dpo.additionalAgreementDate]
        .filter(Boolean)
        .join(' от '),
    ],
    ['Руководитель', data.dpo.directorFullName || ''],
    ['Основание', data.dpo.directorBasis || ''],
  ];
  details.forEach(([label, value], index) => {
    const row = index + 3;
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { name: 'Arial', size: 9, bold: true };
    sheet.mergeCells(row, 2, row, columnCount);
    sheet.getCell(row, 2).value = value;
    sheet.getCell(row, 2).font = { name: 'Arial', size: 9 };
    sheet.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' };
  });
  return 11;
}

function formulaResult(value) {
  return Number(Number(value || 0).toFixed(4));
}

export async function generateExcel(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP Учёт спецодежды';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(data.sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 },
    },
    views: [{ showGridLines: false }],
  });

  const columnCount = data.columns.length;
  const headerRowNumber = writeDocumentHeader(sheet, data, columnCount);
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = data.columns.map((column) => column.label);
  headerRow.height = 52;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 8, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  });

  for (const rowData of data.rows) {
    const row = sheet.addRow(data.columns.map((column) => rowData[column.key] ?? null));
    row.height = 30;
    for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
      const cell = row.getCell(colNumber);
      cell.font = { name: 'Arial', size: 8 };
      cell.alignment = {
        horizontal: data.columns[colNumber - 1].numeric ? 'right' : 'left',
        vertical: 'top',
        wrapText: true,
      };
      applyBorder(cell);
    }
    for (const formula of data.formulas ?? []) {
      const cell = row.getCell(formula.column);
      cell.value = {
        formula: formula.build(row.number),
        result: formulaResult(rowData[formula.key]),
      };
    }
  }

  const firstDataRow = headerRowNumber + 1;
  const lastDataRow = Math.max(firstDataRow, sheet.lastRow.number);
  const totalRow = sheet.addRow(
    data.columns.map((column, index) => {
      if (index === 0) return 'ИТОГО';
      if (!column.total) return null;
      const letter = sheet.getColumn(index + 1).letter;
      return {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
        result: formulaResult(data.totals[column.key]),
      };
    }),
  );
  for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
    const cell = totalRow.getCell(colNumber);
    cell.font = { name: 'Arial', size: 9, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.total } };
    applyBorder(cell);
  }

  const signatureRow = sheet.addRow([]);
  signatureRow.height = 18;
  const signatureStart = signatureRow.number + 1;
  sheet.mergeCells(signatureStart, 1, signatureStart, Math.max(2, Math.floor(columnCount / 2)));
  sheet.getCell(signatureStart, 1).value = 'ИСПОЛНИТЕЛЬ __________________ / __________________';
  sheet.mergeCells(signatureStart, Math.floor(columnCount / 2) + 1, signatureStart, columnCount);
  sheet.getCell(signatureStart, Math.floor(columnCount / 2) + 1).value =
    `ЗАКАЗЧИК __________________ / ${data.dpo.directorFullName || '__________________'}`;

  data.columns.forEach((column, index) => {
    const worksheetColumn = sheet.getColumn(index + 1);
    worksheetColumn.width = column.width;
    if (column.numberFormat) worksheetColumn.numFmt = column.numberFormat;
  });
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: columnCount },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(columnCount).letter}${signatureStart}`;
  sheet.headerFooter.oddFooter = 'Страница &P из &N';

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

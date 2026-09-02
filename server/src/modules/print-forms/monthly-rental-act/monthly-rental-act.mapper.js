import ExcelJS from 'exceljs';
import { generatePdfFromExcel } from '../shared/excel-to-pdf.js';
import { fullNameGenitive } from '../shared/ru-format.js';

const MONTHS_PREPOSITIONAL = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

const columns = [
  { key: 'number', label: '№\nп/п', width: 5 },
  {
    key: 'employee',
    label: 'Работник Заказчика / табельный номер / должность',
    width: 30,
  },
  { key: 'modelName', label: 'Наименование форменной одежды', width: 29 },
  { key: 'size', label: 'Размер / рост', width: 12 },
  { key: 'inventoryNumber', label: 'Инвентарный номер', width: 15 },
  { key: 'interval', label: 'Период аренды', width: 17 },
  { key: 'rentalDays', label: 'Кол-во дней аренды', width: 10, numberFormat: '0' },
  {
    key: 'monthlyPriceWithoutVat',
    label: 'Стоимость аренды за месяц, руб., без НДС',
    width: 16,
    numberFormat: '#,##0.00',
  },
  {
    key: 'costWithoutVat',
    label: 'Стоимость аренды, руб., без НДС',
    width: 16,
    numberFormat: '#,##0.00',
  },
  { key: 'vatRate', label: 'НДС, %', width: 9, numberFormat: '0.00' },
  { key: 'vatAmount', label: 'Сумма НДС, руб.', width: 14, numberFormat: '#,##0.00' },
  { key: 'totalWithVat', label: 'Итого с НДС, руб.', width: 16, numberFormat: '#,##0.00' },
];

const thinBorder = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

function parseDate(value) {
  const [year, month, day] = String(value ?? '')
    .slice(0, 10)
    .split('-')
    .map(Number);
  return { year, month, day };
}

function formatDate(value) {
  const { year, month, day } = parseDate(value);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

function monthText(data) {
  const { year, month } = parseDate(data.from);
  return `${MONTHS_PREPOSITIONAL[month - 1]} ${year} года`;
}

function initialsFirst(fullName) {
  const [surname = '', first = '', patronymic = ''] = String(fullName ?? '')
    .trim()
    .split(/\s+/);
  return [first, patronymic]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('')
    .concat(surname ? ` ${surname}` : '');
}

function partyName(party) {
  return party?.shortName || party?.fullName || '';
}

function contractText(data) {
  const number = data.dpo.contractNumber || data.parties?.executor?.contractNumber;
  const date = data.dpo.contractDate || data.parties?.executor?.contractDate;
  if (!number) return '';
  return ` по договору № ${number}${date ? ` от ${formatDate(date)}` : ''}`;
}

function narrative(data) {
  const customer = data.parties?.customer;
  const executor = data.parties?.executor;
  const customerRepresentative =
    data.dpo.directorFullNameGenitive ||
    fullNameGenitive(data.dpo.directorFullName || customer?.directorFullName || '');
  const customerBasis = data.dpo.directorBasis || customer?.directorBasis || '';
  return (
    `${customer?.fullName || data.dpo.fullName || data.dpo.name}, именуемое в дальнейшем «Заказчик», ` +
    `в лице начальника ${data.dpo.name} ${customerRepresentative}, действующего на основании ${customerBasis}, ` +
    `с одной стороны, и ${executor?.fullName || ''}, именуемое в дальнейшем «Исполнитель», ` +
    `в лице ${executor?.directorPosition || ''} ${executor?.directorFullName || ''}, действующего на основании ` +
    `${executor?.directorBasis || ''}, с другой стороны, составили настоящий акт о нижеследующем:`
  );
}

function styleText(cell, options = {}) {
  cell.font = {
    name: 'Times New Roman',
    size: options.size ?? 10,
    bold: options.bold ?? false,
    italic: options.italic ?? false,
  };
  cell.alignment = {
    horizontal: options.horizontal ?? 'left',
    vertical: options.vertical ?? 'top',
    wrapText: options.wrapText ?? true,
  };
}

function mergeAndSet(sheet, range, value, options = {}) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = value;
  styleText(cell, options);
  return cell;
}

function addRowNote(cell, row) {
  const parts = [
    row.dataSourceLabel ? `Источник данных: ${row.dataSourceLabel}` : null,
    row.sourceReference ? `Ссылка: ${row.sourceReference}` : null,
    ...(row.warnings ?? []),
  ].filter(Boolean);
  if (parts.length > 0) cell.note = parts.join('\n');
}

function rowValues(row, number, showEmployee) {
  const employee = [
    row.employeeName,
    row.personnelNumber ? `таб. № ${row.personnelNumber}` : null,
    row.positionName,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    number: showEmployee ? number : '',
    employee: showEmployee ? employee : '',
    modelName: row.modelName,
    size: [row.sizeValue, row.heightValue].filter(Boolean).join(' / '),
    inventoryNumber: row.inventoryNumber,
    interval: `${formatDate(row.intervalStart)} - ${formatDate(row.intervalEnd)}`,
    rentalDays: row.rentalDays,
    monthlyPriceWithoutVat: row.monthlyPriceWithoutVat,
    costWithoutVat: row.costWithoutVat,
    vatRate: row.vatRate,
    vatAmount: row.vatAmount,
    totalWithVat: row.totalWithVat,
  };
}

function mergeEmployeeGroups(sheet, dataStart, rows) {
  let start = 0;
  while (start < rows.length) {
    const key = `${rows[start].employeeName}\u0000${rows[start].personnelNumber}`;
    let end = start;
    while (
      end + 1 < rows.length &&
      `${rows[end + 1].employeeName}\u0000${rows[end + 1].personnelNumber}` === key
    ) {
      end += 1;
    }
    if (end > start) {
      sheet.mergeCells(dataStart + start, 1, dataStart + end, 1);
      sheet.mergeCells(dataStart + start, 2, dataStart + end, 2);
      sheet.getCell(dataStart + start, 1).alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };
      sheet.getCell(dataStart + start, 2).alignment = {
        horizontal: 'left',
        vertical: 'middle',
        wrapText: true,
      };
    }
    start = end + 1;
  }
}

export async function generateMonthlyRentalExcel(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP Учёт спецодежды';
  workbook.created = new Date(data.generatedAt);
  workbook.subject = `Ежемесячный акт аренды; источники: ${data.dataSources.join(', ')}`;
  const sheet = workbook.addWorksheet('Акт аренды', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.4, header: 0.1, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
  sheet.properties.defaultRowHeight = 15;

  mergeAndSet(
    sheet,
    'A1:L2',
    `АКТ\nпо оказанию услуг по аренде форменной одежды работников ${data.dpo.name}\nза ${monthText(data)}`,
    { bold: true, size: 14, horizontal: 'center', vertical: 'middle' },
  );
  sheet.getRow(1).height = 25;
  sheet.getRow(2).height = 25;
  mergeAndSet(sheet, 'A3:F3', 'г. Санкт-Петербург', { vertical: 'middle' });
  mergeAndSet(sheet, 'G3:L3', formatDate(data.to), {
    horizontal: 'right',
    vertical: 'middle',
  });
  mergeAndSet(sheet, 'A4:L6', narrative(data), {
    horizontal: 'justify',
    vertical: 'middle',
  });
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 22;
  sheet.getRow(6).height = 22;
  mergeAndSet(
    sheet,
    'A7:L7',
    `1. Исполнитель${contractText(data)} оказал услуги по аренде форменной одежды работникам Заказчика в ${monthText(data)}. Расчёт произведён пропорционально количеству календарных дней аренды:`,
    { horizontal: 'justify' },
  );
  sheet.getRow(7).height = 32;

  const headerRow = 8;
  columns.forEach((column, index) => {
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = column.label;
    styleText(cell, { bold: true, size: 8, horizontal: 'center', vertical: 'middle' });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    cell.border = thinBorder;
  });
  sheet.getRow(headerRow).height = 50;

  const dataStart = headerRow + 1;
  let previousEmployee = null;
  let employeeNumber = 0;
  data.rows.forEach((row, index) => {
    const rowNumber = dataStart + index;
    const employeeKey = `${row.employeeName}\u0000${row.personnelNumber}`;
    const showEmployee = employeeKey !== previousEmployee;
    if (showEmployee) employeeNumber += 1;
    previousEmployee = employeeKey;
    const values = rowValues(row, employeeNumber, showEmployee);
    columns.forEach((column, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      cell.value = values[column.key] ?? '';
      styleText(cell, {
        size: 8,
        horizontal:
          columnIndex === 0 || ['rentalDays', 'vatRate'].includes(column.key)
            ? 'center'
            : column.numberFormat
              ? 'right'
              : 'left',
        vertical: 'middle',
      });
      if (column.numberFormat) cell.numFmt = column.numberFormat;
      cell.border = thinBorder;
    });
    addRowNote(sheet.getCell(rowNumber, 3), row);
    sheet.getRow(rowNumber).height = 30;
  });
  mergeEmployeeGroups(sheet, dataStart, data.rows);

  const totalRow = dataStart + Math.max(1, data.rows.length);
  sheet.mergeCells(totalRow, 1, totalRow, 8);
  const totalLabel = sheet.getCell(totalRow, 1);
  totalLabel.value = `ИТОГО ПО ${data.dpo.name}`;
  styleText(totalLabel, { bold: true, size: 9, horizontal: 'right', vertical: 'middle' });
  for (let column = 1; column <= columns.length; column += 1) {
    const cell = sheet.getCell(totalRow, column);
    cell.border = thinBorder;
    if (column >= 9)
      styleText(cell, { bold: true, size: 9, horizontal: 'right', vertical: 'middle' });
  }
  sheet.getCell(totalRow, 9).value = data.totals.costWithoutVat;
  sheet.getCell(totalRow, 9).numFmt = '#,##0.00';
  sheet.getCell(totalRow, 11).value = data.totals.vatAmount;
  sheet.getCell(totalRow, 11).numFmt = '#,##0.00';
  sheet.getCell(totalRow, 12).value = data.totals.totalWithVat;
  sheet.getCell(totalRow, 12).numFmt = '#,##0.00';
  sheet.getRow(totalRow).height = 24;

  mergeAndSet(
    sheet,
    `A${totalRow + 2}:L${totalRow + 2}`,
    `Сумма по акту: ${Number(data.totals.totalWithVat).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} руб., в том числе НДС ${Number(data.totals.vatAmount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} руб.`,
    { bold: true },
  );
  mergeAndSet(
    sheet,
    `A${totalRow + 4}:L${totalRow + 4}`,
    '2. Услуги оказаны в полном объёме. Заказчик претензий к объёму и качеству оказанных услуг не имеет.',
  );
  mergeAndSet(
    sheet,
    `A${totalRow + 5}:L${totalRow + 5}`,
    '3. Настоящий акт составлен в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.',
  );

  mergeAndSet(sheet, `A${totalRow + 7}:F${totalRow + 7}`, 'Заказчик', { bold: true });
  mergeAndSet(sheet, `G${totalRow + 7}:L${totalRow + 7}`, 'Исполнитель', { bold: true });
  mergeAndSet(sheet, `A${totalRow + 8}:F${totalRow + 9}`, `Начальник ${data.dpo.name}`, {
    vertical: 'top',
  });
  mergeAndSet(
    sheet,
    `G${totalRow + 8}:L${totalRow + 9}`,
    `${data.parties?.executor?.directorPosition || ''}\n${partyName(data.parties?.executor)}`,
    { vertical: 'top' },
  );
  mergeAndSet(
    sheet,
    `A${totalRow + 11}:F${totalRow + 11}`,
    `____________________ /${initialsFirst(data.dpo.directorFullName)}/`,
  );
  mergeAndSet(
    sheet,
    `G${totalRow + 11}:L${totalRow + 11}`,
    `____________________ /${initialsFirst(data.parties?.executor?.directorFullName)}/`,
  );
  mergeAndSet(sheet, `A${totalRow + 12}:F${totalRow + 12}`, 'М.П.');
  mergeAndSet(sheet, `G${totalRow + 12}:L${totalRow + 12}`, 'М.П.');

  const lastRow = totalRow + 12;
  sheet.pageSetup.printArea = `A1:L${lastRow}`;
  sheet.pageSetup.printTitlesRow = '8:8';
  sheet.headerFooter.oddFooter = `&LАкт ${data.actId ?? ''}&CСтраница &P из &N&R${data.dataSources.join(', ')}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function generateMonthlyRentalPdf(data) {
  return generatePdfFromExcel(await generateMonthlyRentalExcel(data), data);
}

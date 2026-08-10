import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const COLUMNS = [
  ['article', 58, 'Код товара/\nработ, услуг', 'А'],
  ['number', 20, '№\nп/п', '1'],
  ['modelName', 108, 'Наименование товара (описание работ, услуг)', '1а'],
  ['kind', 38, 'Код вида\nтовара', '1б'],
  ['unitCode', 22, 'Ед. изм.\nкод', '2'],
  ['unit', 36, 'Условное\nобозначение', '2а'],
  ['quantity', 42, 'Количество\n(объем)', '3'],
  ['priceWithoutVat', 56, 'Цена за\nединицу', '4'],
  ['costWithoutVat', 66, 'Стоимость\nбез налога', '5'],
  ['excise', 34, 'В т.ч.\nакциз', '6'],
  ['vatRate', 38, 'Налоговая\nставка', '7'],
  ['vatAmount', 58, 'Сумма\nналога', '8'],
  ['totalWithVat', 66, 'Стоимость\nс налогом', '9'],
  ['countryCode', 24, 'Код\nстраны', '10'],
  ['country', 48, 'Страна\nпроисхождения', '10а'],
  ['declaration', 75, 'Регистрационный номер декларации', '11'],
];

function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function dateParts(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

function longDate(value) {
  const { year, month, day } = dateParts(value);
  return `${day} ${MONTHS[month - 1]} ${year} г.`;
}

function shortDate(value) {
  const { year, month, day } = dateParts(value);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function quantity(value) {
  return Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function innKpp(party) {
  return [party.inn, party.kpp].filter(Boolean).join('/');
}

function directorShortName(party) {
  const parts = String(party.directorFullName ?? '')
    .trim()
    .split(/\s+/);
  return parts.length > 1
    ? `${parts[0]} ${parts
        .slice(1)
        .map((part) => `${part[0]}.`)
        .join(' ')}`
    : party.directorFullName;
}

function fittedText(doc, text, x, y, width, height, options = {}) {
  const padding = options.padding ?? 1.5;
  let size = options.size ?? 5.5;
  const content = String(text ?? '');
  doc.font(options.bold ? 'Bold' : 'Regular');
  while (
    size > 3.8 &&
    doc.fontSize(size).heightOfString(content, { width: width - padding * 2, lineGap: 0 }) >
      height - padding * 2
  ) {
    size -= 0.25;
  }
  doc
    .fontSize(size)
    .fillColor('#000')
    .text(content, x + padding, y + padding, {
      width: width - padding * 2,
      height: height - padding * 2,
      align: options.align ?? 'left',
      lineGap: 0,
    });
}

function cell(doc, text, x, y, width, height, options = {}) {
  doc
    .rect(x, y, width, height)
    .lineWidth(options.lineWidth ?? 0.45)
    .stroke('#000');
  fittedText(doc, text, x, y, width, height, options);
}

function drawTableHeader(doc, x, y) {
  const headerHeight = 62;
  let cursor = x;
  for (const [, width, label] of COLUMNS) {
    cell(doc, label, cursor, y, width, headerHeight, {
      size: 5,
      align: 'center',
    });
    cursor += width;
  }
  cursor = x;
  for (const [, width, , code] of COLUMNS) {
    cell(doc, code, cursor, y + headerHeight, width, 10, {
      size: 4.8,
      bold: true,
      align: 'center',
    });
    cursor += width;
  }
  return y + headerHeight + 10;
}

function rowValue(row, key, index) {
  if (key === 'number') return index + 1;
  if (key === 'kind' || key === 'countryCode' || key === 'country' || key === 'declaration') {
    return '--';
  }
  if (key === 'excise') return 'без\nакциза';
  if (key === 'quantity') return quantity(row.quantity);
  if (key === 'priceWithoutVat' || key === 'costWithoutVat') return money(row[key]);
  if (key === 'vatRate') return `${Number(row.vatRate || 5)}%`;
  if (key === 'vatAmount' || key === 'totalWithVat') return money(row[key]);
  return row[key] ?? '';
}

function drawRows(doc, rows, startIndex, x, y) {
  let rowY = y;
  rows.forEach((row, localIndex) => {
    let cursor = x;
    for (const [key, width] of COLUMNS) {
      cell(doc, rowValue(row, key, startIndex + localIndex), cursor, rowY, width, 20, {
        size: 5.2,
        align: [
          'number',
          'unitCode',
          'unit',
          'quantity',
          'priceWithoutVat',
          'costWithoutVat',
          'vatRate',
          'vatAmount',
          'totalWithVat',
        ].includes(key)
          ? 'right'
          : 'left',
      });
      cursor += width;
    }
    rowY += 20;
  });
  return rowY;
}

function lineField(doc, label, value, x, y, width, labelWidth = 118) {
  doc.font('Regular').fontSize(6).text(label, x, y, { width: labelWidth });
  doc
    .moveTo(x + labelWidth, y + 9)
    .lineTo(x + width, y + 9)
    .lineWidth(0.45)
    .stroke();
  doc
    .font('Regular')
    .fontSize(6)
    .text(value || '--', x + labelWidth + 3, y, {
      width: width - labelWidth - 5,
    });
}

function drawFirstPageHeader(doc, data, x, width) {
  const seller = data.parties.executor;
  const buyer = data.parties.customer;
  doc.font('Regular').fontSize(6).text('Универсальный\nпередаточный\nдокумент', x, 26, {
    width: 58,
  });
  doc.font('Bold').fontSize(8).text('Статус: 1', x, 67);
  doc
    .font('Regular')
    .fontSize(5)
    .text(
      '1 – счет-фактура и передаточный документ (акт)\n2 – передаточный документ (акт)',
      x,
      86,
      {
        width: 58,
      },
    );
  const mainX = x + 62;
  doc
    .font('Regular')
    .fontSize(7)
    .text(`Счет-фактура № ${data.documentNumber} от ${longDate(data.documentDate)} (1)`, mainX, 26);
  doc
    .fontSize(4.8)
    .text(
      'Приложение № 1 к постановлению Правительства Российской Федерации от 26 декабря 2011 г. № 1137\n(в редакции постановления Правительства Российской Федерации от 23 января 2026 г. № 26)',
      x + 480,
      26,
      { width: width - 480, align: 'right' },
    );
  doc.fontSize(6).text('Исправление № -- от -- (1а)', mainX, 39);

  const half = (width - 70) / 2;
  const leftX = mainX;
  const rightX = mainX + half + 8;
  lineField(doc, 'Продавец:', seller.fullName, leftX, 53, half, 105);
  lineField(doc, 'Адрес:', seller.address, leftX, 65, half, 105);
  lineField(doc, 'ИНН/КПП продавца:', innKpp(seller), leftX, 83, half, 105);
  lineField(doc, 'Грузоотправитель и его адрес:', '--', leftX, 95, half, 105);
  lineField(doc, 'Грузополучатель и его адрес:', '--', leftX, 107, half, 105);
  lineField(
    doc,
    'К платежно-расчетному документу №',
    data.paymentDocumentNumber
      ? `${data.paymentDocumentNumber} от ${shortDate(data.paymentDocumentDate)}`
      : '--',
    leftX,
    119,
    half,
    132,
  );
  lineField(
    doc,
    'Документ об отгрузке:',
    `Универсальный передаточный документ, № ${data.documentNumber} от ${shortDate(data.documentDate)}`,
    leftX,
    131,
    half,
    105,
  );

  lineField(doc, 'Покупатель:', buyer.fullName, rightX, 53, half, 105);
  lineField(doc, 'Адрес:', buyer.address, rightX, 65, half, 105);
  lineField(doc, 'ИНН/КПП покупателя:', innKpp(buyer), rightX, 83, half, 105);
  lineField(doc, 'Валюта: наименование, код', 'Российский рубль, 643', rightX, 95, half, 105);
  lineField(doc, 'Идентификатор государственного контракта:', '', rightX, 107, half, 138);
}

function drawTotals(doc, data, x, y) {
  const leftWidth = COLUMNS.slice(0, 8).reduce((sum, column) => sum + column[1], 0);
  const costWidth = COLUMNS[8][1];
  const exciseAndRate = COLUMNS[9][1] + COLUMNS[10][1];
  const vatWidth = COLUMNS[11][1];
  const totalWidth = COLUMNS[12][1];
  cell(doc, 'Всего к оплате (9)', x, y, leftWidth, 15, { size: 6, bold: true });
  cell(doc, money(data.totals.costWithoutVat), x + leftWidth, y, costWidth, 15, {
    size: 5.5,
    align: 'right',
  });
  cell(doc, 'X', x + leftWidth + costWidth, y, exciseAndRate, 15, {
    size: 6,
    bold: true,
    align: 'center',
  });
  cell(
    doc,
    money(data.totals.vatAmount),
    x + leftWidth + costWidth + exciseAndRate,
    y,
    vatWidth,
    15,
    { size: 5.5, align: 'right' },
  );
  cell(
    doc,
    money(data.totals.totalWithVat),
    x + leftWidth + costWidth + exciseAndRate + vatWidth,
    y,
    totalWidth,
    15,
    { size: 5.5, align: 'right' },
  );
}

function drawSignatures(doc, data, x, y, width) {
  const seller = data.parties.executor;
  const buyer = data.parties.customer;
  const sellerDirector = directorShortName(seller);
  doc.font('Regular').fontSize(6);
  lineField(
    doc,
    'Основание передачи (сдачи) / получения (приемки)',
    [
      data.dpo.additionalAgreementNumber && data.dpo.additionalAgreementDate
        ? `Доп. согл. ${data.dpo.additionalAgreementNumber} от ${shortDate(data.dpo.additionalAgreementDate)}`
        : null,
      data.dpo.contractNumber && data.dpo.contractDate
        ? `Договор № ${data.dpo.contractNumber} от ${shortDate(data.dpo.contractDate)}`
        : null,
    ]
      .filter(Boolean)
      .join('  '),
    x,
    y,
    width,
    198,
  );
  lineField(doc, 'Данные о транспортировке и грузе', '', x, y + 18, width, 165);
  const half = width / 2 - 6;
  doc
    .moveTo(x + width / 2, y + 42)
    .lineTo(x + width / 2, y + 172)
    .lineWidth(0.8)
    .stroke();
  doc
    .font('Regular')
    .fontSize(6.2)
    .text('Товар (груз) передал / услуги, результаты работ, права сдал', x, y + 42);
  lineField(doc, seller.directorPosition, sellerDirector, x, y + 56, half, 118);
  doc
    .fontSize(6)
    .text(
      `Дата отгрузки, передачи (сдачи) « ${dateParts(data.documentDate).day} » ${MONTHS[dateParts(data.documentDate).month - 1]} ${dateParts(data.documentDate).year} года`,
      x,
      y + 72,
      { width: half },
    );
  lineField(
    doc,
    'Ответственный за правильность оформления факта хозяйственной жизни',
    `${seller.directorPosition}  ${sellerDirector}`,
    x,
    y + 100,
    half,
    245,
  );
  doc
    .fontSize(6)
    .text(
      `Наименование экономического субъекта – составителя документа\n${seller.fullName}, ИНН/КПП ${innKpp(seller)}`,
      x,
      y + 125,
      {
        width: half,
      },
    );

  const right = x + width / 2 + 8;
  doc
    .fontSize(6.2)
    .text('Товар (груз) получил / услуги, результаты работ, права принял', right, y + 42);
  lineField(doc, 'Должность', '', right, y + 56, half, 96);
  doc
    .fontSize(6)
    .text('Дата получения (приемки) «     »                 20     года', right, y + 72);
  lineField(
    doc,
    'Ответственный за правильность оформления факта хозяйственной жизни',
    '',
    right,
    y + 100,
    half,
    245,
  );
  doc
    .fontSize(6)
    .text(
      `Наименование экономического субъекта – составителя документа\n${buyer.fullName}, ИНН/КПП ${innKpp(buyer)}`,
      right,
      y + 125,
      {
        width: half,
      },
    );
  doc
    .fontSize(7)
    .text('М.П.', x + 45, y + 163)
    .text('М.П.', right + 45, y + 163);
}

export async function generateUpdPdf(data) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    autoFirstPage: false,
    compress: true,
  });
  doc.registerFont('Regular', FONT);
  doc.registerFont('Bold', FONT_BOLD);
  const output = collect(doc);
  const x = 28;
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column[1], 0);

  doc.addPage();
  drawFirstPageHeader(doc, data, x, tableWidth);
  let y = drawTableHeader(doc, x, 151);
  drawRows(doc, data.rows.slice(0, 17), 0, x, y);
  doc
    .font('Regular')
    .fontSize(4.5)
    .text(
      `Сформировано ${new Date(data.generatedAt).toLocaleString('ru-RU')} · источники: ${(data.dataSources ?? []).join(', ') || 'расчётные данные'}`,
      x,
      579,
      { width: tableWidth, align: 'right' },
    );

  doc.addPage();
  doc
    .font('Regular')
    .fontSize(6.5)
    .text(
      `Универсальный передаточный документ № ${data.documentNumber} от ${longDate(data.documentDate)}`,
      x,
      25,
    )
    .text('Лист 2', x + tableWidth - 45, 25, { width: 45, align: 'right' });
  y = drawTableHeader(doc, x, 38);
  y = drawRows(doc, data.rows.slice(17), 17, x, y);
  drawTotals(doc, data, x, y);
  drawSignatures(doc, data, x + 4, y + 30, tableWidth - 8);
  doc
    .font('Regular')
    .fontSize(4.5)
    .text(
      `Сформировано ${new Date(data.generatedAt).toLocaleString('ru-RU')} · источники: ${(data.dataSources ?? []).join(', ') || 'расчётные данные'}`,
      x,
      579,
      { width: tableWidth, align: 'right' },
    );

  doc.end();
  return output;
}

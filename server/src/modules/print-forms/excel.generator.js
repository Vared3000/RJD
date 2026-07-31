import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

const EXECUTOR = {
  name: 'Общество с ограниченной ответственностью «Лазурит»',
  shortName: 'ООО «Лазурит»',
  address:
    '188309, Ленинградская область, м.р-н Гатчинский, г.п. Гатчинское, г. Гатчина, ул. Новосёлов, дом 7А, помещ. 52',
  okpo: '31078898',
  directorFullName: 'Просовикова Наталья Сергеевна',
  directorInitials: 'Н.С. Просовикова',
  directorSurnameInitials: 'Просовикова Н.С.',
  directorBasis: 'Устава',
};

const CUSTOMER = {
  fullName:
    'Открытое акционерное общество «Российские железные дороги», 107174, г. Москва, вн.тер.г. муниципальный округ Басманный, ул. Новая Басманная, д. 2/1, стр. 1',
  okpo: '00083262',
};

const TEMPLATE_CONFIG = {
  'fpu-26': {
    file: 'fpu-26.xlsx',
    dataStart: 42,
    prototypeRows: 1,
    dataMerges: [
      [1, 4],
      [9, 10],
    ],
  },
  'appendix-1-5': {
    file: 'appendix-1-5.xlsx',
    dataStart: 7,
    prototypeRows: 1,
    dataMerges: [],
  },
  'appendix-1-7': {
    file: 'appendix-1-7.xlsx',
    dataStart: 8,
    prototypeRows: 1,
    dataMerges: [],
  },
};

const MONTHS_GENITIVE = [
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

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

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

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function captureRow(row, columnCount) {
  return {
    height: row.height,
    hidden: row.hidden,
    outlineLevel: row.outlineLevel,
    cells: Array.from({ length: columnCount }, (_, index) => {
      const cell = row.getCell(index + 1);
      return { style: clone(cell.style), numFmt: cell.numFmt };
    }),
  };
}

function applyRow(row, snapshot) {
  row.height = snapshot.height;
  row.hidden = snapshot.hidden;
  row.outlineLevel = snapshot.outlineLevel;
  snapshot.cells.forEach((cellSnapshot, index) => {
    const cell = row.getCell(index + 1);
    cell.style = clone(cellSnapshot.style);
    if (cellSnapshot.numFmt) cell.numFmt = cellSnapshot.numFmt;
    cell.value = null;
  });
}

function mergeModels(sheet) {
  return Object.values(sheet._merges ?? {}).map((merge) => ({ ...merge.model }));
}

function rangeAddress(sheet, model) {
  return `${sheet.getCell(model.top, model.left).address}:${sheet.getCell(
    model.bottom,
    model.right,
  ).address}`;
}

function shiftMerge(model, delta) {
  return {
    ...model,
    top: model.top + delta,
    bottom: model.bottom + delta,
  };
}

function prepareDataRows(sheet, config, requestedCount) {
  const rowCount = Math.max(1, requestedCount);
  const prototype = captureRow(sheet.getRow(config.dataStart), sheet.columnCount);
  const merges = mergeModels(sheet);
  const dataEnd = config.dataStart + config.prototypeRows - 1;
  const delta = rowCount - config.prototypeRows;

  merges.forEach((merge) => sheet.unMergeCells(rangeAddress(sheet, merge)));
  sheet.spliceRows(
    config.dataStart,
    config.prototypeRows,
    ...Array.from({ length: rowCount }, () =>
      Array.from({ length: sheet.columnCount }, () => null),
    ),
  );

  for (let index = 0; index < rowCount; index += 1) {
    applyRow(sheet.getRow(config.dataStart + index), prototype);
  }

  for (const merge of merges) {
    if (merge.bottom < config.dataStart) {
      sheet.mergeCells(rangeAddress(sheet, merge));
    } else if (merge.top > dataEnd) {
      sheet.mergeCells(rangeAddress(sheet, shiftMerge(merge, delta)));
    }
  }

  for (let rowNumber = config.dataStart; rowNumber < config.dataStart + rowCount; rowNumber += 1) {
    for (const [left, right] of config.dataMerges) {
      sheet.mergeCells(rowNumber, left, rowNumber, right);
    }
  }

  return {
    rowCount,
    dataStart: config.dataStart,
    dataEnd: config.dataStart + rowCount - 1,
    footerStart: config.dataStart + rowCount,
    delta,
  };
}

function parseDateOnly(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDate(value) {
  const date = parseDateOnly(value);
  return `${pad2(date.day)}.${pad2(date.month)}.${date.year}`;
}

function formatQuotedDate(value) {
  const date = parseDateOnly(value);
  return `" ${pad2(date.day)} " ${MONTHS_GENITIVE[date.month - 1]} ${date.year}г.`;
}

function periodDescription(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  return `в период " ${pad2(start.day)} " ${MONTHS_GENITIVE[start.month - 1]} ${start.year}г. по  " ${pad2(end.day)} " ${MONTHS_GENITIVE[end.month - 1]} ${end.year}г.:`;
}

function periodTitle(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (start.year === end.year && start.month === end.month) {
    return `${MONTHS_NOMINATIVE[start.month - 1]} ${start.year} года`;
  }
  return `период ${formatDate(from)} - ${formatDate(to)}`;
}

function periodPrepositional(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (start.year === end.year && start.month === end.month) {
    return `в ${MONTHS_PREPOSITIONAL[start.month - 1]} ${start.year} года`;
  }
  return `в период с ${formatDate(from)} по ${formatDate(to)}`;
}

function unitNominative(dpo) {
  const fromFullName = String(dpo.fullName ?? '').split(/\s[-–—]\s/)[0].trim();
  if (fromFullName && /дирекц/i.test(fromFullName)) return fromFullName;
  return String(dpo.name ?? 'ДПО').replace(/\s+ДПО$/i, ' дирекция пассажирских обустройств');
}

function adjectiveGenitive(word) {
  if (/ая$/i.test(word)) return word.replace(/ая$/i, 'ой');
  if (/яя$/i.test(word)) return word.replace(/яя$/i, 'ей');
  return word;
}

function unitGenitive(dpo) {
  const words = unitNominative(dpo).split(/\s+/);
  if (words.length > 0) words[0] = adjectiveGenitive(words[0]);
  if (words[1]?.toLowerCase() === 'дирекция') words[1] = 'дирекции';
  return words.join(' ');
}

function toGenitiveWord(word, isSurname = false) {
  if (!word) return word;
  if (/ович$|евич$|ич$/i.test(word)) return `${word}а`;
  if (/овна$|евна$|ична$/i.test(word)) return word.replace(/а$/i, 'ы');
  if (/ова$|ева$|ина$|ына$/i.test(word)) return word.replace(/а$/i, 'ой');
  if (/ая$/i.test(word)) return word.replace(/ая$/i, 'ой');
  if (/яя$/i.test(word)) return word.replace(/яя$/i, 'ей');
  if (/ий$/i.test(word)) return word.replace(/ий$/i, 'ия');
  if (/й$/i.test(word)) return word.replace(/й$/i, 'я');
  if (/я$/i.test(word)) return word.replace(/я$/i, 'и');
  if (/а$/i.test(word)) {
    const stem = word.slice(0, -1);
    return `${stem}${/[гкхжчшщ]$/i.test(stem) ? 'и' : 'ы'}`;
  }
  if (isSurname || /[бвгджзклмнпрстфхцчшщ]$/i.test(word)) return `${word}а`;
  return word;
}

function fullNameGenitive(fullName) {
  const words = String(fullName ?? '').trim().split(/\s+/);
  return words.map((word, index) => toGenitiveWord(word, index === 0)).join(' ');
}

function initialsFirst(fullName) {
  const [surname = '', first = '', patronymic = ''] = String(fullName ?? '').trim().split(/\s+/);
  return [first, patronymic]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('')
    .concat(surname ? ` ${surname}` : '');
}

function surnameInitials(fullName) {
  const [surname = '', first = '', patronymic = ''] = String(fullName ?? '').trim().split(/\s+/);
  const initials = [first, patronymic]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('');
  return [surname, initials].filter(Boolean).join(' ');
}

function contractLine(dpo) {
  const agreement = [
    dpo.additionalAgreementNumber,
    dpo.additionalAgreementDate ? `от ${formatDate(dpo.additionalAgreementDate)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const contract = [
    dpo.contractNumber,
    dpo.contractDate ? `от ${formatDate(dpo.contractDate)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  if (agreement && contract) {
    return `по дополнительному соглашению ${agreement} к договору № ${contract}`;
  }
  return agreement ? `по дополнительному соглашению ${agreement}` : `по договору № ${contract}`;
}

function dpoWithAddress(dpo) {
  const fullName = dpo.fullName || unitNominative(dpo);
  if (!dpo.address || fullName.includes(dpo.address)) return fullName;
  return `${fullName}, ${dpo.address}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ONES_MALE = [
  '',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
];
const ONES_FEMALE = ['', 'одна', 'две', ...ONES_MALE.slice(3)];
const TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function pluralForm(value, forms) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return forms[2];
  const last = value % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function triadWords(value, female = false) {
  const parts = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (tens) parts.push(TENS[tens]);
    if (ones) parts.push((female ? ONES_FEMALE : ONES_MALE)[ones]);
  }
  return parts;
}

function numberWords(value) {
  const integer = Math.floor(Math.abs(value));
  if (integer === 0) return 'ноль';
  const parts = [];
  const millions = Math.floor(integer / 1_000_000);
  const thousands = Math.floor((integer % 1_000_000) / 1_000);
  const units = integer % 1_000;
  if (millions) {
    parts.push(...triadWords(millions), pluralForm(millions, ['миллион', 'миллиона', 'миллионов']));
  }
  if (thousands) {
    parts.push(
      ...triadWords(thousands, true),
      pluralForm(thousands, ['тысяча', 'тысячи', 'тысяч']),
    );
  }
  if (units) parts.push(...triadWords(units));
  return parts.join(' ');
}

function amountInWords(value) {
  const rounded = Math.round(Number(value || 0) * 100);
  const rubles = Math.floor(rounded / 100);
  const kopecks = rounded % 100;
  const words = numberWords(rubles);
  return `${formatMoney(rounded / 100)} (${words[0].toUpperCase()}${words.slice(
    1,
  )}) ${pluralForm(rubles, ['рубль', 'рубля', 'рублей'])} ${pad2(kopecks)} ${pluralForm(
    kopecks,
    ['копейка', 'копейки', 'копеек'],
  )}`;
}

function formula(formulaText, result) {
  return { formula: formulaText, result: Number(result || 0) };
}

function set(sheet, address, value) {
  sheet.getCell(address).value = value ?? '';
}

function mergeGroups(sheet, rows, dataStart, keyBuilder, columns) {
  let groupStart = 0;
  while (groupStart < rows.length) {
    const key = keyBuilder(rows[groupStart]);
    let groupEnd = groupStart;
    while (groupEnd + 1 < rows.length && keyBuilder(rows[groupEnd + 1]) === key) groupEnd += 1;
    if (groupEnd > groupStart) {
      for (const column of columns) {
        sheet.mergeCells(dataStart + groupStart, column, dataStart + groupEnd, column);
      }
    }
    groupStart = groupEnd + 1;
  }
}

function fillFpu26(sheet, data, positions) {
  const director = data.dpo.directorFullName || '';
  sheet.getColumn(7).hidden = false;
  set(sheet, 'B7', CUSTOMER.fullName.replaceAll('«', '"').replaceAll('»', '"'));
  set(sheet, 'A9', dpoWithAddress(data.dpo));
  set(sheet, 'B11', EXECUTOR.name.replaceAll('«', '"').replaceAll('»', '"'));
  set(sheet, 'A13', EXECUTOR.address);
  set(sheet, 'L6', CUSTOMER.okpo);
  set(sheet, 'L8', data.dpo.businessUnitCode || '-');
  set(sheet, 'L10', EXECUTOR.okpo);
  set(sheet, 'L12', '-');
  set(sheet, 'H16', formatDate(data.to));
  set(sheet, 'A19', contractLine(data.dpo));
  set(
    sheet,
    'A24',
    `Генеральный директор  ${EXECUTOR.shortName.replaceAll('«', '"').replaceAll('»', '"')} ${EXECUTOR.directorFullName}`,
  );
  set(sheet, 'C26', EXECUTOR.directorBasis);
  set(sheet, 'C28', `начальник ${unitGenitive(data.dpo)}`);
  set(sheet, 'A29', director);
  set(sheet, 'C31', data.dpo.directorBasis || '');
  set(
    sheet,
    'A34',
    'составили настоящий акт о том, что работы (услуги), выполненные ИСПОЛНИТЕЛЕМ по обеспечению форменной одеждой',
  );
  set(sheet, 'A35', 'работников структурных подразделений ЦДПО - филиала ОАО "РЖД"');
  set(sheet, 'A38', periodDescription(data.from, data.to));

  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    set(sheet, `A${rowNumber}`, row.modelName);
    set(sheet, `E${rowNumber}`, row.unit || 'шт.');
    set(sheet, `F${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `G${rowNumber}`, Number(row.priceWithoutVat || 0));
    if (row.sourceValues) {
      set(
        sheet,
        `H${rowNumber}`,
        row.sourceFormulas?.displayedPriceWithoutVat
          ? formula(
              row.sourceFormulas.displayedPriceWithoutVat,
              row.displayedPriceWithoutVat,
            )
          : Number(row.displayedPriceWithoutVat || 0),
      );
      set(
        sheet,
        `I${rowNumber}`,
        row.sourceFormulas?.costWithoutVat
          ? formula(row.sourceFormulas.costWithoutVat, row.costWithoutVat)
          : Number(row.costWithoutVat || 0),
      );
      set(
        sheet,
        `K${rowNumber}`,
        row.sourceFormulas?.vatAmount
          ? formula(row.sourceFormulas.vatAmount, row.vatAmount)
          : Number(row.vatAmount || 0),
      );
      set(
        sheet,
        `L${rowNumber}`,
        row.sourceFormulas?.totalWithVat
          ? formula(row.sourceFormulas.totalWithVat, row.totalWithVat)
          : Number(row.totalWithVat || 0),
      );
    } else {
      set(sheet, `H${rowNumber}`, formula(`G${rowNumber}`, row.priceWithoutVat));
      set(
        sheet,
        `I${rowNumber}`,
        formula(`F${rowNumber}*H${rowNumber}`, row.costWithoutVat),
      );
      set(
        sheet,
        `K${rowNumber}`,
        formula(`I${rowNumber}*${row.vatRate || 0}/100`, row.vatAmount),
      );
      set(sheet, `L${rowNumber}`, formula(`I${rowNumber}+K${rowNumber}`, row.totalWithVat));
    }
  });

  const total = positions.footerStart;
  set(sheet, `I${total}`, formula(`SUM(I${positions.dataStart}:I${positions.dataEnd})`, data.totals.costWithoutVat));
  set(sheet, `K${total}`, formula(`SUM(K${positions.dataStart}:K${positions.dataEnd})`, data.totals.vatAmount));
  set(sheet, `L${total}`, formula(`SUM(L${positions.dataStart}:L${positions.dataEnd})`, data.totals.totalWithVat));
  set(sheet, `I${total + 2}`, formula(`I${total}`, data.totals.costWithoutVat));
  set(sheet, `K${total + 2}`, formula(`K${total}`, data.totals.vatAmount));
  set(sheet, `L${total + 2}`, formula(`L${total}`, data.totals.totalWithVat));
  set(sheet, `B${total + 25}`, contractLine(data.dpo).replace(/^по /, ''));
  set(sheet, `F${total + 32}`, `Начальник ${unitGenitive(data.dpo)}`);
  set(sheet, `K${total + 34}`, surnameInitials(director));
  sheet.pageSetup.printArea = `A1:L${total + 38}`;
}

function commonNarrative(data, verb) {
  const director = data.dpo.directorFullName || '';
  const contractDate = data.dpo.contractDate ? formatDate(data.dpo.contractDate) : '';
  return (
    `Открытое акционерное общество «Российские железные дороги», именуемое в дальнейшем Заказчик, ` +
    `в лице начальника ${unitGenitive(data.dpo)} ${fullNameGenitive(director)}, ` +
    `действующего на основании ${data.dpo.directorBasis || 'доверенности'}, с одной стороны, ` +
    `и ${EXECUTOR.name}, именуемое в дальнейшем «Исполнитель», в лице Генерального директора ` +
    `${fullNameGenitive(EXECUTOR.directorFullName)}, действующей на основании ${EXECUTOR.directorBasis}, ` +
    `${verb} к договору от ${contractDate} № ${data.dpo.contractNumber || ''}, заключенному между Сторонами, ` +
    'о нижеследующем:'
  );
}

function fillAppendix15(sheet, data, positions) {
  const director = data.dpo.directorFullName || '';
  sheet.getColumn(7).hidden = false;
  set(sheet, 'B1', 'АКТ');
  set(
    sheet,
    'A2',
    `по оказанию комплекса услуг по обеспечению форменной одеждой работников ${unitNominative(
      data.dpo,
    )} - структурного подразделения Центральной дирекции пассажирских обустройств - филиала ОАО «РЖД» за ${periodTitle(
      data.from,
      data.to,
    )}`,
  );
  set(sheet, 'F3', formatQuotedDate(data.to));
  set(
    sheet,
    'A4',
    `${commonNarrative(data, 'составили и подписали настоящий акт по обеспечению форменной одеждой')}\n` +
      `1. В соответствии с настоящим актом Исполнитель ${periodPrepositional(
        data.from,
        data.to,
      )} обеспечил работников Заказчика, согласно должностям следующими изделиями форменной одежды:\n\n`,
  );

  let number = 0;
  let previousPosition = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    if (row.positionName !== previousPosition) number += 1;
    previousPosition = row.positionName;
    set(sheet, `A${rowNumber}`, number);
    set(sheet, `B${rowNumber}`, row.positionName);
    set(sheet, `C${rowNumber}`, row.modelName);
    set(sheet, `D${rowNumber}`, row.unit || 'шт.');
    set(sheet, `E${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `F${rowNumber}`, Number(row.coverageDays || 0));
    set(sheet, `G${rowNumber}`, Number(row.priceWithoutVat || 0));
    if (row.sourceValues) {
      set(
        sheet,
        `H${rowNumber}`,
        row.sourceFormulas?.costWithoutVat
          ? formula(row.sourceFormulas.costWithoutVat, row.costWithoutVat)
          : Number(row.costWithoutVat || 0),
      );
      set(
        sheet,
        `I${rowNumber}`,
        row.sourceFormulas?.totalWithoutVat
          ? formula(row.sourceFormulas.totalWithoutVat, row.priceWithVat)
          : Number(row.priceWithVat || 0),
      );
      set(
        sheet,
        `J${rowNumber}`,
        row.sourceFormulas?.vatAmount
          ? formula(row.sourceFormulas.vatAmount, row.vatAmount)
          : Number(row.vatAmount || 0),
      );
      set(
        sheet,
        `K${rowNumber}`,
        row.sourceFormulas?.totalWithVat
          ? formula(row.sourceFormulas.totalWithVat, row.totalWithVat)
          : Number(row.totalWithVat || 0),
      );
    } else {
      set(
        sheet,
        `H${rowNumber}`,
        formula(`E${rowNumber}*G${rowNumber}`, row.costWithoutVat),
      );
      set(sheet, `I${rowNumber}`, Number(row.priceWithVat || 0));
      set(
        sheet,
        `J${rowNumber}`,
        formula(`K${rowNumber}-H${rowNumber}`, row.vatAmount),
      );
      set(
        sheet,
        `K${rowNumber}`,
        formula(`E${rowNumber}*I${rowNumber}`, row.totalWithVat),
      );
    }
  });
  mergeGroups(sheet, data.rows, positions.dataStart, (row) => row.positionName, [1, 2]);

  const total = positions.footerStart;
  set(sheet, `J${total}`, formula(`SUM(J${positions.dataStart}:J${positions.dataEnd})`, data.totals.vatAmount));
  set(sheet, `K${total}`, formula(`SUM(K${positions.dataStart}:K${positions.dataEnd})`, data.totals.totalWithVat));
  set(sheet, `B${total + 2}`, `Сумма (итого) ${amountInWords(data.totals.totalWithVat)}.`);
  set(
    sheet,
    `B${total + 6}`,
    `Начальник ${unitGenitive(data.dpo)}\n\n________________________ /${initialsFirst(director)}/`,
  );
  sheet.pageSetup.printArea = `A1:L${total + 6}`;
}

function fillAppendix17(sheet, data, positions) {
  const director = data.dpo.directorFullName || '';
  sheet.getColumn(8).hidden = false;
  set(sheet, 'B1', 'АКТ\nприема-передачи форменной одежды\n');
  set(sheet, 'A2', 'г. Санкт-Петербург');
  set(sheet, 'F2', formatQuotedDate(data.from).replace(/ "/, '"'));
  set(
    sheet,
    'A4',
    `${commonNarrative(data, 'составили и подписали настоящий акт приема-передачи форменной одежды')}\n` +
      '1. В соответствии с настоящим актом Исполнитель передал Заказчику форменную одежду:',
  );

  let number = 0;
  let previousEmployee = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    const employeeKey = `${row.fullName}\u0000${row.personnelNumber}`;
    if (employeeKey !== previousEmployee) number += 1;
    previousEmployee = employeeKey;
    set(sheet, `A${rowNumber}`, number);
    set(sheet, `B${rowNumber}`, row.fullName);
    set(sheet, `C${rowNumber}`, row.personnelNumber);
    set(sheet, `D${rowNumber}`, row.modelName);
    sheet.getCell(`E${rowNumber}`).value = row.inventoryNumber || null;
    set(sheet, `F${rowNumber}`, row.unit || 'шт.');
    set(sheet, `G${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `H${rowNumber}`, Number(row.priceWithoutVat || 0));
    const quantity = Number(row.quantity || 0);
    const unitVat = quantity > 0 ? Number(row.vatAmount || 0) / quantity : 0;
    const unitTotal = quantity > 0 ? Number(row.totalWithVat || 0) / quantity : 0;
    set(
      sheet,
      `I${rowNumber}`,
      formula(`G${rowNumber}*H${rowNumber}`, row.subtotalWithoutVat),
    );
    set(
      sheet,
      `J${rowNumber}`,
      formula(`G${rowNumber}*${unitVat}`, row.vatAmount),
    );
    set(
      sheet,
      `K${rowNumber}`,
      formula(`G${rowNumber}*${unitTotal}`, row.totalWithVat),
    );
  });
  mergeGroups(
    sheet,
    data.rows,
    positions.dataStart,
    (row) => `${row.fullName}\u0000${row.personnelNumber}`,
    [1, 2, 3],
  );

  const total = positions.footerStart;
  set(sheet, `J${total}`, formula(`SUM(J${positions.dataStart}:J${positions.dataEnd})`, data.totals.vatAmount));
  set(sheet, `K${total}`, formula(`SUM(K${positions.dataStart}:K${positions.dataEnd})`, data.totals.totalWithVat));
  set(
    sheet,
    `B${total + 5}`,
    `Начальник ${unitGenitive(data.dpo).replace(/\s+пассажирских\s+обустройств$/i, '')}`,
  );
  set(sheet, `B${total + 8}`, `__________________/${initialsFirst(director)}/`);
  sheet.pageSetup.printArea = `A1:K${total + 8}`;
}

const FILLERS = {
  'fpu-26': fillFpu26,
  'appendix-1-5': fillAppendix15,
  'appendix-1-7': fillAppendix17,
};

export async function generateExcel(data) {
  const config = TEMPLATE_CONFIG[data.form];
  const fill = FILLERS[data.form];
  if (!config || !fill) throw new Error(`Неизвестная печатная форма: ${data.form}`);

  const workbook = new ExcelJS.Workbook();
  const templatePath = fileURLToPath(new URL(`./templates/${config.file}`, import.meta.url));
  await workbook.xlsx.readFile(templatePath);
  workbook.creator = 'ERP Учёт спецодежды';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.worksheets[0];
  const positions = prepareDataRows(sheet, config, data.rows.length);
  fill(sheet, data, positions);
  sheet.views = [{ showGridLines: false }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

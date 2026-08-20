import ExcelJS from 'exceljs';
import { ApiError } from '../../utils/api-error.js';

export const STARTUP_IMPORT_HEADERS = {
  dpos: {
    sheet: 'ДПО',
    headers: [
      'Наименование',
      'Полное наименование',
      'Код',
      'Адрес',
      'ОКПО',
      'Код подразделения',
      'ФИО руководителя',
    ],
    // Необязательная колонка (раздел А1 ТЗ от 19.08.2026) — старые файлы без
    // неё продолжают импортироваться, см. detectHeaders().
    optionalHeaders: ['Регион'],
  },
  models: {
    sheet: 'Номенклатура',
    headers: [
      'Наименование',
      'Артикул',
      'Единица',
      'Тип размера',
      'Требует рост',
      'Цена аренды без НДС',
      'НДС аренды, %',
      'Описание',
    ],
    // Необязательная колонка (раздел А2 ТЗ от 19.08.2026).
    optionalHeaders: ['Категория по полу'],
  },
  employees: {
    sheet: 'Работники',
    headers: [
      'ФИО',
      'Табельный номер',
      'ДПО',
      'Должность',
      'Пол',
      'Дата рождения',
      'Дата приёма',
      'Размер одежды',
      'Рост',
      'Размер обуви',
      'Размер головного убора',
      'Размер ремня',
      'Размер перчаток',
      'Телефон',
    ],
  },
  balances: {
    sheet: 'Остатки',
    headers: ['Склад', 'Номенклатура', 'Размер', 'Рост', 'Количество', 'Состояние'],
  },
};

const TYPE_MAP = new Map([
  ['clothing', 'clothing'],
  ['одежда', 'clothing'],
  ['shoe', 'shoe'],
  ['обувь', 'shoe'],
  ['headwear', 'headwear'],
  ['головной убор', 'headwear'],
  ['belt', 'belt'],
  ['ремень', 'belt'],
  ['gloves', 'gloves'],
  ['перчатки', 'gloves'],
  ['none', null],
  ['без размера', null],
]);
const GENDER_CATEGORY_MAP = new Map([
  ['male', 'male'],
  ['мужское', 'male'],
  ['мужской', 'male'],
  ['female', 'female'],
  ['женское', 'female'],
  ['женский', 'female'],
  ['unisex', 'unisex'],
  ['унисекс', 'unisex'],
  ['unspecified', 'unspecified'],
  ['не определено', 'unspecified'],
  ['', 'unspecified'],
]);
const CONDITION_MAP = new Map([
  ['новая', 'new'],
  ['новое', 'new'],
  ['хорошая', 'good'],
  ['хорошее', 'good'],
  ['изношенная', 'worn'],
  ['изношенное', 'worn'],
  ['повреждённая', 'damaged'],
  ['поврежденная', 'damaged'],
  ['повреждённое', 'damaged'],
  ['поврежденное', 'damaged'],
]);

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[«»„“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellValue(cell) {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  if (cell.value && typeof cell.value === 'object') {
    if ('result' in cell.value) return normalizeText(cell.value.result);
    if ('text' in cell.value) return normalizeText(cell.value.text);
    if (Array.isArray(cell.value.richText)) {
      return normalizeText(cell.value.richText.map((part) => part.text).join(''));
    }
  }
  return normalizeText(cell.value);
}

function nullable(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function lower(value) {
  return normalizeText(value).toLocaleLowerCase('ru-RU');
}

function parseDate(value, label, protocol, location) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return value;
  const ru = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  protocol.push({ level: 'error', location, message: `${label}: используйте дату ГГГГ-ММ-ДД` });
  return null;
}

function parseNumber(value, label, protocol, location, { integer = false, required = false } = {}) {
  if (!value && value !== 0) {
    if (required)
      protocol.push({ level: 'error', location, message: `${label}: значение обязательно` });
    return null;
  }
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    protocol.push({
      level: 'error',
      location,
      message: `${label}: требуется ${integer ? 'целое неотрицательное' : 'неотрицательное'} число`,
    });
    return null;
  }
  return number;
}

// Необязательные колонки допускаются только последними в листе — если ячейка
// сразу после базового набора совпадает с ожидаемым названием, считаем её
// присутствующей; иначе лист читается по старому набору колонок (обратная
// совместимость со старыми файлами, см. optionalHeaders в definition).
function detectHeaders(sheet, definition) {
  const optional = definition.optionalHeaders ?? [];
  if (optional.length === 0) return definition.headers;
  const nextCell = cellValue(sheet.getCell(1, definition.headers.length + 1));
  if (nextCell === optional[0]) return [...definition.headers, optional[0]];
  return definition.headers;
}

function assertHeaders(sheet, expected) {
  const actual = expected.map((_, index) => cellValue(sheet.getCell(1, index + 1)));
  const mismatch = expected.findIndex((header, index) => actual[index] !== header);
  if (mismatch >= 0) {
    throw ApiError.badRequest(
      `Лист «${sheet.name}»: колонка ${mismatch + 1} должна называться «${expected[mismatch]}»`,
    );
  }
}

function readRows(sheet, headers) {
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const values = headers.map((_, index) => cellValue(sheet.getCell(rowNumber, index + 1)));
    if (values.every((value) => value === '')) continue;
    rows.push({ rowNumber, values });
  }
  return rows;
}

function deduplicate(rows, keyOf, protocol, entityLabel) {
  const unique = [];
  const seen = new Map();
  let duplicates = 0;
  for (const row of rows) {
    const key = keyOf(row);
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, row);
      unique.push(row);
      continue;
    }
    const comparable = JSON.stringify({ ...row, rowNumber: undefined });
    const previousComparable = JSON.stringify({ ...previous, rowNumber: undefined });
    if (comparable === previousComparable) {
      duplicates += 1;
      protocol.push({
        level: 'warning',
        location: `${entityLabel}, строка ${row.rowNumber}`,
        message: `Точный дубль строки ${previous.rowNumber} будет пропущен`,
      });
    } else {
      protocol.push({
        level: 'error',
        location: `${entityLabel}, строка ${row.rowNumber}`,
        message: `Ключ «${key}» уже встречался в строке ${previous.rowNumber} с другими данными`,
      });
    }
  }
  return { rows: unique, duplicates };
}

export async function parseStartupWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw ApiError.badRequest('Файл повреждён или не является книгой .xlsx');
  }

  const sheets = {};
  for (const [key, definition] of Object.entries(STARTUP_IMPORT_HEADERS)) {
    const sheet = workbook.getWorksheet(definition.sheet);
    if (!sheet) throw ApiError.badRequest(`В книге нет обязательного листа «${definition.sheet}»`);
    const effectiveHeaders = detectHeaders(sheet, definition);
    assertHeaders(sheet, effectiveHeaders);
    sheets[key] = readRows(sheet, effectiveHeaders);
  }

  const protocol = [];
  const dpos = sheets.dpos.map(({ rowNumber, values }) => {
    const [name, fullName, code, address, okpo, businessUnitCode, directorFullName, region] =
      values;
    const location = `ДПО, строка ${rowNumber}`;
    if (!name) protocol.push({ level: 'error', location, message: 'Наименование обязательно' });
    if (!fullName)
      protocol.push({ level: 'error', location, message: 'Полное наименование обязательно' });
    return {
      rowNumber,
      name,
      fullName,
      code: nullable(code),
      address: nullable(address),
      okpo: nullable(okpo),
      businessUnitCode: nullable(businessUnitCode),
      directorFullName: nullable(directorFullName),
      region: nullable(region),
    };
  });

  const models = sheets.models.map(({ rowNumber, values }) => {
    const [
      name,
      article,
      unit,
      rawSizeType,
      rawRequiresHeight,
      rentalPriceValue,
      rentalVatRateValue,
      description,
      rawGenderCategory,
    ] = values;
    const location = `Номенклатура, строка ${rowNumber}`;
    if (!name) protocol.push({ level: 'error', location, message: 'Наименование обязательно' });
    const typeKey = lower(rawSizeType || 'none');
    if (!TYPE_MAP.has(typeKey)) {
      protocol.push({
        level: 'error',
        location,
        message: `Неизвестный тип размера «${rawSizeType}»`,
      });
    }
    const requiresHeightSize = ['да', 'yes', 'true', '1'].includes(lower(rawRequiresHeight));
    const sizeType = TYPE_MAP.get(typeKey) ?? null;
    if (requiresHeightSize && sizeType !== 'clothing') {
      protocol.push({
        level: 'error',
        location,
        message: 'Рост можно требовать только для типа clothing',
      });
    }
    const genderCategoryKey = lower(rawGenderCategory);
    if (!GENDER_CATEGORY_MAP.has(genderCategoryKey)) {
      protocol.push({
        level: 'error',
        location,
        message: `Неизвестная категория по полу «${rawGenderCategory}»`,
      });
    }
    return {
      rowNumber,
      name,
      article: nullable(article),
      unit: nullable(unit) || 'шт',
      sizeType,
      requiresHeightSize,
      genderCategory: GENDER_CATEGORY_MAP.get(genderCategoryKey) ?? 'unspecified',
      rentalPrice:
        parseNumber(
          rentalPriceValue === '' ? 0 : rentalPriceValue,
          'Цена аренды без НДС',
          protocol,
          location,
        ) ?? 0,
      rentalVatRate:
        parseNumber(
          rentalVatRateValue === '' ? 5 : rentalVatRateValue,
          'НДС аренды, %',
          protocol,
          location,
        ) ?? 5,
      description: nullable(description),
    };
  });

  const employees = sheets.employees.map(({ rowNumber, values }) => {
    const [
      fullName,
      personnelNumber,
      dpoName,
      positionName,
      rawGender,
      birthDate,
      hireDate,
      clothingSize,
      heightSize,
      shoeSize,
      headwearSize,
      beltSize,
      glovesSize,
      phone,
    ] = values;
    const location = `Работники, строка ${rowNumber}`;
    if (!fullName) protocol.push({ level: 'error', location, message: 'ФИО обязательно' });
    if (!personnelNumber)
      protocol.push({ level: 'error', location, message: 'Табельный номер обязателен' });
    const genderKey = lower(rawGender);
    const gender =
      genderKey === 'мужской' || genderKey === 'male'
        ? 'male'
        : genderKey === 'женский' || genderKey === 'female'
          ? 'female'
          : null;
    if (rawGender && !gender)
      protocol.push({ level: 'error', location, message: `Неизвестный пол «${rawGender}»` });
    return {
      rowNumber,
      fullName,
      personnelNumber,
      dpoName: nullable(dpoName),
      positionName: nullable(positionName),
      gender,
      birthDate: parseDate(birthDate, 'Дата рождения', protocol, location),
      hireDate: parseDate(hireDate, 'Дата приёма', protocol, location),
      clothingSize: nullable(clothingSize),
      heightSize: nullable(heightSize),
      shoeSize: nullable(shoeSize),
      headwearSize: nullable(headwearSize),
      beltSize: nullable(beltSize),
      glovesSize: nullable(glovesSize),
      phone: nullable(phone),
    };
  });

  const balances = sheets.balances.map(({ rowNumber, values }) => {
    const [warehouseName, modelName, size, height, quantityValue, rawCondition] = values;
    const location = `Остатки, строка ${rowNumber}`;
    if (!['входящие', 'возврат старой формы'].includes(lower(warehouseName))) {
      protocol.push({ level: 'error', location, message: `Недопустимый склад «${warehouseName}»` });
    }
    if (!modelName)
      protocol.push({ level: 'error', location, message: 'Номенклатура обязательна' });
    const condition = CONDITION_MAP.get(lower(rawCondition || 'новая'));
    if (!condition)
      protocol.push({
        level: 'error',
        location,
        message: `Неизвестное состояние «${rawCondition}»`,
      });
    const quantity = parseNumber(quantityValue, 'Количество', protocol, location, {
      integer: true,
      required: true,
    });
    if (quantity === 0)
      protocol.push({ level: 'error', location, message: 'Количество должно быть больше нуля' });
    return {
      rowNumber,
      warehouseCode: lower(warehouseName) === 'входящие' ? 'INCOMING' : 'OLD_RETURN',
      warehouseName,
      modelName,
      size: nullable(size),
      height: nullable(height),
      quantity,
      condition: condition ?? 'new',
    };
  });

  const uniqueDpos = deduplicate(dpos, (row) => lower(row.code || row.name), protocol, 'ДПО');
  const uniqueModels = deduplicate(
    models,
    (row) => lower(row.article || row.name),
    protocol,
    'Номенклатура',
  );
  const uniqueEmployees = deduplicate(
    employees,
    (row) => lower(row.personnelNumber),
    protocol,
    'Работники',
  );
  const uniqueBalances = deduplicate(
    balances,
    (row) =>
      [
        row.warehouseCode,
        lower(row.modelName),
        lower(row.size),
        lower(row.height),
        row.condition,
      ].join('|'),
    protocol,
    'Остатки',
  );

  return {
    payload: {
      dpos: uniqueDpos.rows,
      models: uniqueModels.rows,
      employees: uniqueEmployees.rows,
      balances: uniqueBalances.rows,
    },
    protocol,
    duplicates: {
      dpos: uniqueDpos.duplicates,
      models: uniqueModels.duplicates,
      employees: uniqueEmployees.duplicates,
      balances: uniqueBalances.duplicates,
    },
  };
}

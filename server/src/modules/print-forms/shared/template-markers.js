import { mergeModels } from './excel-merge-utils.js';

const MARKER_PATTERN = /^\{\{([A-Z][A-Z0-9_.]*)\}\}$/;

function cellText(cell) {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  return null;
}

function markerName(cell) {
  const text = cellText(cell);
  if (!text) return null;
  const match = MARKER_PATTERN.exec(text.trim());
  return match ? match[1] : null;
}

function findAllMarkerCells(sheet) {
  const found = [];
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, columnNumber) => {
      // Слайв-ячейки объединения (не мастер) отражают значение мастера через
      // прокси exceljs — без этой проверки каждая ячейка внутри объединения
      // засчитывается как отдельное вхождение того же маркера.
      if (cell.master !== cell) return;
      const name = markerName(cell);
      if (name) found.push({ name, rowNumber, columnNumber, address: cell.address });
    });
  });
  return found;
}

// Разбирает шаблон ДО spliceRows: где повторяемая область (TABLE_START/
// TABLE_END), какие колонки в строке-прототипе размечены построчными
// маркерами ({{ROW.ИМЯ}}), какие объединения ячеек внутри неё нужно
// переносить на каждую сгенерированную строку. Бросает обычную Error с
// понятным текстом — вызывающий код сам решает, превращать её в мягкую
// ошибку валидации (загрузка шаблона) или в жёсткий сбой (боевая генерация
// по уже активной, ранее провалидированной версии).
export function scanTemplateStructure(sheet) {
  const allMarkers = findAllMarkerCells(sheet);
  const starts = allMarkers.filter((marker) => marker.name === 'TABLE_START');
  const ends = allMarkers.filter((marker) => marker.name === 'TABLE_END');
  if (starts.length !== 1) {
    throw new Error(`Ожидается ровно один маркер {{TABLE_START}}, найдено: ${starts.length}`);
  }
  if (ends.length !== 1) {
    throw new Error(`Ожидается ровно один маркер {{TABLE_END}}, найдено: ${ends.length}`);
  }
  const tableStartRow = starts[0].rowNumber;
  const tableEndRow = ends[0].rowNumber;
  if (tableEndRow <= tableStartRow) {
    throw new Error('{{TABLE_END}} должен находиться в строке после {{TABLE_START}}');
  }

  const rowColumnMarkers = new Map();
  for (const marker of allMarkers) {
    if (marker.rowNumber !== tableStartRow || !marker.name.startsWith('ROW.')) continue;
    rowColumnMarkers.set(marker.name.slice('ROW.'.length), marker.columnNumber);
  }

  const dataMerges = mergeModels(sheet)
    .filter((merge) => merge.top === tableStartRow && merge.bottom === tableStartRow)
    .map((merge) => [merge.left, merge.right]);

  const headerFooterMarkers = allMarkers.filter(
    (marker) =>
      marker.name !== 'TABLE_START' &&
      marker.name !== 'TABLE_END' &&
      !marker.name.startsWith('ROW.'),
  );

  return {
    tableStartRow,
    tableEndRow,
    prototypeRows: tableEndRow - tableStartRow,
    dataMerges,
    rowColumnMarkers,
    headerFooterMarkers,
    allMarkerNames: allMarkers.map((marker) => marker.name),
    tableStartAddress: starts[0].address,
    tableEndAddress: ends[0].address,
    tableEndColumn: ends[0].columnNumber,
  };
}

// Проверяет разобранную структуру против спецификации формы (какие маркеры
// шапки/подвала и строки обязательны). Закрывает пункт плана «проверять
// формулы итогов и допустимые поля подстановки»: неизвестный токен-опечатка,
// пропущенный обязательный маркер или маркер итога, случайно попавший внутрь
// повторяемой области (там он молча исчезнет при сплайсе), — всё это ошибки
// валидации ДО того, как шаблон станет активным.
export function validateMarkers(structure, spec) {
  const errors = [];
  const knownNames = new Set([
    'TABLE_START',
    'TABLE_END',
    ...spec.header,
    ...spec.row.map((name) => `ROW.${name}`),
  ]);

  for (const name of structure.allMarkerNames) {
    if (!knownNames.has(name)) errors.push(`Неизвестный маркер: {{${name}}}`);
  }

  for (const name of spec.header) {
    const occurrences = structure.headerFooterMarkers.filter((marker) => marker.name === name);
    if (occurrences.length === 0) {
      errors.push(`Отсутствует обязательный маркер {{${name}}}`);
      continue;
    }
    if (occurrences.length > 1) {
      errors.push(`Маркер {{${name}}} встречается больше одного раза`);
      continue;
    }
    const { rowNumber } = occurrences[0];
    if (rowNumber >= structure.tableStartRow && rowNumber < structure.tableEndRow) {
      errors.push(`Маркер {{${name}}} не должен находиться внутри повторяемой области таблицы`);
    }
  }

  for (const name of spec.row) {
    if (!structure.rowColumnMarkers.has(name)) {
      errors.push(`Отсутствует обязательный маркер строки {{ROW.${name}}}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Разбирает шаблон ПОСЛЕ spliceRows: адреса маркеров шапки/подвала уже не
// нужно вычислять вручную (`total + 25` и т.п.) — они просто ищутся там, где
// физически оказались после раздвижения таблицы под реальное число строк.
export function resolveAddressMarkers(sheet, names) {
  const resolved = new Map();
  for (const marker of findAllMarkerCells(sheet)) {
    if (names.includes(marker.name)) resolved.set(marker.name, marker.address);
  }
  return resolved;
}

// TABLE_START живёт внутри вырезаемого при сплайсе блока и обнуляется сам
// (applyRow чистит значения всех новых строк). TABLE_END — в строке сразу
// после блока, сплайс её не трогает, только сдвигает: без явной очистки
// буквальный текст маркера останется в готовом документе.
export function clearMarkerCell(sheet, address) {
  if (!address) return;
  sheet.getCell(address).value = null;
}

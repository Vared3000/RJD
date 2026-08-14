import ExcelJS from 'exceljs';
import { ApiError } from '../../../utils/api-error.js';
import { mergeModels } from '../shared/excel-merge-utils.js';

export const TEMPLATE_LAYOUT_LIMITS = {
  maxRows: 250,
  maxColumns: 50,
  maxStyles: 500,
};

export async function createBlankTemplateBuffer({ rowCount = 60, columnCount = 14 } = {}) {
  if (
    rowCount < 1 ||
    columnCount < 1 ||
    rowCount > TEMPLATE_LAYOUT_LIMITS.maxRows ||
    columnCount > TEMPLATE_LAYOUT_LIMITS.maxColumns
  ) {
    throw ApiError.badRequest('Некорректный размер пустого макета');
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Новый макет', {
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      scale: 100,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0, footer: 0.2 },
    },
  });

  for (let column = 1; column <= columnCount; column += 1) {
    sheet.getColumn(column).width = column === 1 ? 6 : 12;
  }
  for (let row = 1; row <= rowCount; row += 1) {
    const target = sheet.getRow(row);
    target.height = 20;
    for (let column = 1; column <= columnCount; column += 1) {
      target.getCell(column).value = '';
    }
  }
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(columnCount).letter}${rowCount}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function editableCellValue(value) {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function displayValue(cell) {
  if (editableCellValue(cell.value)) return cell.value;
  return cell.text ?? '';
}

function compactStyle(style) {
  const result = {};
  for (const key of ['numFmt', 'font', 'alignment', 'protection', 'border', 'fill']) {
    if (style?.[key] != null && Object.keys(style[key] ?? {}).length !== 0) {
      result[key] = clone(style[key]);
    }
  }
  return result;
}

function styleCatalog() {
  const styles = [];
  const indexes = new Map();
  return {
    styles,
    idFor(style) {
      const compact = compactStyle(style);
      const key = JSON.stringify(compact);
      if (indexes.has(key)) return indexes.get(key);
      const id = styles.length;
      styles.push(compact);
      indexes.set(key, id);
      return id;
    },
  };
}

function printablePageSetup(pageSetup = {}) {
  return {
    orientation: pageSetup.orientation ?? 'portrait',
    paperSize: Number(pageSetup.paperSize ?? 9),
    scale: Number(pageSetup.scale ?? 100),
    fitToPage: Boolean(pageSetup.fitToPage),
    fitToWidth: Number(pageSetup.fitToWidth ?? 1),
    fitToHeight: Number(pageSetup.fitToHeight ?? 0),
    horizontalCentered: Boolean(pageSetup.horizontalCentered),
    verticalCentered: Boolean(pageSetup.verticalCentered),
    printArea: pageSetup.printArea ?? '',
    printTitlesRow: pageSetup.printTitlesRow ?? '',
    margins: {
      left: Number(pageSetup.margins?.left ?? 0.25),
      right: Number(pageSetup.margins?.right ?? 0.25),
      top: Number(pageSetup.margins?.top ?? 0.35),
      bottom: Number(pageSetup.margins?.bottom ?? 0.35),
      header: Number(pageSetup.margins?.header ?? 0),
      footer: Number(pageSetup.margins?.footer ?? 0.2),
    },
  };
}

function dimensions(sheet) {
  const rowCount = Math.max(1, sheet.rowCount);
  const columnCount = Math.max(1, sheet.columnCount);
  if (
    rowCount > TEMPLATE_LAYOUT_LIMITS.maxRows ||
    columnCount > TEMPLATE_LAYOUT_LIMITS.maxColumns
  ) {
    throw ApiError.badRequest(
      `Лист слишком большой для визуального редактора: ${rowCount}×${columnCount}. ` +
        `Допустимо до ${TEMPLATE_LAYOUT_LIMITS.maxRows}×${TEMPLATE_LAYOUT_LIMITS.maxColumns}`,
    );
  }
  return { rowCount, columnCount };
}

export async function readTemplateLayout(buffer, allowedMarkers) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw ApiError.badRequest('Версия шаблона повреждена и не открывается в редакторе');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw ApiError.badRequest('В шаблоне нет листа');
  const { rowCount, columnCount } = dimensions(sheet);
  const catalog = styleCatalog();
  const cells = [];

  for (let row = 1; row <= rowCount; row += 1) {
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = sheet.getCell(row, column);
      cells.push({
        row,
        column,
        value: displayValue(cell),
        editable: editableCellValue(cell.value) && cell.master === cell,
        styleId: catalog.idFor(cell.style),
      });
    }
  }

  return {
    sheetName: sheet.name,
    rowCount,
    columnCount,
    cells,
    styles: catalog.styles,
    rows: Array.from({ length: rowCount }, (_, index) => {
      const row = sheet.getRow(index + 1);
      return {
        index: index + 1,
        height: Number(row.height ?? sheet.properties.defaultRowHeight ?? 15),
        hidden: Boolean(row.hidden),
      };
    }),
    columns: Array.from({ length: columnCount }, (_, index) => {
      const column = sheet.getColumn(index + 1);
      return {
        index: index + 1,
        width: Number(column.width ?? 8.43),
        hidden: Boolean(column.hidden),
      };
    }),
    merges: mergeModels(sheet).map(({ top, left, bottom, right }) => ({
      top,
      left,
      bottom,
      right,
    })),
    pageSetup: printablePageSetup(sheet.pageSetup),
    allowedMarkers,
  };
}

function assertCompleteGrid(layout) {
  if (layout.cells.length !== layout.rowCount * layout.columnCount) {
    throw ApiError.badRequest('Редактор передал неполную сетку листа');
  }
  const coordinates = new Set();
  for (const cell of layout.cells) {
    if (cell.row > layout.rowCount || cell.column > layout.columnCount) {
      throw ApiError.badRequest('Ячейка находится за пределами редактируемого листа');
    }
    if (cell.styleId >= layout.styles.length) {
      throw ApiError.badRequest('Ячейка ссылается на неизвестный стиль');
    }
    const key = `${cell.row}:${cell.column}`;
    if (coordinates.has(key)) throw ApiError.badRequest('В сетке обнаружены повторяющиеся ячейки');
    coordinates.add(key);
  }

  const rowIndexes = new Set(layout.rows.map((row) => row.index));
  const columnIndexes = new Set(layout.columns.map((column) => column.index));
  if (
    layout.rows.length !== layout.rowCount ||
    rowIndexes.size !== layout.rowCount ||
    [...rowIndexes].some((index) => index > layout.rowCount)
  ) {
    throw ApiError.badRequest('Передан неполный набор строк листа');
  }
  if (
    layout.columns.length !== layout.columnCount ||
    columnIndexes.size !== layout.columnCount ||
    [...columnIndexes].some((index) => index > layout.columnCount)
  ) {
    throw ApiError.badRequest('Передан неполный набор столбцов листа');
  }

  for (const merge of layout.merges) {
    if (merge.bottom > layout.rowCount || merge.right > layout.columnCount) {
      throw ApiError.badRequest('Объединение находится за пределами листа');
    }
  }
}

function applyPageSetup(sheet, pageSetup) {
  sheet.pageSetup = {
    ...sheet.pageSetup,
    ...pageSetup,
    printArea: pageSetup.printArea || undefined,
    printTitlesRow: pageSetup.printTitlesRow || undefined,
    margins: pageSetup.margins,
  };
}

export async function buildTemplateFromLayout(baseBuffer, layout) {
  assertCompleteGrid(layout);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(baseBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw ApiError.badRequest('В исходной версии нет листа');

  const lockedValues = new Map();
  for (const cell of layout.cells) {
    const baseValue = sheet.getCell(cell.row, cell.column).value;
    if (!editableCellValue(baseValue)) lockedValues.set(`${cell.row}:${cell.column}`, baseValue);
  }

  for (const merge of mergeModels(sheet)) {
    sheet.unMergeCells(merge.top, merge.left, merge.bottom, merge.right);
  }

  for (const column of layout.columns) {
    const target = sheet.getColumn(column.index);
    target.width = column.width;
    target.hidden = column.hidden;
  }
  for (const row of layout.rows) {
    const target = sheet.getRow(row.index);
    target.height = row.height;
    target.hidden = row.hidden;
  }
  for (const cell of layout.cells) {
    const target = sheet.getCell(cell.row, cell.column);
    target.style = clone(layout.styles[cell.styleId] ?? {});
    const key = `${cell.row}:${cell.column}`;
    target.value = lockedValues.has(key) ? lockedValues.get(key) : cell.value;
  }

  for (const merge of layout.merges) {
    try {
      sheet.mergeCellsWithoutStyle(merge.top, merge.left, merge.bottom, merge.right);
    } catch {
      throw ApiError.badRequest('Объединения ячеек пересекаются или заданы некорректно');
    }
  }

  sheet.name = layout.sheetName;
  applyPageSetup(sheet, layout.pageSetup);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

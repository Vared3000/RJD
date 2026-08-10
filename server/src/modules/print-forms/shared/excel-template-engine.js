import ExcelJS from 'exceljs';

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
  return `${sheet.getCell(model.top, model.left).address}:${
    sheet.getCell(model.bottom, model.right).address
  }`;
}

function shiftMerge(model, delta) {
  return {
    ...model,
    top: model.top + delta,
    bottom: model.bottom + delta,
  };
}

// Шаблоны содержат одну прототипную строку (или блок строк для личной
// карточки) с уже готовым оформлением. Реальное число строк акта известно
// только после загрузки данных, поэтому строка размножается на нужное
// количество копий с сохранением стилей, числовых форматов и объединений,
// а подвал (итоги/подписи) сдвигается на разницу.
export function prepareDataRows(sheet, config, requestedCount) {
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

export function formula(formulaText, result) {
  return { formula: formulaText, result: Number(result || 0) };
}

export function set(sheet, address, value) {
  sheet.getCell(address).value = value ?? '';
}

export function addSourceNote(cell, row) {
  if (!row.dataSourceLabel) return;
  cell.note = [
    `Источник данных: ${row.dataSourceLabel}`,
    row.sourceReference ? `Ссылка: ${row.sourceReference}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// Схлопывает вертикально повторяющееся значение (должность, ФИО работника) в
// одну объединённую ячейку на всю группу подряд идущих строк с этим значением.
export function mergeGroups(sheet, rows, dataStart, keyBuilder, columns) {
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

// Каждый мэппер формы описывает свой шаблон (`templatePath`, `dataStart`,
// `prototypeRows`, `dataMerges`) и функцию `fill(sheet, data, positions)`,
// расставляющую значения по ячейкам конкретного шаблона.
export async function generateExcelFromTemplate(data, mapper) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(mapper.templatePath);
  workbook.creator = 'ERP Учёт спецодежды';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.worksheets[0];
  const positions = prepareDataRows(sheet, mapper, data.rows.length);
  mapper.fill(sheet, data, positions);
  sheet.views = [{ showGridLines: false }];
  const sourceText = data.dataSources?.length ? data.dataSources.join(', ') : 'расчётные данные';
  const generatedText = `Сформировано ${new Date(data.generatedAt).toLocaleString('ru-RU')} · источники: ${sourceText}`;
  workbook.subject = generatedText;
  sheet.headerFooter = { ...(sheet.headerFooter ?? {}), oddFooter: `&L${generatedText}` };
  sheet.getCell('A1').note = generatedText;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

import { set, formula, addSourceNote, mergeGroups } from '../shared/excel-template-engine.js';
import {
  formatQuotedDate,
  unitGenitive,
  initialsFirst,
  commonNarrative,
} from '../shared/ru-format.js';

export const appendix17MarkerSpec = {
  header: [
    'ACT_DATE',
    'ACT_NARRATIVE',
    'TOTAL_VAT',
    'TOTAL_WITH_VAT',
    'DPO_HEAD_TITLE',
    'DPO_DIRECTOR_SIGNATURE',
  ],
  row: [
    'SEQUENCE_NUMBER',
    'EMPLOYEE_NAME',
    'PERSONNEL_NUMBER',
    'MODEL_NAME',
    'INVENTORY_NUMBER',
    'UNIT',
    'QUANTITY',
    'PRICE_WITHOUT_VAT',
    'COST_WITHOUT_VAT',
    'VAT_AMOUNT',
    'TOTAL_WITH_VAT',
  ],
};

function columnLetter(sheet, column, row) {
  return sheet.getCell(row, column).address.replace(/\d+$/, '');
}

function fillAppendix17(sheet, data, positions, markers) {
  const director = data.dpo.directorFullName || '';
  const header = markers.header;
  const rowColumn = markers.row;
  sheet.getColumn(rowColumn.get('PRICE_WITHOUT_VAT')).hidden = false;
  // Код СКМТР / инвентарный номер в официальном акте 1.7 отсутствует —
  // маркер в шаблоне оставляем (валидация), колонку скрываем.
  sheet.getColumn(rowColumn.get('INVENTORY_NUMBER')).hidden = true;

  set(sheet, header.get('ACT_DATE'), formatQuotedDate(data.from).replace(/ "/, '"'));
  set(
    sheet,
    header.get('ACT_NARRATIVE'),
    `${commonNarrative(data, 'составили и подписали настоящий акт приема-передачи форменной одежды')}\n` +
      '1. В соответствии с настоящим актом Исполнитель передал Заказчику форменную одежду:',
  );

  const quantityCol = columnLetter(sheet, rowColumn.get('QUANTITY'), positions.dataStart);
  const priceCol = columnLetter(sheet, rowColumn.get('PRICE_WITHOUT_VAT'), positions.dataStart);
  const vatCol = columnLetter(sheet, rowColumn.get('VAT_AMOUNT'), positions.dataStart);
  const totalCol = columnLetter(sheet, rowColumn.get('TOTAL_WITH_VAT'), positions.dataStart);

  let number = 0;
  let previousEmployee = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    const employeeKey = JSON.stringify([row.fullName, row.personnelNumber]);
    if (employeeKey !== previousEmployee) number += 1;
    previousEmployee = employeeKey;
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('SEQUENCE_NUMBER')).address, number);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('EMPLOYEE_NAME')).address, row.fullName);
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('PERSONNEL_NUMBER')).address,
      row.personnelNumber,
    );
    const modelCell = sheet.getCell(rowNumber, rowColumn.get('MODEL_NAME'));
    modelCell.value = row.modelName;
    addSourceNote(modelCell, row);
    sheet.getCell(rowNumber, rowColumn.get('INVENTORY_NUMBER')).value = null;
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('UNIT')).address, row.unit || 'шт.');
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('QUANTITY')).address,
      Number(row.quantity || 0),
    );
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('PRICE_WITHOUT_VAT')).address,
      Number(row.priceWithoutVat || 0),
    );
    const quantity = Number(row.quantity || 0);
    const unitVat = quantity > 0 ? Number(row.vatAmount || 0) / quantity : 0;
    const unitTotal = quantity > 0 ? Number(row.totalWithVat || 0) / quantity : 0;
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('COST_WITHOUT_VAT')).address,
      formula(`${quantityCol}${rowNumber}*${priceCol}${rowNumber}`, row.subtotalWithoutVat),
    );
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('VAT_AMOUNT')).address,
      formula(`${quantityCol}${rowNumber}*${unitVat}`, row.vatAmount),
    );
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('TOTAL_WITH_VAT')).address,
      formula(`${quantityCol}${rowNumber}*${unitTotal}`, row.totalWithVat),
    );
  });
  mergeGroups(
    sheet,
    data.rows,
    positions.dataStart,
    (row) => JSON.stringify([row.fullName, row.personnelNumber]),
    [
      rowColumn.get('SEQUENCE_NUMBER'),
      rowColumn.get('EMPLOYEE_NAME'),
      rowColumn.get('PERSONNEL_NUMBER'),
    ],
  );

  set(
    sheet,
    header.get('TOTAL_VAT'),
    formula(
      `SUM(${vatCol}${positions.dataStart}:${vatCol}${positions.dataEnd})`,
      data.totals.vatAmount,
    ),
  );
  set(
    sheet,
    header.get('TOTAL_WITH_VAT'),
    formula(
      `SUM(${totalCol}${positions.dataStart}:${totalCol}${positions.dataEnd})`,
      data.totals.totalWithVat,
    ),
  );
  set(
    sheet,
    header.get('DPO_HEAD_TITLE'),
    `Начальник ${unitGenitive(data.dpo).replace(/\s+пассажирских\s+обустройств$/i, '')}`,
  );
  set(
    sheet,
    header.get('DPO_DIRECTOR_SIGNATURE'),
    `__________________/${initialsFirst(director)}/`,
  );
  sheet.pageSetup.printArea = `A1:K${sheet.getCell(header.get('DPO_DIRECTOR_SIGNATURE')).row}`;
}

export const appendix17ExcelMapper = {
  spec: appendix17MarkerSpec,
  fill: fillAppendix17,
};

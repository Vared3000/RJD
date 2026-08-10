import { fileURLToPath } from 'node:url';
import { set, formula, addSourceNote, mergeGroups } from '../shared/excel-template-engine.js';
import {
  formatQuotedDate,
  unitGenitive,
  initialsFirst,
  commonNarrative,
} from '../shared/ru-format.js';

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
    const employeeKey = JSON.stringify([row.fullName, row.personnelNumber]);
    if (employeeKey !== previousEmployee) number += 1;
    previousEmployee = employeeKey;
    set(sheet, `A${rowNumber}`, number);
    set(sheet, `B${rowNumber}`, row.fullName);
    set(sheet, `C${rowNumber}`, row.personnelNumber);
    set(sheet, `D${rowNumber}`, row.modelName);
    addSourceNote(sheet.getCell(`D${rowNumber}`), row);
    sheet.getCell(`E${rowNumber}`).value = row.inventoryNumber || null;
    set(sheet, `F${rowNumber}`, row.unit || 'шт.');
    set(sheet, `G${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `H${rowNumber}`, Number(row.priceWithoutVat || 0));
    const quantity = Number(row.quantity || 0);
    const unitVat = quantity > 0 ? Number(row.vatAmount || 0) / quantity : 0;
    const unitTotal = quantity > 0 ? Number(row.totalWithVat || 0) / quantity : 0;
    set(sheet, `I${rowNumber}`, formula(`G${rowNumber}*H${rowNumber}`, row.subtotalWithoutVat));
    set(sheet, `J${rowNumber}`, formula(`G${rowNumber}*${unitVat}`, row.vatAmount));
    set(sheet, `K${rowNumber}`, formula(`G${rowNumber}*${unitTotal}`, row.totalWithVat));
  });
  mergeGroups(
    sheet,
    data.rows,
    positions.dataStart,
    (row) => JSON.stringify([row.fullName, row.personnelNumber]),
    [1, 2, 3],
  );

  const total = positions.footerStart;
  set(
    sheet,
    `J${total}`,
    formula(`SUM(J${positions.dataStart}:J${positions.dataEnd})`, data.totals.vatAmount),
  );
  set(
    sheet,
    `K${total}`,
    formula(`SUM(K${positions.dataStart}:K${positions.dataEnd})`, data.totals.totalWithVat),
  );
  set(
    sheet,
    `B${total + 5}`,
    `Начальник ${unitGenitive(data.dpo).replace(/\s+пассажирских\s+обустройств$/i, '')}`,
  );
  set(sheet, `B${total + 8}`, `__________________/${initialsFirst(director)}/`);
  sheet.pageSetup.printArea = `A1:K${total + 8}`;
}

export const appendix17ExcelMapper = {
  templatePath: fileURLToPath(new URL('./appendix-1-7.template.xlsx', import.meta.url)),
  dataStart: 8,
  prototypeRows: 1,
  dataMerges: [],
  fill: fillAppendix17,
};

import { fileURLToPath } from 'node:url';
import { set } from '../shared/excel-template-engine.js';
import { formatDate, unitNominative } from '../shared/ru-format.js';

function fillPersonalCard(sheet, data, positions) {
  const employee = data.employee;
  const position = employee.position?.name || 'должность не указана';
  const personnel = employee.personnelNumber ? ` таб.№ ${employee.personnelNumber}` : '';
  const clothing = [data.clothingSize, data.heightSize].filter(Boolean).join('/');

  set(sheet, 'A3', `Дата открытия: ${formatDate(data.openedDate)}`);
  set(
    sheet,
    'A4',
    `Структурное подразделение Центральной дирекции пассажирских обустройств ${unitNominative(data.dpo)}`,
  );
  set(sheet, 'A5', `От Исполнителя: ${data.parties.executor.shortName}`);
  set(sheet, 'A6', `Работник Заказчика: ${employee.fullName}${personnel}   должность: ${position}`);
  set(sheet, 'A7', `Индивидуальные размеры одежды: ${clothing}`);
  set(sheet, 'E7', `Индивидуальные размеры перчатки: ${data.glovesSize || ''}`);
  set(sheet, 'K7', 'приём/заявка');
  set(
    sheet,
    'L7',
    employee.hireDate || data.openedDate ? formatDate(employee.hireDate || data.openedDate) : null,
  );
  set(sheet, 'A8', `Индивидуальные размеры головного убора: ${data.headwearSize || ''}`);
  set(sheet, 'E8', `Индивидуальные размеры ремень: ${data.beltSize || ''}`);
  set(sheet, 'K8', 'увольнение');
  sheet.getCell('L8').value = employee.terminationDate
    ? formatDate(employee.terminationDate)
    : null;

  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    set(sheet, `A${rowNumber}`, index + 1);
    set(sheet, `B${rowNumber}`, row.modelName);
    set(sheet, `C${rowNumber}`, row.unit || 'шт.');
    set(sheet, `D${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `E${rowNumber}`, Number(row.normQuantity || 0));
    set(sheet, `F${rowNumber}`, row.serviceLifeYears == null ? null : Number(row.serviceLifeYears));
    if (row.serviceLifeWarning) sheet.getCell(`F${rowNumber}`).note = row.serviceLifeWarning;
    sheet.getCell(`G${rowNumber}`).value =
      row.issuedQuantity == null ? null : Number(row.issuedQuantity);
    sheet.getCell(`H${rowNumber}`).value = row.issuedDate ? formatDate(row.issuedDate) : null;
    sheet.getCell(`J${rowNumber}`).value =
      row.returnedQuantity == null ? null : Number(row.returnedQuantity);
    sheet.getCell(`K${rowNumber}`).value = row.returnedDate ? formatDate(row.returnedDate) : null;
  });

  sheet.pageSetup.printArea = `A1:L${positions.footerStart + 6}`;
}

export const personalCardExcelMapper = {
  templatePath: fileURLToPath(new URL('./personal-card.template.xlsx', import.meta.url)),
  dataStart: 13,
  prototypeRows: 12,
  dataMerges: [],
  fill: fillPersonalCard,
};

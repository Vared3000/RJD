import { set } from '../shared/excel-template-engine.js';
import { formatDate, unitNominative } from '../shared/ru-format.js';

export const personalCardMarkerSpec = {
  header: [
    'OPENED_DATE',
    'DPO_LINE',
    'EXECUTOR_LINE',
    'EMPLOYEE_LINE',
    'CLOTHING_SIZE_LINE',
    'GLOVES_SIZE_LINE',
    'HIRE_DATE',
    'HEADWEAR_SIZE_LINE',
    'BELT_SIZE_LINE',
    'TERMINATION_DATE',
  ],
  row: [
    'SEQUENCE_NUMBER',
    'MODEL_NAME',
    'UNIT',
    'QUANTITY',
    'NORM_QUANTITY',
    'SERVICE_LIFE_YEARS',
    'ISSUED_QUANTITY',
    'ISSUED_DATE',
    'RETURNED_QUANTITY',
    'RETURNED_DATE',
  ],
};

function fillPersonalCard(sheet, data, positions, markers) {
  const employee = data.employee;
  const position = employee.position?.name || 'должность не указана';
  const personnel = employee.personnelNumber ? ` таб.№ ${employee.personnelNumber}` : '';
  const clothing = [data.clothingSize, data.heightSize].filter(Boolean).join('/');
  const header = markers.header;
  const rowColumn = markers.row;

  set(sheet, header.get('OPENED_DATE'), `Дата открытия: ${formatDate(data.openedDate)}`);
  set(
    sheet,
    header.get('DPO_LINE'),
    `Структурное подразделение Центральной дирекции пассажирских обустройств ${unitNominative(data.dpo)}`,
  );
  set(sheet, header.get('EXECUTOR_LINE'), `От Исполнителя: ${data.parties.executor.shortName}`);
  set(
    sheet,
    header.get('EMPLOYEE_LINE'),
    `Работник Заказчика: ${employee.fullName}${personnel}   должность: ${position}`,
  );
  set(sheet, header.get('CLOTHING_SIZE_LINE'), `Индивидуальные размеры одежды: ${clothing}`);
  set(
    sheet,
    header.get('GLOVES_SIZE_LINE'),
    `Индивидуальные размеры перчатки: ${data.glovesSize || ''}`,
  );
  set(
    sheet,
    header.get('HIRE_DATE'),
    employee.hireDate || data.openedDate ? formatDate(employee.hireDate || data.openedDate) : null,
  );
  set(
    sheet,
    header.get('HEADWEAR_SIZE_LINE'),
    `Индивидуальные размеры головного убора: ${data.headwearSize || ''}`,
  );
  set(sheet, header.get('BELT_SIZE_LINE'), `Индивидуальные размеры ремень: ${data.beltSize || ''}`);
  set(
    sheet,
    header.get('TERMINATION_DATE'),
    employee.terminationDate ? formatDate(employee.terminationDate) : null,
  );

  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('SEQUENCE_NUMBER')).address, index + 1);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('MODEL_NAME')).address, row.modelName);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('UNIT')).address, row.unit || 'шт.');
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('QUANTITY')).address,
      Number(row.quantity || 0),
    );
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('NORM_QUANTITY')).address,
      Number(row.normQuantity || 0),
    );
    const serviceLifeCell = sheet.getCell(rowNumber, rowColumn.get('SERVICE_LIFE_YEARS'));
    serviceLifeCell.value = row.serviceLifeYears == null ? null : Number(row.serviceLifeYears);
    if (row.serviceLifeWarning) serviceLifeCell.note = row.serviceLifeWarning;
    sheet.getCell(rowNumber, rowColumn.get('ISSUED_QUANTITY')).value =
      row.issuedQuantity == null ? null : Number(row.issuedQuantity);
    sheet.getCell(rowNumber, rowColumn.get('ISSUED_DATE')).value = row.issuedDate
      ? formatDate(row.issuedDate)
      : null;
    sheet.getCell(rowNumber, rowColumn.get('RETURNED_QUANTITY')).value =
      row.returnedQuantity == null ? null : Number(row.returnedQuantity);
    sheet.getCell(rowNumber, rowColumn.get('RETURNED_DATE')).value = row.returnedDate
      ? formatDate(row.returnedDate)
      : null;
  });

  sheet.pageSetup.printArea = `A1:L${positions.footerStart + 6}`;
}

export const personalCardExcelMapper = {
  spec: personalCardMarkerSpec,
  fill: fillPersonalCard,
};

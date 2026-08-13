import { set, addSourceNote, mergeGroups } from '../shared/excel-template-engine.js';
import { formatQuotedDate } from '../shared/ru-format.js';

export const preservationReceiptMarkerSpec = {
  header: ['DPO_FULL_NAME', 'DPO_NAME', 'RECEIPT_DATE'],
  row: [
    'SEQUENCE_NUMBER',
    'EMPLOYEE_NAME',
    'PERSONNEL_NUMBER',
    'MODEL_NAME',
    'UNIT',
    'QUANTITY',
    'SIGNATURE',
  ],
};

function fillPreservationReceipt(sheet, data, positions, markers) {
  const header = markers.header;
  const rowColumn = markers.row;
  set(sheet, header.get('DPO_FULL_NAME'), data.dpo.fullName || data.dpo.name);
  set(sheet, header.get('DPO_NAME'), data.dpo.name);
  set(sheet, header.get('RECEIPT_DATE'), formatQuotedDate(data.to));

  let sequence = 0;
  let previousEmployeeId = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    if (row.employeeId !== previousEmployeeId) sequence += 1;
    previousEmployeeId = row.employeeId;

    set(sheet, sheet.getCell(rowNumber, rowColumn.get('SEQUENCE_NUMBER')).address, sequence);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('EMPLOYEE_NAME')).address, row.employeeName);
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('PERSONNEL_NUMBER')).address,
      row.personnelNumber,
    );
    const modelCell = sheet.getCell(rowNumber, rowColumn.get('MODEL_NAME'));
    modelCell.value = row.modelName;
    addSourceNote(modelCell, row);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('UNIT')).address, row.unit || 'шт.');
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('QUANTITY')).address, row.quantity);
    sheet.getCell(rowNumber, rowColumn.get('SIGNATURE')).value = null;
  });

  mergeGroups(sheet, data.rows, positions.dataStart, (row) => row.employeeId, [
    rowColumn.get('SEQUENCE_NUMBER'),
    rowColumn.get('EMPLOYEE_NAME'),
    rowColumn.get('PERSONNEL_NUMBER'),
    rowColumn.get('SIGNATURE'),
  ]);

  const dataEnd = Math.max(positions.dataStart, positions.dataEnd);
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: '6:6',
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.45, header: 0, footer: 0.2 },
    printArea: `A1:G${dataEnd}`,
  };
}

export const preservationReceiptExcelMapper = {
  spec: preservationReceiptMarkerSpec,
  fill: fillPreservationReceipt,
};

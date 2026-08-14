import { set, addSourceNote, mergeGroups } from '../shared/excel-template-engine.js';
import { formatQuotedDate } from '../shared/ru-format.js';

const MEDIUM_BORDER = { style: 'medium', color: { indexed: 64 } };
const THIN_BORDER = { style: 'thin', color: { indexed: 64 } };

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
  const exactCustomerTemplate = sheet.getCell(header.get('DPO_FULL_NAME')).row === 1;
  const dpoFullName = data.dpo.fullName || data.dpo.name;
  set(
    sheet,
    header.get('DPO_FULL_NAME'),
    exactCustomerTemplate
      ? `Сохранная расписка\nпередачи комплекта форменной одежды\n${dpoFullName}\n${data.dpo.name}`
      : dpoFullName,
  );
  if (exactCustomerTemplate) {
    sheet.getCell(header.get('DPO_NAME')).value = null;
    sheet.getCell('D2').value = null;
  } else {
    set(sheet, header.get('DPO_NAME'), data.dpo.name);
  }
  set(sheet, header.get('RECEIPT_DATE'), formatQuotedDate(data.to));

  let sequence = 0;
  let previousEmployeeId = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    if (row.employeeId !== previousEmployeeId) sequence += 1;
    previousEmployeeId = row.employeeId;

    set(sheet, sheet.getCell(rowNumber, rowColumn.get('SEQUENCE_NUMBER')).address, sequence);
    const employeeName = exactCustomerTemplate
      ? String(row.employeeName).replace(/^([^\s]+)\s+/, '$1\n')
      : row.employeeName;
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('EMPLOYEE_NAME')).address, employeeName);
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('PERSONNEL_NUMBER')).address,
      row.personnelNumber,
    );
    const modelCell = sheet.getCell(rowNumber, rowColumn.get('MODEL_NAME'));
    modelCell.value = row.modelName;
    addSourceNote(modelCell, row);
    const unit = exactCustomerTemplate
      ? String(row.unit || 'шт').replace(/\.$/, '')
      : row.unit || 'шт.';
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('UNIT')).address, unit);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('QUANTITY')).address, row.quantity);
    sheet.getCell(rowNumber, rowColumn.get('SIGNATURE')).value = null;

    if (exactCustomerTemplate) {
      const isGroupStart = index === 0 || data.rows[index - 1].employeeId !== row.employeeId;
      const isLastRow = index === data.rows.length - 1;
      sheet.getRow(rowNumber).height = String(row.modelName).length > 40 ? 46.5 : 25.5;
      for (let column = 1; column <= 7; column += 1) {
        const cell = sheet.getCell(rowNumber, column);
        cell.border = {
          ...cell.border,
          left: column === 1 ? MEDIUM_BORDER : THIN_BORDER,
          right: column === 7 ? MEDIUM_BORDER : THIN_BORDER,
          top: isGroupStart ? MEDIUM_BORDER : THIN_BORDER,
          bottom: isLastRow ? MEDIUM_BORDER : THIN_BORDER,
        };
      }
    }
  });

  const groupedColumns = [
    rowColumn.get('SEQUENCE_NUMBER'),
    rowColumn.get('EMPLOYEE_NAME'),
    rowColumn.get('PERSONNEL_NUMBER'),
  ];
  if (!exactCustomerTemplate) groupedColumns.push(rowColumn.get('SIGNATURE'));
  mergeGroups(sheet, data.rows, positions.dataStart, (row) => row.employeeId, groupedColumns);

  if (exactCustomerTemplate) {
    let groupStart = 0;
    while (groupStart < data.rows.length) {
      let groupEnd = groupStart;
      while (
        groupEnd + 1 < data.rows.length &&
        data.rows[groupEnd + 1].employeeId === data.rows[groupStart].employeeId
      ) {
        groupEnd += 1;
      }
      for (const column of [1, 2, 3]) {
        const cell = sheet.getCell(positions.dataStart + groupStart, column);
        cell.border = {
          ...cell.border,
          left: column === 1 ? MEDIUM_BORDER : THIN_BORDER,
          right: column === 7 ? MEDIUM_BORDER : THIN_BORDER,
          top: MEDIUM_BORDER,
          bottom: groupEnd === data.rows.length - 1 ? MEDIUM_BORDER : THIN_BORDER,
        };
      }
      groupStart = groupEnd + 1;
    }
  }

  const dataEnd = Math.max(positions.dataStart, positions.dataEnd);
  if (exactCustomerTemplate) {
    if (sheet.rowCount > dataEnd) {
      sheet.spliceRows(dataEnd + 1, sheet.rowCount - dataEnd);
    }
    sheet.name = String(data.dpo.name || 'Сохранная расписка')
      .replace(/[:*?[\]\\/]/g, ' ')
      .slice(0, 31);
    sheet.views = [
      {
        state: 'normal',
        style: 'pageLayout',
        showGridLines: true,
        zoomScale: 75,
        zoomScaleNormal: 100,
        activeCell: 'F3',
      },
    ];
    sheet.pageSetup = {
      ...sheet.pageSetup,
      fitToPage: false,
      orientation: 'portrait',
      paperSize: 9,
      pageOrder: 'downThenOver',
      blackAndWhite: false,
      draft: false,
      cellComments: 'None',
      errors: 'displayed',
      scale: 60,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.31496062992125984,
        right: 0.11811023622047245,
        top: 0.5511811023622047,
        bottom: 0.15748031496062992,
        header: 0.31496062992125984,
        footer: 0.31496062992125984,
      },
      printArea: `A1:G${dataEnd}`,
    };
  } else {
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
}

export const preservationReceiptExcelMapper = {
  spec: preservationReceiptMarkerSpec,
  fill: fillPreservationReceipt,
  singleWorksheet: true,
  preserveTemplateView: true,
  visibleGeneratedFooter: false,
};

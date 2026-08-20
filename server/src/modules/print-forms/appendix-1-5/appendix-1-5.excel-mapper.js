import { set, formula, addSourceNote, mergeGroups } from '../shared/excel-template-engine.js';
import {
  formatQuotedDate,
  periodTitle,
  periodPrepositional,
  unitNominative,
  unitGenitive,
  amountInWords,
  initialsFirst,
  commonNarrative,
} from '../shared/ru-format.js';

export const appendix15MarkerSpec = {
  header: [
    'ACT_TITLE',
    'ACT_DATE',
    'ACT_NARRATIVE',
    'TOTAL_VAT',
    'TOTAL_WITH_VAT',
    'AMOUNT_IN_WORDS',
    'CUSTOMER_SIGNATURE',
  ],
  row: [
    'SEQUENCE_NUMBER',
    'POSITION_NAME',
    'MODEL_NAME',
    'UNIT',
    'QUANTITY',
    'COVERAGE_DAYS',
    'PRICE_WITHOUT_VAT',
    'COST_WITHOUT_VAT',
    'TOTAL_WITHOUT_VAT',
    'VAT_AMOUNT',
    'TOTAL_WITH_VAT',
  ],
};

function columnLetter(sheet, column, row) {
  return sheet.getCell(row, column).address.replace(/\d+$/, '');
}

function fillAppendix15(sheet, data, positions, markers) {
  const director = data.dpo.directorFullName || '';
  const header = markers.header;
  const rowColumn = markers.row;
  sheet.getColumn(rowColumn.get('PRICE_WITHOUT_VAT')).hidden = false;

  set(
    sheet,
    header.get('ACT_TITLE'),
    `по оказанию комплекса услуг по обеспечению форменной одеждой работников ${unitNominative(
      data.dpo,
    )} - структурного подразделения Центральной дирекции пассажирских обустройств - филиала ОАО «РЖД» за ${periodTitle(
      data.from,
      data.to,
    )}`,
  );
  set(sheet, header.get('ACT_DATE'), formatQuotedDate(data.to));
  set(
    sheet,
    header.get('ACT_NARRATIVE'),
    `${commonNarrative(data, 'составили и подписали настоящий акт по обеспечению форменной одеждой')}\n` +
      `1. В соответствии с настоящим актом Исполнитель ${periodPrepositional(
        data.from,
        data.to,
      )} обеспечил работников Заказчика, согласно должностям следующими изделиями форменной одежды:\n\n`,
  );

  const quantityCol = columnLetter(sheet, rowColumn.get('QUANTITY'), positions.dataStart);
  const priceCol = columnLetter(sheet, rowColumn.get('PRICE_WITHOUT_VAT'), positions.dataStart);
  const costCol = columnLetter(sheet, rowColumn.get('COST_WITHOUT_VAT'), positions.dataStart);
  const totalWithoutVatCol = columnLetter(
    sheet,
    rowColumn.get('TOTAL_WITHOUT_VAT'),
    positions.dataStart,
  );
  const vatCol = columnLetter(sheet, rowColumn.get('VAT_AMOUNT'), positions.dataStart);
  const totalCol = columnLetter(sheet, rowColumn.get('TOTAL_WITH_VAT'), positions.dataStart);

  let number = 0;
  let previousPosition = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    if (row.positionName !== previousPosition) number += 1;
    previousPosition = row.positionName;
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('SEQUENCE_NUMBER')).address, number);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('POSITION_NAME')).address, row.positionName);
    const modelCell = sheet.getCell(rowNumber, rowColumn.get('MODEL_NAME'));
    modelCell.value = row.modelName;
    addSourceNote(modelCell, row);
    set(sheet, sheet.getCell(rowNumber, rowColumn.get('UNIT')).address, row.unit || 'шт.');
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('QUANTITY')).address,
      Number(row.quantity || 0),
    );
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('COVERAGE_DAYS')).address,
      Number(row.coverageDays || 0),
    );
    set(
      sheet,
      sheet.getCell(rowNumber, rowColumn.get('PRICE_WITHOUT_VAT')).address,
      Number(row.priceWithoutVat || 0),
    );

    const costAddress = sheet.getCell(rowNumber, rowColumn.get('COST_WITHOUT_VAT')).address;
    const totalWithoutVatAddress = sheet.getCell(
      rowNumber,
      rowColumn.get('TOTAL_WITHOUT_VAT'),
    ).address;
    const vatAddress = sheet.getCell(rowNumber, rowColumn.get('VAT_AMOUNT')).address;
    const totalAddress = sheet.getCell(rowNumber, rowColumn.get('TOTAL_WITH_VAT')).address;
    if (row.sourceValues) {
      set(
        sheet,
        costAddress,
        row.sourceFormulas?.costWithoutVat
          ? formula(row.sourceFormulas.costWithoutVat, row.costWithoutVat)
          : Number(row.costWithoutVat || 0),
      );
      set(
        sheet,
        totalWithoutVatAddress,
        row.sourceFormulas?.totalWithoutVat
          ? formula(row.sourceFormulas.totalWithoutVat, row.priceWithVat)
          : Number(row.priceWithVat || 0),
      );
      set(
        sheet,
        vatAddress,
        row.sourceFormulas?.vatAmount
          ? formula(row.sourceFormulas.vatAmount, row.vatAmount)
          : Number(row.vatAmount || 0),
      );
      set(
        sheet,
        totalAddress,
        row.sourceFormulas?.totalWithVat
          ? formula(row.sourceFormulas.totalWithVat, row.totalWithVat)
          : Number(row.totalWithVat || 0),
      );
    } else {
      set(
        sheet,
        costAddress,
        formula(`${quantityCol}${rowNumber}*${priceCol}${rowNumber}`, row.costWithoutVat),
      );
      set(sheet, totalWithoutVatAddress, Number(row.priceWithVat || 0));
      set(
        sheet,
        vatAddress,
        formula(`${totalCol}${rowNumber}-${costCol}${rowNumber}`, row.vatAmount),
      );
      set(
        sheet,
        totalAddress,
        formula(`${quantityCol}${rowNumber}*${totalWithoutVatCol}${rowNumber}`, row.totalWithVat),
      );
    }
  });
  mergeGroups(sheet, data.rows, positions.dataStart, (row) => row.positionName, [
    rowColumn.get('SEQUENCE_NUMBER'),
    rowColumn.get('POSITION_NAME'),
  ]);

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
    header.get('AMOUNT_IN_WORDS'),
    `Сумма (итого) ${amountInWords(data.totals.totalWithVat)}.`,
  );
  set(
    sheet,
    header.get('CUSTOMER_SIGNATURE'),
    `Начальник ${unitGenitive(data.dpo)}\n\n________________________ /${initialsFirst(director)}/`,
  );
  sheet.pageSetup.printArea = `A1:L${sheet.getCell(header.get('CUSTOMER_SIGNATURE')).row}`;
}

export const appendix15ExcelMapper = {
  spec: appendix15MarkerSpec,
  fill: fillAppendix15,
};

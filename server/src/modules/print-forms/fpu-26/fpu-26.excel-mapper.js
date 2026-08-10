import { set, formula, addSourceNote } from '../shared/excel-template-engine.js';
import {
  formatDate,
  periodDescription,
  contractLine,
  dpoWithAddress,
  partyWithAddress,
  unitGenitive,
  surnameInitials,
} from '../shared/ru-format.js';

// Обязательные маркеры формы (задача 19): динамические значения — через
// {{ИМЯ}} в шапке/подвале и {{ROW.ИМЯ}} в строке-прототипе, между
// {{TABLE_START}} и {{TABLE_END}}. Статический юридический текст акта
// (составительная формулировка периода и т.п.) в маркеры не выносится —
// он остаётся обычным текстом в шаблоне, администратор правит его прямо в
// Excel без участия кода.
export const fpu26MarkerSpec = {
  header: [
    'CUSTOMER_NAME',
    'DPO_NAME',
    'EXECUTOR_NAME',
    'EXECUTOR_ADDRESS',
    'CUSTOMER_OKPO',
    'BUSINESS_UNIT_CODE',
    'EXECUTOR_OKPO',
    'PERIOD_END',
    'CONTRACT_LINE',
    'EXECUTOR_SIGNATORY',
    'EXECUTOR_BASIS',
    'DPO_HEAD_TITLE',
    'DPO_DIRECTOR_NAME',
    'DPO_DIRECTOR_BASIS',
    'PERIOD_DESCRIPTION',
    'GRAND_TOTAL_COST',
    'GRAND_TOTAL_VAT',
    'GRAND_TOTAL',
    'GRAND_TOTAL_COST_REPEAT',
    'GRAND_TOTAL_VAT_REPEAT',
    'GRAND_TOTAL_REPEAT',
    'SIGNATURE_CONTRACT_LINE',
    'DPO_HEAD_SIGNATURE_LABEL',
    'DPO_DIRECTOR_SIGNATURE',
  ],
  row: [
    'MODEL_NAME',
    'UNIT',
    'QUANTITY',
    'PRICE_WITHOUT_VAT',
    'DISPLAYED_PRICE_WITHOUT_VAT',
    'COST_WITHOUT_VAT',
    'VAT_AMOUNT',
    'TOTAL_WITH_VAT',
  ],
};

function columnLetter(sheet, column, row) {
  return sheet.getCell(row, column).address.replace(/\d+$/, '');
}

function fillFpu26(sheet, data, positions, markers) {
  const director = data.dpo.directorFullName || '';
  const executor = data.parties.executor;
  const customer = data.parties.customer;
  const header = markers.header;
  const rowColumn = markers.row;

  sheet.getColumn(rowColumn.get('PRICE_WITHOUT_VAT')).hidden = false;
  set(
    sheet,
    header.get('CUSTOMER_NAME'),
    partyWithAddress(customer).replaceAll('«', '"').replaceAll('»', '"'),
  );
  set(sheet, header.get('DPO_NAME'), dpoWithAddress(data.dpo));
  set(
    sheet,
    header.get('EXECUTOR_NAME'),
    executor.fullName.replaceAll('«', '"').replaceAll('»', '"'),
  );
  set(sheet, header.get('EXECUTOR_ADDRESS'), executor.address);
  set(sheet, header.get('CUSTOMER_OKPO'), customer.okpo);
  set(sheet, header.get('BUSINESS_UNIT_CODE'), data.dpo.businessUnitCode || '-');
  set(sheet, header.get('EXECUTOR_OKPO'), executor.okpo);
  set(sheet, header.get('PERIOD_END'), formatDate(data.to));
  set(sheet, header.get('CONTRACT_LINE'), contractLine(data.dpo));
  set(
    sheet,
    header.get('EXECUTOR_SIGNATORY'),
    `${executor.directorPosition}  ${executor.shortName.replaceAll('«', '"').replaceAll('»', '"')} ${executor.directorFullName}`,
  );
  set(sheet, header.get('EXECUTOR_BASIS'), executor.directorBasis);
  set(sheet, header.get('DPO_HEAD_TITLE'), `начальник ${unitGenitive(data.dpo)}`);
  set(sheet, header.get('DPO_DIRECTOR_NAME'), director);
  set(sheet, header.get('DPO_DIRECTOR_BASIS'), data.dpo.directorBasis || '');
  set(sheet, header.get('PERIOD_DESCRIPTION'), periodDescription(data.from, data.to));

  const priceCol = columnLetter(sheet, rowColumn.get('PRICE_WITHOUT_VAT'), positions.dataStart);
  const quantityCol = columnLetter(sheet, rowColumn.get('QUANTITY'), positions.dataStart);
  const displayedPriceCol = columnLetter(
    sheet,
    rowColumn.get('DISPLAYED_PRICE_WITHOUT_VAT'),
    positions.dataStart,
  );
  const costCol = columnLetter(sheet, rowColumn.get('COST_WITHOUT_VAT'), positions.dataStart);
  const vatCol = columnLetter(sheet, rowColumn.get('VAT_AMOUNT'), positions.dataStart);
  const totalCol = columnLetter(sheet, rowColumn.get('TOTAL_WITH_VAT'), positions.dataStart);

  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    const modelNameCell = sheet.getCell(rowNumber, rowColumn.get('MODEL_NAME'));
    modelNameCell.value = row.modelName ?? '';
    addSourceNote(modelNameCell, row);
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
    const displayedPriceAddress = sheet.getCell(
      rowNumber,
      rowColumn.get('DISPLAYED_PRICE_WITHOUT_VAT'),
    ).address;
    const costAddress = sheet.getCell(rowNumber, rowColumn.get('COST_WITHOUT_VAT')).address;
    const vatAddress = sheet.getCell(rowNumber, rowColumn.get('VAT_AMOUNT')).address;
    const totalAddress = sheet.getCell(rowNumber, rowColumn.get('TOTAL_WITH_VAT')).address;
    if (row.sourceValues) {
      set(
        sheet,
        displayedPriceAddress,
        row.sourceFormulas?.displayedPriceWithoutVat
          ? formula(row.sourceFormulas.displayedPriceWithoutVat, row.displayedPriceWithoutVat)
          : Number(row.displayedPriceWithoutVat || 0),
      );
      set(
        sheet,
        costAddress,
        row.sourceFormulas?.costWithoutVat
          ? formula(row.sourceFormulas.costWithoutVat, row.costWithoutVat)
          : Number(row.costWithoutVat || 0),
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
      set(sheet, displayedPriceAddress, formula(`${priceCol}${rowNumber}`, row.priceWithoutVat));
      set(
        sheet,
        costAddress,
        formula(`${quantityCol}${rowNumber}*${displayedPriceCol}${rowNumber}`, row.costWithoutVat),
      );
      set(
        sheet,
        vatAddress,
        formula(`${costCol}${rowNumber}*${row.vatRate || 0}/100`, row.vatAmount),
      );
      set(
        sheet,
        totalAddress,
        formula(`${costCol}${rowNumber}+${vatCol}${rowNumber}`, row.totalWithVat),
      );
    }
  });

  set(
    sheet,
    header.get('GRAND_TOTAL_COST'),
    formula(
      `SUM(${costCol}${positions.dataStart}:${costCol}${positions.dataEnd})`,
      data.totals.costWithoutVat,
    ),
  );
  set(
    sheet,
    header.get('GRAND_TOTAL_VAT'),
    formula(
      `SUM(${vatCol}${positions.dataStart}:${vatCol}${positions.dataEnd})`,
      data.totals.vatAmount,
    ),
  );
  set(
    sheet,
    header.get('GRAND_TOTAL'),
    formula(
      `SUM(${totalCol}${positions.dataStart}:${totalCol}${positions.dataEnd})`,
      data.totals.totalWithVat,
    ),
  );
  const grandTotalCostAddress = header.get('GRAND_TOTAL_COST');
  const grandTotalVatAddress = header.get('GRAND_TOTAL_VAT');
  const grandTotalAddress = header.get('GRAND_TOTAL');
  set(
    sheet,
    header.get('GRAND_TOTAL_COST_REPEAT'),
    formula(grandTotalCostAddress, data.totals.costWithoutVat),
  );
  set(
    sheet,
    header.get('GRAND_TOTAL_VAT_REPEAT'),
    formula(grandTotalVatAddress, data.totals.vatAmount),
  );
  set(
    sheet,
    header.get('GRAND_TOTAL_REPEAT'),
    formula(grandTotalAddress, data.totals.totalWithVat),
  );
  set(sheet, header.get('SIGNATURE_CONTRACT_LINE'), contractLine(data.dpo).replace(/^по /, ''));
  set(sheet, header.get('DPO_HEAD_SIGNATURE_LABEL'), `Начальник ${unitGenitive(data.dpo)}`);
  set(sheet, header.get('DPO_DIRECTOR_SIGNATURE'), surnameInitials(director));

  const printAreaLastRow = sheet.getCell(header.get('DPO_DIRECTOR_SIGNATURE')).row + 4;
  sheet.pageSetup.printArea = `A1:L${printAreaLastRow}`;
}

export const fpu26ExcelMapper = {
  spec: fpu26MarkerSpec,
  fill: fillFpu26,
};

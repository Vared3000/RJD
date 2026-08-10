import { fileURLToPath } from 'node:url';
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

function fillFpu26(sheet, data, positions) {
  const director = data.dpo.directorFullName || '';
  const executor = data.parties.executor;
  const customer = data.parties.customer;
  sheet.getColumn(7).hidden = false;
  set(sheet, 'B7', partyWithAddress(customer).replaceAll('«', '"').replaceAll('»', '"'));
  set(sheet, 'A9', dpoWithAddress(data.dpo));
  set(sheet, 'B11', executor.fullName.replaceAll('«', '"').replaceAll('»', '"'));
  set(sheet, 'A13', executor.address);
  set(sheet, 'L6', customer.okpo);
  set(sheet, 'L8', data.dpo.businessUnitCode || '-');
  set(sheet, 'L10', executor.okpo);
  set(sheet, 'L12', '-');
  set(sheet, 'H16', formatDate(data.to));
  set(sheet, 'A19', contractLine(data.dpo));
  set(
    sheet,
    'A24',
    `${executor.directorPosition}  ${executor.shortName.replaceAll('«', '"').replaceAll('»', '"')} ${executor.directorFullName}`,
  );
  set(sheet, 'C26', executor.directorBasis);
  set(sheet, 'C28', `начальник ${unitGenitive(data.dpo)}`);
  set(sheet, 'A29', director);
  set(sheet, 'C31', data.dpo.directorBasis || '');
  set(
    sheet,
    'A34',
    'составили настоящий акт о том, что работы (услуги), выполненные ИСПОЛНИТЕЛЕМ по обеспечению форменной одеждой',
  );
  set(sheet, 'A35', 'работников структурных подразделений ЦДПО - филиала ОАО "РЖД"');
  set(sheet, 'A38', periodDescription(data.from, data.to));

  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    set(sheet, `A${rowNumber}`, row.modelName);
    addSourceNote(sheet.getCell(`A${rowNumber}`), row);
    set(sheet, `E${rowNumber}`, row.unit || 'шт.');
    set(sheet, `F${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `G${rowNumber}`, Number(row.priceWithoutVat || 0));
    if (row.sourceValues) {
      set(
        sheet,
        `H${rowNumber}`,
        row.sourceFormulas?.displayedPriceWithoutVat
          ? formula(row.sourceFormulas.displayedPriceWithoutVat, row.displayedPriceWithoutVat)
          : Number(row.displayedPriceWithoutVat || 0),
      );
      set(
        sheet,
        `I${rowNumber}`,
        row.sourceFormulas?.costWithoutVat
          ? formula(row.sourceFormulas.costWithoutVat, row.costWithoutVat)
          : Number(row.costWithoutVat || 0),
      );
      set(
        sheet,
        `K${rowNumber}`,
        row.sourceFormulas?.vatAmount
          ? formula(row.sourceFormulas.vatAmount, row.vatAmount)
          : Number(row.vatAmount || 0),
      );
      set(
        sheet,
        `L${rowNumber}`,
        row.sourceFormulas?.totalWithVat
          ? formula(row.sourceFormulas.totalWithVat, row.totalWithVat)
          : Number(row.totalWithVat || 0),
      );
    } else {
      set(sheet, `H${rowNumber}`, formula(`G${rowNumber}`, row.priceWithoutVat));
      set(sheet, `I${rowNumber}`, formula(`F${rowNumber}*H${rowNumber}`, row.costWithoutVat));
      set(sheet, `K${rowNumber}`, formula(`I${rowNumber}*${row.vatRate || 0}/100`, row.vatAmount));
      set(sheet, `L${rowNumber}`, formula(`I${rowNumber}+K${rowNumber}`, row.totalWithVat));
    }
  });

  const total = positions.footerStart;
  set(
    sheet,
    `I${total}`,
    formula(`SUM(I${positions.dataStart}:I${positions.dataEnd})`, data.totals.costWithoutVat),
  );
  set(
    sheet,
    `K${total}`,
    formula(`SUM(K${positions.dataStart}:K${positions.dataEnd})`, data.totals.vatAmount),
  );
  set(
    sheet,
    `L${total}`,
    formula(`SUM(L${positions.dataStart}:L${positions.dataEnd})`, data.totals.totalWithVat),
  );
  set(sheet, `I${total + 2}`, formula(`I${total}`, data.totals.costWithoutVat));
  set(sheet, `K${total + 2}`, formula(`K${total}`, data.totals.vatAmount));
  set(sheet, `L${total + 2}`, formula(`L${total}`, data.totals.totalWithVat));
  set(sheet, `B${total + 25}`, contractLine(data.dpo).replace(/^по /, ''));
  set(sheet, `F${total + 32}`, `Начальник ${unitGenitive(data.dpo)}`);
  set(sheet, `K${total + 34}`, surnameInitials(director));
  sheet.pageSetup.printArea = `A1:L${total + 38}`;
}

export const fpu26ExcelMapper = {
  templatePath: fileURLToPath(new URL('./fpu-26.template.xlsx', import.meta.url)),
  dataStart: 42,
  prototypeRows: 1,
  dataMerges: [
    [1, 4],
    [9, 10],
  ],
  fill: fillFpu26,
};

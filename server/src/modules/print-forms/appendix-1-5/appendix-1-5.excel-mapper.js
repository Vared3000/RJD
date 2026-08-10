import { fileURLToPath } from 'node:url';
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

function fillAppendix15(sheet, data, positions) {
  const director = data.dpo.directorFullName || '';
  sheet.getColumn(7).hidden = false;
  set(sheet, 'B1', 'АКТ');
  set(
    sheet,
    'A2',
    `по оказанию комплекса услуг по обеспечению форменной одеждой работников ${unitNominative(
      data.dpo,
    )} - структурного подразделения Центральной дирекции пассажирских обустройств - филиала ОАО «РЖД» за ${periodTitle(
      data.from,
      data.to,
    )}`,
  );
  set(sheet, 'F3', formatQuotedDate(data.to));
  set(
    sheet,
    'A4',
    `${commonNarrative(data, 'составили и подписали настоящий акт по обеспечению форменной одеждой')}\n` +
      `1. В соответствии с настоящим актом Исполнитель ${periodPrepositional(
        data.from,
        data.to,
      )} обеспечил работников Заказчика, согласно должностям следующими изделиями форменной одежды:\n\n`,
  );

  let number = 0;
  let previousPosition = null;
  data.rows.forEach((row, index) => {
    const rowNumber = positions.dataStart + index;
    if (row.positionName !== previousPosition) number += 1;
    previousPosition = row.positionName;
    set(sheet, `A${rowNumber}`, number);
    set(sheet, `B${rowNumber}`, row.positionName);
    set(sheet, `C${rowNumber}`, row.modelName);
    addSourceNote(sheet.getCell(`C${rowNumber}`), row);
    set(sheet, `D${rowNumber}`, row.unit || 'шт.');
    set(sheet, `E${rowNumber}`, Number(row.quantity || 0));
    set(sheet, `F${rowNumber}`, Number(row.coverageDays || 0));
    set(sheet, `G${rowNumber}`, Number(row.priceWithoutVat || 0));
    if (row.sourceValues) {
      set(
        sheet,
        `H${rowNumber}`,
        row.sourceFormulas?.costWithoutVat
          ? formula(row.sourceFormulas.costWithoutVat, row.costWithoutVat)
          : Number(row.costWithoutVat || 0),
      );
      set(
        sheet,
        `I${rowNumber}`,
        row.sourceFormulas?.totalWithoutVat
          ? formula(row.sourceFormulas.totalWithoutVat, row.priceWithVat)
          : Number(row.priceWithVat || 0),
      );
      set(
        sheet,
        `J${rowNumber}`,
        row.sourceFormulas?.vatAmount
          ? formula(row.sourceFormulas.vatAmount, row.vatAmount)
          : Number(row.vatAmount || 0),
      );
      set(
        sheet,
        `K${rowNumber}`,
        row.sourceFormulas?.totalWithVat
          ? formula(row.sourceFormulas.totalWithVat, row.totalWithVat)
          : Number(row.totalWithVat || 0),
      );
    } else {
      set(sheet, `H${rowNumber}`, formula(`E${rowNumber}*G${rowNumber}`, row.costWithoutVat));
      set(sheet, `I${rowNumber}`, Number(row.priceWithVat || 0));
      set(sheet, `J${rowNumber}`, formula(`K${rowNumber}-H${rowNumber}`, row.vatAmount));
      set(sheet, `K${rowNumber}`, formula(`E${rowNumber}*I${rowNumber}`, row.totalWithVat));
    }
  });
  mergeGroups(sheet, data.rows, positions.dataStart, (row) => row.positionName, [1, 2]);

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
  set(sheet, `B${total + 2}`, `Сумма (итого) ${amountInWords(data.totals.totalWithVat)}.`);
  set(
    sheet,
    `B${total + 6}`,
    `Начальник ${unitGenitive(data.dpo)}\n\n________________________ /${initialsFirst(director)}/`,
  );
  sheet.pageSetup.printArea = `A1:L${total + 6}`;
}

export const appendix15ExcelMapper = {
  templatePath: fileURLToPath(new URL('./appendix-1-5.template.xlsx', import.meta.url)),
  dataStart: 7,
  prototypeRows: 1,
  dataMerges: [],
  fill: fillAppendix15,
};

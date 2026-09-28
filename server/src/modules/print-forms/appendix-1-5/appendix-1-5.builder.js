import { num, money, calculateMoney, priceValues } from '../shared/money.js';
import { rentalRows, rentalSourceEntries } from '../shared/rental-data.js';
import { roundedActTotal } from '../shared/precise-money.js';
import { sortNomenclatureRows } from '../shared/nomenclature-order.js';
import { accountingQuantity } from '../shared/quantities.js';
import {
  archiveSourceEntry,
  mergeSourceEntries,
  sourceFields,
} from '../shared/print-form-data-sources.js';
import { baseData, importedCandidates } from '../shared/tabular-form.js';

function appendix15Data(context, rows) {
  const data = baseData(
    context,
    'Приложение 1.5 - обеспечение форменной одеждой по должностям',
    'Приложение 1.5',
    [
      { key: 'positionName', label: 'Должность', width: 28 },
      { key: 'modelName', label: 'Наименование форменной одежды', width: 36 },
      { key: 'unit', label: 'Ед. изм.', width: 9 },
      { key: 'quantity', label: 'Кол-во', width: 9, numeric: true, total: true, numberFormat: '0' },
      {
        key: 'coverageDays',
        label: 'Кол-во дней обеспечения',
        width: 14,
        numeric: true,
        total: true,
        numberFormat: '0',
      },
      {
        key: 'priceWithoutVat',
        label: 'Цена за месяц без НДС',
        width: 17,
        numeric: true,
        numberFormat: '#,##0.00',
      },
      {
        key: 'displayedPriceWithoutVat',
        label: 'Стоимость за месяц без НДС',
        width: 16,
        numeric: true,
        numberFormat: '#,##0.00',
      },
      {
        key: 'costWithoutVat',
        label: 'Итого без НДС',
        width: 16,
        numeric: true,
        total: true,
        numberFormat: '#,##0.00',
      },
      {
        key: 'vatAmount',
        label: 'Сумма НДС',
        width: 14,
        numeric: true,
        total: true,
        numberFormat: '#,##0.00',
      },
      {
        key: 'totalWithVat',
        label: 'Сумма с НДС',
        width: 16,
        numeric: true,
        total: true,
        numberFormat: '#,##0.00',
      },
    ],
    rows,
    [],
  );
  for (const key of ['costWithoutVat', 'vatAmount', 'totalWithVat']) {
    data.totals[key] = roundedActTotal(rows, key);
  }
  return data;
}

export async function buildAppendix15(context) {
  const liveEntries = rentalSourceEntries(context);
  const archiveEntries = importedCandidates(context, false)
    .filter((candidate) => candidate.position && !candidate.employee && candidate.name)
    .map((candidate) =>
      archiveSourceEntry({
        dpo: context.dpo,
        source: candidate._source,
        candidate,
      }),
    );
  const entries = mergeSourceEntries(liveEntries, archiveEntries);
  const liveRows = rentalRows(entries, { byPosition: true });
  const archiveRows = entries
    .filter((entry) => entry.source === 'archive')
    .map((entry) => {
      const candidate = entry.candidate;
      const price = priceValues({ priceWithoutVat: candidate.priceWithoutVat });
      const quantity = accountingQuantity(candidate.quantity);
      const calculated = calculateMoney(quantity, price.priceWithoutVat, price.vatRate);
      return {
        positionName: candidate.position,
        modelName: candidate.name,
        unit: candidate.unit || 'шт.',
        quantity,
        coverageDays: num(candidate.coverageDays),
        ...price,
        displayedPriceWithoutVat: price.priceWithoutVat,
        costWithoutVat:
          candidate.subtotalWithoutVat != null
            ? money(candidate.subtotalWithoutVat)
            : calculated.costWithoutVat,
        priceWithVat:
          candidate.totalWithoutVat != null
            ? money(candidate.totalWithoutVat)
            : calculated.priceWithVat,
        vatAmount: candidate.vatAmount != null ? money(candidate.vatAmount) : calculated.vatAmount,
        totalWithVat:
          candidate.totalWithVat != null ? money(candidate.totalWithVat) : calculated.totalWithVat,
        sourceValues: true,
        sourceFormulas: candidate.sourceFormulas ?? null,
        ...sourceFields(entry),
      };
    });
  return appendix15Data(
    context,
    sortNomenclatureRows([...liveRows, ...archiveRows], (row) => row.positionName),
  );
}

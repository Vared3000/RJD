import { money, calculateMoney, priceValues, priceForLine } from '../shared/money.js';
import { accountingQuantity } from '../shared/quantities.js';
import { preciseLine, preciseMoney, roundedActTotal } from '../shared/precise-money.js';
import { sortNomenclatureRows } from '../shared/nomenclature-order.js';
import {
  liveSourceEntry,
  archiveSourceEntry,
  mergeSourceEntries,
  sourceFields,
} from '../shared/print-form-data-sources.js';
import { baseData, importedCandidates } from '../shared/tabular-form.js';

function appendix17Data(context, rows) {
  const data = baseData(
    context,
    'Приложение 1.7 - акт приёма-передачи форменной одежды работникам',
    'Приложение 1.7',
    [
      { key: 'fullName', label: 'ФИО работника Заказчика', width: 28 },
      { key: 'personnelNumber', label: 'Табельный номер', width: 14 },
      { key: 'modelName', label: 'Наименование форменной одежды', width: 34 },
      { key: 'unit', label: 'Ед. изм.', width: 9 },
      { key: 'quantity', label: 'Кол-во', width: 8, numeric: true, total: true, numberFormat: '0' },
      {
        key: 'priceWithoutVat',
        label: 'Цена без НДС',
        width: 15,
        numeric: true,
        numberFormat: '#,##0.00',
      },
      {
        key: 'subtotalWithoutVat',
        label: 'Итого без НДС',
        width: 15,
        numeric: true,
        total: true,
        numberFormat: '#,##0.00',
      },
      { key: 'vatRate', label: 'НДС, %', width: 10, numeric: true, numberFormat: '0.0000' },
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
        width: 15,
        numeric: true,
        total: true,
        numberFormat: '#,##0.00',
      },
    ],
    rows,
    [
      { column: 7, key: 'subtotalWithoutVat', build: (row) => `E${row}*F${row}` },
      { column: 9, key: 'vatAmount', build: (row) => `G${row}*H${row}/100` },
      { column: 10, key: 'totalWithVat', build: (row) => `G${row}+I${row}` },
    ],
  );
  for (const key of ['subtotalWithoutVat', 'vatAmount', 'totalWithVat']) {
    data.totals[key] = roundedActTotal(rows, key);
  }
  return data;
}

export async function buildAppendix17(context) {
  const liveEntries = context.documents.flatMap((document) =>
    document.lines.map((line) => liveSourceEntry({ dpo: context.dpo, document, line })),
  );
  const archiveEntries = importedCandidates(context, true)
    .filter((candidate) => candidate.employee && candidate.name)
    .map((candidate) =>
      archiveSourceEntry({
        dpo: context.dpo,
        source: candidate._source,
        candidate,
      }),
    );
  const entries = mergeSourceEntries(liveEntries, archiveEntries);
  const retainedLive = entries.filter((entry) => entry.source === 'live');
  const liveRows = new Map();
  for (const entry of retainedLive) {
    const { document, line } = entry;
    const sourcePrice = priceForLine(context, document, line);
    const priceWithoutVat = preciseMoney(sourcePrice?.priceWithoutVat);
    const vatRate = Number(sourcePrice?.vatRate ?? 5);
    const key = JSON.stringify([document.employeeId, line.modelId, priceWithoutVat, vatRate]);
    const values = preciseLine(1, priceWithoutVat, vatRate);
    const current = liveRows.get(key) ?? {
      employeeId: document.employeeId,
      fullName: document.employee?.fullName ?? '',
      personnelNumber: document.employee?.personnelNumber ?? '',
      modelId: line.modelId,
      modelName: line.model?.name ?? '',
      unit: line.model?.unit ?? 'шт.',
      quantity: 1,
      priceWithoutVat,
      priceWithVat: preciseMoney(priceWithoutVat * (1 + vatRate / 100)),
      vatRate,
      subtotalWithoutVat: values.subtotalWithoutVat,
      vatAmount: values.vatAmount,
      totalWithVat: values.totalWithVat,
      ...sourceFields(entry),
      sourceReferences: new Set(),
    };
    current.sourceReferences.add(entry.sourceReference);
    liveRows.set(key, current);
  }
  const rows = [...liveRows.values()].map(({ sourceReferences, ...row }) => ({
    ...row,
    sourceReference: [...sourceReferences].join('; '),
  }));
  for (const entry of entries.filter((item) => item.source === 'archive')) {
    const candidate = entry.candidate;
    const price = priceValues({
      priceWithoutVat: candidate.priceWithoutVat,
      priceWithVat: candidate.priceWithVat,
    });
    const quantity = accountingQuantity(candidate.quantity);
    const values = calculateMoney(
      quantity,
      price.priceWithoutVat,
      price.vatRate,
      price.priceWithVat,
    );
    const hasSourceTotals =
      candidate.subtotalWithoutVat != null &&
      candidate.vatAmount != null &&
      candidate.totalWithVat != null;
    rows.push({
      fullName: candidate.employee.fullName ?? '',
      personnelNumber: candidate.employee.personnelNumber ?? '',
      modelName: candidate.name ?? '',
      unit: candidate.unit || 'шт.',
      quantity,
      ...price,
      subtotalWithoutVat: hasSourceTotals
        ? money(candidate.subtotalWithoutVat)
        : values.costWithoutVat,
      vatAmount: hasSourceTotals ? money(candidate.vatAmount) : values.vatAmount,
      totalWithVat: hasSourceTotals ? money(candidate.totalWithVat) : values.totalWithVat,
      ...sourceFields(entry),
    });
  }
  return appendix17Data(
    context,
    sortNomenclatureRows(rows, (row) => `${row.fullName}:${row.personnelNumber}`),
  );
}

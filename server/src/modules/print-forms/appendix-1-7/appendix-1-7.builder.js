import { printFormsRepository } from '../print-forms.repository.js';
import { num, money, calculateMoney, priceValues, priceForLine } from '../shared/money.js';
import {
  liveSourceEntry,
  archiveSourceEntry,
  mergeSourceEntries,
  sourceFields,
} from '../shared/print-form-data-sources.js';
import { baseData, importedCandidates } from '../shared/tabular-form.js';

function appendix17Data(context, rows) {
  return baseData(
    context,
    'Приложение 1.7 - акт приёма-передачи форменной одежды работникам',
    'Приложение 1.7',
    [
      { key: 'fullName', label: 'ФИО работника Заказчика', width: 28 },
      { key: 'personnelNumber', label: 'Табельный номер', width: 14 },
      { key: 'modelName', label: 'Наименование форменной одежды', width: 34 },
      { key: 'inventoryNumber', label: 'Код СКМТР / инвентарный номер', width: 18 },
      { key: 'unit', label: 'Ед. изм.', width: 9 },
      { key: 'quantity', label: 'Кол-во', width: 8, numeric: true, total: true, numberFormat: '0' },
      {
        key: 'priceWithoutVat',
        label: 'Цена без НДС',
        width: 15,
        numeric: true,
        numberFormat: '#,##0.0000',
      },
      {
        key: 'subtotalWithoutVat',
        label: 'Итого без НДС',
        width: 15,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
      { key: 'vatRate', label: 'НДС, %', width: 10, numeric: true, numberFormat: '0.0000' },
      {
        key: 'vatAmount',
        label: 'Сумма НДС',
        width: 14,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
      {
        key: 'totalWithVat',
        label: 'Сумма с НДС',
        width: 15,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
    ],
    rows,
    [
      { column: 8, key: 'subtotalWithoutVat', build: (row) => `F${row}*G${row}` },
      { column: 10, key: 'vatAmount', build: (row) => `H${row}*I${row}/100` },
      { column: 11, key: 'totalWithVat', build: (row) => `H${row}+J${row}` },
    ],
  );
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
  const movements = await printFormsRepository.findIssuanceMovements([
    ...new Set(retainedLive.map((entry) => entry.document.id)),
  ]);
  const byDocumentModel = new Map();
  for (const movement of movements) {
    const key = JSON.stringify([movement.documentId, movement.instance?.modelId]);
    if (!byDocumentModel.has(key)) byDocumentModel.set(key, []);
    byDocumentModel.get(key).push(movement.instance);
  }
  const rows = [];
  for (const entry of retainedLive) {
    const { document, line } = entry;
    const price = priceValues(priceForLine(context, document, line));
    const instances = byDocumentModel.get(JSON.stringify([document.id, line.modelId])) ?? [];
    const lineInstances = instances.length > 0 ? instances : Array(line.quantity).fill(null);
    for (const instance of lineInstances) {
      const values = calculateMoney(1, price.priceWithoutVat, price.vatRate);
      rows.push({
        fullName: document.employee?.fullName ?? '',
        personnelNumber: document.employee?.personnelNumber ?? '',
        modelName: line.model?.name ?? instance?.model?.name ?? '',
        inventoryNumber: instance?.inventoryNumber ?? '',
        unit: line.model?.unit ?? instance?.model?.unit ?? 'шт.',
        quantity: 1,
        ...price,
        subtotalWithoutVat: values.costWithoutVat,
        vatAmount: values.vatAmount,
        totalWithVat: values.totalWithVat,
        ...sourceFields(entry),
      });
    }
  }
  for (const entry of entries.filter((item) => item.source === 'archive')) {
    const candidate = entry.candidate;
    const price = priceValues({
      priceWithoutVat: candidate.priceWithoutVat,
      priceWithVat: candidate.priceWithVat,
    });
    const values = calculateMoney(
      num(candidate.quantity),
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
      inventoryNumber: candidate.inventoryNumber ?? '',
      unit: candidate.unit || 'шт.',
      quantity: num(candidate.quantity),
      ...price,
      subtotalWithoutVat: hasSourceTotals
        ? money(candidate.subtotalWithoutVat)
        : values.costWithoutVat,
      vatAmount: hasSourceTotals ? money(candidate.vatAmount) : values.vatAmount,
      totalWithVat: hasSourceTotals ? money(candidate.totalWithVat) : values.totalWithVat,
      ...sourceFields(entry),
    });
  }
  return appendix17Data(context, rows);
}

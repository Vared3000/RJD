import { num, money, calculateMoney, priceValues, priceForLine } from '../shared/money.js';
import {
  liveSourceEntry,
  archiveSourceEntry,
  mergeSourceEntries,
  sourceFields,
} from '../shared/print-form-data-sources.js';
import { baseData, importedCandidates } from '../shared/tabular-form.js';

export function buildFpu26(context) {
  const grouped = new Map();
  const addRow = ({ modelId, modelName, article, unit, quantity, sourcePrice, source }) => {
    const price = sourcePrice ?? priceValues();
    const key = JSON.stringify([modelId ?? modelName, price.priceWithoutVat, price.vatRate]);
    const row = grouped.get(key) ?? {
      modelName,
      article: article || '',
      unit: unit || 'шт.',
      quantity: 0,
      ...price,
      ...source,
    };
    row.quantity += quantity;
    if (row.dataSource !== source?.dataSource) {
      row.dataSource = 'mixed';
      row.dataSourceLabel = 'Учётная система + архив';
    }
    grouped.set(key, row);
  };
  const liveEntries = context.documents.flatMap((document) =>
    document.lines.map((line) => ({
      ...liveSourceEntry({ dpo: context.dpo, document, line }),
      employeeKey: '',
    })),
  );
  let sourceCandidates = importedCandidates(context, false).filter(
    (candidate) => candidate.formType === 'fpu-26' && num(candidate.quantity) > 0,
  );
  if (sourceCandidates.length === 0) {
    sourceCandidates = importedCandidates(context, true).filter(
      (candidate) => candidate.employee && num(candidate.quantity) > 0,
    );
  }
  const archiveEntries = sourceCandidates.map((candidate) => ({
    ...archiveSourceEntry({ dpo: context.dpo, source: candidate._source, candidate }),
    employeeKey: '',
  }));
  const entries = mergeSourceEntries(liveEntries, archiveEntries);

  for (const entry of entries.filter((item) => item.source === 'live')) {
    const { line } = entry;
    addRow({
      modelId: line.modelId,
      modelName: line.model?.name ?? '',
      article: line.model?.article,
      unit: line.model?.unit,
      quantity: line.quantity,
      sourcePrice: priceValues(priceForLine(context, entry.document, line)),
      source: sourceFields(entry),
    });
  }
  const archiveRows = entries
    .filter((entry) => entry.source === 'archive')
    .map((entry) => {
      const candidate = entry.candidate;
      const price = priceValues({ priceWithoutVat: candidate.priceWithoutVat });
      const calculated = calculateMoney(
        num(candidate.quantity),
        price.priceWithoutVat,
        price.vatRate,
      );
      return {
        modelName: candidate.name,
        unit: candidate.unit || 'шт.',
        quantity: num(candidate.quantity),
        ...price,
        displayedPriceWithoutVat:
          candidate.displayedPriceWithoutVat != null
            ? money(candidate.displayedPriceWithoutVat)
            : price.priceWithoutVat,
        costWithoutVat:
          candidate.subtotalWithoutVat != null
            ? money(candidate.subtotalWithoutVat)
            : calculated.costWithoutVat,
        vatAmount: candidate.vatAmount != null ? money(candidate.vatAmount) : calculated.vatAmount,
        totalWithVat:
          candidate.totalWithVat != null ? money(candidate.totalWithVat) : calculated.totalWithVat,
        sourceValues: true,
        sourceFormulas: candidate.sourceFormulas ?? null,
        ...sourceFields(entry),
      };
    });
  const liveRows = [...grouped.values()]
    .map((row) => ({ ...row, ...calculateMoney(row.quantity, row.priceWithoutVat, row.vatRate) }))
    .sort((a, b) => a.modelName.localeCompare(b.modelName, 'ru'));
  const rows = [...liveRows, ...archiveRows];
  return baseData(
    context,
    'АКТ о выполненных работах (оказанных услугах), форма ФПУ-26',
    'ФПУ-26',
    [
      { key: 'modelName', label: 'Наименование выполненных работ (услуг)', width: 42 },
      { key: 'unit', label: 'Ед. изм.', width: 10 },
      {
        key: 'quantity',
        label: 'Количество',
        width: 12,
        numeric: true,
        total: true,
        numberFormat: '0',
      },
      {
        key: 'priceWithoutVat',
        label: 'Цена за единицу без НДС, руб.',
        width: 18,
        numeric: true,
        numberFormat: '#,##0.0000',
      },
      {
        key: 'costWithoutVat',
        label: 'Стоимость без НДС, руб.',
        width: 18,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
      { key: 'vatRate', label: 'Ставка НДС, %', width: 12, numeric: true, numberFormat: '0.0000' },
      {
        key: 'vatAmount',
        label: 'НДС, руб.',
        width: 16,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
      {
        key: 'totalWithVat',
        label: 'Стоимость с НДС, руб.',
        width: 18,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
    ],
    rows,
    [
      { column: 5, key: 'costWithoutVat', build: (row) => `C${row}*D${row}` },
      { column: 7, key: 'vatAmount', build: (row) => `E${row}*F${row}/100` },
      { column: 8, key: 'totalWithVat', build: (row) => `E${row}+G${row}` },
    ],
  );
}

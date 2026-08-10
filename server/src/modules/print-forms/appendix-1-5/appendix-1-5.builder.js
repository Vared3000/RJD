import { computeCoverageDays } from '../../reports/coverage.service.js';
import { num, money, calculateMoney, priceValues, priceForLine } from '../shared/money.js';
import {
  liveSourceEntry,
  archiveSourceEntry,
  mergeSourceEntries,
  sourceFields,
} from '../shared/print-form-data-sources.js';
import { baseData, importedCandidates } from '../shared/tabular-form.js';

function appendix15Data(context, rows) {
  return baseData(
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
        label: 'Стоимость за месяц без НДС',
        width: 17,
        numeric: true,
        numberFormat: '#,##0.0000',
      },
      {
        key: 'costWithoutVat',
        label: 'Итого без НДС',
        width: 16,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
      {
        key: 'priceWithVat',
        label: 'Цена за ед. с НДС',
        width: 16,
        numeric: true,
        numberFormat: '#,##0.0000',
      },
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
        width: 16,
        numeric: true,
        total: true,
        numberFormat: '#,##0.0000',
      },
    ],
    rows,
    [
      { column: 7, key: 'costWithoutVat', build: (row) => `D${row}*F${row}` },
      { column: 9, key: 'vatAmount', build: (row) => `J${row}-G${row}` },
      { column: 10, key: 'totalWithVat', build: (row) => `D${row}*H${row}` },
    ],
  );
}

export async function buildAppendix15(context) {
  const liveEntries = context.documents.flatMap((document) =>
    document.lines.map((line) => liveSourceEntry({ dpo: context.dpo, document, line })),
  );
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
  const retainedLive = entries.filter((entry) => entry.source === 'live');
  const employeeIds = [...new Set(retainedLive.map((entry) => entry.document.employeeId))];
  const coverage = await computeCoverageDays({
    from: context.from,
    to: context.to,
    employeeIds,
  });
  const grouped = new Map();
  for (const entry of retainedLive) {
    const { document, line } = entry;
    const price = priceValues(priceForLine(context, document, line));
    const positionName = document.employee?.position?.name ?? 'Должность не указана';
    const key = JSON.stringify([positionName, line.modelId, price.priceWithoutVat]);
    const row = grouped.get(key) ?? {
      positionName,
      modelName: line.model?.name ?? '',
      unit: line.model?.unit ?? 'шт.',
      quantity: 0,
      employeeIds: new Set(),
      ...price,
      ...sourceFields(entry),
    };
    row.quantity += line.quantity;
    row.employeeIds.add(document.employeeId);
    grouped.set(key, row);
  }
  const liveRows = [...grouped.values()]
    .map((row) => {
      const coverageDays = [...row.employeeIds].reduce(
        (sum, employeeId) => sum + (coverage.get(employeeId) ?? 0),
        0,
      );
      return {
        ...row,
        coverageDays,
        ...calculateMoney(row.quantity, row.priceWithoutVat, row.vatRate, row.priceWithVat),
      };
    })
    .sort((a, b) =>
      `${a.positionName}${a.modelName}`.localeCompare(`${b.positionName}${b.modelName}`, 'ru'),
    );
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
        positionName: candidate.position,
        modelName: candidate.name,
        unit: candidate.unit || 'шт.',
        quantity: num(candidate.quantity),
        coverageDays: num(candidate.coverageDays),
        ...price,
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
  return appendix15Data(context, [...liveRows, ...archiveRows]);
}

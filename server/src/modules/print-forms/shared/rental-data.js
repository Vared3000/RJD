import { liveSourceEntry, sourceFields } from './print-form-data-sources.js';
import { seasonalIntervals } from './seasonal-rental.js';
import { preciseLine, preciseMoney } from './precise-money.js';
import { sortNomenclatureRows } from './nomenclature-order.js';

// Источник расчёта — владение, не дата выдачи. Сохраняем контракт источников
// архива, группируя физические экземпляры обратно в строки исходной выдачи.
export function rentalSourceEntries(context) {
  const lines = new Map();
  for (const ownership of context.ownershipRows) {
    const key = JSON.stringify([
      ownership.issuanceDocumentId,
      ownership.modelId,
      ownership.sizeValue,
      ownership.heightValue,
    ]);
    if (!lines.has(key)) {
      const document = {
        id: ownership.issuanceDocumentId,
        number: ownership.issuanceNumber,
        documentDate: String(ownership.issuedDate),
        employeeId: ownership.employeeId,
        employee: { fullName: ownership.employeeName, personnelNumber: ownership.personnelNumber },
      };
      const line = {
        id: key,
        modelId: ownership.modelId,
        quantity: 0,
        model: { name: ownership.modelName },
      };
      lines.set(key, { document, line, ownershipRows: [], instances: new Set() });
    }
    const entry = lines.get(key);
    entry.ownershipRows.push(ownership);
    entry.instances.add(ownership.instanceId);
  }
  return [...lines.values()].map(({ document, line, ownershipRows, instances }) => ({
    ...liveSourceEntry({ dpo: context.dpo, document, line: { ...line, quantity: instances.size } }),
    ownershipRows,
  }));
}

export function rentalRows(entries, { byPosition = false } = {}) {
  const groups = new Map();
  for (const entry of entries.filter((item) => item.source === 'live')) {
    for (const ownership of entry.ownershipRows) {
      const intervals = seasonalIntervals({
        from: ownership.intervalStart,
        to: ownership.intervalEnd,
        issuedDate: ownership.issuedDate,
        returnedDate: ownership.returnedDate,
        wearMonthsSnapshot: ownership.wearMonthsSnapshot,
      });
      if (intervals.length === 0) continue;
      const priceWithoutVat = preciseMoney(ownership.monthlyPriceWithoutVat);
      const vatRate = Number(ownership.vatRate ?? 5);
      const gender = byPosition ? (ownership.employeeGender ?? null) : null;
      const key = JSON.stringify([
        byPosition ? ownership.positionId : null,
        gender,
        ownership.modelId,
        priceWithoutVat,
        vatRate,
      ]);
      const genderLabel =
        gender === 'male' ? 'мужской комплект' : gender === 'female' ? 'женский комплект' : '';
      const positionName = ownership.positionName ?? 'Должность не указана';
      const group = groups.get(key) ?? {
        modelId: ownership.modelId,
        modelName: ownership.modelName,
        article: ownership.article ?? '',
        positionName: genderLabel ? `${positionName} ${genderLabel}` : positionName,
        genderOrder: gender === 'male' ? 0 : gender === 'female' ? 1 : 2,
        unit: ownership.unit ?? 'шт.',
        quantity: 0,
        priceWithoutVat,
        vatRate,
        ownershipKeys: new Set(),
        monthlyUnits: new Map(),
        sourceReferences: new Set(),
        ...sourceFields(entry),
      };
      // Расчётная единица — работник + модель, а не физический
      // экземпляр. Две одинаковые вещи у одного работника дают 1,
      // та же модель у восьми работников — 8.
      const ownershipKey = String(
        ownership.employeeId ?? ownership.personnelNumber ?? ownership.employeeName,
      );
      group.ownershipKeys.add(ownershipKey);
      for (const interval of intervals) {
        const month = group.monthlyUnits.get(interval.month) ?? {
          units: new Set(),
          daysInMonth: interval.daysInMonth,
        };
        month.units.add(ownershipKey);
        group.monthlyUnits.set(interval.month, month);
      }
      group.sourceReferences.add(entry.sourceReference);
      groups.set(key, group);
    }
  }
  const rows = [...groups.values()].map(
    ({ ownershipKeys, monthlyUnits, sourceReferences, ...row }) => {
      // По согласованному правилу любое владение в месяце оплачивается как
      // полный месяц. Сезон определяет, попадёт ли вещь в этот месяц вообще.
      const breakdown = [...monthlyUnits.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { units, daysInMonth }]) => ({
          month,
          units: units.size,
          days: daysInMonth,
          daysInMonth,
          ...preciseLine(units.size, row.priceWithoutVat, row.vatRate),
        }));
      const sum = (key) => preciseMoney(breakdown.reduce((total, month) => total + month[key], 0));
      const quantity = ownershipKeys.size;
      const costWithoutVat = sum('subtotalWithoutVat');
      return {
        ...row,
        quantity,
        costWithoutVat,
        vatAmount: sum('vatAmount'),
        totalWithVat: sum('totalWithVat'),
        breakdown,
        rentalDays: breakdown.reduce((days, month) => days + month.days, 0),
        coverageDays: breakdown.reduce((days, month) => days + month.days, 0),
        priceWithVat: preciseMoney(row.priceWithoutVat * (1 + row.vatRate / 100)),
        displayedPriceWithoutVat:
          quantity > 0 ? preciseMoney(costWithoutVat / quantity) : row.priceWithoutVat,
        seasonalCalculation: true,
        sourceReference: [...sourceReferences].join('; '),
      };
    },
  );
  return sortNomenclatureRows(rows, (row) =>
    byPosition ? `${row.genderOrder}:${row.positionName}` : '',
  );
}

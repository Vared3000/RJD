import { ApiError } from '../../utils/api-error.js';
import { computeCoverageDays } from '../reports/coverage.service.js';
import { resolvePeriod, toDateOnly } from '../reports/period.js';
import { printFormsRepository } from './print-forms.repository.js';
import { generateExcel } from './excel.generator.js';
import { generatePdf } from './pdf.generator.js';

const num = (value) => Number(value ?? 0);
// В архивных Excel-актах встречаются цены с пятью знаками после запятой.
// Не обрезаем их до точности БД: иначе сумма НДС в воспроизведённой форме
// может отличаться от подписанного оригинала на одну копейку.
const money = (value) => Number(num(value).toFixed(9));

function sumBy(rows, key) {
  return money(rows.reduce((sum, row) => sum + num(row[key]), 0));
}

function calculateMoney(quantity, priceWithoutVat, vatRate, explicitPriceWithVat) {
  const costWithoutVat = money(quantity * priceWithoutVat);
  const priceWithVat = explicitPriceWithVat
    ? money(explicitPriceWithVat)
    : money(priceWithoutVat * (1 + vatRate / 100));
  const totalWithVat = explicitPriceWithVat
    ? money(quantity * priceWithVat)
    : money(costWithoutVat + costWithoutVat * (vatRate / 100));
  const vatAmount = money(totalWithVat - costWithoutVat);
  return {
    costWithoutVat,
    vatAmount,
    totalWithVat,
    priceWithVat,
  };
}

async function dpoSnapshotAt(dpoId, asOf) {
  const current = await printFormsRepository.findDpo(dpoId);
  if (!current) throw ApiError.notFound('ДПО не найдено');
  const snapshot = current.toJSON();
  const history = await printFormsRepository.findDpoHistoryAfter(dpoId, asOf);
  for (const entry of history) Object.assign(snapshot, entry.previousData);
  return snapshot;
}

function selectPrices(prices, modelIds, dpoId, to) {
  const dateLimit = toDateOnly(to);
  const result = new Map();
  for (const modelId of modelIds) {
    const eligible = prices.filter(
      (price) =>
        price.modelId === modelId && (!price.effectiveDate || price.effectiveDate <= dateLimit),
    );
    const selected =
      eligible.find((price) => price.dpoId === dpoId) ??
      eligible.find((price) => price.dpoId == null);
    if (selected) result.set(modelId, selected);
  }
  return result;
}

function priceValues(price, fallback = 0) {
  const priceWithoutVat = money(price?.priceWithoutVat ?? fallback);
  const explicitWithVat = num(price?.priceWithVat);
  const calculatedRate =
    explicitWithVat > 0 && priceWithoutVat > 0 ? (explicitWithVat / priceWithoutVat - 1) * 100 : 5;
  const vatRate = money(price?.vatRate ?? calculatedRate);
  return {
    priceWithoutVat,
    priceWithVat: explicitWithVat ? money(explicitWithVat) : 0,
    vatRate,
  };
}

async function loadContext(query) {
  const { from, to } = resolvePeriod({ from: query.from, to: query.to });
  if (from > to) throw ApiError.badRequest('Дата начала не может быть позже даты окончания');
  const [dpo, documents] = await Promise.all([
    dpoSnapshotAt(query.dpoId, to),
    printFormsRepository.findIssuanceDocuments({ dpoId: query.dpoId, from, to }),
  ]);
  const modelIds = [
    ...new Set(documents.flatMap((document) => document.lines.map((line) => line.modelId))),
  ];
  const [prices, importedNomenclature] = await Promise.all([
    printFormsRepository.findPrices({
      modelIds,
      dpoId: query.dpoId,
    }),
    documents.length === 0
      ? printFormsRepository.findImportedNomenclature({
          dpoName: dpo.name,
          from,
          to,
        })
      : [],
  ]);
  return {
    dpo,
    documents,
    from,
    to,
    fromText: toDateOnly(from),
    toText: toDateOnly(to),
    priceByModel: selectPrices(prices, modelIds, query.dpoId, to),
    importedNomenclature,
  };
}

function baseData(context, title, sheetName, columns, rows, formulas) {
  const totalKeys = columns.filter((column) => column.total).map((column) => column.key);
  return {
    title,
    sheetName,
    dpo: context.dpo,
    from: context.fromText,
    to: context.toText,
    columns,
    rows,
    formulas,
    totals: Object.fromEntries(totalKeys.map((key) => [key, sumBy(rows, key)])),
  };
}

function importedCandidates(context, withEmployee) {
  const unique = new Map();
  for (const source of context.importedNomenclature) {
    const candidate = source.payload;
    if (Boolean(candidate.employee) !== withEmployee) continue;
    const key = JSON.stringify([
      candidate.employee?.personnelNumber ?? candidate.employee?.fullName ?? null,
      candidate.position ?? null,
      candidate.name,
      candidate.unit,
      num(candidate.quantity),
      num(candidate.coverageDays),
      num(candidate.priceWithoutVat),
      num(candidate.priceWithVat),
      candidate.effectiveDate,
    ]);
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function buildFpu26(context) {
  const grouped = new Map();
  let rows = null;
  const addRow = ({ modelId, modelName, unit, quantity, sourcePrice }) => {
    const price = sourcePrice ?? priceValues(context.priceByModel.get(modelId));
    const key = `${modelId ?? modelName}\u0000${price.priceWithoutVat}\u0000${price.vatRate}`;
    const row = grouped.get(key) ?? {
      modelName,
      unit: unit || 'шт.',
      quantity: 0,
      ...price,
    };
    row.quantity += quantity;
    grouped.set(key, row);
  };
  if (context.documents.length > 0) {
    for (const document of context.documents) {
      for (const line of document.lines) {
        addRow({
          modelId: line.modelId,
          modelName: line.model?.name ?? '',
          unit: line.model?.unit,
          quantity: line.quantity,
        });
      }
    }
  } else {
    const sourceCandidates = importedCandidates(context, false).filter(
      (candidate) => candidate.formType === 'fpu-26' && num(candidate.quantity) > 0,
    );
    if (sourceCandidates.length > 0) {
      rows = sourceCandidates.map((candidate) => {
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
          vatAmount:
            candidate.vatAmount != null ? money(candidate.vatAmount) : calculated.vatAmount,
          totalWithVat:
            candidate.totalWithVat != null
              ? money(candidate.totalWithVat)
              : calculated.totalWithVat,
          sourceValues: true,
          sourceFormulas: candidate.sourceFormulas ?? null,
        };
      });
    } else {
      for (const candidate of importedCandidates(context, true)) {
        if (!candidate.employee || num(candidate.quantity) <= 0) continue;
        addRow({
          modelName: candidate.name,
          unit: candidate.unit,
          quantity: num(candidate.quantity),
          sourcePrice: priceValues({
            priceWithoutVat: candidate.priceWithoutVat,
            priceWithVat: candidate.priceWithVat,
          }),
        });
      }
    }
  }
  rows ??= [...grouped.values()]
    .map((row) => ({ ...row, ...calculateMoney(row.quantity, row.priceWithoutVat, row.vatRate) }))
    .sort((a, b) => a.modelName.localeCompare(b.modelName, 'ru'));
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

async function buildAppendix15(context) {
  if (context.documents.length === 0) {
    const rows = [];
    for (const candidate of importedCandidates(context, false)) {
      if (!candidate.position || candidate.employee || !candidate.name) continue;
      const price = priceValues({
        priceWithoutVat: candidate.priceWithoutVat,
      });
      const calculated = calculateMoney(
        num(candidate.quantity),
        price.priceWithoutVat,
        price.vatRate,
      );
      rows.push({
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
        vatAmount:
          candidate.vatAmount != null ? money(candidate.vatAmount) : calculated.vatAmount,
        totalWithVat:
          candidate.totalWithVat != null
            ? money(candidate.totalWithVat)
            : calculated.totalWithVat,
        sourceValues: true,
        sourceFormulas: candidate.sourceFormulas ?? null,
      });
    }
    return appendix15Data(context, rows);
  }
  const employeeIds = [...new Set(context.documents.map((document) => document.employeeId))];
  const coverage = await computeCoverageDays({
    from: context.from,
    to: context.to,
    employeeIds,
  });
  const grouped = new Map();
  for (const document of context.documents) {
    for (const line of document.lines) {
      const price = priceValues(context.priceByModel.get(line.modelId));
      const positionName = document.employee?.position?.name ?? 'Должность не указана';
      const key = `${positionName}\u0000${line.modelId}\u0000${price.priceWithoutVat}`;
      const row = grouped.get(key) ?? {
        positionName,
        modelName: line.model?.name ?? '',
        unit: line.model?.unit ?? 'шт.',
        quantity: 0,
        employeeIds: new Set(),
        ...price,
      };
      row.quantity += line.quantity;
      row.employeeIds.add(document.employeeId);
      grouped.set(key, row);
    }
  }
  const rows = [...grouped.values()]
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
  return appendix15Data(context, rows);
}

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

async function buildAppendix17(context) {
  if (context.documents.length === 0) {
    const rows = [];
    for (const candidate of importedCandidates(context, true)) {
      if (!candidate.employee || !candidate.name) continue;
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
        inventoryNumber: '',
        unit: candidate.unit || 'шт.',
        quantity: num(candidate.quantity),
        ...price,
        subtotalWithoutVat: hasSourceTotals
          ? money(candidate.subtotalWithoutVat)
          : values.costWithoutVat,
        vatAmount: hasSourceTotals ? money(candidate.vatAmount) : values.vatAmount,
        totalWithVat: hasSourceTotals
          ? money(candidate.totalWithVat)
          : values.totalWithVat,
      });
    }
    return appendix17Data(context, rows);
  }
  const movements = await printFormsRepository.findIssuanceMovements(
    context.documents.map((document) => document.id),
  );
  const byDocumentModel = new Map();
  for (const movement of movements) {
    const key = `${movement.documentId}\u0000${movement.instance?.modelId}`;
    if (!byDocumentModel.has(key)) byDocumentModel.set(key, []);
    byDocumentModel.get(key).push(movement.instance);
  }
  const rows = [];
  for (const document of context.documents) {
    for (const line of document.lines) {
      const price = priceValues(context.priceByModel.get(line.modelId));
      const instances = byDocumentModel.get(`${document.id}\u0000${line.modelId}`) ?? [];
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
        });
      }
    }
  }
  return appendix17Data(context, rows);
}

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

const BUILDERS = {
  'fpu-26': buildFpu26,
  'appendix-1-5': buildAppendix15,
  'appendix-1-7': buildAppendix17,
};

export const printFormsService = {
  async generate(form, query) {
    const builder = BUILDERS[form];
    if (!builder) throw ApiError.notFound('Печатная форма не найдена');
    const context = await loadContext(query);
    const data = await builder(context);
    data.form = form;
    const extension = query.format;
    const buffer = extension === 'pdf' ? await generatePdf(data) : await generateExcel(data);
    return {
      buffer,
      contentType:
        extension === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `${form}_${context.fromText}_${context.toText}.${extension}`,
    };
  },
};

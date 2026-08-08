import { ApiError } from '../../utils/api-error.js';
import { computeCoverageDays } from '../reports/coverage.service.js';
import { resolvePeriod, toDateOnly } from '../reports/period.js';
import { printFormsRepository } from './print-forms.repository.js';
import { generateExcel } from './excel.generator.js';
import { generatePdf } from './pdf.generator.js';
import {
  archiveSourceEntry,
  liveSourceEntry,
  mergeSourceEntries,
  sourceFields,
} from './print-form-data-sources.js';

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
    printFormsRepository.findImportedNomenclature({
      dpoName: dpo.name,
      from,
      to,
    }),
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

function inferServiceLifeYears(name) {
  const value = String(name ?? '').toLowerCase();
  if (/пальто|плащ|куртка/.test(value)) return 4;
  if (/головн|шапк|кепк|перчат|вареж|ремень|сумк/.test(value)) return 3;
  if (/бейдж|зажим/.test(value)) return 1;
  return 2;
}

function primaryOrImportedSize(employee, relationName, sizeType) {
  const primary = employee[relationName]?.value;
  const imported = (employee.measurements ?? [])
    .filter((measurement) => measurement.sizeType === sizeType)
    .map((measurement) => String(measurement.value))
    .filter(Boolean);
  const values = [primary ? String(primary) : null, ...imported]
    .filter(Boolean)
    .flatMap((value) =>
      sizeType === 'clothing' && /^\d{2}\.\d{2}$/.test(value) ? value.split('.') : [value],
    );
  return [...new Set(values)].join(', ');
}

async function loadPersonalCardContext(query) {
  if (!query.employeeId) throw ApiError.badRequest('Выберите работника');
  const employeeRecord = await printFormsRepository.findEmployee(query.employeeId);
  if (!employeeRecord) throw ApiError.notFound('Работник не найден');
  const employee = employeeRecord.toJSON();
  const dpoId = employee.dpoId ?? query.dpoId;
  if (!dpoId) throw ApiError.badRequest('У работника не указано ДПО');

  const asOfText = query.to ?? employee.terminationDate ?? new Date().toISOString().slice(0, 10);
  const asOf = new Date(`${asOfText}T23:59:59.999Z`);
  const [dpo, issuanceDocuments, returnDocuments, kitItems, importedPersonalCard] =
    await Promise.all([
      dpoSnapshotAt(dpoId, asOf),
      printFormsRepository.findEmployeeIssuanceDocuments(employee.id),
      printFormsRepository.findEmployeeReturnDocuments(employee.id),
      printFormsRepository.findPositionKitItems(employee.positionId),
      printFormsRepository.findImportedPersonalCard({ employee }),
    ]);
  const movements = await printFormsRepository.findIssuanceMovements(
    issuanceDocuments.map((document) => document.id),
  );
  return {
    dpo,
    employee,
    issuanceDocuments,
    returnDocuments,
    kitItems,
    movements,
    importedPersonalCard,
    fromText: employee.hireDate ?? query.from ?? asOfText,
    toText: employee.terminationDate ?? asOfText,
  };
}

async function loadUpdContext(query) {
  const context = await loadContext(query);
  context.importedUpd = await printFormsRepository.findImportedUpd({
    from: context.from,
    to: context.to,
  });
  return context;
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
    if (!unique.has(key)) unique.set(key, { ...candidate, _source: source });
  }
  return [...unique.values()];
}

function buildFpu26(context) {
  const grouped = new Map();
  const addRow = ({ modelId, modelName, article, unit, quantity, sourcePrice, source }) => {
    const price = sourcePrice ?? priceValues(context.priceByModel.get(modelId));
    const key = `${modelId ?? modelName}\u0000${price.priceWithoutVat}\u0000${price.vatRate}`;
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

async function buildAppendix15(context) {
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
    const key = `${movement.documentId}\u0000${movement.instance?.modelId}`;
    if (!byDocumentModel.has(key)) byDocumentModel.set(key, []);
    byDocumentModel.get(key).push(movement.instance);
  }
  const rows = [];
  for (const entry of retainedLive) {
    const { document, line } = entry;
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

function buildPersonalCard(context) {
  const issuanceDateByDocument = new Map(
    context.issuanceDocuments.map((document) => [
      document.id,
      toDateOnly(new Date(document.documentDate)),
    ]),
  );
  const returnDatesByInstance = new Map();
  for (const document of context.returnDocuments) {
    const date = toDateOnly(new Date(document.documentDate));
    for (const line of document.lines ?? []) {
      const dates = returnDatesByInstance.get(line.instanceId) ?? [];
      dates.push(date);
      returnDatesByInstance.set(line.instanceId, dates);
    }
  }

  const kitByModel = new Map(
    context.kitItems.map((item, index) => [
      item.modelId,
      {
        index,
        quantity: num(item.quantity) || 1,
        serviceLifeYears: item.serviceLifeYears ?? inferServiceLifeYears(item.model?.name),
        model: item.model,
      },
    ]),
  );
  let rows = [];
  const modelsWithHistory = new Set();
  for (const movement of context.movements) {
    const instance = movement.instance;
    const model = instance?.model;
    if (!instance || !model) continue;
    const issueDate = issuanceDateByDocument.get(movement.documentId);
    if (!issueDate) continue;
    modelsWithHistory.add(model.id);
    const returnDates = returnDatesByInstance.get(instance.id) ?? [];
    const returnIndex = returnDates.findIndex((date) => date >= issueDate);
    const returnedDate = returnIndex >= 0 ? returnDates.splice(returnIndex, 1)[0] : null;
    const kit = kitByModel.get(model.id);
    rows.push({
      sortIndex: kit?.index ?? Number.MAX_SAFE_INTEGER,
      modelId: model.id,
      modelName: model.name,
      unit: model.unit || 'шт.',
      quantity: 1,
      normQuantity: kit?.quantity ?? 1,
      serviceLifeYears: kit?.serviceLifeYears ?? inferServiceLifeYears(model.name),
      issuedQuantity: 1,
      issuedDate: issueDate,
      returnedQuantity: returnedDate ? 1 : null,
      returnedDate,
    });
  }
  if (rows.length === 0 && context.importedPersonalCard.length > 0) {
    const groups = new Map();
    for (const source of context.importedPersonalCard) {
      const candidate = source.payload;
      const groupKey = [source.sourceFile, source.sheetName, candidate.cardStartRow ?? 0].join(
        '\u0000',
      );
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(candidate);
    }
    const selected = [...groups.values()].sort((left, right) => {
      const score = (group) =>
        group.length +
        group.filter((candidate) => candidate.issuedDate).length * 100 +
        group.filter((candidate) => candidate.returnedDate).length * 10;
      return score(right) - score(left);
    })[0];
    rows = selected.map((candidate, index) => ({
      sortIndex: index,
      modelId: null,
      modelName: candidate.name,
      unit: candidate.unit || 'шт.',
      quantity: num(candidate.quantity) || num(candidate.normQuantity) || 1,
      normQuantity: num(candidate.normQuantity) || num(candidate.quantity) || 1,
      serviceLifeYears: num(candidate.serviceLifeYears) || inferServiceLifeYears(candidate.name),
      issuedQuantity: candidate.issuedQuantity == null ? null : num(candidate.issuedQuantity),
      issuedDate: candidate.issuedDate || null,
      returnedQuantity: candidate.returnedQuantity == null ? null : num(candidate.returnedQuantity),
      returnedDate: candidate.returnedDate || null,
    }));
  } else {
    for (const kit of kitByModel.values()) {
      if (modelsWithHistory.has(kit.model.id)) continue;
      rows.push({
        sortIndex: kit.index,
        modelId: kit.model.id,
        modelName: kit.model.name,
        unit: kit.model.unit || 'шт.',
        quantity: kit.quantity,
        normQuantity: kit.quantity,
        serviceLifeYears: kit.serviceLifeYears,
        issuedQuantity: null,
        issuedDate: null,
        returnedQuantity: null,
        returnedDate: null,
      });
    }
  }
  rows.sort(
    (left, right) =>
      left.sortIndex - right.sortIndex ||
      left.modelName.localeCompare(right.modelName, 'ru') ||
      String(left.issuedDate ?? '').localeCompare(String(right.issuedDate ?? '')),
  );

  const firstIssuedDate = rows
    .map((row) => row.issuedDate)
    .filter(Boolean)
    .sort()[0];
  const employee = context.employee;
  return {
    title: 'Личная карточка по обеспечению форменной одеждой и ее содержания',
    sheetName: 'Личная карточка',
    dpo: context.dpo,
    employee,
    openedDate: employee.hireDate ?? firstIssuedDate ?? context.fromText,
    clothingSize: primaryOrImportedSize(employee, 'clothingSize', 'clothing'),
    heightSize: primaryOrImportedSize(employee, 'heightSize', 'height'),
    headwearSize: primaryOrImportedSize(employee, 'headwearSize', 'headwear'),
    beltSize: primaryOrImportedSize(employee, 'beltSize', 'belt'),
    glovesSize: primaryOrImportedSize(employee, 'glovesSize', 'gloves'),
    rows,
  };
}

function buildUpd(context) {
  let rows;
  let documentNumber = null;
  let paymentDocumentNumber = null;
  let paymentDocumentDate = null;
  let documentDate = context.toText;
  if (context.importedUpd.length > 0) {
    const groups = new Map();
    for (const source of context.importedUpd) {
      const candidate = source.payload;
      const key = candidate.documentNumber || candidate.effectiveDate || 'archive';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(candidate);
    }
    const selected = [...groups.values()].sort(
      (left, right) =>
        String(right[0]?.effectiveDate ?? '').localeCompare(String(left[0]?.effectiveDate ?? '')) ||
        right.length - left.length,
    )[0];
    const first = selected[0];
    documentNumber = first.documentNumber;
    paymentDocumentNumber = first.paymentDocumentNumber;
    paymentDocumentDate = first.paymentDocumentDate;
    documentDate = first.effectiveDate || documentDate;
    rows = selected.map((candidate) => ({
      article: candidate.article || '',
      modelName: candidate.name,
      unitCode: candidate.unitCode || '796',
      unit: candidate.unit || 'шт',
      quantity: num(candidate.quantity),
      priceWithoutVat: money(candidate.priceWithoutVat),
      costWithoutVat: money(candidate.subtotalWithoutVat),
      vatRate: num(candidate.vatRate) || 5,
      vatAmount: money(candidate.vatAmount),
      totalWithVat: money(candidate.totalWithVat),
    }));
  } else {
    const fpu = buildFpu26(context);
    rows = fpu.rows.map((row) => ({
      article: row.article || '',
      modelName: row.modelName,
      unitCode: '796',
      unit: row.unit || 'шт',
      quantity: row.quantity,
      priceWithoutVat: row.priceWithoutVat,
      costWithoutVat: row.costWithoutVat,
      vatRate: row.vatRate,
      vatAmount: row.vatAmount,
      totalWithVat: row.totalWithVat,
    }));
  }
  return {
    title: 'Универсальный передаточный документ',
    sheetName: 'УПД',
    dpo: context.dpo,
    documentNumber: documentNumber || 'Б/Н',
    documentDate,
    paymentDocumentNumber,
    paymentDocumentDate,
    rows,
    totals: {
      costWithoutVat: sumBy(rows, 'costWithoutVat'),
      vatAmount: sumBy(rows, 'vatAmount'),
      totalWithVat: sumBy(rows, 'totalWithVat'),
    },
  };
}

const BUILDERS = {
  'fpu-26': buildFpu26,
  'appendix-1-5': buildAppendix15,
  'appendix-1-7': buildAppendix17,
  'personal-card': buildPersonalCard,
  upd: buildUpd,
};

export const printFormsService = {
  async generate(form, query) {
    const builder = BUILDERS[form];
    if (!builder) throw ApiError.notFound('Печатная форма не найдена');
    if (form !== 'personal-card' && (!query.dpoId || !query.from || !query.to)) {
      throw ApiError.badRequest('Выберите ДПО и период');
    }
    if (form === 'upd' && query.format !== 'pdf') {
      throw ApiError.badRequest('УПД формируется только в PDF');
    }
    const context =
      form === 'personal-card'
        ? await loadPersonalCardContext(query)
        : form === 'upd'
          ? await loadUpdContext(query)
          : await loadContext(query);
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
      fileName:
        form === 'personal-card'
          ? `${form}_${context.employee.personnelNumber || context.employee.id}.${extension}`
          : form === 'upd'
            ? `${form}_${data.documentNumber}_${data.documentDate}.${extension}`
            : `${form}_${context.fromText}_${context.toText}.${extension}`,
    };
  },
};

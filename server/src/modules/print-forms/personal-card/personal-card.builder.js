import { ApiError } from '../../../utils/api-error.js';
import { toDateOnly } from '../../reports/period.js';
import { printFormsRepository } from '../print-forms.repository.js';
import { printFormSettingsService } from '../settings/print-form-settings.service.js';
import { dpoSnapshotAt } from '../shared/dpo-snapshot.js';
import { num } from '../shared/money.js';

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

export async function loadPersonalCardContext(query) {
  if (!query.employeeId) throw ApiError.badRequest('Выберите работника');
  const employeeRecord = await printFormsRepository.findEmployee(query.employeeId);
  if (!employeeRecord) throw ApiError.notFound('Работник не найден');
  const employee = employeeRecord.toJSON();
  const dpoId = employee.dpoId ?? query.dpoId;
  if (!dpoId) throw ApiError.badRequest('У работника не указано ДПО');

  const asOfText = query.to ?? employee.terminationDate ?? new Date().toISOString().slice(0, 10);
  const asOf = new Date(`${asOfText}T23:59:59.999Z`);
  const [dpo, parties, issuanceDocuments, returnDocuments, kitItems, importedPersonalCard] =
    await Promise.all([
      dpoSnapshotAt(printFormsRepository, dpoId, asOf),
      printFormSettingsService.snapshotAt(asOfText),
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
    parties,
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

export function buildPersonalCard(context) {
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
        serviceLifeYears: item.serviceLifeYears ?? null,
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
      serviceLifeYears: kit?.serviceLifeYears ?? null,
      serviceLifeWarning:
        kit?.serviceLifeYears == null
          ? `Норматив не задан; ориентировочная подсказка: ${inferServiceLifeYears(model.name)} г.`
          : null,
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
      const groupKey = JSON.stringify([
        source.sourceFile,
        source.sheetName,
        candidate.cardStartRow ?? 0,
      ]);
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
      serviceLifeYears: num(candidate.serviceLifeYears) || null,
      serviceLifeWarning: candidate.serviceLifeYears
        ? null
        : `Норматив не задан; ориентировочная подсказка: ${inferServiceLifeYears(candidate.name)} г.`,
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
        serviceLifeWarning:
          kit.serviceLifeYears == null
            ? `Норматив не задан; ориентировочная подсказка: ${inferServiceLifeYears(kit.model.name)} г.`
            : null,
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

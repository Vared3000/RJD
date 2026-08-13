import { Op } from 'sequelize';
import { ApiError } from '../../../utils/api-error.js';
import { models, sequelize } from '../../../database/models/index.js';
import { printFormSettingsService } from '../settings/print-form-settings.service.js';
import { monthlyRentalRepository } from './monthly-rental-act.repository.js';
import {
  generateMonthlyRentalExcel,
  generateMonthlyRentalPdf,
} from './monthly-rental-act.mapper.js';

const round = (value) => Number(Number(value ?? 0).toFixed(4));
const dateText = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export function resolveMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month ?? ''))) {
    throw ApiError.badRequest('Укажите календарный месяц в формате ГГГГ-ММ');
  }
  const [year, number] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {
    month,
    monthStart: `${month}-01`,
    monthEnd: `${month}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
}

function daysInclusive(from, to) {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  );
}

function sourceReference(source) {
  return [source.sourceFile, source.sheetName, source.rowNumber]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' · ');
}

function archiveRows(sources, period, liveRows) {
  const liveCounts = new Map();
  for (const row of liveRows) {
    const key = [row.personnelNumber || row.employeeName, row.modelName]
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      )
      .join('\0');
    liveCounts.set(key, (liveCounts.get(key) ?? 0) + 1);
  }
  const seen = new Set();
  const rows = [];
  for (const source of sources) {
    const candidate = source.payload;
    const employeeName = candidate.employee?.fullName ?? '';
    const personnelNumber = candidate.employee?.personnelNumber ?? '';
    const key = [personnelNumber || employeeName, candidate.name]
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      )
      .join('\0');
    const quantity = Math.max(1, Number(candidate.quantity ?? 1));
    const strictKey = `${key}\0${candidate.effectiveDate}\0${quantity}\0${candidate.priceWithoutVat}`;
    if (!employeeName || seen.has(strictKey)) continue;
    seen.add(strictKey);
    const archiveOnlyQuantity = Math.max(0, quantity - (liveCounts.get(key) ?? 0));
    const monthlyPriceWithoutVat = round(candidate.priceWithoutVat);
    const vatRate = round(candidate.vatRate ?? 5);
    for (let index = 0; index < archiveOnlyQuantity; index += 1) {
      rows.push({
        employeeId: null,
        employeeName,
        personnelNumber,
        positionName: candidate.position ?? '',
        instanceId: null,
        inventoryNumber: '',
        modelId: null,
        modelName: candidate.name ?? '',
        unit: candidate.unit ?? 'шт.',
        sizeValue: candidate.size ?? '',
        heightValue: candidate.height ?? '',
        issuedDate: null,
        returnedDate: null,
        intervalStart: period.monthStart,
        intervalEnd: period.monthEnd,
        rentalDays: period.daysInMonth,
        monthlyPriceWithoutVat,
        vatRate,
        dataSource: 'archive',
        dataSourceLabel: 'Архивный импорт',
        sourceReference: sourceReference(source),
        warnings: [
          'В архиве нет точного интервала владения и инвентарного номера; учтён полный месяц.',
        ],
      });
    }
  }
  return rows;
}

export function calculateMonthlyRentalRows(rows, daysInMonth) {
  return rows.map((source) => {
    const rentalDays =
      source.rentalDays ??
      daysInclusive(dateText(source.intervalStart), dateText(source.intervalEnd));
    const monthlyPriceWithoutVat = round(source.monthlyPriceWithoutVat);
    const vatRate = round(source.vatRate ?? 5);
    const costWithoutVat = round((monthlyPriceWithoutVat * rentalDays) / daysInMonth);
    const vatAmount = round((costWithoutVat * vatRate) / 100);
    const totalWithVat = round(costWithoutVat + vatAmount);
    const warnings = [...(source.warnings ?? [])];
    if (!source.inventoryNumber) warnings.push('Не указан инвентарный номер.');
    if (!source.monthlyPriceWithoutVat) warnings.push('Не найдена цена аренды на конец месяца.');
    if (rentalDays < 1 || rentalDays > daysInMonth)
      warnings.push('Некорректный интервал владения.');
    return {
      ...source,
      issuedDate: source.issuedDate ? dateText(source.issuedDate) : null,
      returnedDate: source.returnedDate ? dateText(source.returnedDate) : null,
      intervalStart: dateText(source.intervalStart),
      intervalEnd: dateText(source.intervalEnd),
      rentalDays,
      monthlyPriceWithoutVat,
      vatRate,
      costWithoutVat,
      vatAmount,
      totalWithVat,
      warnings: [...new Set(warnings)],
    };
  });
}

function totals(rows) {
  return {
    costWithoutVat: round(rows.reduce((sum, row) => sum + row.costWithoutVat, 0)),
    vatAmount: round(rows.reduce((sum, row) => sum + row.vatAmount, 0)),
    totalWithVat: round(rows.reduce((sum, row) => sum + row.totalWithVat, 0)),
  };
}

async function dpoSnapshotAt(dpoId, asOf) {
  const current = await monthlyRentalRepository.findDpo(dpoId);
  if (!current) throw ApiError.notFound('ДПО не найдено');
  const snapshot = current.toJSON();
  const history = await models.DpoHistory.findAll({
    where: { dpoId, changedAt: { [Op.gt]: new Date(`${asOf}T23:59:59.999Z`) } },
    order: [['changedAt', 'DESC']],
  });
  for (const entry of history) Object.assign(snapshot, entry.previousData);
  return snapshot;
}

async function build(dpoId, month) {
  const period = resolveMonth(month);
  const dpo = await dpoSnapshotAt(dpoId, period.monthEnd);
  const [live, archive, parties] = await Promise.all([
    monthlyRentalRepository.findOwnershipRows({ dpoId, ...period }),
    monthlyRentalRepository.findArchiveRows({ dpoName: dpo.name, ...period }),
    printFormSettingsService.snapshotAt(period.monthEnd),
  ]);
  const sourceRows = live.map((row) => ({
    ...row,
    returnedDate:
      row.returnedDate &&
      dateText(row.returnedDate) >= period.monthStart &&
      dateText(row.returnedDate) <= period.monthEnd
        ? row.returnedDate
        : null,
    dataSource: 'live',
    dataSourceLabel: 'Учётная система',
    sourceReference: row.issuanceNumber,
    warnings: [],
  }));
  sourceRows.push(...archiveRows(archive, period, sourceRows));
  const rows = calculateMonthlyRentalRows(sourceRows, period.daysInMonth).sort(
    (left, right) =>
      left.employeeName.localeCompare(right.employeeName, 'ru') ||
      left.modelName.localeCompare(right.modelName, 'ru'),
  );
  const employeeGroups = Object.values(
    rows.reduce((groups, row) => {
      const key = row.employeeId ?? `${row.employeeName}:${row.personnelNumber}`;
      groups[key] ??= {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        personnelNumber: row.personnelNumber,
        rows: [],
      };
      groups[key].rows.push(row);
      return groups;
    }, {}),
  ).map((group) => ({ ...group, totals: totals(group.rows) }));
  return {
    form: 'monthly-rental',
    title: 'Ежемесячный акт аренды форменной одежды',
    reportMonth: period.monthStart,
    month: period.month,
    from: period.monthStart,
    to: period.monthEnd,
    daysInMonth: period.daysInMonth,
    calculationRule: 'Месячная ставка × дни аренды / число календарных дней месяца',
    dpo,
    parties,
    rows,
    employeeGroups,
    totals: totals(rows),
    warnings: [...new Set(rows.flatMap((row) => row.warnings))],
    generatedAt: new Date().toISOString(),
    dataSources: [...new Set(rows.map((row) => row.dataSourceLabel))],
  };
}

async function getOrCreate(dpoId, month, userId) {
  const period = resolveMonth(month);
  const existing = await monthlyRentalRepository.findAct(dpoId, period.monthStart);
  if (existing) return { act: existing, snapshot: existing.snapshot };
  const snapshot = await build(dpoId, month);
  try {
    const act = await sequelize.transaction((transaction) =>
      monthlyRentalRepository.createAct(
        {
          dpoId,
          reportMonth: period.monthStart,
          snapshot,
          generatedAt: new Date(),
          generatedByUserId: userId,
        },
        { transaction },
      ),
    );
    return { act, snapshot };
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    const act = await monthlyRentalRepository.findAct(dpoId, period.monthStart);
    return { act, snapshot: act.snapshot };
  }
}

// Задача 22 ("Связь с актами"): вызывается из issuance.service.js#revise()
// внутри той же транзакции, что и сама редакция — только помечает уже
// существующие акты как устаревшие, ничего не пересчитывает (пересчёт и
// версионирование — задача 24) и ничего не создаёт, если акта ещё нет.
// Строки Выдачи не хранят свой employeeId/documentDate (это поля шапки,
// общие для всех строк), поэтому достаточно одной пары "было"/"стало" на
// весь документ, без обхода строк.
export async function flagStaleForIssuanceRevision({ before, after }, { transaction } = {}) {
  const candidates = [before, after].filter(
    (candidate) => candidate.employeeId && candidate.documentDate,
  );
  const seen = new Set();
  for (const candidate of candidates) {
    const reportMonth = `${String(candidate.documentDate).slice(0, 7)}-01`;
    const dpoRows = await monthlyRentalRepository.findAssignedDpoIds(
      { employeeId: candidate.employeeId, onDate: candidate.documentDate },
      { transaction },
    );
    for (const { dpoId } of dpoRows) {
      const key = `${dpoId}:${reportMonth}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await monthlyRentalRepository.markStale(
        { dpoId, reportMonth, reason: 'Изменена проведённая выдача, затрагивающая этот период' },
        { transaction },
      );
    }
  }
}

export const monthlyRentalService = {
  async preview({ dpoId, month }) {
    if (!dpoId) throw ApiError.badRequest('Выберите ДПО');
    const period = resolveMonth(month);
    const existing = await monthlyRentalRepository.findAct(dpoId, period.monthStart);
    if (existing) return { ...existing.snapshot, actId: existing.id, finalized: true };
    return { ...(await build(dpoId, month)), actId: null, finalized: false };
  },

  async generate({ dpoId, month, format, userId }) {
    if (!dpoId) throw ApiError.badRequest('Выберите ДПО');
    const { act, snapshot } = await getOrCreate(dpoId, month, userId);
    const data = { ...snapshot, actId: act.id, finalized: true };
    const buffer =
      format === 'pdf'
        ? await generateMonthlyRentalPdf(data)
        : await generateMonthlyRentalExcel(data);
    return {
      buffer,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `monthly-rental_${data.month}_${data.dpo.name}.${format}`,
    };
  },
};

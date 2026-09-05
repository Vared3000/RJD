import { Op } from 'sequelize';
import { createHash } from 'node:crypto';
import { ApiError } from '../../../utils/api-error.js';
import { models, sequelize } from '../../../database/models/index.js';
import { printFormSettingsService } from '../settings/print-form-settings.service.js';
import { monthlyRentalRepository } from './monthly-rental-act.repository.js';
import {
  generateMonthlyRentalExcel,
  generateMonthlyRentalPdf,
} from './monthly-rental-act.mapper.js';
import { floorMoney } from '../shared/money.js';
import { buildExportFileName } from '../../../utils/export-file-name.js';
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
    const monthlyPriceWithoutVat = floorMoney(candidate.priceWithoutVat);
    const vatRate = Number(candidate.vatRate ?? 5);
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
    const monthlyPriceWithoutVat = floorMoney(source.monthlyPriceWithoutVat);
    const vatRate = Number(source.vatRate ?? 5);
    const costWithoutVat = floorMoney((monthlyPriceWithoutVat * rentalDays) / daysInMonth);
    const vatAmount = floorMoney((costWithoutVat * vatRate) / 100);
    const totalWithVat = floorMoney(costWithoutVat + vatAmount);
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
    costWithoutVat: floorMoney(rows.reduce((sum, row) => sum + row.costWithoutVat, 0)),
    vatAmount: floorMoney(rows.reduce((sum, row) => sum + row.vatAmount, 0)),
    totalWithVat: floorMoney(rows.reduce((sum, row) => sum + row.totalWithVat, 0)),
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

async function finalizeVersion(dpoId, month, userId, permissions = [], reason = null) {
  const period = resolveMonth(month);
  const existing = await monthlyRentalRepository.findAct(dpoId, period.monthStart);
  if (existing && !existing.isStale) {
    const version = await monthlyRentalRepository.findVersion(
      existing.id,
      existing.currentVersionNumber,
    );
    return { act: existing, version, snapshot: existing.snapshot, isNewVersion: false };
  }

  if (existing?.isStale && !permissions.includes('admin.manage')) {
    throw ApiError.forbidden('Повторно зафиксировать закрытый месяц может только администратор');
  }

  const snapshot = await build(dpoId, month);
  try {
    return await sequelize.transaction(async (transaction) => {
      const locked = await monthlyRentalRepository.findActLocked(dpoId, period.monthStart, {
        transaction,
      });
      const generatedAt = new Date();

      if (!locked) {
        const act = await monthlyRentalRepository.createAct(
          {
            dpoId,
            reportMonth: period.monthStart,
            snapshot,
            currentVersionNumber: 1,
            generatedAt,
            generatedByUserId: userId,
          },
          { transaction },
        );
        const version = await monthlyRentalRepository.createVersion(
          {
            actId: act.id,
            versionNumber: 1,
            snapshot,
            reason,
            generatedAt,
            generatedByUserId: userId,
          },
          { transaction },
        );
        return { act, version, snapshot, isNewVersion: true };
      }

      if (!locked.isStale) {
        const version = await models.MonthlyRentalActVersion.findOne({
          where: { actId: locked.id, versionNumber: locked.currentVersionNumber },
          transaction,
        });
        return { act: locked, version, snapshot: locked.snapshot, isNewVersion: false };
      }

      const versionNumber = locked.currentVersionNumber + 1;
      const version = await monthlyRentalRepository.createVersion(
        {
          actId: locked.id,
          versionNumber,
          snapshot,
          reason: reason || locked.staleReason,
          generatedAt,
          generatedByUserId: userId,
        },
        { transaction },
      );
      await monthlyRentalRepository.updateCurrentVersion(
        locked.id,
        { snapshot, versionNumber, generatedAt, generatedByUserId: userId },
        { transaction },
      );
      return { act: locked, version, snapshot, isNewVersion: true };
    });
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    const act = await monthlyRentalRepository.findAct(dpoId, period.monthStart);
    const version = await monthlyRentalRepository.findVersion(act.id, act.currentVersionNumber);
    return { act, version, snapshot: act.snapshot, isNewVersion: false };
  }
}

function versionFileName(snapshot, versionNumber, format) {
  return buildExportFileName({
    title: 'Акт аренды',
    objects: [snapshot.dpo.name],
    month: snapshot.month,
    version: versionNumber,
    extension: format,
  });
}

async function renderAndStoreVersion(version, snapshot, format) {
  const storedData = format === 'pdf' ? version.pdfFileData : version.excelFileData;
  if (storedData) {
    return {
      buffer: Buffer.from(storedData),
      // Старые версии могли сохранить техническое английское имя. Содержимое
      // неизменно, но при каждом скачивании имя строится по актуальному правилу.
      fileName: versionFileName(snapshot, version.versionNumber, format),
    };
  }

  const buffer =
    format === 'pdf'
      ? await generateMonthlyRentalPdf(snapshot)
      : await generateMonthlyRentalExcel(snapshot);
  const fileName = versionFileName(snapshot, version.versionNumber, format);
  await monthlyRentalRepository.updateVersionFile(version.id, format, {
    fileName,
    fileData: buffer,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  });
  return { buffer, fileName };
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
    if (existing) {
      const [preview, versions] = await Promise.all([
        existing.isStale ? build(dpoId, month) : Promise.resolve(existing.snapshot),
        monthlyRentalRepository.listVersions(existing.id),
      ]);
      return {
        ...preview,
        actId: existing.id,
        finalized: true,
        versionNumber: existing.currentVersionNumber,
        isStale: existing.isStale,
        staleReason: existing.staleReason,
        staleAt: existing.staleAt,
        needsNewVersion: existing.isStale,
        versions,
      };
    }
    return {
      ...(await build(dpoId, month)),
      actId: null,
      finalized: false,
      versionNumber: null,
      isStale: false,
      needsNewVersion: false,
      versions: [],
    };
  },

  async generate({ dpoId, month, format, userId, permissions, reason }) {
    if (!dpoId) throw ApiError.badRequest('Выберите ДПО');
    const { act, version, snapshot, isNewVersion } = await finalizeVersion(
      dpoId,
      month,
      userId,
      permissions,
      reason,
    );
    const data = {
      ...snapshot,
      actId: act.id,
      finalized: true,
      versionNumber: version.versionNumber,
    };
    let rendered;
    if (isNewVersion) {
      const [excel, pdf] = await Promise.all([
        renderAndStoreVersion(version, data, 'xlsx'),
        renderAndStoreVersion(version, data, 'pdf'),
      ]);
      rendered = format === 'pdf' ? pdf : excel;
    } else {
      rendered = await renderAndStoreVersion(version, data, format);
    }
    const { buffer, fileName } = rendered;
    return {
      buffer,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
    };
  },

  async downloadVersion({ actId, versionNumber, format }) {
    const act = await monthlyRentalRepository.findActById(actId);
    if (!act) throw ApiError.notFound('Ежемесячный акт не найден');
    const version = await monthlyRentalRepository.findVersion(actId, versionNumber);
    if (!version) throw ApiError.notFound('Версия ежемесячного акта не найдена');
    const data = {
      ...version.snapshot,
      actId: act.id,
      finalized: true,
      versionNumber: version.versionNumber,
    };
    const { buffer, fileName } = await renderAndStoreVersion(version, data, format);
    return {
      buffer,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
    };
  },
};

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { models, sequelize } from './models/index.js';
import { parsePositionVariant } from '../modules/catalogs/positions/normalize-position-name.js';

const inputPath = process.argv.slice(2).find((argument) => argument !== '--');
if (!inputPath) {
  console.error('Usage: pnpm --filter @workwear/server import:rzd -- <extracted-json>');
  process.exit(2);
}

const BATCH_SIZE = 250;
const EMPLOYEE_SIZE_FIELD = {
  clothing: 'clothingSizeId',
  height: 'heightSizeId',
  shoe: 'shoeSizeId',
  headwear: 'headwearSizeId',
  belt: 'beltSizeId',
  gloves: 'glovesSizeId',
};
const NON_PERSON_EMPLOYEE_RE = /^(?:начальник|претензи|настоящий|сохранн)/i;

function chunks(values, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function asText(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
}

function positiveMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(4) : null;
}

function inferServiceLifeYears(name) {
  const value = String(name ?? '').toLowerCase();
  if (/пальто|плащ|куртка/.test(value)) return 4;
  if (/головн|шапк|кепк|перчат|вареж|ремень|сумк/.test(value)) return 3;
  if (/бейдж|зажим/.test(value)) return 1;
  return 2;
}

function fileSourceKey(fileHash) {
  return crypto.createHash('sha256').update(`${fileHash}:file`, 'utf8').digest('hex');
}

function pageSourceKey(fileHash, pageNumber) {
  return crypto.createHash('sha256').update(`${fileHash}:page:${pageNumber}`, 'utf8').digest('hex');
}

async function upsertSourceRecords(data, transaction) {
  const records = [];
  const knownKeys = new Set();
  const fileHashByPath = new Map();

  for (const file of data.files) {
    fileHashByPath.set(file.path, file.hash);
    const fileKey = fileSourceKey(file.hash);
    knownKeys.add(fileKey);
    records.push({
      sourceKey: fileKey,
      sourceFile: file.path,
      fileHash: file.hash,
      recordType: 'file',
      payload: {
        size: file.size,
        extension: file.extension,
        metadataOnly: Boolean(file.metadataOnly),
        parseError: file.parseError ?? null,
      },
    });

    for (const sheet of file.sheets ?? []) {
      for (const row of sheet.rows) {
        const key = crypto
          .createHash('sha256')
          .update(`${file.hash}:sheet:${sheet.name}:row:${row.rowNumber}`, 'utf8')
          .digest('hex');
        knownKeys.add(key);
        records.push({
          sourceKey: key,
          sourceFile: file.path,
          fileHash: file.hash,
          recordType: 'spreadsheet_row',
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          payload: { values: row.values, formulas: row.formulas },
        });
      }
    }

    for (const page of file.pages ?? []) {
      const key = pageSourceKey(file.hash, page.pageNumber);
      knownKeys.add(key);
      records.push({
        sourceKey: key,
        sourceFile: file.path,
        fileHash: file.hash,
        recordType: 'pdf_page',
        pageNumber: page.pageNumber,
        payload: { text: page.text },
      });
    }
  }

  // A personal card can be represented by several merged rows. It gets a
  // synthetic normalized-candidate record while the original rows remain intact.
  for (const candidate of data.candidates) {
    let candidateRecordKey = candidate.sourceKey;
    if (knownKeys.has(candidateRecordKey)) {
      const discriminator =
        candidate.name ?? candidate.fullName ?? candidate.dpo ?? candidate.sheetName ?? '';
      candidateRecordKey = crypto
        .createHash('sha256')
        .update(`${candidate.sourceKey}:normalized:${candidate.type}:${discriminator}`, 'utf8')
        .digest('hex');
    }
    if (knownKeys.has(candidateRecordKey)) continue;
    const fileHash = fileHashByPath.get(candidate.sourceFile);
    if (!fileHash) throw new Error(`Unknown candidate source file: ${candidate.sourceFile}`);
    knownKeys.add(candidateRecordKey);
    records.push({
      sourceKey: candidateRecordKey,
      sourceFile: candidate.sourceFile,
      fileHash,
      recordType: 'normalized_candidate',
      sheetName: candidate.sheetName ?? null,
      rowNumber: candidate.rowNumber ?? null,
      payload: candidate,
    });
  }

  for (const batch of chunks(records)) {
    await models.SourceImportRecord.bulkCreate(batch, {
      transaction,
      updateOnDuplicate: [
        'sourceFile',
        'fileHash',
        'recordType',
        'sheetName',
        'pageNumber',
        'rowNumber',
        'payload',
        'updatedAt',
      ],
    });
  }

  // Нормализованные записи производны от исходных строк. Удаляем только
  // устаревшие производные записи текущего набора файлов, если правила
  // распознавания стали точнее; оригинальные строки и страницы не трогаем.
  const existingDerived = await models.SourceImportRecord.findAll({
    where: {
      recordType: 'normalized_candidate',
      fileHash: { [Op.in]: [...new Set(fileHashByPath.values())] },
    },
    attributes: ['id', 'sourceKey'],
    raw: true,
    transaction,
  });
  const staleDerivedIds = existingDerived
    .filter((record) => !knownKeys.has(record.sourceKey))
    .map((record) => record.id);
  for (const batch of chunks(staleDerivedIds, 1000)) {
    await models.SourceImportRecord.destroy({
      where: { id: { [Op.in]: batch } },
      transaction,
    });
  }

  const idByKey = new Map();
  for (const keyBatch of chunks([...knownKeys], 1000)) {
    const rows = await models.SourceImportRecord.findAll({
      where: { sourceKey: { [Op.in]: keyBatch } },
      attributes: ['id', 'sourceKey'],
      raw: true,
      transaction,
    });
    for (const row of rows) idByKey.set(row.sourceKey, row.id);
  }
  return { recordCount: records.length, idByKey };
}

async function findOrCreateNamed(Model, name, defaults, transaction) {
  const [record] = await Model.findOrCreate({
    where: { name },
    defaults,
    transaction,
  });
  if (record.archivedAt) await record.update({ archivedAt: null }, { transaction });
  return record;
}

async function importNormalized(data, sourceIdByKey, transaction) {
  const organization = await findOrCreateNamed(
    models.Organization,
    'ОАО «РЖД»',
    {
      name: 'ОАО «РЖД»',
      fullName: 'Открытое акционерное общество «Российские железные дороги»',
    },
    transaction,
  );
  await organization.update(
    {
      fullName: 'Открытое акционерное общество «Российские железные дороги»',
      inn: '7708503727',
      kpp: '997650001',
      address:
        '107174, г. Москва, вн.тер. г. муниципальный округ Басманный, ул. Новая Басманная, д. 2/1, стр. 1',
    },
    { transaction },
  );

  const dpoByName = new Map();
  for (const name of data.knownDpos) {
    const dpo = await findOrCreateNamed(
      models.Dpo,
      name,
      { name, fullName: name.replace(/\s+ДПО$/, ' дирекция пассажирских обустройств') },
      transaction,
    );
    dpoByName.set(name, dpo);
  }

  const dpoCandidates = data.candidates.filter((item) => item.type === 'dpo');
  const dpoFields = [
    'fullName',
    'address',
    'okpo',
    'businessUnitCode',
    'directorFullName',
    'directorBasis',
    'contractNumber',
    'contractDate',
    'additionalAgreementNumber',
    'additionalAgreementDate',
  ];
  for (const candidate of dpoCandidates) {
    const dpo = dpoByName.get(candidate.dpo);
    if (!dpo) continue;
    const genericFullName = dpo.name.replace(/\s+ДПО$/, ' дирекция пассажирских обустройств');
    const patch = {};
    for (const field of dpoFields) {
      const value = asText(candidate[field], field.includes('Date') ? 10 : 500);
      if (!value) continue;
      if (field === 'fullName') {
        if (!dpo.fullName || dpo.fullName === genericFullName || dpo.fullName === dpo.name) {
          patch.fullName = value;
        }
      } else if (!dpo[field]) {
        patch[field] = value;
      }
    }
    if (Object.keys(patch).length > 0) {
      await dpo.update(patch, { transaction });
    }
  }

  const nomenclatureCandidates = data.candidates.filter((item) => item.type === 'nomenclature');
  const employeeCandidates = data.candidates.filter((item) => item.type === 'employee');

  const positions = new Set();
  for (const candidate of data.candidates) {
    const position = parsePositionVariant(asText(candidate.position, 255)).name;
    if (position && !/^(должность|итого|всего)/i.test(position)) positions.add(position);
  }
  const positionByName = new Map();
  for (const name of [...positions].sort((a, b) => a.localeCompare(b, 'ru'))) {
    positionByName.set(name, await findOrCreateNamed(models.Position, name, { name }, transaction));
  }

  const modelByName = new Map();
  const modelCandidateByName = new Map();
  for (const candidate of nomenclatureCandidates) {
    const name = asText(candidate.name, 255);
    if (name && !modelCandidateByName.has(name)) modelCandidateByName.set(name, candidate);
  }
  for (const [name, candidate] of [...modelCandidateByName].sort(([a], [b]) =>
    a.localeCompare(b, 'ru'),
  )) {
    const [model, created] = await models.NomenclatureModel.findOrCreate({
      where: { name },
      defaults: {
        name,
        article: asText(candidate.article, 64),
        unit: asText(candidate.unit, 16) ?? 'шт.',
        sizeType: candidate.sizeType ?? null,
        requiresHeightSize: Boolean(candidate.requiresHeightSize),
      },
      transaction,
    });
    if (!created) {
      const patch = { archivedAt: null };
      if (!model.article && candidate.article) patch.article = asText(candidate.article, 64);
      if (!model.sizeType && candidate.sizeType) patch.sizeType = candidate.sizeType;
      if (!model.requiresHeightSize && candidate.requiresHeightSize)
        patch.requiresHeightSize = true;
      if ((!model.unit || model.unit === 'шт') && candidate.unit) {
        patch.unit = asText(candidate.unit, 16);
      }
      await model.update(patch, { transaction });
    }
    modelByName.set(name, model);
  }

  const measurementValues = new Map();
  for (const candidate of employeeCandidates) {
    for (const [sizeType, values] of Object.entries(candidate.measurements ?? {})) {
      if (!EMPLOYEE_SIZE_FIELD[sizeType]) continue;
      for (const rawValue of values) {
        const value = asText(rawValue, 32);
        if (value) measurementValues.set(`${sizeType}\u0000${value}`, { sizeType, value });
      }
    }
  }
  const sizeByTypeValue = new Map();
  for (const { sizeType, value } of measurementValues.values()) {
    const [size] = await models.Size.findOrCreate({
      where: { type: sizeType, value },
      defaults: { type: sizeType, value, sortOrder: Number.parseFloat(value) || 0 },
      transaction,
    });
    if (size.archivedAt) await size.update({ archivedAt: null }, { transaction });
    sizeByTypeValue.set(`${sizeType}\u0000${value}`, size);
  }

  const employeeByNaturalKey = new Map();
  const measurementRows = [];
  for (const candidate of employeeCandidates) {
    const fullName = asText(candidate.fullName, 255);
    if (!fullName) continue;
    const personnelNumber = asText(candidate.personnelNumber, 64);
    const dpo = candidate.dpo ? dpoByName.get(candidate.dpo) : null;
    const naturalKey = personnelNumber
      ? `personnel:${personnelNumber}`
      : `name:${fullName}\u0000${dpo?.id ?? ''}`;
    let employee = employeeByNaturalKey.get(naturalKey);
    if (!employee) {
      employee = personnelNumber
        ? await models.Employee.findOne({ where: { personnelNumber }, transaction })
        : await models.Employee.findOne({
            where: { fullName, organizationId: organization.id, dpoId: dpo?.id ?? null },
            transaction,
          });
    }

    const primarySizes = {};
    for (const [sizeType, values] of Object.entries(candidate.measurements ?? {})) {
      const field = EMPLOYEE_SIZE_FIELD[sizeType];
      if (!field) continue;
      const firstValue = asText(values?.[0], 32);
      const size = firstValue ? sizeByTypeValue.get(`${sizeType}\u0000${firstValue}`) : null;
      if (size) primarySizes[field] = size.id;
    }
    const position = candidate.position
      ? positionByName.get(parsePositionVariant(asText(candidate.position, 255)).name)
      : null;
    const incoming = {
      organizationId: organization.id,
      dpoId: dpo?.id ?? null,
      positionId: position?.id ?? null,
      fullName,
      personnelNumber,
      phone: asText(candidate.phone, 32),
      hireDate: candidate.hireDate ?? null,
      terminationDate: candidate.terminationDate ?? null,
      ...primarySizes,
    };

    if (!employee) {
      employee = await models.Employee.create(incoming, { transaction });
    } else {
      const patch = { archivedAt: null };
      for (const [field, value] of Object.entries(incoming)) {
        const authoritativeCardSize =
          candidate.formType === 'personal-card' &&
          Object.values(EMPLOYEE_SIZE_FIELD).includes(field);
        if (
          value != null &&
          (employee[field] == null || field === 'fullName' || authoritativeCardSize)
        )
          patch[field] = value;
      }
      await employee.update(patch, { transaction });
    }
    employeeByNaturalKey.set(naturalKey, employee);

    const sourceRecordId = sourceIdByKey.get(candidate.sourceKey);
    if (!sourceRecordId) throw new Error(`Source record not found: ${candidate.sourceKey}`);
    for (const [sizeType, values] of Object.entries(candidate.measurements ?? {})) {
      if (!EMPLOYEE_SIZE_FIELD[sizeType]) continue;
      for (const rawValue of values) {
        const value = asText(rawValue, 32);
        if (value) {
          measurementRows.push({ employeeId: employee.id, sourceRecordId, sizeType, value });
        }
      }
    }
  }

  // Ранние версии распознавания принимали подписи вроде «Начальник ...» и
  // «Настоящий Акт Сторон» за ФИО. Они не удаляются физически, а скрываются
  // из рабочих списков; настоящие работники без табельного номера остаются.
  const employeesWithoutPersonnel = await models.Employee.findAll({
    where: {
      organizationId: organization.id,
      personnelNumber: null,
    },
    attributes: ['id', 'fullName', 'archivedAt'],
    transaction,
  });
  for (const employee of employeesWithoutPersonnel) {
    if (NON_PERSON_EMPLOYEE_RE.test(employee.fullName) && !employee.archivedAt) {
      await employee.update({ archivedAt: new Date() }, { transaction });
    }
  }

  for (const batch of chunks(measurementRows)) {
    await models.EmployeeMeasurement.bulkCreate(batch, {
      transaction,
      ignoreDuplicates: true,
    });
  }

  const kitQuantityByKey = new Map();
  const priceRows = [];
  const gendersByPositionModel = new Map();
  for (const candidate of nomenclatureCandidates) {
    const positionVariant = parsePositionVariant(asText(candidate.position, 255));
    const modelName = asText(candidate.name, 255);
    const quantity = Math.trunc(Number(candidate.quantity));
    if (
      !positionVariant.name ||
      !positionVariant.gender ||
      !modelName ||
      candidate.formType === 'fpu-26' ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      continue;
    }
    const key = `${positionVariant.name}\u0000${modelName}`;
    const genders = gendersByPositionModel.get(key) ?? new Set();
    genders.add(positionVariant.gender);
    gendersByPositionModel.set(key, genders);
  }

  for (const candidate of nomenclatureCandidates) {
    const model = modelByName.get(asText(candidate.name, 255));
    if (!model) continue;
    const positionVariant = parsePositionVariant(asText(candidate.position, 255));
    const position = candidate.position ? positionByName.get(positionVariant.name) : null;
    const quantity = Math.trunc(Number(candidate.quantity));
    // ФПУ-26 — акт с суммарным количеством по позиции за период по всей ДПО
    // (сколько единиц реально отгружено/оплачено), а не норма на одного
    // работника — отсюда бывали дикие "quantity" вида 98 на позицию комплекта.
    // Норму на одного работника даёт только Прил. 1.7/личная карточка
    // (per-employee строки, formType !== 'fpu-26').
    if (position && candidate.formType !== 'fpu-26' && Number.isFinite(quantity) && quantity > 0) {
      const sourceGenders = gendersByPositionModel.get(
        `${positionVariant.name}\u0000${model.name}`,
      );
      const gender = sourceGenders?.size > 1 ? null : positionVariant.gender;
      const key = `${position.id}\u0000${model.id}\u0000${gender ?? ''}`;
      const importedServiceLife = Math.trunc(Number(candidate.serviceLifeYears));
      kitQuantityByKey.set(key, {
        positionId: position.id,
        modelId: model.id,
        gender,
        quantity: Math.max(quantity, kitQuantityByKey.get(key)?.quantity ?? 0),
        serviceLifeYears:
          Number.isFinite(importedServiceLife) && importedServiceLife > 0
            ? importedServiceLife
            : inferServiceLifeYears(model.name),
      });
    }

    const priceWithoutVat = positiveMoney(candidate.priceWithoutVat);
    const sourceRecordId = sourceIdByKey.get(candidate.sourceKey);
    if (!priceWithoutVat || !sourceRecordId) continue;
    const priceWithVat = positiveMoney(candidate.priceWithVat);
    let vatRate = null;
    if (priceWithVat && Number(priceWithoutVat) > 0) {
      const derived = (Number(priceWithVat) / Number(priceWithoutVat) - 1) * 100;
      if (derived >= 0 && derived <= 30) vatRate = derived.toFixed(4);
    }
    priceRows.push({
      modelId: model.id,
      dpoId: candidate.dpo ? (dpoByName.get(candidate.dpo)?.id ?? null) : null,
      sourceRecordId,
      effectiveDate: candidate.effectiveDate ?? null,
      priceWithoutVat,
      vatRate,
      priceWithVat,
    });
  }

  for (const item of kitQuantityByKey.values()) {
    const [record, created] = await models.PositionKitItem.findOrCreate({
      where: {
        positionId: item.positionId,
        modelId: item.modelId,
        season: null,
        gender: item.gender,
      },
      defaults: item,
      transaction,
    });
    if (
      !created &&
      (record.archivedAt ||
        record.quantity !== item.quantity ||
        record.serviceLifeYears !== item.serviceLifeYears)
    ) {
      await record.update(
        {
          quantity: item.quantity,
          serviceLifeYears: item.serviceLifeYears,
          archivedAt: null,
        },
        { transaction },
      );
    }
  }
  for (const batch of chunks(priceRows)) {
    await models.NomenclaturePrice.bulkCreate(batch, {
      transaction,
      updateOnDuplicate: [
        'modelId',
        'dpoId',
        'effectiveDate',
        'priceWithoutVat',
        'vatRate',
        'priceWithVat',
        'updatedAt',
      ],
    });
  }
  const latestRentalPriceByModel = new Map();
  for (const price of priceRows) {
    const current = latestRentalPriceByModel.get(price.modelId);
    if (!current || String(price.effectiveDate ?? '') >= String(current.effectiveDate ?? '')) {
      latestRentalPriceByModel.set(price.modelId, price);
    }
  }
  for (const [modelId, price] of latestRentalPriceByModel) {
    await models.NomenclatureModel.update(
      { rentalPrice: price.priceWithoutVat, rentalVatRate: price.vatRate ?? 5 },
      { where: { id: modelId }, transaction },
    );
  }

  return {
    dpos: dpoByName.size,
    dpoDetails: dpoCandidates.length,
    positions: positionByName.size,
    models: modelByName.size,
    employees: new Set([...employeeByNaturalKey.values()].map((item) => item.id)).size,
    sizes: sizeByTypeValue.size,
    measurements: measurementRows.length,
    kitItems: kitQuantityByKey.size,
    prices: priceRows.length,
  };
}

try {
  const data = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  if (data.formatVersion !== 1) throw new Error(`Unsupported import format: ${data.formatVersion}`);
  if (data.errors?.length) throw new Error(`Extraction contains ${data.errors.length} errors`);

  const result = await sequelize.transaction(async (transaction) => {
    const sources = await upsertSourceRecords(data, transaction);
    const normalized = await importNormalized(data, sources.idByKey, transaction);
    return { sourceRecords: sources.recordCount, ...normalized };
  });
  console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
  await sequelize.close();
} catch (error) {
  console.error(error);
  await sequelize.close();
  process.exit(1);
}

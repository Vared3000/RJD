import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { models, sequelize } from './models/index.js';

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

function chunks(values, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function asText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function positiveMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(4) : null;
}

function fileSourceKey(fileHash) {
  return crypto.createHash('sha256').update(`${fileHash}:file`, 'utf8').digest('hex');
}

function pageSourceKey(fileHash, pageNumber) {
  return crypto
    .createHash('sha256')
    .update(`${fileHash}:page:${pageNumber}`, 'utf8')
    .digest('hex');
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
    if (knownKeys.has(candidate.sourceKey)) continue;
    const fileHash = fileHashByPath.get(candidate.sourceFile);
    if (!fileHash) throw new Error(`Unknown candidate source file: ${candidate.sourceFile}`);
    knownKeys.add(candidate.sourceKey);
    records.push({
      sourceKey: candidate.sourceKey,
      sourceFile: candidate.sourceFile,
      fileHash,
      recordType: 'normalized_candidate',
      sheetName: candidate.sheetName ?? null,
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

  const nomenclatureCandidates = data.candidates.filter((item) => item.type === 'nomenclature');
  const employeeCandidates = data.candidates.filter((item) => item.type === 'employee');

  const positions = new Set();
  for (const candidate of data.candidates) {
    const position = asText(candidate.position, 255);
    if (position && !/^(должность|итого|всего)/i.test(position)) positions.add(position);
  }
  const positionByName = new Map();
  for (const name of [...positions].sort((a, b) => a.localeCompare(b, 'ru'))) {
    positionByName.set(
      name,
      await findOrCreateNamed(models.Position, name, { name }, transaction),
    );
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
        unit: asText(candidate.unit, 16) ?? 'шт.',
        sizeType: candidate.sizeType ?? null,
        requiresHeightSize: Boolean(candidate.requiresHeightSize),
      },
      transaction,
    });
    if (!created) {
      const patch = { archivedAt: null };
      if (!model.sizeType && candidate.sizeType) patch.sizeType = candidate.sizeType;
      if (!model.requiresHeightSize && candidate.requiresHeightSize) patch.requiresHeightSize = true;
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
    const position = candidate.position ? positionByName.get(asText(candidate.position, 255)) : null;
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
        if (value != null && (employee[field] == null || field === 'fullName')) patch[field] = value;
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
  for (const batch of chunks(measurementRows)) {
    await models.EmployeeMeasurement.bulkCreate(batch, {
      transaction,
      ignoreDuplicates: true,
    });
  }

  const kitQuantityByKey = new Map();
  const priceRows = [];
  for (const candidate of nomenclatureCandidates) {
    const model = modelByName.get(asText(candidate.name, 255));
    if (!model) continue;
    const position = candidate.position ? positionByName.get(asText(candidate.position, 255)) : null;
    const quantity = Math.trunc(Number(candidate.quantity));
    if (position && Number.isFinite(quantity) && quantity > 0) {
      const key = `${position.id}\u0000${model.id}`;
      kitQuantityByKey.set(key, {
        positionId: position.id,
        modelId: model.id,
        quantity: Math.max(quantity, kitQuantityByKey.get(key)?.quantity ?? 0),
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
      dpoId: candidate.dpo ? dpoByName.get(candidate.dpo)?.id ?? null : null,
      sourceRecordId,
      effectiveDate: candidate.effectiveDate ?? null,
      priceWithoutVat,
      vatRate,
      priceWithVat,
    });
  }

  for (const item of kitQuantityByKey.values()) {
    const [record, created] = await models.PositionKitItem.findOrCreate({
      where: { positionId: item.positionId, modelId: item.modelId },
      defaults: item,
      transaction,
    });
    if (!created && (record.archivedAt || record.quantity !== item.quantity)) {
      await record.update({ quantity: item.quantity, archivedAt: null }, { transaction });
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

  return {
    dpos: dpoByName.size,
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

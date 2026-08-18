import crypto from 'node:crypto';
import { sequelize, models } from '../../database/models/index.js';
import { ApiError } from '../../utils/api-error.js';
import { parseStartupWorkbook, normalizeText } from './startup-import.parser.js';

const WAREHOUSES = [
  { code: 'INCOMING', name: 'Входящие' },
  { code: 'OLD_RETURN', name: 'Возврат старой формы' },
];
const SIZE_FIELDS = [
  ['clothingSize', 'clothing', 'clothingSizeId'],
  ['heightSize', 'height', 'heightSizeId'],
  ['shoeSize', 'shoe', 'shoeSizeId'],
  ['headwearSize', 'headwear', 'headwearSizeId'],
  ['beltSize', 'belt', 'beltSizeId'],
  ['glovesSize', 'gloves', 'glovesSizeId'],
];

function lower(value) {
  return normalizeText(value).toLocaleLowerCase('ru-RU');
}

function plain(run) {
  const safe = { ...(run.get ? run.get({ plain: true }) : run) };
  delete safe.payload;
  return safe;
}

function same(existing, row, fields) {
  return fields.every((field) => normalizeText(existing[field]) === normalizeText(row[field]));
}

function addDatabaseChecks(parsed, existing) {
  const protocol = [...parsed.protocol];
  const databaseDuplicates = { dpos: 0, models: 0, employees: 0 };
  const dposByName = new Map(existing.dpos.map((item) => [lower(item.name), item]));
  const dposByCode = new Map(
    existing.dpos.filter((item) => item.code).map((item) => [lower(item.code), item]),
  );
  const modelsByName = new Map(existing.models.map((item) => [lower(item.name), item]));
  const modelsByArticle = new Map(
    existing.models.filter((item) => item.article).map((item) => [lower(item.article), item]),
  );
  const employeesByNumber = new Map(
    existing.employees
      .filter((item) => item.personnelNumber)
      .map((item) => [lower(item.personnelNumber), item]),
  );

  for (const row of parsed.payload.dpos) {
    const found = (row.code && dposByCode.get(lower(row.code))) || dposByName.get(lower(row.name));
    if (!found) continue;
    if (
      same(found, row, [
        'name',
        'fullName',
        'code',
        'address',
        'okpo',
        'businessUnitCode',
        'directorFullName',
      ])
    ) {
      databaseDuplicates.dpos += 1;
      protocol.push({
        level: 'warning',
        location: `ДПО, строка ${row.rowNumber}`,
        message: 'Запись уже есть в базе и будет пропущена',
      });
    } else {
      protocol.push({
        level: 'error',
        location: `ДПО, строка ${row.rowNumber}`,
        message: 'Код или наименование уже заняты другой записью в базе',
      });
    }
  }
  for (const row of parsed.payload.models) {
    const found =
      (row.article && modelsByArticle.get(lower(row.article))) || modelsByName.get(lower(row.name));
    if (!found) continue;
    if (
      same(found, row, [
        'name',
        'article',
        'unit',
        'sizeType',
        'requiresHeightSize',
        'description',
      ]) &&
      Number(found.rentalPrice) === Number(row.rentalPrice) &&
      Number(found.rentalVatRate) === Number(row.rentalVatRate)
    ) {
      databaseDuplicates.models += 1;
      protocol.push({
        level: 'warning',
        location: `Номенклатура, строка ${row.rowNumber}`,
        message: 'Запись уже есть в базе и будет пропущена',
      });
    } else {
      protocol.push({
        level: 'error',
        location: `Номенклатура, строка ${row.rowNumber}`,
        message: 'Артикул или наименование уже заняты другой моделью в базе',
      });
    }
  }
  for (const row of parsed.payload.employees) {
    const found = employeesByNumber.get(lower(row.personnelNumber));
    if (!found) continue;
    if (
      same(found, row, ['fullName', 'personnelNumber', 'gender', 'birthDate', 'hireDate', 'phone'])
    ) {
      databaseDuplicates.employees += 1;
      protocol.push({
        level: 'warning',
        location: `Работники, строка ${row.rowNumber}`,
        message: 'Работник уже есть в базе и будет пропущен',
      });
    } else {
      protocol.push({
        level: 'error',
        location: `Работники, строка ${row.rowNumber}`,
        message: 'Табельный номер уже занят другим работником в базе',
      });
    }
  }

  const availableDpos = new Set([
    ...existing.dpos.map((row) => lower(row.name)),
    ...parsed.payload.dpos.map((row) => lower(row.name)),
  ]);
  const availableModels = new Map();
  for (const model of [...existing.models, ...parsed.payload.models])
    availableModels.set(lower(model.name), model);
  for (const row of parsed.payload.employees) {
    if (row.dpoName && !availableDpos.has(lower(row.dpoName))) {
      protocol.push({
        level: 'error',
        location: `Работники, строка ${row.rowNumber}`,
        message: `ДПО «${row.dpoName}» отсутствует в файле и базе`,
      });
    }
  }
  for (const row of parsed.payload.balances) {
    const model = availableModels.get(lower(row.modelName));
    if (!model) {
      protocol.push({
        level: 'error',
        location: `Остатки, строка ${row.rowNumber}`,
        message: `Номенклатура «${row.modelName}» отсутствует в файле и базе`,
      });
      continue;
    }
    if (model.sizeType && !row.size) {
      protocol.push({
        level: 'error',
        location: `Остатки, строка ${row.rowNumber}`,
        message: `Для модели «${row.modelName}» нужен размер`,
      });
    }
    if (model.requiresHeightSize && !row.height) {
      protocol.push({
        level: 'error',
        location: `Остатки, строка ${row.rowNumber}`,
        message: `Для модели «${row.modelName}» нужен рост`,
      });
    }
  }
  return { protocol, databaseDuplicates };
}

async function findOrCreateSize(type, value, transaction) {
  if (!value) return null;
  const [size] = await models.Size.findOrCreate({
    where: { type, value },
    defaults: { type, value, sortOrder: Number.parseInt(value, 10) || 0 },
    transaction,
  });
  return size;
}

async function generateInventoryNumbers(count, transaction) {
  if (count <= 0) return [];
  const [rows] = await sequelize.query(
    "SELECT nextval('instance_inventory_number_seq') AS value FROM generate_series(1, :count)",
    { replacements: { count }, transaction },
  );
  return rows.map((row) => `СО-${String(row.value).padStart(6, '0')}`);
}

async function createOpeningBalances(payload, context, transaction) {
  if (payload.balances.length === 0) return { documents: 0, instances: 0 };
  const [supplier] = await models.Supplier.findOrCreate({
    where: { name: 'Стартовые остатки' },
    defaults: { name: 'Стартовые остатки', fullName: 'Служебный поставщик стартовых остатков' },
    transaction,
  });
  let documentCount = 0;
  let instanceCount = 0;
  for (const warehouse of context.warehouses) {
    const rows = payload.balances.filter((row) => row.warehouseCode === warehouse.code);
    if (rows.length === 0) continue;
    const date = new Date().toISOString().slice(0, 10);
    const number = `СТАРТ-${date.replaceAll('-', '')}-${warehouse.code}`;
    const batch = await models.Batch.create(
      { code: number, supplierId: supplier.id, receivedDate: date, note: 'Стартовые остатки' },
      { transaction },
    );
    const document = await models.ReceivingDocument.create(
      {
        number,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        documentDate: date,
        responsibleUserId: context.userId,
        status: 'posted',
        batchId: batch.id,
        postedAt: new Date(),
        postedByUserId: context.userId,
        note: 'Служебное поступление начальных остатков',
      },
      { transaction },
    );
    const lines = [];
    const instanceSpecs = [];
    for (const [sortOrder, row] of rows.entries()) {
      const model = context.modelsByName.get(lower(row.modelName));
      const size = model.sizeType
        ? await findOrCreateSize(model.sizeType, row.size, transaction)
        : null;
      const heightSize = model.requiresHeightSize
        ? await findOrCreateSize('height', row.height, transaction)
        : null;
      lines.push({
        documentId: document.id,
        modelId: model.id,
        sizeId: size?.id ?? null,
        heightSizeId: heightSize?.id ?? null,
        quantity: row.quantity,
        purchasePrice: 0,
        employeeCost: null,
        vatRate: 0,
        sortOrder,
      });
      for (let index = 0; index < row.quantity; index += 1) {
        instanceSpecs.push({ row, model, size, heightSize });
      }
    }
    await models.ReceivingLine.bulkCreate(lines, { transaction });
    const inventoryNumbers = await generateInventoryNumbers(instanceSpecs.length, transaction);
    const instances = await models.Instance.bulkCreate(
      instanceSpecs.map((spec, index) => ({
        modelId: spec.model.id,
        sizeId: spec.size?.id ?? null,
        heightSizeId: spec.heightSize?.id ?? null,
        batchId: batch.id,
        warehouseId: warehouse.id,
        inventoryNumber: inventoryNumbers[index],
        barcode: null,
        status: 'in_stock',
        condition: spec.row.condition,
        cost: null,
        employeeCost: null,
      })),
      { transaction, returning: true },
    );
    await models.StockMovement.bulkCreate(
      instances.map((instance) => ({
        instanceId: instance.id,
        fromWarehouseId: null,
        toWarehouseId: warehouse.id,
        documentType: 'receiving',
        documentId: document.id,
        occurredAt: date,
        note: `Стартовый импорт ${document.number}`,
      })),
      { transaction },
    );
    await models.InstanceEvent.bulkCreate(
      instances.map((instance) => ({
        instanceId: instance.id,
        eventType: 'receiving',
        toStatus: 'in_stock',
        toCondition: instance.condition,
        toWarehouseId: warehouse.id,
        documentType: 'receiving',
        documentId: document.id,
        occurredAt: date,
        userId: context.userId,
        details: { documentNumber: document.number, startupImport: true },
      })),
      { transaction },
    );
    documentCount += 1;
    instanceCount += instances.length;
  }
  return { documents: documentCount, instances: instanceCount };
}

export const startupImportService = {
  async list() {
    const runs = await models.StartupImportRun.findAll({
      attributes: { exclude: ['payload'] },
      include: [
        { model: models.User, as: 'createdByUser', attributes: ['id', 'fullName'] },
        { model: models.User, as: 'appliedByUser', attributes: ['id', 'fullName'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 20,
    });
    return runs.map(plain);
  },

  async preview({ buffer, originalFileName }, { userId }) {
    const parsed = await parseStartupWorkbook(buffer);
    const [dpos, nomenclatureModels, employees] = await Promise.all([
      models.Dpo.findAll({ raw: true }),
      models.NomenclatureModel.findAll({ raw: true }),
      models.Employee.findAll({ raw: true }),
    ]);
    const checked = addDatabaseChecks(parsed, { dpos, models: nomenclatureModels, employees });
    const errors = checked.protocol.filter((item) => item.level === 'error').length;
    const warnings = checked.protocol.filter((item) => item.level === 'warning').length;
    const summary = {
      dpos: {
        rows: parsed.payload.dpos.length,
        duplicates: parsed.duplicates.dpos + checked.databaseDuplicates.dpos,
      },
      models: {
        rows: parsed.payload.models.length,
        duplicates: parsed.duplicates.models + checked.databaseDuplicates.models,
      },
      employees: {
        rows: parsed.payload.employees.length,
        duplicates: parsed.duplicates.employees + checked.databaseDuplicates.employees,
      },
      balances: {
        rows: parsed.payload.balances.length,
        units: parsed.payload.balances.reduce((sum, row) => sum + (row.quantity || 0), 0),
        duplicates: parsed.duplicates.balances,
      },
      errors,
      warnings,
      canApply: errors === 0,
    };
    const run = await models.StartupImportRun.create({
      fileName: originalFileName,
      fileChecksum: crypto.createHash('sha256').update(buffer).digest('hex'),
      status: 'previewed',
      summary,
      protocol: checked.protocol,
      payload: parsed.payload,
      createdByUserId: userId,
    });
    return plain(run);
  },

  async apply(id, { userId }) {
    let result;
    await sequelize.transaction(async (transaction) => {
      const run = await models.StartupImportRun.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!run) throw ApiError.notFound('Протокол стартового импорта не найден');
      if (run.status === 'applied') throw ApiError.conflict('Этот импорт уже был применён');
      if (!run.summary?.canApply)
        throw ApiError.badRequest('Сначала исправьте ошибки в файле и выполните проверку заново');
      const movementCount = await models.StockMovement.count({ transaction });
      if (movementCount > 0) {
        throw ApiError.conflict('Стартовый импорт разрешён только до появления складских операций');
      }

      const [organization] = await models.Organization.findOrCreate({
        where: { name: 'ОАО «РЖД»' },
        defaults: {
          name: 'ОАО «РЖД»',
          fullName: 'Открытое акционерное общество «Российские железные дороги»',
        },
        transaction,
      });
      const warehouses = [];
      for (const definition of WAREHOUSES) {
        const [warehouse] = await models.Warehouse.findOrCreate({
          where: { organizationId: organization.id, code: definition.code },
          defaults: { organizationId: organization.id, ...definition },
          transaction,
        });
        warehouses.push(warehouse);
      }

      const dposByName = new Map();
      for (const existing of await models.Dpo.findAll({ transaction }))
        dposByName.set(lower(existing.name), existing);
      for (const row of run.payload.dpos) {
        let dpo = dposByName.get(lower(row.name));
        if (!dpo) {
          dpo = await models.Dpo.create({ ...row, rowNumber: undefined }, { transaction });
          dposByName.set(lower(dpo.name), dpo);
        }
      }

      const modelsByName = new Map();
      for (const existing of await models.NomenclatureModel.findAll({ transaction }))
        modelsByName.set(lower(existing.name), existing);
      for (const row of run.payload.models) {
        let model = modelsByName.get(lower(row.name));
        if (!model) {
          model = await models.NomenclatureModel.create(
            { ...row, rowNumber: undefined },
            { transaction },
          );
          modelsByName.set(lower(model.name), model);
        }
      }

      let employeesCreated = 0;
      for (const row of run.payload.employees) {
        const existing = await models.Employee.findOne({
          where: { personnelNumber: row.personnelNumber },
          transaction,
        });
        if (existing) continue;
        let position = null;
        if (row.positionName) {
          [position] = await models.Position.findOrCreate({
            where: { name: row.positionName },
            defaults: { name: row.positionName },
            transaction,
          });
        }
        const sizeIds = {};
        for (const [sourceField, type, targetField] of SIZE_FIELDS) {
          const size = await findOrCreateSize(type, row[sourceField], transaction);
          sizeIds[targetField] = size?.id ?? null;
        }
        const dpo = row.dpoName ? dposByName.get(lower(row.dpoName)) : null;
        const employee = await models.Employee.create(
          {
            organizationId: organization.id,
            positionId: position?.id ?? null,
            dpoId: dpo?.id ?? null,
            fullName: row.fullName,
            personnelNumber: row.personnelNumber,
            gender: row.gender,
            birthDate: row.birthDate,
            hireDate: row.hireDate,
            phone: row.phone,
            ...sizeIds,
          },
          { transaction },
        );
        if (dpo) {
          await models.EmployeeDpoAssignment.create(
            {
              employeeId: employee.id,
              dpoId: dpo.id,
              validFrom: row.hireDate || '2000-01-01',
              changedByUserId: userId,
            },
            { transaction },
          );
        }
        employeesCreated += 1;
      }

      const opening = await createOpeningBalances(
        run.payload,
        { userId, warehouses, modelsByName },
        transaction,
      );
      await run.update(
        {
          status: 'applied',
          appliedByUserId: userId,
          appliedAt: new Date(),
          summary: {
            ...run.summary,
            employeesCreated,
            openingDocuments: opening.documents,
            openingInstances: opening.instances,
          },
        },
        { transaction },
      );
      result = plain(run);
    });
    return result;
  },
};

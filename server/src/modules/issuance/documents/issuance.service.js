import { sequelize } from '../../../database/models/index.js';
import { issuanceRepository } from './issuance.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import { KIT_SEASONS } from '../../../database/models/position-kit-item.model.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../../nomenclature/instances/instance-events.repository.js';
import { priceRepository } from '../../nomenclature/prices/price.repository.js';

const SIZE_FIELD_BY_TYPE = {
  clothing: 'clothingSizeId',
  height: 'heightSizeId',
  shoe: 'shoeSizeId',
  headwear: 'headwearSizeId',
  belt: 'beltSizeId',
  gloves: 'glovesSizeId',
};

const SIZE_ALIAS_BY_TYPE = {
  clothing: 'clothingSize',
  height: 'heightSize',
  shoe: 'shoeSize',
  headwear: 'headwearSize',
  belt: 'beltSize',
  gloves: 'glovesSize',
};

// Позиция подходит работнику, если её сезон/пол не заданы (унисекс/
// круглогодично — импортированные архивные позиции без разметки), либо
// совпадают. Пол работника, если он не указан в карточке, тоже не
// используется как ограничение — не блокировать подбор комплекта только
// из-за того, что администратор ещё не заполнил пол работника.
function matchesKitItem(item, season, employeeGender) {
  const seasonMatches = !item.season || item.season === season;
  const genderMatches = !item.gender || !employeeGender || item.gender === employeeGender;
  return seasonMatches && genderMatches;
}

function kitItemPriority(item, season, employeeGender) {
  let priority = item.season === season ? 4 : 0;
  if (employeeGender) {
    priority += item.gender === employeeGender ? 2 : item.gender ? 0 : 1;
  } else {
    priority += item.gender ? 0 : 2;
  }
  return priority;
}

// Несколько вариантов одной модели могут пересекаться из-за универсальных значений NULL.
// На одну модель выбирается ровно один, наиболее точный вариант; порядок из репозитория
// используется как стабильный критерий при одинаковом приоритете.
function selectKitItems(items, season, employeeGender) {
  const selectedByModel = new Map();
  for (const item of items) {
    if (!matchesKitItem(item, season, employeeGender)) continue;
    const selected = selectedByModel.get(item.modelId);
    if (
      !selected ||
      kitItemPriority(item, season, employeeGender) >
        kitItemPriority(selected, season, employeeGender)
    ) {
      selectedByModel.set(item.modelId, item);
    }
  }
  return [...selectedByModel.values()];
}

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.conflict('Документ уже проведён и недоступен для изменения');
  }
}

// Дублирующая проверка перед уникальным индексом БД (см. миграцию 0027) —
// понятная ошибка вместо падения на constraint. excludeLineId — при
// редактировании существующей строки исключает её саму из сравнения.
function assertNoDuplicateLine(lines, { modelId, sizeId, heightSizeId }, excludeLineId) {
  const duplicate = lines.some(
    (line) =>
      line.id !== excludeLineId &&
      line.modelId === modelId &&
      line.sizeId === sizeId &&
      (line.heightSizeId ?? null) === (heightSizeId ?? null),
  );
  if (duplicate) {
    throw ApiError.badRequest(
      'В документе уже есть строка с такой же моделью, размером и ростом — измените количество в ней',
    );
  }
}

function valueFrom(data, currentLine, field) {
  return Object.prototype.hasOwnProperty.call(data, field) ? data[field] : currentLine?.[field];
}

function priceSnapshot(price) {
  if (!price) return null;
  const withoutVat = Number(price.priceWithoutVat);
  const withVat = price.priceWithVat == null ? null : Number(price.priceWithVat);
  const derivedVat = withVat != null && withoutVat > 0 ? (withVat / withoutVat - 1) * 100 : 5;
  return {
    priceSourceId: price.id,
    priceEffectiveDate: price.effectiveDate,
    priceWithoutVatSnapshot: withoutVat,
    vatRateSnapshot: Number(price.vatRate ?? derivedVat),
    priceWithVatSnapshot: withVat,
  };
}

async function normalizeLineSizes(data, currentLine, { transaction } = {}) {
  const modelId = valueFrom(data, currentLine, 'modelId');
  const sizeId = valueFrom(data, currentLine, 'sizeId');
  const heightSizeId = valueFrom(data, currentLine, 'heightSizeId');
  const model = await issuanceRepository.findActiveModel(modelId, { transaction });
  if (!model) throw ApiError.badRequest('Модель номенклатуры не найдена или архивирована');

  if (!model.sizeType) {
    return { ...data, sizeId: null, heightSizeId: null };
  }

  if (!sizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать размер');
  }
  const size = await issuanceRepository.findActiveSize(sizeId, { transaction });
  if (!size || size.type !== model.sizeType) {
    throw ApiError.badRequest('Размер не найден, архивирован или не соответствует типу модели');
  }

  if (model.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model.requiresHeightSize && heightSizeId) {
    const heightSize = await issuanceRepository.findActiveSize(heightSizeId, { transaction });
    if (!heightSize || heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост не найден, архивирован или имеет другой тип');
    }
    return { ...data, sizeId, heightSizeId };
  }

  return { ...data, sizeId, heightSizeId: null };
}

export const issuanceService = {
  list(options) {
    return issuanceRepository.list(options);
  },

  async getById(id) {
    const document = await issuanceRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await issuanceRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return issuanceRepository.findById(document.id);
  },

  async update(id, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(id, { transaction });
      assertDraft(document);
      await issuanceRepository.updateDocument(id, data, { transaction });
    });
    return issuanceRepository.findById(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(id, { transaction });
      assertDraft(document);
      await issuanceRepository.deleteDraft(id, { transaction });
    });
  },

  async addLine(documentId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const normalizedData = await normalizeLineSizes(data, null, { transaction });
      assertNoDuplicateLine(document.lines, normalizedData);
      await issuanceRepository.createLine(documentId, normalizedData, { transaction });
    });
    return issuanceRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await issuanceRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      const normalizedData = await normalizeLineSizes(data, line, { transaction });
      assertNoDuplicateLine(
        document.lines,
        {
          modelId: normalizedData.modelId ?? line.modelId,
          sizeId: normalizedData.sizeId,
          heightSizeId: normalizedData.heightSizeId,
        },
        lineId,
      );
      await issuanceRepository.updateLine(lineId, normalizedData, { transaction });
    });
    return issuanceRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await issuanceRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await issuanceRepository.deleteLine(lineId, { transaction });
    });
    return issuanceRepository.findById(documentId);
  },

  // Быстрый подбор комплекта (раздел 9 ТЗ): по должности работника находит
  // комплект, по типу размера каждой модели комплекта (nomenclatureModel.
  // sizeType) берёт соответствующий размер из карточки работника. Позиции,
  // для которых у работника размер этого типа не указан, или строка с такой
  // же моделью/размером уже есть в документе — пропускаются, а не падают с
  // ошибкой (пользователь может добавить их вручную); список пропущенных
  // возвращается вызывающей стороне для отображения предупреждения.
  //
  // season ('summer'|'winter') — обязателен: комплект делится на летний и
  // зимний (см. PositionKitItem.season), выбор сезона отдельным действием на
  // экране. Позиции без сезона (season === null) — унаследованные из архивного
  // импорта, ещё не размеченные администратором — считаются нужными в любом
  // сезоне и попадают в оба варианта подбора. Пол позиции (PositionKitItem.
  // gender) фильтруется так же — см. matchesKitItem.
  async applyKit(documentId, { season } = {}) {
    if (!KIT_SEASONS.includes(season)) {
      throw ApiError.badRequest('Укажите сезон комплекта (летний или зимний)');
    }

    const skipped = [];
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);

      const { employee, kitItems: allKitItems } = await issuanceRepository.findEmployeeWithKit(
        document.employeeId,
        { transaction },
      );
      const kitItems = selectKitItems(allKitItems, season, employee.gender);
      const existingKeys = new Set(
        document.lines.map((line) => `${line.modelId}:${line.sizeId}:${line.heightSizeId ?? ''}`),
      );

      for (const kitItem of kitItems) {
        const sizeField = SIZE_FIELD_BY_TYPE[kitItem.model?.sizeType];
        const sizeId = sizeField ? employee[sizeField] : null;
        const heightSizeId = kitItem.model?.requiresHeightSize ? employee.heightSizeId : null;
        const requiresSize = Boolean(kitItem.model?.sizeType);
        if ((requiresSize && !sizeId) || (kitItem.model?.requiresHeightSize && !heightSizeId)) {
          skipped.push({
            modelId: kitItem.modelId,
            modelName: kitItem.model?.name,
            reason: 'no-size',
          });
          continue;
        }
        const key = `${kitItem.modelId}:${sizeId}:${heightSizeId ?? ''}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        await issuanceRepository.createLine(
          documentId,
          {
            modelId: kitItem.modelId,
            sizeId,
            heightSizeId,
            quantity: kitItem.quantity,
          },
          { transaction },
        );
      }
    });

    return { document: await issuanceRepository.findById(documentId), skipped };
  },

  // Предпросмотр комплекта (строго по размерам работника — раздел 9 ТЗ):
  // для каждой позиции комплекта его должности показывает, какой размер
  // работника подошёл бы, и сколько реально есть на складе документа под
  // этот конкретный размер — прежде чем что-либо добавлять в документ.
  // Ничего не создаёт и не изменяет; сама позиция добавляется отдельным
  // вызовом addLine, когда пользователь выбирает конкретную позицию из списка.
  async previewKit(documentId, { season } = {}) {
    if (!KIT_SEASONS.includes(season)) {
      throw ApiError.badRequest('Укажите сезон комплекта (летний или зимний)');
    }

    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);

    const { employee, kitItems: allKitItems } = await issuanceRepository.findEmployeeWithKit(
      document.employeeId,
    );
    if (!employee?.positionId) {
      return { items: [], noPosition: true };
    }
    const kitItems = selectKitItems(allKitItems, season, employee.gender);

    const items = [];
    for (const kitItem of kitItems) {
      const sizeType = kitItem.model?.sizeType;
      const sizeAlias = sizeType ? SIZE_ALIAS_BY_TYPE[sizeType] : null;
      const size = sizeAlias ? employee[sizeAlias] : null;
      const hasRequiredSize = !sizeType || Boolean(size);
      const requiresHeight = Boolean(kitItem.model?.requiresHeightSize);
      const hasHeight = !requiresHeight || Boolean(employee.heightSize);
      const missingSize = !hasRequiredSize || !hasHeight;

      const availableQuantity = missingSize
        ? null
        : await issuanceRepository.countAvailableInstances({
            modelId: kitItem.modelId,
            sizeId: size?.id ?? null,
            heightSizeId: requiresHeight ? employee.heightSize.id : null,
            warehouseId: document.warehouseId,
          });

      items.push({
        modelId: kitItem.modelId,
        modelName: kitItem.model?.name,
        sizeId: size?.id ?? null,
        sizeLabel: size?.value ?? null,
        heightSizeId: requiresHeight ? employee.heightSize.id : null,
        heightLabel: requiresHeight ? (employee.heightSize?.value ?? null) : null,
        quantity: kitItem.quantity,
        missingSize,
        availableQuantity,
      });
    }

    return { items, noPosition: false };
  },

  // Проведение — необратимо: подбирает под каждую строку доступные экземпляры
  // (FIFO по дате поступления, FOR UPDATE SKIP LOCKED — см. репозиторий),
  // переводит их в issued с привязкой к работнику и создаёт движения склада.
  // Если хотя бы по одной строке не хватает остатка — вся транзакция
  // откатывается, документ остаётся черновиком.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const allInstanceIds = [];
      const movementRows = [];
      const eventRows = [];
      const employee = await issuanceRepository.findEmployeeDpo(document.employeeId, {
        transaction,
      });

      for (const line of document.lines) {
        const applicablePrice = await priceRepository.findApplicable(
          {
            modelId: line.modelId,
            dpoId: employee?.dpoId ?? null,
            operationDate: document.documentDate,
          },
          { transaction },
        );
        const snapshot = priceSnapshot(applicablePrice);
        if (snapshot) {
          await issuanceRepository.savePriceSnapshot(line.id, snapshot, { transaction });
        }
        const instances = await issuanceRepository.findAvailableInstances(
          {
            modelId: line.modelId,
            sizeId: line.sizeId,
            heightSizeId: line.heightSizeId ?? null,
            warehouseId: document.warehouseId,
            limit: line.quantity,
          },
          { transaction },
        );

        if (instances.length < line.quantity) {
          const modelName = line.model?.name ?? line.modelId;
          const sizeDescription = line.size?.value
            ? `, размер ${line.size.value}`
            : ', без размера';
          throw ApiError.badRequest(
            `Недостаточно на складе: «${modelName}»${sizeDescription} — ` +
              `доступно ${instances.length} из ${line.quantity}`,
          );
        }

        for (const instance of instances) {
          allInstanceIds.push(instance.id);
          eventRows.push(
            buildInstanceEvent({
              instance,
              eventType: 'issuance',
              to: { status: 'issued', warehouseId: null, employeeId: document.employeeId },
              documentType: 'issuance',
              documentId: document.id,
              occurredAt: document.documentDate,
              userId,
              details: { documentNumber: document.number },
            }),
          );
          movementRows.push({
            instanceId: instance.id,
            fromWarehouseId: document.warehouseId,
            toWarehouseId: null,
            documentType: 'issuance',
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `Выдача ${document.number}`,
          });
        }
      }

      await issuanceRepository.markInstancesIssued(allInstanceIds, document.employeeId, {
        transaction,
      });
      await issuanceRepository.bulkCreateMovements(movementRows, { transaction });
      await instanceEventsRepository.bulkCreate(eventRows, { transaction });
      await issuanceRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
    });

    return issuanceRepository.findById(documentId);
  },
};

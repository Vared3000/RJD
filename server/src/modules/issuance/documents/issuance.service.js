import { sequelize } from '../../../database/models/index.js';
import { issuanceRepository } from './issuance.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';

const SIZE_FIELD_BY_TYPE = {
  clothing: 'clothingSizeId',
  height: 'heightSizeId',
  shoe: 'shoeSizeId',
  headwear: 'headwearSizeId',
  belt: 'beltSizeId',
  gloves: 'glovesSizeId',
};

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.badRequest('Документ уже проведён и недоступен для изменения');
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

async function normalizeLineSizes(data, currentLine) {
  const modelId = valueFrom(data, currentLine, 'modelId');
  const sizeId = valueFrom(data, currentLine, 'sizeId');
  const heightSizeId = valueFrom(data, currentLine, 'heightSizeId');
  const model = await issuanceRepository.findActiveModel(modelId);
  if (!model) throw ApiError.badRequest('Модель номенклатуры не найдена или архивирована');

  if (!model.sizeType) {
    return { ...data, sizeId: null, heightSizeId: null };
  }

  if (!sizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать размер');
  }
  const size = await issuanceRepository.findActiveSize(sizeId);
  if (!size || size.type !== model.sizeType) {
    throw ApiError.badRequest('Размер не найден, архивирован или не соответствует типу модели');
  }

  if (model.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model.requiresHeightSize && heightSizeId) {
    const heightSize = await issuanceRepository.findActiveSize(heightSizeId);
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
    const document = await issuanceRepository.findById(id);
    assertDraft(document);
    await issuanceRepository.updateDocument(id, data);
    return issuanceRepository.findById(id);
  },

  async remove(id) {
    const document = await issuanceRepository.findById(id);
    assertDraft(document);
    await issuanceRepository.deleteDraft(id);
  },

  async addLine(documentId, data) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);
    const normalizedData = await normalizeLineSizes(data);
    assertNoDuplicateLine(document.lines, normalizedData);
    await issuanceRepository.createLine(documentId, normalizedData);
    return issuanceRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);
    const line = await issuanceRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    const normalizedData = await normalizeLineSizes(data, line);
    assertNoDuplicateLine(
      document.lines,
      {
        modelId: normalizedData.modelId ?? line.modelId,
        sizeId: normalizedData.sizeId,
        heightSizeId: normalizedData.heightSizeId,
      },
      lineId,
    );
    await issuanceRepository.updateLine(lineId, normalizedData);
    return issuanceRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);
    const line = await issuanceRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await issuanceRepository.deleteLine(lineId);
    return issuanceRepository.findById(documentId);
  },

  // Быстрый подбор комплекта (раздел 9 ТЗ): по должности работника находит
  // комплект, по типу размера каждой модели комплекта (nomenclatureModel.
  // sizeType) берёт соответствующий размер из карточки работника. Позиции,
  // для которых у работника размер этого типа не указан, или строка с такой
  // же моделью/размером уже есть в документе — пропускаются, а не падают с
  // ошибкой (пользователь может добавить их вручную); список пропущенных
  // возвращается вызывающей стороне для отображения предупреждения.
  async applyKit(documentId) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);

    const { employee, kitItems } = await issuanceRepository.findEmployeeWithKit(
      document.employeeId,
    );

    const existingKeys = new Set(
      document.lines.map((line) => `${line.modelId}:${line.sizeId}:${line.heightSizeId ?? ''}`),
    );
    const skipped = [];

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
      await issuanceRepository.createLine(documentId, {
        modelId: kitItem.modelId,
        sizeId,
        heightSizeId,
        quantity: kitItem.quantity,
      });
    }

    return { document: await issuanceRepository.findById(documentId), skipped };
  },

  // Проведение — необратимо: подбирает под каждую строку доступные экземпляры
  // (FIFO по дате поступления, FOR UPDATE SKIP LOCKED — см. репозиторий),
  // переводит их в issued с привязкой к работнику и создаёт движения склада.
  // Если хотя бы по одной строке не хватает остатка — вся транзакция
  // откатывается, документ остаётся черновиком.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findForPosting(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.badRequest('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const allInstanceIds = [];
      const movementRows = [];

      for (const line of document.lines) {
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
      await issuanceRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
    });

    return issuanceRepository.findById(documentId);
  },
};

import { sequelize } from '../../../database/models/index.js';
import { returnRepository } from './return.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.badRequest('Документ уже проведён и недоступен для изменения');
  }
}

// Дублирующая проверка перед уникальным индексом БД (см. миграцию 0027) —
// понятная ошибка вместо падения на constraint. excludeLineId — при
// редактировании существующей строки исключает её саму из сравнения.
function assertNoDuplicateLine(lines, instanceId, excludeLineId) {
  const duplicate = lines.some(
    (line) => line.id !== excludeLineId && line.instanceId === instanceId,
  );
  if (duplicate) {
    throw ApiError.badRequest('В документе уже есть строка с этим экземпляром');
  }
}

export const returnService = {
  list(options) {
    return returnRepository.list(options);
  },

  async getById(id) {
    const document = await returnRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  findIssuedInstances(employeeId) {
    return returnRepository.findIssuedInstances(employeeId);
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await returnRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return returnRepository.findById(document.id);
  },

  async update(id, data) {
    const document = await returnRepository.findById(id);
    assertDraft(document);
    await returnRepository.updateDocument(id, data);
    return returnRepository.findById(id);
  },

  async remove(id) {
    const document = await returnRepository.findById(id);
    assertDraft(document);
    await returnRepository.deleteDraft(id);
  },

  async addLine(documentId, data) {
    const document = await returnRepository.findById(documentId);
    assertDraft(document);
    assertNoDuplicateLine(document.lines, data.instanceId);
    await returnRepository.createLine(documentId, data);
    return returnRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    const document = await returnRepository.findById(documentId);
    assertDraft(document);
    const line = await returnRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    assertNoDuplicateLine(document.lines, data.instanceId ?? line.instanceId, lineId);
    await returnRepository.updateLine(lineId, data);
    return returnRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    const document = await returnRepository.findById(documentId);
    assertDraft(document);
    const line = await returnRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await returnRepository.deleteLine(lineId);
    return returnRepository.findById(documentId);
  },

  // Проведение — необратимо: по каждой строке проверяет, что экземпляр
  // сейчас выдан именно тому работнику, что указан в шапке (мог быть уже
  // возвращён другим документом или изначально принадлежать другому
  // работнику), переводит его в in_stock на склад документа и создаёт
  // движение склада. Упрощение этого этапа (см. HANDOFF.md): возврат сразу
  // ставит in_stock, минуя "Стирку" — маршрутизация через стирку/ремонт
  // будет пересмотрена в Этапе 9.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findForPosting(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.badRequest('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const movementRows = [];

      for (const line of document.lines) {
        const instance = await returnRepository.findInstanceForReturn(line.instanceId, {
          transaction,
        });
        if (!instance) throw ApiError.notFound(`Экземпляр не найден (позиция ${line.id})`);
        if (instance.status !== 'issued' || instance.employeeId !== document.employeeId) {
          throw ApiError.badRequest(
            `Экземпляр ${instance.inventoryNumber} сейчас не выдан указанному работнику — ` +
              'проверьте позицию документа',
          );
        }

        await returnRepository.markInstanceReturned(
          instance.id,
          { warehouseId: document.warehouseId, condition: line.condition },
          { transaction },
        );

        movementRows.push({
          instanceId: instance.id,
          fromWarehouseId: null,
          toWarehouseId: document.warehouseId,
          documentType: 'return',
          documentId: document.id,
          occurredAt: document.documentDate,
          note: `Возврат ${document.number}`,
        });
      }

      await returnRepository.bulkCreateMovements(movementRows, { transaction });
      await returnRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
    });

    return returnRepository.findById(documentId);
  },
};

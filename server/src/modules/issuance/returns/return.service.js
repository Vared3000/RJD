import { sequelize } from '../../../database/models/index.js';
import { returnRepository } from './return.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../../nomenclature/instances/instance-events.repository.js';
import { reverseDocumentEffects } from '../../nomenclature/instances/document-effect-reversal.js';
import { documentRevisionsRepository } from '../../documents/document-revisions.repository.js';

function documentSnapshot(document, overrides = {}) {
  const { lines, ...header } = document;
  return { header: { ...header, ...overrides }, lines };
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
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(id, { transaction });
      assertDraft(document);
      await returnRepository.updateDocument(id, data, { transaction });
    });
    return returnRepository.findById(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(id, { transaction });
      assertDraft(document);
      await returnRepository.deleteDraft(id, { transaction });
    });
  },

  async addLine(documentId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      assertNoDuplicateLine(document.lines, data.instanceId);
      await returnRepository.createLine(documentId, data, { transaction });
    });
    return returnRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await returnRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      assertNoDuplicateLine(document.lines, data.instanceId ?? line.instanceId, lineId);
      await returnRepository.updateLine(lineId, data, { transaction });
    });
    return returnRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await returnRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await returnRepository.deleteLine(lineId, { transaction });
    });
    return returnRepository.findById(documentId);
  },

  // Проведение — необратимо: по каждой строке проверяет, что экземпляр
  // сейчас выдан именно тому работнику, что указан в шапке (мог быть уже
  // возвращён другим документом или изначально принадлежать другому
  // работнику), переводит его на склад документа и создаёт движение склада.
  // Целевой статус — line.routeTo (Этап 9): 'in_stock' по умолчанию, либо
  // 'laundry'/'repair', если работник сдал вещь сразу на стирку/в ремонт —
  // тогда отдельный документ Стирка/Ремонт подхватит её напрямую (см.
  // server/src/modules/service-documents/), без промежуточного оприходования
  // на склад.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const movementRows = [];
      const eventRows = [];

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
          { warehouseId: document.warehouseId, condition: line.condition, routeTo: line.routeTo },
          { transaction },
        );

        eventRows.push(
          buildInstanceEvent({
            instance,
            eventType: 'return',
            to: {
              status: line.routeTo ?? 'in_stock',
              condition: line.condition,
              warehouseId: document.warehouseId,
              employeeId: null,
            },
            documentType: 'return',
            documentId: document.id,
            occurredAt: document.documentDate,
            userId,
            details: { documentNumber: document.number, routeTo: line.routeTo ?? 'in_stock' },
          }),
        );

        const routeSuffix =
          line.routeTo && line.routeTo !== 'in_stock' ? ` (направлено: ${line.routeTo})` : '';
        movementRows.push({
          instanceId: instance.id,
          fromWarehouseId: null,
          toWarehouseId: document.warehouseId,
          documentType: 'return',
          documentId: document.id,
          occurredAt: document.documentDate,
          note: `Возврат ${document.number}${routeSuffix}`,
        });
      }

      await returnRepository.bulkCreateMovements(movementRows, { transaction });
      await instanceEventsRepository.bulkCreate(eventRows, { transaction });
      if (document.revisionNumber > 1) {
        const nextRevision = document.revisionNumber + 1;
        await returnRepository.markReposted(
          documentId,
          { revisionNumber: nextRevision, postedByUserId: userId },
          { transaction },
        );
        await documentRevisionsRepository.create(
          {
            documentType: 'return',
            documentId,
            revisionNumber: nextRevision,
            action: 'repost',
            previousData: documentSnapshot(document),
            newData: documentSnapshot(document, {
              status: 'posted',
              postedByUserId: userId,
              revisionNumber: nextRevision,
            }),
            revisedByUserId: userId,
            revisedAt: new Date(),
          },
          { transaction },
        );
      } else {
        await returnRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
      }
    });

    return returnRepository.findById(documentId);
  },

  async unpost(documentId, { reason }, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await returnRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'posted') {
        throw ApiError.conflict('Отменить проведение можно только у проведённого документа');
      }

      const previousData = documentSnapshot(document);
      await reverseDocumentEffects({ documentType: 'return', documentId }, { transaction });

      const nextRevision = document.revisionNumber + 1;
      await returnRepository.markUnposted(
        documentId,
        { revisionNumber: nextRevision, revisedByUserId: userId },
        { transaction },
      );
      await documentRevisionsRepository.create(
        {
          documentType: 'return',
          documentId,
          revisionNumber: nextRevision,
          action: 'unpost',
          previousData,
          newData: documentSnapshot(document, {
            status: 'draft',
            postedAt: null,
            postedByUserId: null,
            revisionNumber: nextRevision,
          }),
          reason,
          revisedByUserId: userId,
          revisedAt: new Date(),
        },
        { transaction },
      );
    });

    return returnRepository.findById(documentId);
  },
};

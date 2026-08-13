import { sequelize } from '../../database/models/index.js';
import { writeoffRepository } from './writeoff.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../nomenclature/instances/instance-events.repository.js';
import { reverseDocumentEffects } from '../nomenclature/instances/document-effect-reversal.js';
import { documentRevisionsRepository } from '../documents/document-revisions.repository.js';

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

function assertNoDuplicateLine(lines, instanceId, excludeLineId) {
  const duplicate = lines.some(
    (line) => line.id !== excludeLineId && line.instanceId === instanceId,
  );
  if (duplicate) {
    throw ApiError.badRequest('В документе уже есть строка с этим экземпляром');
  }
}

export const writeoffService = {
  list(options) {
    return writeoffRepository.list(options);
  },

  async getById(id) {
    const document = await writeoffRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await writeoffRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return writeoffRepository.findById(document.id);
  },

  async update(id, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(id, { transaction });
      assertDraft(document);
      await writeoffRepository.updateDocument(id, data, { transaction });
    });
    return writeoffRepository.findById(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(id, { transaction });
      assertDraft(document);
      await writeoffRepository.deleteDraft(id, { transaction });
    });
  },

  async addLine(documentId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      assertNoDuplicateLine(document.lines, data.instanceId);
      await writeoffRepository.createLine(documentId, data, { transaction });
    });
    return writeoffRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await writeoffRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      assertNoDuplicateLine(document.lines, data.instanceId ?? line.instanceId, lineId);
      await writeoffRepository.updateLine(lineId, data, { transaction });
    });
    return writeoffRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await writeoffRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await writeoffRepository.deleteLine(lineId, { transaction });
    });
    return writeoffRepository.findById(documentId);
  },

  // Проведение — необратимо: экземпляр должен сейчас реально быть в
  // наличии (in_stock) на складе документа; переводит его в status=
  // 'write_off' окончательно (аналогично Выдаче, экземпляр покидает
  // остатки без toWarehouseId в движении) и создаёт движение склада.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const movementRows = [];
      const eventRows = [];

      for (const line of document.lines) {
        const instance = await writeoffRepository.findInstanceForWriteoff(line.instanceId, {
          transaction,
        });
        if (!instance) throw ApiError.notFound(`Экземпляр не найден (позиция ${line.id})`);
        if (instance.status !== 'in_stock' || instance.warehouseId !== document.warehouseId) {
          throw ApiError.badRequest(
            `Экземпляр ${instance.inventoryNumber} сейчас не в наличии на складе документа — ` +
              'проверьте позицию',
          );
        }

        await writeoffRepository.markInstanceWrittenOff(instance.id, { transaction });

        eventRows.push(
          buildInstanceEvent({
            instance,
            eventType: 'writeoff',
            to: { status: 'write_off', warehouseId: null, employeeId: null },
            documentType: 'writeoff',
            documentId: document.id,
            occurredAt: document.documentDate,
            userId,
            details: { documentNumber: document.number, reason: line.reason },
          }),
        );

        movementRows.push({
          instanceId: instance.id,
          fromWarehouseId: document.warehouseId,
          toWarehouseId: null,
          documentType: 'writeoff',
          documentId: document.id,
          occurredAt: document.documentDate,
          note: `Списание ${document.number}: ${line.reason}`,
        });
      }

      await writeoffRepository.bulkCreateMovements(movementRows, { transaction });
      await instanceEventsRepository.bulkCreate(eventRows, { transaction });
      if (document.revisionNumber > 1) {
        const nextRevision = document.revisionNumber + 1;
        await writeoffRepository.markReposted(
          documentId,
          { revisionNumber: nextRevision, postedByUserId: userId },
          { transaction },
        );
        await documentRevisionsRepository.create(
          {
            documentType: 'writeoff',
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
        await writeoffRepository.markPosted(
          documentId,
          { postedByUserId: userId },
          { transaction },
        );
      }
    });

    return writeoffRepository.findById(documentId);
  },

  async unpost(documentId, { reason }, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await writeoffRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'posted') {
        throw ApiError.conflict('Отменить проведение можно только у проведённого документа');
      }

      const previousData = documentSnapshot(document);
      await reverseDocumentEffects({ documentType: 'writeoff', documentId }, { transaction });

      const nextRevision = document.revisionNumber + 1;
      await writeoffRepository.markUnposted(
        documentId,
        { revisionNumber: nextRevision, revisedByUserId: userId },
        { transaction },
      );
      await documentRevisionsRepository.create(
        {
          documentType: 'writeoff',
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

    return writeoffRepository.findById(documentId);
  },
};

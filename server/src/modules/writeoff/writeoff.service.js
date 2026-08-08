import { sequelize } from '../../database/models/index.js';
import { writeoffRepository } from './writeoff.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';

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
      await writeoffRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
    });

    return writeoffRepository.findById(documentId);
  },
};

import { models } from '../../../database/models/index.js';

const {
  IssuanceTask,
  IssuanceTaskFulfillment,
  IssuanceDocument,
  Employee,
  Warehouse,
  NomenclatureModel,
  Size,
  User,
} = models;

// Ключ группировки задач/строк документа по товарной позиции — используется
// и здесь (объединение задач в строки черновика), и в issuance.service.js
// (сопоставление фактически выданного количества с задачами при проведении).
export function issuanceTaskKey({ modelId, sizeId, heightSizeId }) {
  return `${modelId}:${sizeId ?? ''}:${heightSizeId ?? ''}`;
}

const detailInclude = [
  { model: Employee, as: 'employee', attributes: ['id', 'fullName'] },
  { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
  { model: NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
  { model: IssuanceDocument, as: 'sourceDocument', attributes: ['id', 'number'] },
  { model: IssuanceDocument, as: 'draftDocument', attributes: ['id', 'number'] },
  { model: User, as: 'completedByUser', attributes: ['id', 'fullName'] },
  {
    model: IssuanceTaskFulfillment,
    as: 'fulfillments',
    attributes: ['id', 'documentId', 'quantity', 'createdAt'],
    include: [{ model: IssuanceDocument, as: 'document', attributes: ['id', 'number'] }],
  },
];

export const tasksRepository = {
  list({ status, page = 1, limit = 50 } = {}) {
    const where = {};
    if (status) where.status = status;
    const offset = (Number(page) - 1) * Number(limit);
    return IssuanceTask.findAndCountAll({
      where,
      include: detailInclude,
      // Открытые/в оформлении — сначала старые (дольше всего ждут); закрытые — сначала недавние.
      order: [['createdAt', status === 'completed' ? 'DESC' : 'ASC']],
      limit: Number(limit),
      offset,
    });
  },

  countOpen() {
    return IssuanceTask.count({ where: { status: 'open' } });
  },

  bulkCreate(rows, { transaction }) {
    return IssuanceTask.bulkCreate(rows, { transaction });
  },

  findLocked(id, { transaction }) {
    return IssuanceTask.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  },

  // Блокировка нескольких задач сразу (создание черновика довыдачи,
  // разбор revise()) — сортировка по id даёт стабильный порядок блокировки
  // между конкурентными транзакциями и защищает от дедлоков.
  findManyLocked(ids, { transaction }) {
    if (!ids || ids.length === 0) return Promise.resolve([]);
    return IssuanceTask.findAll({
      where: { id: ids },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  findByDraftDocument(documentId, { transaction }) {
    return IssuanceTask.findAll({
      where: { draftDocumentId: documentId },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  findById(id) {
    return IssuanceTask.findByPk(id, { include: detailInclude });
  },

  markInProgress(ids, draftDocumentId, { transaction }) {
    return IssuanceTask.update(
      { status: 'in_progress', draftDocumentId },
      { where: { id: ids }, transaction },
    );
  },

  releaseToOpen(ids, { transaction }) {
    if (!ids || ids.length === 0) return Promise.resolve([0]);
    return IssuanceTask.update(
      { status: 'open', draftDocumentId: null },
      { where: { id: ids }, transaction },
    );
  },

  updateProgress(
    id,
    { quantity, status, completedAt, completedByUserId, draftDocumentId },
    { transaction },
  ) {
    return IssuanceTask.update(
      { quantity, status, completedAt, completedByUserId, draftDocumentId },
      { where: { id }, transaction },
    );
  },

  createFulfillments(rows, { transaction }) {
    if (!rows || rows.length === 0) return Promise.resolve([]);
    return IssuanceTaskFulfillment.bulkCreate(rows, { transaction });
  },

  findFulfillmentsByDocument(documentId, { transaction } = {}) {
    return IssuanceTaskFulfillment.findAll({ where: { documentId }, transaction });
  },

  deleteFulfillmentsByDocument(documentId, { transaction }) {
    return IssuanceTaskFulfillment.destroy({ where: { documentId }, transaction });
  },
};

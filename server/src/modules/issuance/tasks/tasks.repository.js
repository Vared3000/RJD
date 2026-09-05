import { Op } from 'sequelize';
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
  Position,
  Dpo,
  Instance,
} = models;

// Ключ группировки задач/строк документа по товарной позиции — используется
// и здесь (объединение задач в строки черновика), и в issuance.service.js
// (сопоставление фактически выданного количества с задачами при проведении).
export function issuanceTaskKey({ modelId, sizeId, heightSizeId }) {
  return `${modelId}:${sizeId ?? ''}:${heightSizeId ?? ''}`;
}

const detailInclude = [
  {
    model: Employee,
    as: 'employee',
    attributes: ['id', 'fullName', 'terminationDate', 'archivedAt'],
    include: [
      { model: Position, as: 'position', attributes: ['id', 'name'] },
      { model: Dpo, as: 'dpo', attributes: ['id', 'name'] },
    ],
  },
  { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
  { model: NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
  { model: IssuanceDocument, as: 'sourceDocument', attributes: ['id', 'number'] },
  { model: IssuanceDocument, as: 'draftDocument', attributes: ['id', 'number'] },
  { model: User, as: 'completedByUser', attributes: ['id', 'fullName'] },
  {
    model: Instance,
    as: 'sourceInstance',
    attributes: ['id', 'inventoryNumber', 'status', 'employeeId'],
  },
  {
    model: IssuanceTaskFulfillment,
    as: 'fulfillments',
    attributes: ['id', 'documentId', 'quantity', 'createdAt'],
    include: [{ model: IssuanceDocument, as: 'document', attributes: ['id', 'number'] }],
  },
];

export const tasksRepository = {
  list({ status, taskType, today, page = 1, limit = 50 } = {}) {
    const where = {};
    if (status === 'active') {
      where.status = { [Op.in]: ['scheduled', 'open', 'overdue'] };
      where[Op.or] = [
        { taskType: 'completion' },
        { taskType: 'replacement', notificationDate: { [Op.lte]: today } },
      ];
    } else if (status) {
      where.status = status;
      if (status === 'scheduled') where.notificationDate = { [Op.lte]: today };
    }
    if (taskType) where.taskType = taskType;
    const offset = (Number(page) - 1) * Number(limit);
    return IssuanceTask.findAndCountAll({
      where,
      include: detailInclude,
      distinct: true,
      // Открытые/в оформлении — сначала старые (дольше всего ждут); закрытые — сначала недавние.
      order:
        status === 'active'
          ? [
              ['plannedReplacementDate', 'ASC'],
              ['createdAt', 'ASC'],
            ]
          : [['createdAt', status === 'completed' ? 'DESC' : 'ASC']],
      limit: Number(limit),
      offset,
    });
  },

  countActive(today) {
    return IssuanceTask.count({
      where: {
        status: { [Op.in]: ['scheduled', 'open', 'overdue'] },
        [Op.or]: [
          { taskType: 'completion' },
          { taskType: 'replacement', notificationDate: { [Op.lte]: today } },
        ],
      },
    });
  },

  bulkCreate(rows, { transaction }) {
    return IssuanceTask.bulkCreate(rows, { transaction, returning: true });
  },

  findReplacementSchedules({ transaction } = {}) {
    return IssuanceTask.findAll({
      where: {
        taskType: 'replacement',
        status: { [Op.in]: ['scheduled', 'open', 'overdue'] },
      },
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'terminationDate', 'archivedAt'],
        },
        {
          model: Instance,
          as: 'sourceInstance',
          attributes: ['id', 'status', 'employeeId'],
        },
      ],
      transaction,
    });
  },

  setScheduleState(id, values, { transaction } = {}) {
    return IssuanceTask.update(values, { where: { id }, transaction });
  },

  cancelReplacementByInstances(
    instanceIds,
    { returnDocumentId, reason, cancelledAt = new Date() },
    { transaction },
  ) {
    if (!instanceIds?.length) return Promise.resolve([0]);
    return IssuanceTask.update(
      {
        status: 'cancelled',
        cancelledAt,
        cancelReason: reason,
        cancelledByReturnDocumentId: returnDocumentId,
        draftDocumentId: null,
      },
      {
        where: {
          taskType: 'replacement',
          sourceInstanceId: { [Op.in]: instanceIds },
          status: { [Op.in]: ['scheduled', 'open', 'overdue'] },
        },
        transaction,
      },
    );
  },

  findCancelledByReturnDocument(returnDocumentId, { transaction }) {
    return IssuanceTask.findAll({
      where: {
        taskType: 'replacement',
        status: 'cancelled',
        cancelledByReturnDocumentId: returnDocumentId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  findReplacementBySourceDocument(sourceDocumentId, { transaction }) {
    return IssuanceTask.findAll({
      where: { taskType: 'replacement', sourceDocumentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
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

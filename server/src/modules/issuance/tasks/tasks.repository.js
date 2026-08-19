import { models } from '../../../database/models/index.js';

const { IssuanceTask, IssuanceDocument, Employee, Warehouse, NomenclatureModel, Size, User } =
  models;

const detailInclude = [
  { model: Employee, as: 'employee', attributes: ['id', 'fullName'] },
  { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
  { model: NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
  { model: IssuanceDocument, as: 'sourceDocument', attributes: ['id', 'number'] },
  { model: IssuanceDocument, as: 'fulfillingDocument', attributes: ['id', 'number'] },
  { model: User, as: 'completedByUser', attributes: ['id', 'fullName'] },
];

export const tasksRepository = {
  list({ status, page = 1, limit = 50 } = {}) {
    const where = {};
    if (status) where.status = status;
    const offset = (Number(page) - 1) * Number(limit);
    return IssuanceTask.findAndCountAll({
      where,
      include: detailInclude,
      // Открытые задачи — сначала старые (дольше всего ждут); закрытые — сначала недавние.
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

  findById(id) {
    return IssuanceTask.findByPk(id, { include: detailInclude });
  },

  markCompleted(id, { fulfillingDocumentId, completedByUserId }, { transaction }) {
    return IssuanceTask.update(
      { status: 'completed', fulfillingDocumentId, completedByUserId, completedAt: new Date() },
      { where: { id }, transaction },
    );
  },
};

import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';

const { Dpo, DpoHistory, User } = models;

export const dpoRepository = {
  list({ includeArchived = false, search, page = 1, limit = 50, sort, order = 'ASC' } = {}) {
    const where = includeArchived ? {} : { archivedAt: null };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { fullName: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } },
      ];
    }
    const effectiveSort = ['name', 'code', 'region', 'createdAt'].includes(sort) ? sort : 'name';
    const effectiveOrder = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const offset = (Number(page) - 1) * Number(limit);
    return Dpo.findAndCountAll({
      where,
      order: [
        [effectiveSort, effectiveOrder],
        ['name', 'ASC'],
      ],
      limit: Number(limit),
      offset,
    });
  },

  findById(id, { transaction } = {}) {
    return Dpo.findByPk(id, { transaction });
  },

  findByIdForUpdate(id, { transaction }) {
    return Dpo.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  },

  create(data) {
    return Dpo.create(data);
  },

  async updateById(id, data, { transaction } = {}) {
    const [count] = await Dpo.update(data, { where: { id, archivedAt: null }, transaction });
    return count > 0;
  },

  async archive(id) {
    const [count] = await Dpo.update(
      { archivedAt: new Date() },
      { where: { id, archivedAt: null } },
    );
    return count > 0;
  },

  async restore(id) {
    const [count] = await Dpo.update(
      { archivedAt: null },
      { where: { id, archivedAt: { [Op.ne]: null } } },
    );
    return count > 0;
  },

  createHistoryEntry({ dpoId, changedByUserId, previousData }, { transaction }) {
    return DpoHistory.create({ dpoId, changedByUserId, previousData }, { transaction });
  },

  listHistory(dpoId) {
    return DpoHistory.findAll({
      where: { dpoId },
      include: [{ model: User, as: 'changedBy', attributes: ['id', 'fullName'] }],
      order: [['changedAt', 'ASC']],
    });
  },
};

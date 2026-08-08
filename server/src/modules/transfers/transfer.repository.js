import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';

const { TransferDocument, TransferLine, Instance, StockMovement } = models;

const instanceInclude = [
  { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
];

const listInclude = [
  { model: models.Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
  { model: models.Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
];

const detailInclude = [
  ...listInclude,
  { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  {
    model: TransferLine,
    as: 'lines',
    include: [
      {
        model: Instance,
        as: 'instance',
        attributes: ['id', 'inventoryNumber', 'cost'],
        include: instanceInclude,
      },
    ],
  },
];

export const transferRepository = {
  list({ warehouseId } = {}) {
    return TransferDocument.findAll({
      where: warehouseId
        ? { [Op.or]: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] }
        : {},
      include: listInclude,
      order: [['createdAt', 'DESC']],
    });
  },

  findById(id) {
    return TransferDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: TransferLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  async findLocked(id, { transaction }) {
    const document = await TransferDocument.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    const lines = await TransferLine.findAll({ where: { documentId: id }, transaction, raw: true });
    return { ...document.get({ plain: true }), lines };
  },

  createDocument(data) {
    return TransferDocument.create(data);
  },

  async updateDocument(id, data, { transaction }) {
    const [count] = await TransferDocument.update(data, {
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  async deleteDraft(id, { transaction }) {
    const count = await TransferDocument.destroy({
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  createLine(documentId, data, { transaction }) {
    return TransferLine.create({ ...data, documentId }, { transaction });
  },

  findLine(documentId, lineId, { transaction }) {
    return TransferLine.findOne({ where: { id: lineId, documentId }, transaction });
  },

  async updateLine(lineId, data, { transaction }) {
    const [count] = await TransferLine.update(data, { where: { id: lineId }, transaction });
    return count > 0;
  },

  deleteLine(lineId, { transaction }) {
    return TransferLine.destroy({ where: { id: lineId }, transaction });
  },

  // Блокируем сам экземпляр (конкретный instanceId уже известен, как у
  // Возврата) — не FIFO-подбор, поэтому без SKIP LOCKED.
  findInstanceForTransfer(instanceId, { transaction }) {
    return Instance.findByPk(instanceId, { transaction, lock: transaction.LOCK.UPDATE });
  },

  markInstanceMoved(instanceId, { warehouseId }, { transaction }) {
    return Instance.update({ warehouseId }, { where: { id: instanceId }, transaction });
  },

  bulkCreateMovements(rows, { transaction }) {
    return StockMovement.bulkCreate(rows, { transaction });
  },

  markPosted(id, { postedByUserId }, { transaction }) {
    return TransferDocument.update(
      { status: 'posted', postedAt: new Date(), postedByUserId },
      { where: { id }, transaction },
    );
  },
};

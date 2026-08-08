import { models } from '../../database/models/index.js';

const { WriteoffDocument, WriteoffLine, Instance, StockMovement } = models;

const instanceInclude = [
  { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
];

const listInclude = [{ model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] }];

const detailInclude = [
  ...listInclude,
  { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  {
    model: WriteoffLine,
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

export const writeoffRepository = {
  list({ warehouseId } = {}) {
    return WriteoffDocument.findAll({
      where: warehouseId ? { warehouseId } : {},
      include: listInclude,
      order: [['createdAt', 'DESC']],
    });
  },

  findById(id) {
    return WriteoffDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: WriteoffLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  async findLocked(id, { transaction }) {
    const document = await WriteoffDocument.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    const lines = await WriteoffLine.findAll({ where: { documentId: id }, transaction, raw: true });
    return { ...document.get({ plain: true }), lines };
  },

  createDocument(data) {
    return WriteoffDocument.create(data);
  },

  async updateDocument(id, data, { transaction }) {
    const [count] = await WriteoffDocument.update(data, {
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  async deleteDraft(id, { transaction }) {
    const count = await WriteoffDocument.destroy({
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  createLine(documentId, data, { transaction }) {
    return WriteoffLine.create({ ...data, documentId }, { transaction });
  },

  findLine(documentId, lineId, { transaction }) {
    return WriteoffLine.findOne({ where: { id: lineId, documentId }, transaction });
  },

  async updateLine(lineId, data, { transaction }) {
    const [count] = await WriteoffLine.update(data, { where: { id: lineId }, transaction });
    return count > 0;
  },

  deleteLine(lineId, { transaction }) {
    return WriteoffLine.destroy({ where: { id: lineId }, transaction });
  },

  findInstanceForWriteoff(instanceId, { transaction }) {
    return Instance.findByPk(instanceId, { transaction, lock: transaction.LOCK.UPDATE });
  },

  markInstanceWrittenOff(instanceId, { transaction }) {
    return Instance.update(
      { status: 'write_off', employeeId: null },
      { where: { id: instanceId }, transaction },
    );
  },

  bulkCreateMovements(rows, { transaction }) {
    return StockMovement.bulkCreate(rows, { transaction });
  },

  markPosted(id, { postedByUserId }, { transaction }) {
    return WriteoffDocument.update(
      { status: 'posted', postedAt: new Date(), postedByUserId },
      { where: { id }, transaction },
    );
  },
};

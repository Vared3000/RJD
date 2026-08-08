import { models } from '../../database/models/index.js';

const {
  StockAdjustment,
  StockAdjustmentLine,
  Instance,
  Warehouse,
  User,
  NomenclatureModel,
  Size,
  InventoryDocument,
  InventoryLine,
  StockMovement,
} = models;

const instanceInclude = [
  { model: NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
  { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
];

const listInclude = [{ model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] }];

const detailInclude = [
  ...listInclude,
  { model: User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  {
    model: StockAdjustmentLine,
    as: 'lines',
    include: [
      {
        model: Instance,
        as: 'instance',
        attributes: ['id', 'inventoryNumber', 'cost'],
        include: instanceInclude,
      },
      { model: NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
      { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
      { model: InventoryDocument, as: 'inventoryDocument', attributes: ['id', 'number'] },
    ],
  },
];

export const adjustmentRepository = {
  list({ warehouseId } = {}) {
    return StockAdjustment.findAll({
      where: warehouseId ? { warehouseId } : {},
      include: listInclude,
      order: [['createdAt', 'DESC']],
    });
  },

  findById(id) {
    return StockAdjustment.findByPk(id, {
      include: detailInclude,
      order: [[{ model: StockAdjustmentLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  async findLocked(id, { transaction }) {
    const document = await StockAdjustment.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    const lines = await StockAdjustmentLine.findAll({
      where: { documentId: id },
      transaction,
      raw: true,
    });
    return { ...document.get({ plain: true }), lines };
  },

  createDocument(data, { transaction } = {}) {
    return StockAdjustment.create(data, { transaction });
  },

  async updateDocument(id, data, { transaction }) {
    const [count] = await StockAdjustment.update(data, {
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  async deleteDraft(id, { transaction }) {
    const count = await StockAdjustment.destroy({
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  createLine(documentId, data, { transaction }) {
    return StockAdjustmentLine.create({ ...data, documentId }, { transaction });
  },

  bulkCreateLines(rows, { transaction } = {}) {
    return StockAdjustmentLine.bulkCreate(rows, { transaction });
  },

  findLine(documentId, lineId, { transaction }) {
    return StockAdjustmentLine.findOne({ where: { id: lineId, documentId }, transaction });
  },

  async updateLine(lineId, data, { transaction }) {
    const [count] = await StockAdjustmentLine.update(data, { where: { id: lineId }, transaction });
    return count > 0;
  },

  deleteLine(lineId, { transaction }) {
    return StockAdjustmentLine.destroy({ where: { id: lineId }, transaction });
  },

  findActiveModel(modelId, { transaction } = {}) {
    return NomenclatureModel.findOne({ where: { id: modelId, archivedAt: null }, transaction });
  },

  findActiveSize(sizeId, { transaction } = {}) {
    return Size.findOne({ where: { id: sizeId, archivedAt: null }, transaction });
  },

  findInstanceForAdjustment(instanceId, { transaction }) {
    return Instance.findByPk(instanceId, { transaction, lock: transaction.LOCK.UPDATE });
  },

  bulkCreateInstances(rows, { transaction }) {
    return Instance.bulkCreate(rows, { transaction });
  },

  updateInstance(instanceId, data, { transaction }) {
    return Instance.update(data, { where: { id: instanceId }, transaction });
  },

  bulkCreateMovements(rows, { transaction }) {
    return StockMovement.bulkCreate(rows, { transaction });
  },

  markPosted(id, { postedByUserId }, { transaction }) {
    return StockAdjustment.update(
      { status: 'posted', postedAt: new Date(), postedByUserId },
      { where: { id }, transaction },
    );
  },

  findInventoryDocument(id, { transaction } = {}) {
    return InventoryDocument.findByPk(id, { transaction });
  },

  findInventoryDiscrepancyLines(inventoryDocumentId, { transaction } = {}) {
    return InventoryLine.findAll({
      where: { documentId: inventoryDocumentId, confirmed: false },
      order: [['sortOrder', 'ASC']],
      transaction,
    });
  },
};

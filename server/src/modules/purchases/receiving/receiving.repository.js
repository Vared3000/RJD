import { Op } from 'sequelize';
import { models } from '../../../database/models/index.js';

const { ReceivingDocument, ReceivingLine, Batch, Instance, StockMovement } = models;

const listInclude = [
  { model: models.Supplier, as: 'supplier', attributes: ['id', 'name'] },
  { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
];

const detailInclude = [
  ...listInclude,
  { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  { model: models.Batch, as: 'batch', attributes: ['id', 'code'] },
  {
    model: ReceivingLine,
    as: 'lines',
    include: [
      {
        model: models.NomenclatureModel,
        as: 'model',
        attributes: ['id', 'name', 'article', 'unit'],
      },
      { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
    ],
  },
];

export const receivingRepository = {
  list({
    supplierId,
    warehouseId,
    status,
    search,
    page = 1,
    limit = 50,
    sort = 'createdAt',
    order = 'DESC',
  } = {}) {
    const where = {};
    if (supplierId) where.supplierId = supplierId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { number: { [Op.iLike]: `%${search}%` } },
        { 'supplier.name': { [Op.iLike]: `%${search}%` } },
        { 'warehouse.name': { [Op.iLike]: `%${search}%` } },
      ];
    }

    const effectiveSort = ['createdAt', 'documentDate', 'number'].includes(sort)
      ? sort
      : 'createdAt';
    const effectiveOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(limit);

    return ReceivingDocument.findAndCountAll({
      where,
      include: listInclude,
      order: [[effectiveSort, effectiveOrder]],
      limit: Number(limit),
      offset,
    });
  },

  findById(id) {
    return ReceivingDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: ReceivingLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  // Для любой мутации блокируем только шапку документа (SELECT ... FOR UPDATE).
  // Строки читаем отдельно: Postgres не разрешает FOR UPDATE через LEFT JOIN,
  // который Sequelize строит для include документа без строк.
  async findLocked(id, { transaction }) {
    const document = await ReceivingDocument.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    const lines = await ReceivingLine.findAll({
      where: { documentId: id },
      transaction,
      raw: true,
    });
    return { ...document.get({ plain: true }), lines };
  },

  createDocument(data) {
    return ReceivingDocument.create(data);
  },

  async updateDocument(id, data, { transaction }) {
    const [count] = await ReceivingDocument.update(data, {
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  async deleteDraft(id, { transaction }) {
    const count = await ReceivingDocument.destroy({
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  createLine(documentId, data, { transaction }) {
    return ReceivingLine.create({ ...data, documentId }, { transaction });
  },

  findLine(documentId, lineId, { transaction }) {
    return ReceivingLine.findOne({ where: { id: lineId, documentId }, transaction });
  },

  async updateLine(lineId, data, { transaction }) {
    const [count] = await ReceivingLine.update(data, { where: { id: lineId }, transaction });
    return count > 0;
  },

  deleteLine(lineId, { transaction }) {
    return ReceivingLine.destroy({ where: { id: lineId }, transaction });
  },

  findActiveModel(id, { transaction } = {}) {
    return models.NomenclatureModel.findOne({ where: { id, archivedAt: null }, transaction });
  },

  findActiveSize(id, { transaction } = {}) {
    return models.Size.findOne({ where: { id, archivedAt: null }, transaction });
  },

  createBatch(data, { transaction }) {
    return Batch.create(data, { transaction });
  },

  bulkCreateInstances(rows, { transaction }) {
    return Instance.bulkCreate(rows, { transaction, returning: true });
  },

  bulkCreateMovements(rows, { transaction }) {
    return StockMovement.bulkCreate(rows, { transaction });
  },

  markPosted(id, { batchId, postedByUserId }, { transaction }) {
    return ReceivingDocument.update(
      { status: 'posted', postedAt: new Date(), postedByUserId, batchId },
      { where: { id }, transaction },
    );
  },
};

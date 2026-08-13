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
  { model: models.User, as: 'lastRevisedByUser', attributes: ['id', 'fullName'] },
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

  updateBatch(batchId, data, { transaction }) {
    return Batch.update(data, { where: { id: batchId }, transaction });
  },

  // Задача 22 (редактирование проведённого документа) — ниже.

  lockInstances(instanceIds, { transaction }) {
    if (instanceIds.length === 0) return Promise.resolve([]);
    return Instance.findAll({
      where: { id: instanceIds },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  deleteOwnInstanceEvents(documentId, { transaction }) {
    return models.InstanceEvent.destroy({
      where: { documentType: 'receiving', documentId },
      transaction,
    });
  },

  deleteOwnMovements(documentId, { transaction }) {
    return StockMovement.destroy({ where: { documentType: 'receiving', documentId }, transaction });
  },

  // instance_events.instance_id — ON DELETE CASCADE, но удаляем явно и первыми:
  // порядок должен читаться независимо от знания конкретных onDelete в схеме
  // (тот же порядок копируется в задачу 23). stock_movements.instance_id —
  // ON DELETE RESTRICT, поэтому Instance физически нельзя удалить, пока не
  // удалены её движения — deleteOwnMovements обязателен перед этим методом.
  bulkDeleteInstances(instanceIds, { transaction }) {
    if (instanceIds.length === 0) return Promise.resolve(0);
    return Instance.destroy({ where: { id: instanceIds }, transaction });
  },

  deleteAllLines(documentId, { transaction }) {
    return ReceivingLine.destroy({ where: { documentId }, transaction });
  },

  bulkCreateLines(documentId, lines, { transaction }) {
    return ReceivingLine.bulkCreate(
      lines.map((line, index) => ({ ...line, documentId, sortOrder: index })),
      { transaction, returning: true },
    );
  },

  updateHeaderFields(documentId, data, { transaction }) {
    return ReceivingDocument.update(data, { where: { id: documentId }, transaction });
  },

  markRevised(documentId, { batchId, revisionNumber, revisedByUserId }, { transaction }) {
    return ReceivingDocument.update(
      { batchId, revisionNumber, lastRevisedAt: new Date(), lastRevisedByUserId: revisedByUserId },
      { where: { id: documentId }, transaction },
    );
  },
};

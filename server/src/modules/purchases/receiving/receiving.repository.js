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
  list() {
    return ReceivingDocument.findAll({ include: listInclude, order: [['createdAt', 'DESC']] });
  },

  findById(id) {
    return ReceivingDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: ReceivingLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  // Для проведения: блокируем только шапку документа (SELECT ... FOR UPDATE),
  // чтобы два параллельных запроса на проведение не создали дубли. Строки
  // читаем отдельным запросом — Postgres не разрешает FOR UPDATE через LEFT
  // JOIN (а именно так сформировался бы include при документе без строк).
  async findForPosting(id, { transaction }) {
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

  async updateDocument(id, data) {
    const [count] = await ReceivingDocument.update(data, { where: { id, status: 'draft' } });
    return count > 0;
  },

  async deleteDraft(id) {
    const count = await ReceivingDocument.destroy({ where: { id, status: 'draft' } });
    return count > 0;
  },

  createLine(documentId, data) {
    return ReceivingLine.create({ ...data, documentId });
  },

  findLine(documentId, lineId) {
    return ReceivingLine.findOne({ where: { id: lineId, documentId } });
  },

  async updateLine(lineId, data) {
    const [count] = await ReceivingLine.update(data, { where: { id: lineId } });
    return count > 0;
  },

  deleteLine(lineId) {
    return ReceivingLine.destroy({ where: { id: lineId } });
  },

  findActiveModel(id) {
    return models.NomenclatureModel.findOne({ where: { id, archivedAt: null } });
  },

  findActiveSize(id) {
    return models.Size.findOne({ where: { id, archivedAt: null } });
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

import { models } from '../../../database/models/index.js';

const { ReturnDocument, ReturnLine, Instance, StockMovement } = models;

const instanceInclude = [
  { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
];

const listInclude = [
  { model: models.Employee, as: 'employee', attributes: ['id', 'fullName'] },
  { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
];

const detailInclude = [
  ...listInclude,
  { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  {
    model: ReturnLine,
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

export const returnRepository = {
  list({ employeeId } = {}) {
    return ReturnDocument.findAll({
      where: employeeId ? { employeeId } : {},
      include: listInclude,
      order: [['createdAt', 'DESC']],
    });
  },

  findById(id) {
    return ReturnDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: ReturnLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  // Экземпляры, которые сейчас выданы работнику — источник для выбора строк
  // документа "Возврат" на фронтенде.
  findIssuedInstances(employeeId) {
    return Instance.findAll({
      where: { employeeId, status: 'issued' },
      include: instanceInclude,
      order: [['createdAt', 'ASC']],
    });
  },

  async findForPosting(id, { transaction }) {
    const document = await ReturnDocument.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    const lines = await ReturnLine.findAll({
      where: { documentId: id },
      transaction,
      raw: true,
    });
    return { ...document.get({ plain: true }), lines };
  },

  createDocument(data) {
    return ReturnDocument.create(data);
  },

  async updateDocument(id, data) {
    const [count] = await ReturnDocument.update(data, { where: { id, status: 'draft' } });
    return count > 0;
  },

  async deleteDraft(id) {
    const count = await ReturnDocument.destroy({ where: { id, status: 'draft' } });
    return count > 0;
  },

  createLine(documentId, data) {
    return ReturnLine.create({ ...data, documentId });
  },

  findLine(documentId, lineId) {
    return ReturnLine.findOne({ where: { id: lineId, documentId } });
  },

  async updateLine(lineId, data) {
    const [count] = await ReturnLine.update(data, { where: { id: lineId } });
    return count > 0;
  },

  deleteLine(lineId) {
    return ReturnLine.destroy({ where: { id: lineId } });
  },

  // Блокируем сам экземпляр на время проведения — конкретный instanceId уже
  // известен (не подбирается, как в Выдаче), поэтому ждём снятия блокировки,
  // а не пропускаем занятую запись (skipLocked здесь был бы неверным: пропуск
  // означал бы молча не вернуть именно тот экземпляр, который указан в строке).
  findInstanceForReturn(instanceId, { transaction }) {
    return Instance.findByPk(instanceId, { transaction, lock: transaction.LOCK.UPDATE });
  },

  markInstanceReturned(instanceId, { warehouseId, condition, routeTo }, { transaction }) {
    return Instance.update(
      { status: routeTo ?? 'in_stock', warehouseId, employeeId: null, condition },
      { where: { id: instanceId }, transaction },
    );
  },

  bulkCreateMovements(rows, { transaction }) {
    return StockMovement.bulkCreate(rows, { transaction });
  },

  markPosted(id, { postedByUserId }, { transaction }) {
    return ReturnDocument.update(
      { status: 'posted', postedAt: new Date(), postedByUserId },
      { where: { id }, transaction },
    );
  },
};

import { models } from '../../../database/models/index.js';
import { Op } from 'sequelize';

const { ReturnDocument, ReturnLine, Instance, StockMovement } = models;

const instanceInclude = [
  { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
];

const listInclude = [
  { model: models.Employee, as: 'employee', attributes: ['id', 'fullName'] },
  { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
];

const detailInclude = [
  ...listInclude,
  { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'lastRevisedByUser', attributes: ['id', 'fullName'] },
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
  list({
    employeeId,
    warehouseId,
    status,
    search,
    page = 1,
    limit = 50,
    sort = 'createdAt',
    order = 'DESC',
  } = {}) {
    const where = {};
    if (employeeId) where.employeeId = employeeId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { number: { [Op.iLike]: `%${search}%` } },
        { 'employee.fullName': { [Op.iLike]: `%${search}%` } },
        { 'warehouse.name': { [Op.iLike]: `%${search}%` } },
      ];
    }

    const effectiveSort = ['createdAt', 'documentDate', 'number'].includes(sort)
      ? sort
      : 'createdAt';
    const effectiveOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(limit);

    return ReturnDocument.findAndCountAll({
      where,
      include: listInclude,
      order: [[effectiveSort, effectiveOrder]],
      limit: Number(limit),
      offset,
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

  async findLocked(id, { transaction }) {
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

  async updateDocument(id, data, { transaction }) {
    const [count] = await ReturnDocument.update(data, {
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  async deleteDraft(id, { transaction }) {
    const count = await ReturnDocument.destroy({ where: { id, status: 'draft' }, transaction });
    return count > 0;
  },

  createLine(documentId, data, { transaction }) {
    return ReturnLine.create({ ...data, documentId }, { transaction });
  },

  findLine(documentId, lineId, { transaction }) {
    return ReturnLine.findOne({ where: { id: lineId, documentId }, transaction });
  },

  async updateLine(lineId, data, { transaction }) {
    const [count] = await ReturnLine.update(data, { where: { id: lineId }, transaction });
    return count > 0;
  },

  deleteLine(lineId, { transaction }) {
    return ReturnLine.destroy({ where: { id: lineId }, transaction });
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

  markUnposted(id, { revisionNumber, revisedByUserId }, { transaction }) {
    return ReturnDocument.update(
      {
        status: 'draft',
        postedAt: null,
        postedByUserId: null,
        revisionNumber,
        lastRevisedAt: new Date(),
        lastRevisedByUserId: revisedByUserId,
      },
      { where: { id }, transaction },
    );
  },

  markReposted(id, { revisionNumber, postedByUserId }, { transaction }) {
    return ReturnDocument.update(
      {
        status: 'posted',
        postedAt: new Date(),
        postedByUserId,
        revisionNumber,
        lastRevisedAt: new Date(),
        lastRevisedByUserId: postedByUserId,
      },
      { where: { id }, transaction },
    );
  },
};

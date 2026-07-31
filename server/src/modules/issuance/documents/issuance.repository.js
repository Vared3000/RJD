import { models } from '../../../database/models/index.js';

const { IssuanceDocument, IssuanceLine, Instance, StockMovement, PositionKitItem, Employee } =
  models;

const listInclude = [
  { model: models.Employee, as: 'employee', attributes: ['id', 'fullName'] },
  { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
];

const detailInclude = [
  ...listInclude,
  { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: models.User, as: 'postedByUser', attributes: ['id', 'fullName'] },
  {
    model: IssuanceLine,
    as: 'lines',
    include: [
      {
        model: models.NomenclatureModel,
        as: 'model',
        attributes: ['id', 'name', 'sizeType', 'requiresHeightSize'],
      },
      { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
    ],
  },
];

export const issuanceRepository = {
  list({ employeeId } = {}) {
    return IssuanceDocument.findAll({
      where: employeeId ? { employeeId } : {},
      include: listInclude,
      order: [['createdAt', 'DESC']],
    });
  },

  findById(id) {
    return IssuanceDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: IssuanceLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  // См. приём в receiving.repository.js: FOR UPDATE только на шапку, строки
  // отдельным запросом (Postgres не разрешает FOR UPDATE через LEFT JOIN).
  async findForPosting(id, { transaction }) {
    const document = await IssuanceDocument.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    // Строки — не под блокировкой (лочим только шапку, см. комментарий выше),
    // но с include: нужны названия модели/размера для сообщения о нехватке.
    const lines = await IssuanceLine.findAll({
      where: { documentId: id },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
      transaction,
    });
    return {
      ...document.get({ plain: true }),
      lines: lines.map((line) => line.get({ plain: true })),
    };
  },

  createDocument(data) {
    return IssuanceDocument.create(data);
  },

  async updateDocument(id, data) {
    const [count] = await IssuanceDocument.update(data, { where: { id, status: 'draft' } });
    return count > 0;
  },

  async deleteDraft(id) {
    const count = await IssuanceDocument.destroy({ where: { id, status: 'draft' } });
    return count > 0;
  },

  createLine(documentId, data) {
    return IssuanceLine.create({ ...data, documentId });
  },

  findLine(documentId, lineId) {
    return IssuanceLine.findOne({ where: { id: lineId, documentId } });
  },

  async updateLine(lineId, data) {
    const [count] = await IssuanceLine.update(data, { where: { id: lineId } });
    return count > 0;
  },

  deleteLine(lineId) {
    return IssuanceLine.destroy({ where: { id: lineId } });
  },

  findActiveModel(id) {
    return models.NomenclatureModel.findOne({ where: { id, archivedAt: null } });
  },

  findActiveSize(id) {
    return models.Size.findOne({ where: { id, archivedAt: null } });
  },

  // Подбор экземпляров под строку при проведении — FOR UPDATE SKIP LOCKED,
  // чтобы два одновременно проводимых документа Выдачи не забрали один и
  // тот же экземпляр (без SKIP LOCKED второй запрос просто ждал бы
  // разблокировки и потом всё равно получил бы уже занятые записи в выборке).
  findAvailableInstances(
    { modelId, sizeId, heightSizeId, warehouseId, limit },
    { transaction },
  ) {
    return Instance.findAll({
      where: {
        modelId,
        sizeId,
        heightSizeId: heightSizeId ?? null,
        warehouseId,
        status: 'in_stock',
        archivedAt: null,
      },
      order: [['createdAt', 'ASC']],
      limit,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
  },

  async markInstancesIssued(instanceIds, employeeId, { transaction }) {
    await Instance.update(
      { status: 'issued', employeeId, warehouseId: null },
      { where: { id: instanceIds }, transaction },
    );
  },

  bulkCreateMovements(rows, { transaction }) {
    return StockMovement.bulkCreate(rows, { transaction });
  },

  markPosted(id, { postedByUserId }, { transaction }) {
    return IssuanceDocument.update(
      { status: 'posted', postedAt: new Date(), postedByUserId },
      { where: { id }, transaction },
    );
  },

  // Для автоподбора/предпросмотра комплекта: работник (с должностью,
  // размерами — включая связанные Size-записи с их value для отображения — и
  // активными позициями комплекта его должности.
  async findEmployeeWithKit(employeeId) {
    const employee = await Employee.findByPk(employeeId, {
      include: [
        { model: models.Size, as: 'clothingSize', attributes: ['id', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'value'] },
        { model: models.Size, as: 'shoeSize', attributes: ['id', 'value'] },
        { model: models.Size, as: 'headwearSize', attributes: ['id', 'value'] },
        { model: models.Size, as: 'beltSize', attributes: ['id', 'value'] },
        { model: models.Size, as: 'glovesSize', attributes: ['id', 'value'] },
      ],
    });
    if (!employee || !employee.positionId) return { employee, kitItems: [] };
    const kitItems = await PositionKitItem.findAll({
      where: { positionId: employee.positionId, archivedAt: null },
      include: [
        {
          model: models.NomenclatureModel,
          as: 'model',
          attributes: ['id', 'name', 'sizeType', 'requiresHeightSize'],
        },
      ],
    });
    return { employee, kitItems };
  },

  // Остаток на конкретном складе под конкретные модель/размер/рост — для
  // предпросмотра комплекта (сколько реально есть под позицию, прежде чем
  // добавлять строку в документ).
  countAvailableInstances({ modelId, sizeId, heightSizeId, warehouseId }) {
    return Instance.count({
      where: {
        modelId,
        sizeId: sizeId ?? null,
        heightSizeId: heightSizeId ?? null,
        warehouseId,
        status: 'in_stock',
        archivedAt: null,
      },
    });
  },
};

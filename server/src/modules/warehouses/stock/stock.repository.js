import { Op, fn, col } from 'sequelize';
import { models } from '../../../database/models/index.js';

const { Instance, StockMovement, Warehouse, NomenclatureModel, Size } = models;

export const stockRepository = {
  // Остатки не хранятся отдельной таблицей — источник истины Instance
  // (раздел "Следующая задача" в HANDOFF.md). Группируем по складу/модели/
  // размеру без include, чтобы не собирать вручную полный список колонок
  // GROUP BY для присоединённых таблиц — подписи довешиваются в сервисе.
  getBalanceGroups({ warehouseId, modelId, genderCategory, sizeId, heightSizeId } = {}) {
    const where = { status: 'in_stock', archivedAt: null };
    if (warehouseId) where.warehouseId = warehouseId;
    if (modelId) where.modelId = modelId;
    if (sizeId) where.sizeId = sizeId;
    if (heightSizeId) where.heightSizeId = heightSizeId;

    return Instance.findAll({
      attributes: [
        'warehouseId',
        'modelId',
        'sizeId',
        'heightSizeId',
        [fn('COUNT', col('Instance.id')), 'quantity'],
      ],
      where,
      // Категория по полу — свойство модели, а не экземпляра: фильтруем через
      // INNER JOIN без выборки колонок модели, чтобы не расширять GROUP BY.
      include: genderCategory
        ? [{ model: NomenclatureModel, as: 'model', attributes: [], where: { genderCategory } }]
        : [],
      group: ['warehouseId', 'modelId', 'sizeId', 'heightSizeId'],
      raw: true,
    });
  },

  findWarehouses(ids) {
    return Warehouse.findAll({ where: { id: ids }, attributes: ['id', 'name'] });
  },

  findModels(ids) {
    return NomenclatureModel.findAll({
      where: { id: ids },
      attributes: ['id', 'name', 'article', 'unit', 'genderCategory'],
    });
  },

  findSizes(ids) {
    return Size.findAll({ where: { id: ids }, attributes: ['id', 'type', 'value'] });
  },

  listMovements({
    warehouseId,
    instanceId,
    documentType,
    page = 1,
    limit = 50,
    sort = 'occurredAt',
    order = 'DESC',
  } = {}) {
    const where = {};
    if (instanceId) where.instanceId = instanceId;
    if (documentType) where.documentType = documentType;
    if (warehouseId) {
      where[Op.or] = [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }];
    }

    const effectiveSort = ['occurredAt', 'id'].includes(sort) ? sort : 'occurredAt';
    const effectiveOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(limit);

    return StockMovement.findAndCountAll({
      where,
      include: [
        {
          model: Instance,
          as: 'instance',
          attributes: ['id', 'inventoryNumber'],
          include: [
            { model: NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
            { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
            { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
          ],
        },
        { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
        { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
      ],
      order: [[effectiveSort, effectiveOrder]],
      limit: Number(limit),
      offset,
    });
  },
};

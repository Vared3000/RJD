import { models } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';

export function returnWarehouseOptions() {
  return models.Warehouse.findAll({
    where: { archivedAt: null },
    attributes: ['id', 'name', 'organizationId', 'isPrimaryForReturns'],
    order: [
      ['name', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

export async function activeReturnWarehouse(id, { transaction } = {}) {
  const warehouse = await models.Warehouse.findOne({
    where: { id, archivedAt: null },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.SHARE } : {}),
  });
  if (!warehouse)
    throw ApiError.badRequest(
      'Склад возврата не найден или архивирован. Выберите действующий склад',
    );
  return warehouse;
}

export async function resolveReturnDestination(document, line, { transaction } = {}) {
  const selected = await activeReturnWarehouse(document.warehouseId, { transaction });
  if (line.condition === 'new') {
    if (line.routeTo && line.routeTo !== 'in_stock') {
      throw ApiError.badRequest(
        'Состояние «Новое» несовместимо со стиркой/ремонтом: новые вещи возвращаются на Основной склад',
      );
    }
    const primary = await models.Warehouse.findAll({
      where: {
        organizationId: selected.organizationId,
        isPrimaryForReturns: true,
        archivedAt: null,
      },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.SHARE } : {}),
      limit: 2,
    });
    if (primary.length !== 1) {
      throw ApiError.badRequest(
        'Для этой организации не назначен единственный действующий Основной склад для новых возвратов. Настройте его в справочнике «Склады»',
      );
    }
    return primary[0];
  }
  const target = line.targetWarehouseId
    ? await activeReturnWarehouse(line.targetWarehouseId, { transaction })
    : selected;
  if (target.organizationId !== selected.organizationId) {
    throw ApiError.badRequest(
      'Склад позиции должен принадлежать той же организации, что и склад в шапке возврата',
    );
  }
  return target;
}

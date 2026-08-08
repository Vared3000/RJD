import { models } from '../../../database/models/index.js';

const historyInclude = [
  { model: models.Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
  { model: models.Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
  { model: models.Employee, as: 'fromEmployee', attributes: ['id', 'fullName', 'personnelNumber'] },
  { model: models.Employee, as: 'toEmployee', attributes: ['id', 'fullName', 'personnelNumber'] },
  { model: models.User, as: 'user', attributes: ['id', 'fullName', 'login'] },
];

export const instanceEventsRepository = {
  bulkCreate(events, { transaction } = {}) {
    if (!events.length) return Promise.resolve([]);
    return models.InstanceEvent.bulkCreate(events, { transaction });
  },

  findByInstanceId(instanceId) {
    return models.InstanceEvent.findAll({
      where: { instanceId },
      include: historyInclude,
      order: [
        ['occurredAt', 'ASC'],
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  },
};

export function instanceState(instance) {
  return {
    status: instance?.status ?? null,
    condition: instance?.condition ?? null,
    warehouseId: instance?.warehouseId ?? null,
    employeeId: instance?.employeeId ?? null,
  };
}

export function buildInstanceEvent({
  instance,
  eventType,
  to,
  documentType = null,
  documentId = null,
  occurredAt = new Date(),
  userId = null,
  details = {},
}) {
  const from = instanceState(instance);
  const target = { ...from, ...to };
  return {
    instanceId: instance.id,
    eventType,
    fromStatus: from.status,
    toStatus: target.status,
    fromCondition: from.condition,
    toCondition: target.condition,
    fromWarehouseId: from.warehouseId,
    toWarehouseId: target.warehouseId,
    fromEmployeeId: from.employeeId,
    toEmployeeId: target.employeeId,
    documentType,
    documentId,
    occurredAt,
    userId,
    details,
  };
}

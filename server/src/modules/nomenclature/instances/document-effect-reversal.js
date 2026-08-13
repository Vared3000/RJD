import { Op } from 'sequelize';
import { models } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';
import { assertNoBlockingDocuments } from './instance-dependency-check.js';

function sameValue(left, right) {
  return (left ?? null) === (right ?? null);
}

export async function reverseDocumentEffects({ documentType, documentId }, { transaction }) {
  const events = await models.InstanceEvent.findAll({
    where: { documentType, documentId },
    order: [
      ['occurredAt', 'DESC'],
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    transaction,
    raw: true,
  });
  const instanceIds = [...new Set(events.map((event) => event.instanceId))];

  if (instanceIds.length === 0) {
    throw ApiError.conflict('У проведённого документа не найдены складские операции для отмены');
  }

  const instances = await models.Instance.findAll({
    where: { id: { [Op.in]: instanceIds } },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (instances.length !== instanceIds.length) {
    throw ApiError.conflict('Часть экземпляров документа больше не существует');
  }

  await assertNoBlockingDocuments(
    { instanceIds, ownDocumentType: documentType, ownDocumentId: documentId },
    { transaction },
  );

  const latestEventByInstance = new Map();
  for (const event of events) {
    if (!latestEventByInstance.has(event.instanceId)) {
      latestEventByInstance.set(event.instanceId, event);
    }
  }

  for (const instance of instances) {
    const event = latestEventByInstance.get(instance.id);
    if (
      !sameValue(instance.status, event.toStatus) ||
      !sameValue(instance.condition, event.toCondition) ||
      !sameValue(instance.warehouseId, event.toWarehouseId) ||
      !sameValue(instance.employeeId, event.toEmployeeId)
    ) {
      throw ApiError.conflict(
        `Состояние экземпляра ${instance.inventoryNumber} не совпадает с результатом документа. ` +
          'Сначала проверьте его историю.',
      );
    }

    await instance.update(
      {
        status: event.fromStatus,
        condition: event.fromCondition,
        warehouseId: event.fromWarehouseId,
        employeeId: event.fromEmployeeId,
      },
      { transaction },
    );
  }

  await models.InstanceEvent.destroy({ where: { documentType, documentId }, transaction });
  await models.StockMovement.destroy({ where: { documentType, documentId }, transaction });

  return { instanceIds, events };
}

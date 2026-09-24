import { ApiError } from '../../../utils/api-error.js';
import { createReferenceService } from '../reference-crud.factory.js';
import { warehouseRelationsRepository, warehouseRepository } from './warehouse.repository.js';
import { models } from '../../../database/models/index.js';
import { Op } from 'sequelize';

async function validateRelations(data, { id, current } = {}) {
  if (id && (!current || current.archivedAt)) {
    throw ApiError.notFound('Склад не найден или архивирован');
  }
  if (data.isPrimaryForReturns ?? current?.isPrimaryForReturns) {
    const existing = await models.Warehouse.findOne({
      where: {
        organizationId: data.organizationId ?? current?.organizationId,
        isPrimaryForReturns: true,
        archivedAt: null,
        ...(current ? { id: { [Op.ne]: current.id } } : {}),
      },
    });
    if (existing)
      throw ApiError.conflict(
        'В организации уже назначен Основной склад для новых возвратов. Сначала снимите этот признак с прежнего склада',
      );
  }
  if (data.organizationId === undefined) return;
  const organization = await warehouseRelationsRepository.findActiveOrganization(
    data.organizationId,
  );
  if (!organization) {
    throw ApiError.badRequest('Указанная организация не найдена или архивирована');
  }
}

export const warehouseService = createReferenceService(warehouseRepository, {
  entityName: 'Склад',
  validateRelations,
});

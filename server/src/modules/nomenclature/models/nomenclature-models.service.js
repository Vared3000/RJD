import { ApiError } from '../../../utils/api-error.js';
import { createReferenceService } from '../../catalogs/reference-crud.factory.js';
import {
  nomenclatureModelsRepository,
  nomenclaturePricesRepository,
} from './nomenclature-models.repository.js';

async function validateRelations(data, { current } = {}) {
  const sizeType = data.sizeType !== undefined ? data.sizeType : current?.sizeType;
  const requiresHeightSize =
    data.requiresHeightSize !== undefined
      ? data.requiresHeightSize
      : (current?.requiresHeightSize ?? false);
  if (requiresHeightSize && sizeType !== 'clothing') {
    throw ApiError.badRequest('Рост можно требовать только для моделей с типом размера «Одежда»');
  }
}

export const nomenclatureModelsService = {
  ...createReferenceService(nomenclatureModelsRepository, {
    entityName: 'Модель номенклатуры',
    validateRelations,
  }),

  listPrices(modelId, options) {
    return nomenclaturePricesRepository.findByModel(modelId, options);
  },
};

import { ApiError } from '../../../utils/api-error.js';
import { batchesRepository } from './batches.repository.js';

function number(value) {
  return Number(value ?? 0);
}

function mapStats(row) {
  return {
    initialQuantity: number(row?.initialQuantity),
    inStock: number(row?.inStock),
    issued: number(row?.issued),
    inService: number(row?.inService),
    writtenOff: number(row?.writtenOff),
  };
}

export const batchesService = {
  async list(options) {
    const { rows, count } = await batchesRepository.list(options);
    const batchIds = rows.map((batch) => batch.id);
    const [documents, aggregates] = await Promise.all([
      batchesRepository.findDocuments(batchIds),
      batchesRepository.aggregateInstances(batchIds),
    ]);
    const documentByBatch = new Map(documents.map((document) => [document.batchId, document]));
    const statsByBatch = new Map(aggregates.map((row) => [row.batchId, mapStats(row)]));
    return {
      count,
      rows: rows.map((batch) => ({
        ...batch.get({ plain: true }),
        receivingDocument: documentByBatch.get(batch.id) ?? null,
        ...mapStats(statsByBatch.get(batch.id)),
      })),
    };
  },

  async getById(id, options) {
    const batch = await batchesRepository.findById(id);
    if (!batch) throw ApiError.notFound('Партия не найдена');
    const [aggregates, instances] = await Promise.all([
      batchesRepository.aggregateInstances([id]),
      batchesRepository.listInstances(id, options),
    ]);
    return {
      item: {
        ...batch.get({ plain: true }),
        ...mapStats(aggregates[0]),
        instances: instances.rows,
      },
      instanceCount: instances.count,
    };
  },
};

import { stockRepository } from './stock.repository.js';

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

export const stockService = {
  async getBalances(filters) {
    const groups = await stockRepository.getBalanceGroups(filters);

    const [warehouses, nomenclatureModels, sizes] = await Promise.all([
      stockRepository.findWarehouses(uniqueIds(groups.map((g) => g.warehouseId))),
      stockRepository.findModels(uniqueIds(groups.map((g) => g.modelId))),
      stockRepository.findSizes(
        uniqueIds(groups.flatMap((g) => [g.sizeId, g.heightSizeId])),
      ),
    ]);

    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const modelById = new Map(nomenclatureModels.map((m) => [m.id, m]));
    const sizeById = new Map(sizes.map((s) => [s.id, s]));

    return groups.map((group) => ({
      warehouse: warehouseById.get(group.warehouseId) ?? null,
      model: modelById.get(group.modelId) ?? null,
      size: sizeById.get(group.sizeId) ?? null,
      heightSize: sizeById.get(group.heightSizeId) ?? null,
      quantity: Number(group.quantity),
      totalCost: group.totalCost != null ? Number(group.totalCost) : 0,
    }));
  },

  listMovements(filters) {
    return stockRepository.listMovements(filters);
  },
};

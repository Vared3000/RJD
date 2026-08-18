import { stockRepository } from './stock.repository.js';

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

export const stockService = {
  async getBalances(filters = {}) {
    const groups = await stockRepository.getBalanceGroups(filters);

    const [warehouses, nomenclatureModels, sizes] = await Promise.all([
      stockRepository.findWarehouses(uniqueIds(groups.map((g) => g.warehouseId))),
      stockRepository.findModels(uniqueIds(groups.map((g) => g.modelId))),
      stockRepository.findSizes(uniqueIds(groups.flatMap((g) => [g.sizeId, g.heightSizeId]))),
    ]);

    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const modelById = new Map(nomenclatureModels.map((m) => [m.id, m]));
    const sizeById = new Map(sizes.map((s) => [s.id, s]));

    const rows = groups.map((group) => ({
      warehouse: warehouseById.get(group.warehouseId) ?? null,
      model: modelById.get(group.modelId) ?? null,
      size: sizeById.get(group.sizeId) ?? null,
      heightSize: sizeById.get(group.heightSizeId) ?? null,
      quantity: Number(group.quantity),
    }));

    const sortValues = {
      warehouse: (row) => row.warehouse?.name ?? '',
      model: (row) => row.model?.name ?? '',
      size: (row) => row.size?.value ?? '',
      height: (row) => row.heightSize?.value ?? '',
      quantity: (row) => row.quantity,
    };
    const sort = sortValues[filters.sort] ? filters.sort : 'warehouse';
    const direction = String(filters.order).toUpperCase() === 'DESC' ? -1 : 1;
    const value = sortValues[sort];
    return rows.sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (typeof leftValue === 'number') return (leftValue - rightValue) * direction;
      const primary = String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true });
      if (primary !== 0) return primary * direction;
      return `${left.warehouse?.name}${left.model?.name}${left.size?.value}${left.heightSize?.value}`.localeCompare(
        `${right.warehouse?.name}${right.model?.name}${right.size?.value}${right.heightSize?.value}`,
        'ru',
        { numeric: true },
      );
    });
  },

  listMovements(filters) {
    return stockRepository.listMovements(filters);
  },
};

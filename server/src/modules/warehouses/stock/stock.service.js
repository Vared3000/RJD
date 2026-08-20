import { stockRepository } from './stock.repository.js';
import { GENDER_CATEGORIES } from '../../../database/models/nomenclature-model.model.js';

export const GENDER_CATEGORY_LABELS = {
  male: 'Мужское',
  female: 'Женское',
  unisex: 'Унисекс',
  unspecified: 'Не определено',
};

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

// Порядок столбцов составной сортировки по умолчанию (раздел Б ТЗ от
// 19.08.2026): Склад -> Категория по полу -> Модель -> Размер -> Рост.
// При клике по заголовку колонка становится первичным ключом (со своим
// направлением), а этот же список — фиксированные вторичные ключи
// (всегда по возрастанию), чтобы строки не «прыгали» между обновлениями.
const DEFAULT_CHAIN = ['warehouse', 'genderCategory', 'model', 'size', 'height'];
const SORTABLE_KEYS = [...DEFAULT_CHAIN, 'quantity'];
const GENDER_CATEGORY_RANK = Object.fromEntries(GENDER_CATEGORIES.map((value, i) => [value, i]));

function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'ru', { numeric: true });
}

// Пустой размер/рост всегда в конце — независимо от направления сортировки
// этой колонки (см. критерии приёмки: «после заполненных при возрастании»,
// для убывания отдельно не оговорено — оставляем то же правило обоими
// направлениями ради предсказуемости).
function compareSizeLike(a, b, direction) {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty || bEmpty) return aEmpty ? 1 : -1;
  return compareText(a, b) * direction;
}

function compareByKey(key, left, right, direction) {
  if (key === 'size') return compareSizeLike(left.size?.value, right.size?.value, direction);
  if (key === 'height') {
    return compareSizeLike(left.heightSize?.value, right.heightSize?.value, direction);
  }
  if (key === 'quantity') return (left.quantity - right.quantity) * direction;
  if (key === 'genderCategory') {
    const a = GENDER_CATEGORY_RANK[left.model?.genderCategory ?? 'unspecified'] ?? 99;
    const b = GENDER_CATEGORY_RANK[right.model?.genderCategory ?? 'unspecified'] ?? 99;
    return (a - b) * direction;
  }
  const value = key === 'warehouse' ? 'warehouse' : 'model';
  return compareText(left[value]?.name, right[value]?.name) * direction;
}

function sortRows(rows, { sort, order } = {}) {
  const primary = SORTABLE_KEYS.includes(sort) ? sort : 'warehouse';
  const direction = String(order).toUpperCase() === 'DESC' ? -1 : 1;
  const chain = [primary, ...DEFAULT_CHAIN.filter((key) => key !== primary)];
  return [...rows].sort((left, right) => {
    for (const key of chain) {
      const cmp = compareByKey(key, left, right, key === primary ? direction : 1);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
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

    const rows = groups.map((group) => {
      const model = modelById.get(group.modelId) ?? null;
      return {
        warehouse: warehouseById.get(group.warehouseId) ?? null,
        model,
        genderCategoryLabel: GENDER_CATEGORY_LABELS[model?.genderCategory ?? 'unspecified'],
        size: sizeById.get(group.sizeId) ?? null,
        heightSize: sizeById.get(group.heightSizeId) ?? null,
        quantity: Number(group.quantity),
      };
    });

    return sortRows(rows, filters);
  },

  listMovements(filters) {
    return stockRepository.listMovements(filters);
  },
};

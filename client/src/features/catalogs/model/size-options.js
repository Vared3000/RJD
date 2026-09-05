const numericCollator = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});

export const SIZE_TYPE_LABELS = {
  clothing: 'Одежда',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  gloves: 'Перчатки',
  belt: 'Ремень',
  height: 'Рост',
};

const FILTER_GROUP_ORDER = ['clothing', 'shoe', 'headwear', 'gloves', 'belt'];

// Составные значения вида "56/190" пришли из старых актов. В новых
// документах размер и рост выбираются раздельно, поэтому такие записи
// не должны дублировать оба измерения в поле "Размер".
export function isAtomicSize(size) {
  const value = String(size?.value ?? '').trim();
  return /^\d+$/.test(value);
}

const PLAUSIBLE_RANGES = {
  clothing: [38, 70],
  height: [140, 220],
  shoe: [20, 55],
  headwear: [48, 65],
  belt: [60, 180],
  gloves: [5, 15],
};

export function isPlausibleAtomicSize(size) {
  if (!isAtomicSize(size)) return false;
  const range = PLAUSIBLE_RANGES[size.type];
  if (!range) return true;
  const value = Number(size.value);
  return value >= range[0] && value <= range[1];
}

export function compareSizes(left, right) {
  const typeComparison = numericCollator.compare(left.type ?? '', right.type ?? '');
  if (typeComparison !== 0) return typeComparison;
  return compareSizeValues(left, right);
}

export function compareSizeValues(left, right) {
  const valueComparison = numericCollator.compare(
    String(left.value ?? ''),
    String(right.value ?? ''),
  );
  if (valueComparison !== 0) return valueComparison;
  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

export function buildSizeOptionGroups(sizes, type) {
  const grouped = new Map();

  for (const size of sizes ?? []) {
    if (size.type === 'height' || (type && size.type !== type)) continue;
    const groupKey = FILTER_GROUP_ORDER.includes(size.type) ? size.type : 'other';
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(size);
  }

  const orderedKeys = [...FILTER_GROUP_ORDER, 'other'];
  return orderedKeys
    .filter((groupKey) => grouped.has(groupKey))
    .map((groupKey) => ({
      value: groupKey,
      label: SIZE_TYPE_LABELS[groupKey] ?? 'Прочее',
      options: grouped
        .get(groupKey)
        .sort(compareSizeValues)
        .map((size) => ({
          value: size.id,
          label:
            groupKey === 'other'
              ? `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`
              : String(size.value),
        })),
    }));
}

export function atomicSizeOfType(type) {
  return (size) => size.type === type && isPlausibleAtomicSize(size);
}

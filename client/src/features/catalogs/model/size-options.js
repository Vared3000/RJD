const numericCollator = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});

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
  return numericCollator.compare(String(left.value ?? ''), String(right.value ?? ''));
}

export function atomicSizeOfType(type) {
  return (size) => size.type === type && isPlausibleAtomicSize(size);
}

const POSITION_NAME_CORRECTIONS = new Map([
  ['дежурный по по выдаче справок', 'Дежурный по выдаче справок'],
]);

export function normalizePositionName(value) {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return name;

  const corrected = POSITION_NAME_CORRECTIONS.get(name.toLocaleLowerCase('ru-RU')) ?? name;
  return corrected[0].toLocaleUpperCase('ru-RU') + corrected.slice(1);
}

export function parsePositionVariant(value) {
  const normalizedName = normalizePositionName(value);
  const variantMatch = normalizedName.match(/\s+(мужской|женский)\s+комплект$/iu);
  if (!variantMatch) return { name: normalizedName, gender: null };

  return {
    name: normalizePositionName(normalizedName.slice(0, variantMatch.index)),
    gender: variantMatch[1].toLocaleLowerCase('ru-RU') === 'мужской' ? 'male' : 'female',
  };
}

// Единый порядок изделий из эталонного листа «прил 1.7.»
// файла «Приложение 1.7, 1.5 сентябрь 2026 КЛНГ.xlsx».
// Мужская и женская последовательности объединены по общим опорным
// позициям (джемпер, шарф, ремень, сумка, бейдж), поэтому порядок
// внутри каждого комплекта точно совпадает с эталоном.
export const CANONICAL_NOMENCLATURE_ORDER = Object.freeze([
  'Пальто форменное утепленное темно-синее',
  'Плащ форменный утепленный темно-синий',
  'Жакет форменный темно-синий',
  'Юбка форменная темно-синяя',
  'Брюки форменные темно-синие',
  'Блузка форменная с длинными рукавами белая',
  'Блузка форменная с длинными рукавами голубая',
  'Блузка форменная с короткими рукавами белая',
  'Блузка форменная с короткими рукавами голубая',
  'Шарф шейный форменный терракотовый',
  'Куртка форменная утепленная темно-серый',
  'Плащ форменный утепленный темно-синий м.',
  'Пиджак форменный темно-синий',
  'Брюки форменные темно-синие м.',
  'Рубашка форменная с длинными рукавами белая',
  'Рубашка форменная с длинными рукавами голубая',
  'Рубашка форменная с короткими рукавами белая',
  'Рубашка форменная с короткими рукавами голубая',
  'Галстук регат форменный',
  'Зажим для галстука',
  'Джемпер форменный терракотовый',
  'Жилет форменный темно-синий',
  'Головной убор форменный из трикотажа темно-синий',
  'Головной убор форменный женский из фетра красный',
  'Головной убор форменный утепленный (капюшон) терракотовый',
  'Шапка форменная зимняя терракотовая',
  'Перчатки утепленные черные',
  'Варежки утепленные терракотовые',
  'Головной убор форменный с козырьком из фетра темно-синий',
  'Кепка форменная темно-синяя',
  'Шапка форменная зимняя коричневая',
  'Перчатки утепленные форменные черные',
  'Шарф форменный трикотажный терракотовый',
  'Ремень классический терракотовый',
  'Сумка форменная темно-синяя',
  'Бейдж именной',
]);

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim();

const rankByName = new Map(
  CANONICAL_NOMENCLATURE_ORDER.map((name, index) => [normalize(name), index]),
);

function textCompare(left, right) {
  return normalize(left).localeCompare(normalize(right), 'ru', { numeric: true });
}

export function nomenclatureRank(name) {
  return rankByName.get(normalize(name)) ?? Number.MAX_SAFE_INTEGER;
}

export function compareNomenclatureRows(left, right) {
  const rank = nomenclatureRank(left?.modelName) - nomenclatureRank(right?.modelName);
  if (rank !== 0) return rank;
  return (
    textCompare(left?.modelName, right?.modelName) ||
    textCompare(left?.sizeValue ?? left?.sizeLabel, right?.sizeValue ?? right?.sizeLabel) ||
    textCompare(left?.heightValue ?? left?.heightLabel, right?.heightValue ?? right?.heightLabel) ||
    textCompare(left?.modelId, right?.modelId)
  );
}

export function sortNomenclatureRows(rows, groupKey = () => '') {
  return [...rows].sort(
    (left, right) =>
      textCompare(groupKey(left), groupKey(right)) || compareNomenclatureRows(left, right),
  );
}

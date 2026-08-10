import { num, sumBy } from './money.js';

// Общая форма данных для табличных актов (ФПУ-26, Приложения 1.5 и 1.7):
// набор колонок с описанием форматирования + строки + автоматически
// посчитанные итоги по колонкам, помеченным `total: true`.
export function baseData(context, title, sheetName, columns, rows, formulas) {
  const totalKeys = columns.filter((column) => column.total).map((column) => column.key);
  return {
    title,
    sheetName,
    dpo: context.dpo,
    from: context.fromText,
    to: context.toText,
    columns,
    rows,
    formulas,
    totals: Object.fromEntries(totalKeys.map((key) => [key, sumBy(rows, key)])),
  };
}

// Архивные кандидаты (`source_import_records`) могут повторяться между
// строками разных импортов одного файла — дедупликация по полному набору
// значимых полей, а не только по ключу источника.
export function importedCandidates(context, withEmployee) {
  const unique = new Map();
  for (const source of context.importedNomenclature) {
    const candidate = source.payload;
    if (Boolean(candidate.employee) !== withEmployee) continue;
    const key = JSON.stringify([
      candidate.employee?.personnelNumber ?? candidate.employee?.fullName ?? null,
      candidate.position ?? null,
      candidate.name,
      candidate.unit,
      num(candidate.quantity),
      num(candidate.coverageDays),
      num(candidate.priceWithoutVat),
      num(candidate.priceWithVat),
      candidate.effectiveDate,
    ]);
    if (!unique.has(key)) unique.set(key, { ...candidate, _source: source });
  }
  return [...unique.values()];
}

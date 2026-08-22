// warehouseQuantity — фактическое число единиц в складском документе /
// экземплярах / задании на сборку.
// accountingQuantity — количество для закрывающих учётных форм (ФПУ-26,
// приложения 1.5/1.7, УПД): не более 1 на позицию, даже если со склада
// выдано несколько штук. Не путать с нормой комплекта должности.
export function warehouseQuantity(value) {
  return Math.max(0, Math.trunc(Number(value ?? 0)));
}

export function accountingQuantity(value) {
  const qty = warehouseQuantity(value);
  return qty > 0 ? 1 : 0;
}

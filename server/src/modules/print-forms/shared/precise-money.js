// Нормы аренды хранятся с точностью до 4 знаков. Приложения 1.5/1.7
// рассчитывают строку с этой точностью и округляют только итог акта.
export function preciseMoney(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 1e6) / 1e6 : 0;
}

export function preciseLine(quantity, unitPrice, vatRate) {
  const priceWithoutVat = preciseMoney(unitPrice);
  const subtotalWithoutVat = preciseMoney(Number(quantity) * priceWithoutVat);
  const vatAmount = preciseMoney((subtotalWithoutVat * Number(vatRate)) / 100);
  return {
    priceWithoutVat,
    subtotalWithoutVat,
    vatAmount,
    totalWithVat: preciseMoney(subtotalWithoutVat + vatAmount),
  };
}

export function roundedActTotal(rows, key) {
  return (
    Math.round((rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) + Number.EPSILON) * 100) /
    100
  );
}

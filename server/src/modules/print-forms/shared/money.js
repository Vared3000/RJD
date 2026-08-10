export function num(value) {
  return Number(value ?? 0);
}

// В архивных Excel-актах встречаются цены с пятью знаками после запятой.
// Не обрезаем их до точности БД: иначе сумма НДС в воспроизведённой форме
// может отличаться от подписанного оригинала на одну копейку.
export function money(value) {
  return Number(num(value).toFixed(9));
}

export function sumBy(rows, key) {
  return money(rows.reduce((sum, row) => sum + num(row[key]), 0));
}

export function calculateMoney(quantity, priceWithoutVat, vatRate, explicitPriceWithVat) {
  const costWithoutVat = money(quantity * priceWithoutVat);
  const priceWithVat = explicitPriceWithVat
    ? money(explicitPriceWithVat)
    : money(priceWithoutVat * (1 + vatRate / 100));
  const totalWithVat = explicitPriceWithVat
    ? money(quantity * priceWithVat)
    : money(costWithoutVat + costWithoutVat * (vatRate / 100));
  const vatAmount = money(totalWithVat - costWithoutVat);
  return {
    costWithoutVat,
    vatAmount,
    totalWithVat,
    priceWithVat,
  };
}

export function priceValues(price, fallback = 0) {
  const priceWithoutVat = money(price?.priceWithoutVat ?? fallback);
  const explicitWithVat = num(price?.priceWithVat);
  const calculatedRate =
    explicitWithVat > 0 && priceWithoutVat > 0 ? (explicitWithVat / priceWithoutVat - 1) * 100 : 5;
  const vatRate = money(price?.vatRate ?? calculatedRate);
  return {
    priceWithoutVat,
    priceWithVat: explicitWithVat ? money(explicitWithVat) : 0,
    vatRate,
  };
}

export function selectPriceAt(prices, modelId, dpoId, operationDate) {
  const eligible = prices.filter(
    (price) =>
      price.modelId === modelId && (!price.effectiveDate || price.effectiveDate <= operationDate),
  );
  return (
    eligible.find((price) => price.dpoId === dpoId) ?? eligible.find((price) => price.dpoId == null)
  );
}

// Строка выдачи хранит ценовой снимок на момент проведения (см. релиз 12) —
// он приоритетнее текущего справочника цен, чтобы старые документы не
// пересчитывались при изменении цены.
export function priceForLine(context, document, line) {
  if (line.priceWithoutVatSnapshot != null) {
    return {
      priceWithoutVat: line.priceWithoutVatSnapshot,
      priceWithVat: line.priceWithVatSnapshot,
      vatRate: line.vatRateSnapshot,
      effectiveDate: line.priceEffectiveDate,
      id: line.priceSourceId,
    };
  }
  return selectPriceAt(context.prices, line.modelId, context.dpo.id, String(document.documentDate));
}

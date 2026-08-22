export function num(value) {
  return Number(value ?? 0);
}

/** Округление учётных сумм до копеек в меньшую сторону (релиз Ф). */
export function floorMoney(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  // Сначала сбрасываем двоичный шум float, затем floor до копеек.
  const normalized = Math.round(n * 1e6) / 1e6;
  return Math.floor(normalized * 100) / 100;
}

export function money(value) {
  return floorMoney(value);
}

export function sumBy(rows, key) {
  return money(rows.reduce((sum, row) => sum + num(row[key]), 0));
}

export function calculateMoney(quantity, priceWithoutVat, vatRate, explicitPriceWithVat) {
  const q = num(quantity);
  const price = floorMoney(priceWithoutVat);
  const rate = num(vatRate);

  const costWithoutVat = floorMoney(q * price);

  if (explicitPriceWithVat != null && explicitPriceWithVat !== '') {
    const priceWithVat = floorMoney(explicitPriceWithVat);
    const totalWithVat = floorMoney(q * priceWithVat);
    const vatAmount = floorMoney(totalWithVat - costWithoutVat);
    return {
      costWithoutVat,
      vatAmount,
      totalWithVat,
      priceWithVat,
    };
  }

  const vatAmount = floorMoney((costWithoutVat * rate) / 100);
  const totalWithVat = floorMoney(costWithoutVat + vatAmount);
  const priceWithVat = floorMoney(price * (1 + rate / 100));

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
  const vatRate = num(price?.vatRate ?? calculatedRate);
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

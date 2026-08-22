import { printFormsRepository } from '../print-forms.repository.js';
import { loadContext } from '../shared/load-context.js';
import { money, sumBy } from '../shared/money.js';
import { accountingQuantity } from '../shared/quantities.js';
import { buildFpu26 } from '../fpu-26/fpu-26.builder.js';

export async function loadUpdContext(query) {
  const context = await loadContext(query);
  context.importedUpd = await printFormsRepository.findImportedUpd({
    from: context.from,
    to: context.to,
  });
  return context;
}

// При отсутствии архивного УПД строки переиспользуются из ФПУ-26 за тот же
// период — тот же набор проведённых выдач, просто в форме счёта-фактуры.
export function buildUpd(context) {
  let rows;
  let documentNumber = null;
  let paymentDocumentNumber = null;
  let paymentDocumentDate = null;
  let documentDate = context.toText;
  // Проведённые выдачи — источник истины. Архивный УПД используется только
  // когда за выбранный период в системе ещё нет живых документов выдачи.
  if (context.documents.length === 0 && context.importedUpd.length > 0) {
    const groups = new Map();
    for (const source of context.importedUpd) {
      const candidate = source.payload;
      const key = candidate.documentNumber || candidate.effectiveDate || 'archive';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(candidate);
    }
    const selected = [...groups.values()].sort(
      (left, right) =>
        String(right[0]?.effectiveDate ?? '').localeCompare(String(left[0]?.effectiveDate ?? '')) ||
        right.length - left.length,
    )[0];
    const first = selected[0];
    documentNumber = first.documentNumber;
    paymentDocumentNumber = first.paymentDocumentNumber;
    paymentDocumentDate = first.paymentDocumentDate;
    documentDate = first.effectiveDate || documentDate;
    rows = selected.map((candidate) => ({
      article: candidate.article || '',
      modelName: candidate.name,
      unitCode: candidate.unitCode || '796',
      unit: candidate.unit || 'шт',
      // Учётное кол-во; архивные суммы не пересчитываем (sourceValues).
      quantity: accountingQuantity(candidate.quantity),
      priceWithoutVat: money(candidate.priceWithoutVat),
      costWithoutVat: money(candidate.subtotalWithoutVat),
      vatRate: Number(candidate.vatRate) || 5,
      vatAmount: money(candidate.vatAmount),
      totalWithVat: money(candidate.totalWithVat),
    }));
  } else {
    const fpu = buildFpu26(context);
    rows = fpu.rows.map((row) => ({
      article: row.article || '',
      modelName: row.modelName,
      unitCode: '796',
      unit: row.unit || 'шт',
      quantity: row.quantity,
      priceWithoutVat: row.priceWithoutVat,
      costWithoutVat: row.costWithoutVat,
      vatRate: row.vatRate,
      vatAmount: row.vatAmount,
      totalWithVat: row.totalWithVat,
    }));
  }
  return {
    title: 'Универсальный передаточный документ',
    sheetName: 'УПД',
    dpo: context.dpo,
    documentNumber: documentNumber || 'Б/Н',
    documentDate,
    paymentDocumentNumber,
    paymentDocumentDate,
    rows,
    totals: {
      costWithoutVat: sumBy(rows, 'costWithoutVat'),
      vatAmount: sumBy(rows, 'vatAmount'),
      totalWithVat: sumBy(rows, 'totalWithVat'),
    },
  };
}

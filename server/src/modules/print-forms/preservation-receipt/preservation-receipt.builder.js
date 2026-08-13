import { liveSourceEntry, sourceFields } from '../shared/print-form-data-sources.js';

function rowKey(document, line) {
  return JSON.stringify([document.employeeId, line.modelId, line.model?.unit ?? 'шт.']);
}

export async function buildPreservationReceipt(context) {
  const grouped = new Map();

  for (const document of context.documents) {
    for (const line of document.lines) {
      const source = liveSourceEntry({ dpo: context.dpo, document, line });
      const key = rowKey(document, line);
      const current = grouped.get(key) ?? {
        employeeId: document.employeeId,
        employeeName: document.employee?.fullName ?? '',
        personnelNumber: document.employee?.personnelNumber ?? '',
        modelName: line.model?.name ?? '',
        unit: line.model?.unit ?? 'шт.',
        quantity: 0,
        signature: '',
        sourceReferences: [],
        ...sourceFields(source),
      };
      current.quantity += Number(line.quantity ?? 0);
      current.sourceReferences.push(source.sourceReference);
      grouped.set(key, current);
    }
  }

  const rows = [...grouped.values()]
    .map((row) => ({
      ...row,
      sourceReference: [...new Set(row.sourceReferences)].join(', '),
    }))
    .sort((left, right) => {
      const employeeOrder = `${left.employeeName}${left.personnelNumber}`.localeCompare(
        `${right.employeeName}${right.personnelNumber}`,
        'ru',
      );
      return employeeOrder || left.modelName.localeCompare(right.modelName, 'ru');
    });

  return {
    title: 'Сохранная расписка передачи комплекта форменной одежды',
    sheetName: 'Сохранная расписка',
    dpo: context.dpo,
    from: context.fromText,
    to: context.toText,
    rows,
  };
}

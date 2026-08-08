function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/\s+/g, ' ');
}

function employeeKey(employee) {
  return normalized(employee?.personnelNumber || employee?.fullName);
}

export function liveSourceEntry({ dpo, document, line }) {
  return {
    source: 'live',
    sourceKey: line.id,
    sourceReference: `${document.number || document.id}:${line.id}`,
    dpoKey: normalized(dpo?.name || dpo?.id),
    employeeKey: employeeKey(document.employee),
    documentKey: normalized(document.number || document.id),
    modelKey: normalized(line.model?.name || line.modelId),
    operationDate: String(document.documentDate),
    quantity: Number(line.quantity ?? 0),
    document,
    line,
  };
}

export function archiveSourceEntry({ dpo, source, candidate }) {
  return {
    source: 'archive',
    sourceKey: source.sourceKey,
    sourceReference: [source.sourceFile, source.sheetName, source.rowNumber]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .join(' · '),
    dpoKey: normalized(candidate.dpo || dpo?.name || dpo?.id),
    employeeKey: employeeKey(candidate.employee),
    documentKey: normalized(candidate.documentNumber || candidate.documentId),
    modelKey: normalized(candidate.name || candidate.modelId),
    operationDate: String(candidate.effectiveDate ?? ''),
    quantity: Number(candidate.quantity ?? 0),
    sourceRecord: source,
    candidate,
  };
}

function strictKey(entry) {
  return [
    entry.dpoKey,
    entry.employeeKey,
    entry.documentKey,
    entry.modelKey,
    entry.operationDate,
    entry.quantity,
    entry.sourceKey,
  ].join('\u0000');
}

function businessKeys(entry) {
  const base = [
    entry.dpoKey,
    entry.employeeKey,
    entry.modelKey,
    entry.operationDate,
    entry.quantity,
  ].join('\u0000');
  return entry.documentKey ? [`${base}\u0000${entry.documentKey}`, base] : [base];
}

// Живые строки имеют приоритет. Строгое равенство учитывает исходный ключ
// импорта, а бизнес-ключ позволяет сопоставить старый архив, где UUID живого
// документа ещё не сохранялся.
export function mergeSourceEntries(liveEntries, archiveEntries) {
  const liveKeys = new Set(liveEntries.flatMap(businessKeys));
  const seenArchive = new Set();
  const archiveOnly = [];
  for (const entry of archiveEntries) {
    const key = strictKey(entry);
    if (seenArchive.has(key)) continue;
    seenArchive.add(key);
    if (businessKeys(entry).some((businessKey) => liveKeys.has(businessKey))) continue;
    archiveOnly.push(entry);
  }
  return [...liveEntries, ...archiveOnly];
}

export function sourceFields(entry) {
  return {
    dataSource: entry.source,
    dataSourceLabel: entry.source === 'live' ? 'Учётная система' : 'Архивный импорт',
    sourceReference: entry.sourceReference,
  };
}

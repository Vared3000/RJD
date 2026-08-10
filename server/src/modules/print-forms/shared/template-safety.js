import AdmZip from 'adm-zip';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

// Разрешённый набор путей внутри OOXML .xlsx — allow-list, а не deny-list:
// отклоняем всё, чего нет в списке, а не только явно поименованные угрозы
// (макросы, внешние ссылки). Так под защитой оказываются и непоименованные
// векторы вроде встроенных OLE-объектов (xl/embeddings/*.bin).
const ALLOWED_ENTRY_PATTERNS = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/.*\.rels$/,
  /^docProps\/(app|core)\.xml$/,
  /^xl\/workbook\.xml$/,
  /^xl\/_rels\/workbook\.xml\.rels$/,
  /^xl\/worksheets\/sheet\d+\.xml$/,
  /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/,
  /^xl\/theme\/theme\d+\.xml$/,
  /^xl\/styles\.xml$/,
  /^xl\/sharedStrings\.xml$/,
  /^xl\/calcChain\.xml$/,
  /^xl\/printerSettings\/printerSettings\d+\.bin$/,
];

function isAllowedEntry(entryName) {
  return ALLOWED_ENTRY_PATTERNS.some((pattern) => pattern.test(entryName));
}

// Проверка безопасности загруженного .xlsx до того, как exceljs полностью
// распакует и разберёт файл: список записей архива без распаковки содержимого
// (быстро и не даёт файлу-бомбе развернуться в памяти), лимит размера и
// заявленного несжатого объёма, отклонение неизвестных путей.
export function inspectUploadSafety(buffer) {
  const errors = [];
  if (buffer.length > MAX_UPLOAD_BYTES) {
    errors.push(`Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`);
    return { safe: false, errors };
  }

  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    errors.push('Файл повреждён или не является архивом .xlsx');
    return { safe: false, errors };
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    errors.push('Архив .xlsx пуст');
    return { safe: false, errors };
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue; // папки в OOXML не несут содержимого — сама структура zip
    totalUncompressed += entry.header.size;
    if (!isAllowedEntry(entry.entryName)) {
      errors.push(`Запись архива не разрешена: ${entry.entryName}`);
    }
  }
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    errors.push('Суммарный несжатый объём архива подозрительно велик');
  }

  return { safe: errors.length === 0, errors };
}

function rangesOverlap(a, b) {
  return a.top <= b.bottom && b.top <= a.bottom && a.left <= b.right && b.left <= a.right;
}

// Геометрическая проверка объединений ячеек на пересечение — независимо от
// того, бросит ли исключение сама exceljs при попытке смержить пересекающиеся
// диапазоны.
export function findOverlappingMerges(merges) {
  for (let i = 0; i < merges.length; i += 1) {
    for (let j = i + 1; j < merges.length; j += 1) {
      if (rangesOverlap(merges[i], merges[j])) {
        return [merges[i], merges[j]];
      }
    }
  }
  return null;
}

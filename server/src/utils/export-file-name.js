const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const INVALID_WINDOWS_CHARACTERS = /[\\/:*?"<>|]/g;
const TRAILING_UNSAFE_CHARACTERS = /[.\s_]+$/g;

function dateParts(value) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const daysInMonth = new Date(Date.UTC(Number(year), monthNumber, 0)).getUTCDate();
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > daysInMonth) {
    return null;
  }
  return { year, month, day, monthNumber, dayNumber, daysInMonth };
}

export function sanitizeFileNamePart(value) {
  return String(value ?? '')
    .replace(INVALID_WINDOWS_CHARACTERS, ' ')
    .replace(/[«»“”„]/g, '')
    .trim()
    .replace(/[\s_]+/g, '_')
    .replace(/^[_.]+|[_\s]+$/g, '');
}

export function formatFileDate(value) {
  const parsed = dateParts(value);
  return parsed ? `${parsed.day}-${parsed.month}-${parsed.year}` : null;
}

export function formatFileMonth(value) {
  const parsed = dateParts(String(value ?? '').length === 7 ? `${value}-01` : value);
  return parsed ? `${MONTH_NAMES[parsed.monthNumber - 1]}_${parsed.year}` : null;
}

export function formatFilePeriod(from, to) {
  const fromParts = dateParts(from);
  const toParts = dateParts(to);
  if (!fromParts || !toParts) return [];
  if (
    fromParts.year === toParts.year &&
    fromParts.month === toParts.month &&
    fromParts.dayNumber === 1 &&
    toParts.dayNumber === toParts.daysInMonth
  ) {
    return [`${MONTH_NAMES[fromParts.monthNumber - 1]}_${fromParts.year}`];
  }
  const fromText = formatFileDate(from);
  const toText = formatFileDate(to);
  return fromText === toText ? [fromText] : [fromText, toText];
}

export function shortenEmployeeName(fullName) {
  const words = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const initials = words
    .slice(1, 3)
    .map((word) => `${word[0].toLocaleUpperCase('ru-RU')}.`)
    .join('');
  return `${words[0]}${initials ? ` ${initials}` : ''}`;
}

function fitParts(parts, flexibleIndexes, maxLength) {
  const result = [...parts];
  const length = () => result.join('_').length;
  while (length() > maxLength) {
    const candidates = flexibleIndexes.filter((index) => result[index]?.length > 12);
    if (candidates.length === 0) break;
    const index = candidates.sort((left, right) => result[right].length - result[left].length)[0];
    const overflow = length() - maxLength;
    result[index] = result[index]
      .slice(0, Math.max(12, result[index].length - overflow))
      .replace(TRAILING_UNSAFE_CHARACTERS, '');
  }
  return result.join('_').slice(0, maxLength).replace(TRAILING_UNSAFE_CHARACTERS, '');
}

export function buildExportFileName({
  title,
  objects = [],
  date,
  from,
  to,
  month,
  version,
  extension,
  maxBaseLength = 180,
}) {
  const titlePart = sanitizeFileNamePart(title) || 'Документ';
  const objectParts = objects.map(sanitizeFileNamePart).filter(Boolean);
  let periodParts = [];
  if (month) {
    const monthPart = formatFileMonth(month);
    if (monthPart) periodParts = [monthPart];
  } else if (from || to) {
    periodParts = formatFilePeriod(from, to);
  } else if (date) {
    const datePart = formatFileDate(date);
    if (datePart) periodParts = [datePart];
  }
  const versionPart =
    Number.isInteger(Number(version)) && Number(version) > 0 ? `Версия_${Number(version)}` : null;
  const parts = [titlePart, ...objectParts, ...periodParts, versionPart].filter(Boolean);
  const flexibleIndexes = objectParts.map((_, index) => index + 1);
  const baseName = fitParts(parts, flexibleIndexes, maxBaseLength) || 'Документ';
  const safeExtension = String(extension ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return safeExtension ? `${baseName}.${safeExtension}` : baseName;
}

export function sanitizeExportFileName(fileName) {
  const text = String(fileName ?? '');
  const extensionMatch = text.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1];
  const base = extension ? text.slice(0, -extensionMatch[0].length) : text;
  return buildExportFileName({ title: base, extension });
}

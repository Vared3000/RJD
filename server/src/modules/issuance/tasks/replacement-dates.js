function parseDateOnly(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function shiftCalendar(value, { years = 0, months = 0 }) {
  const source = parseDateOnly(value);
  const sourceDay = source.getUTCDate();
  const target = new Date(
    Date.UTC(source.getUTCFullYear() + years, source.getUTCMonth() + months, 1),
  );
  target.setUTCDate(
    Math.min(sourceDay, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())),
  );
  return formatDateOnly(target);
}

export function plannedReplacementDate(issuedAt, serviceLifeYears) {
  return shiftCalendar(issuedAt, { years: Number(serviceLifeYears) });
}

export function replacementNotificationDate(replacementDate) {
  return shiftCalendar(replacementDate, { months: -1 });
}

export function dateOnlyToday(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function daysUntil(date, from = dateOnlyToday()) {
  return Math.ceil((parseDateOnly(date) - parseDateOnly(from)) / 86_400_000);
}

export function replacementStatusForDate(replacementDate, today = dateOnlyToday()) {
  if (replacementDate < today) return 'overdue';
  if (replacementDate === today) return 'open';
  return 'scheduled';
}

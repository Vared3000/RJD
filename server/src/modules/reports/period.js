// Раздел 12 ТЗ: отчёты должны поддерживать группировку/фильтр по периоду
// (день/месяц/квартал/год), а не быть 4 отдельными видами отчётов — единая
// точка разбора для всех эндпоинтов reports/*.

const PERIODS = ['day', 'month', 'quarter', 'year'];

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

// { from, to } — границы периода как Date (UTC, включительно с обеих сторон).
// Явные from/to в query имеют приоритет над period+date.
export function resolvePeriod({ period, date, from, to } = {}) {
  if (from || to) {
    const fromDate = from ? startOfDay(new Date(from)) : new Date(0);
    const toDate = to ? endOfDay(new Date(to)) : endOfDay(new Date());
    return { from: fromDate, to: toDate };
  }

  const anchor = date ? new Date(date) : new Date();
  const resolvedPeriod = PERIODS.includes(period) ? period : 'month';

  if (resolvedPeriod === 'day') {
    return { from: startOfDay(anchor), to: endOfDay(anchor) };
  }
  if (resolvedPeriod === 'month') {
    const fromDate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const toDate = endOfDay(
      new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)),
    );
    return { from: fromDate, to: toDate };
  }
  if (resolvedPeriod === 'quarter') {
    const quarterStartMonth = Math.floor(anchor.getUTCMonth() / 3) * 3;
    const fromDate = new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth, 1));
    const toDate = endOfDay(new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth + 3, 0)));
    return { from: fromDate, to: toDate };
  }
  // year
  const fromDate = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1));
  const toDate = endOfDay(new Date(Date.UTC(anchor.getUTCFullYear(), 11, 31)));
  return { from: fromDate, to: toDate };
}

export function resolvePeriodFromQuery(query) {
  return resolvePeriod({
    period: query.period,
    date: query.date,
    from: query.from,
    to: query.to,
  });
}

export { toDateOnly };

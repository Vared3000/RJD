function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// Стаж (раздел 8 ТЗ) — считается на лету от даты приёма до даты увольнения
// (или до сегодня, если работник ещё числится), без хранения в БД.
export function formatTenure(hireDate, terminationDate) {
  if (!hireDate) return '—';

  const start = new Date(hireDate);
  const end = terminationDate ? new Date(terminationDate) : new Date();
  if (end < start) return '—';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];
  if (years > 0) parts.push(`${years} ${pluralize(years, 'год', 'года', 'лет')}`);
  if (months > 0 || years === 0) {
    parts.push(`${months} ${pluralize(months, 'месяц', 'месяца', 'месяцев')}`);
  }
  return parts.join(' ');
}

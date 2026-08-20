import { Op } from 'sequelize';

// Статус работника (раздел «Релиз В» docs/TZ_NEXT_RELEASES_2026-08-19.md) —
// вычисляемое поле, не хранится в БД: приоритет «В архиве» -> «Уволен» ->
// «Активен» на дату формирования (по умолчанию — текущий момент). Общий
// модуль переиспользуется и экраном /employees (employees.repository.js),
// и печатной формой списка работников (reports.repository.js), чтобы выборка
// совпадала в обоих местах.
export const EMPLOYEE_STATUSES = ['active', 'terminated', 'archived'];

export const EMPLOYEE_STATUS_LABELS = {
  active: 'Активен',
  terminated: 'Уволен',
  archived: 'В архиве',
};

function toDateOnlyString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function computeEmployeeStatus(employee, asOf = new Date()) {
  if (employee.archivedAt) return 'archived';
  const asOfDate = toDateOnlyString(asOf);
  if (employee.terminationDate && employee.terminationDate <= asOfDate) return 'terminated';
  return 'active';
}

// Добавляет OR-группу в where через Op.and, не перезаписывая уже
// присутствующий where[Op.or] — статус «Активен» (OR по terminationDate) и
// поиск по ФИО/табельному (OR по двум полям) иначе конкурировали бы за один
// и тот же ключ Op.or и последний вызов молча отменял бы предыдущий фильтр.
export function addOrGroup(where, orClauses) {
  where[Op.and] = [...(where[Op.and] ?? []), { [Op.or]: orClauses }];
  return where;
}

// Мутирует и возвращает переданный where — статус, если задан, полностью
// определяет archivedAt/terminationDate (переопределяя базовый фильтр
// includeArchived), чтобы не заставлять пользователя отдельно включать
// «Показать архивные» при выборе статуса «В архиве».
export function applyEmployeeStatusFilter(where, status, asOf = new Date()) {
  if (!EMPLOYEE_STATUSES.includes(status)) return where;
  const asOfDate = toDateOnlyString(asOf);
  if (status === 'archived') {
    where.archivedAt = { [Op.ne]: null };
  } else if (status === 'terminated') {
    where.archivedAt = null;
    where.terminationDate = { [Op.lte]: asOfDate };
  } else {
    where.archivedAt = null;
    addOrGroup(where, [{ terminationDate: null }, { terminationDate: { [Op.gt]: asOfDate } }]);
  }
  return where;
}

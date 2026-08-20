import { models } from '../../database/models/index.js';
import { ApiError } from '../../utils/api-error.js';

// Отчёт «Сменяемость работников по ДПО» (Релиз Г,
// docs/TZ_NEXT_RELEASES_2026-08-19.md). Принадлежность к ДПО на каждую
// релевантную дату (начало/конец периода, дата приёма, дата увольнения)
// определяется строго через EmployeeDpoAssignment — историю назначений,
// которую поддерживают хуки employees.service.js при создании работника и
// при смене employee.dpoId (см. mutationHooks.afterCreate/afterUpdate).
// Текущее employee.dpoId для расчёта НЕ используется: перевод работника
// между ДПО внутри периода должен корректно разнести его между старым и
// новым ДПО (старое ДПО получает его в «на начало», новое — в «на конец»),
// а не задвоить/потерять численность.
//
// Формулы (см. ТЗ, раздел «Релиз Г»):
//   средняя численность = (на начало + на конец) / 2
//   сменяемость, % = min(принято, уволено) / средняя × 100 (0 при средней=0)
//   оборот кадров, % = (принято + уволено) / средняя × 100 (0 при средней=0)
// Округление процентов — только на отображении (Excel/PDF/фронтенд), сам
// расчёт хранит полную точность до итоговой агрегации.

export const GENDER_FILTERS = ['male', 'female', 'none'];
export const GENDER_FILTER_LABELS = { male: 'Мужской', female: 'Женский', none: 'Не указан' };
export const GROUP_BY_OPTIONS = ['dpo', 'position', 'gender', 'dpo_position_gender'];
export const TURNOVER_SORT_FIELDS = [
  'dpo',
  'position',
  'gender',
  'start',
  'hired',
  'terminated',
  'end',
  'average',
  'turnoverRate',
  'turnoverPercent',
];

const ALL_DPO_LABEL = 'Все ДПО';
const ALL_POSITION_LABEL = 'Все должности';
const ALL_GENDER_LABEL = 'Все (пол не разделён)';
const NO_DPO_LABEL = 'Без ДПО';
const NO_POSITION_LABEL = 'Без должности';

export const TURNOVER_FORMULA_TEXT =
  'Средняя численность = (на начало + на конец) / 2. ' +
  'Сменяемость, % = min(принято, уволено) / средняя × 100. ' +
  'Оборот кадров, % = (принято + уволено) / средняя × 100. ' +
  'При нулевой средней численности оба показателя равны 0. ' +
  'Это не показатель текучести — причины увольнения система не хранит.';

function toDateOnlyString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isValidDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function employeeGenderLabel(gender) {
  if (gender === 'male') return 'Мужской';
  if (gender === 'female') return 'Женский';
  return 'Не указан';
}

function resolveDims(groupBy) {
  if (groupBy === 'position') return ['position'];
  if (groupBy === 'gender') return ['gender'];
  if (groupBy === 'dpo_position_gender') return ['dpo', 'position', 'gender'];
  return ['dpo'];
}

// Возвращает функцию поиска ДПО, действующего на переданную дату, по уже
// отсортированной истории назначений одного работника.
function buildAssignmentLookup(assignments) {
  const sorted = [...assignments].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  return (dateOnly) => {
    if (!dateOnly) return null;
    for (const assignment of sorted) {
      if (assignment.validFrom > dateOnly) continue;
      if (assignment.validTo && assignment.validTo < dateOnly) continue;
      return { dpoId: assignment.dpoId, dpoName: assignment.dpo?.name ?? null };
    }
    // Дата раньше самого первого известного назначения — типичный случай
    // карточки без даты приёма: назначение создаётся с validFrom = дата
    // создания записи в системе (см. employees.service.js#mutationHooks),
    // а не с реальной, неизвестной датой приёма. ТЗ прямо требует, чтобы
    // такой работник всё равно входил в численность, поэтому экстраполируем
    // его в самое раннее известное ДПО, а не считаем «без ДПО» на все даты
    // до создания записи.
    if (sorted.length > 0 && dateOnly < sorted[0].validFrom) {
      const earliest = sorted[0];
      return { dpoId: earliest.dpoId, dpoName: earliest.dpo?.name ?? null };
    }
    return null;
  };
}

function sumBy(items, fn) {
  return items.reduce((sum, item) => sum + fn(item), 0);
}

function computeRates(start, end, hired, terminated) {
  const average = (start + end) / 2;
  const turnoverRate = average === 0 ? 0 : (Math.min(hired, terminated) / average) * 100;
  const turnoverPercent = average === 0 ? 0 : ((hired + terminated) / average) * 100;
  return { average, turnoverRate, turnoverPercent };
}

function compareRu(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'ru', { numeric: true });
}

const SORT_COMPARATORS = {
  dpo: (row) => row.dpoName,
  position: (row) => row.positionName,
  gender: (row) => row.genderLabel,
  start: (row) => row.start,
  hired: (row) => row.hired,
  terminated: (row) => row.terminated,
  end: (row) => row.end,
  average: (row) => row.average,
  turnoverRate: (row) => row.turnoverRate,
  turnoverPercent: (row) => row.turnoverPercent,
};

function sortRows(rows, dims, sort, order) {
  const direction = String(order).toUpperCase() === 'DESC' ? -1 : 1;
  const key = TURNOVER_SORT_FIELDS.includes(sort) ? sort : null;
  const chain = key ? [key, ...dims, 'position', 'gender'] : [...dims, 'position', 'gender'];
  rows.sort((left, right) => {
    for (const field of chain) {
      const primary = field === key;
      const dir = primary ? direction : 1;
      const getter = SORT_COMPARATORS[field];
      if (!getter) continue;
      const leftValue = getter(left);
      const rightValue = getter(right);
      const cmp =
        typeof leftValue === 'number'
          ? (leftValue - rightValue) * dir
          : compareRu(leftValue, rightValue) * dir;
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return rows;
}

export async function computeTurnoverReport({
  from,
  to,
  dpoId,
  positionId,
  gender,
  groupBy,
  sort,
  order,
} = {}) {
  const fromDate = toDateOnlyString(from);
  const toDate = toDateOnlyString(to);
  if (!isValidDateOnly(fromDate) || !isValidDateOnly(toDate)) {
    throw ApiError.badRequest('Укажите период «с» и «по» (обязательные параметры from/to)');
  }
  if (fromDate > toDate) {
    throw ApiError.badRequest('Дата «с» не может быть позже даты «по»');
  }

  const resolvedGroupBy = GROUP_BY_OPTIONS.includes(groupBy) ? groupBy : 'dpo';
  const dims = resolveDims(resolvedGroupBy);
  const resolvedGender = GENDER_FILTERS.includes(gender) ? gender : undefined;

  const [filterDpo, filterPosition] = await Promise.all([
    dpoId ? models.Dpo.findByPk(dpoId, { attributes: ['id', 'name'] }) : null,
    positionId ? models.Position.findByPk(positionId, { attributes: ['id', 'name'] }) : null,
  ]);
  const filterDpoLabel = dpoId ? (filterDpo?.name ?? ALL_DPO_LABEL) : ALL_DPO_LABEL;
  const filterPositionLabel = positionId
    ? (filterPosition?.name ?? ALL_POSITION_LABEL)
    : ALL_POSITION_LABEL;
  const filterGenderLabel = resolvedGender
    ? GENDER_FILTER_LABELS[resolvedGender]
    : ALL_GENDER_LABEL;

  // archivedAt — техническая мягкая архивация карточки, а не дата увольнения.
  // Исторический отчёт обязан опираться на hireDate/terminationDate и историю
  // назначений, иначе архивирование задним числом меняет уже рассчитанные
  // показатели прошлых периодов.
  const employeeWhere = {};
  if (positionId) employeeWhere.positionId = positionId;
  if (resolvedGender) employeeWhere.gender = resolvedGender === 'none' ? null : resolvedGender;

  const employees = await models.Employee.findAll({
    where: employeeWhere,
    attributes: ['id', 'hireDate', 'terminationDate', 'gender', 'positionId'],
    include: [{ model: models.Position, as: 'position', attributes: ['id', 'name'] }],
  });

  const assignmentsByEmployee = new Map();
  if (employees.length > 0) {
    // Без фильтра по дате: назначения, начинающиеся ПОЗЖЕ отчётного периода,
    // тоже нужны — buildAssignmentLookup экстраполирует по ним работника без
    // даты приёма (у которого единственное назначение создано задним числом
    // на дату создания карточки, а не на реальную историческую дату).
    const assignments = await models.EmployeeDpoAssignment.findAll({
      where: { employeeId: employees.map((employee) => employee.id) },
      include: [{ model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] }],
    });
    for (const assignment of assignments) {
      if (!assignmentsByEmployee.has(assignment.employeeId)) {
        assignmentsByEmployee.set(assignment.employeeId, []);
      }
      assignmentsByEmployee.get(assignment.employeeId).push(assignment);
    }
  }

  function passesDpoFilter(attribution) {
    if (!dpoId) return true;
    return attribution?.dpoId === dpoId;
  }

  function buildKey(attribution, employee) {
    const dpoName = dims.includes('dpo') ? (attribution?.dpoName ?? NO_DPO_LABEL) : filterDpoLabel;
    const dpoKeyId = dims.includes('dpo') ? (attribution?.dpoId ?? null) : (dpoId ?? null);
    const positionName = dims.includes('position')
      ? (employee.position?.name ?? NO_POSITION_LABEL)
      : filterPositionLabel;
    const positionKeyId = dims.includes('position')
      ? (employee.positionId ?? null)
      : (positionId ?? null);
    const genderValue = dims.includes('gender')
      ? (employee.gender ?? null)
      : (resolvedGender ?? null);
    const genderLabelValue = dims.includes('gender')
      ? employeeGenderLabel(employee.gender)
      : filterGenderLabel;
    return {
      key: JSON.stringify([dpoKeyId, positionKeyId, genderValue]),
      dpoId: dpoKeyId,
      dpoName,
      positionId: positionKeyId,
      positionName,
      gender: genderValue,
      genderLabel: genderLabelValue,
    };
  }

  const buckets = new Map();
  const ensureBucket = (built) => {
    if (!buckets.has(built.key)) {
      buckets.set(built.key, {
        dpoId: built.dpoId,
        dpoName: built.dpoName,
        positionId: built.positionId,
        positionName: built.positionName,
        gender: built.gender,
        genderLabel: built.genderLabel,
        start: 0,
        hired: 0,
        terminated: 0,
        end: 0,
      });
    }
    return buckets.get(built.key);
  };

  const incompleteHireEmployeeIds = new Set();

  for (const employee of employees) {
    const hire = employee.hireDate ?? null;
    const term = employee.terminationDate ?? null;
    const lookup = buildAssignmentLookup(assignmentsByEmployee.get(employee.id) ?? []);

    const activeStart = (hire == null || hire < fromDate) && (term == null || term >= fromDate);
    const activeEnd = (hire == null || hire <= toDate) && (term == null || term > toDate);
    const hiredInPeriod = hire != null && hire >= fromDate && hire <= toDate;
    const terminatedInPeriod = term != null && term >= fromDate && term <= toDate;

    if ((activeStart || activeEnd) && hire == null) {
      incompleteHireEmployeeIds.add(employee.id);
    }

    if (activeStart) {
      const attribution = lookup(fromDate);
      if (passesDpoFilter(attribution)) {
        ensureBucket(buildKey(attribution, employee)).start += 1;
      }
    }
    if (activeEnd) {
      const attribution = lookup(toDate);
      if (passesDpoFilter(attribution)) {
        ensureBucket(buildKey(attribution, employee)).end += 1;
      }
    }
    if (hiredInPeriod) {
      const attribution = lookup(hire);
      if (passesDpoFilter(attribution)) {
        ensureBucket(buildKey(attribution, employee)).hired += 1;
      }
    }
    if (terminatedInPeriod) {
      const attribution = lookup(term);
      if (passesDpoFilter(attribution)) {
        ensureBucket(buildKey(attribution, employee)).terminated += 1;
      }
    }
  }

  const rows = [...buckets.values()].map((bucket) => ({
    ...bucket,
    ...computeRates(bucket.start, bucket.end, bucket.hired, bucket.terminated),
  }));
  sortRows(rows, dims, sort, order);

  const totalStart = sumBy(rows, (r) => r.start);
  const totalHired = sumBy(rows, (r) => r.hired);
  const totalTerminated = sumBy(rows, (r) => r.terminated);
  const totalEnd = sumBy(rows, (r) => r.end);
  const totals = {
    start: totalStart,
    hired: totalHired,
    terminated: totalTerminated,
    end: totalEnd,
    ...computeRates(totalStart, totalEnd, totalHired, totalTerminated),
  };

  const filterParts = [];
  filterParts.push(dpoId ? `ДПО: ${filterDpoLabel}` : 'ДПО: все');
  filterParts.push(positionId ? `Должность: ${filterPositionLabel}` : 'Должность: все');
  filterParts.push(resolvedGender ? `Пол: ${filterGenderLabel}` : 'Пол: все');

  const groupByLabels = {
    dpo: 'По ДПО',
    position: 'По должности',
    gender: 'По полу',
    dpo_position_gender: 'ДПО + должность + пол',
  };

  return {
    rows,
    totals,
    from: fromDate,
    to: toDate,
    groupBy: resolvedGroupBy,
    groupByLabel: groupByLabels[resolvedGroupBy],
    filtersText: filterParts.join(' · '),
    formulaText: TURNOVER_FORMULA_TEXT,
    positionNote: 'Должность указана по текущей карточке работника (истории должностей нет).',
    incompleteHireCount: incompleteHireEmployeeIds.size,
    generatedAt: new Date(),
  };
}

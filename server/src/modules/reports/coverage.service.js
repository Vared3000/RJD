import { models } from '../../database/models/index.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function maxDate(...dates) {
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

function minDate(...dates) {
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

// Фактические дни обеспечения (раздел 12 ТЗ) — StockMovement не хранит,
// кому именно выдан/у кого возвращён экземпляр (см. docs/architecture.md и
// stock-movement.model.js), это известно только из шапки документа
// (IssuanceDocument.employeeId / ReturnDocument.employeeId). Поэтому
// реконструируем интервалы владения per-instance из движений
// documentType IN ('issuance','return'), атрибутируя каждый интервал
// работнику, который его открыл (issuance), и обрезаем по периоду отчёта и
// по датам приёма/увольнения работника (тоже раздел 12 ТЗ).
//
// employeeIds — не задан => все работники. Возвращает Map<employeeId, days>.
export async function computeCoverageDays({ from, to, employeeIds } = {}) {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const employees = await models.Employee.findAll({
    where: employeeIds ? { id: employeeIds } : {},
    attributes: ['id', 'hireDate', 'terminationDate'],
    raw: true,
  });
  if (employees.length === 0) return new Map();

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const ids = employees.map((e) => e.id);

  const [issuanceDocs, returnDocs] = await Promise.all([
    models.IssuanceDocument.findAll({
      where: { employeeId: ids, status: 'posted' },
      attributes: ['id', 'employeeId'],
      raw: true,
    }),
    models.ReturnDocument.findAll({
      where: { employeeId: ids, status: 'posted' },
      attributes: ['id', 'employeeId'],
      raw: true,
    }),
  ]);

  const issuanceDocEmployee = new Map(issuanceDocs.map((d) => [d.id, d.employeeId]));
  const returnDocEmployee = new Map(returnDocs.map((d) => [d.id, d.employeeId]));
  const relevantDocumentIds = [...issuanceDocEmployee.keys(), ...returnDocEmployee.keys()];

  const daysByEmployee = new Map();
  if (relevantDocumentIds.length === 0) return daysByEmployee;

  const movements = await models.StockMovement.findAll({
    where: { documentType: ['issuance', 'return'], documentId: relevantDocumentIds },
    attributes: ['instanceId', 'documentType', 'documentId', 'occurredAt'],
    order: [['occurredAt', 'ASC']],
    raw: true,
  });

  const byInstance = new Map();
  for (const movement of movements) {
    const employeeId =
      movement.documentType === 'issuance'
        ? issuanceDocEmployee.get(movement.documentId)
        : returnDocEmployee.get(movement.documentId);
    if (!byInstance.has(movement.instanceId)) byInstance.set(movement.instanceId, []);
    byInstance.get(movement.instanceId).push({ ...movement, employeeId });
  }

  function closeInterval(openInterval, endDate) {
    const employee = employeeMap.get(openInterval.employeeId);
    if (!employee) return;
    // В старых актах дата приёма встречается не всегда. В таком случае известный
    // интервал владения ограничивается только периодом самого отчёта.
    const employmentStart = employee.hireDate ? new Date(employee.hireDate) : fromDate;
    const employmentEnd = employee.terminationDate ? new Date(employee.terminationDate) : toDate;

    const intervalFrom = maxDate(openInterval.start, fromDate, employmentStart);
    const intervalTo = minDate(endDate, toDate, employmentEnd);
    if (intervalTo <= intervalFrom) return;

    const days = Math.ceil((intervalTo.getTime() - intervalFrom.getTime()) / MS_PER_DAY);
    daysByEmployee.set(
      openInterval.employeeId,
      (daysByEmployee.get(openInterval.employeeId) ?? 0) + days,
    );
  }

  for (const events of byInstance.values()) {
    let open = null;
    for (const event of events) {
      const occurredAt = new Date(event.occurredAt);
      if (event.documentType === 'issuance') {
        // Не должно происходить при корректных данных (нельзя выдать уже
        // выданный экземпляр), но на случай рассинхронизации — закрываем
        // предыдущий интервал вместо потери дней.
        if (open) closeInterval(open, occurredAt);
        open = { employeeId: event.employeeId, start: occurredAt };
      } else if (open) {
        closeInterval(open, occurredAt);
        open = null;
      }
    }
    if (open) closeInterval(open, toDate);
  }

  return daysByEmployee;
}

import { reportsRepository } from './reports.repository.js';
import { stockService } from '../warehouses/stock/stock.service.js';
import { computeCoverageDays } from './coverage.service.js';
import { resolvePeriodFromQuery } from './period.js';
import {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  computeEmployeeStatus,
} from '../employees/employee-status.js';

const num = (value) => Number(value ?? 0);

const PERSONNEL_LIST_SORT_FIELDS = [
  'fullName',
  'personnelNumber',
  'region',
  'position',
  'dpo',
  'status',
];
const PERSONNEL_STATUS_RANK = { active: 0, terminated: 1, archived: 2 };

function compareRu(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'ru', { numeric: true });
}

function sortPersonnelListRows(rows, sort, order) {
  const direction = String(order).toUpperCase() === 'DESC' ? -1 : 1;
  const key = PERSONNEL_LIST_SORT_FIELDS.includes(sort) ? sort : null;
  const chain = key ? [key, 'region', 'dpo', 'fullName'] : ['region', 'dpo', 'fullName'];
  rows.sort((left, right) => {
    for (const field of chain) {
      const primary = field === key;
      const dir = primary ? direction : 1;
      let cmp;
      if (field === 'status') {
        cmp =
          (PERSONNEL_STATUS_RANK[left.statusCode] - PERSONNEL_STATUS_RANK[right.statusCode]) * dir;
      } else if (field === 'personnelNumber') {
        cmp = compareRu(left.personnelNumber, right.personnelNumber) * dir;
      } else if (field === 'position') {
        cmp = compareRu(left.positionName, right.positionName) * dir;
      } else if (field === 'dpo') {
        cmp = compareRu(left.dpoName, right.dpoName) * dir;
      } else if (field === 'region') {
        cmp = compareRu(left.region, right.region) * dir;
      } else {
        cmp = compareRu(left.fullName, right.fullName) * dir;
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return rows;
}

function sumBy(items, fn) {
  return items.reduce((sum, item) => sum + fn(item), 0);
}

function tenureDays(hireDate, terminationDate, asOf) {
  if (!hireDate) return null;
  const end = terminationDate ? new Date(terminationDate) : asOf;
  const start = new Date(hireDate);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export const reportsService = {
  async stockBalances(query) {
    const rows = await stockService.getBalances({
      warehouseId: query.warehouseId,
      modelId: query.modelId,
      genderCategory: query.genderCategory,
      sizeId: query.sizeId,
      heightSizeId: query.heightSizeId,
      sort: query.sort,
      order: query.order,
    });
    const totals = {
      quantity: sumBy(rows, (r) => r.quantity),
    };
    return { rows, totals, generatedAt: new Date() };
  },

  async propertyCost(query) {
    const instances = await reportsRepository.findIssuedInstancesGrouped({
      dpoId: query.dpoId,
      organizationId: query.organizationId,
      subdivisionId: query.subdivisionId,
    });

    const byEmployee = new Map();
    for (const instance of instances) {
      const employee = instance.employee;
      if (!byEmployee.has(employee.id)) {
        byEmployee.set(employee.id, {
          employeeId: employee.id,
          employeeName: employee.fullName,
          dpoName: employee.dpo?.name ?? null,
          itemsCount: 0,
        });
      }
      const row = byEmployee.get(employee.id);
      row.itemsCount += 1;
    }

    const rows = [...byEmployee.values()].sort((a, b) => b.itemsCount - a.itemsCount);
    const totals = {
      itemsCount: sumBy(rows, (r) => r.itemsCount),
    };
    return { rows, totals };
  },

  async purchases(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const documents = await reportsRepository.findPostedReceivingDocuments({
      from,
      to,
      supplierId: query.supplierId,
      warehouseId: query.warehouseId,
    });

    const rows = documents.map((doc) => {
      const quantity = sumBy(doc.lines, (l) => l.quantity);
      return {
        id: doc.id,
        number: doc.number,
        documentDate: doc.documentDate,
        supplierName: doc.supplier?.name ?? null,
        warehouseName: doc.warehouse?.name ?? null,
        quantity,
      };
    });

    const totals = {
      documentsCount: rows.length,
      quantity: sumBy(rows, (r) => r.quantity),
    };
    return { from, to, rows, totals };
  },

  async suppliers(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const documents = await reportsRepository.findPostedReceivingDocuments({ from, to });

    const bySupplier = new Map();
    for (const doc of documents) {
      const supplierId = doc.supplier?.id ?? doc.supplierId;
      if (!bySupplier.has(supplierId)) {
        bySupplier.set(supplierId, {
          supplierId,
          supplierName: doc.supplier?.name ?? null,
          documentsCount: 0,
          quantity: 0,
        });
      }
      const row = bySupplier.get(supplierId);
      row.documentsCount += 1;
      row.quantity += sumBy(doc.lines, (l) => l.quantity);
    }

    const rows = [...bySupplier.values()].sort((a, b) => b.quantity - a.quantity);
    const totals = {
      documentsCount: sumBy(rows, (r) => r.documentsCount),
      quantity: sumBy(rows, (r) => r.quantity),
    };
    return { from, to, rows, totals };
  },

  async writeoffs(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const documents = await reportsRepository.findPostedWriteoffDocuments({
      from,
      to,
      warehouseId: query.warehouseId,
    });

    const rows = documents.map((doc) => ({
      id: doc.id,
      number: doc.number,
      documentDate: doc.documentDate,
      warehouseName: doc.warehouse?.name ?? null,
      itemsCount: doc.lines.length,
      reasons: [...new Set(doc.lines.map((l) => l.reason))],
    }));

    const totals = {
      documentsCount: rows.length,
      itemsCount: sumBy(rows, (r) => r.itemsCount),
    };
    return { from, to, rows, totals };
  },

  async repairs(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const documents = await reportsRepository.findCompletedRepairDocuments({
      from,
      to,
      warehouseId: query.warehouseId,
    });

    const rows = documents.map((doc) => ({
      id: doc.id,
      number: doc.number,
      completedAt: doc.completedAt,
      warehouseName: doc.warehouse?.name ?? null,
      itemsCount: doc.lines.length,
      cost: sumBy(doc.lines, (l) => num(l.cost)),
    }));

    const totals = {
      documentsCount: rows.length,
      itemsCount: sumBy(rows, (r) => r.itemsCount),
      cost: sumBy(rows, (r) => r.cost),
    };
    return { from, to, rows, totals };
  },

  async warehouses(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const [movements, balances, warehouses] = await Promise.all([
      reportsRepository.countMovementsByWarehouse({ from, to, warehouseId: query.warehouseId }),
      stockService.getBalances({ warehouseId: query.warehouseId }),
      reportsRepository.findWarehouses({ warehouseId: query.warehouseId }),
    ]);

    const byWarehouse = new Map();
    const ensure = (id, name) => {
      if (!byWarehouse.has(id)) {
        byWarehouse.set(id, {
          warehouseId: id,
          warehouseName: name ?? null,
          incoming: 0,
          outgoing: 0,
          balanceQuantity: 0,
        });
      }
      return byWarehouse.get(id);
    };

    for (const movement of movements) {
      if (movement.toWarehouseId) ensure(movement.toWarehouseId).incoming += 1;
      if (movement.fromWarehouseId) ensure(movement.fromWarehouseId).outgoing += 1;
    }
    for (const balance of balances) {
      if (!balance.warehouse) continue;
      const row = ensure(balance.warehouse.id, balance.warehouse.name);
      row.balanceQuantity += balance.quantity;
    }
    for (const warehouse of warehouses) {
      ensure(warehouse.id, warehouse.name);
    }

    const rows = [...byWarehouse.values()].sort((a, b) =>
      (a.warehouseName ?? '').localeCompare(b.warehouseName ?? ''),
    );
    const totals = {
      incoming: sumBy(rows, (r) => r.incoming),
      outgoing: sumBy(rows, (r) => r.outgoing),
      balanceQuantity: sumBy(rows, (r) => r.balanceQuantity),
    };
    return { from, to, rows, totals };
  },

  async employees(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const employees = await reportsRepository.findEmployees({
      dpoId: query.dpoId,
      organizationId: query.organizationId,
      subdivisionId: query.subdivisionId,
      activeOn: query.activeOn,
    });

    const employeeIds = employees.map((e) => e.id);
    const [coverageDays, propertyRows] = await Promise.all([
      computeCoverageDays({ from, to, employeeIds }),
      reportsRepository.findIssuedInstancesGrouped({}),
    ]);

    const propertyByEmployee = new Map();
    for (const instance of propertyRows) {
      const id = instance.employee.id;
      const current = propertyByEmployee.get(id) ?? { itemsCount: 0 };
      current.itemsCount += 1;
      propertyByEmployee.set(id, current);
    }

    const rows = employees.map((employee) => {
      const property = propertyByEmployee.get(employee.id) ?? {
        itemsCount: 0,
      };
      return {
        employeeId: employee.id,
        fullName: employee.fullName,
        dpoName: employee.dpo?.name ?? null,
        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
        tenureDays: tenureDays(employee.hireDate, employee.terminationDate, to),
        coverageDaysInPeriod: coverageDays.get(employee.id) ?? 0,
        propertyItemsCount: property.itemsCount,
      };
    });

    const totals = {
      employeesCount: rows.length,
      propertyItemsCount: sumBy(rows, (r) => r.propertyItemsCount),
      coverageDaysInPeriod: sumBy(rows, (r) => r.coverageDaysInPeriod),
    };
    return { from, to, rows, totals };
  },

  async dpo(query) {
    const { from, to } = resolvePeriodFromQuery(query);
    const dpos = await reportsRepository.findDpos({ dpoId: query.dpoId });

    const [allEmployees, propertyRows, issuanceLines] = await Promise.all([
      reportsRepository.findEmployees({}),
      reportsRepository.findIssuedInstancesGrouped({}),
      reportsRepository.findPostedIssuanceLinesByDpo({ from, to }),
    ]);

    const employeesByDpo = new Map();
    for (const employee of allEmployees) {
      if (!employee.dpoId) continue;
      if (!employeesByDpo.has(employee.dpoId)) employeesByDpo.set(employee.dpoId, []);
      employeesByDpo.get(employee.dpoId).push(employee.id);
    }

    const propertyByDpo = new Map();
    for (const instance of propertyRows) {
      const dpoId = instance.employee.dpoId;
      if (!dpoId) continue;
      propertyByDpo.set(dpoId, (propertyByDpo.get(dpoId) ?? 0) + 1);
    }

    const issuedValueByDpo = new Map();
    for (const line of issuanceLines) {
      const dpoId = line.document?.employee?.dpoId;
      if (!dpoId) continue;
      // У IssuanceLine нет собственной цены — количество и модель есть,
      // но стоимость на момент этого отчёта считается через уже выданные
      // экземпляры (propertyByDpo); отдельно копим только количество выданных строк.
      issuedValueByDpo.set(dpoId, (issuedValueByDpo.get(dpoId) ?? 0) + line.quantity);
    }

    const coverageByEmployee = await computeCoverageDays({
      from,
      to,
      employeeIds: allEmployees.filter((e) => e.dpoId).map((e) => e.id),
    });

    const rows = dpos.map((dpo) => {
      const employeeIds = employeesByDpo.get(dpo.id) ?? [];
      const coverageDaysInPeriod = employeeIds.reduce(
        (sum, id) => sum + (coverageByEmployee.get(id) ?? 0),
        0,
      );
      return {
        dpoId: dpo.id,
        dpoName: dpo.name,
        employeesCount: employeeIds.length,
        propertyItemsCount: propertyByDpo.get(dpo.id) ?? 0,
        issuedQuantityInPeriod: issuedValueByDpo.get(dpo.id) ?? 0,
        coverageDaysInPeriod,
      };
    });

    const totals = {
      employeesCount: sumBy(rows, (r) => r.employeesCount),
      propertyItemsCount: sumBy(rows, (r) => r.propertyItemsCount),
      issuedQuantityInPeriod: sumBy(rows, (r) => r.issuedQuantityInPeriod),
      coverageDaysInPeriod: sumBy(rows, (r) => r.coverageDaysInPeriod),
    };
    return { from, to, rows, totals };
  },

  // Печатная форма «Список работников» (Релиз В,
  // docs/TZ_NEXT_RELEASES_2026-08-19.md) — не период-отчёт: строго шесть
  // колонок (ФИО, Табельный номер, Регион, Должность, ДПО, Статус), статус
  // вычисляется на дату формирования. Не путать с периодическим
  // reportsService.employees (показатели обеспеченности, другая форма) —
  // это ровно тот список, что и GET /employees на экране, с теми же
  // фильтрами (ДПО, регион, статус, архивные), чтобы экран и выгрузка
  // совпадали (см. employeesController/employeeRepository.list).
  async employeesList(query) {
    const dpoId = query.dpoId || undefined;
    const region = query.region || undefined;
    const status = EMPLOYEE_STATUSES.includes(query.status) ? query.status : undefined;
    const search = query.search || undefined;
    const includeArchived = query.includeArchived === 'true' || query.includeArchived === true;
    const generatedAt = new Date();

    const employees = await reportsRepository.findEmployeesForPersonnelList({
      dpoId,
      region,
      status,
      search,
      includeArchived,
    });

    const rows = employees.map((employee) => {
      const statusCode = computeEmployeeStatus(employee, generatedAt);
      return {
        fullName: employee.fullName,
        personnelNumber: employee.personnelNumber,
        region: employee.dpo?.region ?? null,
        positionName: employee.position?.name ?? null,
        dpoName: employee.dpo?.name ?? null,
        statusCode,
        status: EMPLOYEE_STATUS_LABELS[statusCode],
      };
    });
    sortPersonnelListRows(rows, query.sort, query.order);

    const filterParts = [];
    if (dpoId) {
      const [dpo] = await reportsRepository.findDpos({ dpoId, includeArchived: true });
      if (dpo) filterParts.push(`ДПО: ${dpo.name}`);
    }
    if (region) filterParts.push(`Регион: ${region}`);
    if (status) filterParts.push(`Статус: ${EMPLOYEE_STATUS_LABELS[status]}`);
    if (search) filterParts.push(`Поиск: «${search}»`);
    if (includeArchived) filterParts.push('включая архивных');

    return {
      rows,
      totals: { employeesCount: rows.length },
      generatedAt,
      filtersText: filterParts.length ? filterParts.join(' · ') : 'Без фильтров',
    };
  },
};

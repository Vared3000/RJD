import { Router } from 'express';
import { reportsController } from './reports.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { extendSwaggerPaths } from '../../config/swagger.js';

// Раздел 12 ТЗ — все отчёты read-only JSON-агрегации поверх уже существующих
// таблиц, без печатных форм (это отдельно, Этап 12). Период везде общий
// query-контракт: from/to (YYYY-MM-DD) ИЛИ period=day|month|quarter|year (+
// опционально date-опора, по умолчанию сегодня) — см. period.js.
const PERMISSION = 'reports.view';

export function createReportsRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  router.get('/stock-balances', asyncHandler(reportsController.stockBalances));
  router.get('/property-cost', asyncHandler(reportsController.propertyCost));
  router.get('/purchases', asyncHandler(reportsController.purchases));
  router.get('/suppliers', asyncHandler(reportsController.suppliers));
  router.get('/writeoffs', asyncHandler(reportsController.writeoffs));
  router.get('/repairs', asyncHandler(reportsController.repairs));
  router.get('/warehouses', asyncHandler(reportsController.warehouses));
  router.get('/employees', asyncHandler(reportsController.employees));
  router.get('/dpo', asyncHandler(reportsController.dpo));

  const periodParams = [
    { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'month', 'quarter', 'year'] } },
    { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
  ];

  extendSwaggerPaths({
    '/reports/stock-balances': {
      get: {
        tags: ['Отчёты'],
        summary: 'Остатки по складам/моделям',
        parameters: [
          { name: 'warehouseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'modelId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список остатков + итоги' } },
      },
    },
    '/reports/property-cost': {
      get: {
        tags: ['Отчёты'],
        summary: 'Стоимость выданного имущества по работникам',
        parameters: [
          { name: 'dpoId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'organizationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'subdivisionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список по работникам + итоги' } },
      },
    },
    '/reports/purchases': {
      get: {
        tags: ['Отчёты'],
        summary: 'Закупки за период (список документов Поступления)',
        parameters: [
          ...periodParams,
          { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'warehouseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список документов + итоги' } },
      },
    },
    '/reports/suppliers': {
      get: {
        tags: ['Отчёты'],
        summary: 'Закупки за период, сгруппированные по поставщику',
        parameters: periodParams,
        responses: { 200: { description: 'Список по поставщикам + итоги' } },
      },
    },
    '/reports/writeoffs': {
      get: {
        tags: ['Отчёты'],
        summary: 'Списания за период',
        parameters: [
          ...periodParams,
          { name: 'warehouseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список документов + итоги' } },
      },
    },
    '/reports/repairs': {
      get: {
        tags: ['Отчёты'],
        summary: 'Завершённые ремонты за период',
        parameters: [
          ...periodParams,
          { name: 'warehouseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список документов + итоги' } },
      },
    },
    '/reports/warehouses': {
      get: {
        tags: ['Отчёты'],
        summary: 'Движения и остатки по складам за период',
        parameters: [
          ...periodParams,
          { name: 'warehouseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список по складам + итоги' } },
      },
    },
    '/reports/employees': {
      get: {
        tags: ['Отчёты'],
        summary:
          'Отчёт по работникам: стаж, стоимость имущества, фактические дни ' +
          'обеспечения за период',
        parameters: [
          ...periodParams,
          { name: 'dpoId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'organizationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'subdivisionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'activeOn', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'Список работников + итоги' } },
      },
    },
    '/reports/dpo': {
      get: {
        tags: ['Отчёты'],
        summary:
          'Отчёт по ДПО: работники, стоимость имущества, выдано за период, дни обеспечения',
        parameters: [...periodParams, { name: 'dpoId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Список по ДПО + итоги' } },
      },
    },
  });

  return router;
}

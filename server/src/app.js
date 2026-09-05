import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { resolveRecoveryFence } from './config/recovery-fence.js';
import { resolveHaFence } from './config/ha-fence.js';
import { swaggerSpec } from './config/swagger.js';
import { sequelize } from './database/models/index.js';
import { logger } from './utils/logger.js';
import { ApiError } from './utils/api-error.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createOrganizationsRouter } from './modules/catalogs/organizations/organizations.routes.js';
import { createSubdivisionsRouter } from './modules/catalogs/subdivisions/subdivisions.routes.js';
import { createPositionsRouter } from './modules/catalogs/positions/positions.routes.js';
import { createWarehousesRouter } from './modules/catalogs/warehouses/warehouses.routes.js';
import { createSuppliersRouter } from './modules/catalogs/suppliers/suppliers.routes.js';
import { createSizesRouter } from './modules/catalogs/sizes/sizes.routes.js';
import { createNomenclatureModelsRouter } from './modules/nomenclature/models/nomenclature-models.routes.js';
import { createInstancesRouter } from './modules/nomenclature/instances/instances.routes.js';
import { createReceivingRouter } from './modules/purchases/receiving/receiving.routes.js';
import { createBatchesRouter } from './modules/purchases/batches/batches.routes.js';
import { createStockRouter } from './modules/warehouses/stock/stock.routes.js';
import { createEmployeesRouter } from './modules/employees/employees.routes.js';
import { createKitsRouter } from './modules/kits/kits.routes.js';
import { createIssuanceRouter } from './modules/issuance/documents/issuance.routes.js';
import { createReturnRouter } from './modules/issuance/returns/return.routes.js';
import { createTasksRouter } from './modules/issuance/tasks/tasks.routes.js';
import { createLaundryRouter } from './modules/laundry/laundry.routes.js';
import { createRepairRouter } from './modules/repair/repair.routes.js';
import { createTransferRouter } from './modules/transfers/transfer.routes.js';
import { createWriteoffRouter } from './modules/writeoff/writeoff.routes.js';
import { createInventoryRouter } from './modules/inventory/inventory.routes.js';
import { createAdjustmentsRouter } from './modules/adjustments/adjustment.routes.js';
import { createDpoRouter } from './modules/dpo/dpo.routes.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createReportsRouter } from './modules/reports/reports.routes.js';
import { createPrintFormsRouter } from './modules/print-forms/print-forms.routes.js';
import { createBarcodeRouter } from './modules/barcodes/barcode.routes.js';
import { createPrintFormSettingsRouter } from './modules/print-forms/settings/print-form-settings.routes.js';
import { createPrintFormTemplatesRouter } from './modules/print-forms/templates/print-form-templates.routes.js';
import { createStartupImportRouter } from './modules/startup-import/startup-import.routes.js';

const clientDistDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
const safeHttpMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function databaseNameFromUrl(databaseUrl) {
  try {
    const pathname = new URL(databaseUrl).pathname.replace(/^\/+/, '');
    return pathname ? decodeURIComponent(pathname) : undefined;
  } catch {
    return undefined;
  }
}

async function getCurrentDatabaseState(database) {
  const [rows] = await database.query(`
    SELECT
      current_database() AS "database",
      (SELECT MAX(name) FROM schema_migrations) AS "migrationHead"
  `);
  const state = rows?.[0];
  if (
    typeof state?.database !== 'string' ||
    !state.database ||
    typeof state.migrationHead !== 'string' ||
    !state.migrationHead
  ) {
    throw new Error('PostgreSQL не вернул текущую базу и вершину миграций');
  }
  return state;
}

async function resolveNodeFences(recoveryFenceResolver, haFenceResolver) {
  const [recovery, ha] = await Promise.all([recoveryFenceResolver(), haFenceResolver()]);
  if (recovery.enabled && ha.enabled) {
    throw new Error('Ручной recovery fence и автоматический HA включены одновременно');
  }
  return { recovery, ha };
}

async function assertHaDatabaseRole(database, ha) {
  if (!ha.enabled) return;
  const [rows] = await database.query('SELECT pg_is_in_recovery() AS "isInRecovery"');
  const isInRecovery = rows?.[0]?.isInRecovery;
  if (typeof isInRecovery !== 'boolean') {
    throw new Error('PostgreSQL не подтвердил primary/replica role');
  }
  if (ha.writable === isInRecovery) {
    throw new Error('Роль локальной PostgreSQL не совпадает с Patroni fence');
  }
}

function getRecoveryExpectation(query) {
  if (
    typeof query.database !== 'string' ||
    !query.database ||
    typeof query.nodeId !== 'string' ||
    !query.nodeId ||
    typeof query.epoch !== 'string' ||
    !/^[1-9]\d*$/.test(query.epoch) ||
    typeof query.migrationHead !== 'string' ||
    !query.migrationHead
  ) {
    throw new Error('Не заданы ожидаемые database, nodeId, epoch и migrationHead');
  }
  const epoch = Number(query.epoch);
  if (!Number.isSafeInteger(epoch)) throw new Error('Некорректная ожидаемая эпоха');
  return {
    database: query.database,
    nodeId: query.nodeId,
    epoch,
    migrationHead: query.migrationHead,
  };
}

function createReadinessHandler({
  database,
  expectedDatabaseName,
  recoveryFenceResolver,
  haFenceResolver,
  requireRecoveryExpectation = false,
}) {
  return async (req, res) => {
    try {
      const recoveryExpectation = requireRecoveryExpectation
        ? getRecoveryExpectation(req.query)
        : undefined;
      const { recovery: fence, ha } = await resolveNodeFences(
        recoveryFenceResolver,
        haFenceResolver,
      );
      if (
        fence.enabled &&
        (!Number.isSafeInteger(fence.epoch) ||
          fence.epoch < 1 ||
          !fence.nodeId ||
          fence.nodeId !== fence.activeNodeId)
      ) {
        throw new Error('Текущий узел не подтверждён recovery fence');
      }
      if (
        recoveryExpectation &&
        (!fence.enabled ||
          fence.nodeId !== recoveryExpectation.nodeId ||
          fence.activeNodeId !== recoveryExpectation.nodeId ||
          fence.epoch !== recoveryExpectation.epoch)
      ) {
        throw new Error('Recovery fence не совпадает с ожидаемыми узлом и эпохой');
      }
      if (ha.enabled && !ha.writable) {
        throw new Error('HA proxy должен направлять readiness только на текущий primary');
      }
      await assertHaDatabaseRole(database, ha);

      const databaseState = await getCurrentDatabaseState(database);
      if (
        !expectedDatabaseName ||
        databaseState.database !== expectedDatabaseName ||
        (recoveryExpectation &&
          (databaseState.database !== recoveryExpectation.database ||
            databaseState.migrationHead !== recoveryExpectation.migrationHead))
      ) {
        throw new Error('База данных или вершина миграций не совпадает с ожидаемой');
      }

      return res.json({
        status: 'ok',
        env: env.NODE_ENV,
        database: databaseState.database,
        migrationHead: databaseState.migrationHead,
        recovery: fence.enabled
          ? {
              mode: 'cluster',
              clusterId: fence.clusterId,
              nodeId: fence.nodeId,
              epoch: fence.epoch,
              activeNodeId: fence.activeNodeId,
            }
          : { mode: 'standalone' },
        ha: ha.enabled
          ? {
              mode: ha.mode,
              nodeId: ha.nodeId,
              leaderNodeId: ha.leaderNodeId,
            }
          : { mode: 'disabled' },
      });
    } catch (error) {
      if (!env.NODE_ENV.includes('test')) {
        req.log.warn({ err: error }, 'Readiness check заблокирован');
      }
      return res.status(503).json({
        status: 'unavailable',
        error: { code: 'READINESS_CHECK_FAILED' },
      });
    }
  };
}

function createWriteGate(database, recoveryFenceResolver, haFenceResolver) {
  return async (req, res, next) => {
    if (safeHttpMethods.has(req.method)) {
      next();
      return;
    }

    try {
      const { recovery, ha } = await resolveNodeFences(recoveryFenceResolver, haFenceResolver);
      if (!recovery.writable || !ha.writable) throw new Error('Узел не подтверждён для записи');
      await assertHaDatabaseRole(database, ha);
      next();
    } catch (error) {
      if (!env.NODE_ENV.includes('test')) {
        req.log.warn({ err: error }, 'Изменяющий запрос заблокирован node fence');
      }
      next(
        new ApiError(503, 'Изменения временно заблокированы: активный узел не подтверждён', {
          code: 'NODE_FENCE_UNAVAILABLE',
        }),
      );
    }
  };
}

function serveProductionClient(app) {
  if (env.NODE_ENV !== 'production' || !existsSync(clientDistDirectory)) return;

  app.use(express.static(clientDistDirectory));
  app.use((req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api/') ||
      req.path.startsWith('/health') ||
      !req.accepts('html')
    ) {
      next();
      return;
    }
    res.sendFile('index.html', { root: clientDistDirectory });
  });
}

export function createApp({
  database = sequelize,
  expectedDatabaseName = databaseNameFromUrl(env.DATABASE_URL),
  recoveryFenceResolver = resolveRecoveryFence,
  haFenceResolver = resolveHaFence,
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  // Визуальный редактор печатных форм передаёт сетку листа и каталог стилей.
  // Лимит всё ещё заметно меньше максимального размера загружаемого .xlsx (5 МБ),
  // но не обрывает корректный макет стандартным лимитом Express в 100 КБ.
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: !env.NODE_ENV.includes('test') }));

  app.get('/health/live', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV });
  });
  const readinessHandler = createReadinessHandler({
    database,
    expectedDatabaseName,
    recoveryFenceResolver,
    haFenceResolver,
  });
  app.get('/health', readinessHandler);
  app.get('/health/ready', readinessHandler);
  app.get(
    '/health/recovery-ready',
    createReadinessHandler({
      database,
      expectedDatabaseName,
      recoveryFenceResolver,
      haFenceResolver,
      requireRecoveryExpectation: true,
    }),
  );

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

  app.use('/api/v1', createWriteGate(database, recoveryFenceResolver, haFenceResolver));
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/organizations', createOrganizationsRouter());
  app.use('/api/v1/subdivisions', createSubdivisionsRouter());
  app.use('/api/v1/positions', createPositionsRouter());
  app.use('/api/v1/warehouses', createWarehousesRouter());
  app.use('/api/v1/suppliers', createSuppliersRouter());
  app.use('/api/v1/sizes', createSizesRouter());
  app.use('/api/v1/nomenclature-models', createNomenclatureModelsRouter());
  app.use('/api/v1/instances', createInstancesRouter());
  app.use('/api/v1/purchases/receiving', createReceivingRouter());
  app.use('/api/v1/batches', createBatchesRouter());
  app.use('/api/v1/stock', createStockRouter());
  app.use('/api/v1/employees', createEmployeesRouter());
  app.use('/api/v1/kits', createKitsRouter());
  app.use('/api/v1/issuance/documents', createIssuanceRouter());
  app.use('/api/v1/issuance/returns', createReturnRouter());
  app.use('/api/v1/issuance/tasks', createTasksRouter());
  app.use('/api/v1/laundry/documents', createLaundryRouter());
  app.use('/api/v1/repair/documents', createRepairRouter());
  app.use('/api/v1/transfers/documents', createTransferRouter());
  app.use('/api/v1/writeoff/documents', createWriteoffRouter());
  app.use('/api/v1/inventory/documents', createInventoryRouter());
  app.use('/api/v1/adjustments/documents', createAdjustmentsRouter());
  app.use('/api/v1/dpo', createDpoRouter());
  app.use('/api/v1/admin', createAdminRouter());
  app.use('/api/v1/reports', createReportsRouter());
  app.use('/api/v1/print-forms/templates', createPrintFormTemplatesRouter());
  app.use('/api/v1/print-forms', createPrintFormsRouter());
  app.use('/api/v1/barcodes', createBarcodeRouter());
  app.use('/api/v1/print-form-settings', createPrintFormSettingsRouter());
  app.use('/api/v1/startup-import', createStartupImportRouter());

  // Native Windows deployment serves the production SPA and API from the
  // same service and port. Docker keeps using its dedicated Nginx container.
  serveProductionClient(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

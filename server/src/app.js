import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import { logger } from './utils/logger.js';
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

function serveProductionClient(app) {
  if (env.NODE_ENV !== 'production' || !existsSync(clientDistDirectory)) return;

  app.use(express.static(clientDistDirectory));
  app.use((req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api/') ||
      req.path === '/health' ||
      !req.accepts('html')
    ) {
      next();
      return;
    }
    res.sendFile('index.html', { root: clientDistDirectory });
  });
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  // Визуальный редактор печатных форм передаёт сетку листа и каталог стилей.
  // Лимит всё ещё заметно меньше максимального размера загружаемого .xlsx (5 МБ),
  // но не обрывает корректный макет стандартным лимитом Express в 100 КБ.
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: !env.NODE_ENV.includes('test') }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV });
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

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

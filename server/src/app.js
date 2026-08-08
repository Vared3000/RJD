import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env, isProduction } from './config/env.js';
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
import { createStockRouter } from './modules/warehouses/stock/stock.routes.js';
import { createEmployeesRouter } from './modules/employees/employees.routes.js';
import { createKitsRouter } from './modules/kits/kits.routes.js';
import { createIssuanceRouter } from './modules/issuance/documents/issuance.routes.js';
import { createReturnRouter } from './modules/issuance/returns/return.routes.js';
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

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
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
  app.use('/api/v1/stock', createStockRouter());
  app.use('/api/v1/employees', createEmployeesRouter());
  app.use('/api/v1/kits', createKitsRouter());
  app.use('/api/v1/issuance/documents', createIssuanceRouter());
  app.use('/api/v1/issuance/returns', createReturnRouter());
  app.use('/api/v1/laundry/documents', createLaundryRouter());
  app.use('/api/v1/repair/documents', createRepairRouter());
  app.use('/api/v1/transfers/documents', createTransferRouter());
  app.use('/api/v1/writeoff/documents', createWriteoffRouter());
  app.use('/api/v1/inventory/documents', createInventoryRouter());
  app.use('/api/v1/adjustments/documents', createAdjustmentsRouter());
  app.use('/api/v1/dpo', createDpoRouter());
  app.use('/api/v1/admin', createAdminRouter());
  app.use('/api/v1/reports', createReportsRouter());
  app.use('/api/v1/print-forms', createPrintFormsRouter());

  // Прод: единственный процесс отдаёт и API, и собранный фронтенд (client/dist)
  // с одного порта/origin — упрощает постоянное развёртывание без отдельного
  // Nginx/статик-сервера (см. HANDOFF.md, раздел "Деплой"). В dev фронтенд
  // обслуживает отдельный процесс Vite (pnpm dev).
  if (isProduction) {
    const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
    app.use(express.static(clientDist));
    app.get(/^(?!\/api|\/api-docs|\/health).*/, (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

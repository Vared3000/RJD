import { extendSwaggerPaths } from '../../config/swagger.js';
import { repairModule } from './repair.module.js';
import { serviceDocumentOpenApiPaths } from '../service-documents/service-document-openapi.js';
import { createServiceDocumentRouter } from '../service-documents/service-document.routes.js';

export function createRepairRouter() {
  extendSwaggerPaths(serviceDocumentOpenApiPaths(repairModule.openApi));
  return createServiceDocumentRouter(repairModule);
}

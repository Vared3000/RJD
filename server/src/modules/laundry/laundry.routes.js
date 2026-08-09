import { extendSwaggerPaths } from '../../config/swagger.js';
import { laundryModule } from './laundry.module.js';
import { serviceDocumentOpenApiPaths } from '../service-documents/service-document-openapi.js';
import { createServiceDocumentRouter } from '../service-documents/service-document.routes.js';

export function createLaundryRouter() {
  extendSwaggerPaths(serviceDocumentOpenApiPaths(laundryModule.openApi));
  return createServiceDocumentRouter(laundryModule);
}

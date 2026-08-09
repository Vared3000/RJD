import { models } from '../../database/models/index.js';
import { createServiceDocumentModule } from '../service-documents/service-document.factory.js';

export const repairModule = createServiceDocumentModule({
  DocumentModel: models.RepairDocument,
  LineModel: models.RepairLine,
  entityName: 'Ремонт',
  targetStatus: 'repair',
  documentType: 'repair',
  numberPrefix: 'РМ',
  numberSequence: 'repair_document_number_seq',
  permission: 'repair.manage',
  basePath: '/repair/documents',
  tag: 'Ремонт',
  sendNoteVerb: 'Отправка в ремонт',
  completeNoteVerb: 'Возврат из ремонта',
  lineExtraCompleteFields: ['cost'],
});

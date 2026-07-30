import { models } from '../../database/models/index.js';
import { createServiceDocumentModule } from '../service-documents/service-document.factory.js';

// Тонкая обёртка над общей фабрикой Стирки/Ремонта (см.
// service-document.factory.js) — Стирка не несёт доп. полей вроде стоимости
// ремонта, поэтому lineExtraCompleteFields не задаётся.
export function createLaundryRouter() {
  const { createRouter } = createServiceDocumentModule({
    DocumentModel: models.LaundryDocument,
    LineModel: models.LaundryLine,
    entityName: 'Стирка',
    targetStatus: 'laundry',
    documentType: 'laundry',
    numberPrefix: 'СТ',
    numberSequence: 'laundry_document_number_seq',
    permission: 'laundry.manage',
    basePath: '/laundry/documents',
    tag: 'Стирка',
    sendNoteVerb: 'Отправка в стирку',
    completeNoteVerb: 'Возврат из стирки',
  });
  return createRouter();
}

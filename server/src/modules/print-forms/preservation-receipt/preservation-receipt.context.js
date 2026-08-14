import { ApiError } from '../../../utils/api-error.js';
import { resolvePeriod, toDateOnly } from '../../reports/period.js';
import { printFormsRepository } from '../print-forms.repository.js';
import { printFormSettingsService } from '../settings/print-form-settings.service.js';
import { loadContext } from '../shared/load-context.js';
import { dpoSnapshotAt } from '../shared/dpo-snapshot.js';

export async function loadPreservationReceiptContext(query) {
  if (!query.issuanceId) return loadContext(query);

  const document = await printFormsRepository.findIssuanceDocument(query.issuanceId);
  if (!document) throw ApiError.notFound('Проведённая выдача не найдена');
  if (!document.employee?.dpoId) {
    throw ApiError.badRequest('У работника документа выдачи не указано ДПО');
  }

  const { from, to } = resolvePeriod({
    from: document.documentDate,
    to: document.documentDate,
  });
  const [dpo, parties] = await Promise.all([
    dpoSnapshotAt(printFormsRepository, document.employee.dpoId, to),
    printFormSettingsService.snapshotAt(toDateOnly(to)),
  ]);

  return {
    dpo,
    parties,
    documents: [document],
    issuanceDocument: document,
    from,
    to,
    fromText: toDateOnly(from),
    toText: toDateOnly(to),
  };
}

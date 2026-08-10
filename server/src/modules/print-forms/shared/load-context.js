import { ApiError } from '../../../utils/api-error.js';
import { resolvePeriod, toDateOnly } from '../../reports/period.js';
import { printFormsRepository } from '../print-forms.repository.js';
import { printFormSettingsService } from '../settings/print-form-settings.service.js';
import { dpoSnapshotAt } from './dpo-snapshot.js';

// Общий контекст для табличных актов за период (ФПУ-26, Приложения 1.5 и
// 1.7, УПД): реквизиты ДПО на конец периода, проведённые документы выдачи,
// действующие стороны и архивные строки за тот же период.
export async function loadContext(query) {
  const { from, to } = resolvePeriod({ from: query.from, to: query.to });
  if (from > to) throw ApiError.badRequest('Дата начала не может быть позже даты окончания');
  const [dpo, documents, parties] = await Promise.all([
    dpoSnapshotAt(printFormsRepository, query.dpoId, to),
    printFormsRepository.findIssuanceDocuments({ dpoId: query.dpoId, from, to }),
    printFormSettingsService.snapshotAt(toDateOnly(to)),
  ]);
  const modelIds = [
    ...new Set(documents.flatMap((document) => document.lines.map((line) => line.modelId))),
  ];
  const [prices, importedNomenclature] = await Promise.all([
    printFormsRepository.findPrices({
      modelIds,
      dpoId: query.dpoId,
    }),
    printFormsRepository.findImportedNomenclature({
      dpoName: dpo.name,
      from,
      to,
    }),
  ]);
  return {
    dpo,
    parties,
    documents,
    from,
    to,
    fromText: toDateOnly(from),
    toText: toDateOnly(to),
    prices,
    importedNomenclature,
  };
}

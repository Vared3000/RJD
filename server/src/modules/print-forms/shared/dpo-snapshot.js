import { ApiError } from '../../../utils/api-error.js';

// Реквизиты ДПО могут измениться после отчётного периода (см. DpoHistory,
// Этап 11). Печатная форма за прошлый период должна отражать реквизиты,
// действовавшие на дату окончания периода, а не текущие.
export async function dpoSnapshotAt(repository, dpoId, asOf) {
  const current = await repository.findDpo(dpoId);
  if (!current) throw ApiError.notFound('ДПО не найдено');
  const snapshot = current.toJSON();
  const history = await repository.findDpoHistoryAfter(dpoId, asOf);
  for (const entry of history) Object.assign(snapshot, entry.previousData);
  return snapshot;
}

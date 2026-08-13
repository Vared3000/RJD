import { QueryTypes } from 'sequelize';
import { sequelize, models } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';
import { resolveDocumentLabels } from './document-type-registry.js';

// Все instanceId, которых коснулся документ — через уже существующие
// полиморфные InstanceEvent.documentType/documentId (задача 22 сознательно не
// добавляет новых колонок на Instance, см. docs/architecture.md и решение
// пользователя о полном пересоздании экземпляров при редакции).
export async function findTouchedInstanceIds({ documentType, documentId }, { transaction } = {}) {
  const rows = await models.InstanceEvent.findAll({
    where: { documentType, documentId },
    attributes: ['instanceId'],
    transaction,
  });
  return [...new Set(rows.map((row) => row.instanceId))];
}

// Для каждого instanceId берёт САМОЕ ПОЗДНЕЕ "своё" событие (anchor) от
// (ownDocumentType, ownDocumentId), затем ищет любое другое событие того же
// экземпляра строго позже anchor, принадлежащее ДРУГОМУ документу. Композитный
// ключ (occurred_at, created_at, id) — тот же порядок, что и
// instanceEventsRepository.findByInstanceId, устойчив к документам, проведённым
// одной датой.
async function findBlockingRows(
  { instanceIds, ownDocumentType, ownDocumentId },
  { transaction } = {},
) {
  if (instanceIds.length === 0) return [];
  return sequelize.query(
    `WITH anchors AS (
       SELECT instance_id, occurred_at, created_at, id
       FROM instance_events
       WHERE document_type = :ownDocumentType
         AND document_id = :ownDocumentId
         AND instance_id IN (:instanceIds)
     ),
     last_anchor AS (
       SELECT DISTINCT ON (instance_id) instance_id, occurred_at, created_at, id
       FROM anchors
       ORDER BY instance_id, occurred_at DESC, created_at DESC, id DESC
     )
     SELECT DISTINCT blocker.document_type AS "documentType",
            blocker.document_id AS "documentId",
            blocker.instance_id AS "instanceId",
            blocker.occurred_at AS "occurredAt",
            instance.inventory_number AS "inventoryNumber"
     FROM last_anchor la
     JOIN instance_events blocker
       ON blocker.instance_id = la.instance_id
      AND (blocker.occurred_at, blocker.created_at, blocker.id) > (la.occurred_at, la.created_at, la.id)
      AND NOT (blocker.document_type = :ownDocumentType AND blocker.document_id = :ownDocumentId)
     JOIN instances instance ON instance.id = la.instance_id
     ORDER BY blocker.occurred_at DESC`,
    {
      replacements: { ownDocumentType, ownDocumentId, instanceIds },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
}

// Бросает ApiError.conflict(message, { blockingDocuments }), если по любому из
// instanceIds уже есть более поздняя операция другого документа. Ничего не
// делает, если список чист.
export async function assertNoBlockingDocuments(
  { instanceIds, ownDocumentType, ownDocumentId },
  { transaction } = {},
) {
  const rows = await findBlockingRows(
    { instanceIds, ownDocumentType, ownDocumentId },
    { transaction },
  );
  if (rows.length === 0) return;

  const byDocument = new Map();
  for (const row of rows) {
    const key = `${row.documentType}:${row.documentId}`;
    if (!byDocument.has(key)) {
      byDocument.set(key, {
        documentType: row.documentType,
        documentId: row.documentId,
        occurredAt: row.occurredAt,
        instanceInventoryNumbers: [],
      });
    }
    byDocument.get(key).instanceInventoryNumbers.push(row.inventoryNumber);
  }

  const labels = await resolveDocumentLabels([...byDocument.values()], { transaction });
  const blockingDocuments = [...byDocument.values()]
    .map((doc) => ({ ...doc, ...labels.get(`${doc.documentType}:${doc.documentId}`) }))
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

  const summary = blockingDocuments
    .map(
      (doc) =>
        `${doc.label ?? doc.documentType} ${doc.number ?? doc.documentId} ` +
        `(экз. ${doc.instanceInventoryNumbers.join(', ')})`,
    )
    .join('; ');

  throw ApiError.conflict(
    `Изменение невозможно: по затронутым экземплярам уже есть более поздние операции — ${summary}. ` +
      'Сначала отмените или скорректируйте эти документы, начиная с самого позднего.',
    { blockingDocuments },
  );
}

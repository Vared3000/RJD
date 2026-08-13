import { models } from '../../database/models/index.js';

// Общий журнал редакций проведённых документов (задача 22) — переиспользуется
// receiving и issuance, будет переиспользован задачей 23 (Возврат, Списание).
// По стилю зеркалит instance-events.repository.js.
export const documentRevisionsRepository = {
  create(
    {
      documentType,
      documentId,
      revisionNumber,
      action = 'revise',
      previousData,
      newData,
      reason,
      revisedByUserId,
      revisedAt,
    },
    { transaction } = {},
  ) {
    return models.DocumentRevision.create(
      {
        documentType,
        documentId,
        revisionNumber,
        action,
        previousData,
        newData,
        reason: reason || null,
        revisedByUserId: revisedByUserId ?? null,
        revisedAt,
      },
      { transaction },
    );
  },

  list(documentType, documentId) {
    return models.DocumentRevision.findAll({
      where: { documentType, documentId },
      include: [{ model: models.User, as: 'revisedByUser', attributes: ['id', 'fullName'] }],
      order: [['revisionNumber', 'DESC']],
    });
  },
};

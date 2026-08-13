import { DataTypes } from 'sequelize';

export function defineDocumentRevision(sequelize) {
  return sequelize.define(
    'DocumentRevision',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentType: { type: DataTypes.STRING(32), allowNull: false, field: 'document_type' },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      revisionNumber: { type: DataTypes.INTEGER, allowNull: false, field: 'revision_number' },
      previousData: { type: DataTypes.JSONB, allowNull: false, field: 'previous_data' },
      newData: { type: DataTypes.JSONB, allowNull: false, field: 'new_data' },
      reason: { type: DataTypes.STRING(500), allowNull: true },
      revisedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'revised_by_user_id' },
      revisedAt: { type: DataTypes.DATE, allowNull: false, field: 'revised_at' },
    },
    { tableName: 'document_revisions', updatedAt: false },
  );
}

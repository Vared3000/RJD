import { DataTypes } from 'sequelize';

export const WRITEOFF_DOCUMENT_STATUSES = ['draft', 'posted'];

export function defineWriteoffDocument(sequelize) {
  return sequelize.define(
    'WriteoffDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      responsibleUserId: { type: DataTypes.UUID, allowNull: false, field: 'responsible_user_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
      postedAt: { type: DataTypes.DATE, allowNull: true, field: 'posted_at' },
      postedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'posted_by_user_id' },
      revisionNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        field: 'revision_number',
      },
      lastRevisedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_revised_at' },
      lastRevisedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'last_revised_by_user_id',
      },
      note: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'writeoff_documents' },
  );
}

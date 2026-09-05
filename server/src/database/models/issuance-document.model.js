import { DataTypes } from 'sequelize';

// Проведение необратимо (переводит экземпляры в статус issued и создаёт
// движения склада), поэтому статусов всего два — как у ReceivingDocument.
export const ISSUANCE_DOCUMENT_STATUSES = ['draft', 'posted'];
export const ISSUANCE_DOCUMENT_KINDS = ['standard', 'completion', 'replacement'];

export function defineIssuanceDocument(sequelize) {
  return sequelize.define(
    'IssuanceDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      responsibleUserId: { type: DataTypes.UUID, allowNull: false, field: 'responsible_user_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
      issuanceKind: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'standard',
        field: 'issuance_kind',
      },
      postedAt: { type: DataTypes.DATE, allowNull: true, field: 'posted_at' },
      postedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'posted_by_user_id' },
      note: { type: DataTypes.STRING(1000), allowNull: true },
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
    },
    { tableName: 'issuance_documents' },
  );
}

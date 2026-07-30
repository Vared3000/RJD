import { DataTypes } from 'sequelize';

// Структурно идентичен LaundryDocument — см. комментарий там же и
// server/src/modules/service-documents/.
export const REPAIR_DOCUMENT_STATUSES = ['draft', 'sent', 'completed'];

export function defineRepairDocument(sequelize) {
  return sequelize.define(
    'RepairDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      responsibleUserId: { type: DataTypes.UUID, allowNull: false, field: 'responsible_user_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
      sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
      sentByUserId: { type: DataTypes.UUID, allowNull: true, field: 'sent_by_user_id' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
      completedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'completed_by_user_id' },
      note: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'repair_documents' },
  );
}

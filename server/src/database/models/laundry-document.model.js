import { DataTypes } from 'sequelize';

// Двухфазное проведение (в отличие от draft/posted у остальных складских
// документов): draft -> sent (экземпляры уходят в статус laundry) ->
// completed (возвращаются в in_stock). См. server/src/modules/service-documents/.
export const LAUNDRY_DOCUMENT_STATUSES = ['draft', 'sent', 'completed'];

export function defineLaundryDocument(sequelize) {
  return sequelize.define(
    'LaundryDocument',
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
    { tableName: 'laundry_documents' },
  );
}

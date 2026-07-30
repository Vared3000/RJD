import { DataTypes } from 'sequelize';

// draft/posted, как ReceivingDocument/IssuanceDocument — см. комментарий в
// миграции 0033.
export const TRANSFER_DOCUMENT_STATUSES = ['draft', 'posted'];

export function defineTransferDocument(sequelize) {
  return sequelize.define(
    'TransferDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      fromWarehouseId: { type: DataTypes.UUID, allowNull: false, field: 'from_warehouse_id' },
      toWarehouseId: { type: DataTypes.UUID, allowNull: false, field: 'to_warehouse_id' },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      responsibleUserId: { type: DataTypes.UUID, allowNull: false, field: 'responsible_user_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
      postedAt: { type: DataTypes.DATE, allowNull: true, field: 'posted_at' },
      postedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'posted_by_user_id' },
      note: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'transfer_documents' },
  );
}

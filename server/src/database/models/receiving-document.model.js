import { DataTypes } from 'sequelize';

// Проведение — необратимое действие (создаёт партию, экземпляры, движения
// склада), поэтому статусов всего два: черновик редактируем, проведённый — нет.
export const RECEIVING_DOCUMENT_STATUSES = ['draft', 'posted'];

export function defineReceivingDocument(sequelize) {
  return sequelize.define(
    'ReceivingDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      supplierId: { type: DataTypes.UUID, allowNull: false, field: 'supplier_id' },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      contractNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'contract_number' },
      invoiceNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'invoice_number' },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      responsibleUserId: { type: DataTypes.UUID, allowNull: false, field: 'responsible_user_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
      batchId: { type: DataTypes.UUID, allowNull: true, field: 'batch_id' },
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
    { tableName: 'receiving_documents' },
  );
}

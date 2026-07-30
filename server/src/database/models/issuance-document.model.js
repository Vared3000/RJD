import { DataTypes } from 'sequelize';

// Проведение необратимо (переводит экземпляры в статус issued и создаёт
// движения склада), поэтому статусов всего два — как у ReceivingDocument.
export const ISSUANCE_DOCUMENT_STATUSES = ['draft', 'posted'];

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
      postedAt: { type: DataTypes.DATE, allowNull: true, field: 'posted_at' },
      postedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'posted_by_user_id' },
      note: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'issuance_documents' },
  );
}

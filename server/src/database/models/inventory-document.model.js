import { DataTypes } from 'sequelize';

// draft/completed — не draft/posted: "проведение" здесь ничего не
// проводит в остатках (см. комментарий в миграции 0037), только
// фиксирует итог сверки.
export const INVENTORY_DOCUMENT_STATUSES = ['draft', 'completed'];

export function defineInventoryDocument(sequelize) {
  return sequelize.define(
    'InventoryDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      responsibleUserId: { type: DataTypes.UUID, allowNull: false, field: 'responsible_user_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
      completedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'completed_by_user_id' },
      note: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'inventory_documents' },
  );
}

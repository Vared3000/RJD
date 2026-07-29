import { DataTypes } from 'sequelize';

export function defineStockMovement(sequelize) {
  return sequelize.define(
    'StockMovement',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      fromWarehouseId: { type: DataTypes.UUID, allowNull: true, field: 'from_warehouse_id' },
      toWarehouseId: { type: DataTypes.UUID, allowNull: true, field: 'to_warehouse_id' },
      documentType: { type: DataTypes.STRING(32), allowNull: false, field: 'document_type' },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      occurredAt: { type: DataTypes.DATE, allowNull: false, field: 'occurred_at' },
      note: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'stock_movements', updatedAt: false },
  );
}

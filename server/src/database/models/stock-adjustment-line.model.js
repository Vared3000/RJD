import { DataTypes } from 'sequelize';

export const ADJUSTMENT_TYPES = ['surplus', 'shortage', 'relocate', 'condition'];

export function defineStockAdjustmentLine(sequelize) {
  return sequelize.define(
    'StockAdjustmentLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      adjustmentType: { type: DataTypes.STRING(16), allowNull: false, field: 'adjustment_type' },
      instanceId: { type: DataTypes.UUID, allowNull: true, field: 'instance_id' },
      modelId: { type: DataTypes.UUID, allowNull: true, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      toWarehouseId: { type: DataTypes.UUID, allowNull: true, field: 'to_warehouse_id' },
      toCondition: { type: DataTypes.STRING(32), allowNull: true, field: 'to_condition' },
      reason: { type: DataTypes.STRING(500), allowNull: false },
      note: { type: DataTypes.STRING(500), allowNull: true },
      inventoryDocumentId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'inventory_document_id',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'stock_adjustment_lines' },
  );
}

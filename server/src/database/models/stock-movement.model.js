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
      serviceLifeYearsSnapshot: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'service_life_years_snapshot',
      },
      plannedReplacementDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'planned_replacement_date',
      },
    },
    { tableName: 'stock_movements', updatedAt: false },
  );
}

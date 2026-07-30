import { DataTypes } from 'sequelize';

// Отличие от LaundryLine: cost — стоимость ремонта, заполняется при
// завершении (см. server/src/modules/repair/).
export function defineRepairLine(sequelize) {
  return sequelize.define(
    'RepairLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      conditionBefore: { type: DataTypes.STRING(32), allowNull: true, field: 'condition_before' },
      conditionAfter: { type: DataTypes.STRING(32), allowNull: true, field: 'condition_after' },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'repair_lines' },
  );
}

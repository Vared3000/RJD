import { DataTypes } from 'sequelize';

export function definePositionKitItem(sequelize) {
  return sequelize.define(
    'PositionKitItem',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      positionId: { type: DataTypes.UUID, allowNull: false, field: 'position_id' },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      serviceLifeYears: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'service_life_years',
      },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'position_kit_items' },
  );
}

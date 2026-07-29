import { DataTypes } from 'sequelize';

export function defineWarehouse(sequelize) {
  return sequelize.define(
    'Warehouse',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
      name: { type: DataTypes.STRING(255), allowNull: false },
      code: { type: DataTypes.STRING(64), allowNull: true },
      address: { type: DataTypes.STRING(500), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    {
      tableName: 'warehouses',
      indexes: [{ unique: true, fields: ['organization_id', 'code'] }],
    },
  );
}

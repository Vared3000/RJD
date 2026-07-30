import { DataTypes } from 'sequelize';

export const SIZE_TYPES = ['clothing', 'height', 'shoe', 'headwear', 'belt', 'gloves'];

export function defineSize(sequelize) {
  return sequelize.define(
    'Size',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      type: { type: DataTypes.STRING(32), allowNull: false },
      value: { type: DataTypes.STRING(32), allowNull: false },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    {
      tableName: 'sizes',
      indexes: [{ unique: true, fields: ['type', 'value'] }],
    },
  );
}

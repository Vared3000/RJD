import { DataTypes } from 'sequelize';

export function definePosition(sequelize) {
  return sequelize.define(
    'Position',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      code: { type: DataTypes.STRING(64), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'positions' },
  );
}

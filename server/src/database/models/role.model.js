import { DataTypes } from 'sequelize';

export function defineRole(sequelize) {
  return sequelize.define(
    'Role',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'roles',
    },
  );
}

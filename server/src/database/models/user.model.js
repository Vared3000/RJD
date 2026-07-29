import { DataTypes } from 'sequelize';

export function defineUser(sequelize) {
  return sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      login: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'password_hash',
      },
      fullName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'full_name',
      },
      roleId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'role_id',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_login_at',
      },
      archivedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'archived_at',
      },
    },
    {
      tableName: 'users',
    },
  );
}

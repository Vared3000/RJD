import { DataTypes } from 'sequelize';

export function defineRolePermission(sequelize) {
  return sequelize.define(
    'RolePermission',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      roleId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'role_id',
      },
      permissionId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'permission_id',
      },
    },
    {
      tableName: 'role_permissions',
      indexes: [{ unique: true, fields: ['role_id', 'permission_id'] }],
    },
  );
}

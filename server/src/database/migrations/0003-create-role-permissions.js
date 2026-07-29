import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('role_permissions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'roles', key: 'id' },
      onDelete: 'CASCADE',
    },
    permission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'permissions', key: 'id' },
      onDelete: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('role_permissions', ['role_id', 'permission_id'], {
    unique: true,
    name: 'role_permissions_role_id_permission_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('role_permissions');
}

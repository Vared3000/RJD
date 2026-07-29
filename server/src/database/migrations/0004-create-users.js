import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('users', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    login: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    full_name: { type: DataTypes.STRING(255), allowNull: false },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'roles', key: 'id' },
      onDelete: 'RESTRICT',
    },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('users');
}

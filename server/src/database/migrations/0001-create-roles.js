import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('roles', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('roles');
}

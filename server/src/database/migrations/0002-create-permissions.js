import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('permissions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('permissions');
}

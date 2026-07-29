import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('nomenclature_models', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    article: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    unit: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'шт' },
    description: { type: DataTypes.STRING(1000), allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('nomenclature_models');
}

import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('nomenclature_models', 'size_type', {
    type: DataTypes.STRING(32),
    allowNull: true,
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().removeColumn('nomenclature_models', 'size_type');
}

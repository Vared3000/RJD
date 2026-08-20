import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.addColumn('dpos', 'region', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });

  await qi.addColumn('nomenclature_models', 'gender_category', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'unspecified',
  });
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('nomenclature_models', 'gender_category');
  await qi.removeColumn('dpos', 'region');
}

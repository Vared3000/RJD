import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  await sequelize.getQueryInterface().addColumn('dpos', 'director_full_name_genitive', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().removeColumn('dpos', 'director_full_name_genitive');
}

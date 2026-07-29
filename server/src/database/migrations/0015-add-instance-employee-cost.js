import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  await sequelize
    .getQueryInterface()
    .addColumn('instances', 'employee_cost', { type: DataTypes.DECIMAL(12, 2), allowNull: true });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().removeColumn('instances', 'employee_cost');
}

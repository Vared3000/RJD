import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('instances', 'employee_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'employees', key: 'id' },
    onDelete: 'RESTRICT',
  });
  await qi.addIndex('instances', ['employee_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().removeColumn('instances', 'employee_id');
}

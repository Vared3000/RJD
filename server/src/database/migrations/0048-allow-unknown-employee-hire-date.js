import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  await sequelize.getQueryInterface().changeColumn('employees', 'hire_date', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
}

export async function down({ context: sequelize }) {
  await sequelize.query(`
    UPDATE employees
       SET hire_date = COALESCE(created_at::date, CURRENT_DATE)
     WHERE hire_date IS NULL
  `);
  await sequelize.getQueryInterface().changeColumn('employees', 'hire_date', {
    type: DataTypes.DATEONLY,
    allowNull: false,
  });
}

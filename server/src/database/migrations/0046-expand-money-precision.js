import { DataTypes } from 'sequelize';

const MONEY_4 = DataTypes.DECIMAL(14, 4);
const MONEY_2 = DataTypes.DECIMAL(12, 2);

async function changeMoneyColumns(qi, type) {
  await qi.changeColumn('instances', 'cost', { type, allowNull: true });
  await qi.changeColumn('instances', 'employee_cost', { type, allowNull: true });
  await qi.changeColumn('receiving_lines', 'purchase_price', { type, allowNull: false });
  await qi.changeColumn('receiving_lines', 'employee_cost', { type, allowNull: true });
  await qi.changeColumn('repair_lines', 'cost', { type, allowNull: true });
}

export async function up({ context: sequelize }) {
  await changeMoneyColumns(sequelize.getQueryInterface(), MONEY_4);
}

export async function down({ context: sequelize }) {
  await changeMoneyColumns(sequelize.getQueryInterface(), MONEY_2);
}

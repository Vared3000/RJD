import { DataTypes } from 'sequelize';

// Этап 9: Возврат может направить экземпляр не в in_stock, а сразу в
// laundry/repair (см. HANDOFF.md и комментарий в return.service.js) —
// вместо отдельного шага "оприходовать на склад, потом отправить в стирку".
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('return_lines', 'route_to', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'in_stock',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().removeColumn('return_lines', 'route_to');
}

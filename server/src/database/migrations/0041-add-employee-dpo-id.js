import { DataTypes } from 'sequelize';

// Привязка работника к ДПО заказчика (раздел 10 ТЗ) — нужна для отчёта по
// ДПО (раздел 12 ТЗ) и будущих печатных форм (Этап 12). Nullable: не каждый
// работник обязательно привязан к конкретной ДПО на момент внедрения.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.addColumn('employees', 'dpo_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'dpos', key: 'id' },
    onDelete: 'RESTRICT',
  });

  await qi.addIndex('employees', ['dpo_id']);
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('employees', 'dpo_id');
}

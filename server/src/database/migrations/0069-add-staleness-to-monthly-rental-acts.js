import { DataTypes } from 'sequelize';

// Задача 22: только маркер "требует пересчёта" — сам пересчёт и
// версионирование актов делает задача 24. getOrCreate()/build() в
// monthly-rental-act.service.js не меняются.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('monthly_rental_acts', 'is_stale', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
  await qi.addColumn('monthly_rental_acts', 'stale_reason', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
  await qi.addColumn('monthly_rental_acts', 'stale_at', { type: DataTypes.DATE, allowNull: true });
  await qi.addIndex('monthly_rental_acts', ['is_stale'], {
    name: 'idx_monthly_rental_acts_stale',
  });
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeIndex('monthly_rental_acts', 'idx_monthly_rental_acts_stale');
  await qi.removeColumn('monthly_rental_acts', 'stale_at');
  await qi.removeColumn('monthly_rental_acts', 'stale_reason');
  await qi.removeColumn('monthly_rental_acts', 'is_stale');
}

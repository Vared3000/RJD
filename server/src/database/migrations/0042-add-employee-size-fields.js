import { DataTypes } from 'sequelize';

// Индивидуальные размеры работника (реальные личные карточки заказчика,
// см. HANDOFF.md) — головной убор/ремень/перчатки, по аналогии с уже
// существующими clothing_size_id/height_size_id/shoe_size_id.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  for (const column of ['headwear_size_id', 'belt_size_id', 'gloves_size_id']) {
    await qi.addColumn('employees', column, {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    });
  }
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('employees', 'headwear_size_id');
  await qi.removeColumn('employees', 'belt_size_id');
  await qi.removeColumn('employees', 'gloves_size_id');
}

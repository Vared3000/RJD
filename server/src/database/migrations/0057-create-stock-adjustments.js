import { DataTypes } from 'sequelize';

// Корректировка (раздел 11 ТЗ, задача 7 docs/IMPROVEMENT_PLAN.md) — draft/posted,
// как Списание/Перемещение. В отличие от них покрывает 4 разных типа строк
// (см. миграцию 0058: surplus/shortage/relocate/condition), поэтому шапка не
// привязана к одной операции — warehouseId здесь означает склад, на котором
// проводился пересчёт (для surplus/relocate фактический целевой склад хранится
// в строке, см. to_warehouse_id).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query(
    'CREATE SEQUENCE IF NOT EXISTS stock_adjustment_document_number_seq START 1',
  );

  await qi.createTable('stock_adjustments', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    warehouse_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    document_date: { type: DataTypes.DATEONLY, allowNull: false },
    responsible_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
    posted_at: { type: DataTypes.DATE, allowNull: true },
    posted_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    note: { type: DataTypes.STRING(1000), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('stock_adjustments', ['status']);
  await qi.addIndex('stock_adjustments', ['warehouse_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('stock_adjustments');
  await sequelize.query('DROP SEQUENCE IF EXISTS stock_adjustment_document_number_seq');
}

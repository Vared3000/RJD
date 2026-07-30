import { DataTypes } from 'sequelize';

// Инвентаризация (раздел 11 ТЗ, Этап 10) — НЕ укладывается в паттерн
// шапка+строки+проведение остальных складских документов: это сверка
// фактического наличия с учётными данными, а не операция, меняющая
// остатки сама по себе (расхождения оформляются отдельным документом
// "Списание" — см. HANDOFF.md). Поэтому только draft/completed, без
// какого-либо движения склада на завершении.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS inventory_document_number_seq START 1');

  await qi.createTable('inventory_documents', {
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
    completed_at: { type: DataTypes.DATE, allowNull: true },
    completed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    note: { type: DataTypes.STRING(1000), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('inventory_documents', ['status']);
  await qi.addIndex('inventory_documents', ['warehouse_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('inventory_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS inventory_document_number_seq');
}

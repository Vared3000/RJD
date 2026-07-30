import { DataTypes } from 'sequelize';

// Списание (раздел 11 ТЗ, Этап 10) — draft/posted, одна транзакция
// проведения (как Перемещение). Проведение переводит экземпляр в
// status='write_off' окончательно — движение склада без toWarehouseId
// (аналогично Выдаче: экземпляр покидает остатки).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS writeoff_document_number_seq START 1');

  await qi.createTable('writeoff_documents', {
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

  await qi.addIndex('writeoff_documents', ['status']);
  await qi.addIndex('writeoff_documents', ['warehouse_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('writeoff_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS writeoff_document_number_seq');
}

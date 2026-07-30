import { DataTypes } from 'sequelize';

// Перемещение (раздел 11 ТЗ, Этап 10) — draft/posted, одна транзакция
// проведения (как Поступление/Выдача/Возврат), но, в отличие от них,
// у StockMovement на проведении заполнены ОБА поля fromWarehouseId и
// toWarehouseId (у остальных документов всегда ровно одно из двух).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS transfer_document_number_seq START 1');

  await qi.createTable('transfer_documents', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    from_warehouse_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    to_warehouse_id: {
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

  await qi.addIndex('transfer_documents', ['status']);
  await qi.addIndex('transfer_documents', ['from_warehouse_id']);
  await qi.addIndex('transfer_documents', ['to_warehouse_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('transfer_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS transfer_document_number_seq');
}

import { DataTypes } from 'sequelize';

// Стирка (раздел 11/18 ТЗ, Этап 9) — двухфазный документ (в отличие от
// draft/posted у Поступления/Выдачи/Возврата): draft -> sent -> completed.
// sent переводит экземпляры в статус laundry (см. INSTANCE_STATUSES), они
// выпадают из остатков; completed возвращает их в in_stock. См. также
// server/src/modules/service-documents/ (общая фабрика для laundry/repair).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS laundry_document_number_seq START 1');

  await qi.createTable('laundry_documents', {
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
    sent_at: { type: DataTypes.DATE, allowNull: true },
    sent_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
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

  await qi.addIndex('laundry_documents', ['status']);
  await qi.addIndex('laundry_documents', ['warehouse_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('laundry_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS laundry_document_number_seq');
}

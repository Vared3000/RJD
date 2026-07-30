import { DataTypes } from 'sequelize';

// Ремонт — структурно идентичен Стирке (см. 0028-create-laundry-documents.js
// и server/src/modules/service-documents/), отдельная таблица и модуль по
// таблице соответствий раздела ТЗ в docs/architecture.md.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS repair_document_number_seq START 1');

  await qi.createTable('repair_documents', {
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

  await qi.addIndex('repair_documents', ['status']);
  await qi.addIndex('repair_documents', ['warehouse_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('repair_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS repair_document_number_seq');
}

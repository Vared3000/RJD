import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS receiving_document_number_seq START 1');

  await qi.createTable('receiving_documents', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    supplier_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'suppliers', key: 'id' },
      onDelete: 'RESTRICT',
    },
    warehouse_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    contract_number: { type: DataTypes.STRING(128), allowNull: true },
    invoice_number: { type: DataTypes.STRING(64), allowNull: true },
    document_date: { type: DataTypes.DATEONLY, allowNull: false },
    responsible_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
    batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'batches', key: 'id' },
      onDelete: 'RESTRICT',
    },
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

  await qi.addIndex('receiving_documents', ['status']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('receiving_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS receiving_document_number_seq');
}

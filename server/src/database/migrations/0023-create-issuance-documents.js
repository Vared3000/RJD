import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS issuance_document_number_seq START 1');

  await qi.createTable('issuance_documents', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onDelete: 'RESTRICT',
    },
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

  await qi.addIndex('issuance_documents', ['status']);
  await qi.addIndex('issuance_documents', ['employee_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('issuance_documents');
  await sequelize.query('DROP SEQUENCE IF EXISTS issuance_document_number_seq');
}

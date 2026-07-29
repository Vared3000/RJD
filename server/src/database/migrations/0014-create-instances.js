import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await sequelize.query('CREATE SEQUENCE IF NOT EXISTS instance_inventory_number_seq START 1');

  await qi.createTable('instances', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'nomenclature_models', key: 'id' },
      onDelete: 'RESTRICT',
    },
    size_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    },
    batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'batches', key: 'id' },
      onDelete: 'RESTRICT',
    },
    warehouse_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    inventory_number: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    barcode: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'in_stock' },
    condition: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'new' },
    cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('instances', ['model_id']);
  await qi.addIndex('instances', ['status']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('instances');
  await sequelize.query('DROP SEQUENCE IF EXISTS instance_inventory_number_seq');
}

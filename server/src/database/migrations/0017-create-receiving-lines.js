import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('receiving_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'receiving_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
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
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    purchase_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    employee_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    vat_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: 20 },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('receiving_lines', ['document_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('receiving_lines');
}

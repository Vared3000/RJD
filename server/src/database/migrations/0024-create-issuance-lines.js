import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('issuance_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'issuance_documents', key: 'id' },
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
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('issuance_lines', ['document_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('issuance_lines');
}

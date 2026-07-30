import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('return_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'return_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    condition: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'good' },
    note: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('return_lines', ['document_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('return_lines');
}

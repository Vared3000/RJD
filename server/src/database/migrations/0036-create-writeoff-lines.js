import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('writeoff_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'writeoff_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('writeoff_lines', ['document_id']);
  await qi.addIndex('writeoff_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'writeoff_lines_document_id_instance_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('writeoff_lines');
}

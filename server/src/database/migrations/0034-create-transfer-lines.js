import { DataTypes } from 'sequelize';

// Уникальный индекс (document_id, instance_id) сразу — см. дефект дублей
// строк Этапа 8 в HANDOFF.md, не повторяем на новых документах.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('transfer_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'transfer_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    note: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('transfer_lines', ['document_id']);
  await qi.addIndex('transfer_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'transfer_lines_document_id_instance_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('transfer_lines');
}

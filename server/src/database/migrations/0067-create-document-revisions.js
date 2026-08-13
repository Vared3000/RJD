import { DataTypes } from 'sequelize';

// document_id — намеренно без FK, тот же приём, что stock_movements/
// instance_events: document_type определяет, в какой таблице искать
// документ (полиморфная ссылка, переиспользуется задачами 22 и 23).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('document_revisions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_type: { type: DataTypes.STRING(32), allowNull: false },
    document_id: { type: DataTypes.UUID, allowNull: false },
    revision_number: { type: DataTypes.INTEGER, allowNull: false },
    previous_data: { type: DataTypes.JSONB, allowNull: false },
    new_data: { type: DataTypes.JSONB, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    revised_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    revised_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('document_revisions', ['document_type', 'document_id', 'revision_number'], {
    unique: true,
    name: 'uq_document_revisions_document_revision',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('document_revisions');
}

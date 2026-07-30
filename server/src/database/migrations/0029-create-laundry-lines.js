import { DataTypes } from 'sequelize';

// Уникальный индекс (document_id, instance_id) сразу — см. дефект Этапа 8
// в HANDOFF.md: без него ничего не мешает добавить один и тот же экземпляр
// дважды и задвоить движение склада при отправке/завершении.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('laundry_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'laundry_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    condition_before: { type: DataTypes.STRING(32), allowNull: true },
    condition_after: { type: DataTypes.STRING(32), allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('laundry_lines', ['document_id']);
  await qi.addIndex('laundry_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'laundry_lines_document_id_instance_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('laundry_lines');
}

import { DataTypes } from 'sequelize';

// Релиз Д (см. HANDOFF.md): довыдача по задаче на доукомплектовку теперь
// оформляется обычным черновиком Выдачи, а не создаётся и сразу проводится
// втихую. Одна задача может закрываться частично несколькими документами со
// временем — единственное поле fulfilling_document_id этого не переживает,
// поэтому история переносится в отдельную таблицу issuance_task_fulfillments
// (task_id, document_id, quantity — сколько именно этот документ закрыл).
// draft_document_id — обратный указатель "сейчас в оформлении в этом
// черновике", отдельный от истории закрытий.
export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.addColumn('issuance_tasks', 'draft_document_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'issuance_documents', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await queryInterface.addIndex('issuance_tasks', ['draft_document_id'], {
    name: 'issuance_tasks_draft_document_idx',
  });

  await queryInterface.createTable('issuance_task_fulfillments', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    task_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'issuance_tasks', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'issuance_documents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('issuance_task_fulfillments', ['task_id', 'document_id'], {
    name: 'uq_issuance_task_fulfillments_task_document',
    unique: true,
  });
  await queryInterface.addIndex('issuance_task_fulfillments', ['document_id'], {
    name: 'issuance_task_fulfillments_document_idx',
  });

  // Бэкофилл: до этого релиза одна задача закрывалась ровно одним документом
  // на всю свою (тогда ещё неизменяемую) сумму — переносим это как первую
  // историческую запись, прежде чем убрать колонку.
  await sequelize.query(`
    INSERT INTO issuance_task_fulfillments (id, task_id, document_id, quantity, created_at)
    SELECT gen_random_uuid(), id, fulfilling_document_id, quantity, COALESCE(completed_at, updated_at)
    FROM issuance_tasks
    WHERE fulfilling_document_id IS NOT NULL
  `);

  await queryInterface.removeColumn('issuance_tasks', 'fulfilling_document_id');
}

export async function down({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.addColumn('issuance_tasks', 'fulfilling_document_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'issuance_documents', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await queryInterface.dropTable('issuance_task_fulfillments');
  await queryInterface.removeColumn('issuance_tasks', 'draft_document_id');
}

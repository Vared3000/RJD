import { DataTypes } from 'sequelize';

// История изменений ДПО (раздел 10 ТЗ). На каждое изменение — снимок старых
// значений изменившихся полей (previous_data), не полная копия строки: этого
// достаточно, чтобы восстановить diff «было -> стало» между соседними
// записями и текущим состоянием (см. dpo.service.js getHistory).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.createTable('dpo_history', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    dpo_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'dpos', key: 'id' },
      onDelete: 'CASCADE',
    },
    changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    changed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    previous_data: { type: DataTypes.JSONB, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('dpo_history', ['dpo_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('dpo_history');
}

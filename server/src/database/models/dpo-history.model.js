import { DataTypes } from 'sequelize';

export function defineDpoHistory(sequelize) {
  return sequelize.define(
    'DpoHistory',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      dpoId: { type: DataTypes.UUID, allowNull: false, field: 'dpo_id' },
      changedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'changed_at',
      },
      changedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'changed_by_user_id' },
      // Снимок СТАРЫХ значений только тех полей, что изменились этой правкой
      // (не полная копия строки) — см. dpo.service.js.
      previousData: { type: DataTypes.JSONB, allowNull: false, field: 'previous_data' },
    },
    { tableName: 'dpo_history', updatedAt: false },
  );
}

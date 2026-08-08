import { DataTypes } from 'sequelize';

// Журнал административных действий над пользователями (задача 6
// docs/IMPROVEMENT_PLAN.md, раздел "Логировать смену роли, блокировку и
// сброс пароля"). Explicit event_type (create/role_change/block/unblock/
// password_reset/sessions_revoked) — как у instance_events, а не общий diff
// по полям (как у dpo_history): у разных админ-действий разная бизнес-логика
// и разный смысл, явный тип читается однозначно в списке событий.
export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable('user_admin_events', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    event_type: { type: DataTypes.STRING(32), allowNull: false },
    from_role_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'roles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    to_role_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'roles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    performed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('user_admin_events', ['user_id', 'occurred_at'], {
    name: 'user_admin_events_user_timeline_idx',
  });
  await queryInterface.addIndex('user_admin_events', ['event_type'], {
    name: 'user_admin_events_event_type_idx',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('user_admin_events');
}

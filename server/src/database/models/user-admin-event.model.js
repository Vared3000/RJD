import { DataTypes } from 'sequelize';

export const USER_ADMIN_EVENT_TYPES = [
  'create',
  'role_change',
  'block',
  'unblock',
  'password_reset',
  'sessions_revoked',
];

export function defineUserAdminEvent(sequelize) {
  return sequelize.define(
    'UserAdminEvent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      eventType: { type: DataTypes.STRING(32), allowNull: false, field: 'event_type' },
      fromRoleId: { type: DataTypes.UUID, allowNull: true, field: 'from_role_id' },
      toRoleId: { type: DataTypes.UUID, allowNull: true, field: 'to_role_id' },
      performedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'performed_by_user_id' },
      occurredAt: { type: DataTypes.DATE, allowNull: false, field: 'occurred_at' },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    { tableName: 'user_admin_events' },
  );
}

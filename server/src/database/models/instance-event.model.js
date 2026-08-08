import { DataTypes } from 'sequelize';

export function defineInstanceEvent(sequelize) {
  return sequelize.define(
    'InstanceEvent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      eventType: { type: DataTypes.STRING(32), allowNull: false, field: 'event_type' },
      fromStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'from_status' },
      toStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'to_status' },
      fromCondition: { type: DataTypes.STRING(32), allowNull: true, field: 'from_condition' },
      toCondition: { type: DataTypes.STRING(32), allowNull: true, field: 'to_condition' },
      fromWarehouseId: { type: DataTypes.UUID, allowNull: true, field: 'from_warehouse_id' },
      toWarehouseId: { type: DataTypes.UUID, allowNull: true, field: 'to_warehouse_id' },
      fromEmployeeId: { type: DataTypes.UUID, allowNull: true, field: 'from_employee_id' },
      toEmployeeId: { type: DataTypes.UUID, allowNull: true, field: 'to_employee_id' },
      documentType: { type: DataTypes.STRING(32), allowNull: true, field: 'document_type' },
      documentId: { type: DataTypes.UUID, allowNull: true, field: 'document_id' },
      occurredAt: { type: DataTypes.DATE, allowNull: false, field: 'occurred_at' },
      userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    { tableName: 'instance_events' },
  );
}

import { DataTypes } from 'sequelize';

export const ISSUANCE_TASK_STATUSES = [
  'scheduled',
  'open',
  'overdue',
  'in_progress',
  'completed',
  'cancelled',
];
export const ISSUANCE_TASK_TYPES = ['completion', 'replacement'];

export function defineIssuanceTask(sequelize) {
  return sequelize.define(
    'IssuanceTask',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      sourceDocumentId: { type: DataTypes.UUID, allowNull: false, field: 'source_document_id' },
      draftDocumentId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'draft_document_id',
      },
      taskType: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'completion',
        field: 'task_type',
      },
      sourceMovementId: { type: DataTypes.UUID, allowNull: true, field: 'source_movement_id' },
      sourceInstanceId: { type: DataTypes.UUID, allowNull: true, field: 'source_instance_id' },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
      completedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'completed_by_user_id' },
      issuedAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'issued_at' },
      serviceLifeYearsSnapshot: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'service_life_years_snapshot',
      },
      plannedReplacementDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'planned_replacement_date',
      },
      notificationDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'notification_date' },
      cancelledAt: { type: DataTypes.DATE, allowNull: true, field: 'cancelled_at' },
      cancelReason: { type: DataTypes.STRING(500), allowNull: true, field: 'cancel_reason' },
      cancelledByReturnDocumentId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'cancelled_by_return_document_id',
      },
    },
    { tableName: 'issuance_tasks' },
  );
}

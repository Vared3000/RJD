import { DataTypes } from 'sequelize';

export const ISSUANCE_TASK_STATUSES = ['open', 'in_progress', 'completed'];

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
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      warehouseId: { type: DataTypes.UUID, allowNull: false, field: 'warehouse_id' },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
      completedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'completed_by_user_id' },
    },
    { tableName: 'issuance_tasks' },
  );
}

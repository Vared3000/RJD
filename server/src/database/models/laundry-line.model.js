import { DataTypes } from 'sequelize';

export function defineLaundryLine(sequelize) {
  return sequelize.define(
    'LaundryLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      conditionBefore: { type: DataTypes.STRING(32), allowNull: true, field: 'condition_before' },
      conditionAfter: { type: DataTypes.STRING(32), allowNull: true, field: 'condition_after' },
      note: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'laundry_lines' },
  );
}

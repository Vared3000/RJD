import { DataTypes } from 'sequelize';

export function defineReturnLine(sequelize) {
  return sequelize.define(
    'ReturnLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      condition: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'good' },
      note: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'return_lines' },
  );
}

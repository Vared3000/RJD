import { DataTypes } from 'sequelize';

export function defineWriteoffLine(sequelize) {
  return sequelize.define(
    'WriteoffLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      reason: { type: DataTypes.STRING(500), allowNull: false },
      note: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'writeoff_lines' },
  );
}

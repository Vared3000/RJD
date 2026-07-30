import { DataTypes } from 'sequelize';

export function defineTransferLine(sequelize) {
  return sequelize.define(
    'TransferLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      note: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'transfer_lines' },
  );
}

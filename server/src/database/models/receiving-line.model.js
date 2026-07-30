import { DataTypes } from 'sequelize';

export function defineReceivingLine(sequelize) {
  return sequelize.define(
    'ReceivingLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      purchasePrice: { type: DataTypes.DECIMAL(14, 4), allowNull: false, field: 'purchase_price' },
      employeeCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, field: 'employee_cost' },
      vatRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 20,
        field: 'vat_rate',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'receiving_lines' },
  );
}

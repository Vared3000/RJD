import { DataTypes } from 'sequelize';

export function defineIssuanceLine(sequelize) {
  return sequelize.define(
    'IssuanceLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      priceSourceId: { type: DataTypes.UUID, allowNull: true, field: 'price_source_id' },
      priceEffectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'price_effective_date',
      },
      priceWithoutVatSnapshot: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        field: 'price_without_vat_snapshot',
      },
      vatRateSnapshot: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: true,
        field: 'vat_rate_snapshot',
      },
      priceWithVatSnapshot: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        field: 'price_with_vat_snapshot',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'issuance_lines' },
  );
}

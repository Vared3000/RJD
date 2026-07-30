import { DataTypes } from 'sequelize';

export function defineNomenclaturePrice(sequelize) {
  return sequelize.define(
    'NomenclaturePrice',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      dpoId: { type: DataTypes.UUID, allowNull: true, field: 'dpo_id' },
      sourceRecordId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        field: 'source_record_id',
      },
      effectiveDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_date' },
      priceWithoutVat: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        field: 'price_without_vat',
      },
      vatRate: { type: DataTypes.DECIMAL(7, 4), allowNull: true, field: 'vat_rate' },
      priceWithVat: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        field: 'price_with_vat',
      },
    },
    { tableName: 'nomenclature_prices' },
  );
}

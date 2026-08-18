import { DataTypes } from 'sequelize';

export function defineNomenclatureModel(sequelize) {
  return sequelize.define(
    'NomenclatureModel',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      article: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      unit: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'шт' },
      // Тип размера модели (одежда/рост/обувь) — по нему автоподбор
      // комплекта (Этап 8) выбирает нужный из трёх размеров работника.
      sizeType: { type: DataTypes.STRING(32), allowNull: true, field: 'size_type' },
      // Составной размер "одежда + рост" (см. HANDOFF.md) — осмысленно
      // только при sizeType='clothing', проверяется в валидации.
      requiresHeightSize: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'requires_height_size',
      },
      rentalPrice: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0,
        field: 'rental_price',
      },
      rentalVatRate: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: false,
        defaultValue: 5,
        field: 'rental_vat_rate',
      },
      description: { type: DataTypes.STRING(1000), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'nomenclature_models' },
  );
}

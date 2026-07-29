import { DataTypes } from 'sequelize';

export function defineNomenclatureModel(sequelize) {
  return sequelize.define(
    'NomenclatureModel',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      article: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      unit: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'шт' },
      description: { type: DataTypes.STRING(1000), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'nomenclature_models' },
  );
}

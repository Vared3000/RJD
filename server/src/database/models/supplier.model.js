import { DataTypes } from 'sequelize';

export function defineSupplier(sequelize) {
  return sequelize.define(
    'Supplier',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      fullName: { type: DataTypes.STRING(500), allowNull: true, field: 'full_name' },
      inn: { type: DataTypes.STRING(12), allowNull: true },
      kpp: { type: DataTypes.STRING(9), allowNull: true },
      address: { type: DataTypes.STRING(500), allowNull: true },
      contactPerson: { type: DataTypes.STRING(255), allowNull: true, field: 'contact_person' },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'suppliers' },
  );
}

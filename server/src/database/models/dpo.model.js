import { DataTypes } from 'sequelize';

export function defineDpo(sequelize) {
  return sequelize.define(
    'Dpo',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      fullName: { type: DataTypes.STRING(500), allowNull: false, field: 'full_name' },
      code: { type: DataTypes.STRING(32), allowNull: true, unique: true },
      address: { type: DataTypes.STRING(500), allowNull: true },
      okpo: { type: DataTypes.STRING(16), allowNull: true },
      businessUnitCode: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'business_unit_code',
      },
      directorFullName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'director_full_name',
      },
      directorBasis: { type: DataTypes.STRING(500), allowNull: true, field: 'director_basis' },
      contractNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'contract_number' },
      contractDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'contract_date' },
      additionalAgreementNumber: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'additional_agreement_number',
      },
      additionalAgreementDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'additional_agreement_date',
      },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'dpos' },
  );
}

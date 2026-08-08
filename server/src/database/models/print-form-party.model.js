import { DataTypes } from 'sequelize';

export const PRINT_FORM_PARTY_ROLES = ['executor', 'customer'];

export function definePrintFormParty(sequelize) {
  return sequelize.define(
    'PrintFormParty',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      role: { type: DataTypes.STRING(16), allowNull: false },
      effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
      fullName: { type: DataTypes.TEXT, allowNull: false, field: 'full_name' },
      shortName: { type: DataTypes.STRING(255), allowNull: false, field: 'short_name' },
      inn: { type: DataTypes.STRING(12), allowNull: false },
      kpp: { type: DataTypes.STRING(9), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: false },
      okpo: { type: DataTypes.STRING(10), allowNull: true },
      directorFullName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'director_full_name',
      },
      directorPosition: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'director_position',
      },
      directorBasis: { type: DataTypes.STRING(255), allowNull: false, field: 'director_basis' },
      bankName: { type: DataTypes.TEXT, allowNull: true, field: 'bank_name' },
      bik: { type: DataTypes.STRING(9), allowNull: true },
      correspondentAccount: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'correspondent_account',
      },
      settlementAccount: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'settlement_account',
      },
      contractNumber: { type: DataTypes.STRING(255), allowNull: true, field: 'contract_number' },
      contractDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'contract_date' },
      createdByUserId: { type: DataTypes.UUID, allowNull: true, field: 'created_by_user_id' },
    },
    { tableName: 'print_form_parties' },
  );
}

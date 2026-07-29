import { DataTypes } from 'sequelize';

export function defineEmployee(sequelize) {
  return sequelize.define(
    'Employee',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
      subdivisionId: { type: DataTypes.UUID, allowNull: true, field: 'subdivision_id' },
      positionId: { type: DataTypes.UUID, allowNull: true, field: 'position_id' },
      fullName: { type: DataTypes.STRING(255), allowNull: false, field: 'full_name' },
      personnelNumber: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        field: 'personnel_number',
      },
      birthDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'birth_date' },
      hireDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'hire_date' },
      // Дата увольнения — бизнес-факт (используется в расчёте стажа и в
      // отчётности, раздел 12 ТЗ), не путать с archivedAt (мягкое удаление
      // самой записи — см. docs/architecture.md).
      terminationDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'termination_date' },
      clothingSizeId: { type: DataTypes.UUID, allowNull: true, field: 'clothing_size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      shoeSizeId: { type: DataTypes.UUID, allowNull: true, field: 'shoe_size_id' },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'employees' },
  );
}

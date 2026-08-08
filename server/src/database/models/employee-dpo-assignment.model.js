import { DataTypes } from 'sequelize';

export function defineEmployeeDpoAssignment(sequelize) {
  return sequelize.define(
    'EmployeeDpoAssignment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      dpoId: { type: DataTypes.UUID, allowNull: false, field: 'dpo_id' },
      validFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'valid_from' },
      validTo: { type: DataTypes.DATEONLY, allowNull: true, field: 'valid_to' },
      changedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'changed_by_user_id' },
    },
    { tableName: 'employee_dpo_assignments' },
  );
}

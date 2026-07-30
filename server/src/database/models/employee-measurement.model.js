import { DataTypes } from 'sequelize';

export function defineEmployeeMeasurement(sequelize) {
  return sequelize.define(
    'EmployeeMeasurement',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      sourceRecordId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'source_record_id',
      },
      sizeType: { type: DataTypes.STRING(32), allowNull: false, field: 'size_type' },
      value: { type: DataTypes.STRING(32), allowNull: false },
    },
    { tableName: 'employee_measurements' },
  );
}

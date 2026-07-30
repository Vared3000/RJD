import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('employee_measurements', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onDelete: 'CASCADE',
    },
    source_record_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'source_import_records', key: 'id' },
      onDelete: 'CASCADE',
    },
    size_type: { type: DataTypes.STRING(32), allowNull: false },
    value: { type: DataTypes.STRING(32), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex(
    'employee_measurements',
    ['employee_id', 'source_record_id', 'size_type', 'value'],
    { unique: true, name: 'employee_measurements_source_value_unique' },
  );
  await qi.addIndex('employee_measurements', ['employee_id', 'size_type']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('employee_measurements');
}

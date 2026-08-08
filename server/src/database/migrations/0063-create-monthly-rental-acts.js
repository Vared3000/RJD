import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.createTable('employee_dpo_assignments', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onDelete: 'CASCADE',
    },
    dpo_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'dpos', key: 'id' },
      onDelete: 'RESTRICT',
    },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
    changed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('employee_dpo_assignments', ['employee_id', 'valid_from'], {
    unique: true,
    name: 'uq_employee_dpo_assignments_start',
  });
  await qi.addIndex('employee_dpo_assignments', ['dpo_id', 'valid_from', 'valid_to'], {
    name: 'idx_employee_dpo_assignments_period',
  });

  await sequelize.query(`
    INSERT INTO employee_dpo_assignments (
      id, employee_id, dpo_id, valid_from, valid_to, created_at, updated_at
    )
    SELECT gen_random_uuid(), id, dpo_id, COALESCE(hire_date, DATE '2000-01-01'), NULL, NOW(), NOW()
    FROM employees
    WHERE dpo_id IS NOT NULL
  `);

  await qi.createTable('monthly_rental_acts', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    dpo_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'dpos', key: 'id' },
      onDelete: 'RESTRICT',
    },
    report_month: { type: DataTypes.DATEONLY, allowNull: false },
    snapshot: { type: DataTypes.JSONB, allowNull: false },
    generated_at: { type: DataTypes.DATE, allowNull: false },
    generated_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('monthly_rental_acts', ['dpo_id', 'report_month'], {
    unique: true,
    name: 'uq_monthly_rental_acts_dpo_month',
  });
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('monthly_rental_acts');
  await qi.dropTable('employee_dpo_assignments');
}

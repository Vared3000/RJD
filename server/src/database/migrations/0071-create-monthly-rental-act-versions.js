import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.addColumn('monthly_rental_acts', 'current_version_number', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  });

  await qi.createTable('monthly_rental_act_versions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    act_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'monthly_rental_acts', key: 'id' },
      onDelete: 'CASCADE',
    },
    version_number: { type: DataTypes.INTEGER, allowNull: false },
    snapshot: { type: DataTypes.JSONB, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'print_form_templates', key: 'id' },
      onDelete: 'RESTRICT',
    },
    excel_file_name: { type: DataTypes.STRING(255), allowNull: true },
    excel_file_data: { type: DataTypes.BLOB, allowNull: true },
    excel_checksum: { type: DataTypes.STRING(64), allowNull: true },
    pdf_file_name: { type: DataTypes.STRING(255), allowNull: true },
    pdf_file_data: { type: DataTypes.BLOB, allowNull: true },
    pdf_checksum: { type: DataTypes.STRING(64), allowNull: true },
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

  await qi.addIndex('monthly_rental_act_versions', ['act_id', 'version_number'], {
    unique: true,
    name: 'uq_monthly_rental_act_versions_number',
  });

  await sequelize.query(`
    INSERT INTO monthly_rental_act_versions (
      id, act_id, version_number, snapshot, generated_at, generated_by_user_id,
      created_at, updated_at
    )
    SELECT gen_random_uuid(), id, 1, snapshot, generated_at, generated_by_user_id,
           created_at, updated_at
    FROM monthly_rental_acts
  `);
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('monthly_rental_act_versions');
  await qi.removeColumn('monthly_rental_acts', 'current_version_number');
}

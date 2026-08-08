import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.createTable('archive_print_forms', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    dpo_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'dpos', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    document_type: { type: DataTypes.STRING(32), allowNull: false },
    document_id: { type: DataTypes.UUID, allowNull: false },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    line_number: { type: DataTypes.INTEGER, allowNull: false },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'nomenclature_models', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    height_size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    employee_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    document_date: { type: DataTypes.DATEONLY, allowNull: false },
    posted_at: { type: DataTypes.DATE, allowNull: true },
    source_table: { type: DataTypes.STRING(32), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('archive_print_forms', ['dpo_id'], {
    name: 'idx_archive_print_forms_dpo',
  });
  await queryInterface.addIndex('archive_print_forms', ['employee_id'], {
    name: 'idx_archive_print_forms_employee',
  });
  await queryInterface.addIndex('archive_print_forms', ['document_type', 'document_id'], {
    name: 'idx_archive_print_forms_document',
  });
  await queryInterface.addIndex('archive_print_forms', ['instance_id'], {
    name: 'idx_archive_print_forms_instance',
  });
  await queryInterface.addIndex('archive_print_forms', ['document_date'], {
    name: 'idx_archive_print_forms_date',
  });

  // Материализованное представление для быстрых агрегаций
  await sequelize.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS archive_print_summary AS
    SELECT
      dpo_id,
      employee_id,
      COUNT(*) as "totalItems",
      SUM(quantity) as "totalQuantity",
      COALESCE(SUM(cost), 0) as "totalCost",
      COALESCE(SUM(employee_cost), 0) as "totalEmployeeCost"
    FROM archive_print_forms
    WHERE source_table = 'archive'
    GROUP BY dpo_id, employee_id
  `);

  await queryInterface.addIndex('archive_print_summary', ['dpo_id'], {
    name: 'idx_archive_print_summary_dpo',
  });
  await queryInterface.addIndex('archive_print_summary', ['employee_id'], {
    name: 'idx_archive_print_summary_employee',
  });
}

export async function down({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.removeIndex('archive_print_forms', 'idx_archive_print_forms_dpo');
  await queryInterface.removeIndex('archive_print_forms', 'idx_archive_print_forms_employee');
  await queryInterface.removeIndex('archive_print_forms', 'idx_archive_print_forms_document');
  await queryInterface.removeIndex('archive_print_forms', 'idx_archive_print_forms_instance');
  await queryInterface.removeIndex('archive_print_forms', 'idx_archive_print_forms_date');

  await queryInterface.dropTable('archive_print_forms');

  await sequelize.query(`DROP MATERIALIZED VIEW IF EXISTS archive_print_summary`);
}

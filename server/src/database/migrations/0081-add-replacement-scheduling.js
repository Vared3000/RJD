import { DataTypes } from 'sequelize';

// Плановая замена фиксируется в момент фактической выдачи экземпляра. Так
// последующее изменение норматива комплекта не переписывает историю уже
// выданной одежды, а уникальная ссылка на движение не даёт создать дубль.
export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.addColumn('stock_movements', 'service_life_years_snapshot', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await queryInterface.addColumn('stock_movements', 'planned_replacement_date', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });

  await queryInterface.addColumn('issuance_documents', 'issuance_kind', {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'standard',
  });

  await queryInterface.addColumn('issuance_tasks', 'task_type', {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'completion',
  });
  await queryInterface.addColumn('issuance_tasks', 'source_movement_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'stock_movements', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  });
  await queryInterface.addColumn('issuance_tasks', 'source_instance_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'instances', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  await queryInterface.addColumn('issuance_tasks', 'issued_at', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
  await queryInterface.addColumn('issuance_tasks', 'service_life_years_snapshot', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await queryInterface.addColumn('issuance_tasks', 'planned_replacement_date', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
  await queryInterface.addColumn('issuance_tasks', 'notification_date', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
  await queryInterface.addColumn('issuance_tasks', 'cancelled_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await queryInterface.addColumn('issuance_tasks', 'cancel_reason', {
    type: DataTypes.STRING(500),
    allowNull: true,
  });
  await queryInterface.addColumn('issuance_tasks', 'cancelled_by_return_document_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'return_documents', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });

  await queryInterface.addIndex('issuance_tasks', ['source_movement_id'], {
    name: 'uq_issuance_tasks_source_movement',
    unique: true,
  });
  await queryInterface.addIndex('issuance_tasks', ['task_type', 'status', 'notification_date'], {
    name: 'issuance_tasks_schedule_idx',
  });
  await queryInterface.addIndex('issuance_tasks', ['source_instance_id'], {
    name: 'issuance_tasks_source_instance_idx',
  });
}

export async function down({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.removeIndex('issuance_tasks', 'issuance_tasks_source_instance_idx');
  await queryInterface.removeIndex('issuance_tasks', 'issuance_tasks_schedule_idx');
  await queryInterface.removeIndex('issuance_tasks', 'uq_issuance_tasks_source_movement');
  await queryInterface.removeColumn('issuance_tasks', 'cancelled_by_return_document_id');
  await queryInterface.removeColumn('issuance_tasks', 'cancel_reason');
  await queryInterface.removeColumn('issuance_tasks', 'cancelled_at');
  await queryInterface.removeColumn('issuance_tasks', 'notification_date');
  await queryInterface.removeColumn('issuance_tasks', 'planned_replacement_date');
  await queryInterface.removeColumn('issuance_tasks', 'service_life_years_snapshot');
  await queryInterface.removeColumn('issuance_tasks', 'issued_at');
  await queryInterface.removeColumn('issuance_tasks', 'source_instance_id');
  await queryInterface.removeColumn('issuance_tasks', 'source_movement_id');
  await queryInterface.removeColumn('issuance_tasks', 'task_type');
  await queryInterface.removeColumn('issuance_documents', 'issuance_kind');
  await queryInterface.removeColumn('stock_movements', 'planned_replacement_date');
  await queryInterface.removeColumn('stock_movements', 'service_life_years_snapshot');
}

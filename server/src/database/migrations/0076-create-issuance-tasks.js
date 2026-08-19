import { DataTypes } from 'sequelize';

// Задача на дособор (см. HANDOFF.md): "Отдать в сборку" при нехватке остатка
// теперь не блокирует всё проведение — доступное количество выдаётся сразу,
// а недостача по конкретной строке фиксируется здесь. Кладовщик закрывает
// задачу вручную на странице "Задачи", когда остаток появится на складе —
// система сама создаёт и проводит довыдающий документ (fulfilling_document_id).
export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable('issuance_tasks', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    source_document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'issuance_documents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    fulfilling_document_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'issuance_documents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    warehouse_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'warehouses', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'nomenclature_models', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    height_size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    completed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('issuance_tasks', ['status', 'created_at'], {
    name: 'issuance_tasks_status_idx',
  });
  await queryInterface.addIndex('issuance_tasks', ['employee_id'], {
    name: 'issuance_tasks_employee_idx',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('issuance_tasks');
}

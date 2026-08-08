import { DataTypes } from 'sequelize';

// Тип строки определяет, какие остальные поля значимы (проверяется в
// adjustment.validation.js через discriminatedUnion, БД сама только хранит):
// - surplus (лишний физический экземпляр): instance_id пуст до проведения
//   (заполняется id вновь созданного экземпляра), заполнены model_id/size_id/
//   height_size_id/cost и to_warehouse_id (куда оприходовать).
// - shortage (числится, но не найден): instance_id обязателен, to_warehouse_id
//   и модельные поля не используются.
// - relocate (найден на другом складе): instance_id + to_warehouse_id
//   (фактический склад).
// - condition (ошибочно указано состояние): instance_id + to_condition.
// reason — основание корректировки, обязательно для всех типов (см. правило
// "дефицит не превращается в обычное списание без основания" в плане).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('stock_adjustment_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'stock_adjustments', key: 'id' },
      onDelete: 'CASCADE',
    },
    adjustment_type: { type: DataTypes.STRING(16), allowNull: false },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    model_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'nomenclature_models', key: 'id' },
      onDelete: 'RESTRICT',
    },
    size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    },
    height_size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    },
    cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    to_warehouse_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    to_condition: { type: DataTypes.STRING(32), allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
    inventory_document_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'inventory_documents', key: 'id' },
      onDelete: 'SET NULL',
    },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('stock_adjustment_lines', ['document_id']);
  await qi.addIndex('stock_adjustment_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'stock_adjustment_lines_document_id_instance_id_unique',
  });
  await qi.addIndex('stock_adjustment_lines', ['inventory_document_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('stock_adjustment_lines');
}

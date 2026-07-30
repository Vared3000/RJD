import { DataTypes } from 'sequelize';

// Отличие от laundry_lines: cost — стоимость ремонта (расход), заполняется
// при завершении вместе с condition_after (см. server/src/modules/repair/).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('repair_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'repair_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    condition_before: { type: DataTypes.STRING(32), allowNull: true },
    condition_after: { type: DataTypes.STRING(32), allowNull: true },
    cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('repair_lines', ['document_id']);
  await qi.addIndex('repair_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'repair_lines_document_id_instance_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('repair_lines');
}

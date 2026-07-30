import { DataTypes } from 'sequelize';

// Строки создаются автоматически снимком остатков склада на момент
// создания документа (см. inventory.service.js) — confirmed выставляется
// пользователем по факту физического пересчёта, false до тех пор.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('inventory_lines', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('inventory_lines', ['document_id']);
  await qi.addIndex('inventory_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'inventory_lines_document_id_instance_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('inventory_lines');
}

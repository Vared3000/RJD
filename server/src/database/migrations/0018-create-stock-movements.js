import { DataTypes } from 'sequelize';

// document_id — намеренно без FK: тип документа (receiving/issuance/transfer/...)
// определяет, в какой таблице искать документ (полиморфная ссылка).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('stock_movements', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onDelete: 'RESTRICT',
    },
    from_warehouse_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    to_warehouse_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    },
    document_type: { type: DataTypes.STRING(32), allowNull: false },
    document_id: { type: DataTypes.UUID, allowNull: false },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('stock_movements', ['instance_id']);
  await qi.addIndex('stock_movements', ['document_type', 'document_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('stock_movements');
}

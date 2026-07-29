import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('batches', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(64), allowNull: false },
    supplier_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'suppliers', key: 'id' },
      onDelete: 'RESTRICT',
    },
    received_date: { type: DataTypes.DATEONLY, allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('batches');
}

import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('startup_import_runs', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    file_name: { type: DataTypes.STRING(255), allowNull: false },
    file_checksum: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'previewed' },
    summary: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    protocol: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    applied_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    applied_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('startup_import_runs', ['file_checksum'], {
    name: 'idx_startup_import_runs_checksum',
  });
  await qi.addConstraint('startup_import_runs', {
    fields: ['status'],
    type: 'check',
    where: { status: ['previewed', 'applied'] },
    name: 'chk_startup_import_runs_status',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('startup_import_runs');
}

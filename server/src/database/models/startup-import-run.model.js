import { DataTypes } from 'sequelize';

export function defineStartupImportRun(sequelize) {
  return sequelize.define(
    'StartupImportRun',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fileName: { type: DataTypes.STRING(255), allowNull: false, field: 'file_name' },
      fileChecksum: { type: DataTypes.STRING(64), allowNull: false, field: 'file_checksum' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'previewed' },
      summary: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      protocol: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      createdByUserId: { type: DataTypes.UUID, allowNull: false, field: 'created_by_user_id' },
      appliedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'applied_by_user_id' },
      appliedAt: { type: DataTypes.DATE, allowNull: true, field: 'applied_at' },
    },
    { tableName: 'startup_import_runs' },
  );
}

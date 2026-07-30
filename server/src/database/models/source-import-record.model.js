import { DataTypes } from 'sequelize';

export function defineSourceImportRecord(sequelize) {
  return sequelize.define(
    'SourceImportRecord',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      sourceKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'source_key',
      },
      sourceFile: { type: DataTypes.TEXT, allowNull: false, field: 'source_file' },
      fileHash: { type: DataTypes.STRING(64), allowNull: false, field: 'file_hash' },
      recordType: { type: DataTypes.STRING(32), allowNull: false, field: 'record_type' },
      sheetName: { type: DataTypes.STRING(255), allowNull: true, field: 'sheet_name' },
      pageNumber: { type: DataTypes.INTEGER, allowNull: true, field: 'page_number' },
      rowNumber: { type: DataTypes.INTEGER, allowNull: true, field: 'row_number' },
      payload: { type: DataTypes.JSONB, allowNull: false },
    },
    { tableName: 'source_import_records' },
  );
}

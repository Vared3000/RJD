import { DataTypes } from 'sequelize';

export function defineMonthlyRentalActVersion(sequelize) {
  return sequelize.define(
    'MonthlyRentalActVersion',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      actId: { type: DataTypes.UUID, allowNull: false, field: 'act_id' },
      versionNumber: { type: DataTypes.INTEGER, allowNull: false, field: 'version_number' },
      snapshot: { type: DataTypes.JSONB, allowNull: false },
      reason: { type: DataTypes.STRING(500), allowNull: true },
      templateId: { type: DataTypes.UUID, allowNull: true, field: 'template_id' },
      excelFileName: { type: DataTypes.STRING(255), allowNull: true, field: 'excel_file_name' },
      excelFileData: { type: DataTypes.BLOB, allowNull: true, field: 'excel_file_data' },
      excelChecksum: { type: DataTypes.STRING(64), allowNull: true, field: 'excel_checksum' },
      pdfFileName: { type: DataTypes.STRING(255), allowNull: true, field: 'pdf_file_name' },
      pdfFileData: { type: DataTypes.BLOB, allowNull: true, field: 'pdf_file_data' },
      pdfChecksum: { type: DataTypes.STRING(64), allowNull: true, field: 'pdf_checksum' },
      generatedAt: { type: DataTypes.DATE, allowNull: false, field: 'generated_at' },
      generatedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'generated_by_user_id',
      },
    },
    { tableName: 'monthly_rental_act_versions' },
  );
}

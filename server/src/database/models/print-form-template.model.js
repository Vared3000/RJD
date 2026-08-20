import { DataTypes } from 'sequelize';

// Формы, переведённые на маркерную разметку и доступные в конструкторе.
export const PRINT_FORM_TEMPLATE_TYPES = [
  'fpu-26',
  'appendix-1-5',
  'appendix-1-7',
  'personal-card',
  'preservation-receipt',
];

export function definePrintFormTemplate(sequelize) {
  return sequelize.define(
    'PrintFormTemplate',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      formType: { type: DataTypes.STRING(32), allowNull: false, field: 'form_type' },
      versionNumber: { type: DataTypes.INTEGER, allowNull: false, field: 'version_number' },
      originalFileName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'original_file_name',
      },
      fileData: { type: DataTypes.BLOB, allowNull: false, field: 'file_data' },
      checksum: { type: DataTypes.STRING(64), allowNull: false },
      fileSize: { type: DataTypes.INTEGER, allowNull: false, field: 'file_size' },
      uploadedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'uploaded_by_user_id' },
      // Отсутствие отдельного `isActive` — осознанно: единственный источник
      // истины про текущую активную версию формы — самая свежая
      // `activatedAt` внутри `formType` (см. findActive в репозитории), по
      // аналогии с print_form_parties.effectiveDate. Активация/откат — один
      // UPDATE одной строки, не два запроса, которые может рассинхронизировать
      // сбой между ними.
      activatedAt: { type: DataTypes.DATE, allowNull: true, field: 'activated_at' },
      validationResult: { type: DataTypes.JSONB, allowNull: false, field: 'validation_result' },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'print_form_templates' },
  );
}

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const COMMENT = 'Точный макет сохранной расписки по файлу заказчика';

function templatePath() {
  return fileURLToPath(
    new URL(
      '../../modules/print-forms/preservation-receipt/preservation-receipt.template.xlsx',
      import.meta.url,
    ),
  );
}

export async function up({ context: sequelize }) {
  const fileData = await readFile(templatePath());
  const [versionRows] = await sequelize.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM print_form_templates
      WHERE form_type = 'preservation-receipt'`,
  );
  const versionNumber = Number(versionRows[0].next_version);

  await sequelize.query(
    `INSERT INTO print_form_templates (
       id, form_type, version_number, original_file_name, file_data, checksum,
       file_size, activated_at, validation_result, comment, created_at, updated_at
     ) VALUES (
       :id, 'preservation-receipt', :versionNumber, :originalFileName, :fileData, :checksum,
       :fileSize, NOW(), :validationResult::jsonb, :comment, NOW(), NOW()
     )`,
    {
      replacements: {
        id: crypto.randomUUID(),
        versionNumber,
        originalFileName: 'Сохранка 01.01.22г  2ой комплект.xlsx',
        fileData,
        checksum: crypto.createHash('sha256').update(fileData).digest('hex'),
        fileSize: fileData.length,
        validationResult: JSON.stringify({ valid: true, errors: [] }),
        comment: COMMENT,
      },
    },
  );
}

export async function down({ context: sequelize }) {
  await sequelize.query(
    `DELETE FROM print_form_templates
      WHERE form_type = 'preservation-receipt'
        AND comment = :comment`,
    { replacements: { comment: COMMENT } },
  );
}

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CONSTRAINT = 'chk_print_form_templates_form_type';

function templatePath() {
  return fileURLToPath(
    new URL(
      '../../modules/print-forms/preservation-receipt/preservation-receipt.template.xlsx',
      import.meta.url,
    ),
  );
}

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeConstraint('print_form_templates', CONSTRAINT);
  await qi.addConstraint('print_form_templates', {
    fields: ['form_type'],
    type: 'check',
    where: { form_type: ['fpu-26', 'preservation-receipt'] },
    name: CONSTRAINT,
  });

  const fileData = await readFile(templatePath());
  await sequelize.query(
    `INSERT INTO print_form_templates (
       id, form_type, version_number, original_file_name, file_data, checksum,
       file_size, activated_at, validation_result, comment, created_at, updated_at
     ) VALUES (
       :id, 'preservation-receipt', 1, 'preservation-receipt.xlsx', :fileData, :checksum,
       :fileSize, NOW(), :validationResult::jsonb,
       'Начальная версия по образцам заказчика', NOW(), NOW()
     )`,
    {
      replacements: {
        id: crypto.randomUUID(),
        fileData,
        checksum: crypto.createHash('sha256').update(fileData).digest('hex'),
        fileSize: fileData.length,
        validationResult: JSON.stringify({ valid: true, errors: [] }),
      },
    },
  );
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await sequelize.query(
    `DELETE FROM print_form_templates WHERE form_type = 'preservation-receipt'`,
  );
  await qi.removeConstraint('print_form_templates', CONSTRAINT);
  await qi.addConstraint('print_form_templates', {
    fields: ['form_type'],
    type: 'check',
    where: { form_type: ['fpu-26'] },
    name: CONSTRAINT,
  });
}

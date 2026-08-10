import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DataTypes, QueryTypes } from 'sequelize';
import ExcelJS from 'exceljs';

// Разметка маркерами {{ИМЯ}} тех ячеек бандл-шаблона, которые сейчас пишет
// server/src/modules/print-forms/fpu-26/fpu-26.excel-mapper.js — миграция
// превращает существующий жёстко-адресный шаблон в версию 1 маркерного
// формата (задача 19), не меняя визуальный результат генерации.
const HEADER_MARKERS = {
  B7: 'CUSTOMER_NAME',
  A9: 'DPO_NAME',
  B11: 'EXECUTOR_NAME',
  A13: 'EXECUTOR_ADDRESS',
  L6: 'CUSTOMER_OKPO',
  L8: 'BUSINESS_UNIT_CODE',
  L10: 'EXECUTOR_OKPO',
  H16: 'PERIOD_END',
  A19: 'CONTRACT_LINE',
  A24: 'EXECUTOR_SIGNATORY',
  C26: 'EXECUTOR_BASIS',
  C28: 'DPO_HEAD_TITLE',
  A29: 'DPO_DIRECTOR_NAME',
  C31: 'DPO_DIRECTOR_BASIS',
  A38: 'PERIOD_DESCRIPTION',
  I43: 'GRAND_TOTAL_COST',
  K43: 'GRAND_TOTAL_VAT',
  L43: 'GRAND_TOTAL',
  I45: 'GRAND_TOTAL_COST_REPEAT',
  K45: 'GRAND_TOTAL_VAT_REPEAT',
  L45: 'GRAND_TOTAL_REPEAT',
  B68: 'SIGNATURE_CONTRACT_LINE',
  F75: 'DPO_HEAD_SIGNATURE_LABEL',
  K77: 'DPO_DIRECTOR_SIGNATURE',
};

const ROW_MARKERS = {
  A42: 'ROW.MODEL_NAME',
  E42: 'ROW.UNIT',
  F42: 'ROW.QUANTITY',
  G42: 'ROW.PRICE_WITHOUT_VAT',
  H42: 'ROW.DISPLAYED_PRICE_WITHOUT_VAT',
  I42: 'ROW.COST_WITHOUT_VAT',
  K42: 'ROW.VAT_AMOUNT',
  L42: 'ROW.TOTAL_WITH_VAT',
};

const STRUCTURAL_MARKERS = {
  M42: 'TABLE_START',
  M43: 'TABLE_END',
};

const STATIC_TEXT = {
  L12: '-',
  A34: 'составили настоящий акт о том, что работы (услуги), выполненные ИСПОЛНИТЕЛЕМ по обеспечению форменной одеждой',
  A35: 'работников структурных подразделений ЦДПО - филиала ОАО "РЖД"',
};

function ensureRowMerge(sheet, row, left, right) {
  const alreadyMerged = Object.values(sheet._merges ?? {}).some(
    (merge) =>
      merge.model.top === row &&
      merge.model.bottom === row &&
      merge.model.left === left &&
      merge.model.right === right,
  );
  if (!alreadyMerged) sheet.mergeCells(row, left, row, right);
}

// НЕ удалять бандл-файл server/src/modules/print-forms/fpu-26/fpu-26.template.xlsx
// после применения этой миграции — она читает его с диска при каждом прогоне
// на чистой БД (в т.ч. в изолированных тестах и на новых окружениях).
async function buildMarkedTemplateBuffer() {
  const templatePath = fileURLToPath(
    new URL('../../modules/print-forms/fpu-26/fpu-26.template.xlsx', import.meta.url),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.worksheets[0];

  for (const [address, text] of Object.entries(STATIC_TEXT)) {
    sheet.getCell(address).value = text;
  }
  for (const [address, marker] of Object.entries({
    ...HEADER_MARKERS,
    ...ROW_MARKERS,
    ...STRUCTURAL_MARKERS,
  })) {
    sheet.getCell(address).value = `{{${marker}}}`;
  }
  ensureRowMerge(sheet, 42, 1, 4);
  ensureRowMerge(sheet, 42, 9, 10);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('print_form_templates', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    form_type: { type: DataTypes.STRING(32), allowNull: false },
    version_number: { type: DataTypes.INTEGER, allowNull: false },
    original_file_name: { type: DataTypes.STRING(255), allowNull: false },
    file_data: { type: DataTypes.BLOB, allowNull: false },
    checksum: { type: DataTypes.STRING(64), allowNull: false },
    file_size: { type: DataTypes.INTEGER, allowNull: false },
    uploaded_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    activated_at: { type: DataTypes.DATE, allowNull: true },
    validation_result: { type: DataTypes.JSONB, allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addConstraint('print_form_templates', {
    fields: ['form_type'],
    type: 'check',
    where: { form_type: ['fpu-26'] },
    name: 'chk_print_form_templates_form_type',
  });
  await qi.addIndex('print_form_templates', ['form_type', 'version_number'], {
    unique: true,
    name: 'uq_print_form_templates_form_type_version',
  });
  await qi.addIndex('print_form_templates', ['form_type', 'activated_at'], {
    name: 'idx_print_form_templates_form_type_activated_at',
  });

  const buffer = await buildMarkedTemplateBuffer();
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  await sequelize.query(
    `INSERT INTO print_form_templates (
       id, form_type, version_number, original_file_name, file_data, checksum,
       file_size, activated_at, validation_result, comment, created_at, updated_at
     ) VALUES (
       :id, 'fpu-26', 1, 'fpu-26.xlsx', :fileData, :checksum,
       :fileSize, NOW(), :validationResult::jsonb, 'Начальная версия из миграции 0066', NOW(), NOW()
     )`,
    {
      replacements: {
        id: crypto.randomUUID(),
        fileData: buffer,
        checksum,
        fileSize: buffer.length,
        validationResult: JSON.stringify({ valid: true, errors: [] }),
      },
      type: QueryTypes.INSERT,
    },
  );
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('print_form_templates');
}

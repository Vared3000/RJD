import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const CONSTRAINT = 'chk_print_form_templates_form_type';
const NEW_FORM_TYPES = ['appendix-1-5', 'appendix-1-7', 'personal-card'];
const ALL_FORM_TYPES = ['fpu-26', 'preservation-receipt', ...NEW_FORM_TYPES];

const DEFINITIONS = {
  'appendix-1-5': {
    fileName: 'appendix-1-5.xlsx',
    templateUrl: new URL(
      '../../modules/print-forms/appendix-1-5/appendix-1-5.template.xlsx',
      import.meta.url,
    ),
    staticText: { B1: 'АКТ' },
    markers: {
      A2: 'ACT_TITLE',
      F3: 'ACT_DATE',
      A4: 'ACT_NARRATIVE',
      A7: 'ROW.SEQUENCE_NUMBER',
      B7: 'ROW.POSITION_NAME',
      C7: 'ROW.MODEL_NAME',
      D7: 'ROW.UNIT',
      E7: 'ROW.QUANTITY',
      F7: 'ROW.COVERAGE_DAYS',
      G7: 'ROW.PRICE_WITHOUT_VAT',
      H7: 'ROW.COST_WITHOUT_VAT',
      I7: 'ROW.TOTAL_WITHOUT_VAT',
      J7: 'ROW.VAT_AMOUNT',
      K7: 'ROW.TOTAL_WITH_VAT',
      L7: 'TABLE_START',
      J8: 'TOTAL_VAT',
      K8: 'TOTAL_WITH_VAT',
      L8: 'TABLE_END',
      B10: 'AMOUNT_IN_WORDS',
      B14: 'CUSTOMER_SIGNATURE',
    },
  },
  'appendix-1-7': {
    fileName: 'appendix-1-7.xlsx',
    templateUrl: new URL(
      '../../modules/print-forms/appendix-1-7/appendix-1-7.template.xlsx',
      import.meta.url,
    ),
    staticText: {
      B1: 'АКТ\nприема-передачи форменной одежды\n',
      A2: 'г. Санкт-Петербург',
    },
    markers: {
      F2: 'ACT_DATE',
      A4: 'ACT_NARRATIVE',
      A8: 'ROW.SEQUENCE_NUMBER',
      B8: 'ROW.EMPLOYEE_NAME',
      C8: 'ROW.PERSONNEL_NUMBER',
      D8: 'ROW.MODEL_NAME',
      E8: 'ROW.INVENTORY_NUMBER',
      F8: 'ROW.UNIT',
      G8: 'ROW.QUANTITY',
      H8: 'ROW.PRICE_WITHOUT_VAT',
      I8: 'ROW.COST_WITHOUT_VAT',
      J8: 'ROW.VAT_AMOUNT',
      K8: 'ROW.TOTAL_WITH_VAT',
      L8: 'TABLE_START',
      J9: 'TOTAL_VAT',
      K9: 'TOTAL_WITH_VAT',
      L9: 'TABLE_END',
      B14: 'DPO_HEAD_TITLE',
      B17: 'DPO_DIRECTOR_SIGNATURE',
    },
  },
  'personal-card': {
    fileName: 'personal-card.xlsx',
    templateUrl: new URL(
      '../../modules/print-forms/personal-card/personal-card.template.xlsx',
      import.meta.url,
    ),
    staticText: { K7: 'приём/заявка', K8: 'увольнение' },
    markers: {
      A3: 'OPENED_DATE',
      A4: 'DPO_LINE',
      A5: 'EXECUTOR_LINE',
      A6: 'EMPLOYEE_LINE',
      A7: 'CLOTHING_SIZE_LINE',
      E7: 'GLOVES_SIZE_LINE',
      L7: 'HIRE_DATE',
      A8: 'HEADWEAR_SIZE_LINE',
      E8: 'BELT_SIZE_LINE',
      L8: 'TERMINATION_DATE',
      A13: 'ROW.SEQUENCE_NUMBER',
      B13: 'ROW.MODEL_NAME',
      C13: 'ROW.UNIT',
      D13: 'ROW.QUANTITY',
      E13: 'ROW.NORM_QUANTITY',
      F13: 'ROW.SERVICE_LIFE_YEARS',
      G13: 'ROW.ISSUED_QUANTITY',
      H13: 'ROW.ISSUED_DATE',
      J13: 'ROW.RETURNED_QUANTITY',
      K13: 'ROW.RETURNED_DATE',
      M13: 'TABLE_START',
      M25: 'TABLE_END',
    },
  },
};

async function markedTemplateBuffer(definition) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileURLToPath(definition.templateUrl));
  const sheet = workbook.worksheets[0];
  for (const [address, value] of Object.entries(definition.staticText)) {
    sheet.getCell(address).value = value;
  }
  for (const [address, marker] of Object.entries(definition.markers)) {
    sheet.getCell(address).value = `{{${marker}}}`;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeConstraint('print_form_templates', CONSTRAINT);
  await qi.addConstraint('print_form_templates', {
    fields: ['form_type'],
    type: 'check',
    where: { form_type: ALL_FORM_TYPES },
    name: CONSTRAINT,
  });

  for (const formType of NEW_FORM_TYPES) {
    const definition = DEFINITIONS[formType];
    const fileData = await markedTemplateBuffer(definition);
    await sequelize.query(
      `INSERT INTO print_form_templates (
         id, form_type, version_number, original_file_name, file_data, checksum,
         file_size, activated_at, validation_result, comment, created_at, updated_at
       ) VALUES (
         :id, :formType, 1, :fileName, :fileData, :checksum,
         :fileSize, NOW(), :validationResult::jsonb, :comment, NOW(), NOW()
       )`,
      {
        replacements: {
          id: crypto.randomUUID(),
          formType,
          fileName: definition.fileName,
          fileData,
          checksum: crypto.createHash('sha256').update(fileData).digest('hex'),
          fileSize: fileData.length,
          validationResult: JSON.stringify({ valid: true, errors: [] }),
          comment: 'Начальная маркерная версия из миграции 0079',
        },
      },
    );
  }
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await sequelize.query(`DELETE FROM print_form_templates WHERE form_type IN (:formTypes)`, {
    replacements: { formTypes: NEW_FORM_TYPES },
  });
  await qi.removeConstraint('print_form_templates', CONSTRAINT);
  await qi.addConstraint('print_form_templates', {
    fields: ['form_type'],
    type: 'check',
    where: { form_type: ['fpu-26', 'preservation-receipt'] },
    name: CONSTRAINT,
  });
}

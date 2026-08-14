import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { ApiError } from '../../../utils/api-error.js';
import { sequelize } from '../../../database/models/index.js';
import { printFormTemplatesRepository } from './print-form-templates.repository.js';
import { inspectUploadSafety, findOverlappingMerges } from '../shared/template-safety.js';
import { scanTemplateStructure, validateMarkers } from '../shared/template-markers.js';
import { mergeModels } from '../shared/excel-merge-utils.js';
import { generateExcelFromMarkedTemplate } from '../shared/excel-template-engine.js';
import { generatePdfFromExcel } from '../shared/excel-to-pdf.js';
import { loadContext } from '../shared/load-context.js';
import { buildFpu26 } from '../fpu-26/fpu-26.builder.js';
import { fpu26ExcelMapper } from '../fpu-26/fpu-26.excel-mapper.js';
import { buildPreservationReceipt } from '../preservation-receipt/preservation-receipt.builder.js';
import { preservationReceiptExcelMapper } from '../preservation-receipt/preservation-receipt.excel-mapper.js';
import {
  buildTemplateFromLayout,
  createBlankTemplateBuffer,
  readTemplateLayout,
} from './template-layout.js';

// Формы, уже переведённые на маркерную разметку (задача 19) — каждая знает,
// как построить пробные данные (loadContext/build) и как разложить их по
// шаблону (mapper.spec/mapper.fill). Остальные формы переносятся отдельным
// следующим релизом.
const GENERATORS = {
  'fpu-26': {
    loadContext,
    build: buildFpu26,
    mapper: fpu26ExcelMapper,
    blankLayout: { rowCount: 65, columnCount: 14 },
  },
  'preservation-receipt': {
    loadContext,
    build: buildPreservationReceipt,
    mapper: preservationReceiptExcelMapper,
    blankLayout: { rowCount: 45, columnCount: 8 },
  },
};

function generatorFor(formType) {
  const generator = GENERATORS[formType];
  if (!generator) {
    throw ApiError.badRequest(`Форма «${formType}» ещё не поддерживает конструктор макетов`);
  }
  return generator;
}

async function buildTrialData(formType, query) {
  const generator = generatorFor(formType);
  const context = await generator.loadContext(query);
  const data = await generator.build(context);
  data.form = formType;
  data.parties = context.parties;
  data.generatedAt = new Date().toISOString();
  data.dataSources = [
    ...new Set((data.rows ?? []).map((row) => row.dataSourceLabel).filter(Boolean)),
  ];
  return data;
}

function generatorOptions(generator, templateBuffer) {
  return {
    templateBuffer,
    spec: generator.mapper.spec,
    fill: generator.mapper.fill,
    singleWorksheet: generator.mapper.singleWorksheet,
    preserveTemplateView: generator.mapper.preserveTemplateView,
    visibleGeneratedFooter: generator.mapper.visibleGeneratedFooter,
  };
}

function allowedMarkers(generator) {
  return [
    'TABLE_START',
    'TABLE_END',
    ...generator.mapper.spec.header,
    ...generator.mapper.spec.row.map((name) => `ROW.${name}`),
  ];
}

// Пробная генерация вместо синтетических фикстур (см. план задачи 19):
// шаблон валиден, если (1) безопасен как архив, (2) маркеры находятся,
// известны и не дублируются, (3) объединения ячеек не пересекаются, и
// (4) на реальных данных из запроса реально строится Excel и PDF.
async function validateBuffer(formType, buffer, query) {
  const errors = [];

  const safety = inspectUploadSafety(buffer);
  errors.push(...safety.errors);
  if (!safety.safe) return { valid: false, errors, warnings: [] };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { valid: false, errors: ['Файл повреждён или не является .xlsx'], warnings: [] };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { valid: false, errors: ['В файле нет ни одного листа'], warnings: [] };

  if (findOverlappingMerges(mergeModels(sheet))) {
    errors.push('Обнаружены пересекающиеся объединения ячеек');
  }

  const generator = generatorFor(formType);
  let structure = null;
  try {
    structure = scanTemplateStructure(sheet);
  } catch (error) {
    errors.push(error.message);
  }
  if (structure) {
    errors.push(...validateMarkers(structure, generator.mapper.spec).errors);
  }

  if (errors.length > 0) return { valid: false, errors, warnings: [] };

  try {
    const data = await buildTrialData(formType, query);
    const excelBuffer = await generateExcelFromMarkedTemplate(
      data,
      generatorOptions(generator, buffer),
    );
    await generatePdfFromExcel(excelBuffer, data);
  } catch (error) {
    errors.push(`Пробная генерация не удалась: ${error.message}`);
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

async function blankBuffer(formType) {
  return createBlankTemplateBuffer(generatorFor(formType).blankLayout);
}

async function previewLayoutBuffer(formType, templateBuffer, { format, dpoId, from, to }, label) {
  const generator = generatorFor(formType);
  try {
    const data = await buildTrialData(formType, { dpoId, from, to });
    data.templateVersion = label;
    const excelBuffer = await generateExcelFromMarkedTemplate(
      data,
      generatorOptions(generator, templateBuffer),
    );
    if (format === 'pdf') {
      return {
        buffer: await generatePdfFromExcel(excelBuffer, data),
        contentType: 'application/pdf',
        extension: 'pdf',
      };
    }
    return {
      buffer: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest(`Предпросмотр пока недоступен: ${error.message}`);
  }
}

export const printFormTemplatesService = {
  listVersions(formType) {
    generatorFor(formType);
    return printFormTemplatesRepository.listByFormType(formType);
  },

  async findVersionOrThrow(id) {
    const version = await printFormTemplatesRepository.findById(id);
    if (!version) throw ApiError.notFound('Версия шаблона не найдена');
    return version;
  },

  async editorLayout(id) {
    const version = await printFormTemplatesService.findVersionOrThrow(id);
    const generator = generatorFor(version.formType);
    return {
      version: {
        id: version.id,
        formType: version.formType,
        versionNumber: version.versionNumber,
        originalFileName: version.originalFileName,
      },
      layout: await readTemplateLayout(version.fileData, allowedMarkers(generator)),
    };
  },

  async newEditorLayout(formType) {
    const generator = generatorFor(formType);
    return {
      version: {
        id: null,
        formType,
        versionNumber: null,
        originalFileName: `${formType}-custom.xlsx`,
      },
      layout: await readTemplateLayout(await blankBuffer(formType), allowedMarkers(generator)),
    };
  },

  async upload(formType, { buffer, originalFileName, comment, dpoId, from, to }, { userId }) {
    generatorFor(formType);
    const validationResult = await validateBuffer(formType, buffer, { dpoId, from, to });
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    return sequelize.transaction((transaction) =>
      printFormTemplatesRepository.createVersion(
        formType,
        {
          originalFileName,
          fileData: buffer,
          checksum,
          fileSize: buffer.length,
          validationResult,
          comment: comment || null,
          uploadedByUserId: userId,
        },
        { transaction },
      ),
    );
  },

  async saveEditorLayout(id, { layout, comment, dpoId, from, to }, { userId }) {
    const baseVersion = await printFormTemplatesService.findVersionOrThrow(id);
    generatorFor(baseVersion.formType);
    const buffer = await buildTemplateFromLayout(baseVersion.fileData, layout);
    const baseName = String(baseVersion.originalFileName || 'template.xlsx').replace(
      /\.xlsx$/i,
      '',
    );
    return printFormTemplatesService.upload(
      baseVersion.formType,
      {
        buffer,
        originalFileName: `${baseName.slice(0, 220)}-visual.xlsx`,
        comment: comment || `Визуальная редакция версии ${baseVersion.versionNumber}`,
        dpoId,
        from,
        to,
      },
      { userId },
    );
  },

  async saveNewEditorLayout(formType, { layout, comment, dpoId, from, to }, { userId }) {
    generatorFor(formType);
    const buffer = await buildTemplateFromLayout(await blankBuffer(formType), layout);
    return printFormTemplatesService.upload(
      formType,
      {
        buffer,
        originalFileName: `${formType}-custom.xlsx`,
        comment: comment || 'Собственный макет создан в визуальном редакторе',
        dpoId,
        from,
        to,
      },
      { userId },
    );
  },

  async previewEditorLayout(id, { layout, format, dpoId, from, to }) {
    const baseVersion = await printFormTemplatesService.findVersionOrThrow(id);
    const templateBuffer = await buildTemplateFromLayout(baseVersion.fileData, layout);
    return previewLayoutBuffer(
      baseVersion.formType,
      templateBuffer,
      { format, dpoId, from, to },
      `${baseVersion.versionNumber} (черновик)`,
    );
  },

  async previewNewEditorLayout(formType, { layout, format, dpoId, from, to }) {
    generatorFor(formType);
    const templateBuffer = await buildTemplateFromLayout(await blankBuffer(formType), layout);
    return previewLayoutBuffer(
      formType,
      templateBuffer,
      { format, dpoId, from, to },
      'новый черновик',
    );
  },

  async preview(id, { format, dpoId, from, to }) {
    const version = await printFormTemplatesService.findVersionOrThrow(id);
    const generator = generatorFor(version.formType);
    const data = await buildTrialData(version.formType, { dpoId, from, to });
    data.templateVersion = version.versionNumber;
    const excelBuffer = await generateExcelFromMarkedTemplate(
      data,
      generatorOptions(generator, version.fileData),
    );
    if (format === 'pdf') {
      return {
        buffer: await generatePdfFromExcel(excelBuffer, data),
        contentType: 'application/pdf',
        extension: 'pdf',
      };
    }
    return {
      buffer: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  },

  async activate(id) {
    const version = await printFormTemplatesService.findVersionOrThrow(id);
    if (!version.validationResult?.valid) {
      throw ApiError.badRequest('Нельзя активировать версию с ошибками валидации');
    }
    await sequelize.transaction((transaction) =>
      printFormTemplatesRepository.activate(id, { transaction }),
    );
    return printFormTemplatesService.findVersionOrThrow(id);
  },
};

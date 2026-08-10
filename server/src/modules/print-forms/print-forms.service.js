import { ApiError } from '../../utils/api-error.js';
import { loadContext } from './shared/load-context.js';
import {
  generateExcelFromTemplate,
  generateExcelFromMarkedTemplate,
} from './shared/excel-template-engine.js';
import { generatePdfFromExcel } from './shared/excel-to-pdf.js';
import { buildFpu26 } from './fpu-26/fpu-26.builder.js';
import { fpu26ExcelMapper } from './fpu-26/fpu-26.excel-mapper.js';
import { printFormTemplatesRepository } from './templates/print-form-templates.repository.js';
import { buildAppendix15 } from './appendix-1-5/appendix-1-5.builder.js';
import { appendix15ExcelMapper } from './appendix-1-5/appendix-1-5.excel-mapper.js';
import { buildAppendix17 } from './appendix-1-7/appendix-1-7.builder.js';
import { appendix17ExcelMapper } from './appendix-1-7/appendix-1-7.excel-mapper.js';
import {
  loadPersonalCardContext,
  buildPersonalCard,
} from './personal-card/personal-card.builder.js';
import { personalCardExcelMapper } from './personal-card/personal-card.excel-mapper.js';
import { loadUpdContext, buildUpd } from './upd/upd.builder.js';
import { generateUpdPdf } from './upd/upd.pdf-mapper.js';
import { monthlyRentalService } from './monthly-rental-act/monthly-rental-act.service.js';

const BUILDERS = {
  'fpu-26': { build: buildFpu26, loadContext, excelMapper: fpu26ExcelMapper },
  'appendix-1-5': { build: buildAppendix15, loadContext, excelMapper: appendix15ExcelMapper },
  'appendix-1-7': { build: buildAppendix17, loadContext, excelMapper: appendix17ExcelMapper },
  'personal-card': {
    build: buildPersonalCard,
    loadContext: loadPersonalCardContext,
    excelMapper: personalCardExcelMapper,
  },
  upd: { build: buildUpd, loadContext: loadUpdContext, excelMapper: null },
};

// Формы, переведённые на маркерную разметку (задача 19): шаблон приходит
// буфером из активной версии в БД, а не с диска по статическому пути.
// Остальные формы продолжают работать через старый бандл-путь без изменений.
const MARKER_BASED_FORMS = new Set(['fpu-26']);

async function generateFormExcel(form, data, excelMapper) {
  if (MARKER_BASED_FORMS.has(form)) {
    const activeVersion = await printFormTemplatesRepository.findActive(form);
    if (!activeVersion)
      throw ApiError.badRequest(`Для формы «${form}» нет активной версии шаблона`);
    data.templateVersion = activeVersion.versionNumber;
    return generateExcelFromMarkedTemplate(data, {
      templateBuffer: activeVersion.fileData,
      spec: excelMapper.spec,
      fill: excelMapper.fill,
    });
  }
  return generateExcelFromTemplate(data, excelMapper);
}

function fileName(form, extension, context, data) {
  if (form === 'personal-card') {
    return `${form}_${context.employee.personnelNumber || context.employee.id}.${extension}`;
  }
  if (form === 'upd') return `${form}_${data.documentNumber}_${data.documentDate}.${extension}`;
  return `${form}_${context.fromText}_${context.toText}.${extension}`;
}

export const printFormsService = {
  async generate(form, query, requestContext = {}) {
    if (form === 'monthly-rental') {
      return monthlyRentalService.generate({ ...query, userId: requestContext.userId });
    }
    const definition = BUILDERS[form];
    if (!definition) throw ApiError.notFound('Печатная форма не найдена');
    if (form !== 'personal-card' && (!query.dpoId || !query.from || !query.to)) {
      throw ApiError.badRequest('Выберите ДПО и период');
    }
    if (form === 'upd' && query.format !== 'pdf') {
      throw ApiError.badRequest('УПД формируется только в PDF');
    }
    const context = await definition.loadContext(query);
    const data = await definition.build(context);
    data.form = form;
    data.parties = context.parties;
    data.generatedAt = new Date().toISOString();
    data.dataSources = [
      ...new Set((data.rows ?? []).map((row) => row.dataSourceLabel).filter(Boolean)),
    ];
    const extension = query.format;
    const buffer =
      form === 'upd'
        ? await generateUpdPdf(data)
        : extension === 'pdf'
          ? await generatePdfFromExcel(
              await generateFormExcel(form, data, definition.excelMapper),
              data,
            )
          : await generateFormExcel(form, data, definition.excelMapper);
    return {
      buffer,
      contentType:
        extension === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: fileName(form, extension, context, data),
    };
  },
};

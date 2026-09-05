import { success } from '../../../utils/respond.js';
import { ApiError } from '../../../utils/api-error.js';
import { printFormTemplatesService } from './print-form-templates.service.js';
import {
  uploadTemplateSchema,
  previewQuerySchema,
  saveEditorLayoutSchema,
  previewEditorLayoutSchema,
} from './print-form-templates.validation.js';
import { attachmentHeader } from '../../../utils/attachment-header.js';
import { buildExportFileName } from '../../../utils/export-file-name.js';

const FORM_TYPE_LABELS = {
  'fpu-26': 'ФПУ-26',
  'appendix-1-5': 'Приложение 1.5',
  'appendix-1-7': 'Приложение 1.7',
  'personal-card': 'Личная карточка',
  'preservation-receipt': 'Сохранная расписка',
};

function templateFileName({ title, formType, versionNumber, extension }) {
  return buildExportFileName({
    title,
    objects: [FORM_TYPE_LABELS[formType] ?? formType],
    version: versionNumber,
    extension,
  });
}

function sendFile(res, { buffer, contentType, fileName }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', attachmentHeader(fileName));
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
}

export const printFormTemplatesController = {
  async list(req, res) {
    return success(res, await printFormTemplatesService.listVersions(req.params.formType));
  },

  async upload(req, res) {
    if (!req.file) throw ApiError.badRequest('Файл шаблона не передан');
    const body = uploadTemplateSchema.parse(req.body);
    const version = await printFormTemplatesService.upload(
      req.params.formType,
      {
        buffer: req.file.buffer,
        originalFileName: req.file.originalname,
        comment: body.comment,
        dpoId: body.dpoId,
        employeeId: body.employeeId,
        from: body.from,
        to: body.to,
      },
      { userId: req.user.sub },
    );
    return success(res, version, 201);
  },

  async editorLayout(req, res) {
    return success(res, await printFormTemplatesService.editorLayout(req.params.id));
  },

  async newEditorLayout(req, res) {
    return success(res, await printFormTemplatesService.newEditorLayout(req.params.formType));
  },

  async saveEditorLayout(req, res) {
    const body = saveEditorLayoutSchema.parse(req.body);
    return success(
      res,
      await printFormTemplatesService.saveEditorLayout(req.params.id, body, {
        userId: req.user.sub,
      }),
      201,
    );
  },

  async saveNewEditorLayout(req, res) {
    const body = saveEditorLayoutSchema.parse(req.body);
    return success(
      res,
      await printFormTemplatesService.saveNewEditorLayout(req.params.formType, body, {
        userId: req.user.sub,
      }),
      201,
    );
  },

  async previewEditorLayout(req, res) {
    const body = previewEditorLayoutSchema.parse(req.body);
    const file = await printFormTemplatesService.previewEditorLayout(req.params.id, body);
    return sendFile(res, {
      ...file,
      fileName: templateFileName({
        title: 'Черновик макета',
        formType: file.formType,
        versionNumber: file.versionNumber,
        extension: file.extension,
      }),
    });
  },

  async previewNewEditorLayout(req, res) {
    const body = previewEditorLayoutSchema.parse(req.body);
    const file = await printFormTemplatesService.previewNewEditorLayout(req.params.formType, body);
    return sendFile(res, {
      ...file,
      fileName: templateFileName({
        title: 'Новый макет',
        formType: file.formType,
        extension: file.extension,
      }),
    });
  },

  async preview(req, res) {
    const query = previewQuerySchema.parse(req.query);
    const file = await printFormTemplatesService.preview(req.params.id, query);
    return sendFile(res, {
      ...file,
      fileName: templateFileName({
        title: 'Предпросмотр шаблона',
        formType: file.formType,
        versionNumber: file.versionNumber,
        extension: file.extension,
      }),
    });
  },

  async download(req, res) {
    const version = await printFormTemplatesService.findVersionOrThrow(req.params.id);
    return sendFile(res, {
      buffer: version.fileData,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: templateFileName({
        title: 'Шаблон',
        formType: version.formType,
        versionNumber: version.versionNumber,
        extension: 'xlsx',
      }),
    });
  },

  async activate(req, res) {
    return success(res, await printFormTemplatesService.activate(req.params.id));
  },
};

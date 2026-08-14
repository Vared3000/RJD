import { success } from '../../../utils/respond.js';
import { ApiError } from '../../../utils/api-error.js';
import { printFormTemplatesService } from './print-form-templates.service.js';
import {
  uploadTemplateSchema,
  previewQuerySchema,
  saveEditorLayoutSchema,
  previewEditorLayoutSchema,
} from './print-form-templates.validation.js';

function attachmentHeader(fileName) {
  const fallback = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
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

  async previewEditorLayout(req, res) {
    const body = previewEditorLayoutSchema.parse(req.body);
    const file = await printFormTemplatesService.previewEditorLayout(req.params.id, body);
    return sendFile(res, {
      ...file,
      fileName: `print-form-layout-draft.${file.extension}`,
    });
  },

  async preview(req, res) {
    const query = previewQuerySchema.parse(req.query);
    const file = await printFormTemplatesService.preview(req.params.id, query);
    return sendFile(res, {
      ...file,
      fileName: `print-form-template-preview.${file.extension}`,
    });
  },

  async download(req, res) {
    const version = await printFormTemplatesService.findVersionOrThrow(req.params.id);
    return sendFile(res, {
      buffer: version.fileData,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: version.originalFileName,
    });
  },

  async activate(req, res) {
    return success(res, await printFormTemplatesService.activate(req.params.id));
  },
};

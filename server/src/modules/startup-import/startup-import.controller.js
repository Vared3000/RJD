import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../../utils/api-error.js';
import { success } from '../../utils/respond.js';
import { startupImportService } from './startup-import.service.js';

function attachmentHeader(fileName) {
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="startup-import.xlsx"; filename*=UTF-8''${encoded}`;
}

export const startupImportController = {
  async list(req, res) {
    return success(res, await startupImportService.list());
  },

  async template(req, res) {
    const path = fileURLToPath(new URL('./startup-import.template.xlsx', import.meta.url));
    const buffer = await readFile(path);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', attachmentHeader('Шаблон стартового импорта.xlsx'));
    return res.send(buffer);
  },

  async preview(req, res) {
    if (!req.file) throw ApiError.badRequest('Выберите файл .xlsx');
    return success(
      res,
      await startupImportService.preview(
        { buffer: req.file.buffer, originalFileName: req.file.originalname },
        { userId: req.user.sub },
      ),
      201,
    );
  },

  async apply(req, res) {
    return success(res, await startupImportService.apply(req.params.id, { userId: req.user.sub }));
  },
};

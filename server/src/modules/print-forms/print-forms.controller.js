import { printFormsService } from './print-forms.service.js';
import { printFormQuerySchema } from './print-forms.validation.js';
import { monthlyRentalService } from './monthly-rental-act/monthly-rental-act.service.js';
import { success } from '../../utils/respond.js';
import { ApiError } from '../../utils/api-error.js';

function attachmentHeader(fileName) {
  const fallback = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const printFormsController = {
  async generate(req, res) {
    const query = printFormQuerySchema.parse(req.query);
    const file = await printFormsService.generate(req.params.form, query, {
      userId: req.user.sub,
      permissions: req.user.permissions,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', attachmentHeader(file.fileName));
    res.setHeader('Content-Length', file.buffer.length);
    return res.send(file.buffer);
  },

  async previewMonthlyRental(req, res) {
    const query = printFormQuerySchema.parse(req.query);
    return success(res, await monthlyRentalService.preview(query));
  },

  async downloadMonthlyRentalVersion(req, res) {
    const format = req.params.format;
    if (!['xlsx', 'pdf'].includes(format)) {
      throw ApiError.badRequest('Формат версии акта должен быть xlsx или pdf');
    }
    const versionNumber = Number(req.params.versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw ApiError.badRequest('Некорректный номер версии акта');
    }
    const file = await monthlyRentalService.downloadVersion({
      actId: req.params.actId,
      versionNumber,
      format,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', attachmentHeader(file.fileName));
    res.setHeader('Content-Length', file.buffer.length);
    return res.send(file.buffer);
  },
};

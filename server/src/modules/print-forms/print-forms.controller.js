import { printFormsService } from './print-forms.service.js';
import { printFormQuerySchema } from './print-forms.validation.js';

export const printFormsController = {
  async generate(req, res) {
    const query = printFormQuerySchema.parse(req.query);
    const file = await printFormsService.generate(req.params.form, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', file.buffer.length);
    return res.send(file.buffer);
  },
};

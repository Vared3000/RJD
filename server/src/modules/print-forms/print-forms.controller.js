import { printFormsService } from './print-forms.service.js';
import { printFormQuerySchema } from './print-forms.validation.js';

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
    const file = await printFormsService.generate(req.params.form, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', attachmentHeader(file.fileName));
    res.setHeader('Content-Length', file.buffer.length);
    return res.send(file.buffer);
  },
};

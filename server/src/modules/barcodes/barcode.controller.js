import { barcodeService } from './barcode.service.js';
import { success } from '../../utils/respond.js';
import { attachmentHeader } from '../../utils/attachment-header.js';
import { buildExportFileName } from '../../utils/export-file-name.js';

function sendPdf(res, buffer, fileName) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(fileName));
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
}

export const barcodeController = {
  async findByBarcode(req, res) {
    return success(res, await barcodeService.findByBarcode(req.params.barcode));
  },

  async findByInventoryNumber(req, res) {
    return success(res, await barcodeService.findByInventoryNumber(req.params.inventoryNumber));
  },

  async printLabels(req, res) {
    const buffer = await barcodeService.printLabels(
      req.validatedBody.instanceIds,
      req.validatedBody,
    );
    return sendPdf(
      res,
      buffer,
      buildExportFileName({
        title: 'Этикетки',
        objects: [req.validatedBody.labelType === 'code128' ? 'Code128' : 'QR'],
        date: new Date(),
        extension: 'pdf',
      }),
    );
  },

  async printLabelsByInventoryNumbers(req, res) {
    const buffer = await barcodeService.printLabelsByInventoryNumbers(
      req.validatedBody.inventoryNumbers,
      req.validatedBody,
    );
    return sendPdf(
      res,
      buffer,
      buildExportFileName({
        title: 'Этикетки',
        objects: [req.validatedBody.labelType === 'code128' ? 'Code128' : 'QR'],
        date: new Date(),
        extension: 'pdf',
      }),
    );
  },
};

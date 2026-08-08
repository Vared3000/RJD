import { barcodeService } from './barcode.service.js';
import { success } from '../../utils/respond.js';

function attachmentHeader(fileName) {
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="labels.pdf"; filename*=UTF-8''${encoded}`;
}

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
    return sendPdf(res, buffer, `Этикетки_${req.validatedBody.labelType}.pdf`);
  },

  async printLabelsByInventoryNumbers(req, res) {
    const buffer = await barcodeService.printLabelsByInventoryNumbers(
      req.validatedBody.inventoryNumbers,
      req.validatedBody,
    );
    return sendPdf(res, buffer, `Этикетки_${req.validatedBody.labelType}.pdf`);
  },
};

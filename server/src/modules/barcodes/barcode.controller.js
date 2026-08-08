import { barcodeService } from './barcode.service.js';
import { paginatedSuccess } from '../../utils/respond.js';

export const barcodeController = {
  async findByBarcode(req, res) {
    const { barcode } = req.params;
    const instance = await barcodeService.findByBarcode(barcode);
    return paginatedSuccess(res, [instance], 1, 1, 1);
  },

  async findBarcodeByInventoryNumber(req, res) {
    const { inventoryNumber } = req.params;
    const instance = await barcodeService.findByInventoryNumber(inventoryNumber);
    return paginatedSuccess(res, [instance], 1, 1, 1);
  },

  async printLabels(req, res) {
    const { instanceIds, labelType = 'qr' } = req.body;
    const labels = await barcodeService.printLabels(instanceIds, { labelType });
    return paginatedSuccess(res, labels, labels.length, labels.length, 1);
  },

  async printLabelsByInventoryNumbers(req, res) {
    const { inventoryNumbers, labelType = 'qr' } = req.body;
    const labels = await barcodeService.printLabelsByInventoryNumbers(inventoryNumbers, {
      labelType,
    });
    return paginatedSuccess(res, labels, labels.length, labels.length, 1);
  },
};

import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';
import { ApiError } from '../../utils/api-error.js';
import { createBarcodePdf } from './barcode-pdf.js';

const { Instance } = models;

export const barcodeService = {
  async findByBarcode(barcode) {
    const instance = await Instance.findOne({
      where: { barcode },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
        { model: models.Batch, as: 'batch', attributes: ['id', 'code'] },
        { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
        {
          model: models.Employee,
          as: 'employee',
          attributes: ['id', 'fullName', 'personnelNumber'],
        },
      ],
    });
    if (!instance) throw ApiError.notFound('Экземпляр с таким штрихкодом не найден');
    return instance;
  },

  async findByInventoryNumber(inventoryNumber) {
    const instance = await Instance.findOne({
      where: { inventoryNumber },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
        { model: models.Batch, as: 'batch', attributes: ['id', 'code'] },
        { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
        {
          model: models.Employee,
          as: 'employee',
          attributes: ['id', 'fullName', 'personnelNumber'],
        },
      ],
    });
    if (!instance) throw ApiError.notFound('Экземпляр с таким инвентарным номером не найден');
    return instance;
  },

  async printLabels(instanceIds, { labelType = 'qr' } = {}) {
    const instances = await Instance.findAll({
      where: { id: { [Op.in]: instanceIds } },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
    });
    if (instances.length !== instanceIds.length) {
      throw ApiError.badRequest('Некоторые экземпляры не найдены');
    }
    return createBarcodePdf(instances, { labelType });
  },

  async printLabelsByInventoryNumbers(inventoryNumbers, { labelType = 'qr' } = {}) {
    const instances = await Instance.findAll({
      where: { inventoryNumber: { [Op.in]: inventoryNumbers } },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
    });
    if (instances.length !== inventoryNumbers.length) {
      throw ApiError.badRequest('Некоторые экземпляры не найдены');
    }
    return createBarcodePdf(instances, { labelType });
  },
};

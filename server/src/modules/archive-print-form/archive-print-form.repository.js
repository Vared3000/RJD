import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';

const { ArchivePrintForm, Employee, Dpo, NomenclatureModel, Size } = models;

export const archivePrintFormRepository = {
  // Включаем живые данные (приоритет живых, но показываем все)
  async listForPrintForm({ dpoId } = {}) {
    const where = {};
    if (dpoId) where.dpoId = dpoId;

    // Объединяем живые и архивные данные
    // Используем UNION для дедупликации
    return ArchivePrintForm.findAll({
      where,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'fullName', 'personnelNumber'],
          include: [{ model: Dpo, as: 'dpo', attributes: ['id', 'name'] }],
        },
        {
          model: NomenclatureModel,
          as: 'model',
          attributes: ['id', 'name', 'article'],
        },
        { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
      order: [
        ['documentDate', 'ASC'],
        ['employeeId', 'ASC'],
      ],
    });
  },

  // Получить данные только из архива
  async listFromArchive({ dpoId } = {}) {
    const where = { sourceTable: 'archive' };
    if (dpoId) where.dpoId = dpoId;

    return ArchivePrintForm.findAll({
      where,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'fullName', 'personnelNumber'],
          include: [{ model: Dpo, as: 'dpo', attributes: ['id', 'name'] }],
        },
        {
          model: NomenclatureModel,
          as: 'model',
          attributes: ['id', 'name', 'article'],
        },
        { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
      order: [
        ['documentDate', 'ASC'],
        ['employeeId', 'ASC'],
      ],
    });
  },

  // Создать запись в архиве
  async create(data) {
    return ArchivePrintForm.create(data);
  },

  // Массовое создание архивных записей
  async bulkCreate(records) {
    return ArchivePrintForm.bulkCreate(records);
  },

  // Очистить архивные данные (перед миграцией)
  async clearArchive() {
    return ArchivePrintForm.destroy({ where: { sourceTable: 'archive' } });
  },

  // Найти существующие записи для дедупликации
  async findExistingKeys(keys) {
    // keys = [{ dpoId, employeeId, documentType, documentId, lineNumber }]
    if (keys.length === 0) return [];

    return ArchivePrintForm.findAll({
      attributes: ['dpoId', 'employeeId', 'documentType', 'documentId', 'lineNumber'],
      where: {
        [Op.or]: keys.map((k) => ({
          dpoId: k.dpoId,
          employeeId: k.employeeId,
          documentType: k.documentType,
          documentId: k.documentId,
          lineNumber: k.lineNumber,
        })),
      },
    });
  },

  // Материализованное представление через raw query
  async getSummary({ dpoId } = {}) {
    const where = { sourceTable: 'archive' };
    if (dpoId) where.dpoId = dpoId;

    const [results] = await models.sequelize.query(
      `
      SELECT
        dpo_id,
        employee_id,
        COUNT(*) as "totalItems",
        SUM(quantity) as "totalQuantity",
        COALESCE(SUM(cost), 0) as "totalCost",
        COALESCE(SUM(employeeCost), 0) as "totalEmployeeCost"
      FROM archive_print_forms
      WHERE :dpoId IS NULL OR dpo_id = :dpoId
      GROUP BY dpo_id, employee_id
      ORDER BY dpo_id, employee_id
    `,
      {
        replacements: { dpoId },
      },
    );

    return results;
  },
};

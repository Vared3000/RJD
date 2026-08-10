import { Op } from 'sequelize';
import { models } from '../../../database/models/index.js';

const { PrintFormTemplate, User } = models;

const uploaderInclude = { model: User, as: 'uploadedByUser', attributes: ['id', 'fullName'] };

export const printFormTemplatesRepository = {
  listByFormType(formType) {
    return PrintFormTemplate.findAll({
      where: { formType },
      include: [uploaderInclude],
      order: [['versionNumber', 'DESC']],
    });
  },

  findById(id) {
    return PrintFormTemplate.findByPk(id, { include: [uploaderInclude] });
  },

  // «Текущая активная версия формы» = самая свежая activatedAt внутри
  // formType — единственный источник истины (см. модель PrintFormTemplate).
  findActive(formType) {
    return PrintFormTemplate.findOne({
      where: { formType, activatedAt: { [Op.ne]: null } },
      order: [['activatedAt', 'DESC']],
    });
  },

  // Блокировка всех строк формы сериализует параллельные загрузки версий
  // (аналог generateInventoryNumbers/receiving — см. docs/architecture.md).
  async createVersion(formType, data, { transaction }) {
    await PrintFormTemplate.findAll({
      where: { formType },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const maxVersion = await PrintFormTemplate.max('versionNumber', {
      where: { formType },
      transaction,
    });
    return PrintFormTemplate.create(
      { ...data, formType, versionNumber: (maxVersion ?? 0) + 1 },
      { transaction },
    );
  },

  async activate(id, { transaction }) {
    const [count] = await PrintFormTemplate.update(
      { activatedAt: new Date() },
      { where: { id }, transaction },
    );
    return count > 0;
  },
};

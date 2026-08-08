import { Op } from 'sequelize';
import { models } from '../../../database/models/index.js';

export const printFormSettingsRepository = {
  list() {
    return models.PrintFormParty.findAll({
      include: [{ model: models.User, as: 'createdByUser', attributes: ['id', 'fullName'] }],
      order: [
        ['role', 'ASC'],
        ['effectiveDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  },

  findAt(role, date) {
    return models.PrintFormParty.findOne({
      where: { role, effectiveDate: { [Op.lte]: date } },
      order: [
        ['effectiveDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  },

  create(data) {
    return models.PrintFormParty.create(data);
  },
};

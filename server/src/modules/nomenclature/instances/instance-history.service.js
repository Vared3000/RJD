import { models } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';
import { instanceEventsRepository } from './instance-events.repository.js';

export const instanceHistoryService = {
  async getByInstanceId(instanceId) {
    const instance = await models.Instance.findByPk(instanceId, { attributes: ['id'] });
    if (!instance) throw ApiError.notFound('Экземпляр не найден');
    return instanceEventsRepository.findByInstanceId(instanceId);
  },
};

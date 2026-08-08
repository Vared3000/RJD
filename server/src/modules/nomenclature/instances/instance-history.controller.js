import { success } from '../../../utils/respond.js';
import { instanceHistoryService } from './instance-history.service.js';

export const instanceHistoryController = {
  async get(req, res) {
    success(res, await instanceHistoryService.getByInstanceId(req.params.id));
  },
};

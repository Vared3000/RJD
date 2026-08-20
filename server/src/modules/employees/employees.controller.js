import { createReferenceController } from '../catalogs/reference-crud.factory.js';
import { success } from '../../utils/respond.js';
import { employeesService } from './employees.service.js';

const referenceController = createReferenceController(employeesService, {
  filterFields: ['dpoId', 'region', 'status'],
});

export const employeesController = {
  ...referenceController,

  async getProperty(req, res) {
    const property = await employeesService.getProperty(req.params.id);
    return success(res, property);
  },
};

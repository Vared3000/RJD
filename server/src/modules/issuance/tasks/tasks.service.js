import { sequelize } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';
import { tasksRepository } from './tasks.repository.js';
import { issuanceService } from '../documents/issuance.service.js';

export const tasksService = {
  list(options) {
    return tasksRepository.list(options);
  },

  countOpen() {
    return tasksRepository.countOpen();
  },

  // Кладовщик вручную завершает задачу, когда видит, что остаток появился —
  // система сама создаёт и проводит довыдающий документ (см.
  // issuanceService.createAndPostForTask). Если остатка всё ещё недостаточно,
  // applyIssuanceSideEffects внутри createAndPostForTask бросит 400 —
  // транзакция откатится, задача останется открытой.
  async complete(taskId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const task = await tasksRepository.findLocked(taskId, { transaction });
      if (!task) throw ApiError.notFound('Задача не найдена');
      if (task.status !== 'open') throw ApiError.conflict('Задача уже завершена');

      const fulfillingDocumentId = await issuanceService.createAndPostForTask(
        {
          employeeId: task.employeeId,
          warehouseId: task.warehouseId,
          documentDate: new Date().toISOString().slice(0, 10),
          responsibleUserId: userId,
          note: 'Дособор по задаче на сборку',
          modelId: task.modelId,
          sizeId: task.sizeId,
          heightSizeId: task.heightSizeId,
          quantity: task.quantity,
        },
        { userId, transaction },
      );

      await tasksRepository.markCompleted(
        taskId,
        { fulfillingDocumentId, completedByUserId: userId },
        { transaction },
      );
    });

    return tasksRepository.findById(taskId);
  },
};

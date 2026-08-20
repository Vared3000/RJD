import { sequelize } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';
import { tasksRepository, issuanceTaskKey } from './tasks.repository.js';
import { issuanceRepository } from '../documents/issuance.repository.js';
import { generateDocumentNumber } from '../documents/generate-document-number.js';

export const tasksService = {
  list(options) {
    return tasksRepository.list(options);
  },

  countOpen() {
    return tasksRepository.countOpen();
  },

  // Релиз Д (см. HANDOFF.md): "Оформить довыдачу" — объединяет выбранные
  // открытые задачи ОДНОГО работника и ОДНОГО склада в обычный черновик
  // Выдачи (та же issuanceRepository, что использует редактор выдачи), без
  // немедленного проведения. Задачи с одинаковой моделью/размером/ростом
  // сливаются в одну строку с суммарным количеством. Пользователь дальше
  // работает с этим черновиком как с любым другим — правит/проводит через
  // issuance.service.js; закрытие задач происходит там же, при post()/revise()
  // (см. reconcileTaskFulfillments в issuance.service.js), не здесь.
  async createDraft({ taskIds, userId }) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw ApiError.badRequest('Выберите хотя бы одну задачу');
    }
    const uniqueIds = [...new Set(taskIds)];

    let documentId;
    await sequelize.transaction(async (transaction) => {
      const tasks = await tasksRepository.findManyLocked(uniqueIds, { transaction });
      if (tasks.length !== uniqueIds.length) {
        throw ApiError.notFound('Часть выбранных задач не найдена');
      }
      if (tasks.some((task) => task.status !== 'open')) {
        throw ApiError.conflict(
          'Часть выбранных задач уже в оформлении или завершена — обновите страницу',
        );
      }
      const { employeeId, warehouseId } = tasks[0];
      if (
        tasks.some((task) => task.employeeId !== employeeId || task.warehouseId !== warehouseId)
      ) {
        throw ApiError.badRequest(
          'Можно оформить довыдачу только для задач одного работника и одного склада',
        );
      }

      const grouped = new Map();
      for (const task of tasks) {
        const key = issuanceTaskKey(task);
        const line = grouped.get(key) ?? {
          modelId: task.modelId,
          sizeId: task.sizeId,
          heightSizeId: task.heightSizeId,
          quantity: 0,
        };
        line.quantity += task.quantity;
        grouped.set(key, line);
      }

      const number = await generateDocumentNumber();
      const document = await issuanceRepository.createDocument(
        {
          number,
          employeeId,
          warehouseId,
          documentDate: new Date().toISOString().slice(0, 10),
          responsibleUserId: userId,
          status: 'draft',
          note: 'Довыдача по задачам на доукомплектовку',
        },
        { transaction },
      );
      await issuanceRepository.bulkCreateLines(document.id, [...grouped.values()], { transaction });
      await tasksRepository.markInProgress(uniqueIds, document.id, { transaction });
      documentId = document.id;
    });

    return issuanceRepository.findById(documentId);
  },
};

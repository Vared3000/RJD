import { sequelize } from '../../../database/models/index.js';
import { ApiError } from '../../../utils/api-error.js';
import { tasksRepository, issuanceTaskKey } from './tasks.repository.js';
import { issuanceRepository } from '../documents/issuance.repository.js';
import { generateDocumentNumber } from '../documents/generate-document-number.js';
import { dateOnlyToday, daysUntil, replacementStatusForDate } from './replacement-dates.js';

const ACTIVE_TASK_STATUSES = new Set(['scheduled', 'open', 'overdue']);

function workflowStatus(task, availableQuantity) {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'cancelled') return 'cancelled';
  if (task.status === 'in_progress') return 'draft_created';
  if (task.taskType === 'replacement' && task.status === 'scheduled') return 'scheduled';
  if (task.status === 'overdue') return 'overdue';
  return availableQuantity > 0 ? 'ready' : 'waiting_stock';
}

async function withAvailability(task) {
  const plain = task.get ? task.get({ plain: true }) : task;
  const availableQuantity = ACTIVE_TASK_STATUSES.has(plain.status)
    ? await issuanceRepository.countAvailableInstances({
        modelId: plain.modelId,
        sizeId: plain.sizeId,
        heightSizeId: plain.heightSizeId,
        warehouseId: plain.warehouseId,
      })
    : 0;
  return {
    ...plain,
    availableQuantity,
    assemblyQuantity: Math.min(Number(plain.quantity), availableQuantity),
    workflowStatus: workflowStatus(plain, availableQuantity),
    daysRemaining: plain.plannedReplacementDate ? daysUntil(plain.plannedReplacementDate) : null,
  };
}

export const tasksService = {
  async refreshScheduledTasks({ today = dateOnlyToday() } = {}) {
    const tasks = await tasksRepository.findReplacementSchedules();
    for (const task of tasks) {
      const employeeUnavailable =
        Boolean(task.employee?.archivedAt) ||
        (task.employee?.terminationDate && task.employee.terminationDate <= today);
      if (employeeUnavailable) {
        await tasksRepository.setScheduleState(task.id, {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: 'Работник уволен или перемещён в архив',
        });
        continue;
      }
      const status = replacementStatusForDate(task.plannedReplacementDate, today);
      if (task.status !== status) await tasksRepository.setScheduleState(task.id, { status });
    }
  },

  async list(options = {}) {
    const today = dateOnlyToday();
    await this.refreshScheduledTasks({ today });
    const result = await tasksRepository.list({ ...options, today });
    return {
      ...result,
      rows: await Promise.all(result.rows.map(withAvailability)),
    };
  },

  async countOpen() {
    const today = dateOnlyToday();
    await this.refreshScheduledTasks({ today });
    return tasksRepository.countActive(today);
  },

  // Создаёт отдельную выдачу только на то количество, которое сейчас можно
  // собрать. Остаток задачи остаётся открытым после проведения документа.
  async createDraft({ taskIds, userId }) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw ApiError.badRequest('Выберите хотя бы одну задачу');
    }
    const uniqueIds = [...new Set(taskIds)];
    const today = dateOnlyToday();

    let documentId;
    await sequelize.transaction(async (transaction) => {
      const tasks = await tasksRepository.findManyLocked(uniqueIds, { transaction });
      if (tasks.length !== uniqueIds.length) {
        throw ApiError.notFound('Часть выбранных задач не найдена');
      }
      if (
        tasks.some(
          (task) =>
            !ACTIVE_TASK_STATUSES.has(task.status) ||
            (task.taskType === 'replacement' && task.notificationDate > today),
        )
      ) {
        throw ApiError.conflict(
          'Часть выбранных задач ещё не доступна, уже оформляется или завершена — обновите страницу',
        );
      }
      const { employeeId, warehouseId, taskType } = tasks[0];
      if (
        tasks.some(
          (task) =>
            task.employeeId !== employeeId ||
            task.warehouseId !== warehouseId ||
            task.taskType !== taskType,
        )
      ) {
        throw ApiError.badRequest(
          'В один документ можно включить задачи одного типа, работника и склада',
        );
      }

      const availableByKey = new Map();
      for (const task of tasks) {
        const key = issuanceTaskKey(task);
        if (!availableByKey.has(key)) {
          availableByKey.set(
            key,
            await issuanceRepository.countAvailableInstances(
              {
                modelId: task.modelId,
                sizeId: task.sizeId,
                heightSizeId: task.heightSizeId,
                warehouseId: task.warehouseId,
              },
              { transaction },
            ),
          );
        }
      }

      const grouped = new Map();
      const allocatedTaskIds = [];
      for (const task of tasks) {
        const key = issuanceTaskKey(task);
        const available = availableByKey.get(key) ?? 0;
        const allocated = Math.min(Number(task.quantity), available);
        if (allocated <= 0) continue;
        availableByKey.set(key, available - allocated);
        allocatedTaskIds.push(task.id);
        const line = grouped.get(key) ?? {
          modelId: task.modelId,
          sizeId: task.sizeId,
          heightSizeId: task.heightSizeId,
          quantity: 0,
        };
        line.quantity += allocated;
        grouped.set(key, line);
      }
      if (allocatedTaskIds.length === 0) {
        throw ApiError.conflict('На выбранном складе пока нет вещей для этой задачи');
      }

      const number = await generateDocumentNumber();
      const isReplacement = taskType === 'replacement';
      const document = await issuanceRepository.createDocument(
        {
          number,
          employeeId,
          warehouseId,
          documentDate: today,
          responsibleUserId: userId,
          status: 'draft',
          issuanceKind: isReplacement ? 'replacement' : 'completion',
          note: isReplacement
            ? 'Плановое переодевание по сроку износа'
            : 'Довыдача по задачам на доукомплектовку',
        },
        { transaction },
      );
      await issuanceRepository.bulkCreateLines(document.id, [...grouped.values()], { transaction });
      await tasksRepository.markInProgress(allocatedTaskIds, document.id, { transaction });
      documentId = document.id;
    });

    return issuanceRepository.findById(documentId);
  },
};

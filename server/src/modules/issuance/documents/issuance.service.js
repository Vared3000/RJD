import { sequelize } from '../../../database/models/index.js';
import { issuanceRepository } from './issuance.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import { KIT_SEASONS } from '../../../database/models/position-kit-item.model.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../../nomenclature/instances/instance-events.repository.js';
import { priceRepository } from '../../nomenclature/prices/price.repository.js';
import {
  findTouchedInstanceIds,
  assertNoBlockingDocuments,
} from '../../nomenclature/instances/instance-dependency-check.js';
import { documentRevisionsRepository } from '../../documents/document-revisions.repository.js';
import { flagStaleForIssuanceRevision } from '../../print-forms/monthly-rental-act/monthly-rental-act.service.js';
import { floorMoney } from '../../print-forms/shared/money.js';
import {
  ALL_WEAR_MONTHS,
  normalizeWearMonths,
} from '../../../database/models/nomenclature-model.model.js';
import { tasksRepository, issuanceTaskKey } from '../tasks/tasks.repository.js';
import {
  dateOnlyToday,
  plannedReplacementDate,
  replacementNotificationDate,
  replacementStatusForDate,
} from '../tasks/replacement-dates.js';

const SIZE_FIELD_BY_TYPE = {
  clothing: 'clothingSizeId',
  height: 'heightSizeId',
  shoe: 'shoeSizeId',
  headwear: 'headwearSizeId',
  belt: 'beltSizeId',
  gloves: 'glovesSizeId',
};

const SIZE_ALIAS_BY_TYPE = {
  clothing: 'clothingSize',
  height: 'heightSize',
  shoe: 'shoeSize',
  headwear: 'headwearSize',
  belt: 'beltSize',
  gloves: 'glovesSize',
};

// Сезон должен совпадать строго: импортированные позиции без сезонной разметки
// нельзя автоматически считать одновременно летними и зимними. Пол остаётся
// необязательным: пустое значение означает унисекс, а для работника без пола
// гендерное ограничение не применяется.
function matchesKitItem(item, season, employeeGender) {
  const seasonMatches = item.season === season;
  const genderMatches = !item.gender || !employeeGender || item.gender === employeeGender;
  return seasonMatches && genderMatches;
}

function kitItemPriority(item, season, employeeGender) {
  let priority = item.season === season ? 4 : 0;
  if (employeeGender) {
    priority += item.gender === employeeGender ? 2 : item.gender ? 0 : 1;
  } else {
    priority += item.gender ? 0 : 2;
  }
  return priority;
}

// Несколько вариантов одной модели могут пересекаться из-за универсальных значений NULL.
// На одну модель выбирается ровно один, наиболее точный вариант; порядок из репозитория
// используется как стабильный критерий при одинаковом приоритете.
function selectKitItems(items, season, employeeGender) {
  const selectedByModel = new Map();
  for (const item of items) {
    if (!matchesKitItem(item, season, employeeGender)) continue;
    const selected = selectedByModel.get(item.modelId);
    if (
      !selected ||
      kitItemPriority(item, season, employeeGender) >
        kitItemPriority(selected, season, employeeGender)
    ) {
      selectedByModel.set(item.modelId, item);
    }
  }
  return [...selectedByModel.values()];
}

// Для вручную добавленной строки сезон неизвестен, поэтому берём наиболее
// точный по полу норматив модели, а при нескольких сезонах — самый короткий
// срок (безопасный вариант: задача не появится позже установленного норматива).
function serviceLifeForModel(items, modelId, employeeGender) {
  return items
    .filter(
      (item) =>
        item.modelId === modelId &&
        Number(item.serviceLifeYears) > 0 &&
        (!item.gender || !employeeGender || item.gender === employeeGender),
    )
    .sort((a, b) => {
      const aGender = employeeGender && a.gender === employeeGender ? 0 : 1;
      const bGender = employeeGender && b.gender === employeeGender ? 0 : 1;
      return aGender - bGender || Number(a.serviceLifeYears) - Number(b.serviceLifeYears);
    })[0]?.serviceLifeYears;
}

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.conflict('Документ уже проведён и недоступен для изменения');
  }
}

// Дублирующая проверка перед уникальным индексом БД (см. миграцию 0027) —
// понятная ошибка вместо падения на constraint. excludeLineId — при
// редактировании существующей строки исключает её саму из сравнения.
function assertNoDuplicateLine(lines, { modelId, sizeId, heightSizeId }, excludeLineId) {
  const duplicate = lines.some(
    (line) =>
      line.id !== excludeLineId &&
      line.modelId === modelId &&
      line.sizeId === sizeId &&
      (line.heightSizeId ?? null) === (heightSizeId ?? null),
  );
  if (duplicate) {
    throw ApiError.badRequest(
      'В документе уже есть строка с такой же моделью, размером и ростом — измените количество в ней',
    );
  }
}

// Для revise(): кандидаты строятся в памяти до вставки в БД и ещё не имеют
// id, поэтому assertNoDuplicateLine(..., excludeLineId=undefined) молча не
// сработал бы (undefined !== undefined → false для каждой уже накопленной
// строки). Отдельная функция без параметра исключения — сравнивает кандидата
// только с уже собранными в текущем цикле строками.
function assertNoDuplicateAmongNewLines(lines, candidate) {
  const duplicate = lines.some(
    (line) =>
      line.modelId === candidate.modelId &&
      line.sizeId === candidate.sizeId &&
      (line.heightSizeId ?? null) === (candidate.heightSizeId ?? null),
  );
  if (duplicate) {
    throw ApiError.badRequest(
      'В документе уже есть строка с такой же моделью, размером и ростом — измените количество в ней',
    );
  }
}

function valueFrom(data, currentLine, field) {
  return Object.prototype.hasOwnProperty.call(data, field) ? data[field] : currentLine?.[field];
}

function waitingTaskStatus(task, pendingDraftDocumentId = null) {
  if (pendingDraftDocumentId) return 'in_progress';
  if (task.taskType === 'replacement' && task.plannedReplacementDate) {
    return replacementStatusForDate(task.plannedReplacementDate);
  }
  return 'open';
}

function priceSnapshot(price) {
  if (!price) return null;
  const withoutVat = floorMoney(price.priceWithoutVat);
  const withVat = price.priceWithVat == null ? null : floorMoney(price.priceWithVat);
  const rate = Number(price.vatRate ?? 5);
  const derivedVat = withVat != null && withoutVat > 0 ? (withVat / withoutVat - 1) * 100 : rate;
  const vatRate = Number(price.vatRate ?? derivedVat);
  const priceWithVatSnapshot =
    withVat ?? floorMoney(withoutVat + floorMoney((withoutVat * vatRate) / 100));
  return {
    priceSourceId: price.id,
    priceEffectiveDate: price.effectiveDate,
    priceWithoutVatSnapshot: withoutVat,
    vatRateSnapshot: vatRate,
    priceWithVatSnapshot,
  };
}

async function normalizeLineSizes(data, currentLine, { transaction } = {}) {
  const modelId = valueFrom(data, currentLine, 'modelId');
  const sizeId = valueFrom(data, currentLine, 'sizeId');
  const heightSizeId = valueFrom(data, currentLine, 'heightSizeId');
  const model = await issuanceRepository.findActiveModel(modelId, { transaction });
  if (!model) throw ApiError.badRequest('Модель номенклатуры не найдена или архивирована');

  if (!model.sizeType) {
    return { ...data, sizeId: null, heightSizeId: null };
  }

  if (!sizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать размер');
  }
  const size = await issuanceRepository.findActiveSize(sizeId, { transaction });
  if (!size || size.type !== model.sizeType) {
    throw ApiError.badRequest('Размер не найден, архивирован или не соответствует типу модели');
  }

  if (model.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model.requiresHeightSize && heightSizeId) {
    const heightSize = await issuanceRepository.findActiveSize(heightSizeId, { transaction });
    if (!heightSize || heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост не найден, архивирован или имеет другой тип');
    }
    return { ...data, sizeId, heightSizeId };
  }

  return { ...data, sizeId, heightSizeId: null };
}

// Подбирает под каждую строку доступные экземпляры (FIFO), переводит их в
// issued с привязкой к работнику, создаёт движения/события и снимок цены.
// Переиспользуется post() (первое проведение) и revise() (редакция).
//
// tolerateShortage=false (revise() и внутренние вызовы по умолчанию) —
// прежнее поведение: нехватка остатка хотя бы по одной строке откатывает
// всю транзакцию. tolerateShortage=true (только post(), см. ниже) — новое
// поведение "частичной сборки": по строке выдаётся столько, сколько реально
// есть, line.quantity в БД уменьшается до фактически выданного (это то же
// самое поле, которое печатные формы 1.5/1.7/ФПУ/УПД показывают как
// фактическое количество — должно совпадать с реальностью), полностью
// невыполненная строка удаляется. Разница по каждой строке возвращается
// вызывающей стороне как shortages — post() создаёт по ним задачи на
// дособор (issuance_tasks).
async function applyIssuanceSideEffects(
  document,
  lines,
  { userId, transaction, tolerateShortage = false },
) {
  const allInstanceIds = [];
  const movementRows = [];
  const eventRows = [];
  const shortages = [];
  const issuedInstancesById = new Map();
  const { employee, kitItems } = await issuanceRepository.findEmployeeWithKit(document.employeeId, {
    transaction,
  });

  for (const line of lines) {
    const instances = await issuanceRepository.findAvailableInstances(
      {
        modelId: line.modelId,
        sizeId: line.sizeId,
        heightSizeId: line.heightSizeId ?? null,
        warehouseId: document.warehouseId,
        limit: line.quantity,
      },
      { transaction },
    );

    if (instances.length < line.quantity) {
      if (!tolerateShortage) {
        const modelName = line.model?.name ?? line.modelId;
        const sizeDescription = line.size?.value ? `, размер ${line.size.value}` : ', без размера';
        throw ApiError.badRequest(
          `Недостаточно на складе: «${modelName}»${sizeDescription} — ` +
            `доступно ${instances.length} из ${line.quantity}`,
        );
      }
      shortages.push({
        modelId: line.modelId,
        sizeId: line.sizeId,
        heightSizeId: line.heightSizeId ?? null,
        missingQuantity: line.quantity - instances.length,
      });
    }

    if (instances.length === 0) {
      await issuanceRepository.deleteLine(line.id, { transaction });
      continue;
    }
    if (instances.length < line.quantity) {
      await issuanceRepository.updateLine(line.id, { quantity: instances.length }, { transaction });
    }

    const applicablePrice = await priceRepository.findApplicable(
      {
        modelId: line.modelId,
        dpoId: employee?.dpoId ?? null,
        operationDate: document.documentDate,
      },
      { transaction },
    );
    const snapshot = priceSnapshot(applicablePrice);
    if (snapshot) {
      await issuanceRepository.savePriceSnapshot(line.id, snapshot, { transaction });
    }

    const serviceLifeYears = serviceLifeForModel(kitItems, line.modelId, employee?.gender);
    const replacementDate = serviceLifeYears
      ? plannedReplacementDate(document.documentDate, serviceLifeYears)
      : null;
    const wearMonthsSnapshot = normalizeWearMonths(line.model?.wearMonths ?? ALL_WEAR_MONTHS);

    for (const instance of instances) {
      allInstanceIds.push(instance.id);
      issuedInstancesById.set(instance.id, instance);
      eventRows.push(
        buildInstanceEvent({
          instance,
          eventType: 'issuance',
          to: { status: 'issued', warehouseId: null, employeeId: document.employeeId },
          documentType: 'issuance',
          documentId: document.id,
          occurredAt: document.documentDate,
          userId,
          details: { documentNumber: document.number },
        }),
      );
      movementRows.push({
        instanceId: instance.id,
        fromWarehouseId: document.warehouseId,
        toWarehouseId: null,
        documentType: 'issuance',
        documentId: document.id,
        occurredAt: document.documentDate,
        note: `Выдача ${document.number}`,
        serviceLifeYearsSnapshot: serviceLifeYears ?? null,
        plannedReplacementDate: replacementDate,
        wearMonthsSnapshot,
      });
    }
  }

  await issuanceRepository.markInstancesIssued(allInstanceIds, document.employeeId, {
    transaction,
  });
  const createdMovements = await issuanceRepository.bulkCreateMovements(movementRows, {
    transaction,
  });
  // Строки движения создавались в том же порядке, что и экземпляры; модель и
  // размеры берём из соответствующего объекта Instance, чтобы каждая
  // физическая вещь получила отдельную недублируемую задачу.
  const tasks = [];
  const employeeEligibleForReplacement =
    !employee?.archivedAt &&
    (!employee?.terminationDate || employee.terminationDate > dateOnlyToday());
  for (let index = 0; index < createdMovements.length; index += 1) {
    const movement = createdMovements[index];
    if (
      !employeeEligibleForReplacement ||
      !movement.serviceLifeYearsSnapshot ||
      !movement.plannedReplacementDate
    ) {
      continue;
    }
    const issued = issuedInstancesById.get(movement.instanceId);
    tasks.push({
      taskType: 'replacement',
      sourceDocumentId: document.id,
      sourceMovementId: movement.id,
      sourceInstanceId: movement.instanceId,
      employeeId: document.employeeId,
      warehouseId: document.warehouseId,
      modelId: issued.modelId,
      sizeId: issued.sizeId,
      heightSizeId: issued.heightSizeId,
      quantity: 1,
      status: replacementStatusForDate(movement.plannedReplacementDate),
      issuedAt: document.documentDate,
      serviceLifeYearsSnapshot: movement.serviceLifeYearsSnapshot,
      plannedReplacementDate: movement.plannedReplacementDate,
      notificationDate: replacementNotificationDate(movement.plannedReplacementDate),
    });
  }
  if (tasks.length > 0) await tasksRepository.bulkCreate(tasks, { transaction });
  await instanceEventsRepository.bulkCreate(eventRows, { transaction });
  return { instanceIds: allInstanceIds, shortages };
}

async function loadDocumentWithAvailability(id) {
  const document = await issuanceRepository.findById(id);
  if (!document) return null;
  const plain = document.get ? document.get({ plain: true }) : document;
  const lines = await Promise.all(
    (plain.lines ?? []).map(async (line) => {
      if (plain.status !== 'draft') {
        return {
          ...line,
          requiredQuantity: Number(line.quantity),
          availableQuantity: null,
          assemblyQuantity: Number(line.quantity),
          missingQuantity: 0,
        };
      }
      const availableQuantity = await issuanceRepository.countAvailableInstances({
        modelId: line.modelId,
        sizeId: line.sizeId,
        heightSizeId: line.heightSizeId,
        warehouseId: plain.warehouseId,
      });
      const requiredQuantity = Number(line.quantity);
      const assemblyQuantity = Math.min(requiredQuantity, availableQuantity);
      return {
        ...line,
        requiredQuantity,
        availableQuantity,
        assemblyQuantity,
        missingQuantity: Math.max(requiredQuantity - availableQuantity, 0),
      };
    }),
  );
  return { ...plain, lines };
}

// Релиз Д: сопоставляет задачи на доукомплектовку, связанные с этим
// документом (переданы вызывающей стороной — post() ищет их по
// draftDocumentId, revise() восстанавливает список через уже существующие
// issuance_task_fulfillments), с фактически выданным количеством по их
// (modelId,sizeId,heightSizeId). Распределяет FIFO — задачи старше
// закрываются первыми — создаёт запись в issuance_task_fulfillments на
// фактически закрытую часть и уменьшает quantity задачи "на месте": если
// дошло до 0 — задача completed, иначе снова open (черновик уже отработал,
// оставшаяся потребность ждёт новой довыдачи). Строка могла быть удалена
// пользователем до проведения (или revise() убрал её совсем) — тогда для
// этого ключа просто нет строки, actualIssued=0, задача целиком возвращается
// в open с прежним quantity. Возвращает набор "обработанных" ключей — post()
// использует его, чтобы не завести ЕЩЁ одну orphan-задачу на тот же дефицит
// через generic-механизм shortages (иначе получились бы дублирующие задачи
// на одну и ту же нехватку — ровно то, что явно запрещено ТЗ Релиза Д).
async function reconcileTaskFulfillments({
  documentId,
  tasks,
  lines,
  shortages,
  userId,
  transaction,
}) {
  if (tasks.length === 0) return new Set();

  const missingByKey = new Map(shortages.map((s) => [issuanceTaskKey(s), s.missingQuantity]));
  const linesByKey = new Map(lines.map((l) => [issuanceTaskKey(l), l]));
  const groups = new Map();
  for (const task of tasks) {
    const key = issuanceTaskKey(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)),
    );
  }

  for (const [key, group] of groups) {
    const line = linesByKey.get(key);
    const actualIssued = line ? line.quantity - (missingByKey.get(key) ?? 0) : 0;
    let remaining = actualIssued;
    for (const task of group) {
      const allocate = Math.min(task.quantity, remaining);
      remaining -= allocate;
      if (allocate > 0) {
        await tasksRepository.createFulfillments(
          [{ taskId: task.id, documentId, quantity: allocate }],
          { transaction },
        );
      }
      const nextQuantity = task.quantity - allocate;
      // post() получает задачу, связанную с текущим черновиком, и после
      // проведения должен снять эту связь. revise() восстанавливает задачу
      // по истории fulfillment, но у неё уже может быть ДРУГОЙ, более новый
      // черновик. Его связь нельзя сбрасывать при пересчёте старого документа.
      const pendingDraftDocumentId =
        task.draftDocumentId && task.draftDocumentId !== documentId ? task.draftDocumentId : null;
      if (nextQuantity <= 0 && pendingDraftDocumentId) {
        throw ApiError.conflict(
          'Задача уже оформляется в более новом черновике. Удалите этот черновик перед изменением старой довыдачи',
        );
      }
      await tasksRepository.updateProgress(
        task.id,
        {
          quantity: nextQuantity,
          status: nextQuantity <= 0 ? 'completed' : waitingTaskStatus(task, pendingDraftDocumentId),
          completedAt: nextQuantity <= 0 ? new Date() : null,
          completedByUserId: nextQuantity <= 0 ? userId : null,
          draftDocumentId: nextQuantity <= 0 ? null : pendingDraftDocumentId,
        },
        { transaction },
      );
    }
  }
  return new Set(groups.keys());
}

export const issuanceService = {
  list(options) {
    return issuanceRepository.list(options);
  },

  async getById(id) {
    const document = await loadDocumentWithAvailability(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await issuanceRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return loadDocumentWithAvailability(document.id);
  },

  async update(id, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(id, { transaction });
      assertDraft(document);
      await issuanceRepository.updateDocument(id, data, { transaction });
    });
    return loadDocumentWithAvailability(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(id, { transaction });
      assertDraft(document);
      // Релиз Д: если черновик был создан из задач на доукомплектовку
      // ("Оформить довыдачу"), при его удалении задачи возвращаются в open —
      // никакая выдача так и не состоялась.
      const draftTasks = await tasksRepository.findByDraftDocument(id, { transaction });
      if (draftTasks.length > 0) {
        for (const task of draftTasks) {
          await tasksRepository.updateProgress(
            task.id,
            {
              ...task.get({ plain: true }),
              status: waitingTaskStatus(task),
              draftDocumentId: null,
            },
            { transaction },
          );
        }
      }
      await issuanceRepository.deleteDraft(id, { transaction });
    });
  },

  async addLine(documentId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const normalizedData = await normalizeLineSizes(data, null, { transaction });
      assertNoDuplicateLine(document.lines, normalizedData);
      await issuanceRepository.createLine(documentId, normalizedData, { transaction });
    });
    return loadDocumentWithAvailability(documentId);
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await issuanceRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      const normalizedData = await normalizeLineSizes(data, line, { transaction });
      assertNoDuplicateLine(
        document.lines,
        {
          modelId: normalizedData.modelId ?? line.modelId,
          sizeId: normalizedData.sizeId,
          heightSizeId: normalizedData.heightSizeId,
        },
        lineId,
      );
      await issuanceRepository.updateLine(lineId, normalizedData, { transaction });
    });
    return loadDocumentWithAvailability(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await issuanceRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await issuanceRepository.deleteLine(lineId, { transaction });
    });
    return loadDocumentWithAvailability(documentId);
  },

  // Быстрый подбор комплекта (раздел 9 ТЗ): по должности работника находит
  // комплект, по типу размера каждой модели комплекта (nomenclatureModel.
  // sizeType) берёт соответствующий размер из карточки работника. Позиции,
  // для которых у работника размер этого типа не указан, или строка с такой
  // же моделью/размером уже есть в документе — пропускаются, а не падают с
  // ошибкой (пользователь может добавить их вручную); список пропущенных
  // возвращается вызывающей стороне для отображения предупреждения.
  //
  // season ('summer'|'winter') — обязателен: комплект делится на летний и
  // зимний (см. PositionKitItem.season), выбор сезона отдельным действием на
  // экране. Позиции без сезона (season === null), унаследованные из архивного
  // импорта, в автоподбор не входят: администратор должен явно назначить им
  // летний или зимний сезон. Пол позиции фильтруется отдельно — см. matchesKitItem.
  async applyKit(documentId, { season } = {}) {
    if (!KIT_SEASONS.includes(season)) {
      throw ApiError.badRequest('Укажите сезон комплекта (летний или зимний)');
    }

    const skipped = [];
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      assertDraft(document);

      const { employee, kitItems: allKitItems } = await issuanceRepository.findEmployeeWithKit(
        document.employeeId,
        { transaction },
      );
      const kitItems = selectKitItems(allKitItems, season, employee.gender);
      const existingKeys = new Set(
        document.lines.map((line) => `${line.modelId}:${line.sizeId}:${line.heightSizeId ?? ''}`),
      );

      for (const kitItem of kitItems) {
        const sizeField = SIZE_FIELD_BY_TYPE[kitItem.model?.sizeType];
        const sizeId = sizeField ? employee[sizeField] : null;
        const heightSizeId = kitItem.model?.requiresHeightSize ? employee.heightSizeId : null;
        const requiresSize = Boolean(kitItem.model?.sizeType);
        if ((requiresSize && !sizeId) || (kitItem.model?.requiresHeightSize && !heightSizeId)) {
          skipped.push({
            modelId: kitItem.modelId,
            modelName: kitItem.model?.name,
            reason: 'no-size',
          });
          continue;
        }
        const key = `${kitItem.modelId}:${sizeId}:${heightSizeId ?? ''}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        await issuanceRepository.createLine(
          documentId,
          {
            modelId: kitItem.modelId,
            sizeId,
            heightSizeId,
            quantity: kitItem.quantity,
          },
          { transaction },
        );
      }
    });

    return { document: await loadDocumentWithAvailability(documentId), skipped };
  },

  // Предпросмотр комплекта (строго по размерам работника — раздел 9 ТЗ):
  // для каждой позиции комплекта его должности показывает, какой размер
  // работника подошёл бы, и сколько реально есть на складе документа под
  // этот конкретный размер — прежде чем что-либо добавлять в документ.
  // Ничего не создаёт и не изменяет; сама позиция добавляется отдельным
  // вызовом addLine, когда пользователь выбирает конкретную позицию из списка.
  async previewKit(documentId, { season } = {}) {
    if (!KIT_SEASONS.includes(season)) {
      throw ApiError.badRequest('Укажите сезон комплекта (летний или зимний)');
    }

    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);

    const { employee, kitItems: allKitItems } = await issuanceRepository.findEmployeeWithKit(
      document.employeeId,
    );
    if (!employee?.positionId) {
      return { items: [], noPosition: true, positionName: null };
    }
    const kitItems = selectKitItems(allKitItems, season, employee.gender);

    const items = [];
    for (const kitItem of kitItems) {
      const sizeType = kitItem.model?.sizeType;
      const sizeAlias = sizeType ? SIZE_ALIAS_BY_TYPE[sizeType] : null;
      const size = sizeAlias ? employee[sizeAlias] : null;
      const hasRequiredSize = !sizeType || Boolean(size);
      const requiresHeight = Boolean(kitItem.model?.requiresHeightSize);
      const hasHeight = !requiresHeight || Boolean(employee.heightSize);
      const missingSize = !hasRequiredSize || !hasHeight;

      const availableQuantity = missingSize
        ? null
        : await issuanceRepository.countAvailableInstances({
            modelId: kitItem.modelId,
            sizeId: size?.id ?? null,
            heightSizeId: requiresHeight ? employee.heightSize.id : null,
            warehouseId: document.warehouseId,
          });

      items.push({
        modelId: kitItem.modelId,
        modelName: kitItem.model?.name,
        sizeId: size?.id ?? null,
        sizeLabel: size?.value ?? null,
        heightSizeId: requiresHeight ? employee.heightSize.id : null,
        heightLabel: requiresHeight ? (employee.heightSize?.value ?? null) : null,
        quantity: kitItem.quantity,
        missingSize,
        availableQuantity,
      });
    }

    return {
      items,
      noPosition: false,
      positionName: employee.position?.name ?? null,
    };
  },

  // Проведение — подбирает под каждую строку доступные экземпляры (FIFO по
  // дате поступления, FOR UPDATE SKIP LOCKED — см. репозиторий), переводит
  // их в issued с привязкой к работнику и создаёт движения склада.
  // Нехватка остатка больше не откатывает всю транзакцию целиком (было так
  // до задачи "Отдать в сборку" с частичной выдачей): по строке выдаётся
  // сколько есть, недостача по каждой строке становится отдельной задачей
  // на дособор (issuance_tasks) — кладовщик оформляет по ней довыдачу на
  // странице "Задачи" (см. tasks/tasks.service.js#createDraft), когда остаток
  // появится на складе. Если ДОСТУПНОГО остатка нет вообще ни по одной
  // строке — проведение отклоняется целиком (нечего выдавать прямо сейчас).
  // Если сам этот документ — довыдача по ранее открытым задачам, связанные
  // задачи закрываются/уменьшаются здесь же (см. reconcileTaskFulfillments).
  async post(documentId, { userId }) {
    let shortages = [];
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const result = await applyIssuanceSideEffects(document, document.lines, {
        userId,
        transaction,
        tolerateShortage: true,
      });
      shortages = result.shortages;

      if (result.instanceIds.length === 0) {
        throw ApiError.badRequest(
          'На складе сейчас нет ни одной доступной позиции по этому документу — нечего выдавать',
        );
      }

      await issuanceRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });

      // Релиз Д: если этот документ — довыдача по задачам ("Оформить
      // довыдачу"), закрываем/уменьшаем связанные задачи по фактически
      // выданному количеству ДО generic-обработки shortages ниже — иначе
      // нехватка по такой строке породила бы одновременно и переоткрытую
      // исходную задачу (из reconcileTaskFulfillments), и новую orphan-
      // задачу на тот же дефицит (из generic-кода) — запрещённый ТЗ дубль.
      const draftTasks = await tasksRepository.findByDraftDocument(documentId, { transaction });
      const reconciledKeys = await reconcileTaskFulfillments({
        documentId,
        tasks: draftTasks,
        lines: document.lines,
        shortages,
        userId,
        transaction,
      });
      shortages = shortages.filter((shortage) => !reconciledKeys.has(issuanceTaskKey(shortage)));

      if (shortages.length > 0) {
        await tasksRepository.bulkCreate(
          shortages.map((shortage) => ({
            sourceDocumentId: documentId,
            employeeId: document.employeeId,
            warehouseId: document.warehouseId,
            modelId: shortage.modelId,
            sizeId: shortage.sizeId,
            heightSizeId: shortage.heightSizeId,
            quantity: shortage.missingQuantity,
            taskType: 'completion',
          })),
          { transaction },
        );
      }
    });

    return { document: await loadDocumentWithAvailability(documentId), shortages };
  },

  // Задача 22: контролируемое перепроведение уже проведённой Выдачи.
  // Экземпляры не удаляются (в отличие от receiving) — освобождаются на
  // склад ДО правки, затем свежий FIFO-подбор применяет новые строки к
  // новому работнику/дате/складу/составу с пересчётом цены. Устаревание
  // затронутых месячных актов помечается внутри той же транзакции — иначе
  // сбой на этом шаге оставил бы редакцию зафиксированной, а акт
  // непомеченным (частичное состояние).
  async revise(documentId, { header, lines, reason }, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'posted') {
        throw ApiError.conflict(
          'Редактировать через эту команду можно только проведённый документ',
        );
      }

      const instanceIds = await findTouchedInstanceIds(
        { documentType: 'issuance', documentId },
        { transaction },
      );
      if (instanceIds.length > 0) {
        await issuanceRepository.lockInstances(instanceIds, { transaction });
        await assertNoBlockingDocuments(
          { instanceIds, ownDocumentType: 'issuance', ownDocumentId: documentId },
          { transaction },
        );
      }

      const { lines: previousLines, ...headerSnapshot } = document;
      const previousData = { header: headerSnapshot, lines: previousLines };

      const replacementTasks = await tasksRepository.findReplacementBySourceDocument(documentId, {
        transaction,
      });
      if (replacementTasks.some((task) => ['in_progress', 'completed'].includes(task.status))) {
        throw ApiError.conflict(
          'Документ уже связан с оформляемым или завершённым переодеванием и не может быть изменён',
        );
      }

      // Релиз Д: если этот документ когда-либо закрывал задачи на
      // доукомплектовку (issuance_task_fulfillments), редакция должна не
      // "сломать" их статус — реверсируем прежнее закрытие (возвращаем
      // quantity, задача снова open) и ниже, после применения новых строк,
      // заново прогоняем ту же реконсиляцию по свежим данным. tolerateShortage
      // в applyIssuanceSideEffects() ниже остаётся false (как и раньше для
      // revise) — значит либо весь пересчёт пройдёт полностью, либо упадёт
      // 400 ДО коммита, и реверс задач откатится вместе со всей транзакцией.
      const ownFulfillments = await tasksRepository.findFulfillmentsByDocument(documentId, {
        transaction,
      });
      let reconciledTasks = [];
      if (ownFulfillments.length > 0) {
        const addBackByTask = new Map();
        for (const fulfillment of ownFulfillments) {
          addBackByTask.set(
            fulfillment.taskId,
            (addBackByTask.get(fulfillment.taskId) ?? 0) + fulfillment.quantity,
          );
        }
        const tasksToReverse = await tasksRepository.findManyLocked([...addBackByTask.keys()], {
          transaction,
        });
        for (const task of tasksToReverse) {
          const pendingDraftDocumentId =
            task.draftDocumentId && task.draftDocumentId !== documentId
              ? task.draftDocumentId
              : null;
          const restoredTask = {
            ...task.get({ plain: true }),
            quantity: task.quantity + addBackByTask.get(task.id),
            status: waitingTaskStatus(task, pendingDraftDocumentId),
            completedAt: null,
            completedByUserId: null,
            draftDocumentId: pendingDraftDocumentId,
          };
          await tasksRepository.updateProgress(task.id, restoredTask, { transaction });
          reconciledTasks.push(restoredTask);
        }
        await tasksRepository.deleteFulfillmentsByDocument(documentId, { transaction });
      }

      await issuanceRepository.deleteOwnInstanceEvents(documentId, { transaction });
      await issuanceRepository.deleteOwnMovements(documentId, { transaction });
      if (instanceIds.length > 0) {
        // Освобождаем на СТАРЫЙ склад (document.warehouseId) — физически
        // вещи всё ещё там, даже если склад в редакции меняется.
        await issuanceRepository.releaseInstances(instanceIds, document.warehouseId, {
          transaction,
        });
      }

      const normalizedLines = [];
      for (const line of lines) {
        const normalized = await normalizeLineSizes(line, null, { transaction });
        assertNoDuplicateAmongNewLines(normalizedLines, normalized);
        normalizedLines.push(normalized);
      }

      await issuanceRepository.deleteAllLines(documentId, { transaction });
      const createdLines = (
        await issuanceRepository.bulkCreateLines(documentId, normalizedLines, { transaction })
      ).map((line) => line.get({ plain: true }));

      await issuanceRepository.updateHeaderFields(documentId, header, { transaction });
      const updatedDocument = { ...document, ...header, id: documentId, number: document.number };

      await applyIssuanceSideEffects(updatedDocument, createdLines, { userId, transaction });

      if (reconciledTasks.length > 0) {
        await reconcileTaskFulfillments({
          documentId,
          tasks: reconciledTasks,
          lines: createdLines,
          shortages: [],
          userId,
          transaction,
        });
      }

      const nextRevision = document.revisionNumber + 1;
      await issuanceRepository.markRevised(
        documentId,
        { revisionNumber: nextRevision, revisedByUserId: userId },
        { transaction },
      );

      await documentRevisionsRepository.create(
        {
          documentType: 'issuance',
          documentId,
          revisionNumber: nextRevision,
          previousData,
          newData: { header, lines: createdLines },
          reason: reason || null,
          revisedByUserId: userId,
          revisedAt: new Date(),
        },
        { transaction },
      );

      // Раздел "Связь с актами" задачи 22: только помечает stale, не
      // пересчитывает (пересчёт — задача 24).
      await flagStaleForIssuanceRevision(
        {
          before: { employeeId: document.employeeId, documentDate: document.documentDate },
          after: {
            employeeId: updatedDocument.employeeId,
            documentDate: updatedDocument.documentDate,
          },
        },
        { transaction },
      );
    });

    return loadDocumentWithAvailability(documentId);
  },
};

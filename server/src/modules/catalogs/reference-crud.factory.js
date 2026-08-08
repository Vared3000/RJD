import { Router } from 'express';
import { Op } from 'sequelize';
import { ApiError } from '../../utils/api-error.js';
import { success, paginatedSuccess } from '../../utils/respond.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { parsePagination } from '../../utils/pagination.js';

// Общий CRUD для справочников с мягким удалением через archivedAt.
// Используется для простых сущностей (Организации, Подразделения, Должности,
// Склады, Поставщики, Размеры и т.п.) — см. docs/architecture.md.

export function createReferenceRepository(
  Model,
  { include, searchFields, sortFields, filterFields = [] } = {},
) {
  return {
    list({
      includeArchived = false,
      search,
      page = 1,
      limit = 50,
      sort = 'createdAt',
      order = 'ASC',
      filters = {},
    } = {}) {
      const where = includeArchived ? {} : { archivedAt: null };
      for (const field of filterFields) {
        if (filters[field] !== undefined && filters[field] !== '') {
          where[field] = filters[field];
        }
      }
      if (search && searchFields?.length) {
        where[Op.or] = searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${search}%` },
        }));
      }

      const effectiveSort = sortFields?.includes(sort) ? sort : 'createdAt';
      const effectiveOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      const offset = (Number(page) - 1) * Number(limit);

      return Model.findAndCountAll({
        where,
        include,
        order: [[effectiveSort, effectiveOrder]],
        limit: Number(limit),
        offset,
      });
    },

    findById(id) {
      return Model.findByPk(id, { include });
    },

    findLocked(id, { transaction }) {
      return Model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    },

    create(data, { transaction } = {}) {
      return Model.create(data, { transaction });
    },

    async updateById(id, data, { transaction } = {}) {
      const [count] = await Model.update(data, {
        where: { id, archivedAt: null },
        transaction,
      });
      return count > 0 ? Model.findByPk(id, { transaction }) : null;
    },

    async archive(id) {
      const [count] = await Model.update(
        { archivedAt: new Date() },
        { where: { id, archivedAt: null } },
      );
      return count > 0;
    },

    async restore(id) {
      const [count] = await Model.update(
        { archivedAt: null },
        { where: { id, archivedAt: { [Op.ne]: null } } },
      );
      return count > 0;
    },
  };
}

export function createReferenceService(
  repository,
  { entityName, validateRelations, beforeCreate, mutationHooks } = {},
) {
  return {
    list(options) {
      return repository.list(options);
    },

    async getById(id) {
      const item = await repository.findById(id);
      if (!item) throw ApiError.notFound(`${entityName} не найден(а)`);
      return item;
    },

    async create(data, context = {}) {
      if (mutationHooks) {
        let createdId;
        await mutationHooks.sequelize.transaction(async (transaction) => {
          const validatedData = validateRelations
            ? ((await validateRelations(data, { transaction })) ?? data)
            : data;
          const finalData = beforeCreate
            ? await beforeCreate(validatedData, { transaction })
            : validatedData;
          const item = await repository.create(finalData, { transaction });
          createdId = item.id;
          await mutationHooks.afterCreate?.(item, { ...context, transaction });
        });
        return repository.findById(createdId);
      }
      const validatedData = validateRelations ? ((await validateRelations(data)) ?? data) : data;
      const finalData = beforeCreate ? await beforeCreate(validatedData) : validatedData;
      return repository.create(finalData);
    },

    async update(id, data, context = {}) {
      if (mutationHooks) {
        await mutationHooks.sequelize.transaction(async (transaction) => {
          const current = await repository.findLocked(id, { transaction });
          if (!current || current.archivedAt) {
            throw ApiError.notFound(`${entityName} не найден(а) или архивирован(а)`);
          }
          const validatedData = validateRelations
            ? ((await validateRelations(data, { id, current, transaction })) ?? data)
            : data;
          const item = await repository.updateById(id, validatedData, { transaction });
          await mutationHooks.afterUpdate?.(current, item, validatedData, {
            ...context,
            transaction,
          });
        });
        return repository.findById(id);
      }
      const current = validateRelations ? await repository.findById(id) : null;
      const validatedData = validateRelations
        ? ((await validateRelations(data, { id, current })) ?? data)
        : data;
      const item = await repository.updateById(id, validatedData);
      if (!item) throw ApiError.notFound(`${entityName} не найден(а) или архивирован(а)`);
      return item;
    },

    async archive(id) {
      const ok = await repository.archive(id);
      if (!ok) throw ApiError.notFound(`${entityName} не найден(а) или уже архивирован(а)`);
    },

    async restore(id) {
      const ok = await repository.restore(id);
      if (!ok) throw ApiError.notFound(`${entityName} не найден(а) или не архивирован(а)`);
    },
  };
}

export function createReferenceController(service, { filterFields = [] } = {}) {
  return {
    async list(req, res) {
      const pagination = parsePagination(req.query);
      const { rows, count } = await service.list({
        includeArchived: req.query.includeArchived === 'true',
        search: req.query.search,
        filters: Object.fromEntries(filterFields.map((field) => [field, req.query[field]])),
        ...pagination,
      });
      return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
    },
    async getOne(req, res) {
      const item = await service.getById(req.params.id);
      return success(res, item);
    },
    async create(req, res) {
      const item = await service.create(req.validatedBody, { userId: req.user.sub });
      return success(res, item, 201);
    },
    async replace(req, res) {
      const item = await service.update(req.params.id, req.validatedBody, {
        userId: req.user.sub,
      });
      return success(res, item);
    },
    async update(req, res) {
      const item = await service.update(req.params.id, req.validatedBody, {
        userId: req.user.sub,
      });
      return success(res, item);
    },
    async archive(req, res) {
      await service.archive(req.params.id);
      return success(res, { archived: true });
    },
    async restore(req, res) {
      await service.restore(req.params.id);
      return success(res, { restored: true });
    },
  };
}

function createReferenceRouter({
  controller,
  viewPermission,
  managePermission,
  createSchema,
  updateSchema,
}) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', requirePermission(viewPermission), asyncHandler(controller.list));
  router.get('/:id', requirePermission(viewPermission), asyncHandler(controller.getOne));
  router.post(
    '/',
    requirePermission(managePermission),
    validateBody(createSchema),
    asyncHandler(controller.create),
  );
  router.put(
    '/:id',
    requirePermission(managePermission),
    validateBody(createSchema),
    asyncHandler(controller.replace),
  );
  router.patch(
    '/:id',
    requirePermission(managePermission),
    validateBody(updateSchema),
    asyncHandler(controller.update),
  );
  router.delete('/:id', requirePermission(managePermission), asyncHandler(controller.archive));
  router.patch(
    '/:id/restore',
    requirePermission(managePermission),
    asyncHandler(controller.restore),
  );

  return router;
}

// entityName — для сообщений об ошибках (русский, с учётом рода: "не найден(а)").
// validateRelations(data) — необязательная async-проверка внешних ссылок (например,
// что organizationId существует и не архивирован) перед create/update.
// beforeCreate(data) — необязательное async-преобразование данных перед созданием
// (например, автогенерация инвентарного номера, если он не передан).
// sortFields — массив полей, по которым разрешена сортировка.
// filterFields — разрешённые точные фильтры из query-параметров списка.
export function createReferenceModule(
  Model,
  {
    entityName,
    viewPermission,
    managePermission,
    createSchema,
    updateSchema,
    validateRelations,
    beforeCreate,
    include,
    searchFields,
    filterFields = [],
    sortFields = ['createdAt', 'name'],
    mutationHooks,
  },
) {
  const repository = createReferenceRepository(Model, {
    include,
    searchFields,
    sortFields,
    filterFields,
  });
  const service = createReferenceService(repository, {
    entityName,
    validateRelations,
    beforeCreate,
    mutationHooks,
  });
  const controller = createReferenceController(service, { filterFields });
  const router = createReferenceRouter({
    controller,
    viewPermission,
    managePermission,
    createSchema,
    updateSchema,
  });
  return { repository, service, controller, router };
}

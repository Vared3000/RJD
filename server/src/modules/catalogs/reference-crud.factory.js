import { Router } from 'express';
import { Op } from 'sequelize';
import { ApiError } from '../../utils/api-error.js';
import { success } from '../../utils/respond.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';

// Общий CRUD для справочников с мягким удалением через archivedAt.
// Используется для простых сущностей (Организации, Подразделения, Должности,
// Склады, Поставщики, Размеры и т.п.) — см. docs/architecture.md.

export function createReferenceRepository(Model, { include } = {}) {
  return {
    list({ includeArchived = false } = {}) {
      return Model.findAll({
        where: includeArchived ? {} : { archivedAt: null },
        include,
        order: [['createdAt', 'ASC']],
      });
    },

    findById(id) {
      return Model.findByPk(id, { include });
    },

    create(data) {
      return Model.create(data);
    },

    async updateById(id, data) {
      const [count] = await Model.update(data, { where: { id, archivedAt: null } });
      return count > 0 ? Model.findByPk(id, { include }) : null;
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
  { entityName, validateRelations, beforeCreate } = {},
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

    async create(data) {
      const validatedData = validateRelations ? ((await validateRelations(data)) ?? data) : data;
      const finalData = beforeCreate ? await beforeCreate(validatedData) : validatedData;
      return repository.create(finalData);
    },

    async update(id, data) {
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

export function createReferenceController(service) {
  return {
    async list(req, res) {
      const items = await service.list({ includeArchived: req.query.includeArchived === 'true' });
      return success(res, items);
    },
    async getOne(req, res) {
      const item = await service.getById(req.params.id);
      return success(res, item);
    },
    async create(req, res) {
      const item = await service.create(req.validatedBody);
      return success(res, item, 201);
    },
    async replace(req, res) {
      const item = await service.update(req.params.id, req.validatedBody);
      return success(res, item);
    },
    async update(req, res) {
      const item = await service.update(req.params.id, req.validatedBody);
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
  },
) {
  const repository = createReferenceRepository(Model, { include });
  const service = createReferenceService(repository, {
    entityName,
    validateRelations,
    beforeCreate,
  });
  const controller = createReferenceController(service);
  const router = createReferenceRouter({
    controller,
    viewPermission,
    managePermission,
    createSchema,
    updateSchema,
  });
  return { repository, service, controller, router };
}

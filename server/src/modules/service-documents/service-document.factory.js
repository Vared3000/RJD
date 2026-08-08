import { Router } from 'express';
import { sequelize, models } from '../../database/models/index.js';
import { ApiError } from '../../utils/api-error.js';
import { success } from '../../utils/respond.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { buildServiceDocumentSchemas } from './service-document.validation.js';
import { serviceDocumentOpenApiPaths } from './service-document-openapi.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../nomenclature/instances/instance-events.repository.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.conflict('Документ уже отправлен и недоступен для изменения');
  }
}

function assertNoDuplicateLine(lines, instanceId, excludeLineId) {
  const duplicate = lines.some(
    (line) => line.id !== excludeLineId && line.instanceId === instanceId,
  );
  if (duplicate) {
    throw ApiError.badRequest('В документе уже есть строка с этим экземпляром');
  }
}

// Общая реализация двухфазных документов Стирка/Ремонт (раздел 11/18/19 ТЗ,
// Этап 9) — draft -> sent -> completed. В отличие от Поступления/Выдачи/
// Возврата (draft/posted, см. docs/architecture.md), тут два необратимых
// перехода: send снимает экземпляры с остатков (in_stock -> targetStatus,
// движение склада), complete возвращает их в in_stock с зафиксированным
// итоговым состоянием (и доп. полями вроде стоимости ремонта). Laundry и
// Repair — структурно один и тот же документ с разными моделями/статусом/
// номером, поэтому вынесены в фабрику (см. reference-crud.factory.js —
// тот же принцип для справочников), а не продублированы: в отличие от
// receiving/issuance/returns (у каждого своя бизнес-логика проведения),
// здесь бизнес-правило дословно одинаковое.
export function createServiceDocumentModule({
  DocumentModel,
  LineModel,
  entityName,
  targetStatus,
  documentType,
  numberPrefix,
  numberSequence,
  permission,
  basePath,
  tag,
  sendNoteVerb,
  completeNoteVerb,
  lineExtraCompleteFields = [],
}) {
  const { createDocumentSchema, updateDocumentSchema, createLineSchema, completeSchema } =
    buildServiceDocumentSchemas({ lineExtraCompleteFields });

  const listInclude = [{ model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] }];
  const detailInclude = [
    ...listInclude,
    { model: models.User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
    { model: models.User, as: 'sentByUser', attributes: ['id', 'fullName'] },
    { model: models.User, as: 'completedByUser', attributes: ['id', 'fullName'] },
    {
      model: LineModel,
      as: 'lines',
      include: [
        {
          model: models.Instance,
          as: 'instance',
          attributes: ['id', 'inventoryNumber', 'status', 'condition'],
          include: [
            { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
            { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
            { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
          ],
        },
      ],
    },
  ];

  const repository = {
    list({ warehouseId } = {}) {
      return DocumentModel.findAll({
        where: warehouseId ? { warehouseId } : {},
        include: listInclude,
        order: [['createdAt', 'DESC']],
      });
    },

    findById(id) {
      return DocumentModel.findByPk(id, {
        include: detailInclude,
        order: [[{ model: LineModel, as: 'lines' }, 'sortOrder', 'ASC']],
      });
    },

    // См. приём в receiving.repository.js: FOR UPDATE только на шапку.
    async findForTransition(id, { transaction }) {
      const document = await DocumentModel.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!document) return null;
      const lines = await LineModel.findAll({ where: { documentId: id }, transaction, raw: true });
      return { ...document.get({ plain: true }), lines };
    },

    createDocument(data) {
      return DocumentModel.create(data);
    },

    async updateDocument(id, data, { transaction }) {
      const [count] = await DocumentModel.update(data, {
        where: { id, status: 'draft' },
        transaction,
      });
      return count > 0;
    },

    async deleteDraft(id, { transaction }) {
      const count = await DocumentModel.destroy({
        where: { id, status: 'draft' },
        transaction,
      });
      return count > 0;
    },

    createLine(documentId, data, { transaction }) {
      return LineModel.create({ ...data, documentId }, { transaction });
    },

    findLine(documentId, lineId, { transaction }) {
      return LineModel.findOne({ where: { id: lineId, documentId }, transaction });
    },

    deleteLine(lineId, { transaction }) {
      return LineModel.destroy({ where: { id: lineId }, transaction });
    },

    updateLine(lineId, data, { transaction }) {
      return LineModel.update(data, { where: { id: lineId }, transaction });
    },

    findInstanceForTransition(instanceId, { transaction }) {
      return models.Instance.findByPk(instanceId, { transaction, lock: transaction.LOCK.UPDATE });
    },

    updateInstance(instanceId, data, { transaction }) {
      return models.Instance.update(data, { where: { id: instanceId }, transaction });
    },

    bulkCreateMovements(rows, { transaction }) {
      return models.StockMovement.bulkCreate(rows, { transaction });
    },

    markSent(id, { userId }, { transaction }) {
      return DocumentModel.update(
        { status: 'sent', sentAt: new Date(), sentByUserId: userId },
        { where: { id }, transaction },
      );
    },

    markCompleted(id, { userId }, { transaction }) {
      return DocumentModel.update(
        { status: 'completed', completedAt: new Date(), completedByUserId: userId },
        { where: { id }, transaction },
      );
    },
  };

  async function generateDocumentNumber() {
    const [[row]] = await sequelize.query(`SELECT nextval('${numberSequence}') AS value`);
    return `${numberPrefix}-${String(row.value).padStart(6, '0')}`;
  }

  const service = {
    list(options) {
      return repository.list(options);
    },

    async getById(id) {
      const document = await repository.findById(id);
      if (!document) throw ApiError.notFound('Документ не найден');
      return document;
    },

    async create(data, { userId }) {
      const number = await generateDocumentNumber();
      const document = await repository.createDocument({
        ...data,
        number,
        responsibleUserId: userId,
        status: 'draft',
      });
      return repository.findById(document.id);
    },

    async update(id, data) {
      await sequelize.transaction(async (transaction) => {
        const document = await repository.findForTransition(id, { transaction });
        assertDraft(document);
        await repository.updateDocument(id, data, { transaction });
      });
      return repository.findById(id);
    },

    async remove(id) {
      await sequelize.transaction(async (transaction) => {
        const document = await repository.findForTransition(id, { transaction });
        assertDraft(document);
        await repository.deleteDraft(id, { transaction });
      });
    },

    async addLine(documentId, data) {
      await sequelize.transaction(async (transaction) => {
        const document = await repository.findForTransition(documentId, { transaction });
        assertDraft(document);
        assertNoDuplicateLine(document.lines, data.instanceId);
        await repository.createLine(documentId, data, { transaction });
      });
      return repository.findById(documentId);
    },

    async removeLine(documentId, lineId) {
      await sequelize.transaction(async (transaction) => {
        const document = await repository.findForTransition(documentId, { transaction });
        assertDraft(document);
        const line = await repository.findLine(documentId, lineId, { transaction });
        if (!line) throw ApiError.notFound('Позиция не найдена');
        await repository.deleteLine(lineId, { transaction });
      });
      return repository.findById(documentId);
    },

    // Отправка — необратимо: каждая строка должна ссылаться на экземпляр,
    // реально в наличии (in_stock) на складе документа именно сейчас (лочим
    // экземпляр, а не полагаемся на состояние строки на момент addLine).
    // Переводит экземпляры в targetStatus и создаёт движение склада. Хотя бы
    // одна недоступная позиция — вся транзакция откатывается.
    async send(documentId, { userId }) {
      await sequelize.transaction(async (transaction) => {
        const document = await repository.findForTransition(documentId, { transaction });
        if (!document) throw ApiError.notFound('Документ не найден');
        if (document.status !== 'draft') throw ApiError.conflict('Документ уже отправлен');
        if (!document.lines || document.lines.length === 0) {
          throw ApiError.badRequest('В документе нет позиций — нечего отправлять');
        }

        const movementRows = [];
        const eventRows = [];
        for (const line of document.lines) {
          const instance = await repository.findInstanceForTransition(line.instanceId, {
            transaction,
          });
          if (!instance) throw ApiError.notFound(`Экземпляр не найден (позиция ${line.id})`);
          if (
            instance.status !== 'in_stock' ||
            instance.warehouseId !== document.warehouseId ||
            instance.archivedAt
          ) {
            throw ApiError.badRequest(
              `Экземпляр ${instance.inventoryNumber} сейчас не в наличии на складе документа — ` +
                'проверьте позицию',
            );
          }

          await repository.updateLine(
            line.id,
            { conditionBefore: instance.condition },
            { transaction },
          );
          await repository.updateInstance(
            instance.id,
            { status: targetStatus, warehouseId: null },
            { transaction },
          );
          eventRows.push(
            buildInstanceEvent({
              instance,
              eventType: `${documentType}_sent`,
              to: { status: targetStatus, warehouseId: null },
              documentType,
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
            documentType,
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `${sendNoteVerb} ${document.number}`,
          });
        }

        await repository.bulkCreateMovements(movementRows, { transaction });
        await instanceEventsRepository.bulkCreate(eventRows, { transaction });
        await repository.markSent(documentId, { userId }, { transaction });
      });

      return repository.findById(documentId);
    },

    // Завершение — необратимо, одним вызовом сразу для всех позиций
    // документа (это длительный процесс с одной датой завершения, а не
    // построчное редактирование, см. HANDOFF.md). Возвращает экземпляры в
    // in_stock на склад документа с итоговым состоянием.
    async complete(documentId, { lines: completionLines }, { userId }) {
      await sequelize.transaction(async (transaction) => {
        const document = await repository.findForTransition(documentId, { transaction });
        if (!document) throw ApiError.notFound('Документ не найден');
        if (document.status !== 'sent') {
          throw ApiError.conflict('Документ должен быть в статусе "отправлен"');
        }
        if (completionLines.length !== document.lines.length) {
          throw ApiError.badRequest('Нужно указать итог по всем позициям документа');
        }

        const linesById = new Map(document.lines.map((line) => [line.id, line]));
        const movementRows = [];
        const eventRows = [];
        for (const completion of completionLines) {
          const line = linesById.get(completion.lineId);
          if (!line) {
            throw ApiError.badRequest(`Позиция ${completion.lineId} не найдена в документе`);
          }
          const instance = await repository.findInstanceForTransition(line.instanceId, {
            transaction,
          });
          if (!instance || instance.status !== targetStatus) {
            throw ApiError.badRequest(
              `Экземпляр по позиции ${line.id} сейчас не в статусе "${targetStatus}"`,
            );
          }

          const conditionAfter = completion.conditionAfter ?? instance.condition;
          const lineUpdate = { conditionAfter };
          if (lineExtraCompleteFields.includes('cost') && completion.cost !== undefined) {
            lineUpdate.cost = completion.cost;
          }
          await repository.updateLine(line.id, lineUpdate, { transaction });
          await repository.updateInstance(
            instance.id,
            { status: 'in_stock', condition: conditionAfter, warehouseId: document.warehouseId },
            { transaction },
          );
          eventRows.push(
            buildInstanceEvent({
              instance,
              eventType: `${documentType}_completed`,
              to: {
                status: 'in_stock',
                condition: conditionAfter,
                warehouseId: document.warehouseId,
              },
              documentType,
              documentId: document.id,
              occurredAt: new Date(),
              userId,
              details: { documentNumber: document.number, ...lineUpdate },
            }),
          );
          movementRows.push({
            instanceId: instance.id,
            fromWarehouseId: null,
            toWarehouseId: document.warehouseId,
            documentType,
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `${completeNoteVerb} ${document.number}`,
          });
        }

        await repository.bulkCreateMovements(movementRows, { transaction });
        await instanceEventsRepository.bulkCreate(eventRows, { transaction });
        await repository.markCompleted(documentId, { userId }, { transaction });
      });

      return repository.findById(documentId);
    },
  };

  const controller = {
    async list(req, res) {
      const items = await service.list({ warehouseId: req.query.warehouseId });
      return success(res, items);
    },
    async getOne(req, res) {
      const item = await service.getById(req.params.id);
      return success(res, item);
    },
    async create(req, res) {
      const item = await service.create(req.validatedBody, { userId: req.user.sub });
      return success(res, item, 201);
    },
    async update(req, res) {
      const item = await service.update(req.params.id, req.validatedBody);
      return success(res, item);
    },
    async remove(req, res) {
      await service.remove(req.params.id);
      return success(res, { deleted: true });
    },
    async addLine(req, res) {
      const item = await service.addLine(req.params.id, req.validatedBody);
      return success(res, item, 201);
    },
    async removeLine(req, res) {
      const item = await service.removeLine(req.params.id, req.params.lineId);
      return success(res, item);
    },
    async send(req, res) {
      const item = await service.send(req.params.id, { userId: req.user.sub });
      return success(res, item);
    },
    async complete(req, res) {
      const item = await service.complete(req.params.id, req.validatedBody, {
        userId: req.user.sub,
      });
      return success(res, item);
    },
  };

  function createRouter() {
    const router = Router();
    router.use(requireAuth, requirePermission(permission));

    router.get('/', asyncHandler(controller.list));
    router.post('/', validateBody(createDocumentSchema), asyncHandler(controller.create));
    router.get('/:id', asyncHandler(controller.getOne));
    router.patch('/:id', validateBody(updateDocumentSchema), asyncHandler(controller.update));
    router.delete('/:id', asyncHandler(controller.remove));
    router.post('/:id/lines', validateBody(createLineSchema), asyncHandler(controller.addLine));
    router.delete('/:id/lines/:lineId', asyncHandler(controller.removeLine));
    router.post('/:id/send', asyncHandler(controller.send));
    router.post('/:id/complete', validateBody(completeSchema), asyncHandler(controller.complete));

    return router;
  }

  extendSwaggerPaths(serviceDocumentOpenApiPaths({ basePath, tag, entityName }));

  return { repository, service, controller, createRouter };
}

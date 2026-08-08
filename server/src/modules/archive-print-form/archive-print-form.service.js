import { models } from '../../database/models/index.js';
import { archivePrintFormRepository } from './archive-print-form.repository.js';

export const archivePrintFormService = {
  // Построить ключ дедупликации для строки документа
  getDeduplicationKey(instanceId, documentType, documentId, lineNumber, dpoId, employeeId) {
    return { instanceId, documentType, documentId, lineNumber, dpoId, employeeId };
  },

  // Импортировать данные из живых документов в архив
  async importFromLiveDocuments({ from, to, dpoId, organizationId, subdivisionId } = {}) {
    const archiveRecords = [];

    // Выдачи
    const issuedInstances = await models.sequelize.query(
      `
      SELECT
        il.id as lineId,
        il.document_id,
        il.model_id,
        il.size_id,
        il.height_size_id,
        il.quantity,
        il.sort_order,
        i.id as instanceId,
        i.cost,
        i.employee_cost,
        ed.document_date,
        ed.employee_id,
        dpo_id
      FROM issuance_lines il
      JOIN issuance_documents ed ON il.document_id = ed.id
      JOIN instances i ON i.id = (
        SELECT instance_id FROM issuance_lines WHERE id = il.id
      )
      WHERE ed.status = 'posted'
        AND ed.document_date >= :from
        AND ed.document_date <= :to
        AND (:dpoId IS NULL OR ed.employee_id IN (
          SELECT id FROM employees WHERE dpo_id = :dpoId
        ))
        AND (:organizationId IS NULL OR ed.employee_id IN (
          SELECT e.id FROM employees e
          JOIN organizations o ON e.organization_id = o.id
          WHERE o.id = :organizationId
        ))
        AND (:subdivisionId IS NULL OR ed.employee_id IN (
          SELECT id FROM employees WHERE subdivision_id = :subdivisionId
        ))
    `,
      {
        replacements: { from, to, dpoId, organizationId, subdivisionId },
        type: models.sequelize.QueryTypes.SELECT,
      },
    );

    for (const row of issuedInstances) {
      archiveRecords.push({
        dpoId: row.dpo_id,
        employeeId: row.employee_id,
        documentType: 'issuance',
        documentId: row.document_id,
        instanceId: row.instanceId,
        lineNumber: row.sort_order,
        modelId: row.model_id,
        sizeId: row.size_id,
        heightSizeId: row.height_size_id,
        quantity: row.quantity,
        cost: row.cost,
        employeeCost: row.employee_cost,
        documentDate: row.document_date,
        sourceTable: 'archive',
      });
    }

    // Возвраты
    const returnedInstances = await models.sequelize.query(
      `
      SELECT
        rl.id as lineId,
        rl.document_id,
        il.model_id,
        il.size_id,
        il.height_size_id,
        il.quantity,
        il.sort_order,
        i.id as instanceId,
        i.cost,
        i.employee_cost,
        rd.document_date,
        rd.employee_id,
        dpo_id
      FROM return_lines rl
      JOIN issuance_lines il ON rl.instance_id = il.instance_id
      JOIN return_documents rd ON rl.document_id = rd.id
      JOIN instances i ON i.id = rl.instance_id
      WHERE rd.status = 'posted'
        AND rd.document_date >= :from
        AND rd.document_date <= :to
        AND (:dpoId IS NULL OR rd.employee_id IN (
          SELECT id FROM employees WHERE dpo_id = :dpoId
        ))
    `,
      {
        replacements: { from, to, dpoId, organizationId, subdivisionId },
        type: models.sequelize.QueryTypes.SELECT,
      },
    );

    for (const row of returnedInstances) {
      archiveRecords.push({
        dpoId: row.dpo_id,
        employeeId: row.employee_id,
        documentType: 'return',
        documentId: row.document_id,
        instanceId: row.instanceId,
        lineNumber: row.sort_order,
        modelId: row.model_id,
        sizeId: row.size_id,
        heightSizeId: row.height_size_id,
        quantity: row.quantity,
        cost: row.cost,
        employeeCost: row.employee_cost,
        documentDate: row.document_date,
        sourceTable: 'archive',
      });
    }

    // Списания
    const writeoffInstances = await models.sequelize.query(
      `
      SELECT
        wl.id as lineId,
        wl.document_id,
        wl.model_id,
        wl.size_id,
        wl.height_size_id,
        wl.quantity,
        wl.sort_order,
        i.id as instanceId,
        i.cost,
        i.employee_cost,
        wd.document_date,
        i.employee_id,
        e.dpo_id
      FROM writeoff_lines wl
      JOIN writeoff_documents wd ON wl.document_id = wd.id
      JOIN instances i ON i.id = wl.instance_id
      JOIN employees e ON e.id = i.employee_id
      WHERE wd.status = 'posted'
        AND wd.document_date >= :from
        AND wd.document_date <= :to
        AND (:dpoId IS NULL OR e.dpo_id = :dpoId)
    `,
      {
        replacements: { from, to, dpoId, organizationId, subdivisionId },
        type: models.sequelize.QueryTypes.SELECT,
      },
    );

    for (const row of writeoffInstances) {
      archiveRecords.push({
        dpoId: row.dpo_id,
        employeeId: row.employee_id,
        documentType: 'writeoff',
        documentId: row.document_id,
        instanceId: row.instanceId,
        lineNumber: row.sort_order,
        modelId: row.model_id,
        sizeId: row.size_id,
        heightSizeId: row.height_size_id,
        quantity: row.quantity,
        cost: row.cost,
        employeeCost: row.employee_cost,
        documentDate: row.document_date,
        sourceTable: 'archive',
      });
    }

    // Дедупликация перед импортом
    const existingKeys = await archivePrintFormRepository.findExistingKeys(
      archiveRecords.map((r) => ({
        dpoId: r.dpoId,
        employeeId: r.employeeId,
        documentType: r.documentType,
        documentId: r.documentId,
        lineNumber: r.lineNumber,
      })),
    );

    const existingKeySet = new Set(
      existingKeys.map(
        (k) => `${k.dpoId}-${k.employeeId}-${k.documentType}-${k.documentId}-${k.lineNumber}`,
      ),
    );

    const uniqueRecords = archiveRecords.filter(
      (r) =>
        !existingKeySet.has(
          `${r.dpoId}-${r.employeeId}-${r.documentType}-${r.documentId}-${r.lineNumber}`,
        ),
    );

    if (uniqueRecords.length > 0) {
      await archivePrintFormRepository.bulkCreate(uniqueRecords);
    }

    return uniqueRecords.length;
  },

  // Получить данные для печатной формы (объединение живых и архивных)
  async getPrintFormData({ dpoId, from, to } = {}) {
    // Приоритет живых данных, но если их нет - архив
    const liveData = await archivePrintFormRepository.listForPrintForm({ dpoId, from, to });
    return liveData;
  },
};

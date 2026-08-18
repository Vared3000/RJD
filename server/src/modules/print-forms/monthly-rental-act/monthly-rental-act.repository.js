import { QueryTypes } from 'sequelize';
import { models, sequelize } from '../../../database/models/index.js';

export const monthlyRentalRepository = {
  findDpo(id) {
    return models.Dpo.findByPk(id);
  },

  findOwnershipRows({ dpoId, monthStart, monthEnd }) {
    return sequelize.query(
      `SELECT event.id AS "eventId",
              event.document_id AS "issuanceDocumentId",
              document.number AS "issuanceNumber",
              event.occurred_at::date AS "issuedDate",
              departure.occurred_at::date AS "returnedDate",
              GREATEST(event.occurred_at::date, DATE :monthStart, assignment.valid_from) AS "intervalStart",
              LEAST(COALESCE(departure.occurred_at::date, DATE :monthEnd), DATE :monthEnd,
                    COALESCE(assignment.valid_to, DATE :monthEnd)) AS "intervalEnd",
              employee.id AS "employeeId", employee.full_name AS "employeeName",
              employee.personnel_number AS "personnelNumber", position.name AS "positionName",
              instance.id AS "instanceId", instance.inventory_number AS "inventoryNumber",
              model.id AS "modelId", model.name AS "modelName", model.unit AS "unit",
              size.value AS "sizeValue", height_size.value AS "heightValue",
              NULL::uuid AS "priceSourceId", NULL::date AS "priceEffectiveDate",
              model.rental_price AS "monthlyPriceWithoutVat",
              model.rental_vat_rate AS "vatRate"
       FROM instance_events event
       JOIN issuance_documents document
         ON document.id = event.document_id AND document.status = 'posted'
       JOIN instances instance ON instance.id = event.instance_id
       JOIN nomenclature_models model ON model.id = instance.model_id
       LEFT JOIN sizes size ON size.id = instance.size_id
       LEFT JOIN sizes height_size ON height_size.id = instance.height_size_id
       JOIN employees employee ON employee.id = event.to_employee_id
       LEFT JOIN positions position ON position.id = employee.position_id
       JOIN employee_dpo_assignments assignment
         ON assignment.employee_id = employee.id
        AND assignment.dpo_id = :dpoId
        AND assignment.valid_from <= DATE :monthEnd
        AND (assignment.valid_to IS NULL OR assignment.valid_to >= DATE :monthStart)
       LEFT JOIN LATERAL (
         SELECT next_event.occurred_at
         FROM instance_events next_event
         WHERE next_event.instance_id = event.instance_id
           AND next_event.from_employee_id = event.to_employee_id
           AND next_event.occurred_at >= event.occurred_at
           AND next_event.to_employee_id IS DISTINCT FROM event.to_employee_id
         ORDER BY next_event.occurred_at, next_event.created_at
         LIMIT 1
       ) departure ON TRUE
       WHERE event.event_type = 'issuance'
         AND event.document_type = 'issuance'
         AND event.to_employee_id IS NOT NULL
         AND event.occurred_at::date <= DATE :monthEnd
         AND (departure.occurred_at IS NULL OR departure.occurred_at::date >= DATE :monthStart)
         AND GREATEST(event.occurred_at::date, DATE :monthStart, assignment.valid_from)
             <= LEAST(COALESCE(departure.occurred_at::date, DATE :monthEnd), DATE :monthEnd,
                      COALESCE(assignment.valid_to, DATE :monthEnd))
       ORDER BY employee.full_name, event.occurred_at, model.name, instance.inventory_number`,
      {
        replacements: { dpoId, monthStart, monthEnd },
        type: QueryTypes.SELECT,
      },
    );
  },

  findArchiveRows({ dpoName, monthStart, monthEnd }) {
    return sequelize.query(
      `SELECT payload, source_key AS "sourceKey", source_file AS "sourceFile",
              sheet_name AS "sheetName", row_number AS "rowNumber"
       FROM source_import_records
       WHERE record_type = 'normalized_candidate'
         AND payload->>'type' = 'nomenclature'
         AND payload->>'dpo' = :dpoName
         AND payload->>'effectiveDate' BETWEEN :monthStart AND :monthEnd
         AND payload->'employee' IS NOT NULL
       ORDER BY source_file, sheet_name, row_number NULLS LAST, source_key`,
      { replacements: { dpoName, monthStart, monthEnd }, type: QueryTypes.SELECT },
    );
  },

  findAct(dpoId, reportMonth) {
    return models.MonthlyRentalAct.findOne({ where: { dpoId, reportMonth } });
  },

  findActById(id) {
    return models.MonthlyRentalAct.findByPk(id, {
      include: [{ model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] }],
    });
  },

  findActLocked(dpoId, reportMonth, { transaction }) {
    return models.MonthlyRentalAct.findOne({
      where: { dpoId, reportMonth },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  createAct(data, { transaction } = {}) {
    return models.MonthlyRentalAct.create(data, { transaction });
  },

  createVersion(data, { transaction } = {}) {
    return models.MonthlyRentalActVersion.create(data, { transaction });
  },

  findVersion(actId, versionNumber) {
    return models.MonthlyRentalActVersion.findOne({
      where: { actId, versionNumber },
      include: [
        { model: models.User, as: 'generatedByUser', attributes: ['id', 'fullName'] },
        {
          model: models.PrintFormTemplate,
          as: 'template',
          attributes: ['id', 'formType', 'versionNumber', 'originalFileName'],
        },
      ],
    });
  },

  listVersions(actId) {
    return models.MonthlyRentalActVersion.findAll({
      where: { actId },
      attributes: {
        exclude: ['snapshot', 'excelFileData', 'pdfFileData'],
      },
      include: [
        { model: models.User, as: 'generatedByUser', attributes: ['id', 'fullName'] },
        {
          model: models.PrintFormTemplate,
          as: 'template',
          attributes: ['id', 'formType', 'versionNumber', 'originalFileName'],
        },
      ],
      order: [['versionNumber', 'DESC']],
    });
  },

  updateVersionFile(id, format, { fileName, fileData, checksum }, { transaction } = {}) {
    const fields =
      format === 'pdf'
        ? { pdfFileName: fileName, pdfFileData: fileData, pdfChecksum: checksum }
        : { excelFileName: fileName, excelFileData: fileData, excelChecksum: checksum };
    return models.MonthlyRentalActVersion.update(fields, { where: { id }, transaction });
  },

  updateCurrentVersion(
    id,
    { snapshot, versionNumber, generatedAt, generatedByUserId },
    { transaction },
  ) {
    return models.MonthlyRentalAct.update(
      {
        snapshot,
        currentVersionNumber: versionNumber,
        generatedAt,
        generatedByUserId,
        isStale: false,
        staleReason: null,
        staleAt: null,
      },
      { where: { id }, transaction },
    );
  },

  // Задача 22: ДПО работника, действующие на конкретную дату — та же таблица,
  // что использует findOwnershipRows для построения самого акта (см. JOIN
  // выше), чтобы критерий "какой ДПО задет" был согласован с тем, как акт
  // реально строится.
  findAssignedDpoIds({ employeeId, onDate }, { transaction } = {}) {
    return sequelize.query(
      `SELECT dpo_id AS "dpoId"
       FROM employee_dpo_assignments
       WHERE employee_id = :employeeId
         AND valid_from <= :onDate
         AND (valid_to IS NULL OR valid_to >= :onDate)`,
      { replacements: { employeeId, onDate }, type: QueryTypes.SELECT, transaction },
    );
  },

  async markStale({ dpoId, reportMonth, reason }, { transaction } = {}) {
    const [count] = await models.MonthlyRentalAct.update(
      { isStale: true, staleReason: reason, staleAt: new Date() },
      { where: { dpoId, reportMonth }, transaction },
    );
    return count > 0;
  },
};

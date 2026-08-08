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
              price.id AS "priceSourceId", price.effective_date AS "priceEffectiveDate",
              price.price_without_vat AS "monthlyPriceWithoutVat",
              COALESCE(price.vat_rate,
                CASE WHEN price.price_with_vat IS NOT NULL AND price.price_without_vat > 0
                  THEN (price.price_with_vat / price.price_without_vat - 1) * 100 ELSE 5 END
              ) AS "vatRate"
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
       LEFT JOIN LATERAL (
         SELECT candidate.*
         FROM nomenclature_prices candidate
         WHERE candidate.model_id = instance.model_id
           AND (candidate.dpo_id = :dpoId OR candidate.dpo_id IS NULL)
           AND (candidate.effective_date IS NULL OR candidate.effective_date <= DATE :monthEnd)
         ORDER BY (candidate.dpo_id = :dpoId) DESC,
                  candidate.effective_date DESC NULLS LAST, candidate.created_at DESC
         LIMIT 1
       ) price ON TRUE
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

  createAct(data, { transaction } = {}) {
    return models.MonthlyRentalAct.create(data, { transaction });
  },
};

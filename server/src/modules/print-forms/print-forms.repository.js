import { Op, QueryTypes } from 'sequelize';
import { models, sequelize } from '../../database/models/index.js';
import { toDateOnly } from '../reports/period.js';

export const printFormsRepository = {
  findDpo(id) {
    return models.Dpo.findByPk(id);
  },

  findEmployee(id) {
    return models.Employee.findByPk(id, {
      include: [
        { model: models.Dpo, as: 'dpo' },
        { model: models.Position, as: 'position', attributes: ['id', 'name'] },
        { model: models.Subdivision, as: 'subdivision', attributes: ['id', 'name'] },
        { model: models.Size, as: 'clothingSize', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'shoeSize', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'headwearSize', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'beltSize', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'glovesSize', attributes: ['id', 'type', 'value'] },
        {
          model: models.EmployeeMeasurement,
          as: 'measurements',
          attributes: ['sizeType', 'value'],
        },
      ],
    });
  },

  findDpoHistoryAfter(dpoId, date) {
    return models.DpoHistory.findAll({
      where: { dpoId, changedAt: { [Op.gt]: date } },
      order: [['changedAt', 'DESC']],
    });
  },

  findIssuanceDocuments({ dpoId, from, to }) {
    return models.IssuanceDocument.findAll({
      where: {
        status: 'posted',
        documentDate: { [Op.between]: [toDateOnly(from), toDateOnly(to)] },
      },
      include: [
        {
          model: models.Employee,
          as: 'employee',
          required: true,
          where: { dpoId },
          attributes: ['id', 'fullName', 'personnelNumber', 'positionId'],
          include: [{ model: models.Position, as: 'position', attributes: ['id', 'name'] }],
        },
        {
          model: models.IssuanceLine,
          as: 'lines',
          include: [
            {
              model: models.NomenclatureModel,
              as: 'model',
              attributes: ['id', 'name', 'unit'],
            },
            { model: models.Size, as: 'size', attributes: ['value'] },
            { model: models.Size, as: 'heightSize', attributes: ['value'] },
          ],
        },
      ],
      order: [
        ['documentDate', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
  },

  findIssuanceMovements(documentIds) {
    if (documentIds.length === 0) return [];
    return models.StockMovement.findAll({
      where: {
        documentType: 'issuance',
        documentId: { [Op.in]: documentIds },
      },
      include: [
        {
          model: models.Instance,
          as: 'instance',
          attributes: ['id', 'modelId', 'inventoryNumber', 'cost', 'employeeCost'],
          include: [
            {
              model: models.NomenclatureModel,
              as: 'model',
              attributes: ['id', 'name', 'unit'],
            },
          ],
        },
      ],
      order: [['occurredAt', 'ASC']],
    });
  },

  findEmployeeIssuanceDocuments(employeeId) {
    return models.IssuanceDocument.findAll({
      where: { employeeId, status: 'posted' },
      attributes: ['id', 'documentDate'],
      order: [
        ['documentDate', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
  },

  findEmployeeReturnDocuments(employeeId) {
    return models.ReturnDocument.findAll({
      where: { employeeId, status: 'posted' },
      attributes: ['id', 'documentDate'],
      include: [
        {
          model: models.ReturnLine,
          as: 'lines',
          attributes: ['id', 'instanceId', 'sortOrder'],
          include: [
            {
              model: models.Instance,
              as: 'instance',
              attributes: ['id', 'modelId', 'inventoryNumber'],
              include: [
                {
                  model: models.NomenclatureModel,
                  as: 'model',
                  attributes: ['id', 'name', 'unit'],
                },
              ],
            },
          ],
        },
      ],
      order: [
        ['documentDate', 'ASC'],
        ['createdAt', 'ASC'],
        [{ model: models.ReturnLine, as: 'lines' }, 'sortOrder', 'ASC'],
      ],
    });
  },

  findPositionKitItems(positionId) {
    if (!positionId) return [];
    return models.PositionKitItem.findAll({
      where: { positionId, archivedAt: null },
      attributes: ['id', 'modelId', 'quantity', 'serviceLifeYears', 'createdAt'],
      include: [
        {
          model: models.NomenclatureModel,
          as: 'model',
          attributes: ['id', 'name', 'unit'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });
  },

  findImportedPersonalCard({ employee }) {
    return sequelize.query(
      `SELECT normalized.payload,
              normalized.source_file AS "sourceFile",
              normalized.sheet_name AS "sheetName"
       FROM source_import_records normalized
       LEFT JOIN source_import_records source_row
         ON source_row.source_key = normalized.payload->>'sourceKey'
       WHERE normalized.record_type = 'normalized_candidate'
         AND normalized.payload->>'type' = 'nomenclature'
         AND normalized.payload->>'formType' = 'personal-card'
         AND (
           (:personnelNumber IS NOT NULL
             AND normalized.payload->'employee'->>'personnelNumber' = :personnelNumber)
           OR normalized.payload->'employee'->>'fullName' = :fullName
         )
         AND (
           :positionName IS NULL
           OR normalized.payload->>'position' = :positionName
         )
       ORDER BY normalized.source_file,
                normalized.sheet_name,
                COALESCE(normalized.row_number, source_row.row_number) NULLS LAST,
                normalized.source_key`,
      {
        replacements: {
          personnelNumber: employee.personnelNumber ?? null,
          fullName: employee.fullName,
          positionName: employee.position?.name ?? null,
        },
        type: QueryTypes.SELECT,
      },
    );
  },

  findPrices({ modelIds, dpoId }) {
    if (modelIds.length === 0) return [];
    return models.NomenclaturePrice.findAll({
      where: {
        modelId: { [Op.in]: modelIds },
        [Op.or]: [{ dpoId }, { dpoId: null }],
      },
      order: [
        ['effectiveDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  },

  findImportedNomenclature({ dpoName, from, to }) {
    return sequelize.query(
      `SELECT normalized.payload,
              normalized.source_file AS "sourceFile",
              normalized.sheet_name AS "sheetName"
       FROM source_import_records normalized
       LEFT JOIN source_import_records source_row
         ON source_row.source_key = normalized.payload->>'sourceKey'
       WHERE normalized.record_type = 'normalized_candidate'
         AND normalized.payload->>'type' = 'nomenclature'
         AND normalized.payload->>'dpo' = :dpoName
         AND normalized.payload->>'effectiveDate' BETWEEN :from AND :to
       ORDER BY normalized.source_file,
                normalized.sheet_name,
                COALESCE(normalized.row_number, source_row.row_number) NULLS LAST,
                normalized.source_key`,
      {
        replacements: {
          dpoName,
          from: toDateOnly(from),
          to: toDateOnly(to),
        },
        type: QueryTypes.SELECT,
      },
    );
  },
};

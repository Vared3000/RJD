import { Op, QueryTypes } from 'sequelize';
import { models, sequelize } from '../../database/models/index.js';
import { toDateOnly } from '../reports/period.js';

export const printFormsRepository = {
  findDpo(id) {
    return models.Dpo.findByPk(id);
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

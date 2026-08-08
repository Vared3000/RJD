import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('issuance_lines', 'price_source_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'nomenclature_prices', key: 'id' },
    onDelete: 'SET NULL',
  });
  await qi.addColumn('issuance_lines', 'price_effective_date', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
  await qi.addColumn('issuance_lines', 'price_without_vat_snapshot', {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true,
  });
  await qi.addColumn('issuance_lines', 'vat_rate_snapshot', {
    type: DataTypes.DECIMAL(7, 4),
    allowNull: true,
  });
  await qi.addColumn('issuance_lines', 'price_with_vat_snapshot', {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true,
  });
  await qi.addIndex('issuance_lines', ['price_source_id'], {
    name: 'idx_issuance_lines_price_source',
  });

  // Зафиксировать исторические значения и для уже проведённых выдач.
  await sequelize.query(`
    WITH snapshots AS (
      SELECT line.id AS line_id,
             selected.id,
             selected.effective_date,
             selected.price_without_vat,
             selected.vat_rate,
             selected.price_with_vat
      FROM issuance_lines AS line
      JOIN issuance_documents AS document ON document.id = line.document_id
      JOIN employees AS employee ON employee.id = document.employee_id
      LEFT JOIN LATERAL (
        SELECT price.*
        FROM nomenclature_prices AS price
        WHERE price.model_id = line.model_id
          AND (price.dpo_id = employee.dpo_id OR price.dpo_id IS NULL)
          AND (price.effective_date IS NULL OR price.effective_date <= document.document_date)
        ORDER BY (price.dpo_id = employee.dpo_id) DESC,
                 price.effective_date DESC NULLS LAST,
                 price.created_at DESC
        LIMIT 1
      ) AS selected ON TRUE
      WHERE document.status = 'posted'
    )
    UPDATE issuance_lines AS line
    SET price_source_id = snapshots.id,
        price_effective_date = snapshots.effective_date,
        price_without_vat_snapshot = snapshots.price_without_vat,
        vat_rate_snapshot = snapshots.vat_rate,
        price_with_vat_snapshot = snapshots.price_with_vat
    FROM snapshots
    WHERE snapshots.line_id = line.id
  `);
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeIndex('issuance_lines', 'idx_issuance_lines_price_source');
  await qi.removeColumn('issuance_lines', 'price_with_vat_snapshot');
  await qi.removeColumn('issuance_lines', 'vat_rate_snapshot');
  await qi.removeColumn('issuance_lines', 'price_without_vat_snapshot');
  await qi.removeColumn('issuance_lines', 'price_effective_date');
  await qi.removeColumn('issuance_lines', 'price_source_id');
}

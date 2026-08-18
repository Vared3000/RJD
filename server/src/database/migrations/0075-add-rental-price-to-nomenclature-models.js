import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('nomenclature_models', 'rental_price', {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
  });
  await qi.addColumn('nomenclature_models', 'rental_vat_rate', {
    type: DataTypes.DECIMAL(7, 4),
    allowNull: false,
    defaultValue: 5,
  });

  // Переносим последнюю известную арендную цену в карточку номенклатуры.
  // Историю цен сохраняем: она остаётся источником для старых документов.
  await sequelize.query(`
    WITH latest_price AS (
      SELECT DISTINCT ON (price.model_id)
             price.model_id,
             price.price_without_vat,
             price.price_with_vat,
             price.vat_rate
      FROM nomenclature_prices AS price
      ORDER BY price.model_id,
               price.effective_date DESC NULLS LAST,
               price.created_at DESC
    )
    UPDATE nomenclature_models AS model
    SET rental_price = selected.price_without_vat,
        rental_vat_rate = COALESCE(
          selected.vat_rate,
          CASE
            WHEN selected.price_with_vat IS NOT NULL AND selected.price_without_vat > 0
              THEN (selected.price_with_vat / selected.price_without_vat - 1) * 100
            ELSE 5
          END
        )
    FROM latest_price AS selected
    WHERE selected.model_id = model.id
  `);
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('nomenclature_models', 'rental_vat_rate');
  await qi.removeColumn('nomenclature_models', 'rental_price');
}

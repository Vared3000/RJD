export async function up({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('DROP INDEX IF EXISTS position_kit_items_position_id_model_id_unique', {
      transaction,
    });
    await sequelize.query(
      `ALTER TABLE position_kit_items
       ADD CONSTRAINT position_kit_items_season_check
       CHECK (season IS NULL OR season IN ('summer', 'winter'))`,
      { transaction },
    );
    await sequelize.query(
      `ALTER TABLE position_kit_items
       ADD CONSTRAINT position_kit_items_gender_check
       CHECK (gender IS NULL OR gender IN ('male', 'female'))`,
      { transaction },
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX position_kit_items_variant_unique
       ON position_kit_items (
         position_id,
         model_id,
         COALESCE(season, '__all__'),
         COALESCE(gender, '__unisex__')
       )`,
      { transaction },
    );
  });
}

export async function down({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('DROP INDEX IF EXISTS position_kit_items_variant_unique', {
      transaction,
    });
    await sequelize.query(
      'ALTER TABLE position_kit_items DROP CONSTRAINT IF EXISTS position_kit_items_gender_check',
      { transaction },
    );
    await sequelize.query(
      'ALTER TABLE position_kit_items DROP CONSTRAINT IF EXISTS position_kit_items_season_check',
      { transaction },
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX position_kit_items_position_id_model_id_unique
       ON position_kit_items (position_id, model_id)`,
      { transaction },
    );
  });
}

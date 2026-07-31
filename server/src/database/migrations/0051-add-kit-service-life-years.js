export async function up({ context: sequelize }) {
  await sequelize.query(
    'ALTER TABLE position_kit_items ADD COLUMN service_life_years INTEGER NULL',
  );
}

export async function down({ context: sequelize }) {
  await sequelize.query('ALTER TABLE position_kit_items DROP COLUMN service_life_years');
}

export async function up({ context: sequelize }) {
  await sequelize.query('ALTER TABLE position_kit_items ADD COLUMN season VARCHAR(16) NULL');
}

export async function down({ context: sequelize }) {
  await sequelize.query('ALTER TABLE position_kit_items DROP COLUMN season');
}

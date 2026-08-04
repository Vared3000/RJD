export async function up({ context: sequelize }) {
  await sequelize.query('ALTER TABLE employees ADD COLUMN gender VARCHAR(16) NULL');
}

export async function down({ context: sequelize }) {
  await sequelize.query('ALTER TABLE employees DROP COLUMN gender');
}
